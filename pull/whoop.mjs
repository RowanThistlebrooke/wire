// Pulls your Whoop readings into the ledger every morning.
//
// This runs on your own Mac, not GitHub's, because the refresh token lives in
// a file on this machine and never leaves it. A Whoop refresh token is single
// use: every refresh returns a new one and kills the old, so only one copy of
// it can ever be the live one. The Whoop MCP server already owns that file and
// takes a lock beside it before every refresh. This puller shares both, which
// is exactly what that lock was written for, so the two can run on the same
// machine without spending each other's token.
//
// It signs in as you with the publishable key, exactly like the website does,
// so the same row level security applies. It only inserts. It needs no npm
// install.
//
//   node pull/whoop.mjs         pull and write
//   node pull/whoop.mjs --dry   show what it would add, write nothing
//
// A dry run still refreshes the token, because reading anything from Whoop
// needs one. It just never writes to the ledger.
//
// Settings come from ~/.wire/env, or from the environment if you run it by
// hand: WIRE_URL, WIRE_KEY, WIRE_EMAIL, WIRE_PASSWORD, WHOOP_CLIENT_ID,
// WHOOP_CLIENT_SECRET, and WHOOP_REFRESH_FILE if the token file has moved.
// Nothing secret is ever printed.
//
// Every reading goes in at the moment Whoop recorded it, so a night's sleep
// lands on the night it happened whatever timezone the ledger keeps. Nothing
// is carried forward and nothing is invented: a number Whoop has not scored
// is not written at all.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API_URL = 'https://api.prod.whoop.com/developer/v2';
const CONFIG = path.join(os.homedir(), '.wire', 'env');
const DAYS = 14;
const PAGE = 25;
const LOCK_STALE_MS = 30000;   // the same numbers the MCP server's lock uses,
const LOCK_WAIT_MS = 15000;    // so the two agree on when one has died
const DRY = process.argv.includes('--dry');

// ---- settings, and the one rule for printing: nothing secret, ever ----

const ENV = {};
let ENV_ERROR = null;
try {
  for (const line of fs.readFileSync(CONFIG, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) ENV[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
} catch (e) { ENV_ERROR = e.code || 'unreadable'; }

const SECRETS = new Set();
const keep = v => { if (typeof v === 'string' && v.length >= 8) SECRETS.add(v); return v; };
const hide = text => { let out = String(text); for (const s of SECRETS) out = out.split(s).join('[hidden]'); return out; };
const say = line => console.log(hide(line));

const setting = key => process.env[key] || ENV[key] || '';
function need(key) {
  const v = setting(key);
  if (v) return v;
  throw new Error(ENV_ERROR ? `${key} is not set, and ~/.wire/env could not be read (${ENV_ERROR})` : `${key} is not set`);
}

// Every request goes through here. An error names the host and what it said,
// never the address, and nothing waits more than a minute.
async function request(url, options = {}) {
  const host = new URL(url).host;
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? `${host} did not answer within a minute` : `could not reach ${host}`);
  }
}
async function call(url, options = {}) {
  const host = new URL(url).host;
  const r = await request(url, options);
  let j = null, unread = null;
  try { j = await r.json(); } catch (e) { unread = e; }
  if (!r.ok) throw new Error(`${host} said ${r.status} ${why(j)}`.trim());
  if (unread) throw new Error(`${host} sent an answer that could not be read`);
  return j;
}
function why(j) {
  if (!j || typeof j !== 'object') return '';
  const e = j.error;
  if (!e) return [j.error_code || j.code, j.msg || j.message, j.details].filter(x => x !== undefined && x !== null && x !== '').join(' ');
  if (typeof e === 'string') return e + (j.error_description ? `: ${j.error_description}` : '');
  return [e.code, e.message].filter(Boolean).join(' ');
}
const bearer = token => ({ authorization: `Bearer ${token}` });

// ---- the token, shared with the MCP server ----

const REFRESH_FILE = setting('WHOOP_REFRESH_FILE') || path.join(os.homedir(), 'Desktop', 'los', 'whoop', '.whoop_refresh');
const LOCK_FILE = REFRESH_FILE + '.lock';
const pause = ms => new Promise(r => setTimeout(r, ms));

