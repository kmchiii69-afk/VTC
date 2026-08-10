import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db, getUser } from '@/lib/kv';
import { addOnboardingUpload, deleteOnboardingUpload, getOnboardingUploads } from '@/lib/onboarding';
import { logEvent } from '@/lib/journey';
import { ONBOARDING_STEPS } from '@/lib/onboarding-data';
import { sendSubmissionNotice } from '@/lib/discord/notify';

// The Submit Docs step has two labeled slots; each notifies Channel 3 on its
// first upload. Slot id -> display label.
const UPLOAD_SLOTS: Record<string, string> = { pmf: 'Product Market Fit', offer: 'Offer Doc' };

const BUCKET = 'onboarding-docs';
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

// A client uploads a PDF for a step that requires it (e.g. completed docs for
// approval). Stored in a public Supabase Storage bucket; the URL is saved
// against the client + step and logged on their journey.
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const stepId = String(form?.get('stepId') || '');
  const slot = String(form?.get('slot') || '');           // 'pmf' | 'offer' | ''
  const slotLabel = UPLOAD_SLOTS[slot];                    // undefined if no/invalid slot
  // Files are stored under a per-slot key so the two slots stay separate.
  const storeKey = slotLabel ? `${stepId}:${slot}` : stepId;

  const step = ONBOARDING_STEPS.find((s) => s.id === stepId);
  if (!step?.requiresUpload) return NextResponse.json({ error: 'Step does not accept uploads' }, { status: 400 });
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

  // Is this the first file for this slot? (drives the one-time Discord ping)
  const firstForSlot = slotLabel
    ? ((await getOnboardingUploads(user.email))[storeKey]?.length ?? 0) === 0
    : false;

  const safeName = (file.name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const emailKey = user.email.toLowerCase().trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  const pathKey = storeKey.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Unique path so multiple files (even same-named) don't overwrite each other.
  const path = `${emailKey}/${pathKey}/${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });

  const { data: pub } = storage.from(BUCKET).getPublicUrl(path);
  const url = pub.publicUrl;

  const record = await addOnboardingUpload(user.email, storeKey, url, safeName);
  await logEvent({
    clientEmail: user.email,
    type: 'document_uploaded',
    title: `Uploaded document · ${slotLabel || step.title}`,
    summary: safeName,
    refTable: 'onboarding_uploads',
    refId: storeKey,
    metadata: { file_url: url },
  });

  // Notify Discord: for a labeled slot, only the first file (legacy); for the
  // single-button upload step, every submitted document goes to the channel.
  const shouldNotify = slotLabel ? firstForSlot : !!step.requiresUpload;
  if (shouldNotify) {
    const profile = await getUser(user.email);
    await sendSubmissionNotice({
      webhookUrl: process.env.DISCORD_DOCS_WEBHOOK_URL,
      who: profile?.name || user.email,
      label: slotLabel || step.title,
      link: url,            // direct public link to the uploaded PDF
      linkLabel: 'Open PDF',
    });
  }

  return NextResponse.json({ ok: true, file: record ?? { id: '', url, name: safeName } });
}

// Remove one previously-uploaded file.
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json().catch(() => ({ id: '' }));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await deleteOnboardingUpload(user.email, id);
  return NextResponse.json({ ok: true });
}
