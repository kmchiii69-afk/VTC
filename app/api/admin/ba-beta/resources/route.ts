import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createBetaResource, type BetaResourceKind } from '@/lib/ba-beta';

const KINDS: BetaResourceKind[] = ['link', 'note'];

// Admin: add a resource pill to a lesson.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const lesson_id = String(b.lesson_id || '').trim();
  const title = String(b.title || '').trim();
  const kind: BetaResourceKind = KINDS.includes(b.kind) ? b.kind : 'link';
  if (!lesson_id) return NextResponse.json({ error: 'Lesson required' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
  try {
    const row = await createBetaResource({
      lesson_id,
      title,
      kind,
      url: typeof b.url === 'string' ? b.url.trim() : '',
      body: typeof b.body === 'string' ? b.body : '',
      inline: b.inline === true,
    });
    return NextResponse.json(row ?? {});
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
