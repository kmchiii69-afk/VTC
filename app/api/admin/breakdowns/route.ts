import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { createBreakdown } from '@/lib/breakdowns';
import { notifyBreakdownUploaded } from '@/lib/discord';
import { summarizeTranscript } from '@/lib/ai/summarize';

export const runtime = 'nodejs';

const BUCKET = 'breakdown-images';
const MAX_BYTES = 8 * 1024 * 1024;

async function requireAdmin() {
  const auth = await getAuthUser();
  return auth && auth.role === 'admin' ? auth : null;
}

// Admin: create a new Exclusive Guest Mastermind tile. Accepts multipart form
// with fields: title, embed_code, summary_url, image_url, and an optional
// `image` file (uploaded to a public bucket). Fires the recordings-channel
// Discord notification on success.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const title = String(form.get('title') || '').trim();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  const embed_code = String(form.get('embed_code') || '').trim() || null;
  const summary_url = String(form.get('summary_url') || '').trim() || null;
  const transcript = String(form.get('transcript') || '');
  let image = String(form.get('image_url') || '').trim();

  const file = form.get('image');
  if (file instanceof File && file.size > 0) {
    if (file.type && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are supported' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 8MB)' }, { status: 400 });
    const storage = db().storage;
    const { error: bucketErr } = await storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES });
    if (bucketErr && !/exist/i.test(bucketErr.message)) {
      return NextResponse.json({ error: `Storage: ${bucketErr.message}` }, { status: 500 });
    }
    const safeName = (file.name || 'image.png').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await storage.from(BUCKET).upload(path, bytes, { contentType: file.type || 'image/png', upsert: true });
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
    image = storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  try {
    const item = await createBreakdown({ title, image, embed_code, summary_url });
    const summary = await summarizeTranscript(transcript, title);
    try { await notifyBreakdownUploaded({ slug: item.slug, title: item.title, embed_code: item.embed_code, summary }); } catch (e) { console.error('[breakdowns] discord notify failed', e); }
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
