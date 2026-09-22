// The setup connector: walks someone from nothing to their first goal, one line
// at a time, over MCP at /api/setup.
//
// It has no door to any ledger. It never reads WIRE_URL, WIRE_KEY, WIRE_EMAIL,
// WIRE_PASSWORD or WIRE_TOKEN, and imports nothing that does: no Supabase
// client, no mcp/server.mjs, no mcp/env.mjs. The one setting it reads is
// WHOP_API_KEY, to check a Whop license key before any line is given.
//
// It follows mcp/MCP.md's rule for a step sequence, taken one notch further:
// one line at a time, wait for done, never a list.

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const REPO = 'https://github.com/RowanThistlebrooke/wire';
const TABLE_SQL = readFileSync(new URL('../sql/01_the_table.sql', import.meta.url), 'utf8');

// One link does the first three steps of the old walkthrough: Vercel's Deploy Button copies the repo into the
// buyer's own GitHub (a copy, not a fork, so the owner can walk it too), asks for the three settings in a form,
// makes their Supabase database through the Marketplace store, and deploys. The full link is long enough to
// read as spam in a chat, so it lives once, as the /deploy redirect in vercel.json, and the walkthrough hands
// out the short address on this site. The store slugs are the ones vercel.com/marketplace/supabase uses in its
// own deploy link; the parameters are from vercel.com/docs/deploy-button/source.

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
const checked = new Map();   // key -> answer for ten minutes, so each line does not ask Whop again

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

// ---- the seven steps, cut into lines ----
//
// Four of them build the thing. The fifth is the one that makes it worth
// having: a ledger with one row in it says nothing, and everyone arrives with
// years of readings already sitting in an app they pay for. So step five
// brings those in, and it is the first one that pays anything back. The
// sixth puts a door on the phone, where readings actually happen. The seventh
// is the one the whole thing is for: a goal, what measures it, what moves
// it. Without it the buyer has a ledger and no question to ask of it.
//
// A line is one turn: the buyer reads it, does it, says done, gets the next.
// `done` counts lines, not steps. A line with `ask` wants an answer instead
// of done, and once that answer is known the line is finished and skipped.
// A line with `need` uses an answer, and asks for it again if it is missing.
const STEPS = ['deploy', 'run the table', 'add your connector', 'say a number', 'bring your history in', 'put it on your phone', 'name your first goal'];

const ASK = {
  site: 'Press Deploy. When it is live, copy the site address it shows, like https://my-wire.vercel.app, and paste it here.',
  timezone: 'Which timezone do you live in? Say its name, like Europe/London or America/New_York.',
  ai: 'Which AI are you using: the Claude app, Claude Code, Codex, or another?'
};

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
// The buyer's AI, in their own words, sorted into the four places a connector is added. Codex before code,
// because "Codex" contains "code".
const which = s => {
  const a = String(s || '').trim().toLowerCase();
  if (!a) return null;
  if (/codex/.test(a)) return 'codex';
  if (/code|terminal|cli/.test(a)) return 'code';
  if (/claude|app|desktop|web|browser|phone/.test(a)) return 'app';
  return 'other';
};

// The connector is the same for every AI: an HTTP MCP server at /api/mcp with the token in a header. Only where
// it is added differs, so each AI gets its own line, and the token is typed into a settings page or a terminal,
// never into the chat.
function connect(site) {
  return {
    app: [
      `Settings, Connectors, Add custom connector. Name wire. URL ${site}/api/mcp. Authentication: No sign-in.`,
      'Request headers: Add header. Name authorization. Value: Bearer, a space, then your WIRE_TOKEN. Press Add.'
    ],
    code: [`In your own terminal, not in this chat: claude mcp add --transport http wire ${site}/api/mcp --header "authorization: Bearer YOUR_WIRE_TOKEN"`],
    codex: [`Put WIRE_TOKEN in your shell's environment, then in ~/.codex/config.toml add [mcp_servers.wire] with url = "${site}/api/mcp" and bearer_token_env_var = "WIRE_TOKEN".`],
    other: [`Add an MCP server named wire at ${site}/api/mcp, with the header authorization: Bearer, a space, then your WIRE_TOKEN.`]
  };
}

