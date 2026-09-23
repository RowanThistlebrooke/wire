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
const stuckOn = s => /\bpay|paid|money|cost|charge|\$|\bpro\b|unavailable|limit/i.test(String(s || '')) ? 'supabase' : null;
const FIX = {
  supabase: self => 'Supabase asks for money when the account already has two active free projects; two is the free limit. Two ways out, and neither is Pro.\n'
    + '1. Pause a project you are not using. At supabase.com open it, Settings, General, Pause project. A paused project does not count. Then go back to the Vercel page and pick Free.\n'
    + `2. If you use them all, put the Wire in a Supabase project you already have: open ${self}/deploy-existing instead of /deploy. It is the same link without the Supabase store, and it asks for two more fields, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY: in that project at supabase.com, under Project Settings, the Project URL and the publishable key, which starts sb_publishable_. Never the secret key. `
    + 'The Wire adds a table called events, a function called day_of and a view called day_metrics; if that project already has any of those names, the table step stops and says so, and the Wire needs a different project.\n'
    + 'Never pick Pro. Then carry on with the step.'
};

// A question the tool has to ask on its own is shown under the step it belongs to, so the AI keeps its count:
// the timezone belongs to the table, which AI to the connector, the site address to whichever step needs it.
const ASK = {
  site: { step: null, say: 'Paste your site address from Vercel, like https://my-wire-xxxx.vercel.app.' },
  timezone: { step: 1, say: 'Which timezone do you live in? Say its name, like Europe/London or America/New_York.' },
  ai: { step: 2, say: 'Which AI are you using: the Claude app, Claude Code, Codex, or another?' }
};
const HEAD = i => `Step ${i + 1} of ${STEPS.length}, ${STEPS[i]}.`;

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
  const mcp = '`' + site + '/api/mcp`';
  return {
    app: [
      `Settings, Connectors, Add custom connector: name wire, URL ${mcp}, No sign-in.`,
      'Add header: name authorization, value Bearer and your WIRE_TOKEN. Press Add.'
    ],
    code: ['In your own terminal, not in this chat: `claude mcp add --transport http wire ' + site + '/api/mcp --header "authorization: Bearer YOUR_WIRE_TOKEN"`'],
    codex: ['Put WIRE_TOKEN in your shell\'s environment, then in `~/.codex/config.toml` add `[mcp_servers.wire]` with `url = "' + site + '/api/mcp"` and `bearer_token_env_var = "WIRE_TOKEN"`.'],
    other: [`Add an MCP server named wire at ${mcp}, with the header authorization: Bearer, a space, then your WIRE_TOKEN.`]
  };
}

