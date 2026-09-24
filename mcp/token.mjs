// Whether a request may write. /api/mcp and /api/at both ask here, so the two
// doors check the token one way.
//
// The ledger is append only: whatever gets in can write rows that can never be
// removed. So a request must carry WIRE_TOKEN, and if WIRE_TOKEN is not set,
// nothing gets in.

import { timingSafeEqual } from 'node:crypto';

// The token in the Authorization header, with or without the word Bearer.
export function fromHeader(req) {
  return (req.headers.authorization || '').trim().replace(/^Bearer\s+/i, '');
}

// Compared in constant time, so how long the answer takes says nothing about
// how close a guess was.
function same(token, want) {
  want = String(want || '').trim();   // a value saved in Vercel with a stray space or newline is still the token
  if (!want || !token) return false;
  const a = Buffer.from(token), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function allowed(token) {
  return same(token, process.env.WIRE_TOKEN);
}

// A door can take a narrower token of its own, and WIRE_TOKEN as well, so the
// wide one still opens everything and a copy of the narrow one opens only this.
// A phone in a share sheet is the likeliest place a token is lost, and a token
// that can only put a picture in a bucket is worth much less to whoever finds
// it than one that drives the whole MCP. Unset, the door falls back to
// WIRE_TOKEN and nothing changes.
export function allowedFor(name, token) {
  return same(token, process.env[name]) || allowed(token);
}
