const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const RK = { I: 1, C: 2 };
let ready;
const init = () => ready || (ready = (async () => {
  await sql`create table if not exists kv (k text primary key, v jsonb)`;
  await sql`create table if not exists ledger (id text primary key, c text)`;
  await sql`create table if not exists copy (k text primary key, v jsonb)`;
  await sql`create table if not exists revenue (id text primary key, amt numeric)`;
  await sql`alter table revenue add column if not exists src text`;
  await sql`create table if not exists visited (id text primary key, src text)`;
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
      const vi = await sql`select id, src from visited`;
      const vis = {};
      vi.forEach(x => (vis[x.id] = x.src));
      const rv = await sql`select id, amt from revenue`;
      const o = {}, ledger = {}, copy = {}, pii = {}, rev = {};
      rv.forEach(x => (rev[x.id] = Number(x.amt)));
      pi.forEach(x => (pii[x.id] = [x.n, x.p]));
      kv.forEach(x => (o[x.k] = x.v));
      led.forEach(x => (ledger[x.id] = x.c));
      cp.forEach(x => (copy[x.k] = x.v));
      return res.json({ ...(o.data || {}), ledger, copy, pii, rev, vis, spend: o.spend || null, rules: o.rules || null, changes: o.changes || [], updated: o.updated || 0 });
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
        const norm = s => String(s || '').toUpperCase().replace(/[_\s]+/g, ' ').trim();
        const vids = b.R.filter(x => x[12] === 'C' && norm(x[9]) === 'OPD VISITED').map(x => String(x[11]));
        if (vids.length)
          await sql`insert into visited (id, src) select i, 'auto' from unnest(${vids}::text[]) as t(i) on conflict (id) do nothing`;
        const pk = Object.keys(b.pii || {});
        if (pk.length)
          await sql`insert into pii (id, n, p) select * from unnest(${pk}::text[], ${pk.map(k => String(b.pii[k][0] || ''))}::text[], ${pk.map(k => String(b.pii[k][1] || ''))}::text[]) on conflict (id) do update set n = excluded.n, p = excluded.p`;
        await sql`insert into kv (k, v) values ('data', ${JSON.stringify({ C: b.C, S: b.S, A: b.A, R: b.R })}::jsonb) on conflict (k) do update set v = excluded.v`;
        await sql`insert into kv (k, v) values ('updated', ${JSON.stringify(Date.now())}::jsonb) on conflict (k) do update set v = excluded.v`;
      }
      if (b.spend)
        await sql`insert into kv (k, v) values ('spend', ${JSON.stringify(b.spend)}::jsonb) on conflict (k) do update set v = excluded.v`;
      if (b.rules)
        await sql`insert into kv (k, v) values ('rules', ${JSON.stringify(b.rules)}::jsonb) on conflict (k) do update set v = excluded.v`;
      if (b.changes)
        await sql`insert into kv (k, v) values ('changes', ${JSON.stringify(b.changes)}::jsonb) on conflict (k) do update set v = excluded.v`;
      if (b.rev) {
        if (Number(b.rev.amt) > 0)
          await sql`insert into revenue (id, amt, src) values (${String(b.rev.id)}, ${Number(b.rev.amt)}, 'manual') on conflict (id) do update set amt = excluded.amt, src = 'manual'`;
        else await sql`delete from revenue where id = ${String(b.rev.id)}`;
      }
      if (b.vis)
        await sql`insert into visited (id, src) values (${String(b.vis.id)}, ${b.vis.v === 'off' ? 'off' : 'manual'}) on conflict (id) do update set src = excluded.src`;
      if (b.revBulk) {
        const ids = Object.keys(b.revBulk).filter(k => Number(b.revBulk[k]) > 0);
        await sql`delete from revenue where src is distinct from 'manual'`;
        if (ids.length)
          await sql`insert into revenue (id, amt, src) select i, a, 'file' from unnest(${ids}::text[], ${ids.map(k => Number(b.revBulk[k]))}::numeric[]) as t(i, a) on conflict (id) do nothing`;
      }
      if (b.copy)
        await sql`insert into copy (k, v) values (${b.copy.k}, ${JSON.stringify(b.copy.v)}::jsonb) on conflict (k) do update set v = excluded.v`;
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
};
