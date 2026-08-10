import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser, updateUser, updatePassword } from '@/lib/kv';

export async function PATCH(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUser(auth.email);
  if (!user || !user.active) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, avatar, new_password, current_password } = body;

  if (new_password) {
    if (!current_password) {
      return NextResponse.json({ error: 'Current password required' }, { status: 400 });
    }
    const { validateCredentials } = await import('@/lib/kv');
    const valid = await validateCredentials(auth.email, current_password);
    if (!valid) return NextResponse.json({ error: 'Current password incorrect' }, { status: 400 });
    await updatePassword(auth.email, new_password);
  }

  const updates: Record<string, string> = {};
  if (name !== undefined) updates.name = name;
  if (avatar !== undefined) updates.avatar = avatar;

  if (Object.keys(updates).length) {
    await updateUser(auth.email, updates);
  }

  const updated = await getUser(auth.email);
  return NextResponse.json({
    email: updated!.email,
    name: updated!.name,
    avatar: updated!.avatar,
  });
}
