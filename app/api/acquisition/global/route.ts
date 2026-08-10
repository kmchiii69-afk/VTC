import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getAllAdminContent } from '@/lib/acquisition-admin-content';

export const dynamic = 'force-dynamic';

// Admin-authored global content for the Acquisition Dashboard, read by clients.
// Any signed-in user may read it (only acquisition clients ever see the UI that
// fetches it); it exposes no per-client data.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const content = await getAllAdminContent();
  return NextResponse.json({ content });
}
