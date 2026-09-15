// The setup connector: walks someone from nothing to their first row, one step
// at a time, over MCP at /api/setup.
//
// It has no door to any ledger. It never reads WIRE_URL, WIRE_KEY, WIRE_EMAIL,
// WIRE_PASSWORD or WIRE_TOKEN, and imports nothing that does: no Supabase
// client, no mcp/server.mjs, no mcp/env.mjs. The one setting it reads is
// WHOP_API_KEY, to check a Whop license key before any step is given.
//
// It follows mcp/MCP.md: one step at a time, wait for done, never a list of ten.

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const REPO = 'https://github.com/RowanThistlebrooke/wire';
const TABLE_SQL = readFileSync(new URL('../sql/01_the_table.sql', import.meta.url), 'utf8');

// ---- the gate: a Whop license key, checked against Whop's API ----
// GET /api/v1/memberships/{id} takes a membership id or a license key. A key
// passes only when Whop returns that same license key on a membership that is
// active, trialing, or canceling (paid until its period ends).
const WHOP = 'https://api.whop.com/api/v1/memberships/';
const ACCESS = new Set(['active', 'trialing', 'canceling']);
const checked = new Map();   // key -> answer for ten minutes, so each step does not ask Whop again

async function licensed(raw) {
  const key = String(raw || '').trim();
  if (!key || key.length > 200 || /[\s/?#%\\]/.test(key)) return { ok: false, why: 'that is not a license key' };
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) return { ok: false, why: 'this setup connector has no Whop key yet, so it cannot check a license' };
  const hit = checked.get(key);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit;
  const keep = answer => {
    if (checked.size > 1000) checked.clear();
    checked.set(key, { ...answer, at: Date.now() });
    return answer;
  };
  let res;
  try {
    res = await fetch(WHOP + encodeURIComponent(key), {
      headers: { authorization: `Bearer ${apiKey}`, 'api-version-date': '2026-07-01', accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
  } catch { return { ok: false, why: 'Whop did not answer; try again in a minute' }; }
  if (res.status === 404 || res.status === 400 || res.status === 422) return keep({ ok: false, why: 'Whop does not know that license key' });
  if (res.status === 401 || res.status === 403) return { ok: false, why: 'Whop refused this connector\'s own key; the seller has to fix it' };
  if (!res.ok) return { ok: false, why: `Whop answered ${res.status}; try again in a minute` };
  const m = await res.json().catch(() => null);
  if (!m || m.license_key !== key) return keep({ ok: false, why: 'that is not a license key' });
  if (!ACCESS.has(m.status)) return keep({ ok: false, why: `that license is ${m.status}` });
  return keep({ ok: true });
}

// ---- the six steps ----
const STEPS = ['fork the repo', 'deploy on Vercel', 'add the env vars', 'run the table', 'add your connector', 'say a number'];
const EASE = ['easy', 'easy', 'medium', 'medium', 'easy', 'easy'];

// MCP.md: during a step sequence show only NOW, its difficulty, and the steps with done marks.
function now(i, lines, ask) {
  const marks = STEPS.map((s, j) => `         ${j + 1} ${j < i ? '✓' : j === i ? '→' : ' '} ${s}`).join('\n');
  return `NOW      ${STEPS[i]} · ${EASE[i]}\n${marks}\n\n${lines.map(l => '- ' + l).join('\n')}\n\n${ask}`;
}

// A site address is an https origin and nothing else.
const origin = s => {
  try { const u = new URL(String(s).trim()); return u.protocol === 'https:' && !u.username && !u.password ? u.origin : null; }
  catch { return null; }
};
// A timezone is a name Intl knows, in the characters a timezone name has, so it can go inside the SQL's quotes.
const NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;
const zone = s => {
  const z = String(s || '').trim();
  if (!NAME.test(z)) return null;
  try { const r = new Intl.DateTimeFormat('en-US', { timeZone: z }).resolvedOptions().timeZone; return NAME.test(r) ? r : null; }
  catch { return null; }
};
const ASK_SITE = 'Before the next step: paste your site address from Vercel, like https://wire-abc.vercel.app.';

function step(done, site, tz) {
  if (done === 0) return now(0, [
    'Sign in to GitHub, or make a free account.',
    `Open ${REPO} and press Fork, then Create fork.`
  ], 'Say done when your own copy of wire is open on GitHub.');
  if (done === 1) return now(1, [
    'Sign in to vercel.com with GitHub.',
    'Add New, Project, pick your wire fork, Import.',
    'Leave Framework Preset on Other and the build command empty. Press Deploy.',
    'When it is live, copy the site address it shows, like https://wire-abc.vercel.app.'
  ], 'Say done and paste the site address.');
  if (!site) return ASK_SITE;
  if (done === 2) return now(2, [
    'In your Vercel project open Storage, Create Database, Supabase. It makes your Supabase project and adds its address and publishable key for you.',
    'Settings, Environment Variables. Add WIRE_EMAIL: the email you will sign in with.',
    'Add WIRE_PASSWORD: the password for that login. You make the login itself in the next step, with these same two.',
    'Add WIRE_TOKEN: a long random string. In a terminal, openssl rand -hex 32 makes one. Keep it for step 5.',
    'Deployments, the newest one, the three dots, Redeploy.'
  ], 'Never paste a password, token or key into this chat. Say done when it has redeployed.');
  if (done === 3 && !tz) return 'Before the table: which timezone do you live in? Its name, like Europe/London or America/New_York. Your day will end at 6am there.';
  if (done === 3) return now(3, [
    'In Vercel open Storage, Supabase, Open in Supabase.',
    'SQL Editor, New query. Paste the SQL below and press Run.',
    'Authentication, Users, Add user, Create new user. Use the WIRE_EMAIL and WIRE_PASSWORD from step 3 and tick Auto Confirm User.'
  ], 'Say done when the SQL ran and the user exists.') +
    '\n\n```sql\n' + TABLE_SQL.split("'Europe/Zurich'").join(`'${tz}'`).trim() + '\n```';
  if (done === 4) return now(4, [
    'claude.ai, Settings, Connectors, Add custom connector.',
    `Name it wire. URL: ${site}/api/mcp`,
    'Authentication: No sign-in.',
    'Request headers, Add header. Name: authorization. Value: Bearer, a space, then your WIRE_TOKEN.',
    'Press Add.'
  ], 'Say done when wire shows in your connectors.');
  if (done === 5) return now(5, [
    'Start a new chat. Press +, Connectors, and turn wire on.',
    'Say a reading, like: my weight today is 81.4 kg.',
    'Claude shows you the row before it writes it. Say yes.'
  ], 'Say done when Claude says it wrote the row.');
  return `Done. Your first row is in.\n\nYour connector is ${site}/api/mcp\nKeep your WIRE_TOKEN safe; it is what lets Claude in.`;
}

function setupServer() {
  const server = new McpServer({ name: 'wire-setup', version: '1.0.0' }, {
    instructions: 'Sets up the Wire, one step at a time. Before anything, ask for the Whop license key and call setup with it. ' +
      'Show the user only what setup returns, never the steps ahead. When the user says done, call setup again with done set ' +
      'to the step just finished, and pass the site address and timezone once the user has given them. Never ask for a password, token or key.'
  });
  server.tool(
    'setup',
    'The next step of setting up the Wire, and only that step. Pass the user\'s Whop license key every time; without a valid one there is no walkthrough. ' +
    'done is how many steps the user has finished (0 to start). site is their Vercel site address, once given. ' +
    'timezone is their timezone name, once given. Show the result to the user as it is and wait for them to say done.',
    {
      license_key: z.string(),
      done: z.number().int().min(0).max(6).optional(),
      site: z.string().optional(),
      timezone: z.string().optional()
    },
    async ({ license_key, done = 0, site, timezone }) => {
      const gate = await licensed(license_key);
      const text = gate.ok ? step(done, site === undefined ? null : origin(site), timezone === undefined ? null : zone(timezone))
                           : `No walkthrough without a valid Whop license key: ${gate.why}.`;
      return { content: [{ type: 'text', text }] };
    }
  );
  return server;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('allow', 'POST'); res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'method not allowed' }, id: null }));
  }
  const server = setupServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) { res.statusCode = 500; res.end(); }
  }
}
