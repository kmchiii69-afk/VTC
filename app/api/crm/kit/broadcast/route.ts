import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { kitCreateBroadcast } from '@/lib/kit';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

// POST → create a Kit broadcast. Deliberately created as a DRAFT (see lib/kit.ts)
// so the coach reviews the audience + copy and hits send inside Kit — no mass
// email fires straight from this button.
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const subject = String(b.subject || '').trim();
  const content = String(b.content || '').trim();
  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  if (!content) return NextResponse.json({ error: 'Email content is required' }, { status: 400 });

  const res = await kitCreateBroadcast({ subject, content, description: b.description ? String(b.description) : undefined });
  if (res.skipped) return NextResponse.json({ error: res.error || 'Kit is not configured.' }, { status: 503 });
  if (!res.ok) return NextResponse.json({ error: res.error || 'Kit request failed' }, { status: 502 });
  return NextResponse.json({ ok: true, id: res.id });
}
