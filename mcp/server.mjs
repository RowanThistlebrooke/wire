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
import { code, feed, keys, table, version } from './health.mjs';

const { WIRE_EMAIL, WIRE_PASSWORD } = process.env;

// One source of truth. The browser loads this file with a script tag;
// here we read the same text and pull the functions out of it.
const src = readFileSync(new URL('../you-reader.js', import.meta.url), 'utf8');
const R = new Function(src + `
  return { readMetrics, readRules, readDays, readDay, isDate, lastDay, readWhen, momentOn, readingKey, rankSeries, etfSeries,
           readCommits, testCommit, dayNum, slugCommit,
           readGoals, goalSeries, weakPoint, writeRule, writeGoal,
           readVoids, writeVoid, readingOn, voidedOn, liveRows, correctedOn, staleOn, writeCorrection,
           readCommitVoids, writeCommitVoid, commitVoided, liveCommits,
           indexState, BASELINE, LAGS,
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
  const [today, all, rules, voids, cvoids] = await Promise.all([day ? ledgerDay() : null, R.readMetrics(db), R.readRules(db), R.readVoids(db, ledgerDay), R.readCommitVoids(db)]);
  const [allCommits, rows] = await Promise.all([day ? R.readCommits(db, today) : null, R.readDays(db, all)]);
  const series = R.rankSeries(rows, rules, voids);
  // every question about commits is asked of the ones that count. The whole list is kept beside it, so a
  // voided commit can still be named and counted again, and so its name is still taken.
  const commits = allCommits && R.liveCommits(allCommits, cvoids);
  return { all, rules, commits, allCommits, cvoids, series, rows, today, voids };
}

const text = o => ({ content: [{ type: 'text', text: JSON.stringify(o, null, 2) }] });

// Notes are rows with event_type 'note'. They never appear on a page and
// never enter the maths. A note you wrote on the pad (source 'you') always
// beats one the AI wrote (source 'claude'), whatever the date.
async function readNotes(subject) {
  await signIn();
  let q = db.from('events')
    .select('metric, source, occurred_at, context')
    .eq('event_type', 'note')
    .order('occurred_at', { ascending: true })
    .limit(20000);
  if (subject !== undefined) q = q.eq('metric', R.slugCommit(subject));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data.map(r => ({
    metric: r.metric, source: r.source, occurred_at: r.occurred_at,
    text: (r.context || {}).text ?? null
  }));
}

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
// Shortcut sends through /api/at is a measurement too, signed shortcut, and
// never under an estimate's name.
//
// An estimate and a measurement must never share a name or a source. The
// instrument drifts between models and does not reproduce, and the table has
// no delete, so a series that mixes the two can never be untangled again.
// Named here, once, so the source and the name rule cannot drift apart from
// what the doors do.
export const WRITERS = {
  record: { source: 'claude', name: null },
  estimate: {
    source: 'photo',
    name: m => /_est$/.test(m) ? null : 'an estimate\'s metric name must end _est, so it can never be taken for something measured'
  },
  shortcut: {
    source: 'shortcut',
    name: m => /_est$/.test(m) ? 'a name ending _est is an estimate\'s, and a shortcut sends what was measured' : null
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
    source: writer.source, source_id: R.readingKey(x.metric, days[i]), event_type: 'measurement',
    ...(context ? { context } : {})
  }));
  return { out, days };
}

export async function writeReadings(rows, writer, context = null) {
  const got = await readingsOf(rows, writer, context);
  if (got.error) return got;
  const { out } = got;

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
// day reads now, the model that read that value when a picture made it, and the phrase that puts the new reading
// in its place. rows are estimate rows as readingsOf builds them, days their ledger days. A day already reading the
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
      const { data, error } = await db.from('events').select('event_type, source, source_id, context, occurred_at')
        .eq('metric', row.metric).or('source.eq.photo,event_type.eq.correction').order('occurred_at', { ascending: true }).limit(20000);
      if (error) throw new Error(error.message);
      photo.set(row.metric, data);
    }
    const mine = photo.get(row.metric), ctx = e => e.context || {};
    const fix = R.correctedOn(voids, row.metric, day) !== undefined
      ? mine.filter(e => e.event_type === 'correction' && ctx(e).day === day).pop()
      : null;
    const made = fix ? (fix.source === 'photo' ? fix : null)
      : readings === 1 ? mine.find(e => e.event_type === 'measurement' && e.source === 'photo' && e.source_id === row.source_id) : null;
    const by = made && typeof ctx(made).model === 'string' ? ctx(made).model : null;
    const phrase = `re-estimate ${row.metric} ${row.value} on ${day}`;
    out.push({
      metric: row.metric, day, reads, read_by: by, voided, stale, value: row.value, model, readings, phrase,
      print: `${row.metric}  ${reads}  ${day}${by ? `  read by ${by}` : ''}${voided ? '  voided' : ''}${stale ? '  a reading landed after its correction' : ''}\n` +
             `to make it ${row.value}, read by ${model}, send: ${phrase}`
    });
  }
  return out;
}

// A fresh server with every tool on it. stdio makes one for the life of the
// process; HTTP makes one per request, as a stateless server must.
export function wireServer() {
  // mcp/MCP.md holds these laws, and a file in a repo is read by nobody. The ones that govern
  // writing travel with the server instead, so every session opens with them, a buyer's as much
  // as this one. Kept short on purpose: it is sent every time.
  const server = new McpServer({ name: 'wire', version: version() || '0.0.0' }, {
    instructions:
      'The Wire is a personal ledger, and it is append only: a row can be added, never edited and ' +
      'never removed. Print every row before you write it and wait for a yes. Transcribe only: ' +
      'never estimate, round, fill or infer a number, and say so plainly when one cannot be read. ' +
      'Silence over a guess, everywhere. Read the ledger before asking for anything already in it. ' +
      'When the user asks to track something new, read the ledger first and say whether a stock ' +
      'already carries that fact, naming it and why in one line: a new metric is a cost, not a free ' +
      'addition. ' +
      'Voiding and correcting cost more than a yes: print the phrase the tool gives you, exactly as it is, and ' +
      'write only once the user sends that phrase back. A number the user gave you goes through ' +
      'record. A number you read off a picture goes through estimate, which signs it photo and needs ' +
      'a name ending _est. Never the other way round. A wrong estimate is read again through estimate, never ' +
      'corrected by a typed number.'
  });

  server.tool(
    'health',
    'Whether this wire is up to date, its table is the right shape, its settings are in place, and it is ' +
    'still being fed. code compares this copy\'s version with the one on GitHub. table checks the columns ' +
    'the code reads, day_of and day_metrics, names what is missing or the wrong shape, and hands over the ' +
    'exact SQL that puts it right, to run in the Supabase SQL editor. keys names the settings that are not ' +
    'set, never a value. feed names every door that writes into the ledger, how many days behind its newest ' +
    'row is, and whether that is the lag the door promises or a cable that has stopped. The first three say ' +
    'whether this copy is built correctly; feed says whether anything is still coming in. It writes nothing.',
    {},
    async () => {
      const k = keys();
      const ledger = !k.wrong && k.missing.every(n => n === 'WIRE_TOKEN');
      const unchecked = { ok: null, say: 'not checked until the keys are set' };
      // a trailing catch, not then's second argument: that one only sees signIn fail, never the read after it
      const [c, t, f] = await Promise.all([
        code(),
        ledger ? signIn().then(() => table(db), e => ({ ok: null, error: e.message })) : unchecked,
        ledger ? signIn().then(async () => feed(R.feedOf(await R.readFeeds(db)))).catch(e => ({ ok: null, error: e.message })) : unchecked
      ]);
      const { sql, ...rest } = t;
      const out = text({ code: c, table: sql ? { ...rest, sql: 'the next block, exact' } : rest, keys: k, feed: f });
      if (sql) out.content.push({ type: 'text', text: sql });
      return out;
    }
  );

  server.tool(
    'stocks',
    'What you measure, which way is better, and where each one stands today. ' +
    '100 is the person you were across your first thirty readings.',
    {},
    async () => {
      const { all, rules, series } = await load();
      const out = Object.keys(series).map(m => {
        const p = series[m];
        const last = p[p.length - 1];
        return {
          metric: m,
          rule: rules[m],
          days: p.length,
          latest_reading: last.value,
          index: R.indexState(p) === 'none' ? null : last.rank,
          index_state: R.indexState(p),
          note: R.indexState(p) === 'none' ? 'no index yet: this stock\'s baseline has no spread, so there is nothing to score a reading against'
              : R.indexState(p) === 'moving' ? `baseline still filling, ${p.length} of ${R.BASELINE}: this index will move`
              : undefined
        };
      });
      const undeclared = all.filter(m => !(m in rules));
      return text({ you: R.etfSeries(series, Object.keys(series)).slice(-1)[0] || null,
                    stocks: out, undeclared });
    }
  );

  server.tool(
    'history',
    'The day by day readings for one metric, oldest first.',
    { metric: z.string(), days: z.number().optional() },
    async ({ metric, days = 60 }) => {
      const { series } = await load();
      const p = series[metric];
      if (!p) return text({ error: `no stock called ${metric}, or it has no rule yet` });
      return text({ metric, points: p.slice(-days) });
    }
  );

  server.tool(
    'goals',
    'What the stocks are for. Each goal is YOU drawn over only its own ' +
    'measures, 100 at your usual across the first thirty readings. The weak ' +
    'point is the measure with the lowest index right now.',
    {},
    async () => {
      const { series } = await load();
      const goals = await R.readGoals(db);
      return text({
        goals: goals.map(g => {
          const p = R.goalSeries(g, series);
          const last = p[p.length - 1];
          const weak = R.weakPoint(g, series);
          return {
            goal: g.name,
            id: g.id,
            index: R.indexState(p) === 'none' || !last ? null : last.rank,
            index_state: R.indexState(p),
            note: !g.measures.some(m => series[m]) ? 'no measure has a rule yet'
                : R.indexState(p) === 'none' ? 'no index yet: this line has no spread, so there is nothing to score a day against'
                : R.indexState(p) === 'moving' ? `baseline still filling, ${p.length} of ${R.BASELINE}: this index will move`
                : undefined,
            day: last ? last.day : null,
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
      const { commits, series, today } = await load({ day: true });
      const c = commits.find(x => x.id === commit || x.name === commit);
      if (!c) return text({ error: `no commit called ${commit}` });
      const points = metric === 'YOU'
        ? R.etfSeries(series, Object.keys(series))
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
      const rows = await readNotes(subject);
      if (subject !== undefined) {
        return text({ subject: R.slugCommit(subject), notes: rows });
      }
      // rows arrive oldest first, so a later row of equal standing replaces
      // an earlier one. a 'you' row is never replaced by a 'claude' row.
      const latest = {};
      for (const r of rows) {
        const cur = latest[r.metric];
        if (!cur || r.source === 'you' || cur.source !== 'you') latest[r.metric] = r;
      }
      return text({ notes: Object.values(latest) });
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
        l.cells[o] = { ...rest, pairs: pairs.length };
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
    'Never call it with a value you were not given.',
    {
      rows: z.array(z.object({
        metric: z.string(),
        value: z.number(),
        unit: z.string().nullable(),
        occurred_at: z.string()
      })).min(1)
    },
    async ({ rows }) => text(await writeReadings(rows, WRITERS.record))
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
    'read_again with two lines to print ' +
    'and a phrase that carries the new value. Print those lines to the user exactly as they are. Only when the ' +
    'user sends a phrase back, call this again with that one row, the same model and read, and confirm set to what ' +
    'they sent: that writes one correction row signed photo, naming the model, and the latest one per stock and day ' +
    'wins. The earlier reading stays in the ledger with the model that read it. A yes is not enough.',
    {
      rows: z.array(z.object({
        metric: z.string(),
        value: z.number(),
        unit: z.string().nullable(),
        occurred_at: z.string()
      })).min(1),
      model: z.string().describe('the model that read the picture, as exactly as you can name it'),
      read: z.enum(['photo', 'screenshot']).describe('what was read'),
      confirm: z.string().optional().describe('only when reading a day again: the phrase the user sent back')
    },
    async ({ rows, model, read, confirm }) => {
      if (confirm === undefined) {
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
               'or stale, so nothing was written for them. Print ' +
               'each print to the user exactly as it is. Write nothing more until the user sends a phrase back; then call ' +
               'estimate again with that one row, the same model and read, and confirm set to what they sent.'
        });
      }
      // reading a day again: one row, an estimate already in the ledger for its stock and day, and the phrase typed back
      if (rows.length !== 1) return text({ error: 'reading a day again takes one row and its phrase' });
      const got = await readingsOf(rows, WRITERS.estimate, { model, read });
      if (got.error) return text(got);
      const row = got.out[0], day = got.days[0];
      const { data: have, error } = await db.from('events').select('source_id').eq('source', 'photo')
        .eq('metric', row.metric).eq('source_id', row.source_id).eq('event_type', 'measurement').limit(1);
      if (error) return text({ error: error.message });
      if (!have.length) return text({ error: `no estimate of ${row.metric} on ${day} to read again: call estimate without confirm` });
      let found;
      try { found = await readAgain([row], [day], model); }
      catch (e) { return text({ error: 'nothing written', why: (e && e.message) || String(e) }); }
      const again = found[0];
      if (!again) return text({ error: found.missing.length ? `no reading of ${row.metric} on ${day}: nothing to read again` : `${row.metric} on ${day} already reads ${row.value}` });
      // the phrase exactly, give or take the spacing and the capital a keyboard adds
      const said = String(confirm).trim().replace(/\s+/g, ' ').toLowerCase();
      if (said !== again.phrase.toLowerCase()) return text({
        ...again,
        say: 'print the two lines in print to the user, exactly as they are, and nothing else. Write nothing until the ' +
             'user sends that phrase back; then call estimate again with this row, the same model and read, and confirm.'
      });
      const extra = { model, read };
      const { error: e2 } = await R.writeCorrection(asPhoto, row.metric, day, row.value, again.reads, again.readings, extra);
      return text(e2 ? { error: e2.message } : {
        written: { metric: row.metric, event_type: 'correction', source: 'photo',
                   context: { metric: row.metric, day, value: row.value, was: again.reads, readings: again.readings, ...extra } },
        read_again: { metric: row.metric, day, was: again.reads, read_by: again.read_by, now: row.value, model }
      });
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
    'correct',
    'Put the right number on one reading that was mistyped. It edits nothing and removes nothing: it writes one ' +
    'correction row, and the latest correction per stock and day wins, as rules do. From then on the day reads the ' +
    'new value in every series, index, goal and scan, a voided day counts again, and the old reading stays in the ' +
    'ledger, struck through, with the correction row saying what it replaced. A correction holds while its day ' +
    'holds the readings it saw: if another reading lands on that day later, the day reads nothing until it is ' +
    'corrected again, because which number to count would be a guess. Call it first with no confirm: it ' +
    'answers with the reading it would replace and the phrase that corrects it, which carries the new value. Print ' +
    'those two lines to the user exactly as they are. Nothing is written until the user sends that phrase back and ' +
    'you pass it as confirm. A yes is not enough: the new number is typed back, so it cannot be written by accident ' +
    'or by a misread. Only a number the user gave you, and never on an estimate: an _est reading was read off a ' +
    'picture, and a typed number is not that instrument; estimate reads the picture again instead. Signed claude.',
    { metric: z.string(), day: z.string(), value: z.number(), confirm: z.string().optional() },
    async ({ metric, day, value, confirm }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return text({ error: `a day is a date like 2026-09-15, not ${day}` });
      if (!Number.isFinite(value)) return text({ error: 'the value is not a number' });
      if (/_est$/.test(metric)) return text({ error: `${metric} is an estimate, read off a picture; a typed number does not correct it. Read the picture again through estimate` });
      const { rows, voids } = await load();
      const r = R.readingOn(rows, metric, day);
      if (!r) return text({ error: `no reading of ${metric} on ${day}: nothing to correct` });
      const was = R.correctedOn(voids, metric, day) ?? Number(r.mean), voided = R.voidedOn(voids, metric, day);
      const readings = Number(r.readings), stale = R.staleOn(voids, metric, day, readings);   // a reading landed after its last correction
      if (was === value && !voided && !stale) return text({ error: `${metric} on ${day} already reads ${value}` });
      // the phrase carries the new value, because that is the number the user has to type
      const phrase = `correct ${metric} ${value} on ${day}`;
      // the phrase exactly, give or take the spacing and the capital a keyboard adds
      const said = String(confirm == null ? '' : confirm).trim().replace(/\s+/g, ' ').toLowerCase();
      if (said !== phrase.toLowerCase()) return text({
        metric, day, reads: was, voided, stale, value, readings,
        print: `${metric}  ${was}  ${day}${voided ? '  voided' : ''}${stale ? '  a reading landed after its correction' : ''}\nto make it ${value}, send: ${phrase}`,
        say: 'print the two lines in print to the user, exactly as they are, and nothing else. Write nothing ' +
             'until the user sends that phrase back; then call correct again with confirm set to what they sent.'
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

  return server;
}
