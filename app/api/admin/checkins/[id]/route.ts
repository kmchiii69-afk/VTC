import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getCheckInById, deleteCheckIn, recomputeProgressAfterCheckInDeletion } from '@/lib/checkins';
import { deleteTodosForCheckIn as deleteActionItemsForCheckIn } from '@/lib/todos';
import { deleteEventsByRef } from '@/lib/journey';

type Params = { params: Promise<{ id: string }> };

// Delete a check-in and the records derived from it: the AI action items it
// generated and its timeline event. The cumulative client_progress narrative is
// left as-is (it can't be cleanly un-merged from a single call).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const checkIn = await getCheckInById(id);
  if (!checkIn) return NextResponse.json({ error: 'Check-in not found' }, { status: 404 });

  await deleteActionItemsForCheckIn(id).catch(() => {});
  await deleteEventsByRef('check_ins', id);
  await deleteCheckIn(id);

  // Scrub the deleted call's data from the client's rolling progress (client-facing
  // via /api/me/progress). Unmatched check-ins have no client to update.
  if (checkIn.client_email) {
    await recomputeProgressAfterCheckInDeletion(checkIn.client_email).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
