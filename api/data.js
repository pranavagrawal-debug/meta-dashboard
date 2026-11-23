const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const RK = { I: 1, C: 2 };
let ready;
const init = () => ready || (ready = (async () => {
  await sql`create table if not exists kv (k text primary key, v jsonb)`;
  await sql`create table if not exists ledger (id text primary key, c text)`;
  await sql`create table if not exists copy (k text primary key, v jsonb)`;
  await sql`create table if not exists pii (id text primary key, n text, p text)`;
})().catch(e => { ready = null; throw e; }));

module.exports = async (req, res) => {
  if (!process.env.APP_PASSWORD || req.headers['x-pass'] !== process.env.APP_PASSWORD)
    return res.status(401).json({ error: 'auth' });
  try {
    await init();
    if (req.method === 'GET') {
      const kv = await sql`select k, v from kv`;
      const led = await sql`select id, c from ledger`;
      const cp = await sql`select k, v from copy`;
      const pi = await sql`select id, n, p from pii`;
      const o = {}, ledger = {}, copy = {}, pii = {};
      pi.forEach(x => (pii[x.id] = [x.n, x.p]));
      kv.forEach(x => (o[x.k] = x.v));
      led.forEach(x => (ledger[x.id] = x.c));
      cp.forEach(x => (copy[x.k] = x.v));
      return res.json({ ...(o.data || {}), ledger, copy, pii, updated: o.updated || 0 });
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.R) {
        const led = await sql`select id, c from ledger`;
        const L = {};
        led.forEach(x => (L[x.id] = x.c));
        const ids = [], cs = [];
        b.R.forEach(x => {
          const k = String(x[11]), c = x[12];
          if (RK[c] && RK[c] > (RK[L[k]] || 0) && !ids.includes(k)) { ids.push(k); cs.push(c); }
        });
        if (ids.length)
          await sql`insert into ledger (id, c) select * from unnest(${ids}::text[], ${cs}::text[]) on conflict (id) do update set c = excluded.c`;
        const pk = Object.keys(b.pii || {});
        if (pk.length)
          await sql`insert into pii (id, n, p) select * from unnest(${pk}::text[], ${pk.map(k => String(b.pii[k][0] || ''))}::text[], ${pk.map(k => String(b.pii[k][1] || ''))}::text[]) on conflict (id) do update set n = excluded.n, p = excluded.p`;
        await sql`insert into kv (k, v) values ('data', ${JSON.stringify({ C: b.C, S: b.S, A: b.A, R: b.R })}::jsonb) on conflict (k) do update set v = excluded.v`;
        await sql`insert into kv (k, v) values ('updated', ${JSON.stringify(Date.now())}::jsonb) on conflict (k) do update set v = excluded.v`;
      }
      if (b.copy)
        await sql`insert into copy (k, v) values (${b.copy.k}, ${JSON.stringify(b.copy.v)}::jsonb) on conflict (k) do update set v = excluded.v`;
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
};
