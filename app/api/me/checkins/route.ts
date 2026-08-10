import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { listCheckInsForClient } from '@/lib/checkins';
import { CHECKIN_CATEGORY, fathomShareToEmbed, type Recording } from '@/lib/recordings';

// The logged-in client's OWN 1-1 check-in calls, shaped as Recording[] so the
// shared RecordingsPlayer can render them exactly like the group recordings.
// Privacy: scoped to the session email and only 'processed' (matched + analyzed)
// rows — unmatched/error/pending check-ins are never exposed here.
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const items = await listCheckInsForClient(auth.email);

  const recordings: Recording[] = items
    .filter((c) => c.status === 'processed')
    .map((c) => ({
      id: c.id,
      category: CHECKIN_CATEGORY.id,
      title: c.title || (c.coach_name ? `Check-in with ${c.coach_name}` : 'Check-in call'),
      fathom_url: c.recording_url,
      embed_code: fathomShareToEmbed(c.recording_url),
      summary_url: null,
      // check_ins.call_date is a full timestamp; Recording.call_date is a date.
      call_date: c.call_date ? c.call_date.slice(0, 10) : null,
      sort_order: null,
      created_at: c.created_at,
    }));

  return NextResponse.json(recordings);
}
