// health: four checks on this copy of the wire, each answered on its own.
//
//   code   is this copy's version the one on GitHub, or behind it
//   table  does the ledger have the columns the code reads, day_of and
//          day_metrics, in the shape sql/01_the_table.sql makes them; if not,
//          what is missing, and the SQL that puts it right
//   keys   which settings are not set, by name; a value is never printed
//   feed   is the ledger being fed: every door, how far behind its newest
//          row is, and whether that is the lag it promises or a dead cable
//
// The first three answer whether this copy is built correctly. feed answers
// whether anything is still coming in, which is a different question, and the
// one a page that has gone blank usually turns out to be.
//
// It reads and never writes. The table is asked through the same door the
// tools use, signed in as you with the publishable key: each column is
// filtered on a word no typed column accepts, so a missing column says it is
// missing, a typed one names its type, and a text one lets the word through.

import { readFileSync } from 'node:fs';
import { supabaseUrl, publishableKey, isPublishable } from './env.mjs';

const MAIN = 'https://raw.githubusercontent.com/RowanThistlebrooke/wire/main/package.json';
const SYNC = 'sync your fork on GitHub, Vercel redeploys';

// Read when asked, so a file that did not ship breaks this check and not the server.
const repoFile = name => { try { return readFileSync(new URL('../' + name, import.meta.url), 'utf8'); } catch { return null; } };

export function version() {
  try { return JSON.parse(repoFile('package.json')).version || null; } catch { return null; }
}

const semver = v => (/^\d+\.\d+\.\d+$/.test(v || '') ? v.split('.').map(Number) : null);

export async function code() {
  const here = version();
  let main = null;
  try {
    const res = await fetch(MAIN, { signal: AbortSignal.timeout(5000) });
    if (res.ok) main = (await res.json()).version || null;
  } catch {}
  const a = semver(here), b = semver(main);
  if (!a) return { ok: null, version: here, main, say: 'package.json did not ship with this server, so its version is unknown' };
  if (!b) return { ok: null, version: here, main, say: 'could not read the version on GitHub; try again later' };
  const behind = a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];
  return behind ? { ok: false, version: here, main, say: SYNC } : { ok: true, version: here, main };
}

export function keys() {
  const missing = [], wrong = [];
  if (!supabaseUrl()) missing.push('WIRE_URL (or SUPABASE_URL)');
  if (!publishableKey()) missing.push('WIRE_KEY (or SUPABASE_PUBLISHABLE_KEY)');
  else if (!isPublishable(publishableKey())) wrong.push(`${process.env.WIRE_KEY ? 'WIRE_KEY' : 'SUPABASE_PUBLISHABLE_KEY'} is not the publishable key`);
  for (const k of ['WIRE_EMAIL', 'WIRE_PASSWORD']) if (!process.env[k]) missing.push(k);
  if (process.env.VERCEL && !process.env.WIRE_TOKEN) missing.push('WIRE_TOKEN');   // the web door; Claude Desktop does not need it
  return { ok: !missing.length && !wrong.length, missing, ...(wrong.length ? { wrong } : {}) };
}

// Which doors are still feeding the ledger. The doors, their promises and how
// far behind each one is are worked out in you-reader.js, beside the rest of
// the maths; this reads that answer and only says whether anything is wrong.
// A door with no promise cannot be late, so it is never the reason this fails.
// Which stocks no longer fit their baseline, and why they have no index. ok only when none has.
// A stock whose baseline has no spread yet is young, not broken, so it does not turn this red.
// The gate and its explanation live in you-reader.js; this only says the supplied noIndexWhy.
export function index(outgrown) {
  const all = outgrown || [];
  return { ok: !all.length, outgrown: all,
           ...(all.length ? { say: all.map(o => `${o.metric}: ${o.why}`).join('; ') } : {}) };
}

export function feed(doors) {
  const all = doors || [];
  const late = all.filter(d => d.state === 'drifting' || d.state === 'stale');
  const never = all.filter(d => d.promise != null && d.days == null);
  const ok = !late.length && !never.length;
  const say = [
    ...never.map(d => `${d.source} has never written`),
    ...late.map(d => `${d.source} last wrote ${d.days} days ago and promises ${d.promise}`)
  ].join('; ');
  return { ok, doors: all, ...(ok ? {} : { say }) };
}

// The columns the code reads and writes, with the type Postgres names for each.
const EVENTS = { occurred_at: 'timestamp with time zone', metric: 'text', value: 'numeric', unit: 'text',
                 source: 'text', source_id: 'text', event_type: 'text', context: 'json' };
const DAYS = { day: 'date', metric: 'text', mean: 'numeric', readings: 'bigint' };

