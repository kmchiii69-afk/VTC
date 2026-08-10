import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getClientEvents } from '@/lib/journey';

// The logged-in member's most recent content view (module / recording / guide /
// SOP), used by the "welcome back — pick up where you left off" popup on the
// home. Reads the existing client_events journey log; no dedicated storage.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const events = await getClientEvents(user.email, {
    types: ['module_view', 'recording_view', 'guide_view', 'sop_view'],
    limit: 1,
  });
  const e = events[0];
  if (!e) return NextResponse.json({ activity: null });

  return NextResponse.json({
    activity: { type: e.event_type, refId: e.ref_id, title: e.title, occurredAt: e.occurred_at },
  });
}
