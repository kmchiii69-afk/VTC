import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getRoadmapProgress } from '@/lib/kv';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { email } = await params;
  const completed = await getRoadmapProgress(decodeURIComponent(email));
  return NextResponse.json({ completed });
}
