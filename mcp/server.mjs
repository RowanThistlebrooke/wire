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
import { code, keys, table, version } from './health.mjs';

const { WIRE_EMAIL, WIRE_PASSWORD } = process.env;

// One source of truth. The browser loads this file with a script tag;
// here we read the same text and pull the functions out of it.
const src = readFileSync(new URL('../you-reader.js', import.meta.url), 'utf8');
const R = new Function(src + `
  return { readMetrics, readRules, readDays, readDay, rankSeries, etfSeries,
           readCommits, testCommit, dayNum, slugCommit,
           readGoals, goalSeries, weakPoint, writeRule, writeGoal,
           scanLead, scanCommit, crossTest, crossGrid };`)();

// The client is made on the first question, not on import, so a server
// whose settings are missing still starts and answers with why.
let db = null;

// writeRule and writeGoal sign their rows 'you', as the pages do. A row
// that comes in through here is Claude's, so it goes in signed 'claude'.
const asClaude = {
  from: table => ({ insert: row => db.from(table).insert({ ...row, source: 'claude' }) })
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
// A moment that day_of puts on this date, or null. Noon UTC, as commits are, unless the ledger's day
// there is another date, as it is west of UTC-6, where noon UTC is still before 6am: then 8pm UTC if
// noon was the day before, 4am UTC if it was the day after. day_of confirms the one it gives.
async function momentOn(date) {
  const at = h => new Date(Date.parse(date + 'T00:00:00Z') + h * 3600e3).toISOString();
  const noon = at(12), d = await ledgerDay(noon);
  if (d === date) return noon;
  const other = at(d < date ? 20 : 4);
  return (await ledgerDay(other)) === date ? other : null;
}

// The readers come first. The writers are at the end. The ledger's day and the commits are read only
// for the questions that use them, so a question about stocks never waits on day_of or fails with it.
async function load({ day = false } = {}) {
  await signIn();
  const [today, all, rules] = await Promise.all([day ? ledgerDay() : null, R.readMetrics(db), R.readRules(db)]);
  const [commits, rows] = await Promise.all([day ? R.readCommits(db, today) : null, R.readDays(db, all)]);
  const series = R.rankSeries(rows, rules);
  return { all, rules, commits, series, rows, today };
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

const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
// a timestamp must say its zone; a bare clock time would be a guess at one
const isStamp = s => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s) && Number.isFinite(Date.parse(s));
// the pad's name rule: lower case, anything else an underscore
const slug = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
// the latest date that is today somewhere on Earth: the date at UTC+14, the zone furthest ahead. A date
// past it is in the future for everyone; a date up to it is someone's today or already past
const lastDay = () => new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10);
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

