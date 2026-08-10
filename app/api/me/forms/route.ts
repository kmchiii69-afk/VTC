import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getSubmittedForms } from '@/lib/forms-store';

// Which onboarding forms the signed-in client has submitted.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await getSubmittedForms(user.email));
}
