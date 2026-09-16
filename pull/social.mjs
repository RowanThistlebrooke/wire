// Pulls YouTube, Instagram and TikTok into the ledger.
//
// This runs on your own Mac, not GitHub's, because the keys live in files
// on this machine and never leave it:
//   the platform keys   ~/Documents/channel-analytics/.env.local
//   the YouTube token   ~/.life/tokens.json
// Nothing from either file is ever printed. It signs in as you with the
// publishable key, exactly like the website does, so the same row level
// security applies. It only inserts. It needs no npm install.
//
//   node pull/social.mjs         pull and write
//   node pull/social.mjs --dry   show what it would add, change nothing
//
// WIRE_URL, WIRE_KEY, WIRE_EMAIL and WIRE_PASSWORD come from the
// environment, like pull/github.mjs, or from .env.local if you add them.
//
// Two kinds of number, and they are handled differently.
//
//   A day's number. YouTube and Instagram report each past day, and their
//   day is a Pacific calendar day. Every run asks for the last 14 days and
//   keeps only the days old enough to be finished, because a day still
//   being counted comes back as a zero or too low, and a row can never be
//   corrected. YouTube keeps trimming a day for about five days, so it waits
//   six. Instagram can take 48 hours, so it waits three.
//
//   A number right now. Follower counts and TikTok totals have no history.
//   Each is written once, on the ledger's today, when it is read, and never
//   back onto an earlier day.
//
// Each platform runs on its own. If one fails the others still run, and it
// says which one failed and why.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ANALYTICS = path.join(os.homedir(), 'Documents', 'channel-analytics');
const ENV_FILE = path.join(ANALYTICS, '.env.local');
const TOKENS_FILE = path.join(os.homedir(), '.life', 'tokens.json');
const CLOUD_MARKER = path.join(ANALYTICS, '.life-social-cloud-managed');
const GRAPH = 'https://graph.facebook.com/v26.0';
const DAYS = 14;
const SETTLE = { youtube: 6, instagram: 3 };
const DRY = process.argv.includes('--dry');

// Channel totals from the Analytics API. Not per-video numbers, so they do
// not share a name with anything imported from a Studio CSV.
const YT_METRICS = [
  ['yt_channel_views', 'views'],
  ['yt_watch_minutes', 'minutes'],
  ['yt_subscribers_gained', 'subscribers'],
  // A rate, not a total: it has a level to vary around, so it keeps an index
  // where a total that grows does not. It is the one stock here a Studio
  // export also carries, so the write loop leaves alone any day another door
  // already filled.
  ['yt_pct_viewed', 'percent']
];

// Each TikTok account is its own app, with its own key and secret.
const TIKTOK_ACCOUNTS = [
  { name: 'wisetwinz', access: 'TIKTOK_WISETWINZ_ACCESS_TOKEN', refresh: 'TIKTOK_WISETWINZ_REFRESH_TOKEN',
    key: 'TIKTOK_CLIENT_KEY', secret: 'TIKTOK_CLIENT_SECRET' },
  { name: 'clips', access: 'TIKTOK_CLIPS_ACCESS_TOKEN', refresh: 'TIKTOK_CLIPS_REFRESH_TOKEN',
    key: 'TIKTOK_CLIPS_CLIENT_KEY', secret: 'TIKTOK_CLIPS_CLIENT_SECRET' }
];

// ---- keys, and the one rule for printing: nothing secret, ever ----

const ENV = {};
let ENV_ERROR = null;
try {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) ENV[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
} catch (e) { ENV_ERROR = e.code || 'unreadable'; }

const SECRETS = new Set();
const keep = v => { if (typeof v === 'string' && v.length >= 8) SECRETS.add(v); return v; };
for (const [k, v] of Object.entries(ENV)) if (/TOKEN|SECRET|KEY|PASSWORD|CLIENT_ID/.test(k)) keep(v);
for (const k of ['WIRE_KEY', 'WIRE_PASSWORD']) keep(process.env[k]);

