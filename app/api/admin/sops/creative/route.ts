import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { createCreativeSop } from '@/lib/creative-sops';

export const runtime = 'nodejs';

const BUCKET = 'sop-files';
const MAX_BYTES = 30 * 1024 * 1024;

async function requireAdmin() {
  const auth = await getAuthUser();
  return auth && auth.role === 'admin' ? auth : null;
}

// Admin: add a Creative Specialist SOP. Multipart form: title, sub, and either a
// PDF `file` (uploaded to a public bucket) or a `file_url`.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const title = String(form.get('title') || '').trim();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  const sub = String(form.get('sub') || '').trim();
  let file = String(form.get('file_url') || '').trim();

  const upload = form.get('file');
  if (upload instanceof File && upload.size > 0) {
    if (upload.type && upload.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }
    if (upload.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 30MB)' }, { status: 400 });
    const storage = db().storage;
    const { error: bucketErr } = await storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ['application/pdf'], fileSizeLimit: MAX_BYTES });
    if (bucketErr && !/exist/i.test(bucketErr.message)) {
      return NextResponse.json({ error: `Storage: ${bucketErr.message}` }, { status: 500 });
    }
    const safeName = (upload.name || 'sop.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const { error: upErr } = await storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
    file = storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  if (!file) return NextResponse.json({ error: 'Attach a PDF or provide a file URL' }, { status: 400 });

  try {
    const item = await createCreativeSop({ title, sub, file });
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
