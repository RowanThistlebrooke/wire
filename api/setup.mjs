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
// passes only when Whop returns that same license key on a membership that
// still has access. Whop's own SDK says what each status means: active and
// trialing grant access, completed is a one-time purchase that keeps it (so a
// one-time buyer's key reads completed from the first day), past_due is the
// grace period after a failed payment, canceling is paid to the end of its
// period; canceled, expired, unresolved and drafted do not.
const WHOP = 'https://api.whop.com/api/v1/memberships/';
const ACCESS = new Set(['active', 'trialing', 'completed', 'past_due', 'canceling']);
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

// ---- the nine steps ----
//
// Six of them build the thing. The seventh is the one that makes it worth
// having: a ledger with one row in it says nothing, and everyone arrives with
// years of readings already sitting in an app they pay for. So step seven
// brings those in, and it is the first one that pays anything back. The
// eighth puts a door on the phone, where readings actually happen. The ninth
// is the one the whole thing is for: a goal, what measures it, what moves
// it. Without it the buyer has a ledger and no question to ask of it.
const STEPS = ['fork the repo', 'deploy on Vercel', 'add the env vars', 'run the table', 'add your connector', 'say a number', 'bring your history in', 'put it on your phone', 'name your first goal'];
const EASE = ['easy', 'easy', 'medium', 'medium', 'easy', 'easy', 'easy', 'easy', 'easy'];

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
  // The connector is the same for every AI: an HTTP MCP server at /api/mcp with the token in a header. Only
  // where it is added differs, so the step names each place once and the buyer does the one that is theirs.
  // The token is typed into a settings page or a terminal, never into the chat.
  if (done === 4) return now(4, [
    `Your Wire's connector is ${site}/api/mcp, and it lets an AI in with the header authorization: Bearer, a space, then your WIRE_TOKEN. Add it where your AI lives; one of these.`,
    `claude.ai and the Claude app: Settings, Connectors, Add custom connector. Name wire, URL ${site}/api/mcp, Authentication No sign-in, Request headers: Add header, name authorization, value Bearer and your token. Press Add.`,
    `Claude Code, in your own terminal, not in this chat: claude mcp add --transport http wire ${site}/api/mcp --header "authorization: Bearer YOUR_WIRE_TOKEN"`,
    `Codex: put WIRE_TOKEN in your shell's environment, then in ~/.codex/config.toml add [mcp_servers.wire] with url = "${site}/api/mcp" and bearer_token_env_var = "WIRE_TOKEN".`,
    'Any other AI that can add an MCP server: an HTTP server named wire at that address, with that header.'
  ], 'The token goes in a settings page or a terminal, never in this chat. Say done when wire shows in your AI\'s connectors or servers.');
  if (done === 5) return now(5, [
    'Start a new chat or session with wire on. On claude.ai: press +, Connectors, and turn wire on. In a terminal: a new session finds it.',
    'Say a reading, like: my weight today is 81.4 kg.',
    'Your AI shows you the row before it writes it. Say yes.'
  ], 'Say done when it says it wrote the row.');
  if (done === 6) return now(6, [
    `Open ${site}/you.html and sign in with your WIRE_EMAIL and WIRE_PASSWORD.`,
    'Export from something you already use. Whoop, Apple Health, Strava, a bank, a spreadsheet: anything with an export button gives you a CSV.',
    'Drag the CSV onto the page. It reads every row it can and says how many it could not, and why.',
    'Type a name beside each column you want. Leave the rest blank, and blank is left out.',
    'Take the rates and leave the totals. Percentage watched, not views. Minutes a session, not minutes. A total that only climbs leaves its own baseline behind and can never hold an index; a rate has a level to vary around.',
    'Press go.'
  ], 'Say done when the rows have landed.');
  if (done === 7) return now(7, [
    'The Claude app on your phone has wire already: a connector added on claude.ai is there too. New chat, +, Connectors, wire on, say a reading.',
    'For a reading you take every day, one tap: Shortcuts app, +, add the action Get Contents of URL.',
    `URL ${site}/api/at, Method POST. Headers: Authorization, value Bearer and your WIRE_TOKEN. Request Body, JSON: metric (Text) is the stock's name, value (Number), unit (Text).`,
    'Put an Ask for Input action before it and pass its number as value, so a tap asks for the reading. Add the shortcut to your home screen.',
    'It lands once per stock per day; a second tap on the same day lands nothing. The token sits in the header and never in the address.'
  ], 'No iPhone? Say done and move on; the Claude app is a door on any phone. Otherwise say done when a tap has landed a reading.');
  if (done === 8) return now(8, [
    'In a chat with wire on, say what you are working toward, what measures it, and what you think moves it. Like: my goal is a leaner body; the outcomes are weight and waist; the levers are steps and sleep hours.',
    'Name stocks you have already logged. A goal is a question asked of readings, so it can only point at stocks that exist.',
    'For each outcome, say which way is better: up, down, or a band between two numbers. That is the one thing the maths cannot decide, and you decide it once.',
    'Your AI shows the rows before it writes them. Say yes.',
    `Open ${site}/you.html. The goal is in the sidebar; open it and its outcomes and levers are on its page.`
  ], 'Say done when the goal is on your page.');
  return `Done. Your Wire is yours.\n\nYour connector is ${site}/api/mcp\nKeep your WIRE_TOKEN safe; it is what lets an AI in.\n\n`
    + `What happens now. Every reading lands as it arrives. A stock's index starts drawing once its first readings have a spread `
    + `and freezes at thirty readings; until then, 100 is still moving. A goal's line is the average of its outcomes' indexes. `
    + `A thing you did, a commit, gets an answer after ten days on each side of it, and only a real one: under that, or an effect `
    + `too small to tell from noise, it says so instead.\n\n`
    + `Three doors are open to you now and they cover most of it.\n`
    + `  Say it     any reading, to your AI, in a chat with wire on\n`
    + `  Tap it     the shortcut on your phone\n`
    + `  Drop it    any export, any app, onto ${site}/you.html\n\n`
    + `A fourth kind of door exists, one that fetches your numbers every morning without you, and it is not open yet: `
    + `each one needs that service's keys and a schedule on a machine that is always on. `
    + `Until you set one up, every reading arrives because you sent it. That is worth knowing before you plan around it.`;
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
      done: z.number().int().min(0).max(STEPS.length).optional(),
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
  // /you: the one prompt. An AI that turns a connector's prompts into slash commands gets it as one; any
  // other is handed the same words to paste. It asks for the key itself, so the buyer types nothing else.
  server.registerPrompt('you', {
    title: '/you',
    description: 'Set up your own Wire, one step at a time.',
    argsSchema: { license_key: z.string().optional().describe('Your Whop license key, if you have it to hand') }
  }, ({ license_key }) => ({
    messages: [{ role: 'user', content: { type: 'text', text:
      'Set up my Wire. Use the setup tool on this connector. ' +
      (license_key ? `My license key is ${license_key}; pass it on every call. ` : 'Ask me for my Whop license key first and pass it on every call. ') +
      'Show me only what setup returns, as it is, one step at a time. When I say done, call it again with done raised by one, ' +
      'and pass my site address and timezone once I have given them. Never ask me for a password, token or key.' } }]
  }));
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
