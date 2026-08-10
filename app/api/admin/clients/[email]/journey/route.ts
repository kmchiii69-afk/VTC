import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getClientJourney } from '@/lib/csm';

type Params = { params: Promise<{ email: string }> };

// Full per-client journey overview for the CSM detail view.
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { email } = await params;
  const journey = await getClientJourney(decodeURIComponent(email));
  return NextResponse.json(journey);
}
