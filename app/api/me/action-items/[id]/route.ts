import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { getTodo, setTodoDone, todoToActionItem } from '@/lib/todos';

type Params = { params: Promise<{ id: string }> };

// Client toggles completion on one of THEIR OWN tasks (backed by client_todos).
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUser(auth.email);
  if (!user || !user.active) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const item = await getTodo(id);
  // Ownership check: a client may only touch their own items.
  if (!item || item.client_email !== user.email.toLowerCase().trim()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const done = body.status === 'completed';
  const updated = await setTodoDone(id, done, 'client');
  return NextResponse.json(updated ? todoToActionItem(updated) : null);
}
