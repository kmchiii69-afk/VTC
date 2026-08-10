import { db, getRoadmapProgress, getUserFeatures } from '@/lib/kv';
import { countCompleted, getCurrentPhase, totalItems, type RoadmapPhase } from '@/lib/roadmap-data';
import { phasesFor } from '@/lib/roadmap-variant';
import { formatFormsForAI } from '@/lib/forms-store';

// Builds and caches each client's "content context" — the material the /select
// scripting bot uses to tailor reviews to THAT client's ICP/offer rather than
// SooWei's. Sources: their uploaded offer PDF, their onboarding submitted docs
// (PDFs), and a roadmap-progress summary.

const TABLE = 'client_content_context';
const ONBOARDING_UPLOADS = 'onboarding_uploads';
const MAX_DOC_CHARS = 12000;

const norm = (e: string) => e.toLowerCase().trim();

// Extract text from a public PDF url. pdf-parse is imported from its inner
// module to avoid the index.js debug-mode test-file read. Non-throwing.
async function extractPdfText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse(buf);
    return (data.text || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_DOC_CHARS);
  } catch {
    return '';
  }
}

function roadmapSummary(completed: string[], phases: RoadmapPhase[]): string {
  const done = new Set(completed);
  const phase = getCurrentPhase(completed, phases);
  const lines = phases.map((p) => {
    const c = p.items.filter((i) => done.has(i.id)).length;
    return `${p.title}: ${c}/${p.items.length}`;
  });
  return `Roadmap: ${countCompleted(completed, phases)}/${totalItems(phases)} steps complete. Currently in "${phase.title}".\n${lines.join('\n')}`;
}

interface ContextRow {
  client_email: string;
  offer_upload_text: string | null;
  onboarding_text: string | null;
  roadmap_text: string | null;
  updated_at: string;
}

async function getRow(email: string): Promise<ContextRow | null> {
  const { data } = await db().from(TABLE).select('*').eq('client_email', norm(email)).maybeSingle();
  return (data as ContextRow) ?? null;
}

// Re-derive onboarding-docs text + roadmap summary and store them. Keeps any
// existing directly-uploaded offer text. Returns the refreshed row.
export async function buildClientContext(email: string, force = false): Promise<ContextRow | null> {
  const e = norm(email);
  try {
    // Skip the (slow) PDF re-parse if we built recently and have content.
    const cached = await getRow(e);
    const fresh = cached && Date.parse(cached.updated_at) > Date.now() - 24 * 3600 * 1000 && (cached.onboarding_text || cached.roadmap_text);
    if (fresh && !force) return cached;

    // Onboarding submitted docs (the "submit-docs" upload step holds the PDFs).
    const { data: uploads } = await db()
      .from(ONBOARDING_UPLOADS)
      .select('file_url')
      .eq('user_email', e)
      .eq('step_id', 'submit-docs');
    const texts: string[] = [];
    for (const u of (uploads ?? []) as { file_url: string }[]) {
      const t = await extractPdfText(u.file_url);
      if (t) texts.push(t);
    }
    const onboarding_text = texts.join('\n\n---\n\n').slice(0, MAX_DOC_CHARS) || null;

    // Summarise against the roadmap this member is on — "Creative Specialist"
    // members have their own phases.
    const [completed, features] = await Promise.all([getRoadmapProgress(e), getUserFeatures(e).catch(() => null)]);
    const roadmap_text = completed.length ? roadmapSummary(completed, phasesFor(features)) : null;

    const row = {
      client_email: e,
      offer_upload_text: cached?.offer_upload_text ?? null,
      onboarding_text,
      roadmap_text,
      updated_at: new Date().toISOString(),
    };
    await db().from(TABLE).upsert(row, { onConflict: 'client_email' });
    return row;
  } catch {
    return await getRow(e);
  }
}

// Store the text of a PDF the client uploaded directly to the bot, then refresh.
export async function setOfferUpload(email: string, text: string): Promise<void> {
  const e = norm(email);
  try {
    await db().from(TABLE).upsert(
      { client_email: e, offer_upload_text: text.slice(0, MAX_DOC_CHARS), updated_at: new Date().toISOString() },
      { onConflict: 'client_email' }
    );
  } catch {
    /* non-fatal */
  }
}

/**
 * Forget the offer doc a client uploaded to the bot. Uploading the wrong PDF used
 * to be permanent — the extracted text stayed as their context with no way to
 * take it back — so this is the delete side of setOfferUpload.
 */
export async function clearOfferUpload(email: string): Promise<boolean> {
  const e = norm(email);
  const { error } = await db().from(TABLE)
    .update({ offer_upload_text: null, updated_at: new Date().toISOString() })
    .eq('client_email', e);
  return !error;
}

export { extractPdfText };

// Assemble the client's CACHED context into a prompt block (fast — no PDF
// parsing in the hot path; the cache is warmed by buildClientContext on /select
// load and on offer upload). Returns '' if the client has no context yet.
export async function getClientContextText(email: string): Promise<string> {
  const parts: string[] = [];
  const row = await getRow(email);
  if (row) {
    if (row.offer_upload_text) parts.push(`OFFER (uploaded by the client):\n${row.offer_upload_text}`);
    if (row.onboarding_text) parts.push(`ONBOARDING DOCS (offer + market research the client submitted):\n${row.onboarding_text}`);
    if (row.roadmap_text) parts.push(row.roadmap_text);
  }
  const forms = await formatFormsForAI(email);
  if (forms) parts.push(`ONBOARDING FORM RESPONSES:\n${forms}`);
  return parts.join('\n\n');
}
