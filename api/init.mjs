// Step two in one press, for a buyer whose Supabase came with the Deploy button: setup.html sends the
// timezone here with the buyer's WIRE_TOKEN, and this makes the table and the login.
//
// It is the one door in the Wire that holds more than the publishable key. The Supabase store puts a database
// address and a secret key into this Vercel project, and both stay here: nothing below sends either anywhere
// but Supabase, writes it to a log or hands it back.
//
// Nothing happens without WIRE_TOKEN, checked before the database is touched. Not the login password: that
// password opens the whole ledger, so a door that let anyone test guesses against it would be a way in, while
// the token is sixty-four random characters, and a wrong one costs this door nothing.
//
// It runs the same sql/01_the_table.sql a buyer used to paste, whose own first lines stop it if the Wire's
// names are taken, and it makes the login from the email and password in the Deploy form, confirmed, and signs
// in with it before saying it works. Once the Wire's three names and a confirmed login exist it answers
// "already set up" and makes nothing, so after setup it has nothing left to do.
//
// A copy made with deploy-existing has neither the database address nor the secret key, and is told to do
// step two by hand.

import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { allowed, fromHeader } from '../mcp/token.mjs';

const TABLE_SQL = readFileSync(new URL('../sql/01_the_table.sql', import.meta.url), 'utf8');

// A timezone is a name Intl knows, in the characters a timezone name has, so it can go inside the SQL's quotes.
// The same rule api/setup.mjs uses for the timezone a buyer says in the chat.
const NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;
const zone = s => {
  const z = String(s || '').trim();
  if (!NAME.test(z)) return null;
  try { const r = new Intl.DateTimeFormat('en-US', { timeZone: z }).resolvedOptions().timeZone; return NAME.test(r) ? r : null; }
  catch { return null; }
};
const answer = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
};
const WHERE_TOKEN = 'Vercel, your project, Settings, Environment Variables, the eye icon on WIRE_TOKEN.';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); return answer(res, 405, { error: 'POST only' }); }
  if (!String(process.env.WIRE_TOKEN || '').trim()) return answer(res, 409, { say: 'WIRE_TOKEN is missing in Vercel. Add it under Settings, Environment Variables, redeploy, and try again.' });
  if (!allowed(fromHeader(req))) return answer(res, 401, { say: 'That is not your WIRE_TOKEN. It is in ' + WHERE_TOKEN });

  const env = process.env;
  const dbUrl = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const url = (env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (!dbUrl || !secret || !url) return answer(res, 409, { manual: true, say: 'This site cannot set up the table by itself: its Supabase did not come with the Deploy button. Tell your AI: my site cannot set up by itself.' });
  if (!env.WIRE_EMAIL || !env.WIRE_PASSWORD) return answer(res, 409, { say: 'WIRE_EMAIL or WIRE_PASSWORD is missing in Vercel. Add it under Settings, Environment Variables, redeploy, and try again.' });

  // Made inside the try: a database address the client cannot read throws an error that carries the whole
  // address, password included, and it must be answered here, never left to be logged.
  let sql;
  try {
    sql = postgres(dbUrl, { ssl: 'require', max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10 });
    // The Wire's table is all three of its names: a table called events on its own is someone else's, and the
    // table SQL is left to stop on it and say so.
    const [{ table }] = await sql`select to_regclass('public.events') is not null
                                     and to_regclass('public.day_metrics') is not null
                                     and to_regprocedure('public.day_of(timestamptz)') is not null as table`;
    const found = await sql`select id, email_confirmed_at is not null as confirmed from auth.users where lower(email) = lower(${env.WIRE_EMAIL}) limit 1`;
    const login = found[0] || null;
    // "works" is said only once it has: a fresh client signs in with the login as the pages and the MCP will,
    // on every answer that says done, a second press included
    const signsIn = async () => (await createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
      .auth.signInWithPassword({ email: env.WIRE_EMAIL, password: env.WIRE_PASSWORD })).error;
    const failed = e => answer(res, 500, { say: 'The table is made, but signing in with the Deploy form\'s email and password failed: ' + e.message + '. '
      + 'If a login with that email already existed with another password, set it to WIRE_PASSWORD in Supabase (Authentication, Users), or change WIRE_PASSWORD in Vercel to match and redeploy.' });
    if (table && login && login.confirmed) {
      const e = await signsIn();
      return e ? failed(e) : answer(res, 410, { done: true, say: 'Already set up. Tell your AI done.' });
    }

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body; } catch { body = null; }
    if (!body || typeof body !== 'object') return answer(res, 400, { say: 'That request could not be read. Press Set up again.' });
    const tz = zone(body.timezone);
    if (!table && !tz) return answer(res, 400, { say: 'That is not a timezone name. Use one like Europe/London or America/New_York.' });
    if (!table) await sql.unsafe(TABLE_SQL.split("'Europe/Zurich'").join(`'${tz}'`));

    // The login is the Deploy form's email and password. One that exists unconfirmed, made through the public
    // sign-up with the owner's email, is the owner's address, so it is confirmed and given the Deploy password.
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const made = !login
      ? await admin.auth.admin.createUser({ email: env.WIRE_EMAIL, password: env.WIRE_PASSWORD, email_confirm: true })
      : !login.confirmed ? await admin.auth.admin.updateUserById(login.id, { password: env.WIRE_PASSWORD, email_confirm: true }) : { error: null };
    if (made.error && !/already/i.test(made.error.message)) return answer(res, 500, { say: 'The table is made, but the login could not be: ' + made.error.message + '. Press Set up again.' });

    const e = await signsIn();
    if (e) return failed(e);
    return answer(res, 200, { done: true, say: 'Set up. Your table is made and your login works. Tell your AI done.' });
  } catch (e) {
    // the table's own guard names a taken name; anything else is said as the database said it, and never the settings
    return answer(res, 500, { say: 'Nothing more was made: ' + ((e && e.message) || 'the database did not answer') });
  } finally {
    if (sql) await sql.end({ timeout: 2 }).catch(() => {});
  }
}
