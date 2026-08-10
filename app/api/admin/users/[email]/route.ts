import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser, updateUser, deleteUser, updatePassword, eraseClientData } from '@/lib/kv';
import { seedSkipOnboarding } from '@/lib/onboarding';
import { skipsOnboarding } from '@/lib/client-tags';

async function requireAdmin() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return null;
  return auth;
}

type Params = { params: Promise<{ email: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { email } = await params;
  const user = await getUser(decodeURIComponent(email));
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { password_hash: _, ...safe } = user;
  return NextResponse.json(safe);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { email } = await params;
  const decoded = decodeURIComponent(email);
  const body = await req.json();

  // Approve/reject: keep the `active` flag in sync with the approval status so a
  // rejected account is fully blocked (validateCredentials/getAuthUser gate on
  // active) and an approved one can sign in.
  if (body.status === 'approved') body.active = true;
  else if (body.status === 'rejected') body.active = false;

  if (body.new_password) {
    await updatePassword(decoded, body.new_password);
  }

  const { new_password: _, ...updates } = body;
  if (Object.keys(updates).length) {
    try {
      await updateUser(decoded, updates);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Update failed' },
        { status: 500 }
      );
    }
  }

  // If a skip-onboarding tag was just applied, skip the wizard + complete Phase 0.
  if (Array.isArray(updates.tags) && skipsOnboarding(updates.tags)) {
    await seedSkipOnboarding(decoded);
  }

  const updated = await getUser(decoded);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { password_hash: __, ...safe } = updated;
  return NextResponse.json(safe);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { email } = await params;
  const decoded = decodeURIComponent(email);
  const user = await getUser(decoded);
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Wipe all of the member's data so re-inviting this email starts fresh.
  await eraseClientData(decoded);
  await deleteUser(decoded);
  return NextResponse.json({ ok: true });
}
