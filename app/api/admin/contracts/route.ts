import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getTemplates, uploadTemplate, signedUrl } from '@/lib/contracts';
import { ONBOARDING_STEPS } from '@/lib/onboarding-data';
import { contractTierLabel } from '@/lib/client-tags';

export const dynamic = 'force-dynamic';

const KNOWN_TIERS = new Set(ONBOARDING_STEPS.flatMap((s) => s.contracts ?? []).map((c) => c.tier));
const MAX_BYTES = 25 * 1024 * 1024;

async function requireAdmin() {
  const auth = await getAuthUser();
  return auth && auth.role === 'admin' ? auth : null;
}

// Admin: list templates (with a short-lived preview URL each).
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const tmpls = await getTemplates();
  const withUrls = await Promise.all(
    tmpls.map(async (t) => ({ tier: t.tier, label: contractTierLabel(t.tier) || t.label, version: t.version, viewUrl: await signedUrl(t.storage_path) }))
  );
  // The tiers onboarding offers (so the admin UI shows a slot for each).
  const knownTiers = ONBOARDING_STEPS.flatMap((s) => s.contracts ?? []).map((c) => ({ tier: c.tier, label: c.label }));
  return NextResponse.json({ templates: withUrls, knownTiers });
}

// Admin: upload (or replace) a tier's contract template PDF.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const tier = String(form?.get('tier') || '').trim();
  const label = String(form?.get('label') || '').trim();
  if (!KNOWN_TIERS.has(tier)) return NextResponse.json({ error: 'Unknown tier' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.type && file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const t = await uploadTemplate(tier, label, bytes);
    return NextResponse.json({ ok: true, template: { tier: t.tier, label: t.label, version: t.version } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
