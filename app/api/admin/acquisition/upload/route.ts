import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { getAcqPage } from '@/lib/acquisition-data';
import { acqAdminEditable } from '@/lib/acquisition-config';
import { isAcqAdmin } from '@/lib/acquisition-admin';

export const runtime = 'nodejs';

const BUCKET = 'acquisition-docs';
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

// Acq-admin: upload a PDF (SOP) for a global Acquisition Dashboard page. The URL
// is then persisted by the caller via PUT /api/admin/acquisition.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || !(await isAcqAdmin(auth.email))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const pageId = String(form?.get('pageId') || '');

  if (!getAcqPage(pageId) || !acqAdminEditable(pageId)) return NextResponse.json({ error: 'Page is not admin-editable' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type && file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });

  const storage = db().storage;
  const { error: bucketErr } = await storage.createBucket(BUCKET, {
    public: true, allowedMimeTypes: ['application/pdf'], fileSizeLimit: MAX_BYTES,
  });
  if (bucketErr && !/exist/i.test(bucketErr.message)) {
    return NextResponse.json({ error: `Storage: ${bucketErr.message}` }, { status: 500 });
  }

  const safeName = (file.name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const pathKey = pageId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `global/${pathKey}/${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });

  const { data: pub } = storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: pub.publicUrl, name: safeName });
}
