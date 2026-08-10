import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { getAcqContent, setAcqContent } from '@/lib/acquisition-content';
import { acqEditKind } from '@/lib/acquisition-config';
import { isAcqAdmin } from '@/lib/acquisition-admin';

export const dynamic = 'force-dynamic';

// Resolve which client's content the caller may act on. Callers act on their own
// content by default; an acquisition admin may pass ?client=<email> (GET) or
// { client } (PUT) to view/edit any client's content on their behalf.
async function resolveTarget(callerEmail: string, requested: string | null): Promise<string | null> {
  const want = (requested || '').toLowerCase().trim();
  if (!want || want === callerEmail.toLowerCase().trim()) return callerEmail;
  return (await isAcqAdmin(callerEmail)) ? want : null; // null = forbidden
}

// GET — a client's Acquisition Dashboard edits, keyed by page id.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const target = await resolveTarget(auth.email, req.nextUrl.searchParams.get('client'));
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const content = await getAcqContent(target);
  return NextResponse.json({ content });
}

// PUT — upsert one page's content. Only whitelisted (editable) pages are allowed.
export async function PUT(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getUser(auth.email);
  if (!user || !user.active) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const pageId = String(body?.pageId || '');
  if (!acqEditKind(pageId)) return NextResponse.json({ error: 'Page is not editable' }, { status: 400 });
  const data = (body?.data && typeof body.data === 'object') ? body.data : {};

  const target = await resolveTarget(auth.email, body?.client ?? null);
  if (!target) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    await setAcqContent(target, pageId, data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
