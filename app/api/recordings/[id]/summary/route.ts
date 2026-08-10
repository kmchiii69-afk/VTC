import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

const BUCKET = 'call-summaries';
const MAX_BYTES = 25 * 1024 * 1024; // 25MB guard

type Params = { params: Promise<{ id: string }> };

// Admin uploads a summary file (PDF) for a recording. Stores it in a public
// Supabase Storage bucket and saves the public URL as the recording's summary_url.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
  }

  const storage = db().storage;

  // Ensure the bucket exists (idempotent — ignore "already exists").
  const { error: bucketErr } = await storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['application/pdf'],
    fileSizeLimit: MAX_BYTES,
  });
  if (bucketErr && !/exist/i.test(bucketErr.message)) {
    return NextResponse.json({ error: `Storage: ${bucketErr.message}` }, { status: 500 });
  }

  const safeName = (file.name || 'summary.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${id}/${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });

  const { data: pub } = storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const { data, error } = await db()
    .from('call_recordings')
    .update({ summary_url: url })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? { summary_url: url });
}
