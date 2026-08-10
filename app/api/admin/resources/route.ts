import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createResource } from '@/lib/resources';
import type { ResourceType } from '@/lib/resources-data';

const TYPES: ResourceType[] = ['native', 'embed', 'template'];

// Admin: create a resource.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || '').trim();
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
  const type: ResourceType = TYPES.includes(b.type) ? b.type : 'native';
  try {
    const row = await createResource({
      title,
      description: String(b.description || '').trim(),
      category: String(b.category || 'Resources').trim() || 'Resources',
      type,
      body: typeof b.body === 'string' ? b.body : '',
      embed_url: b.embed_url ? String(b.embed_url).trim() : null,
      template_url: b.template_url ? String(b.template_url).trim() : null,
      upload_step_id: b.upload_step_id ? String(b.upload_step_id).trim() : null,
      upload_slot: b.upload_slot ? String(b.upload_slot).trim() : null,
    });
    return NextResponse.json(row ?? {});
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
