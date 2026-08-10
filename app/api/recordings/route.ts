import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { RECORDING_CATEGORY_IDS } from '@/lib/recordings';
import { notifyRecordingUploaded } from '@/lib/discord';
import { summarizeTranscript } from '@/lib/ai/summarize';

const CATEGORIES = RECORDING_CATEGORY_IDS;

// Any authenticated member can view recordings.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Manual drag-and-drop order wins; rows without a sort_order (legacy) fall
  // back to newest-call-date-first, after the manually-ordered ones.
  const { data, error } = await db()
    .from('call_recordings')
    .select('*')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('call_date', { ascending: false, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Only admins can add a recording.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!CATEGORIES.includes(b.category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  const embed = b.embed_code?.trim();
  const url = b.fathom_url?.trim();
  if (!embed && !url) return NextResponse.json({ error: 'Embed code required' }, { status: 400 });
  const row: Record<string, string | null> = {
    category: b.category,
    title: b.title?.trim() || null,
    embed_code: embed || null,
    fathom_url: url || null,
    call_date: b.call_date || null,
  };
  // Only send summary_url when provided, so adds still work before the
  // summary_url column migration has been run in prod.
  const summary = b.summary_url?.trim();
  if (summary) row.summary_url = summary;
  const { data, error } = await db().from('call_recordings').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Ping the recordings Discord channel — best-effort, never fails the upload.
  // The 2-line recap is auto-generated from a transcript when provided; otherwise
  // it falls back to a manual `summary` (notification-only, not a column).
  let notifySummary = typeof b.summary === 'string' ? b.summary.trim() : '';
  if (typeof b.transcript === 'string' && b.transcript.trim()) {
    const gen = await summarizeTranscript(b.transcript, (data?.title as string) || undefined);
    if (gen) notifySummary = gen;
  }
  try { await notifyRecordingUploaded({ ...data, summary: notifySummary || null }); } catch (e) { console.error('[recordings] discord notify failed', e); }
  return NextResponse.json(data);
}
