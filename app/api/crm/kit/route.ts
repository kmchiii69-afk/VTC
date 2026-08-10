import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { kitListTags, kitListSequences } from '@/lib/kit';

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

// GET → the Kit tags + sequences, for the CRM dropdowns. Empty arrays when Kit
// isn't configured (never errors, so the UI degrades gracefully).
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const [tags, sequences] = await Promise.all([kitListTags(), kitListSequences()]);
  return NextResponse.json({ tags, sequences });
}
