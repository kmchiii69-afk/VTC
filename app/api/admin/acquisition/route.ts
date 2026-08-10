import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { setAdminContent } from '@/lib/acquisition-admin-content';
import { getAcqPage } from '@/lib/acquisition-data';
import { acqAdminEditable } from '@/lib/acquisition-config';
import { isAcqAdmin } from '@/lib/acquisition-admin';

// Acq-admin: upsert global content for one Acquisition Dashboard page. Shows for
// every acquisition-tagged client.
export async function PUT(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || !(await isAcqAdmin(auth.email))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const pageId = String(body?.pageId || '');
  if (!getAcqPage(pageId) || !acqAdminEditable(pageId)) {
    return NextResponse.json({ error: 'Page is not admin-editable' }, { status: 400 });
  }
  const data = (body?.data && typeof body.data === 'object') ? body.data : {};

  try {
    await setAdminContent(pageId, data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
