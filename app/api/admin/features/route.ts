import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getDefaultFeatures, setDefaultFeatures } from '@/lib/settings';
import { setAllMemberFeatures } from '@/lib/kv';
import { PORTAL_FEATURES } from '@/lib/features';

async function requireAdmin() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return null;
  return auth;
}

// GET → current global default + the full feature catalog (for the admin UI).
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({
    default: await getDefaultFeatures(),
    features: PORTAL_FEATURES,
  });
}

// PUT → set the global default feature set (applies to new + ungated members).
export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.default)) {
    return NextResponse.json({ error: 'default[] required' }, { status: 400 });
  }
  try {
    return NextResponse.json({ default: await setDefaultFeatures(body.default) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

// POST → bulk-apply a feature set to ALL existing members at once.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.features)) {
    return NextResponse.json({ error: 'features[] required' }, { status: 400 });
  }
  try {
    const updated = await setAllMemberFeatures(body.features);
    return NextResponse.json({ updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
