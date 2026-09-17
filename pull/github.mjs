// Counts how many commits you pushed each day and writes them to the ledger.
//
// This runs on GitHub's machines, not yours. Nothing is installed here.
// It signs in as you with the publishable key, exactly like the website
// does, so the same row level security applies. There is no admin key
// anywhere in this repo or in this script.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Use the same complete-history reader as the pages and MCP; any page error stops the pull.
const readAll = new Function(readFileSync(new URL('../you-reader.js', import.meta.url), 'utf8') + '; return readAll;')();

const { WIRE_URL, WIRE_KEY, WIRE_EMAIL, WIRE_PASSWORD, GH_TOKEN, GH_USER } = process.env;
const DAYS = 14;

const db = createClient(WIRE_URL, WIRE_KEY);

const { error: signInError } = await db.auth.signInWithPassword({
  email: WIRE_EMAIL,
  password: WIRE_PASSWORD
});
if (signInError) throw new Error('sign in failed: ' + signInError.message);

// A date here is GitHub's day: a UTC calendar day, yesterday or older, so its count is finished.
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// The row goes in at a moment the ledger's own day_of puts on that same date, so the count lands on
// that day in day_metrics whatever timezone the ledger keeps. Noon UTC first, as before.
async function momentOn(date) {
  for (const h of [12, 20, 4]) {
    const ts = new Date(Date.parse(date + 'T00:00:00Z') + h * 36e5).toISOString();
    const { data, error } = await db.rpc('day_of', { ts });
    if (error) throw new Error('day_of failed: ' + error.message);
    if (data === date) return ts;
  }
  throw new Error(`day_of puts none of the moments tried on ${date}`);
}

async function commitsOn(date) {
  const q = `author:${GH_USER}+author-date:${date}`;
  const res = await fetch(`https://api.github.com/search/commits?q=${q}&per_page=1`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'wire'
    }
  });
  if (res.status === 403) { await new Promise(r => setTimeout(r, 60000)); return commitsOn(date); }
  if (!res.ok) throw new Error(`github ${res.status} on ${date}`);
  const body = await res.json();
  return body.total_count;
}

const rows = [];
for (let n = 1; n <= DAYS; n++) {
  const date = day(n);
  const count = await commitsOn(date);
  rows.push({
    occurred_at: await momentOn(date),
    metric: 'gh_commits',
    value: count,
    unit: 'commits',
    source: 'github',
    source_id: date              // one row per day, forever
  });
  await new Promise(r => setTimeout(r, 2500));   // stay under the search limit
}

// The same file can run every day without piling up duplicates, because
// source_id is the date and the database refuses the same one twice.
const have = await readAll(() => db.from('events')
  .select('source_id').eq('source', 'github').order('id', { ascending: true }));
const seen = new Set(have.map(h => h.source_id));
const fresh = rows.filter(r => !seen.has(r.source_id));

if (!fresh.length) {
  console.log(`nothing new, all ${rows.length} days already in`);
} else {
  const { error } = await db.from('events').insert(fresh);
  if (error) throw new Error('insert failed: ' + error.message);
  console.log(`added ${fresh.length} days, ${rows.length - fresh.length} already there`);
}