// The same lock the MCP server takes, in the same place, so the two take it in
// turns. A lock older than LOCK_STALE_MS was left behind by a dead process.
async function withLock(fn) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try { fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' }); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > LOCK_STALE_MS) { fs.rmSync(LOCK_FILE, { force: true }); continue; }
      } catch {}
      if (Date.now() > deadline) throw new Error('another Whoop process has held the token lock too long');
      await pause(150);
    }
  }
  try { return await fn(); } finally { try { fs.rmSync(LOCK_FILE, { force: true }); } catch {} }
}

function readRefresh() {
  let t = '';
  try { t = fs.readFileSync(REFRESH_FILE, 'utf8').trim(); } catch {
    throw new Error(`no refresh token at ${REFRESH_FILE}. Run: node whoop.mjs login`);
  }
  if (!t) throw new Error(`the refresh token at ${REFRESH_FILE} is empty. Run: node whoop.mjs login`);
  return keep(t);
}

// Written to a new file and renamed over the old one, so a crash halfway
// through cannot leave half a token behind. The MCP server reads this path.
function saveRefresh(token) {
  const tmp = REFRESH_FILE + '.new';
  fs.writeFileSync(tmp, token + '\n', { mode: 0o600 });
  fs.renameSync(tmp, REFRESH_FILE);
}

// One attempt, and the new token is saved before anything else happens. The
// moment Whoop answers, the token we sent is dead: spend it without keeping
// its replacement and the chain is broken until you log in again. A token
// Whoop has already refused is never sent a second time.
async function accessToken() {
  return withLock(async () => {
    const body = await call(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: readRefresh(),
        scope: 'offline',
        client_id: need('WHOOP_CLIENT_ID'),
        client_secret: keep(need('WHOOP_CLIENT_SECRET'))
      })
    });
    if (!body.refresh_token) {
      throw new Error('Whoop returned no new refresh token, so the one it was given is spent and the chain is broken. Run: node whoop.mjs login');
    }
    saveRefresh(keep(body.refresh_token));
    if (!body.access_token) throw new Error('Whoop returned no access token');
    return keep(body.access_token);
  });
}

// ---- Whoop ----

async function every(token, route, start) {
  const out = [];
  let next;
  do {
    const url = new URL(`${API_URL}/${route}`);
    url.searchParams.set('start', start);
    url.searchParams.set('limit', PAGE);
    if (next) url.searchParams.set('nextToken', next);
    const page = await call(url, { headers: bearer(token) });
    out.push(...(page.records || []));
    next = page.next_token || undefined;
  } while (next);
  return out;
}

// What the ledger calls each Whoop number, and where to find it on a record.
// Each reader is handed the record's score, so every one of them reads the
// same shape.
const READINGS = {
  recovery: {
    route: 'recovery',
    at: r => r.created_at,
    id: r => r.cycle_id,
    rows: [
      ['whoop_recovery', '%', s => s.recovery_score],
      ['whoop_hrv', 'ms', s => s.hrv_rmssd_milli],
      ['whoop_rhr', 'bpm', s => s.resting_heart_rate]
    ]
  },
  sleep: {
    route: 'activity/sleep',
    at: r => r.end,
    id: r => r.id,
    skip: r => r.nap,                       // a nap is not the night
    rows: [
      ['whoop_sleep_perf', '%', s => s.sleep_performance_percentage],
      ['whoop_sleep_debt', 'minutes', s => {
        const ms = s.sleep_needed?.need_from_sleep_debt_milli;
        return ms == null ? null : Math.round(ms / 60000);
      }],
      ['whoop_asleep', 'minutes', s => {
        // Derived: the live score has no single time-asleep field. Sum
        // stage_summary.total_light_sleep_time_milli,
        // stage_summary.total_slow_wave_sleep_time_milli and
        // stage_summary.total_rem_sleep_time_milli, excluding awake/no-data time.
        const stages = [s.stage_summary?.total_light_sleep_time_milli,
          s.stage_summary?.total_slow_wave_sleep_time_milli,
          s.stage_summary?.total_rem_sleep_time_milli];
        if (stages.some(ms => ms == null)) return null;
        const ms = stages.reduce((sum, value) => sum + value, 0);
        return Math.round(ms / 60000);
      }]
    ]
  },
  cycle: {
    route: 'cycle',
    at: r => r.start,
    id: r => r.id,
    rows: [['whoop_strain', '', s => s.strain]]
  }
};