function hide(text) {
  let out = String(text);
  for (const s of SECRETS) out = out.split(s).join('[hidden]');
  return out;
}
const say = line => console.log(hide(line));

function need(key) {
  if (ENV_ERROR) throw new Error(`.env.local could not be read (${ENV_ERROR})`);
  const v = ENV[key];
  if (!v) throw new Error(`${key} is missing from .env.local`);
  return v;
}

// Every request goes through here. An error names the host and what it
// said, never the address, and nothing waits more than a minute, so one
// stuck platform cannot hold up the others.
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
  if (unread) throw new Error(unread.name === 'TimeoutError' ? `${host} did not answer within a minute` : `${host} sent an answer that could not be read`);
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

// The platforms' day is a Pacific calendar day.
const DAY = 864e5;
function pacificDay(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const daysBefore = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);
const PACIFIC_TODAY = pacificDay(Date.now());
const FIRST = daysBefore(PACIFIC_TODAY, DAYS);                    // oldest day asked for
const newest = platform => daysBefore(PACIFIC_TODAY, SETTLE[platform]);  // newest day written

// ---- the ledger, over plain fetch ----

async function ledger() {
  const url = (process.env.WIRE_URL || ENV.WIRE_URL || '').replace(/\/$/, '');
  const apikey = process.env.WIRE_KEY || ENV.WIRE_KEY;
  const email = process.env.WIRE_EMAIL || ENV.WIRE_EMAIL;
  const password = keep(process.env.WIRE_PASSWORD || ENV.WIRE_PASSWORD);
  if (!url || !apikey || !email || !password) throw new Error('WIRE_URL, WIRE_KEY, WIRE_EMAIL and WIRE_PASSWORD must all be set');
  keep(apikey);
  const session = await call(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey, 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  }).catch(e => { throw new Error('sign in failed: ' + e.message); });
  const headers = { apikey, ...bearer(keep(session.access_token)), 'content-type': 'application/json' };
  keep(session.refresh_token);
  const dayOf = at => call(`${url}/rest/v1/rpc/day_of`, { method: 'POST', headers, body: JSON.stringify({ ts: at }) });
  const moments = new Map();

  return {
    // The ledger's own day, from day_of in the database. Not worked out twice.
    today: dayOf,
    // A platform's day goes in at a moment day_of puts on that same date, noon UTC when it does, so it
    // lands on that day in day_metrics whatever timezone the ledger keeps.
    async moment(day) {
      if (!moments.has(day)) moments.set(day, (async () => {
        for (const h of [12, 20, 4]) {
          const ts = new Date(Date.parse(`${day}T00:00:00Z`) + h * 3600e3).toISOString();
          if (await dayOf(ts) === day) return ts;
        }
        throw new Error(`day_of puts none of the moments tried on ${day}`);
      })());
      return moments.get(day);
    },
    // Every day the ledger already holds for these stocks, whichever door
    // filled it. A day is one door's: two doors on one day are averaged into a
    // number neither of them read, so the second one leaves it alone.
    async heldDays(metrics) {
      const seen = new Set();
      if (!metrics.length) return seen;
      for (let from = 0; ; from += 1000) {
        const q = new URLSearchParams({ select: 'day,metric', metric: `in.(${metrics.join(',')})`, day: `gte.${FIRST}`,
          order: 'day.asc,metric.asc', limit: '1000', offset: String(from) });
        const page = await call(`${url}/rest/v1/day_metrics?${q}`, { headers });
        for (const r of page) seen.add(`${r.day}|${r.metric}`);
        if (page.length < 1000) return seen;
      }
    },
    // Every (source_id, metric) this source already holds from FIRST on.
    async have(source) {
      const seen = new Set();
      for (let from = 0; ; from += 1000) {
        const q = new URLSearchParams({ select: 'source_id,metric', source: `eq.${source}`, source_id: `gte.${FIRST}`,
          order: 'id', limit: '1000', offset: String(from) });
        const page = await call(`${url}/rest/v1/events?${q}`, { headers });
        for (const r of page) seen.add(`${r.source_id}|${r.metric}`);
        if (page.length < 1000) return seen;
      }
    },
    async insert(rows) {
      const r = await request(`${url}/rest/v1/events`, {
        method: 'POST', headers: { ...headers, prefer: 'return=minimal' }, body: JSON.stringify(rows)
      });
      if (!r.ok) throw new Error(`insert refused (${r.status}) ${why(await r.json().catch(() => null))}`.trim());
    }
  };
}

