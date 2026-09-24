// The wire. Your AI reads your ledger, and writes only what you gave it.
//
// Law 7: no AI writes a number it was not given. Through record, did, rule
// and goal Claude may write measurements, commits, rules and goals, and
// remember writes a note. It prints the exact rows and writes only after
// you say yes. Every row it writes carries source 'claude'. There is no
// update and no delete. It signs in as you with the publishable key, so
// the same row level security that protects the website protects this.
//
// The maths is not copied. It loads you-reader.js, the same file the
// website loads, so the number the AI sees is the number on your screen.
//
// This file is the server and every tool, defined once. mcp/wire.mjs runs
// it over stdio for Claude Desktop; api/mcp.mjs runs it over HTTP on Vercel.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { supabaseUrl, publishableKey, isPublishable } from './env.mjs';
import { code, feed, index, keys, table, version } from './health.mjs';
import { flow } from './flow.mjs';
import { youscan } from './youscan.mjs';

const { WIRE_EMAIL, WIRE_PASSWORD } = process.env;

// One source of truth. The browser loads this file with a script tag;
// here we read the same text and pull the functions out of it.
const src = readFileSync(new URL('../you-reader.js', import.meta.url), 'utf8');
const R = new Function(src + `
  return { readMetrics, readRules, readDays, readDay, isDate, lastDay, readWhen, momentOn, readingKey, rankSeries, etfSeries,
           readCommits, testCommit, dayNum, slugCommit,
           readGoals, goalSeries, weakPoint, writeRule, writeGoal, readNotes,
           readAll, readSources, staleAfter, staleBounds, readStarts, writeStart, readVoids, writeVoid, readingOn, voidedOn, liveRows, correctedOn, staleOn, writeCorrection,
           readCommitVoids, writeCommitVoid, commitVoided, liveCommits,
           indexState, indexOn, noIndexWhy, outgrownBy, offScaleBy, OUTGROWN, BASELINE, LAGS,
           FED, readFeeds, feedOf,
           scanLead, scanCommit, crossTest, crossGrid };`)();

// The client is made on the first question, not on import, so a server
// whose settings are missing still starts and answers with why.
let db = null;

// writeRule and writeGoal sign their rows 'you', as the pages do. A row
// that comes in through here is Claude's, so it goes in signed 'claude'.
const asClaude = {
  from: table => ({ insert: row => db.from(table).insert({ ...row, source: 'claude' }) })
};
// A picture read again is still the instrument's reading, so its correction goes in signed photo.
const asPhoto = {
  from: table => ({ insert: row => db.from(table).insert({ ...row, source: 'photo' }) })
};

// Sign in on the first question, not at startup. Claude expects an answer
// to its handshake within a couple of seconds, and a network round trip
// before that is enough to make it give up on us. A failed sign in is not
// kept, so the next question tries again.
let authed = null;
function signIn() {
  if (!db) {
    // the address and a publishable key only; a secret or service_role key would step around row level security
    if (!isPublishable(publishableKey())) throw new Error('WIRE_KEY is not a publishable key');
    db = createClient(supabaseUrl(), publishableKey());
  }
  authed = authed || db.auth.signInWithPassword({
    email: WIRE_EMAIL, password: WIRE_PASSWORD
  }).then(({ error }) => {
    if (error) { authed = null; throw new Error('sign in failed: ' + error.message); }
  });
  return authed;
}

// The signed in client, for a door that is not a tool: /api/photo writes a file
// and a row and needs the same session the tools write through. Signing in lives
// here once, so no door invents a second way to hold the password.
export async function signedIn() {
  await signIn();
  return db;
}

// The ledger's day for a moment, now unless one is given. It is defined once, by day_of in the
// database, in the owner's timezone, and here it is only ever asked for. When day_of cannot be
// read the answer says so, and health names what is missing.
const ledgerDay = ts => R.readDay(db, ts).catch(e => {
  throw new Error(`the ledger's day cannot be read from day_of: ${e.message}. health names what is missing`);
});
// A moment that day_of puts on this date, or null: momentOn in you-reader.js, asked through ledgerDay.
const momentOn = date => R.momentOn(db, date, ledgerDay);

// The readers come first. The writers are at the end. The ledger's day and the commits are read only
// for the questions that use them, so a question about stocks never waits on day_of or fails with it.
// A void row that names no day is the one exception: its own day is the ledger's day. Those are asked
// for through the same ledgerDay, so a day that cannot be read is said in words and never guessed.
async function load({ day = false } = {}) {
  await signIn();
  const [today, all, rules, voids, cvoids, sources, starts] = await Promise.all([day ? ledgerDay() : null, R.readMetrics(db), R.readRules(db), R.readVoids(db, ledgerDay), R.readCommitVoids(db), R.readSources(db), R.readStarts(db)]);
  const [allCommits, rows] = await Promise.all([day ? R.readCommits(db, today) : null, R.readDays(db, all)]);
  const series = R.rankSeries(rows, rules, voids, starts);
  // each stock is stale on its own door's promise plus the slack, never one number for all
  const staleBy = R.staleBounds(sources);
  // every question about commits is asked of the ones that count. The whole list is kept beside it, so a
  // voided commit can still be named and counted again, and so its name is still taken.
  const commits = allCommits && R.liveCommits(allCommits, cvoids);
  return { all, rules, commits, allCommits, cvoids, series, rows, today, voids, starts, staleBy };
}

const text = o => ({ content: [{ type: 'text', text: JSON.stringify(o, null, 2) }] });

// A stock with readings and a rule but no series is still a stock: its rule ignores it, or no reading of it counts,
// each voided or corrected and stale. stocks lists it and history answers with it, rather than dropping it, so a
// voided reading can still be found, and corrected, when it was the stock's only one.
const uncountedOf = (m, rules, rows, voids) => {
  const mine = rows.filter(r => r.metric === m);
  return { metric: m, rule: rules[m], day_rows: mine.length, counted: R.liveRows(mine, voids).length,
           why: rules[m] && rules[m].kind === 'ignore' ? 'its rule ignores it' : 'no reading counts: each is voided, or corrected and stale' };
};

// ---- the writers ----
//
// Each one writes only what the user gave, after the user has seen the
// rows and said yes. Anything that cannot be read is refused, never guessed.

