import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { writeWithOptionalColumns } from '@/lib/db-write';

type Params = { params: Promise<{ id: string }> };

// Manual admin override of a call's money / outcome fields. The Fathom sync and
// webhook AI-fill these when stated on the call, but an admin can correct them
// here (e.g. enter cash collected the transcript never mentioned).
const ALLOWED_OUTCOMES = ['closed', 'no_close', 'dq', 'no_show', 'unknown'];

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  if (body.outcome !== undefined) {
    if (!ALLOWED_OUTCOMES.includes(body.outcome)) {
      return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 });
    }
    updates.outcome = body.outcome;
    // Hand-corrected outcomes are the source of truth — pin it so a later
    // re-analysis (Retry Failed / re-sync) can't flip a DQ back to no-close.
    updates.outcome_locked = true;
  }
  if (body.revenue !== undefined) {
    const n = Number(body.revenue);
    updates.revenue = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  if (body.cash_collected !== undefined) {
    const n = Number(body.cash_collected);
    updates.cash_collected = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  if (body.lead_name !== undefined) {
    const name = String(body.lead_name).trim();
    if (name) updates.lead_name = name;
  }
  if (body.closer !== undefined) {
    updates.closer = String(body.closer).trim() || null;
  }
  if (body.call_date !== undefined) {
    const raw = String(body.call_date).trim();
    if (!raw) {
      updates.call_date = null;
    } else {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
      updates.call_date = d.toISOString();
    }
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await writeWithOptionalColumns('calls', updates, {
    id, optional: ['outcome_locked'],
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Permanently delete a sales call and its analysis report(s). Used to clear out
// calls an admin doesn't want surfaced in the dashboard.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  // Remove the analysis first (icp_reports.call_id → calls.id), then the call.
  await db().from('icp_reports').delete().eq('call_id', id);
  const { error } = await db().from('calls').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
