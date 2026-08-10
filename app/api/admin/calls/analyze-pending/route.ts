import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { analyzePendingCalls } from '@/lib/sales-sync';

// Analyze a small batch of imported-but-unanalyzed ('pending') calls per request.
// Sync-fathom imports fast and leaves calls 'pending'; the admin client calls this
// repeatedly until `remaining` hits 0, so no single request runs dozens of Claude
// calls and times out. Closing transcripts can be 2-3 hours, so one Sonnet
// analysis can take 30-60s — the lib hard-caps the batch at 5 per request.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { limit = 1 } = await req.json().catch(() => ({}));
  try {
    const result = await analyzePendingCalls(limit);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Analysis failed' }, { status: 500 });
  }
}
