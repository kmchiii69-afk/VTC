import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { validateCredentials, recordLogin, getRoadmapProgress, updateUser, type User } from '@/lib/kv';
import { signToken, COOKIE_NAME, COOKIE_OPTS } from '@/lib/auth';
import { computeActivityLevel } from '@/lib/activity';

// Admin bypass: when Supabase is down, allow the admin email to authenticate
// against a bcrypt hash stored in env vars (ADMIN_FALLBACK_HASH).
async function adminFallbackAuth(email: string, password: string): Promise<boolean> {
  const fallbackEmail = (process.env.ADMIN_FALLBACK_EMAIL || 'info@gohconsulting.com').toLowerCase().trim();
  const fallbackHash = process.env.ADMIN_FALLBACK_HASH || '';
  if (!fallbackHash) return false;
  if (email.toLowerCase().trim() !== fallbackEmail) return false;
  return bcrypt.compare(password, fallbackHash);
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  // ── Step 1: authenticate ──────────────────────────────────────────────────
  // Only a failure in THIS step can legitimately mean "the service is down".
  // Everything after it is bookkeeping and must not be able to fail the login.
  let user: User | null;
  try {
    user = await validateCredentials(email, password);
  } catch (e) {
    console.error(`[login] credential check failed for ${email}:`, e);

    // Fallback: let admin through even when Supabase is unavailable
    const isAdmin = await adminFallbackAuth(email, password).catch(() => false);
    if (isAdmin) {
      const token = await signToken({ email: email.toLowerCase().trim(), role: 'admin' });
      const res = NextResponse.json({ email: email.toLowerCase().trim(), role: 'admin', name: 'Admin', avatar: null, activity_level: 'high' });
      res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS);
      return res;
    }

    // `code` is a stable, non-sensitive hint so this is diagnosable from the
    // browser instead of only from server logs.
    return NextResponse.json(
      { error: 'Service temporarily unavailable. Try again shortly.', code: 'auth_backend_unreachable' },
      { status: 503 },
    );
  }

  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  // Rejected/deactivated accounts already fail validateCredentials (active=false)
  // and get the generic message above. A pending account has the correct
  // password but hasn't been approved yet — tell them so, and don't mint a token.
  if (user.status === 'pending') {
    return NextResponse.json({ error: 'Your account is pending approval.' }, { status: 403 });
  }

  // ── Step 2: bookkeeping — never fatal ─────────────────────────────────────
  // A correct password must not be turned into "service unavailable" because a
  // last_login write or a roadmap lookup hiccuped.
  const now = Date.now();
  let level = user.activity_level || 'low';
  try {
    await recordLogin(user.email);
  } catch (e) {
    console.error('[login] recordLogin failed (non-fatal):', e);
  }
  try {
    const completed = await getRoadmapProgress(user.email);
    level = computeActivityLevel(now, completed.length);
    await updateUser(user.email, { activity_level: level });
  } catch (e) {
    console.error('[login] activity level update failed (non-fatal):', e);
  }

  // ── Step 3: mint the session ──────────────────────────────────────────────
  try {
    const token = await signToken({ email: user.email, role: user.role });
    const res = NextResponse.json({ email: user.email, role: user.role, name: user.name, avatar: user.avatar, activity_level: level });
    res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS);
    return res;
  } catch (e) {
    console.error('[login] token signing failed (check JWT_SECRET):', e);
    return NextResponse.json(
      { error: 'Could not start your session. Please try again.', code: 'token_sign_failed' },
      { status: 500 },
    );
  }
}
