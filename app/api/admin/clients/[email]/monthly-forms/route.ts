import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { listForMember } from '@/lib/monthly-form';

type Params = { params: Promise<{ email: string }> };

// List a member's monthly-form submissions (newest month first) for the CSM view.
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { email } = await params;
  const forms = await listForMember(decodeURIComponent(email));
  return NextResponse.json(forms);
}