// `self` is this connector's own site, the one the buyer came from: it serves token.html, a page that makes
// a WIRE_TOKEN in the browser, so a buyer with no terminal has one to paste into the form and never into the chat.
function lines(site, ai, self) {
  const s = site || 'https://YOUR-SITE';   // never shown: every line that uses it carries need: 'site'
  const L = [];
  const add = (step, say, more) => L.push({ step, say, ...more });
  add(null, 'Seven steps, one line at a time. Say done after each line.');

  add(0, 'No GitHub account? Make a free one at github.com/signup first (email, password, a code to your email).');
  add(0, `Open ${self}/deploy and sign in with GitHub.`);
  add(0, 'Under Add Products: Storage, Supabase, Postgres backend, Add, then Accept and Create. That is your database, and the three fields stay locked until it is added.');
  add(0, 'Pick the region nearest you, leave the prefix as it is, and pick Free. If Free says Unavailable, pause a Supabase project you are not using at supabase.com first. Never pick Pro.');
  add(0, `Open ${self}/token.html in a new tab and press Copy. That is your WIRE_TOKEN, made in your browser. Never paste it here.`);
  add(0, 'Fill the three fields: WIRE_EMAIL, the email you will sign in with; WIRE_PASSWORD, its password; WIRE_TOKEN, the one you just copied.');
  add(0, ASK.site, { ask: 'site' });

  add(1, 'In your Vercel project open Storage, Supabase, Open in Supabase.');
  add(1, ASK.timezone, { ask: 'timezone' });
  add(1, 'SQL Editor, New query. Paste the SQL below and press Run.', { need: ['timezone'], sql: true });
  add(1, 'Authentication, Users, Add user, Create new user. Use your WIRE_EMAIL and WIRE_PASSWORD and tick Auto Confirm User.');

  add(2, ASK.ai, { ask: 'ai' });
  for (const say of connect(s)[ai || 'app']) add(2, say, { need: ['site', 'ai'] });
  add(2, 'Check that wire shows in your AI\'s connectors or servers.');

  add(3, ai && ai !== 'app' ? 'Start a new session. It finds wire by itself.' : 'Start a new chat. Press +, Connectors, and turn wire on.');
  add(3, 'Say a reading, like: my weight today is 81.4 kg.');
  add(3, 'Your AI shows you the row before it writes it. Say yes.');

  add(4, `Open ${s}/you.html and sign in with your WIRE_EMAIL and WIRE_PASSWORD.`, { need: ['site'] });
  add(4, 'Export a CSV from something you already use: Whoop, Apple Health, Strava, a bank, a spreadsheet. Anything with an export button.');
  add(4, 'Drag the CSV onto the page. It reads every row it can and says how many it could not, and why.');
  add(4, 'Type a name beside each column you want. Leave the rest blank.');
  add(4, 'Take the rates and leave the totals: percentage watched, not views. A total that only climbs can never hold an index.');
  add(4, 'Press go.');

  add(5, 'The Claude app on your phone has wire already. New chat, +, Connectors, wire on, say a reading.');

  add(6, 'In a chat with wire on, say what you are working toward, what measures it, and what moves it. Like: my goal is a leaner body; the outcomes are weight and waist; the levers are steps and sleep hours.');
  add(6, 'Name only stocks you have already logged. A goal can only point at stocks that exist.');
  add(6, 'For each outcome say which way is better: up, down, or a band between two numbers.');
  add(6, 'Your AI shows the rows before it writes them. Say yes.');
  add(6, `Open ${s}/you.html. The goal is in the sidebar; open it and its outcomes and levers are on its page.`, { need: ['site'] });
  return L;
}

