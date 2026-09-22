// The setup connector: walks someone from nothing to their first goal, one step
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

// ---- the seven steps ----
//
// Four of them build the thing. The fifth is the one that makes it worth
// having: a ledger with one row in it says nothing, and everyone arrives with
// years of readings already sitting in an app they pay for. So step five
// brings those in, and it is the first one that pays anything back. The
// sixth puts a door on the phone, where readings actually happen. The seventh
// is the one the whole thing is for: a goal, what measures it, what moves
// it. Without it the buyer has a ledger and no question to ask of it.
//
// A step is one message: every line of it, the link first, and "say done
// when" last. `done` counts steps. What a later step needs, the site
// address, the timezone, which AI, is asked for in the closing line of the
// step before, and asked for on its own if it is still missing when needed.
const STEPS = ['deploy', 'run the table', 'add your connector', 'say a number', 'bring your history in', 'put it on your phone', 'name your first goal'];

// The one place a buyer gets stuck that the steps do not name up front: Supabase asks for money because the free
// account already holds two active projects. The steps never mention it, and the answer is one message with the
// two ways out, neither of them Pro. `deploy-existing` is /deploy without the Supabase store, asking for the
// existing project's URL and publishable key as well; the table's SQL stops by itself if that project already
// holds any of the Wire's three names.
const stuckOn = s => /supabase|free|pay|paid|pro\b|unavailable|limit/i.test(String(s || '')) ? 'supabase' : null;
const FIX = {
  supabase: self => 'Supabase asks for money when the account already has two active free projects; two is the free limit. Two ways out, and neither is Pro.\n'
    + '1. Pause a project you are not using. At supabase.com open it, Settings, General, Pause project. A paused project does not count. Then go back to the Vercel page and pick Free.\n'
    + `2. If you use them all, put the Wire in a Supabase project you already have: open ${self}/deploy-existing instead of /deploy. It is the same link without the Supabase store, and it asks for two more fields, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY: in that project at supabase.com, under Project Settings, the Project URL and the publishable key, which starts sb_publishable_. Never the secret key. `
    + 'The Wire adds a table called events, a function called day_of and a view called day_metrics; if that project already has any of those names, the table step stops and says so, and the Wire needs a different project.\n'
    + 'Never pick Pro. Then carry on with the step.'
};

