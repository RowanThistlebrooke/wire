// The wire over HTTP, for claude.ai, the phone, and anything that is not
// Claude Desktop.
//
// The server and every tool live in mcp/server.mjs, once. mcp/wire.mjs serves
// the same server over stdio. This file reads nothing, writes nothing and
// works nothing out; it only checks the token and hands the request over.
//
// This address is public and the ledger is append only: whatever gets in can
// write rows that can never be removed. So every request must carry WIRE_TOKEN,
// either as the header  Authorization: Bearer <token>  or as the last part of
// the path, /api/mcp/<token>. If WIRE_TOKEN is not set, nothing gets in.

import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { wireServer } from '../mcp/server.mjs';

// The token as the request presents it: the Authorization header first, with
// or without the word Bearer, then the path, which vercel.json passes on as
// ?token=.
function presented(req) {
  const auth = (req.headers.authorization || '').trim();
  if (auth) return auth.replace(/^Bearer\s+/i, '');
  const t = req.query && req.query.token;
  return typeof t === 'string' ? t : '';
}

// Compared in constant time, so how long the answer takes says nothing about
// how close a guess was.
function allowed(token) {
  const want = process.env.WIRE_TOKEN;
  if (!want || !token) return false;
  const a = Buffer.from(token), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

function refuse(res, status, message) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

export default async function handler(req, res) {
  if (!allowed(presented(req))) return refuse(res, 401, 'unauthorized');

  // Stateless: every request is a POST answered by its own server. There is
  // no stream to hold open and no session to end.
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return refuse(res, 405, 'method not allowed');
  }

  const server = wireServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) refuse(res, 500, 'the server could not answer');
  }
}
