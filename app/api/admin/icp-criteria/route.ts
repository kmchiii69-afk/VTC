import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

// In-app editor for the ICP lead-scoring rubric. The analyzer (analyzeClosingCall)
// reads the highest-version row's `criteria.rubric` prose and scores strictly to it.
// Saving inserts a NEW version (we never overwrite) so prior rubrics stay auditable.

export async function GET() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data } = await db()
    .from('icp_criteria')
    .select('criteria, version, created_at')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Mirror analyzeClosingCall's logic: prefer the `rubric` prose; otherwise fall
  // back to the stringified criteria object (what the model actually sees today).
  const criteria = (data?.criteria as { rubric?: unknown }) ?? {};
  const rubric = typeof criteria.rubric === 'string' && criteria.rubric.trim()
    ? criteria.rubric
    : (data?.criteria && Object.keys(criteria).length ? JSON.stringify(data.criteria, null, 2) : '');

  return NextResponse.json({
    rubric,
    version: data?.version ?? 0,
    updated_at: data?.created_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rubric = String(body.rubric ?? '').trim();
  if (!rubric) {
    return NextResponse.json({ error: 'Rubric cannot be empty.' }, { status: 400 });
  }

  // Next version = current max + 1.
  const { data: latest } = await db()
    .from('icp_criteria')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version ?? 0) + 1;

  const { error } = await db()
    .from('icp_criteria')
    .insert({ criteria: { rubric }, version: nextVersion });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, version: nextVersion });
}
