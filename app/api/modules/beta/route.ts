import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getBetaTree } from '@/lib/ba-beta';

export const dynamic = 'force-dynamic';

// Read-only Brand Architect catalog for ANY signed-in user (members + admins).
// This is what members now see on /modules in place of the Goh Consulting
// program catalog. All writes still go through the admin-only /api/admin/ba-beta
// endpoints, so members can read but never mutate it.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await getBetaTree());
  } catch {
    // Transient DB failure. 503 (not an empty tree) so /modules shows a retry
    // instead of an empty library.
    return NextResponse.json({ error: 'Catalog temporarily unavailable' }, { status: 503 });
  }
}