const ASK = {
  site: 'Before the next step: paste your site address from Vercel, like https://my-wire.vercel.app.',
  timezone: 'Before the table: which timezone do you live in? Say its name, like Europe/London or America/New_York.',
  ai: 'Before the connector: which AI are you using, the Claude app, Claude Code, Codex, or another?'
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

// `self` is this connector's own site, the one the buyer came from: it serves /deploy, and token.html, a page
// that makes a WIRE_TOKEN in the browser, so a buyer with no terminal has one to paste into the form and never
// into the chat. A line marked `sql` has the table's SQL printed right under it.
function steps(site, ai, self) {
  const s = site || 'https://YOUR-SITE';   // never shown: every step that uses it carries need: 'site'
  return [
    { lines: [
        'No GitHub account? Make a free one at github.com/signup first (email, password, a code to your email).',
        `Open ${self}/deploy and sign in with GitHub.`,
        'Under Add Products: Storage, Supabase, Postgres backend, Add, then Accept and Create. That is your database, and the three fields stay locked until it is added.',
        'Pick the region nearest you, leave the prefix as it is, and pick Free.',
        `Open ${self}/token.html in a new tab and press Copy. That is your WIRE_TOKEN, made in your browser. Never paste it here.`,
        'Fill the three fields: WIRE_EMAIL, the email you will sign in with; WIRE_PASSWORD, its password; WIRE_TOKEN, the one you just copied.',
        'Press Deploy.'
      ],
      ask: 'Say done when it is live, with the site address it shows, like https://my-wire.vercel.app, and the timezone you live in, like Europe/London.' },
    { need: ['timezone'], lines: [
        'Open your Supabase project: in Vercel, Storage, Supabase, Open in Supabase. If you used deploy-existing, open it at supabase.com.',
        { say: 'SQL Editor, New query. Paste the SQL below and press Run.', sql: true },
        'Authentication, Users, Add user, Create new user. Use your WIRE_EMAIL and WIRE_PASSWORD and tick Auto Confirm User.'
      ],
      ask: 'Say done when the SQL ran and the user exists, and say which AI you are using: the Claude app, Claude Code, Codex, or another.' },
    { need: ['site', 'ai'], lines: [
        ...connect(s)[ai || 'app'],
        'Check that wire shows in your AI\'s connectors or servers.'
      ],
      ask: 'Say done when wire shows there.' },
    { lines: [
        ai && ai !== 'app' ? 'Start a new session. It finds wire by itself.' : 'Start a new chat. Press +, Connectors, and turn wire on.',
        'Say a reading, like: my weight today is 81.4 kg.',
        'Your AI shows you the row before it writes it. Say yes.'
      ],
      ask: 'Say done when it says it wrote the row.' },
    { need: ['site'], lines: [
        `Open ${s}/you.html and sign in with your WIRE_EMAIL and WIRE_PASSWORD.`,
        'Export a CSV from something you already use: Whoop, Apple Health, Strava, a bank, a spreadsheet. Anything with an export button.',
        'Drag the CSV onto the page. It reads every row it can and says how many it could not, and why.',
        'Type a name beside each column you want. Leave the rest blank.',
        'Take the rates and leave the totals: percentage watched, not views. A total that only climbs can never hold an index.',
        'Press go.'
      ],
      ask: 'Say done when the rows have landed.' },
    { lines: [
        'The Claude app on your phone has wire already. New chat, +, Connectors, wire on, say a reading.'
      ],
      ask: 'Say done when a reading from your phone has landed.' },
    { need: ['site'], lines: [
        'In a chat with wire on, say what you are working toward, what measures it, and what moves it. Like: my goal is a leaner body; the outcomes are weight and waist; the levers are steps and sleep hours.',
        'Name only stocks you have already logged. A goal can only point at stocks that exist.',
        'For each outcome say which way is better: up, down, or a band between two numbers.',
        'Your AI shows the rows before it writes them. Say yes.',
        `Open ${s}/you.html. The goal is in the sidebar; open it and its outcomes and levers are on its page.`
      ],
      ask: 'Say done when the goal is on your page.' }
  ];
}

function end(site) {
  const s = site || 'your site';
  return 'Done. Your Wire is yours.\n'
    + `Your connector is ${s}/api/mcp. Keep your WIRE_TOKEN safe; it is what lets an AI in.\n`
    + `Two doors are open: say a reading to your AI in any chat with wire on, or drop an export onto ${s}/you.html.\n`
    + 'Nothing fetches your numbers for you yet; every reading arrives because you sent it.';
}

// The timezone goes into the table's SQL, where it decides which day every reading belongs to, and an AI that
// knows its user is tempted to fill it in from memory. So the tool never uses one it has not shown back: the
// first time a timezone arrives it is printed with what it means, and the SQL waits for the buyer's yes.
const CONFIRM = tz => `${tz}: your day will end at 6am there, so a reading before 6am counts as the night before. Say yes if that is where you live, or say the timezone you do live in.`;

function step(done, site, timezone, ai, self, confirmed) {
  const given = { site, timezone, ai };
  const S = steps(site, ai, self);
  const i = Math.min(Math.max(0, done), S.length);
  if (i >= S.length) return end(site);
  const st = S[i];
  for (const n of st.need || []) if (!given[n]) return ASK[n];
  if ((st.need || []).includes('timezone') && !confirmed) return CONFIRM(timezone);
  const sql = '\n\n```sql\n' + TABLE_SQL.split("'Europe/Zurich'").join(`'${timezone}'`).trim() + '\n```\n';
  const body = st.lines.map(l => typeof l === 'string' ? '- ' + l : '- ' + l.say + (l.sql ? sql : '')).join('\n');
  const head = (i === 0 ? 'Seven steps, one message each. Say done after each one.\n\n' : '') + `Step ${i + 1} of ${STEPS.length}, ${STEPS[i]}.`;
  return `${head}\n${body}\n\n${st.ask}`;
}

function setupServer(self) {
  const server = new McpServer({ name: 'wire-setup', version: '1.0.0' }, {
    instructions: 'Sets up the Wire, one step at a time. Before anything, ask for the Whop license key and call setup with it. ' +
      'Show the user exactly what setup returns and nothing else: no commentary, nothing about what comes later, links left as they are so they can be clicked. ' +
      'When the user says done, call setup again with done raised by one. ' +
      'Pass the site address, the timezone and the name of their AI on every call once the user has given them. ' +
      'If the user says Supabase wants them to pay, or that Free is unavailable, call setup with stuck set to supabase and the same done, and show its answer as it is. ' +
      'The timezone is only ever what the user typed in this conversation, never filled in from memory or guessed. When setup shows a timezone back and asks, ' +
      'pass timezone_confirmed true only after the user says yes to it. Never ask for a password, token or key.'
  });
  server.tool(
    'setup',
    'The next step of setting up the Wire, and only that step. Pass the user\'s Whop license key every time; without a valid one there is no walkthrough. ' +
    'done is how many steps the user has finished (0 to start); raise it by one when they say done. ' +
    'site is their Vercel site address, timezone their timezone name, ai which AI they are using, each passed on every call once given. ' +
    'stuck is what the user is stuck on, with the same done: supabase when Supabase asks them to pay or Free is unavailable. ' +
    'timezone is only what the user typed here, never from memory. timezone_confirmed is true only once the user has said yes to the timezone setup showed back. ' +
    'Show the result to the user as it is and wait.',
    {
      license_key: z.string(),
      done: z.number().int().min(0).optional(),
      site: z.string().optional(),
      timezone: z.string().optional(),
      ai: z.string().optional(),
      stuck: z.string().optional(),
      timezone_confirmed: z.boolean().optional()
    },
    async ({ license_key, done = 0, site, timezone, ai, stuck, timezone_confirmed = false }) => {
      const gate = await licensed(license_key);
      const text = !gate.ok ? `No walkthrough without a valid Whop license key: ${gate.why}.`
                 : stuckOn(stuck) ? FIX[stuckOn(stuck)](self)
                 : step(done, site === undefined ? null : origin(site), timezone === undefined ? null : zone(timezone), which(ai), self, timezone_confirmed === true);
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
      'Show me only what setup returns, as it is, with nothing added and links left clickable. When I say done, call it again with done raised by one, ' +
      'and pass my site address, my timezone and which AI I am using on every call once I have given them. ' +
      'If I say Supabase wants me to pay, or Free is unavailable, call it with stuck set to supabase and show me its answer. ' +
      'My timezone is only what I type here; never fill it in from what you know about me. When setup shows a timezone back, pass timezone_confirmed only after I say yes. Never ask me for a password, token or key.' } }]
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