// A fresh server with every tool on it. stdio makes one for the life of the
// process; HTTP makes one per request, as a stateless server must.
export function wireServer() {
  const server = new McpServer({ name: 'wire', version: version() || '0.0.0' });

  server.tool(
    'health',
    'Whether this wire is up to date, its table is the right shape, and its settings are in place. ' +
    'code compares this copy\'s version with the one on GitHub. table checks the columns the code reads, ' +
    'day_of and day_metrics, names what is missing or the wrong shape, and hands over the exact SQL that ' +
    'puts it right, to run in the Supabase SQL editor. keys names the settings that are not set, never a ' +
    'value. It writes nothing.',
    {},
    async () => {
      const k = keys();
      const ledger = !k.wrong && k.missing.every(n => n === 'WIRE_TOKEN');
      const [c, t] = await Promise.all([
        code(),
        ledger ? signIn().then(() => table(db), e => ({ ok: null, error: e.message }))
               : { ok: null, say: 'not checked until the keys are set' }
      ]);
      const { sql, ...rest } = t;
      const out = text({ code: c, table: sql ? { ...rest, sql: 'the next block, exact' } : rest, keys: k });
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
          index: p.length >= 14 ? last.rank : null,
          note: p.length >= 14 ? undefined : 'under 14 days, no index yet'
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
            index: p.length >= 14 && last ? last.rank : null,
            note: !g.measures.some(m => series[m]) ? 'no measure has a rule yet'
                : p.length >= 14 ? undefined : 'under 14 days, no index yet',
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
      const { commits } = await load({ day: true });
      return text({ commits });
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
    'days later: after the days the lever read above its usual for that weekday, against after the days ' +
    'it read below, each day weighted by how far it was from usual. A scan: leads at a raised bar, never ' +
    'findings. before means the outcome already differed on the lever\'s own day, so this lever cannot be ' +
    'told apart from it. highMean and lowMean are the plain average outcome after the high days and after ' +
    'the low days; effect is what decides, and for a lever with more than two values it is larger than ' +
    'their gap. A habit that always falls on the same weekdays never reads as a lead.',
    {},
    async () => {
      const { series, rows, today } = await load({ day: true });
      const grid = R.crossGrid(await R.readGoals(db), rows, series, today);
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
    async ({ rows }) => {
      const read = [], refused = [];
      for (const r of rows) {
        const metric = slug(r.metric), date = isDay(r.occurred_at) ? r.occurred_at : null;
        const stamp = !date && isStamp(r.occurred_at) ? new Date(Date.parse(r.occurred_at)).toISOString() : null;
        if (!metric) { refused.push({ ...r, why: 'no metric name' }); continue; }
        if (!Number.isFinite(r.value)) { refused.push({ ...r, why: 'the value is not a number' }); continue; }
        if (!date && !stamp) { refused.push({ ...r, why: 'occurred_at is not a date or a timestamp with a zone' }); continue; }
        // a date is refused only when it is not today anywhere; a timestamp is one moment, with five minutes for a slow clock
        if (date ? date > lastDay() : Date.parse(stamp) > Date.now() + 5 * 60e3) { refused.push({ ...r, why: 'occurred_at is in the future' }); continue; }
        read.push({ r, date, stamp, metric, value: r.value, unit: r.unit || null });
      }
      if (refused.length) return text({ error: 'nothing written', refused });

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
      } catch (e) { return text({ error: 'nothing written', why: e.message }); }
      for (const x of read) if (x.date && !moment.get(x.date)) refused.push({ ...x.r, why: 'day_of puts none of the moments tried on this date' });
      if (refused.length) return text({ error: 'nothing written', refused });
      const out = read.map(x => ({
        occurred_at: x.date ? moment.get(x.date) : x.stamp, metric: x.metric, value: x.value, unit: x.unit,
        source: 'claude', source_id: `${x.metric}:${x.date || dayAt.get(x.stamp)}`, event_type: 'measurement'
      }));

      // the same metric on the same day, already in the ledger or twice in this call, lands once
      const { data: have, error: e1 } = await db.from('events')
        .select('metric, source_id').eq('source', 'claude')
        .in('source_id', out.map(r => r.source_id)).limit(20000);
      if (e1) return text({ error: e1.message });
      const seen = new Set(have.map(r => r.metric + '|' + r.source_id)), fresh = [], skipped = [];
      for (const r of out) {
        const k = r.metric + '|' + r.source_id;
        if (seen.has(k)) skipped.push(r); else { seen.add(k); fresh.push(r); }
      }
      if (fresh.length) {
        const { error } = await db.from('events').insert(fresh);
        if (error) return text({ error: error.message, written: [], skipped });
      }
      return text({ written: fresh, skipped });
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
    'Write a goal the user gave: a name, the stocks it is made of, and optionally a ' +
    'target on one stock, { metric, value } or { metric, lo, hi }. Declaring a name ' +
    'again replaces it and the old row stays on the record. Levers are declared on the page, not here: ' +
    'read goals, pass levers as that goal\'s levers minus any now named as measures, and put them ' +
    'in the printed row; any other set is refused and nothing is written. Written through writeGoal, ' +
    'signed claude; print the goal to the user and get a yes before calling this.',
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
    async ({ name, measures, target, levers: said = [] }) => {
      const title = name.trim();
      if (!slug(title)) return text({ error: 'no name' });
      if (new Set(measures).size !== measures.length) return text({ error: 'a measure is named twice' });
      await signIn();
      const all = await R.readMetrics(db);
      const unknown = measures.filter(m => !all.includes(m));
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
      // Levers are declared by the user on the page. The call must name exactly the ones the goal
      // keeps, so they are in the row the user saw and said yes to; any other set writes nothing.
      const prev = (await R.readGoals(db)).find(g => g.id === R.slugCommit(title));
      const levers = prev ? prev.levers.filter(l => !measures.includes(l.metric)) : [];
      const dropped = prev ? prev.levers.filter(l => measures.includes(l.metric)) : [];
      const key = ls => ls.map(l => JSON.stringify([l.metric, l.lag])).sort().join('\n');   // each lever on its own, so no name can pass for two
      if (key(said) !== key(levers))
        return text({ error: 'levers must be exactly the ones this goal keeps; print them in the row and call again', keeps: levers, dropped });
      const { error } = await R.writeGoal(asClaude, title, measures, t, levers);
      const context = { name: title, measures, ...(t ? { target: t } : {}), ...(levers.length ? { levers } : {}) };
      return text(error ? { error: error.message }
                        : { written: { metric: R.slugCommit(title), event_type: 'goal', source: 'claude', context }, ...(dropped.length ? { dropped } : {}) });
    }
  );

  return server;
}
