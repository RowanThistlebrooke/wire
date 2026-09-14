// The wire. Your AI reads your ledger.
//
// It never writes a measurement, a commit or a rule. The one row it may
// insert is a note: event_type 'note', value null, source 'claude', and
// you approve each one. There is no update and no delete. It signs in as
// you with the publishable key, so the same row level security that
// protects the website protects this.
//
// The maths is not copied. It loads you-reader.js, the same file the
// website loads, so the number the AI sees is the number on your screen.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const { WIRE_URL, WIRE_KEY, WIRE_EMAIL, WIRE_PASSWORD } = process.env;

// One source of truth. The browser loads this file with a script tag;
// here we read the same text and pull the functions out of it.
const src = readFileSync(new URL('../you-reader.js', import.meta.url), 'utf8');
const R = new Function(src + `
  return { readMetrics, readRules, readDays, rankSeries, etfSeries,
           readCommits, testCommit, dayNum, slugCommit,
           readGoals, goalSeries, weakPoint };`)();

const db = createClient(WIRE_URL, WIRE_KEY);

// Sign in on the first question, not at startup. Claude expects an answer
// to its handshake within a couple of seconds, and a network round trip
// before that is enough to make it give up on us.
let authed = null;
function signIn() {
  authed = authed || db.auth.signInWithPassword({
    email: WIRE_EMAIL, password: WIRE_PASSWORD
  }).then(({ error }) => {
    if (error) throw new Error('sign in failed: ' + error.message);
  });
  return authed;
}

// Everything below reads, except remember, which writes one note.
async function load() {
  await signIn();
  const [all, rules, commits] = await Promise.all(
    [R.readMetrics(db), R.readRules(db), R.readCommits(db)]);
  const rows = await R.readDays(db, all);
  const series = R.rankSeries(rows, rules);
  return { all, rules, commits, series };
}

const today = () => new Date().toISOString().slice(0, 10);
const text = o => ({ content: [{ type: 'text', text: JSON.stringify(o, null, 2) }] });

const server = new McpServer({ name: 'wire', version: '1.0.0' });

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
    const { commits } = await load();
    return text({ commits });
  }
);

server.tool(
  'did_it_work',
  'Test one commit against one stock. Compares the days it ran against the ' +
  'same number of days straight before. Refuses to answer when it cannot know.',
  { commit: z.string(), metric: z.string() },
  async ({ commit, metric }) => {
    const { commits, series } = await load();
    const c = commits.find(x => x.id === commit || x.name === commit);
    if (!c) return text({ error: `no commit called ${commit}` });
    const points = metric === 'YOU'
      ? R.etfSeries(series, Object.keys(series))
      : series[metric];
    if (!points) return text({ error: `no stock called ${metric}` });
    const r = R.testCommit(points, c, commits, today());
    return text({ commit: c.name, metric, ...r });
  }
);

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
  'conversation, never a conclusion. The user approves each call. ' +
  'This is the only thing Claude may write; it never writes a measurement, ' +
  'a commit or a rule.',
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

await server.connect(new StdioServerTransport());
