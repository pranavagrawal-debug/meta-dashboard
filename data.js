const { Redis } = require('@upstash/redis');
const r = Redis.fromEnv();
const RK = { I: 1, C: 2 };
module.exports = async (req, res) => {
  if (!process.env.APP_PASSWORD || req.headers['x-pass'] !== process.env.APP_PASSWORD)
    return res.status(401).json({ error: 'auth' });
  try {
    if (req.method === 'GET') {
      const [d, ledger, copy, updated] = await Promise.all([r.get('data'), r.hgetall('ledger'), r.hgetall('copy'), r.get('updated')]);
      return res.json({ ...(d || {}), ledger: ledger || {}, copy: copy || {}, updated: updated || 0 });
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.R) {
        const L = (await r.hgetall('ledger')) || {}, add = {};
        b.R.forEach(x => { const k = String(x[11]), c = x[12]; if (RK[c] && RK[c] > (RK[L[k]] || 0)) add[k] = c; });
        if (Object.keys(add).length) await r.hset('ledger', add);
        await r.set('data', { C: b.C, S: b.S, A: b.A, R: b.R });
        await r.set('updated', Date.now());
      }
      if (b.copy) await r.hset('copy', { [b.copy.k]: b.copy.v });
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
};
