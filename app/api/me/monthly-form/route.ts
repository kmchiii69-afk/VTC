import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { getStatus, submit, duePeriod } from '@/lib/monthly-form';

// GET → whether the logged-in member must fill this month's form right now.
// Returns { required, period, monthLabel }. Never throws for the caller — the
// blocking gate treats a failure as "not required" so a hiccup can't lock users out.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ required: false });
  const user = await getUser(auth.email);
  if (!user) return NextResponse.json({ required: false });
  const status = await getStatus(user);
  return NextResponse.json(status);
}

// POST → submit this month's report. Period is derived server-side (not trusted
// from the client) so a member can't submit against the wrong month to dodge the gate.
export async function POST(req: Request) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const cashCollected = Number(body?.cashCollected);
  const igReelsPosted = Number(body?.igReelsPosted);
  const ytVideosPosted = Number(body?.ytVideosPosted);
  const aPlusProblem = typeof body?.aPlusProblem === 'string' ? body.aPlusProblem.trim() : '';

  if (
    !Number.isFinite(cashCollected) || cashCollected < 0 ||
    !Number.isInteger(igReelsPosted) || igReelsPosted < 0 ||
    !Number.isInteger(ytVideosPosted) || ytVideosPosted < 0 ||
    !aPlusProblem
  ) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
  }

  const period = duePeriod();
  if (!period) return NextResponse.json({ error: 'No monthly form is due right now.' }, { status: 400 });
  const saved = await submit(auth.email, period, { cashCollected, igReelsPosted, ytVideosPosted, aPlusProblem });
  if (!saved) return NextResponse.json({ error: 'Could not save — try again.' }, { status: 500 });
  return NextResponse.json({ ok: true, period });
}
