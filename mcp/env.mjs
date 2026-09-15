// Where the ledger's address and its publishable key come from.
//
// WIRE_URL and WIRE_KEY, the names the Wire has always used, or the names the
// Supabase integration on the Vercel Marketplace syncs into a project, so a
// ledger made from the Deploy button needs neither typed in. Nothing else in
// the environment is read here.

export function supabaseUrl() {
  return (process.env.WIRE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
}

export function publishableKey() {
  return (process.env.WIRE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
}

// A key that is safe in a browser: a publishable key, or a legacy key whose
// own claims say role anon. A secret key or a service_role key is neither, so
// it is never served to a page and never used to sign in.
export function isPublishable(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const parts = String(key).split('.');
  if (parts.length !== 3) return false;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon'; }
  catch { return false; }
}
