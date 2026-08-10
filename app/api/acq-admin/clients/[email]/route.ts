import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { isAcqAdmin, isAcquisitionClient } from '@/lib/acquisition-admin';
import { getUser, getRoadmapProgress, getWins } from '@/lib/kv';
import { listCheckInsForClient, countCheckInsForClient, getClientProgress } from '@/lib/checkins';
import { listActionItemsView as listActionItems } from '@/lib/todos';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ email: string }> };

// Everything the main admin drawer shows for one client, READ-ONLY, in a single
// call. Double-gated: caller must be an acq-admin AND the target must itself be
// an acquisition-tagged client (so acq-admins can't read non-acquisition members).
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || !(await isAcqAdmin(auth.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email } = await params;
  const clientEmail = decodeURIComponent(email);

  if (!(await isAcquisitionClient(clientEmail))) {
    // Not one of the acquisition clients this admin oversees.
    return NextResponse.json({ error: 'Not an acquisition client' }, { status: 403 });
  }

  const [user, roadmapCompleted, checkins, counts, progress, actionItems, wins] = await Promise.all([
    getUser(clientEmail),
    getRoadmapProgress(clientEmail),
    listCheckInsForClient(clientEmail),
    countCheckInsForClient(clientEmail),
    getClientProgress(clientEmail),
    listActionItems(clientEmail, { includeCompleted: true }),
    getWins(clientEmail),
  ]);

  if (!user) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  const { password_hash: _drop, ...safeUser } = user;

  return NextResponse.json({
    user: safeUser,
    roadmapCompleted,
    checkins,
    counts,
    progress,
    actionItems,
    wins,
  });
}
