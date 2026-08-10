import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

export async function GET() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
        lead_name,
        closer,
        setter,
        call_date,
        outcome,
        product,
        revenue,
        cash_collected,
        source,
        raw_payload,
        status
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
