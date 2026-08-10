import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { requeueFailedCalls, countFailedCalls } from '@/lib/sales-sync';

// GET: how many calls are terminally failed (drives the "Retry Failed" badge on
// load). POST: put every terminally-failed call ('analysis_failed') back in the
// analysis queue with a clean retry budget. The admin client then drives
// /analyze-pending to drain them. Nothing is ever unrecoverable.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ failed: await countFailedCalls() });
}

export async function POST() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const result = await requeueFailedCalls();
  return NextResponse.json(result);
}
