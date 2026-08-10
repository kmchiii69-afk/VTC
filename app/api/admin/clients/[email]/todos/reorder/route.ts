import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { canAdminManageClient } from '@/lib/acquisition-admin';
import { reorderTodos } from '@/lib/todos';

type Params = { params: Promise<{ email: string }> };

// Full admins may act on any client; acq-admins only on acquisition clients.
async function requireManager(clientEmail: string) {
  const auth = await getAuthUser();
  if (!auth) return null;
  return (await canAdminManageClient(auth.email, clientEmail)) ? auth : null;
}

// PATCH → admin persists one client's drag-and-drop order. Body: { items: [{ id, sort_order }] }.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { email } = await params;
  const clientEmail = decodeURIComponent(email);
  if (!await requireManager(clientEmail)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const items = Array.isArray(b.items) ? b.items : null;
  if (!items) return NextResponse.json({ error: 'items array required' }, { status: 400 });
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || typeof it.sort_order !== 'number') {
      return NextResponse.json({ error: 'Each item needs id + numeric sort_order' }, { status: 400 });
    }
  }

  await reorderTodos(clientEmail, items);
  return NextResponse.json({ ok: true, count: items.length });
}
