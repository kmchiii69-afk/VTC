import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

const BUCKET = 'ba-beta-docs';
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

// Admin: upload a PDF for a VTC Beta resource pill. Stored in a
// public Supabase Storage bucket; the returned public URL is saved into the
// resource's `url` field and rendered in the same iframe popup as pasted links.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });

  const storage = db().storage;
  const { error: bucketErr } = await storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['application/pdf'],
    fileSizeLimit: MAX_BYTES,
  });
  if (bucketErr && !/exist/i.test(bucketErr.message)) {
    return NextResponse.json({ error: `Storage: ${bucketErr.message}` }, { status: 500 });
  }

  const safeName = (file.name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  // Unique path so multiple files (even same-named) don't overwrite each other.
  const path = `${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });

  const { data: pub } = storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: pub.publicUrl, name: safeName });
}
