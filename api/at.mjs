// A one-row door for iOS Shortcuts: one reading, now.
//
// POST with WIRE_TOKEN in the Authorization header, checked by mcp/token.mjs as
// /api/mcp's is, and a JSON body of exactly { metric, value, unit }. The token
// is read from the header and nowhere else, because an address ends up in logs:
// a request that puts it in the address is refused before it is checked.
//
// value must be a JSON number. Anything else is refused and nothing is written.
// The reading goes through writeReadings in mcp/server.mjs, the body record
// uses, as one measurement at the moment it arrives, source shortcut, source_id
// the metric and the ledger day joined by a colon. So the same metric twice in
// one ledger day lands once, and this is not a second path into the table. It
// reads nothing back and works nothing out.

import { WRITERS, writeReadings } from '../mcp/server.mjs';
import { allowed, fromHeader } from '../mcp/token.mjs';

function answer(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.query && 'token' in req.query) return answer(res, 400, { error: 'the token goes in the Authorization header, never in the address' });
  if (!allowed(fromHeader(req))) return answer(res, 401, { error: 'unauthorized' });
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return answer(res, 405, { error: 'method not allowed' });
  }

  let body;
  try { body = req.body; } catch { body = undefined; }   // a body that is not JSON throws when it is read
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['metric', 'value', 'unit'].includes(k)))
    return answer(res, 400, { error: 'the body is JSON, { metric, value, unit }, and nothing else' });
  const { metric, value, unit = null } = body;
  if (typeof metric !== 'string') return answer(res, 400, { error: 'metric is a name' });
  if (typeof value !== 'number' || !Number.isFinite(value)) return answer(res, 400, { error: 'value is not a number' });
  if (unit !== null && typeof unit !== 'string') return answer(res, 400, { error: 'unit is text, or null' });

  try {
    const out = await writeReadings([{ metric, value, unit, occurred_at: new Date().toISOString() }], WRITERS.shortcut);
    return answer(res, !out.error ? 200 : out.refused ? 400 : 502, out);
  } catch (e) {
    return answer(res, 502, { error: 'nothing written', why: e.message });
  }
}
