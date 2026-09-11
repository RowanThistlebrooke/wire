// The wire. Your AI reads your ledger.
//
// It has no write access and never will. There is no insert here, no
// update, no delete. It signs in as you with the publishable key, so the
// same row level security that protects the website protects this.
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
           readCommits, testCommit, dayNum };`)();

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

// Everything below reads. Nothing below writes.
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

await server.connect(new StdioServerTransport());
