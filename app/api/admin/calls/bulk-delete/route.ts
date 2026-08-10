import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

// Delete many sales calls at once (and their analysis reports). Used by the
// "Delete selected" bulk action in the admin Sales Calls table.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === 'string' && !!x)
    : [];
  if (!ids.length) return NextResponse.json({ error: 'No call ids provided' }, { status: 400 });

  // Remove the analyses first (icp_reports.call_id → calls.id), then the calls.
  await db().from('icp_reports').delete().in('call_id', ids);
  const { error } = await db().from('calls').delete().in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: ids.length });
}
