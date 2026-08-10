import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { report_id, feedback } = await req.json();
  if (!report_id || !feedback) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const { error } = await db()
    .from('icp_reports')
    .update({ user_feedback: feedback, feedback_applied: false })
    .eq('id', report_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