async function readingsFor(token, kind) {
  const spec = READINGS[kind];
  const start = new Date(Date.now() - DAYS * 864e5).toISOString();
  const rows = [];
  let empty = 0;
  for (const r of await every(token, spec.route, start)) {
    if (r.score_state !== 'SCORED' || !r.score) continue;   // still being worked out is not a reading
    if (spec.skip && spec.skip(r)) continue;
    for (const [metric, unit, read] of spec.rows) {
      const value = read(r.score);
      if (value == null) { empty++; continue; }             // a gap stays a gap
      rows.push({ occurred_at: spec.at(r), metric, value, unit, source: 'whoop', source_id: `${kind}:${spec.id(r)}` });
    }
  }
  return { rows, empty };
}

// ---- the ledger, over plain fetch ----

async function ledger() {
  const url = need('WIRE_URL').replace(/\/$/, '');
  const apikey = keep(need('WIRE_KEY'));
  const email = need('WIRE_EMAIL');
  const password = keep(need('WIRE_PASSWORD'));
  const session = await call(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  }).catch(e => { throw new Error('sign in failed: ' + e.message); });
  keep(session.refresh_token);
  const headers = { apikey, ...bearer(keep(session.access_token)), 'content-type': 'application/json' };

  return {
    // Which of these readings are already in, asked in chunks so one long
    // address cannot be refused. The database refuses the same reading twice
    // anyway; this keeps a repeat from failing the whole insert.
    async have(ids) {
      const seen = new Set();
      for (let i = 0; i < ids.length; i += 50) {
        const q = new URLSearchParams({ select: 'source_id,metric', source: 'eq.whoop' });
        q.set('source_id', `in.(${ids.slice(i, i + 50).map(s => `"${s}"`).join(',')})`);
        for (const r of await call(`${url}/rest/v1/events?${q}`, { headers })) seen.add(`${r.source_id}|${r.metric}`);
      }
      return seen;
    },
    async insert(rows) {
      const r = await request(`${url}/rest/v1/events`, {
        method: 'POST', headers: { ...headers, prefer: 'return=minimal' }, body: JSON.stringify(rows)
      });
      if (!r.ok) throw new Error(`insert refused (${r.status}) ${why(await r.json().catch(() => null))}`.trim());
    }
  };
}

// ---- run ----

// The ledger first. A wrong password should not cost you a refresh token.
let db;
try { db = await ledger(); }
catch (e) { say(`ledger: ${e.message}`); process.exit(1); }

let token;
try { token = await accessToken(); }
catch (e) { say(`whoop: ${e.message}`); process.exit(1); }

const failed = [];
let skipped = 0;
for (const kind of Object.keys(READINGS)) {
  try {
    const { rows, empty } = await readingsFor(token, kind);
    skipped += empty;
    const have = await db.have([...new Set(rows.map(r => r.source_id))]);
    const fresh = rows.filter(r => !have.has(`${r.source_id}|${r.metric}`));
    const note = `${rows.length - fresh.length} already there`;
    if (DRY) {
      for (const r of fresh) say(`  ${r.occurred_at.slice(0, 10)}  ${r.metric.padEnd(18)} ${r.value} ${r.unit}`);
      say(`${kind}: would add ${fresh.length}, ${note}`);
      continue;
    }
    if (fresh.length) await db.insert(fresh);
    say(`${kind}: added ${fresh.length}, ${note}`);
  } catch (e) {
    failed.push(kind);
    say(`${kind} FAILED: ${e.message}`);
  }
}

if (skipped) say(`${skipped} numbers Whoop has not scored were left out`);
if (failed.length) {
  say(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
