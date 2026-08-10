import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getModuleProgress, setModuleItem } from '@/lib/kv';

// Per-client module completion for the portal Modules tab.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ completed: await getModuleProgress(user.email) });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const moduleId = typeof body?.moduleId === 'string' ? body.moduleId : '';
  if (!moduleId) return NextResponse.json({ error: 'moduleId required' }, { status: 400 });
  await setModuleItem(user.email, moduleId, !!body.completed);
  return NextResponse.json({ ok: true });
}