// a date, and the latest date that is today somewhere on Earth: the reading of a time is in you-reader.js
const isDay = R.isDate, lastDay = () => R.lastDay();
// the pad's name rule: lower case, anything else an underscore
const slug = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
// every task, at most n running at once; the first failure stops the rest and is thrown
async function few(tasks, n = 8) {
  const out = []; let next = 0;
  const lane = async () => {
    while (next < tasks.length) {
      const i = next++;
      try { out[i] = await tasks[i](); } catch (e) { next = tasks.length; throw e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, lane));
  return out;
}

// The ways one number reaches the ledger, and the whole of the difference
// between them. A number the user gave is a measurement, signed claude. A
// number Claude read off a picture is an estimate: signed photo, never claude,
// its name ending _est, and carrying the model that read it. A number an iOS
// Shortcut sends through /api/at is a measurement too, signed shortcut. Neither
// measurement ever takes an estimate's _est name.
//
// An estimate and a measurement must never share a name or a source. The
// instrument drifts between models and does not reproduce, and the table has
// no delete, so a series that mixes the two can never be untangled again.
// Named here, once, so the source and the name rule cannot drift apart from
// what the doors do.
export const WRITERS = {
  record: {
    source: 'claude',
    name: m => /_est$/.test(m) ? 'a name ending _est is an estimate\'s, and a number the user gave is a measurement' : null
  },
  estimate: {
    source: 'photo',
    name: m => /_est$/.test(m) ? null : 'an estimate\'s metric name must end _est, so it can never be taken for something measured'
  },
  shortcut: {
    source: 'shortcut',
    name: m => /_est$/.test(m) ? 'a name ending _est is an estimate\'s, and a shortcut sends what was measured' : null
  },
  // A number an AI read in the text of a page the user is signed into. The page is part of the key, so the
  // same page read twice on one day lands once; context keeps the page it was read on.
  chrome: {
    source: 'chrome',
    name: m => /_est$/.test(m) ? 'a name ending _est is an estimate\'s, and _est is only for photos the user sends; a number only in a picture or a chart on a page is never written' : null,
    key: (metric, day, context) => context.page + '|' + day
  }
};

// record, estimate and /api/at write the same shape and differ only in what
// produced the number, so the reading of dates, the refusals and the ledger's
// own day are one piece of code and they can never drift apart on any of them.
// The rows as the ledger would hold them, each with its ledger day, or why nothing can be written. Asking
// this writes nothing, so a reading can be keyed exactly as it would land before anything is decided.
async function readingsOf(rows, writer, context = null) {
  const read = [], refused = [];
  for (const r of rows) {
    const metric = slug(r.metric), when = R.readWhen(r.occurred_at);
    if (!metric) { refused.push({ ...r, why: 'no metric name' }); continue; }
    const badName = writer.name && writer.name(metric);
    if (badName) { refused.push({ ...r, why: badName }); continue; }
    if (!Number.isFinite(r.value)) { refused.push({ ...r, why: 'the value is not a number' }); continue; }
    // a date is refused only when it is not today anywhere; a timestamp is one moment, with five minutes for a slow clock
    if (when.why) { refused.push({ ...r, why: 'occurred_at is ' + when.why }); continue; }
    read.push({ r, date: when.date || null, stamp: when.stamp || null, metric, value: r.value, unit: r.unit || null });
  }
  // the name is read before anything is asked of the ledger, so a wrong one costs no round trip
  if (refused.length) return { error: 'nothing written', refused };

  // The day in source_id is the ledger's, from day_of, a few questions at a time. A timestamp's day is
  // day_of of it. A date is its own day, written at a moment day_of puts on it. If a day cannot be read,
  // or no moment tried is on the date, nothing is written.
  await signIn();
  const dates = [...new Set(read.filter(x => x.date).map(x => x.date))];
  const stamps = [...new Set(read.filter(x => x.stamp).map(x => x.stamp))];
  let moment, dayAt;
  try {
    const got = await few([...dates.map(d => () => momentOn(d)), ...stamps.map(ts => () => ledgerDay(ts))]);
    moment = new Map(dates.map((d, i) => [d, got[i]]));
    dayAt = new Map(stamps.map((ts, i) => [ts, got[dates.length + i]]));
  } catch (e) { return { error: 'nothing written', why: e.message }; }
  for (const x of read) if (x.date && !moment.get(x.date)) refused.push({ ...x.r, why: 'day_of puts none of the moments tried on this date' });
  if (refused.length) return { error: 'nothing written', refused };
  const days = read.map(x => x.date || dayAt.get(x.stamp));
  const out = read.map((x, i) => ({
    occurred_at: x.date ? moment.get(x.date) : x.stamp, metric: x.metric, value: x.value, unit: x.unit,
    source: writer.source, source_id: writer.key ? writer.key(x.metric, days[i], context) : R.readingKey(x.metric, days[i]), event_type: 'measurement',
    ...(context ? { context } : {})
  }));
  return { out, days };
}

export async function writeReadings(rows, writer, context = null) {
  const got = await readingsOf(rows, writer, context);
  if (got.error) return got;
  const { out, days } = got;

  // Different values for one stock and ledger day cannot be deduped by picking the first.
  // Refuse the whole call before any insert, naming every conflicting value exactly as supplied.
  const values = new Map();
  out.forEach((r, i) => {
    const k = r.metric + '|' + r.source_id;
    if (!values.has(k)) values.set(k, { metric: r.metric, day: days[i], values: new Set() });
    values.get(k).values.add(r.value);
  });
  const conflicts = [...values.values()].filter(r => r.values.size > 1)
    .map(r => ({ metric: r.metric, day: r.day, values: [...r.values] }));
  if (conflicts.length) return { error: 'nothing written', why: 'different values for the same stock and day', conflicts };

  // the same metric on the same day, already in the ledger or twice in this call, lands once. The
  // source is part of the question, so an estimate never dedupes against a measurement, or the reverse
  const { data: have, error: e1 } = await db.from('events')
    .select('metric, source_id').eq('source', writer.source)
    .in('source_id', out.map(r => r.source_id)).limit(20000);
  if (e1) return { error: e1.message };
  const seen = new Set(have.map(r => r.metric + '|' + r.source_id)), fresh = [], skipped = [];
  for (const r of out) {
    const k = r.metric + '|' + r.source_id;
    if (seen.has(k)) skipped.push(r); else { seen.add(k); fresh.push(r); }
  }
  // events_once has the last word. A batch it refuses goes in not at all, so each row is tried alone, and a
  // row it refuses was already there, written by a request that crossed this one between the question and
  // the write: two taps of a shortcut at once land one row and both answer with it.
  const written = [];
  if (fresh.length) {
    const { error } = await db.from('events').insert(fresh);
    if (!error) written.push(...fresh);
    else if (error.code !== '23505') return { error: error.message, written: [], skipped };
    else for (const r of fresh) {
      const { error: e } = await db.from('events').insert(r);
      if (!e) written.push(r);
      else if (e.code === '23505') skipped.push(r);
      else return { error: e.message, written, skipped };
    }
  }
  return { written, skipped };
}

// Estimates already in the ledger, read again with another value, or on a day voided or stale: for each, what its
// day reads now, the model that read that value when a picture made it, and the new reading that would take its
// place. rows are estimate rows as readingsOf builds them, days their ledger days. A day already reading the
// new value, and a day with no reading, are left out; missing says which days had no reading.
async function readAgain(rows, days, model) {
  const { rows: dayRows, voids } = await load();
  const out = [], photo = new Map();
  out.missing = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], day = days[i], r = R.readingOn(dayRows, row.metric, day);
    if (!r) { out.missing.push(day); continue; }
    const reads = R.correctedOn(voids, row.metric, day) ?? Number(r.mean), readings = Number(r.readings);
    const voided = R.voidedOn(voids, row.metric, day), stale = R.staleOn(voids, row.metric, day, readings);
    if (reads === row.value && !voided && !stale) continue;
    // The model that read the value the day reads now, named only when a picture made that value: a corrected day
    // by its latest correction, if that one is signed photo; an uncorrected day by its estimate, if that is the
    // day's one reading. A mean of several doors was read by no model. An estimate sits at the moment it reads and
    // a correction at the moment it was written, so the two kinds are chosen apart, never by one walk in time.
    if (!photo.has(row.metric)) {
      const data = await R.readAll(() => db.from('events').select('event_type, source, source_id, context, occurred_at')
        .eq('metric', row.metric).or('source.eq.photo,event_type.eq.correction').order('occurred_at', { ascending: true }).order('id', { ascending: true }));
      photo.set(row.metric, data);
    }
    const mine = photo.get(row.metric), ctx = e => e.context || {};
    const fix = R.correctedOn(voids, row.metric, day) !== undefined
      ? mine.filter(e => e.event_type === 'correction' && ctx(e).day === day).pop()
      : null;
    const made = fix ? (fix.source === 'photo' ? fix : null)
      : readings === 1 ? mine.find(e => e.event_type === 'measurement' && e.source === 'photo' && e.source_id === row.source_id) : null;
    const by = made && typeof ctx(made).model === 'string' ? ctx(made).model : null;
    out.push({
      metric: row.metric, day, reads, read_by: by, voided, stale, value: row.value, model, readings,
      print: `${row.metric}  ${reads}  ${day}${by ? `  read by ${by}` : ''}${voided ? '  voided' : ''}${stale ? '  a reading landed after its correction' : ''}\n` +
             `make it ${row.value}, read by ${model}`
    });
  }
  return out;
}

