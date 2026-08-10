import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser, updateUser } from '@/lib/kv';
import { signContract } from '@/lib/contracts';
import { logEvent } from '@/lib/journey';
import { sendSubmissionNotice } from '@/lib/discord/notify';
import { ONBOARDING_STEPS } from '@/lib/onboarding-data';
import { contractTierLabel } from '@/lib/client-tags';

export const dynamic = 'force-dynamic';

const KNOWN_TIERS = new Set(ONBOARDING_STEPS.flatMap((s) => s.contracts ?? []).map((c) => c.tier));

// Client-facing: capture an electronic signature and produce the signed PDF.
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tier = String(body.tier || '').trim();
  const signerName = String(body.signerName || '').trim();
  const signaturePng = String(body.signaturePng || '');

  if (!KNOWN_TIERS.has(tier)) return NextResponse.json({ error: 'Unknown contract tier' }, { status: 400 });
  if (signerName.length < 2) return NextResponse.json({ error: 'Please enter your full legal name' }, { status: 400 });
  if (!signaturePng.startsWith('data:image/')) return NextResponse.json({ error: 'Please add your signature' }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ error: 'You must agree to sign electronically' }, { status: 400 });

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
  const userAgent = req.headers.get('user-agent');

  try {
    const { record, viewUrl } = await signContract({ email: user.email, tier, signerName, signaturePng, ip, userAgent });

    // Record the chosen tier on the account + log the journey event.
    await updateUser(user.email, { contract_tier: tier });
    await logEvent({
      clientEmail: user.email,
      type: 'contract_signed',
      title: `Signed ${contractTierLabel(tier)}`,
      summary: `Signed electronically by ${signerName}`,
      refTable: 'contract_signatures',
      refId: record.id,
      metadata: { tier, sha256: record.doc_sha256 },
    });

    // Notify the team with a link to the signed PDF.
    const profile = await getUser(user.email);
    await sendSubmissionNotice({
      webhookUrl: process.env.DISCORD_DOCS_WEBHOOK_URL,
      who: profile?.name || user.email,
      label: `Signed ${contractTierLabel(tier)}`,
      link: viewUrl || undefined,
      linkLabel: 'Open signed PDF',
    });

    return NextResponse.json({ ok: true, signedAt: record.signed_at, tier, viewUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Signing failed' }, { status: 500 });
  }
}
