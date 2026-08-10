import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { isAcqAdmin, canAdminManageClient } from '@/lib/acquisition-admin';
import {
  getAcqRoadmapDef, setAcqRoadmapDef, getAcqRoadmapProgress, setAcqRoadmapItem,
} from '@/lib/acquisition-roadmap';
import { normalizeRoadmap, flatStepIds } from '@/lib/acquisition-roadmap-data';

export const dynamic = 'force-dynamic';

// GET: the shared roadmap definition + the caller's tick progress. An acq-admin
// may pass ?client=<email> to read a specific client's progress instead.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const client = req.nextUrl.searchParams.get('client');
  let target = auth.email;
  if (client && (await canAdminManageClient(auth.email, client))) target = client;

  const [def, completed] = await Promise.all([getAcqRoadmapDef(), getAcqRoadmapProgress(target)]);
  return NextResponse.json({ def, completed, canEdit: await isAcqAdmin(auth.email) });
}

// PUT: acq-admin saves the shared roadmap definition (applies to every client).
export async function PUT(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || !(await isAcqAdmin(auth.email))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const def = normalizeRoadmap(body?.def);
  if (!def.weeks.length) return NextResponse.json({ error: 'Roadmap needs at least one week' }, { status: 400 });

  try {
    await setAcqRoadmapDef(def);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, def });
}

// POST: tick / untick one step. Members act on their own progress; an acq-admin
// may pass client to tick on behalf of the client they're viewing.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body?.itemId === 'string' ? body.itemId : '';
  const completed = Boolean(body?.completed);
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

  const client = typeof body?.client === 'string' ? body.client : '';
  let target = auth.email;
  if (client && (await canAdminManageClient(auth.email, client))) target = client;

  // Only accept ids that exist in the current roadmap definition.
  const def = await getAcqRoadmapDef();
  if (!flatStepIds(def).includes(itemId)) {
    return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
  }

  try {
    await setAcqRoadmapItem(target, itemId, completed);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