// A fresh server with every tool on it. stdio makes one for the life of the
// process; HTTP makes one per request, as a stateless server must.
// site is the address the server is reached at, when there is one, so its answer names the buyer's own pages.
export function wireServer({ site = null } = {}) {
  // mcp/MCP.md holds these laws, and a file in a repo is read by nobody. The ones that govern
  // writing travel with the server instead, so every session opens with them, a buyer's as much
  // as this one. Kept short on purpose: it is sent every time.
  const server = new McpServer({ name: 'wire', version: version() || '0.0.0' }, {
    instructions:
      'The Wire is a personal ledger, and it is append only: a row can be added, never edited and ' +
      'never removed. Print every row before you write it and wait for a yes. Transcribe only: ' +
      'never estimate, round, fill or infer a number, and say so plainly when one cannot be read. ' +
      'Silence over a guess, everywhere. Read the ledger before asking for anything already in it. ' +
      'Notes are what the ledger knows that is not a number; read them before advising, as you read the ledger before asking for a number. ' +
      'Write a note only through remember, only what the user said in this conversation, never a conclusion, and only on a yes. ' +
      'Profile-link onboarding is display metadata, not scoring: collect exact public URLs the user gives or confirms, never guess handles. ' +
      'Read notes first and preserve approved url/picture fields. After approval, use remember with JSON text containing url and picture, ' +
      'under profile_<account> or profile_<account>_<platform>, using the page\'s exact IDs in lowercase; ask if unknown. ' +
      'The dashboard reads these notes automatically; browser profile overrides still win. Never include credentials in a profile URL. ' +
      'Daily logging reminders are display metadata too: only when the user explicitly chooses a daily promise or turns it off, ' +
      'read notes, preview the exact note and get a yes, then remember logging_<metric-slug> with JSON text {"cadence":"daily"} or {"cadence":"off"}. ' +
      'Use the existing metric\'s lowercase slug. Never infer a promise from reading patterns or source delays; this creates no reading, rule or scheduled job. ' +
      'When the user asks to track something new, read the ledger first and say whether a stock ' +
      'already carries that fact, naming it and why in one line: a new metric is a cost, not a free ' +
      'addition. ' +
      'Voiding costs more than a yes: print the phrase the tool gives you, exactly as it is, and ' +
      'write only once the user sends that phrase back. A number the user gave you goes through ' +
      'record. A number you read off a picture goes through estimate, which signs it photo and needs ' +
      'a name ending _est. Never the other way round. A wrong estimate is read again through estimate, never ' +
      'corrected by a typed number. ' +
      'Connecting a source: a total that grows keeps no index, because it leaves the unit its baseline was ' +
      'drawn in behind, so track the rate the total hides and never the total. And never declare a rule for a ' +
      'stock no door feeds: a stale stock means YOU has no value that day at all, so a number that arrives only ' +
      'when the user remembers to fetch it stays undeclared, still in the ledger and still history. ' +
      'Reading a web page through Chrome or any browser tool: only the user\'s own numbers, from pages they are already signed into. ' +
      'Read the page\'s text, never a screenshot; a number you can only see in a picture or a chart on the page is never written, not even as _est, because reading it would need a screenshot. _est is only for photos the user sends. ' +
      'A number missing or unclear on the page is not written; say so. Use the date the page shows for a number when it shows one. ' +
      'A total that only grows goes through record_page with total true, which keeps the total and scores its daily change; never subtract yourself. ' +
      'Write only through record_page, which signs every row chrome: show its full table and write on one yes. ' +
      'Read only: never type, log in, accept, or click anything that changes the page, and stop and say so if a site blocks automation. ' +
      'When the user types /youscan in any chat, with or without a site name or a link after it, run the scan. ' + youscan(undefined, site) + ' ' +
      'When the user asks what they can do, how to add data, or what now, answer with exactly this and nothing else:\n' + flow(site)
  });

  server.tool(
    'health',
    'Whether this wire is up to date, its table is the right shape, its settings are in place, and it is ' +
    'still being fed. code compares this copy\'s version with the one on GitHub. table checks the columns ' +
    'the code reads, day_of and day_metrics, names what is missing or the wrong shape, and hands over the ' +
    'exact SQL that puts it right, to run in the Supabase SQL editor. keys names the settings that are not ' +
    'set, never a value. feed names every door that writes into the ledger, how many days behind its newest ' +
    'row is, and whether that is the lag the door promises or a cable that has stopped. index names every stock ' +
    'that no longer fits its baseline, varying many times as much or as little now as across its first thirty readings, so its ' +
    'index would be arithmetic and not a reading. The first three say whether this copy is built correctly; ' +
    'feed and index say whether what comes in can still be read. It writes nothing.',
    {},
    async () => {
      const k = keys();
      const ledger = !k.wrong && k.missing.every(n => n === 'WIRE_TOKEN');
      const unchecked = { ok: null, say: 'not checked until the keys are set' };
      // a trailing catch, not then's second argument: that one only sees signIn fail, never the read after it
      // the gate is indexState in you-reader.js; health only asks it which stocks have outgrown their baseline
      const outgrown = async () => {
        const { series } = await load();
        return index(Object.keys(series).filter(m => R.offScaleBy(series[m]))
          .map(m => ({ metric: m, by: Math.round(R.offScaleBy(series[m]) * 10) / 10, why: R.noIndexWhy(series[m]) })));
      };
      const [c, t, f, x] = await Promise.all([
        code(),
        ledger ? signIn().then(() => table(db), e => ({ ok: null, error: e.message })) : unchecked,
        ledger ? signIn().then(async () => feed(R.feedOf(await R.readFeeds(db)))).catch(e => ({ ok: null, error: e.message })) : unchecked,
        ledger ? outgrown().catch(e => ({ ok: null, error: (e && e.message) || String(e) })) : unchecked
      ]);
      const { sql, ...rest } = t;
      const out = text({ code: c, table: sql ? { ...rest, sql: 'the next block, exact' } : rest, keys: k, feed: f, index: x });
      if (sql) out.content.push({ type: 'text', text: sql });
      return out;
    }
  );

  server.tool(
    'stocks',
    'What you measure, which way is better, and where each one stands today. ' +
    'The baseline comes from the first thirty readings on or after the stock\'s start, or its first readings ' +
    'when no start is set. Current indexes require a reading on the ledger\'s current day. uncounted lists stocks that have readings ' +
    'but no series, because their rule ignores them or no reading counts, each voided or corrected and stale: ' +
    'they are still stocks, and correct reaches their days.',
    {},
    async () => {
      const { all, rules, series, rows, voids, staleBy, today } = await load({ day: true });
      const out = Object.keys(series).map(m => {
        const p = series[m];
        const last = p[p.length - 1];
        const current = R.indexOn(p, today), reading = p.find(r => r.day === today);
        return {
          metric: m,
          rule: rules[m],
          days: p.length,
          latest_reading: last.value,
          latest_reading_day: last.day,
          start: p.start,
          baseline_readings: p.baselineCount,
          index: current ? current.rank : null,
          day: today,
          index_state: R.indexState(p),
          note: reading && reading.why ? 'no index: ' + reading.why
              : R.indexState(p) === 'none' ? 'no index: ' + R.noIndexWhy(p)
              : !current ? 'no reading on the ledger\'s current day'
              : R.indexState(p) === 'moving' ? `baseline still filling, ${p.baselineCount} of ${R.BASELINE}: this index will move`
              : undefined
        };
      });
      const undeclared = all.filter(m => !(m in rules));
      const uncounted = all.filter(m => m in rules && !series[m]).map(m => uncountedOf(m, rules, rows, voids));
      return text({ day: today, you: R.indexOn(R.etfSeries(series, Object.keys(series), staleBy), today),
                    stocks: out, ...(uncounted.length ? { uncounted } : {}), undeclared });
    }
  );

  server.tool(
    'history',
    'The day by day readings for one metric, oldest first, with an index only where one can be read. ' +
    'Readings before a stock\'s start remain raw history with a null rank and a reason. A stock the gate gives no index, ' +
    'its baseline never moved or it has outgrown it, returns its readings without an index and says why. ' +
    'A stock with a rule whose readings do not count, ' +
    'each voided or ignored, answers with no points and why, and is still a stock correct can reach.',
    { metric: z.string(), days: z.number().optional() },
    async ({ metric, days = 60 }) => {
      const { all, rules, series, rows, voids } = await load();
      const p = series[metric];
      if (!p && all.includes(metric) && metric in rules) return text({ ...uncountedOf(metric, rules, rows, voids), points: [],
        say: 'it is a stock with a rule and no series, for the reason in why: correct reaches its days' });
      if (!p) return text({ error: `no stock called ${metric}, or it has no rule yet` });
      // The shared reader keeps raw history and puts its refusal beside each rank it cannot supply.
      return text({ metric, start: p.start, baseline_readings: p.baselineCount, index_state: R.indexState(p),
        ...(R.indexState(p) === 'none' ? { note: 'no index: ' + R.noIndexWhy(p) } : {}),
        points: p.slice(-days) });
    }
  );

  server.tool(
    'goals',
    'What the stocks are for. Each goal is YOU drawn over only its own ' +
    'measures, 100 at your usual across the first thirty readings. The weak ' +
    'point is the measure with the lowest index right now.',
    {},
    async () => {
      const { series, staleBy, today } = await load({ day: true });
      const goals = await R.readGoals(db);
      return text({
        goals: goals.map(g => {
          const p = R.goalSeries(g, series, staleBy);
          const current = R.indexOn(p, today);
          const weak = R.weakPoint(g, series, today);
          return {
            goal: g.name,
            id: g.id,
            index: current ? current.rank : null,
            index_state: R.indexState(p),
            note: !g.measures.some(m => series[m]) ? 'no measure has a rule yet'
                : R.indexState(p) === 'none' ? 'no index: ' + (R.noIndexWhy(p) || 'this line has no spread, so there is nothing to score a day against')
                : !current ? 'no goal index on the ledger\'s current day'
                : R.indexState(p) === 'moving' ? `baseline still filling, ${p.length} of ${R.BASELINE}: this index will move`
                : undefined,
            day: today,
            target: g.target,
            measures: g.measures,
            levers: g.levers,
            weak_point: weak ? { metric: weak.metric, index: weak.rank, day: weak.day } : null
          };
        })
      });
    }
  );

  server.tool(
    'commits',
    'What you did. Each one has a start and an end, not a value.',
    {},
    async () => {
      const { commits, allCommits, cvoids } = await load({ day: true });
      const voided = allCommits.filter(c => R.commitVoided(cvoids, c.id));
      return text({ commits, ...(voided.length ? { voided } : {}) });
    }
  );

  server.tool(
    'did_it_work',
    'Test one commit against one stock. Compares the days it ran against the ' +
    'same number of days straight before. Refuses to answer when it cannot know.',
    { commit: z.string(), metric: z.string() },
    async ({ commit, metric }) => {
      const { commits, series, today, staleBy } = await load({ day: true });
      const c = commits.find(x => x.id === commit || x.name === commit);
      if (!c) return text({ error: `no commit called ${commit}` });
      const points = metric === 'YOU'
        ? R.etfSeries(series, Object.keys(series), staleBy)
        : series[metric];
      if (!points) return text({ error: `no stock called ${metric}` });
      const r = R.testCommit(points, c, commits, today);
      return text({ commit: c.name, metric, ...r });
    }
  );

  server.tool(
    'notes',
    'What has been noted, latest per subject. A note you wrote yourself beats ' +
    'one Claude wrote, whatever the date. Pass a subject for its full history.',
    { subject: z.string().optional() },
    async ({ subject }) => {
      await signIn();
      const rows = await R.readNotes(db, subject);
      if (subject !== undefined) {
        return text({ subject: R.slugCommit(subject), notes: rows });
      }
      return text({ notes: rows });
    }
  );

  server.tool(
    'remember',
    'Write one note under a subject. Only remember what the user said in this ' +
    'conversation, never a conclusion. The user approves each call.',
    { subject: z.string(), text: z.string() },
    async ({ subject, text: body }) => {
      await signIn();
      const row = {
        occurred_at: new Date().toISOString(),
        metric: R.slugCommit(subject),
        event_type: 'note',
        value: null,
        source: 'claude',
        context: { text: body }
      };
      const { error } = await db.from('events').insert(row);
      if (error) return text({ error: error.message });
      return text({ remembered: row });
    }
  );

  server.tool(
    'cross',
    'Every lever of every goal against that goal\'s outcomes, the outcome read the lever\'s declared ' +
    'days later: after the days the lever read above its usual against after the days it read below. A ' +
    'habit that starts, stops or moves to another day is read inside its own stretches, and a lever that ' +
    'moves with a whole busy week against the other days of its week. A scan: leads at a raised bar, never ' +
    'findings. before means the outcome already differed on the lever\'s own day, so this lever cannot be ' +
    'told apart from it. fixed means the lever reads the same on every one of its weekdays every week, so ' +
    'nothing in the data can tell it from the week\'s own rhythm; changing it for a few weeks as a commit ' +
    'is what can. highMean and lowMean are the plain average outcome after the high days and after the low ' +
    'days; effect is what decides.',
    {},
    async () => {
      const { series, rows, voids, today } = await load({ day: true });
      // a voided reading is no more a lever than it is an outcome, so the scan is given the rows that count
      const grid = R.crossGrid(await R.readGoals(db), R.liveRows(rows, voids), series, today);
      for (const b of grid.blocks) for (const l of b.levers) for (const o of Object.keys(l.cells)) {
        const { pairs, ...rest } = l.cells[o];
        l.cells[o] = { ...rest, pairs: pairs ? pairs.length : 0 };
      }
      return text(grid);
    }
  );

  server.tool(
    'record',
    'Write readings the user gave: one events row each, event_type measurement, ' +
    'source claude, source_id the metric and the ledger day joined by a colon, so ' +
    'the same reading twice lands once. occurred_at is a timestamp with its zone, or ' +
    'a date, which is written at noon UTC as commits are, or at the hour of that date ' +
    'day_of puts on it where noon UTC is on another ledger day. If any row cannot be read, ' +
    'nothing is written; print every row to the user and get a yes before calling this. ' +
    'Never call it with a value you were not given. A row whose stock and day already hold a reading from ' +
    'this door, voided or not, is skipped: to put another number on that day, use correct.',
    {
      rows: z.array(z.object({
        metric: z.string(),
        value: z.number(),
        unit: z.string().nullable(),
        occurred_at: z.string()
      })).min(1)
    },
    async ({ rows }) => {
      const out = await writeReadings(rows, WRITERS.record);
      return text(out.skipped && out.skipped.length ? { ...out,
        say: 'skipped rows were not written: that stock already holds a reading from record on that ledger day, ' +
             'voided or not. To put another number on that day, use correct.' } : out);
    }
  );

  // ---- the Chrome door: a number read in the text of a page the user is signed into ----
  //
  // The AI picks nothing about where the row came from: the source is always chrome and the page is the one
  // it read. A page's address is kept without its query and fragment, which can carry a session or a token,
  // and never anything but http or https. The day is the page's own date when it shows one, else today.
  //
  // A total that only climbs is never scored: it is kept as <metric>_total, exactly as read, and what is
  // scored is its daily change, worked out here and never by the AI, from the total read on the day before.
  // A total whose day before holds no reading writes its change nowhere and says so, because a climb over
  // two days wearing one day's name is a day that never happened. Silence over a guess.
  //
  // One stock, one day, one page: a stock already read today on another page is skipped and said, because
  // two pages giving one number twice would be counted twice, and picking one would be a guess.
  const pageOf = u => {
    try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) && !x.username && !x.password ? x.origin + (x.pathname.replace(/\/+$/, '') || '') : null; }
    catch { return null; }
  };
  const dayBefore = d => new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
  async function pagePlan(page, rows) {
    const context = { page, read: 'text' };
    const plain = rows.filter(r => !r.total).map(({ total, ...r }) => r);
    const totals = rows.filter(r => r.total).map(({ total, ...r }) => ({ ...r, metric: slug(r.metric) + '_total' }));
    const bad = rows.filter(r => r.total && /_total$/.test(slug(r.metric)));
    if (bad.length) return { error: 'nothing written', why: 'for a total, name the daily change, like ig_followers: the total itself is kept as <name>_total', refused: bad };
    const got = await readingsOf([...plain, ...totals], WRITERS.chrome, context);
    if (got.error) return got;
    const skipped = [], changes = [];
    if (totals.length) {
      const names = totals.map(t => t.metric);
      const [dayRows, voids] = await Promise.all([R.readDays(db, names), R.readVoids(db, ledgerDay)]);
      const live = R.liveRows(dayRows, voids);
      got.out.forEach((r, i) => {
        if (!names.includes(r.metric)) return;
        const day = got.days[i], before = live.find(x => x.metric === r.metric && x.day === dayBefore(day));
        const change = r.metric.replace(/_total$/, '');
        if (!before) skipped.push({ metric: change, day, why: `no reading of ${r.metric} on ${dayBefore(day)}, so there is no day's change to count` });
        else changes.push({ metric: change, value: +(r.value - before.mean).toFixed(10), unit: r.unit, occurred_at: r.occurred_at, from: `${r.value} on ${day} less ${before.mean} on ${dayBefore(day)}` });
      });
    }
    const input = [...plain, ...totals, ...changes.map(({ from, ...c }) => c)];
    const plan = input.length ? await readingsOf(input, WRITERS.chrome, context) : { out: [], days: [] };
    if (plan.error) return plan;
    // one stock, one day, one page. Every chrome reading of these stocks, a page at a time (law 10): a read cut
    // short by the database's page size would miss one, and a second page's number would be written
    let have;
    try {
      have = await R.readAll(() => db.from('events').select('id, metric, source_id, value').eq('source', 'chrome')
        .in('metric', [...new Set(plan.out.map(r => r.metric))]).order('id', { ascending: true }));
    } catch (e) { return { error: (e && e.message) || String(e) }; }
    const rowsOut = [], keptTotal = new Set();
    plan.out.forEach((r, i) => {
      // the same page read again on a day it already gave keeps its first reading, and the preview says so
      // instead of offering a row the yes would then skip
      const mine = have.find(h => h.metric === r.metric && h.source_id === r.source_id);
      const other = have.find(h => h.metric === r.metric && h.source_id.endsWith('|' + plan.days[i]) && h.source_id !== r.source_id);
      if (mine || other) { if (/_total$/.test(r.metric)) keptTotal.add(r.metric + '|' + plan.days[i]); }
      if (mine) skipped.push({ metric: r.metric, day: plan.days[i], why: `already read on this page that day, as ${mine.value}, voided or not; to put another number on that day, use correct` });
      else if (other) skipped.push({ metric: r.metric, day: plan.days[i], why: `already read on ${other.source_id.slice(0, other.source_id.lastIndexOf('|'))} that day` });
      else rowsOut.push({ row: r, input: input[i], day: plan.days[i] });
    });
    // a day's change is worked out from the total this read would write; when that total is not written, neither is its change
    const offered = rowsOut.filter(x => {
      if (/_total$/.test(x.row.metric) || !keptTotal.has(x.row.metric + '_total|' + x.day)) return true;
      skipped.push({ metric: x.row.metric, day: x.day, why: `${x.row.metric}_total was already read that day, so this read's change is not that day's` });
      return false;
    });
    const shown = changes.filter(c => offered.some(x => x.input.metric === c.metric && x.input.occurred_at === c.occurred_at));
    return { page, rows: offered.map(x => x.row), input: offered.map(x => x.input), changes: shown.map(c => ({ metric: c.metric, value: c.value, from: c.from })), skipped };
  }

  server.tool(
    'record_page',
    'Write numbers read in the text of a web page the user is signed into, through Chrome or any browser tool. ' +
    'Every row is signed source chrome; you never choose the source. page is the address of the page they were read on; ' +
    'its query and fragment are dropped. source_id is the page and the ledger day, so the same page read twice on one day lands once. ' +
    'occurred_at is the date the page shows for the number when it shows one, else today; a number for a day not over yet is not written, even when the page puts a date on it, because the site\'s today can be the user\'s yesterday. value is exactly as the page shows it. ' +
    'A total that only grows (followers, views ever, lifetime sales) is passed with total true under the name of its daily change, ' +
    'like ig_followers: the tool keeps the total as ig_followers_total and works out the day\'s change from the day before; never subtract yourself. ' +
    'Call it first without yes: it returns the exact rows it would write, every change with what it was worked out from, and what it skips and why. ' +
    'Print all of it to the user as one table and call again with the same page and rows and yes true only after the user says yes.',
    {
      page: z.string().describe('the address of the page the numbers were read on'),
      rows: z.array(z.object({
        metric: z.string(),
        value: z.number(),
        unit: z.string().nullable(),
        occurred_at: z.string(),
        total: z.boolean().optional().describe('true when the page shows a running total, named for its daily change')
      })).min(1),
      yes: z.boolean().optional().describe('true only after the user said yes to the table this tool returned')
    },
    async ({ page, rows, yes }) => {
      const at = pageOf(page);
      if (!at) return text({ error: 'nothing written', why: 'page must be the http or https address of the page the numbers were read on' });
      await signIn();
      const plan = await pagePlan(at, rows);
      if (plan.error) return text(plan);
      if (!yes) return text({ would_write: plan.rows, changes: plan.changes, skipped: plan.skipped,
        say: 'Nothing written yet. Print these rows, the changes and what was skipped as one table, and call again with yes true only after the user says yes.' });
      if (!plan.input.length) return text({ written: [], skipped: plan.skipped });
      const out = await writeReadings(plan.input, WRITERS.chrome, { page: at, read: 'text' });
      const again = (out.skipped || []).map(r => ({ metric: r.metric, day: r.source_id.slice(r.source_id.lastIndexOf('|') + 1), why: 'already read on this page that day' }));
      return text({ ...out, skipped: [...again, ...plan.skipped] });
    }
  );

  server.tool(
    'estimate',
    'Write numbers you read off a picture yourself: one events row each, event_type measurement, ' +
    'source photo and never claude, and context naming the model that read them and what it read. ' +
    'Every metric name must end _est, and a row whose name does not is refused along with the rest of ' +
    'the call. source_id is the metric and the ledger day joined by a colon, so the same estimate twice ' +
    'lands once; an estimate never lands on top of a measurement, because the source is part of that ' +
    'question. occurred_at is a timestamp with its zone, or a date, handled exactly as record handles it. ' +
    'If any row cannot be read, nothing is written; print every row to the user and get a yes before ' +
    'calling this. An estimate is not a measurement: a number the user gave you goes through record, a ' +
    'number you read goes through this, and never the other way round. A wrong estimate is fixed by reading the ' +
    'picture again, never by a typed number. When a day already holds an estimate and you read it again with ' +
    'another value, or that day is voided or stale, nothing is written for that row: the answer lists it under ' +
    'read_again, each with the row and the new value to print. Print them to the user and wait for a yes; then call ' +
    'this again with those rows, the same model and read, and yes true: that writes one correction row per row, ' +
    'signed photo, naming the model, and the latest one per stock and day wins. A wrong one is read again, latest ' +
    'wins, so a yes is enough. The earlier reading stays in the ledger with the model that read it.',
    {
      rows: z.array(z.object({
        metric: z.string(),
        value: z.number(),
        unit: z.string().nullable(),
        occurred_at: z.string()
      })).min(1),
      model: z.string().describe('the model that read the picture, as exactly as you can name it'),
      read: z.enum(['photo', 'screenshot']).describe('what was read'),
      yes: z.boolean().optional().describe('only when reading days again, after the user said yes to the read_again rows')
    },
    async ({ rows, model, read, yes }) => {
      if (!yes) {
        const out = await writeReadings(rows, WRITERS.estimate, { model, read });
        if (out.error || !out.skipped || !out.skipped.length) return text(out);
        // a day already holding an estimate: if the picture now reads another value, or the day is voided or stale,
        // offer to read it again. A row skipped because this same call wrote its day first was never in the ledger
        const wrote = new Set(out.written.map(r => r.metric + '|' + r.source_id));
        const back = out.skipped.filter(r => !wrote.has(r.metric + '|' + r.source_id));
        const days = back.map(r => r.source_id.slice(r.metric.length + 1));
        // the rows have landed by now, so a day that cannot be read again never hides what was written
        let again;
        try { again = back.length ? await readAgain(back, days, model) : []; }
        catch (e) { return text({ ...out, why: `written and skipped are as listed; whether the skipped days read another value could not be read: ${(e && e.message) || e}` }); }
        return text(!again.length ? out : {
          ...out, read_again: again,
          say: 'these days already held an estimate before this call, and it reads another value, or the day is voided ' +
               'or stale, so nothing was written for them. Print each row and its new value to the user and wait for a ' +
               'yes; then call estimate again with those rows, the same model and read, and yes true.'
        });
      }
      // reading days again: every row an estimate already in the ledger for its stock and day, all of them or none
      const got = await readingsOf(rows, WRITERS.estimate, { model, read });
      if (got.error) return text(got);
      const keys = got.out.map(r => r.metric + '|' + r.source_id);
      if (new Set(keys).size !== keys.length) return text({ error: 'nothing written', why: 'a stock and day is named twice' });
      const { data: have, error } = await db.from('events').select('metric, source_id').eq('source', 'photo').eq('event_type', 'measurement')
        .in('source_id', got.out.map(r => r.source_id)).limit(20000);
      if (error) return text({ error: 'nothing written', why: error.message });
      const held = new Set(have.map(h => h.metric + '|' + h.source_id));
      let found;
      try { found = await readAgain(got.out, got.days, model); }
      catch (e) { return text({ error: 'nothing written', why: (e && e.message) || String(e) }); }
      const byKey = new Map(found.map(f => [f.metric + '|' + f.day, f]));
      const refused = [];
      got.out.forEach((row, i) => {
        const day = got.days[i];
        if (!held.has(keys[i])) refused.push({ metric: row.metric, day, why: 'no estimate on that day to read again: call estimate without yes' });
        else if (!byKey.has(row.metric + '|' + day)) refused.push({ metric: row.metric, day, why: found.missing.includes(day) ? 'no reading on that day' : `already reads ${row.value}` });
      });
      if (refused.length) return text({ error: 'nothing written', refused });
      const extra = { model, read }, written = [];
      for (let i = 0; i < got.out.length; i++) {
        const row = got.out[i], day = got.days[i], again = byKey.get(row.metric + '|' + day);
        const { error: e2 } = await R.writeCorrection(asPhoto, row.metric, day, row.value, again.reads, again.readings, extra);
        if (e2) return text({ error: e2.message, written });
        written.push({ metric: row.metric, event_type: 'correction', source: 'photo',
                       context: { metric: row.metric, day, value: row.value, was: again.reads, readings: again.readings, ...extra },
                       read_by: again.read_by });
      }
      return text({ written });
    }
  );

  server.tool(
    'did',
    'Write a commit the user gave: something done, with a start and an optional end, ' +
    'as dates. The rows are the rows commit.html writes, signed claude: a commit row, ' +
    'and a commit_end row when to is given. A commit that already exists and is still ' +
    'running is ended with a commit_end row alone; print the row to the user and get ' +
    'a yes before calling this.',
    { name: z.string(), from: z.string(), to: z.string().optional() },
    async ({ name, from, to }) => {
      const title = name.trim(), id = R.slugCommit(title);
      if (!slug(title)) return text({ error: 'no name' });
      if (!isDay(from)) return text({ error: 'from is not a date, YYYY-MM-DD' });
      if (to !== undefined && !isDay(to)) return text({ error: 'to is not a date, YYYY-MM-DD' });
      if (from > lastDay()) return text({ error: 'the start is in the future' });
      if (to && to < from) return text({ error: 'the end is before the start' });
      await signIn();
      const endRow = () => ({ occurred_at: new Date(to + 'T12:00:00Z').toISOString(), metric: id,
                              event_type: 'commit_end', source: 'claude', context: { to } });
      const have = (await R.readCommits(db, await ledgerDay())).find(c => c.id === id);
      if (have) {
        if (!to) return text({ error: `${id} exists` });
        if (have.to) return text({ error: `${id} already ended ${have.to}` });
        if (have.from !== from) return text({ error: `${id} started ${have.from}, not ${from}` });
        const end = endRow();
        const { error } = await db.from('events').insert(end);
        return text(error ? { error: error.message } : { written: [end] });
      }
      const start = { occurred_at: new Date(from + 'T12:00:00Z').toISOString(), metric: id,
                      event_type: 'commit', source: 'claude', context: { name: title, from } };
      const { error } = await db.from('events').insert(start);
      if (error) return text({ error: error.message });
      if (!to) return text({ written: [start] });
      const end = endRow();
      const { error: e2 } = await db.from('events').insert(end);
      return text(e2 ? { error: e2.message, written: [start] } : { written: [start, end] });
    }
  );

  server.tool(
    'rule',
    'Write which way is better for one stock the user named: up, down, band with lo ' +
    'and hi, or ignore. The latest rule wins and the old ones stay on the record. ' +
    'Written through writeRule, signed claude; print the rule to the user and get a ' +
    'yes before calling this.',
    {
      metric: z.string(),
      rule: z.object({
        kind: z.enum(['up', 'down', 'band', 'ignore']),
        lo: z.number().optional(),
        hi: z.number().optional()
      })
    },
    async ({ metric, rule }) => {
      await signIn();
      if (!(await R.readMetrics(db)).includes(metric)) return text({ error: `no stock called ${metric}` });
      let r = { kind: rule.kind };
      if (rule.kind === 'band') {
        if (!Number.isFinite(rule.lo) || !Number.isFinite(rule.hi) || rule.hi <= rule.lo)
          return text({ error: 'a band needs lo and hi, with hi above lo' });
        r = { kind: 'band', lo: rule.lo, hi: rule.hi };
      }
      const { error } = await R.writeRule(asClaude, metric, r);
      return text(error ? { error: error.message }
                        : { written: { metric, event_type: 'rule', source: 'claude', context: r } });
    }
  );

  server.tool(
    'goal',
    'Write a goal the user gave: a name, the stocks it is made of, optionally a target on one stock, ' +
    '{ metric, value } or { metric, lo, hi }, and optionally levers, [{ metric, lag }]: stocks the user ' +
    `moves, each read ${R.LAGS.join(' or ')} days later against the goal's measures, never one of those ` +
    'measures. Declaring a name again replaces the whole goal, its levers too, and the old row stays on ' +
    'the record: read goals first, and name again every lever the goal keeps. Every lever and lag a goal ' +
    'has ever named raises the bar for all of them, so a lever is never tried and dropped for free. ' +
    'Written through writeGoal, signed claude; print the goal with its levers to the user and get a yes ' +
    'before calling this.',
    {
      name: z.string(),
      measures: z.array(z.string()).min(1),
      target: z.object({
        metric: z.string(),
        value: z.number().optional(),
        lo: z.number().optional(),
        hi: z.number().optional()
      }).optional(),
      levers: z.array(z.object({ metric: z.string(), lag: z.number() })).optional()
    },
    async ({ name, measures, target, levers = [] }) => {
      const title = name.trim();
      if (!slug(title)) return text({ error: 'no name' });
      if (new Set(measures).size !== measures.length) return text({ error: 'a measure is named twice' });
      // readGoals keeps a lever only once, only at a lag it reads, and never one of the goal's own
      // measures. Anything else would be written and then quietly not read, so it is refused here
      if (new Set(levers.map(l => l.metric)).size !== levers.length) return text({ error: 'a lever is named twice' });
      const own = levers.filter(l => measures.includes(l.metric));
      if (own.length) return text({ error: 'a lever is never one of the goal\'s own measures', refused: own });
      const lagless = levers.filter(l => !R.LAGS.includes(l.lag));
      if (lagless.length) return text({ error: `a lever is read ${R.LAGS.join(' or ')} days later`, refused: lagless });
      await signIn();
      const all = await R.readMetrics(db);
      const unknown = [...measures, ...levers.map(l => l.metric)].filter(m => !all.includes(m));
      if (unknown.length) return text({ error: 'no stock called ' + unknown.join(', ') });
      let t;
      if (target) {
        if (!all.includes(target.metric)) return text({ error: `no stock called ${target.metric}` });
        const band = target.lo !== undefined || target.hi !== undefined;
        if (!band && Number.isFinite(target.value)) t = { metric: target.metric, value: target.value };
        else if (band && target.value === undefined && Number.isFinite(target.lo) && Number.isFinite(target.hi) && target.hi > target.lo)
          t = { metric: target.metric, lo: target.lo, hi: target.hi };
        else return text({ error: 'a target is { metric, value } or { metric, lo, hi } with hi above lo' });
      }
      // The levers are the ones the user said yes to, and a declaration replaces the whole goal. Any the
      // goal had before and this row does not name are said in the answer, so none leaves in silence
      const prev = (await R.readGoals(db)).find(g => g.id === R.slugCommit(title));
      const dropped = prev ? prev.levers.filter(p => !levers.some(l => l.metric === p.metric && l.lag === p.lag)) : [];
      const { error } = await R.writeGoal(asClaude, title, measures, t, levers);
      const context = { name: title, measures, ...(t ? { target: t } : {}), ...(levers.length ? { levers } : {}) };
      return text(error ? { error: error.message }
                        : { written: { metric: R.slugCommit(title), event_type: 'goal', source: 'claude', context }, ...(dropped.length ? { dropped } : {}) });
    }
  );

  server.tool(
    'void',
    'Stop counting one reading, or count it again. It removes nothing: it writes one void row, and the ' +
    'latest void row per stock and day wins, as rules do. A voided reading is in no series, no index, not in ' +
    'YOU, in no goal and in no scan, and the baseline rebuilds from the readings that remain, so a stock can ' +
    'start clean without changing its name. Call it first with no confirm: it answers with the reading it ' +
    'would void and the phrase that voids it. Print those two lines to the user exactly as they are. Nothing ' +
    'is written until the user sends that phrase back and you pass it as confirm. A yes is not enough: ' +
    'writing a row costs a yes, voiding one costs typing the number back, so it cannot happen by accident or ' +
    'by a misread. Signed claude. voided false counts the reading again, the same way.',
    { metric: z.string(), day: z.string(), voided: z.boolean().optional(), confirm: z.string().optional() },
    async ({ metric, day, voided = true, confirm }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return text({ error: `a day is a date like 2026-09-15, not ${day}` });
      const { rows, voids } = await load();
      const r = R.readingOn(rows, metric, day);
      if (!r) return text({ error: `no reading of ${metric} on ${day}: nothing to ${voided ? 'void' : 'count again'}` });
      if (R.voidedOn(voids, metric, day) === voided)
        return text({ error: `${metric} on ${day} is already ${voided ? 'voided' : 'counted'}` });
      // the number in the phrase is the reading as the day reads it, corrected if it was. typing it back is the yes
      const value = R.correctedOn(voids, metric, day) ?? Number(r.mean);
      const phrase = `${voided ? 'void' : 'unvoid'} ${metric} ${value} on ${day}`;
      // the phrase exactly, give or take the spacing and the capital a keyboard adds
      const said = String(confirm == null ? '' : confirm).trim().replace(/\s+/g, ' ').toLowerCase();
      if (said !== phrase) return text({
        metric, day, value, readings: Number(r.readings),
        print: `${metric}  ${value}  ${day}\nto ${voided ? 'void this' : 'count this again'}, send: ${phrase}`,
        say: 'print the two lines in print to the user, exactly as they are, and nothing else. Write nothing ' +
             'until the user sends that phrase back; then call void again with confirm set to what they sent.'
      });
      const { error } = await R.writeVoid(asClaude, metric, day, voided);
      return text(error ? { error: error.message }
                        : { written: { metric, event_type: 'void', source: 'claude', context: { metric, day, voided } },
                            [voided ? 'not_counted' : 'counted_again']: { metric, value, day } });
    }
  );

  server.tool(
    'start',
    'Say which day a stock\'s baseline is taken from, when its first readings came from something the stock ' +
    'no longer is: a channel six people a day watched and the same channel with thousands share a column, a ' +
    'unit and nothing else. The first thirty readings decide how big one index point is, so when those thirty ' +
    'came from the old thing, every reading since is drawn in a unit that measures nothing. Every reading ' +
    'stays as raw history. Readings before the start have no index and say why; readings on or after it ' +
    'use the new baseline when the index gate permits it. It writes one start row, latest per stock wins as a rule ' +
    'does, and a day before the stock\'s first reading puts the baseline back to the beginning. Call it first ' +
    'with no confirm: it answers with the raw reading and index, or the reason there is no index, before and ' +
    'after the proposed start at the stock\'s first and latest reading. Nothing is written ' +
    'until the user sends the phrase back.',
    { metric: z.string(), day: z.string(), confirm: z.string().optional() },
    async ({ metric, day, confirm }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return text({ error: `a day is a date like 2026-05-01, not ${day}` });
      const { rules, rows, voids, starts } = await load();
      if (!(metric in rules)) return text({ error: `no stock called ${metric}, or it has no rule yet` });
      const live = R.liveRows(rows, voids).filter(r => r.metric === metric);
      if (!live.length) return text({ error: `no reading of ${metric} counts, so it has no baseline to move` });
      const from = live.filter(r => r.day >= day).length;
      if (!from) return text({ error: `no reading of ${metric} falls on or after ${day}: a baseline cannot begin after the last reading` });
      if (starts[metric] === day) return text({ error: `${metric}'s baseline already begins on ${day}` });
      const one = st => R.rankSeries(rows, { [metric]: rules[metric] }, voids, st)[metric];
      const was = one(starts), now = one({ ...starts, [metric]: day });
      const at = (p, i) => {
        const reading = p && p[i];
        if (!reading) return null;
        const indexed = R.indexOn(p, reading.day);
        return { day: reading.day, value: reading.value, index: indexed ? indexed.rank : null,
                 ...(!indexed ? { why: reading.why || R.noIndexWhy(p) } : {}) };
      };
      const preview = p => p ? { first: at(p, 0), latest: at(p, p.length - 1), state: R.indexState(p),
                                start: p.start, baseline_readings: p.baselineCount } : null;
      const before = preview(was), after = preview(now);
      const shown = p => p ? `${p.day} reading ${p.value}; ${p.index == null ? 'no index: ' + p.why : 'index ' + p.index}` : 'no series';
      const phrase = `start ${metric} on ${day}`;
      const said = String(confirm == null ? '' : confirm).trim().replace(/\s+/g, ' ').toLowerCase();
      if (said !== phrase) return text({
        metric, day, baseline_from: now ? now.baselineCount : null, readings_kept: live.length,
        now: before,
        after,
        print: `${metric} baseline from ${day}\nevery reading stays as raw history; before the start there is no index\n`
             + `${before && after ? `first before: ${shown(before.first)}\nfirst after: ${shown(after.first)}\nlatest before: ${shown(before.latest)}\nlatest after: ${shown(after.latest)}\n` : ''}`
             + `to do this, send: ${phrase}`,
        say: 'print the lines in print to the user, exactly as they are, and nothing else. Write nothing until ' +
             'the user sends that phrase back; then call start again with confirm set to what they sent.'
      });
      const { error } = await R.writeStart(asClaude, metric, day);
      return text(error ? { error: error.message }
                        : { written: { metric, event_type: 'start', source: 'claude', context: { day } },
                            baseline_from: { metric, day, readings_kept: live.length } });
    }
  );

  server.tool(
    'correct',
    'Put the right number on a reading that was mistyped. It edits nothing and removes nothing: it writes one ' +
    'correction row, and the latest correction per stock and day wins, as rules do. From then on the day reads the ' +
    'new value in every series, index, goal and scan, a voided day counts again, and the old reading stays in the ' +
    'ledger, struck through, with the correction row saying what it replaced. It works off the day rows, not the ' +
    'stocks list: a voided reading, even a stock\'s only one, is still a row and still correctable, so call this ' +
    'with the stock and the day even when stocks does not show that stock. A correction holds while its day holds ' +
    'the readings it saw: if another reading lands on that day later, the day reads nothing until it is corrected ' +
    'again, because which number to count would be a guess. Call it first without yes: it writes nothing and answers ' +
    'with the row and the new value, or, when that stock has no reading on that day, with every reading the day holds, ' +
    'so the right stock can be named. Print the row and the new value to the user, wait for a yes, then call it again ' +
    'with yes true. A wrong correction is corrected again, latest wins, so a yes is enough. Only a number the user ' +
    'gave you, and never on an estimate: an _est reading was read off a picture, and a typed number is not that ' +
    'instrument; estimate reads the picture again instead. Signed claude.',
    { metric: z.string(), day: z.string(), value: z.number(), yes: z.boolean().optional() },
    async ({ metric, day, value, yes }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return text({ error: `a day is a date like 2026-09-15, not ${day}` });
      if (!Number.isFinite(value)) return text({ error: 'the value is not a number' });
      if (/_est$/.test(metric)) return text({ error: `${metric} is an estimate, read off a picture; a typed number does not correct it. Read the picture again through estimate` });
      // every day row the ledger holds, voided or not: a void never removes the row it stops counting
      const { rows, voids } = await load();
      const r = R.readingOn(rows, metric, day);
      if (!r) {
        const held = rows.filter(x => x.day === day).map(x => ({ metric: x.metric, reads: R.correctedOn(voids, x.metric, day) ?? Number(x.mean), voided: R.voidedOn(voids, x.metric, day), stale: R.staleOn(voids, x.metric, day, x.readings) }));
        return text({ error: `no reading of ${metric} on ${day}: nothing to correct`, ...(held.length ? { that_day: held } : {}) });
      }
      const was = R.correctedOn(voids, metric, day) ?? Number(r.mean), voided = R.voidedOn(voids, metric, day);
      const readings = Number(r.readings), stale = R.staleOn(voids, metric, day, readings);   // a reading landed after its last correction
      if (was === value && !voided && !stale) return text({ error: `${metric} on ${day} already reads ${value}` });
      if (!yes) return text({
        metric, day, reads: was, voided, stale, value, readings,
        print: `${metric}  ${was}  ${day}${voided ? '  voided' : ''}${stale ? '  a reading landed after its correction' : ''}\nmake it ${value}`,
        say: 'print the row and the new value to the user and wait for a yes. Nothing is written until you call correct ' +
             'again with the same stock, day and value and yes true.'
      });
      const { error } = await R.writeCorrection(asClaude, metric, day, value, was, readings);
      return text(error ? { error: error.message }
                        : { written: { metric, event_type: 'correction', source: 'claude', context: { metric, day, value, was, readings } },
                            corrected: { metric, day, was, now: value } });
    }
  );

  server.tool(
    'void_commit',
    'Stop counting one commit, or count it again. The same row as void and the same laws: it removes ' +
    'nothing, and the latest void row per commit wins. A voided commit is in no test, in no scan and not ' +
    'in WHAT MOVES IT, and it cannot collide with another commit. It stays in the ledger struck through ' +
    'and its name stays taken. A commit has no value to type back, so the phrase carries what names it ' +
    'instead, its name and its start. Call it first with no confirm: it answers with the commit it would ' +
    'void and the phrase that voids it. Print those two lines to the user exactly as they are. Nothing is ' +
    'written until the user sends that phrase back and you pass it as confirm. A yes is not enough. ' +
    'Signed claude. voided false counts the commit again, the same way.',
    { commit: z.string(), voided: z.boolean().optional(), confirm: z.string().optional() },
    async ({ commit, voided = true, confirm }) => {
      const { allCommits, cvoids } = await load({ day: true });
      const c = allCommits.find(x => x.id === commit || x.name === commit);
      if (!c) return text({ error: `no commit called ${commit}` });
      if (R.commitVoided(cvoids, c.id) === voided)
        return text({ error: `${c.name} is already ${voided ? 'voided' : 'counted'}` });
      // a commit has no reading to type back, so its name and its start are what the phrase carries
      const phrase = `${voided ? 'void' : 'unvoid'} commit ${c.name} from ${c.from}`;
      // the phrase exactly, give or take the spacing and the capital a keyboard adds
      const said = String(confirm == null ? '' : confirm).trim().replace(/\s+/g, ' ').toLowerCase();
      if (said !== phrase.toLowerCase()) return text({
        commit: c.name, from: c.from, to: c.to, days: c.days,
        print: `${c.name}  from ${c.from}${c.to ? ` to ${c.to}` : ''}\nto ${voided ? 'void this' : 'count this again'}, send: ${phrase}`,
        say: 'print the two lines in print to the user, exactly as they are, and nothing else. Write nothing ' +
             'until the user sends that phrase back; then call void_commit again with confirm set to what they sent.'
      });
      const { error } = await R.writeCommitVoid(asClaude, c, voided);
      return text(error ? { error: error.message }
                        : { written: { metric: c.id, event_type: 'void', source: 'claude',
                                       context: { commit: c.id, name: c.name, from: c.from, voided } },
                            [voided ? 'not_counted' : 'counted_again']: { commit: c.name, from: c.from } });
    }
  );

  // /youscan: the same scan the instructions describe, as a prompt. Claude Code shows it as /mcp__wire__youscan
  // (a typed /youscan is refused there before the model sees it); in the Claude app, where prompts are not
  // commands, the instructions carry it instead, which is not yet tested there.
  server.registerPrompt('youscan', {
    title: '/youscan',
    description: 'Read your own numbers off a page you are signed into, and see which can go in.',
    argsSchema: { site: z.string().optional().describe('A site name or a URL, like studio.youtube.com') }
  }, ({ site: target }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: youscan(target && target.trim() ? target.trim() : null, site) } }]
  }));
  return server;
}
