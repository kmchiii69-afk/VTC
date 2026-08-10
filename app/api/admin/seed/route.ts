import { NextRequest, NextResponse } from 'next/server';
import { createUser, userExists } from '@/lib/kv';

// One-time seed endpoint — call once to create the first admin user
// Protected by SEED_SECRET env var
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-seed-secret');
  if (!secret || secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email, password, name } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const exists = await userExists(email);
  if (exists) return NextResponse.json({ error: 'User already exists' }, { status: 409 });

  const user = await createUser({ email, password, name, role: 'admin' });
  const { password_hash: _, ...safe } = user;
  return NextResponse.json(safe, { status: 201 });
}
