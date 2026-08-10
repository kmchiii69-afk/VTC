import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getUser(auth.email);
  if (!user || !user.active) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    email: user.email,
    role: user.role,
    name: user.name,
    avatar: user.avatar,
    activity_level: user.activity_level,
    discord_id: user.discord_id,
    last_login: user.last_login,
  });
}