function end(site) {
  const s = site || 'your site';
  return 'Done. Your Wire is yours.\n'
    + `Your connector is ${s}/api/mcp. Keep your WIRE_TOKEN safe; it is what lets an AI in.\n`
    + `Two doors are open: say a reading to your AI in any chat with wire on, or drop an export onto ${s}/you.html.\n`
    + 'Nothing fetches your numbers for you yet; every reading arrives because you sent it.';
}

function line(done, site, timezone, ai, self) {
  const given = { site, timezone, ai };
  const L = lines(site, ai, self);
  let i = Math.min(Math.max(0, done), L.length);
  while (i < L.length && L[i].ask && given[L[i].ask]) i++;   // an answered ask is finished
  if (i >= L.length) return end(site);
  const l = L[i];
  for (const n of l.need || []) if (!given[n]) return ASK[n];
  const first = l.step !== null && (i === 0 || L[i - 1].step !== l.step);
  const head = first ? `Step ${l.step + 1} of ${STEPS.length}, ${STEPS[l.step]}. ` : '';
  const sql = l.sql ? '\n\n```sql\n' + TABLE_SQL.split("'Europe/Zurich'").join(`'${timezone}'`).trim() + '\n```' : '';
  return head + l.say + sql;
}

function setupServer(self) {
  const server = new McpServer({ name: 'wire-setup', version: '1.0.0' }, {
    instructions: 'Sets up the Wire, one line at a time. Before anything, ask for the Whop license key and call setup with it. ' +
      'Show the user exactly the line setup returns and nothing else: no commentary, nothing about what comes later. ' +
      'When the user says done, or answers what the line asked, call setup again with done raised by one. ' +
      'Pass the site address, the timezone and the name of their AI on every call once the user has given them. ' +
      'Never ask for a password, token or key.'
  });
  server.tool(
    'setup',
    'The next line of setting up the Wire, and only that line. Pass the user\'s Whop license key every time; without a valid one there is no walkthrough. ' +
    'done is how many lines the user has finished (0 to start); raise it by one when they say done or answer a line. ' +
    'site is their Vercel site address, timezone their timezone name, ai which AI they are using, each passed on every call once given. ' +
    'Show the result to the user as it is and wait.',
    {
      license_key: z.string(),
      done: z.number().int().min(0).optional(),
      site: z.string().optional(),
      timezone: z.string().optional(),
      ai: z.string().optional()
    },
    async ({ license_key, done = 0, site, timezone, ai }) => {
      const gate = await licensed(license_key);
      const text = gate.ok ? line(done, site === undefined ? null : origin(site), timezone === undefined ? null : zone(timezone), which(ai), self)
                           : `No walkthrough without a valid Whop license key: ${gate.why}.`;
      return { content: [{ type: 'text', text }] };
    }
  );
  // /you: the one prompt. An AI that turns a connector's prompts into slash commands gets it as one; any
  // other is handed the same words to paste. It asks for the key itself, so the buyer types nothing else.
  server.registerPrompt('you', {
    title: '/you',
    description: 'Set up your own Wire, one line at a time.',
    argsSchema: { license_key: z.string().optional().describe('Your Whop license key, if you have it to hand') }
  }, ({ license_key }) => ({
    messages: [{ role: 'user', content: { type: 'text', text:
      'Set up my Wire. Use the setup tool on this connector. ' +
      (license_key ? `My license key is ${license_key}; pass it on every call. ` : 'Ask me for my Whop license key first and pass it on every call. ') +
      'Show me only the line setup returns, as it is, with nothing added. When I say done, or answer what the line asked, call it again with done raised by one, ' +
      'and pass my site address, my timezone and which AI I am using on every call once I have given them. Never ask me for a password, token or key.' } }]
  }));
  return server;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.setHeader('allow', 'POST'); res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'method not allowed' }, id: null }));
  }
  // The site this connector is served from, so the walkthrough can point at its own token page.
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const server = setupServer(host ? `https://${host}` : 'https://the-site-you-came-from');
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) { res.statusCode = 500; res.end(); }
  }
}