// ---- YouTube: the Analytics API, one row per metric per day ----

async function youtube() {
  let refresh = null;
  try { refresh = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')).youtube?.refresh_token || null; } catch (e) {}
  if (!refresh) throw new Error('no youtube refresh token in ~/.life/tokens.json');
  keep(refresh);
  // Google keeps the same refresh token, so nothing is written back.
  const t = await call('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: need('GOOGLE_CLIENT_ID'), client_secret: need('GOOGLE_CLIENT_SECRET'),
      refresh_token: refresh, grant_type: 'refresh_token' })
  });
  keep(t.access_token);

  const q = new URLSearchParams({ ids: 'channel==MINE', startDate: FIRST, endDate: newest('youtube'), dimensions: 'day',
    metrics: 'views,estimatedMinutesWatched,subscribersGained,averageViewPercentage', sort: 'day' });
  const report = await call(`https://youtubeanalytics.googleapis.com/v2/reports?${q}`, { headers: bearer(t.access_token) });
  const columns = (report.columnHeaders || []).map(h => h.name).join(',');
  if (columns !== 'day,views,estimatedMinutesWatched,subscribersGained,averageViewPercentage') throw new Error(`unexpected columns: ${columns || 'none'}`);

  // A day YouTube has not counted yet is left out of the report, not zeroed.
  const rows = [];
  let empty = 0;
  for (const [day, ...values] of report.rows || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`unexpected day ${day}`);
    YT_METRICS.forEach(([metric, unit], i) => {
      if (!Number.isFinite(values[i])) { empty++; return; }
      rows.push({ occurred_at: day, metric, value: values[i], unit, source: 'youtube', source_id: day });
    });
  }
  return { rows, empty };
}

// ---- Instagram: the Graph API, two day series and one total ----

async function instagram(today, at) {
  const token = need('IG_ACCESS_TOKEN');
  const get = (where, params) => call(`${GRAPH}/${where}?${new URLSearchParams(params)}`, { headers: bearer(token) });

  // The token belongs to a person, so the Instagram account is found through its page.
  const pages = await get('me/accounts', { fields: 'instagram_business_account{id}', limit: '100' });
  const linked = (pages.data || []).map(p => p.instagram_business_account).filter(Boolean);
  if (linked.length !== 1) throw new Error(`the token reaches ${linked.length} instagram accounts, it needs exactly one`);
  const ig = linked[0].id;

  // A day's value is stamped with the moment that day ends, midnight
  // Pacific. A question from midday before to midday after returns exactly
  // that day. The reach it returns must match the daily series, or the days
  // have not lined up and nothing is written.
  const now = Math.floor(Date.now() / 1000);
  const series = await get(`${ig}/insights`, { metric: 'reach', period: 'day', metric_type: 'time_series',
    since: now - (DAYS + 2) * 86400, until: now });
  const values = (series.data || []).find(m => m.name === 'reach')?.values;
  if (!Array.isArray(values)) throw new Error('no daily reach series came back');

  const rows = [];
  let empty = 0;
  for (const v of values) {
    const end = Date.parse(v.end_time);
    if (!Number.isFinite(end) || pacificDay(end) === pacificDay(end - 60000)) throw new Error(`a day ended at ${v.end_time}, not at midnight Pacific`);
    const day = pacificDay(end - 12 * 3600e3);
    if (day < FIRST || day > newest('instagram')) continue;
    const one = await get(`${ig}/insights`, { metric: 'reach,profile_views', period: 'day', metric_type: 'total_value',
      since: Math.floor(end / 1000) - 43200, until: Math.floor(end / 1000) + 43200 });
    if (!(one.data || []).length) throw new Error(`no insights came back for ${day}`);
    const got = Object.fromEntries(one.data.map(m => [m.name, m.total_value?.value]));
    if (got.reach !== v.value) throw new Error(`the days did not line up on ${day}`);
    for (const [metric, value, unit] of [['ig_reach', v.value, 'accounts'], ['ig_profile_views', got.profile_views, 'views']]) {
      if (!Number.isFinite(value)) { empty++; continue; }
      rows.push({ occurred_at: day, metric, value, unit, source: 'instagram', source_id: day });
    }
  }

  // Followers is a total right now, so it is today's reading and nothing else.
  const user = await get(ig, { fields: 'followers_count' });
  if (!Number.isFinite(user.followers_count)) throw new Error('no follower count came back');
  rows.push({ occurred_at: at, metric: 'ig_followers', value: user.followers_count, unit: 'followers', source: 'instagram', source_id: today });
  return { rows, empty };
}

