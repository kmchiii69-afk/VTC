import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createBetaLesson } from '@/lib/ba-beta';

// Admin: add a lesson (embed video) to a category.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const category_id = String(b.category_id || '').trim();
  const title = String(b.title || '').trim();
  const embed_id = String(b.embed_id || '').trim();
  if (!category_id) return NextResponse.json({ error: 'Category required' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
  try {
    const row = await createBetaLesson({ category_id, title, embed_id });
    return NextResponse.json(row ?? {});
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
