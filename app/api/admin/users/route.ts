import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getAllUsers, createUser, updateUser, userExists, eraseClientData } from '@/lib/kv';
import { seedSkipOnboarding } from '@/lib/onboarding';
import { skipsOnboarding } from '@/lib/client-tags';

async function requireAdmin() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return null;
  return auth;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const users = await getAllUsers();
  return NextResponse.json(
    users.map(({ password_hash: _, ...u }) => u)
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email, password, name, role, tags, discord_channel_id } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  const exists = await userExists(email);
  if (exists) return NextResponse.json({ error: 'User already exists' }, { status: 409 });

  // Safety net: clear any leftover data for this email (e.g. a member deleted
  // before data-erasure existed) so the re-invited account starts completely fresh.
  await eraseClientData(email);

  let user = await createUser({ email, password, name, role });
  // Apply extras chosen in the add-member form (createUser doesn't take them).
  const extras: Record<string, unknown> = {};
  if (Array.isArray(tags) && tags.length) extras.tags = tags;
  if (typeof discord_channel_id === 'string' && discord_channel_id.trim()) extras.discord_channel_id = discord_channel_id.trim();
  if (Object.keys(extras).length) {
    user = (await updateUser(email, extras)) ?? user;
  }
  // "Existing Client" / "Recent Onboarding" → skip the wizard + complete Phase 0.
  if (Array.isArray(tags) && tags.length && skipsOnboarding(tags)) await seedSkipOnboarding(email);
  const { password_hash: _, ...safe } = user;
  return NextResponse.json(safe, { status: 201 });
}