// ---- TikTok: the Display API, three totals right now, per account ----

// TikTok can hand out a new refresh token on every refresh, and then only
// the new one works. The new pair is written to .env.local before it is
// used, on every line that holds that key, every other line untouched.
function saveEnv(updates) {
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  for (const [k, v] of Object.entries(updates)) {
    keep(v);
    const match = new RegExp(`^\\s*(export\\s+)?${k}\\s*=`);
    let found = false;
    lines.forEach((l, i) => { if (match.test(l)) { lines[i] = `${k}=${v}`; found = true; } });
    if (!found) lines.splice(lines[lines.length - 1] === '' ? lines.length - 1 : lines.length, 0, `${k}=${v}`);
  }
  fs.rmSync(ENV_FILE + '.tmp', { force: true });
  fs.writeFileSync(ENV_FILE + '.tmp', lines.join('\n'), { mode: 0o600 });
  fs.renameSync(ENV_FILE + '.tmp', ENV_FILE);
  Object.assign(ENV, updates);
}

async function tiktok(a, today, at) {
  // A reading counts only when the status is fine and TikTok says "ok".
  // An expired token comes back as null so it can be refreshed. Anything
  // else, a missing permission included, stops this account.
  const tt = async (token, where, body) => {
    const r = await request(`https://open.tiktokapis.com/v2${where}`, {
      method: body ? 'POST' : 'GET', headers: { ...bearer(token), 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const j = await r.json().catch(() => null);
    if (j?.error?.code === 'access_token_invalid') return null;
    if (!r.ok || j?.error?.code !== 'ok') {
      throw new Error(`tiktok said ${r.status} ${j?.error?.code || ''}${j?.error?.log_id ? ` (log ${j.error.log_id})` : ''}`.trim());
    }
    return j.data;
  };
  const USER = '/user/info/?fields=follower_count,likes_count,video_count';

  let token = keep(need(a.access));
  let user = (await tt(token, USER))?.user;
  if (!user) {
    // Life's cloud sync owns TikTok token rotation while its marker is there.
    // Refreshing here would kill the token it holds, so this stops instead.
    if (fs.existsSync(CLOUD_MARKER)) {
      throw new Error("the stored token has expired, and Life's cloud sync owns TikTok token rotation " +
        '(.life-social-cloud-managed), so it is not refreshed here');
    }
    if (DRY) throw new Error('the stored token has expired, and a dry run does not refresh it');
    const fresh = await call('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: need(a.key), client_secret: need(a.secret),
        grant_type: 'refresh_token', refresh_token: keep(need(a.refresh)) })
    });
    if (!fresh.access_token || !fresh.refresh_token) throw new Error(`the refresh was refused ${why(fresh)}`.trim());
    try {
      saveEnv({ [a.refresh]: fresh.refresh_token, [a.access]: fresh.access_token });
    } catch (e) {
      throw new Error('TikTok rotated the token but it could not be saved to .env.local. Authorize this account again');
    }
    token = fresh.access_token;
    user = (await tt(token, USER))?.user;
    if (!user) throw new Error('the refreshed token was refused');
  }

  // No account-wide view count exists, so views is the sum across every
  // public video. If any page fails, there is no sum at all rather than a low one.
  let views = 0, cursor = null;
  const ids = new Set(), cursors = new Set();
  for (let page = 0; ; page++) {
    if (page >= 1000) throw new Error('the video list never ended');
    const d = await tt(token, '/video/list/?fields=id,view_count', cursor === null ? { max_count: 20 } : { max_count: 20, cursor });
    if (!d || !Array.isArray(d.videos)) throw new Error('the video list was refused');
    for (const v of d.videos) {
      if (ids.has(v.id)) throw new Error('the video list repeated a video');
      if (!Number.isFinite(v.view_count)) throw new Error('a video came back with no view count');
      ids.add(v.id);
      views += v.view_count;
    }
    if (d.has_more === false) break;
    if (d.has_more !== true || !Number.isFinite(d.cursor) || cursors.has(d.cursor)) throw new Error('the video list paged badly');
    cursors.add(d.cursor);
    cursor = d.cursor;
  }

  for (const k of ['follower_count', 'likes_count']) if (!Number.isFinite(user[k])) throw new Error(`no ${k} came back`);
  if (ids.size === 0 && user.video_count > 0) throw new Error('the video list came back empty for an account with videos');
  const row = (metric, value, unit, context = {}) =>
    ({ occurred_at: at, metric: `${metric}_${a.name}`, value, unit, source: 'tiktok', source_id: today, context });
  return {
    rows: [
      row('tt_followers', user.follower_count, 'followers'),
      row('tt_views', views, 'views', { public_videos: ids.size }),
      row('tt_likes', user.likes_count, 'likes')
    ],
    empty: 0
  };
}

