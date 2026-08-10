import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { acqEditKind } from '@/lib/acquisition-config';
import { isAcqAdmin } from '@/lib/acquisition-admin';

export const runtime = 'nodejs';

const BUCKET = 'acquisition-docs';
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

// A client uploads a PDF for an Acquisition Dashboard "product" page. Stored in
// a public Supabase Storage bucket; the returned URL is saved by the caller via
// PUT /api/me/acquisition. Mirrors the onboarding upload flow.
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const pageId = String(form?.get('pageId') || '');
  const requested = String(form?.get('client') || '').toLowerCase().trim();

  if (acqEditKind(pageId) !== 'product') return NextResponse.json({ error: 'Page does not accept uploads' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type && file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });

  // Acq-admins may upload on behalf of a client; the file is filed under that client.
  let targetEmail = user.email;
  if (requested && requested !== user.email.toLowerCase().trim()) {
    if (!(await isAcqAdmin(user.email))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    targetEmail = requested;
  }

  const storage = db().storage;
  const { error: bucketErr } = await storage.createBucket(BUCKET, {
    public: true, allowedMimeTypes: ['application/pdf'], fileSizeLimit: MAX_BYTES,
  });
  if (bucketErr && !/exist/i.test(bucketErr.message)) {
    return NextResponse.json({ error: `Storage: ${bucketErr.message}` }, { status: 500 });
  }

  const safeName = (file.name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const emailKey = targetEmail.toLowerCase().trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  const pathKey = pageId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${emailKey}/${pathKey}/${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });

  const { data: pub } = storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: pub.publicUrl, name: safeName });
}
