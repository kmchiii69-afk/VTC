import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getClientProgress, upsertClientProgress } from '@/lib/checkins';
import { logEvent } from '@/lib/journey';

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
  const progress = await getClientProgress(decodeURIComponent(email));
  return NextResponse.json(progress ?? null);
}

// Lets an admin hand-edit the rolling narrative / admin notes.
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  for (const key of ['narrative', 'admin_notes', 'momentum'] as const) {
    if (typeof body[key] === 'string') updates[key] = body[key];
  }
  for (const key of ['open_action_items', 'wins'] as const) {
    if (Array.isArray(body[key])) updates[key] = body[key];
  }
  const clientEmail = decodeURIComponent(email);
  const updated = await upsertClientProgress(clientEmail, updates);

  // Log when an admin edits the notes / red flags for this client.
  if (typeof updates.admin_notes === 'string') {
    await logEvent({
      clientEmail,
      type: 'admin_note',
      title: 'Admin note updated',
      summary: (updates.admin_notes as string).slice(0, 280) || null,
      refTable: 'client_progress',
      refId: clientEmail,
      metadata: { edited_by: auth.email },
    });
  }
  return NextResponse.json(updated);
}
