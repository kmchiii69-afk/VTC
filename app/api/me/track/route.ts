import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { logViewOnce, type EventType } from '@/lib/journey';

// Client-side content-engagement beacon. The portal fires this when a client
// opens an SOP, watches a module, plays a recording, or watches a section
// guide. Deduped server-side (logViewOnce) so a single sitting or re-render
// doesn't spam the journey timeline.
const ALLOWED: EventType[] = ['sop_view', 'module_view', 'recording_view', 'guide_view'];

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { type?: string; refId?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = body.type as EventType;
  if (!ALLOWED.includes(type)) {
    return NextResponse.json({ error: 'Unknown event type' }, { status: 400 });
  }

  await logViewOnce({
    clientEmail: user.email,
    type,
    title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
    refId: body.refId != null ? String(body.refId) : null,
  });

  return NextResponse.json({ ok: true });
}
