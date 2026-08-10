import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getReportById, setSent, MigrationPendingError } from '@/lib/creative-weekly-report-store';

type Params = { params: Promise<{ id: string }> };

// The only admin action on a weekly report: mark it sent to the founder (or
// un-send it). The report is entirely member-authored — we read it and send it,
// we don't edit it — so there is no write path for answers here.
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const existing = await getReportById(id);
  if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (typeof body?.sent !== 'boolean') {
    return NextResponse.json({ error: 'sent (boolean) required' }, { status: 400 });
  }

  try {
    const row = await setSent(id, body.sent);
    return NextResponse.json({ ok: true, sentAt: row?.sent_at ?? null });
  } catch (e) {
    const pending = e instanceof MigrationPendingError;
    return NextResponse.json(
      { error: pending ? e.message : 'Could not update the report — try again.' },
      { status: pending ? 503 : 500 },
    );
  }
}
