// The pages' settings, served instead of committed. It answers /api/config.js
// with the same window.WIRE the old config.js held, built from this
// deployment's environment, so a fork points at its own ledger and never at
// the one this repo was built on.
//
// It serves the ledger's address and the publishable key, and nothing else.
// It reads no other variable, and it refuses to serve any key that is not a
// publishable key, so a secret or service_role key set by mistake never
// reaches a browser.

import { supabaseUrl, publishableKey, isPublishable } from '../mcp/env.mjs';

export default function handler(req, res) {
  const url = supabaseUrl(), key = publishableKey();
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('x-content-type-options', 'nosniff');
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(url) || !isPublishable(key)) {
    res.statusCode = 500;
    res.setHeader('cache-control', 'no-store');
    return res.end('/* The Wire: set WIRE_URL and WIRE_KEY, the publishable key, in this Vercel project and redeploy. */\n');
  }
  res.setHeader('cache-control', 'public, max-age=60, s-maxage=3600');
  res.end(`window.WIRE = ${JSON.stringify({ url, key }, null, 2)};\n`);
}
