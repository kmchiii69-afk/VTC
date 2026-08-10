import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getModulesTree } from '@/lib/modules';

export const dynamic = 'force-dynamic';

// Any authenticated member can read the module catalog.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await getModulesTree());
  } catch {
    return NextResponse.json({ error: 'Catalog temporarily unavailable' }, { status: 503 });
  }
}