// `self` is this connector's own site, the one the buyer came from: it serves /deploy, and token.html, a page
// that makes a WIRE_TOKEN in the browser, so a buyer with no terminal has one to paste into the form and never
// into the chat. A line marked `sql` has the table's SQL printed right under it.
// A step's message holds the doing and nothing else. What each line means, and what to do when it does not go
// as written, is in its `more`, and the buyer sees it only by asking: their AI passes their words as `help`.
function steps(site, ai, self) {
  const s = site || 'https://YOUR-SITE';   // never shown: every step that uses it carries need: 'site'
  return [
    { lines: [
        `Open ${self}/deploy and sign in with GitHub.`,
        `Add the Supabase database when the page asks, then fill the three boxes (the token comes from ${self}/token.html) and press Deploy.`
      ],
      ask: 'Say done with your site address and your timezone.',
      more: [
        'No GitHub account: make a free one at github.com/signup first (email, password, a code to your email).',
        'The Supabase screen: Storage, Supabase, Postgres backend, Add, then Accept and Create. Pick the region nearest you, leave the prefix as it is, and pick Free. The three boxes stay locked until it is added.',
        `The three boxes: WIRE_EMAIL, the email you will sign in with; WIRE_PASSWORD, its password; WIRE_TOKEN, a long random string. ${self}/token.html makes one in your browser: press Copy, paste it in the box, keep a copy somewhere safe, and never paste it into a chat.`,
        'Vercel may mark WIRE_TOKEN and WIRE_PASSWORD Needs Attention and suggest Sensitive. Leave them: a Sensitive value can never be shown again, and step three reads the token back from Vercel.',
        'Your site address is the one Vercel shows when it is live, like https://my-wire-xxxx.vercel.app. Your timezone is its name, like Europe/London or America/New_York.'
      ] },
    { need: ['timezone'], lines: [
        'Open your Supabase project: in Vercel, Storage, Supabase, Open in Supabase.',
        { say: 'SQL Editor, New query, paste the SQL below, Run.', sql: true },
        'Authentication, Users, Add user: your WIRE_EMAIL and WIRE_PASSWORD, and tick Auto Confirm User.'
      ],
      ask: 'Say done, and which AI you use: the Claude app, Claude Code, Codex, or another.',
      more: [
        'If you deployed with deploy-existing, open that project at supabase.com instead.',
        'The SQL makes one table called events, a function called day_of and a view called day_metrics, and nothing else. If one of those names is already taken in that project, it stops before making anything and says which; then the Wire needs a different project.',
        'Your day ends at 6am in your timezone, so a reading before 6am counts as the night before.',
        'The user is the login for your own page, you.html. Nobody else can read your rows.'
      ] },
    { need: ['site', 'ai'], lines: [
        'Your WIRE_TOKEN is the one in Vercel: your project, Settings, Environment Variables, WIRE_TOKEN, the reveal icon. Not a new one from the token page.',
        ...connect(s)[ai || 'app']
      ],
      ask: 'Say done when wire shows in your connectors.',
      more: [
        'The token goes in a settings page or a terminal, never into a chat. Bearer, a space, then the token, exactly as it is in Vercel.',
        'If it will not connect, or says 401, the token in the header is not the one in Vercel. Copy it again from Vercel, Settings, Environment Variables, WIRE_TOKEN, the reveal icon, and put it in the header.',
        'Vercel marks WIRE_TOKEN and WIRE_PASSWORD Needs Attention because they are not Sensitive. Leave them as they are: a Sensitive value can never be shown again, and this step, and signing in to your page, need to read them back. Nobody but you can open your Vercel project.',
        'If you already have an MCP called wire, adding this one fails, in Claude Code with "MCP server wire already exists in local config". Pick another name, like mywire, and use that name everywhere after: in the command or the connector form, and when a later step says to turn on wire.',
        'If you already have another Wire connected, this one is the one at `' + s + '/api/mcp`. Keep the two apart by name.',
        '`' + s + '/api/mcp` is the address your AI talks to, not a web page: opened in a browser it shows nothing, and that is right. Your page is ' + s + '/you.html.'
      ] },
    { need: ['site', 'timezone', 'ai'], lines: [
        ai && ai !== 'app' ? `Start a new session with wire, the one at \`${s}/api/mcp\`.` : `Start a new chat. Press +, Connectors, and turn on wire, the one at \`${s}/api/mcp\`.`,
        'Say a reading, like: my weight today is 81.4 kg. Say yes to the row it shows you.'
      ],
      ask: 'Say done when it says it wrote the row.',
      more: [
        'Your AI prints the exact row before it writes anything and writes only on your yes. A row is never edited or removed; a wrong number is corrected by a new row.',
        'Only one Wire should be on in that chat, the one at `' + s + '/api/mcp`, or the reading lands in whichever is on.',
        '`' + s + '/api/mcp` is not a web page: opened in a browser it shows nothing, and that is right. It is only the address your AI talks to.'
      ] },
    { need: ['site', 'timezone', 'ai'], lines: [
        `Open ${s}/you.html and sign in.`,
        'Drag an export onto the page, name the columns you want, press go.'
      ],
      ask: 'Say done when the rows have landed.',
      more: [
        'An export is the CSV any app with an export button gives you: Whoop, Apple Health, Strava, a bank, a spreadsheet.',
        'A column you leave blank is left out. The page says how many rows it could not read, and why.',
        'Take the rates and leave the totals: percentage watched, not views. A total that only climbs can never hold an index.'
      ] },
    { need: ['site', 'timezone', 'ai'], lines: [
        `On your phone, in the Claude app: new chat, +, Connectors, turn on wire, the one at \`${s}/api/mcp\`, and say a reading.`
      ],
      ask: 'Say done when it has landed.',
      more: [
        'A connector added on claude.ai is already in the Claude app on your phone, so there is nothing to set up there.'
      ] },
    { need: ['site', 'timezone', 'ai'], lines: [
        'In a chat with wire on, say what you are working toward, what measures it, what moves it, and which way is better for each measure. Say yes to the rows.'
      ],
      ask: `Say done when the goal is on ${s}/you.html.`,
      more: [
        'Like: my goal is a leaner body; the outcomes are weight and waist, both down; the levers are steps and sleep hours.',
        'A goal can only point at stocks you have already logged.',
        'Which way is better is up, down, or a band between two numbers. It is the one thing the maths cannot decide, and you decide it once.',
        'The goal is in the sidebar of your page; open it and its outcomes and levers are on its page.'
      ] }
  ];
}

function end(site) {
  const s = site || 'your site';
  return 'Done. Your Wire is yours.\n'
    + `Your connector is \`${s}/api/mcp\`, the address your AI talks to, not a web page. Keep your WIRE_TOKEN safe; it is what lets an AI in.\n`
    + `Two doors are open: say a reading to your AI in any chat with wire on, or drop an export onto ${s}/you.html.\n`
    + 'Nothing fetches your numbers for you yet; every reading arrives because you sent it.\n'
    + 'Your copy updates itself every morning from the original and Vercel redeploys; ask your AI for health to see which version you are on.';
}

