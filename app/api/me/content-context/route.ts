import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { buildClientContext } from '@/lib/ai/client-context';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Warms a client's content-context cache (extracts their onboarding PDFs +
// roadmap). Called from /select on load so reviews read cached context fast.
export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const row = await buildClientContext(user.email);
  return NextResponse.json({
    ok: true,
    hasOffer: !!row?.offer_upload_text,
    hasOnboarding: !!row?.onboarding_text,
    hasRoadmap: !!row?.roadmap_text,
  });
}
