// A door for a picture. One photo, now, from the phone's share sheet.
//
// POST with WIRE_TOKEN in the Authorization header, checked by mcp/token.mjs as
// /api/at's and /api/mcp's are, and the image itself as the body. The token is
// read from the header and nowhere else, because an address ends up in logs.
//
// A photo is not a reading. It carries no value, it is in no series, no index,
// no goal and no scan, and day_metrics never sees it, because that view takes
// only rows whose event_type is 'measurement'. What a photo is worth as data
// still comes the way it always did: Claude reads the picture and writes what
// it read through `estimate`, under a name ending _est, signed photo. This door
// keeps the picture itself, so the eye has a series too.
//
// The file goes in a private bucket under the ledger day and the moment, so a
// second photo on one day never lands on the first: nothing here replaces
// anything, as nothing in the table does. The row beside it holds the path.
//
// It signs in as the owner, through mcp/server.mjs, with the same publishable
// key and password every other door uses. No service_role key anywhere.
//
// It takes WIRE_PHOTO_TOKEN as well as WIRE_TOKEN, so the phone can carry a
// token that opens this door and nothing else. A share sheet is the likeliest
// place a token is lost, and losing one that can only put a picture in a bucket
// costs far less than losing the one that drives the MCP.

import { signedIn } from '../mcp/server.mjs';
import { allowedFor, fromHeader } from '../mcp/token.mjs';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic' };
const CAP = 4 * 1024 * 1024;   // Vercel refuses a body over 4.5MB; the Shortcut shrinks before sending

function answer(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

// The body as bytes, whether the platform handed it over already read or not.
async function bytes(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > CAP) throw new Error('over 4MB: shrink the photo before sending it');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

export default async function handler(req, res) {
  if (req.query && 'token' in req.query) return answer(res, 400, { error: 'the token goes in the Authorization header, never in the address' });
  if (!allowedFor('WIRE_PHOTO_TOKEN', fromHeader(req))) return answer(res, 401, { error: 'unauthorized' });
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return answer(res, 405, { error: 'method not allowed' });
  }

  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) return answer(res, 400, { error: `send the image as the body, content-type one of ${Object.keys(TYPES).join(', ')}` });

  let file;
  try { file = await bytes(req); }
  catch (e) { return answer(res, 413, { error: 'nothing written', why: e.message }); }
  if (!file.length) return answer(res, 400, { error: 'the body is empty' });
  if (file.length > CAP) return answer(res, 413, { error: 'over 4MB: shrink the photo before sending it' });

  try {
    const db = await signedIn();
    const { data: who } = await db.auth.getUser();
    const uid = who && who.user && who.user.id;
    if (!uid) return answer(res, 502, { error: 'nothing written', why: 'signed in as nobody' });

    const at = new Date().toISOString();
    const { data: day, error: dayError } = await db.rpc('day_of', { ts: at });
    if (dayError) return answer(res, 502, { error: 'nothing written', why: `day_of: ${dayError.message}` });

    // the owner's id first, so the bucket's own policy can check it the way the table does
    const path = `${uid}/${day}/${at.replace(/[:.]/g, '-')}.${ext}`;
    const { error: upError } = await db.storage.from('photos')
      .upload(path, file, { contentType: type, upsert: false });   // never replace: the bucket keeps law 1 too
    if (upError) return answer(res, 502, { error: 'nothing written', why: `the file did not land: ${upError.message}` });

    // The file is in. Only now the row, so a row never names a file that is not there.
    const { error: rowError } = await db.from('events').insert({
      occurred_at: at,
      metric: 'photo',
      value: null,
      unit: null,
      source: 'photo',
      source_id: `photo:${path}`,
      event_type: 'photo',
      context: { path, day, bytes: file.length, type, goal: 'lean' }
    });
    if (rowError) return answer(res, 502, { error: 'the file landed but its row did not', why: rowError.message, path });

    return answer(res, 200, { landed: 1, day, path, bytes: file.length });
  } catch (e) {
    return answer(res, 502, { error: 'nothing written', why: e.message });
  }
}
