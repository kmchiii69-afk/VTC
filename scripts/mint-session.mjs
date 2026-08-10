// Mint a session cookie for any account — sign in as a member without touching
// their password.
//
// A session in this app is just a signed JWT ({ email, role, v }) in the
// `ba_auth_token` cookie; there's no server-side session store, so a minted token
// IS a full login. The role is read from portal_users so you get exactly what that
// member sees (a 'user' token has no admin powers, even for your own account).
//
//   node scripts/mint-session.mjs someone@example.com
//   node scripts/mint-session.mjs someone@example.com --secret "<prod JWT_SECRET>"
//
// Without --secret it uses JWT_SECRET from .env.local, falling back to the same
// default lib/auth.ts uses when that's blank — which is what localhost runs on.
// For production, pass the JWT_SECRET set in Vercel (`vercel env pull`, or
// Project → Settings → Environment Variables); a token signed with the wrong
// secret is rejected and you'll just bounce to the login page.

import { readFileSync } from 'node:fs';
import { SignJWT } from 'jose';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SECRET = 'ba-portal-jwt-secret-change-in-production';
const COOKIE_NAME = 'ba_auth_token';
const TOKEN_VERSION = 1; // must match TOKEN_VERSION in lib/auth.ts

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'))?.toLowerCase().trim();
const secretArg = args.includes('--secret') ? args[args.indexOf('--secret') + 1] : null;

if (!email) {
  console.error('usage: node scripts/mint-session.mjs <email> [--secret "<JWT_SECRET>"]');
  process.exit(1);
}

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const secret = (secretArg || env.JWT_SECRET || '').trim() || DEFAULT_SECRET;
const usingDefault = secret === DEFAULT_SECRET;

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const { data: user } = await db
  .from('portal_users')
  .select('email, name, role, active, status, onboarded_at')
  .eq('email', email)
  .maybeSingle();

if (!user) {
  console.error(`No account found for ${email}.`);
  process.exit(1);
}

// getAuthUser / the login route reject these, so a token would be useless.
const blockers = [];
if (user.active === false) blockers.push('account is inactive');
if (user.status && user.status !== 'approved') blockers.push(`signup status is "${user.status}"`);

const token = await new SignJWT({ email: user.email, role: user.role ?? 'user', v: TOKEN_VERSION })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('30d')
  .sign(new TextEncoder().encode(secret));

const landing = user.onboarded_at ? '/select' : '/onboarding';

console.log(`
Session for ${user.name || user.email} <${user.email}>
  role     ${user.role ?? 'user'}
  secret   ${usingDefault ? 'default (localhost)' : 'supplied/.env.local'}
  lands on ${landing}${user.onboarded_at ? '' : '  (onboarding not finished)'}${blockers.length ? `\n  WARNING  ${blockers.join('; ')} — this token will be rejected` : ''}

Paste in the browser console on the site you want to be signed in to:

  document.cookie = '${COOKIE_NAME}=${token}; path=/; max-age=2592000'; location.href = '${landing}';

To sign back out as yourself:

  document.cookie = '${COOKIE_NAME}=; path=/; max-age=0'; location.href = '/';
`);