// ---- run ----

let db, today;
const at = new Date().toISOString();
try {
  db = await ledger();
  today = await db.today(at);
} catch (e) {
  say(`ledger: ${e.message}`);
  process.exit(1);
}

const jobs = [
  ['youtube', 'youtube', () => youtube()],
  ['instagram', 'instagram', () => instagram(today, at)],
  ...TIKTOK_ACCOUNTS.map(a => [`tiktok ${a.name}`, 'tiktok', () => tiktok(a, today, at)])
];

const failed = [];
for (const [label, source, pull] of jobs) {
  try {
    const { rows, empty } = await pull();
    // The database refuses the same (source, source_id, metric) twice. This
    // check keeps a repeat from failing the whole insert.
    const have = await db.have(source);
    const mine = rows.filter(r => !have.has(`${r.source_id}|${r.metric}`));
    // A day another door already filled for this stock is left alone, and said.
    const held = await db.heldDays([...new Set(mine.map(r => r.metric))]);
    const fresh = mine.filter(r => !held.has(`${r.source_id}|${r.metric}`));
    const theirs = mine.length - fresh.length;
    // a platform's day row carries its date until the ledger says which moment falls on that day
    for (const r of fresh) if (/^\d{4}-\d{2}-\d{2}$/.test(r.occurred_at)) r.occurred_at = await db.moment(r.occurred_at);
    const note = `${rows.length - mine.length} already there` + (theirs ? `, ${theirs} left to another door` : '') + (empty ? `, ${empty} empty values skipped` : '');
    if (DRY) {
      for (const r of fresh) say(`  ${r.source_id}  ${r.metric.padEnd(24)} ${r.value} ${r.unit}`);
      say(`${label}: would add ${fresh.length}, ${note}`);
      continue;
    }
    if (fresh.length) await db.insert(fresh);
    say(`${label}: added ${fresh.length}, ${note}`);
  } catch (e) {
    failed.push(label);
    say(`${label} FAILED: ${e.message}`);
  }
}

if (failed.length) {
  say(`failed: ${failed.join(', ')}`);
  process.exit(1);
}
