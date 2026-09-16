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
export function allowed(token) {
  const want = process.env.WIRE_TOKEN;
  if (!want || !token) return false;
  const a = Buffer.from(token), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