// The timezone goes into the table's SQL, where it decides which day every reading belongs to, and an AI that
// knows its user is tempted to fill it in from memory. So the tool never uses one it has not shown back: the
// first time a timezone arrives it is printed with what it means, and the SQL waits for the buyer's yes.
const CONFIRM = tz => `${tz}: your day will end at 6am there, so a reading before 6am counts as the night before. Say yes if that is where you live, or say the timezone you do live in.`;

// The explaining for the step the buyer is on, only when they ask for it.
function more(done, site, ai, self) {
  const S = steps(site, ai, self), i = Math.min(Math.max(0, done), S.length - 1);
  return `${HEAD(i)}\n${S[i].more.map(l => '- ' + l).join('\n')}\n\n${S[i].ask}`;
}

function step(done, site, timezone, ai, self, confirmed) {
  const given = { site, timezone, ai };
  const S = steps(site, ai, self);
  const i = Math.min(Math.max(0, done), S.length);
  if (i >= S.length) return end(site);
  const st = S[i];
  for (const n of st.need || []) if (!given[n]) return `${HEAD(ASK[n].step ?? i)}\n- ${ASK[n].say}`;
  if ((st.need || []).includes('timezone') && !confirmed) return `${HEAD(1)}\n- ${CONFIRM(timezone)}`;
  const sql = '\n\n```sql\n' + TABLE_SQL.split("'Europe/Zurich'").join(`'${timezone}'`).trim() + '\n```\n';
  const body = st.lines.map(l => typeof l === 'string' ? '- ' + l : '- ' + l.say + (l.sql ? sql : '')).join('\n');
  const head = (i === 0 ? 'Seven steps, one message each. Say done after each one.\n\n' : '') + HEAD(i);
  return `${head}\n${body}\n\n${st.ask}`;
}

function setupServer(self) {
  const server = new McpServer({ name: 'wire-setup', version: '1.0.0' }, {
    instructions: 'Sets up the Wire, one step at a time. Before anything, ask for the Whop license key and call setup with it. ' +
      'Show the user exactly what setup returns and nothing else: no commentary, nothing about what comes later, links left as they are so they can be clicked, and anything in backticks left as code, never made a link. ' +
      'done is the number in the last "Step N of 7" message the user has finished: when they say done to step N, call setup with done N. ' +
      'A question under a step heading is part of that step, not a step: when the user answers it, call setup again with the same done and the answer. ' +
      'Pass the site address, the timezone and the name of their AI on every call once the user has given them; a later step is not given out until they are. ' +
      'If the user asks anything about the step, or is stuck, call setup with help set to their words and the same done, and show its answer as it is; never answer from your own knowledge. ' +
      'The timezone is only ever what the user typed in this conversation, never filled in from memory or guessed. When setup shows a timezone back and asks, ' +
      'pass timezone_confirmed true only after the user says yes to it. Never ask for a password, token or key.'
  });
  server.tool(
    'setup',
    'The next step of setting up the Wire, and only that step. Pass the user\'s Whop license key every time; without a valid one there is no walkthrough. ' +
    'done is the number of the last step the user finished, the N in "Step N of 7" they said done to (0 to start). Answering a question is not done: pass the same done and the answer. ' +
    'site is their Vercel site address, timezone their timezone name, ai which AI they are using, each passed on every call once given. ' +
    'help is the user\'s own words when they ask about the step or are stuck, with the same done; it returns the explaining for that step. ' +
    'timezone is only what the user typed here, never from memory. timezone_confirmed is true only once the user has said yes to the timezone setup showed back. ' +
    'Show the result to the user as it is and wait.',
    {
      license_key: z.string(),
      done: z.number().int().min(0).optional(),
      site: z.string().optional(),
      timezone: z.string().optional(),
      ai: z.string().optional(),
      help: z.string().optional(),
      stuck: z.string().optional(),
      timezone_confirmed: z.boolean().optional()
    },
    async ({ license_key, done = 0, site, timezone, ai, help, stuck, timezone_confirmed = false }) => {
      const gate = await licensed(license_key);
      const text = !gate.ok ? `No walkthrough without a valid Whop license key: ${gate.why}.`
                 : stuckOn(help ?? stuck) ? FIX[stuckOn(help ?? stuck)](self)
                 : (help ?? stuck) !== undefined ? more(done, site === undefined ? null : origin(site), which(ai), self)
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
      'Show me only what setup returns, as it is, with nothing added and links left clickable. When I say done to "Step N of 7", call it again with done N; when I answer a question, call it again with the same done and my answer, ' +
      'and pass my site address, my timezone and which AI I am using on every call once I have given them. ' +
      'If I ask about a step or get stuck, call it with help set to my words and the same done, and show me its answer. ' +
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
