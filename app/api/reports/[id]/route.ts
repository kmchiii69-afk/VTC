import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { data, error } = await db()
    .from('icp_reports')
    .select(`
      id,
      created_at,
      icp_score,
      pain_points,
      call_summary,
      next_step,
      full_analysis,
      discord_sent,
      user_feedback,
      feedback_applied,
      calls (
        id,
        fathom_call_id,
        raw_payload,
        status
      )
    `)
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
