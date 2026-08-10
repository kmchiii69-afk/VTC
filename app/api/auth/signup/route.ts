import { NextRequest, NextResponse } from 'next/server';
import { createUser, userExists } from '@/lib/kv';
import { sendSignupApprovalRequest } from '@/lib/discord/notify';

// Self-serve signup. Creates the account in a 'pending' state — it CANNOT sign in
// until an admin approves it from the admin panel. Pings Discord so the team knows
// a request is waiting. No auth cookie is set here.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    if (await userExists(email)) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    await createUser({ email, password, name, status: 'pending' });

    // Best-effort — a webhook failure must not fail the signup.
    await sendSignupApprovalRequest({ name, email }).catch(() => {});

    return NextResponse.json({ ok: true, pending: true }, { status: 200 });
  } catch (e) {
    console.error('Signup error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
