import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import {
  submitWeeklyCash, getWeeklyCashForWeek, priorWeekMonday, mondayOf, isoDate, weekLabel, WEEKLY_CASH_FIRST_WEEK,
} from '@/lib/weekly-cash';

const BUCKET = 'leaderboard-proof';
const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

// Resolve the week a request is about: an explicit ?week=/weekStart= (normalized
// to its Monday), else last week (what the Monday prompt asks for). Never allow a
// future week — you can't report a week that hasn't finished.
function resolveWeek(raw: string | null | undefined): string {
  const fallback = isoDate(priorWeekMonday());
  if (!raw) return fallback;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return fallback;
  const wk = isoDate(mondayOf(d));
  const thisMonday = isoDate(mondayOf(new Date()));
  return wk > thisMonday ? fallback : wk; // clamp future → last week
}

// GET → the target week + the caller's existing submission for it (for prefill).
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const week = resolveWeek(req.nextUrl.searchParams.get('week'));
  const existing = await getWeeklyCashForWeek(user.email, week);

  return NextResponse.json({
    weekStart: week,
    weekLabel: weekLabel(week),
    submitted: !!existing,
    existing: existing
      ? { cash: Number(existing.cash_collected), note: existing.note ?? '', proofUrl: existing.proof_url, proofName: existing.proof_name }
      : null,
  });
}

// POST → submit (or update) organic cash + proof for a week. Multipart form:
// cash (number), weekStart (Monday ISO), note (optional), proof (image file).
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const cash = Number(form.get('cash'));
  if (!Number.isFinite(cash) || cash < 0) {
    return NextResponse.json({ error: 'Enter a valid cash amount ($0 or more)' }, { status: 400 });
  }

  const week = resolveWeek(String(form.get('weekStart') || ''));
  if (week < WEEKLY_CASH_FIRST_WEEK) {
    return NextResponse.json({ error: 'The leaderboard cycle hasn’t started for that week yet.' }, { status: 400 });
  }
  const note = String(form.get('note') || '').trim() || null;
  const existing = await getWeeklyCashForWeek(user.email, week);

  // Proof is required — the leaderboard only counts attributed organic C.C.
  const file = form.get('proof');
  const hasNewFile = file instanceof File && file.size > 0;
  if (!hasNewFile && !existing?.proof_url) {
    return NextResponse.json({ error: 'Attach proof of your organic cash collected' }, { status: 400 });
  }

  let proofUrl = existing?.proof_url ?? null;
  let proofName = existing?.proof_name ?? null;

  if (hasNewFile) {
    const f = file as File;
    if (f.type && !IMAGE_TYPES.includes(f.type)) {
      return NextResponse.json({ error: 'Proof must be an image (PNG, JPG, WEBP, or GIF)' }, { status: 400 });
    }
    if (f.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 15MB)' }, { status: 400 });

    const storage = db().storage;
    const { error: bucketErr } = await storage.createBucket(BUCKET, {
      public: true, allowedMimeTypes: IMAGE_TYPES, fileSizeLimit: MAX_BYTES,
    });
    if (bucketErr && !/exist/i.test(bucketErr.message)) {
      return NextResponse.json({ error: `Storage: ${bucketErr.message}` }, { status: 500 });
    }

    const safeName = (f.name || 'proof.png').replace(/[^a-zA-Z0-9._-]/g, '_');
    const emailKey = user.email.toLowerCase().trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${emailKey}/${week}/${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const { error: upErr } = await storage.from(BUCKET).upload(path, bytes, {
      contentType: f.type || 'image/png', upsert: true,
    });
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
    proofUrl = storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    proofName = safeName;
  }

  await submitWeeklyCash({ email: user.email, weekStart: week, cash, proofUrl, proofName, note });
  return NextResponse.json({ ok: true, weekStart: week });
}