async function probe(db, table, column) {
  const { error } = await db.from(table).select(column).eq(column, 'x').limit(0);
  if (!error) return 'text';
  if (error.code === 'PGRST205' || error.code === '42P01') return 'no table';
  if (error.code === '42703') return 'missing';
  const m = /invalid input syntax for type ([a-z ]+)/.exec(error.message || '');
  if (m) return m[1].trim();
  throw new Error(`${table}.${column}: ${error.message}`);
}

export async function table(db) {
  const sql = repoFile('sql/01_the_table.sql');
  let ev, dm, fn;
  try {
    [ev, dm, fn] = await Promise.all([
      Promise.all(Object.keys(EVENTS).map(c => probe(db, 'events', c))),
      Promise.all(Object.keys(DAYS).map(c => probe(db, 'day_metrics', c))),
      db.rpc('day_of', { ts: '2026-01-01T12:00:00Z' })
    ]);
  } catch (e) { return { ok: null, error: e.message }; }

  const missing = [], wrong = [], fix = { all: false, add: [], retype: [], dayOf: null, view: false };
  const fileType = c => ((sql || '').match(new RegExp(`^\\s+${c}\\s+([^\\s,]+)`, 'm')) || [])[1] || EVENTS[c];
  if (ev.includes('no table')) { missing.push('events'); fix.all = true; }
  else Object.keys(EVENTS).forEach((c, i) => {
    if (ev[i] === 'missing') { missing.push('events.' + c); fix.add.push(c); }
    else if (ev[i] !== EVENTS[c]) { wrong.push(`events.${c} is ${ev[i]}, not ${fileType(c)}`); fix.retype.push(c); }
  });
  if (fn.error && fn.error.code === 'PGRST202') { missing.push('day_of'); fix.dayOf = 'missing'; }
  else if (fn.error) wrong.push('day_of: ' + fn.error.message);
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(fn.data)) { wrong.push('day_of does not return a date'); fix.dayOf = 'wrong'; }
  if (dm.includes('no table')) { missing.push('day_metrics'); fix.view = true; }
  else Object.keys(DAYS).forEach((c, i) => {
    if (dm[i] === 'missing') { wrong.push(`day_metrics has no ${c}`); fix.view = true; }
    else if (dm[i] !== DAYS[c]) { wrong.push(`day_metrics.${c} is ${dm[i]}, not ${DAYS[c]}`); fix.view = true; }
  });

  const ok = !missing.length && !wrong.length;
  if (ok) return { ok, missing, wrong };
  if (!(fix.all || fix.add.length || fix.retype.length || fix.dayOf || fix.view)) return { ok, missing, wrong };
  if (!sql) return { ok, missing, wrong, say: 'the SQL is sql/01_the_table.sql in the repo; it did not ship with this server' };
  return { ok, missing, wrong, sql: fixSql(sql, fix),
           ...(fix.all || fix.dayOf ? { timezone: 'day_of in this SQL ends your day at 6am in Europe/Zurich; if you live elsewhere, put your timezone name, like America/New_York, in its place before you run it' } : {}) };
}

// The fix, cut from sql/01_the_table.sql so the SQL lives in one place. A view
// holds no rows, so it is dropped and made again whenever anything under it
// changes; no statement here touches a row.
export function fixSql(sql, fix) {
  if (fix.all) return sql.trim();
  const grab = re => (sql.match(re) || [''])[0];
  const def = Object.fromEntries(grab(/create table public\.events \(\n[\s\S]*?\n\);/).split('\n').slice(1, -1)
    .map(l => l.trim().replace(/,$/, '')).map(l => [l.split(/\s+/)[0], l]));
  const out = ['drop view if exists public.day_metrics;'];
  if (fix.dayOf === 'wrong') out.push('drop index if exists public.events_day_window;', 'drop function if exists public.day_of(timestamptz);');
  for (const c of fix.add) out.push(`alter table public.events add column ${def[c]};`);
  for (const c of fix.retype) {
    const type = def[c].split(/\s+/)[1], dflt = (def[c].match(/ default (.+)$/) || [])[1];
    out.push(`alter table public.events alter column ${c} drop default, alter column ${c} type ${type} using ${c}::${type};` +
             (dflt ? `\nalter table public.events alter column ${c} set default ${dflt};` : ''));
  }
  if (fix.dayOf) out.push(grab(/create or replace function public\.day_of[\s\S]*?\n\$\$;/));
  if (fix.dayOf || fix.add.length || fix.retype.length)
    out.push(grab(/create index events_day_window[\s\S]*?;/).replace('create index ', 'create index if not exists '));
  out.push(grab(/create or replace view public\.day_metrics[\s\S]*?;/));
  return out.join('\n\n');
}
