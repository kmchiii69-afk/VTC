import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { isBreakdownSlug, updateBreakdown, deleteBreakdown } from '@/lib/breakdowns';

type Params = { params: Promise<{ slug: string }> };
const BUCKET = 'call-summaries';
const MAX_BYTES = 25 * 1024 * 1024;

async function requireAdmin() {
  const auth = await getAuthUser();
  return auth && auth.role === 'admin' ? auth : null;
}

// Admin: edit a breakdown's embed code and/or summary link.
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { slug } = await params;
  if (!(await isBreakdownSlug(slug))) return NextResponse.json({ error: 'Unknown breakdown' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  try {
    await updateBreakdown(slug, {
      ...(b.title !== undefined ? { title: String(b.title).trim() } : {}),
      ...(b.image !== undefined ? { image: String(b.image).trim() } : {}),
      ...(b.embed_code !== undefined ? { embed_code: String(b.embed_code).trim() || null } : {}),
      ...(b.summary_url !== undefined ? { summary_url: String(b.summary_url).trim() || null } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

// Admin: delete an Exclusive Guest Mastermind tile.
export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { slug } = await params;
  try {
    await deleteBreakdown(slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

// Admin: upload a summary PDF for a breakdown (stored in the shared summaries bucket).
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { slug } = await params;
  if (!(await isBreakdownSlug(slug))) return NextResponse.json({ error: 'Unknown breakdown' }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type && file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });

  const storage = db().storage;
  const { error: bucketErr } = await storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ['application/pdf'], fileSizeLimit: MAX_BYTES });
  if (bucketErr && !/exist/i.test(bucketErr.message)) return NextResponse.json({ error: `Storage: ${bucketErr.message}` }, { status: 500 });

  const safeName = (file.name || 'summary.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `breakdowns/${slug}/${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });

  const { data: pub } = storage.from(BUCKET).getPublicUrl(path);
  await updateBreakdown(slug, { summary_url: pub.publicUrl });
  return NextResponse.json({ ok: true, summary_url: pub.publicUrl });
}
