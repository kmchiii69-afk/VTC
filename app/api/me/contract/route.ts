import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { getTemplates, getLatestSignature, signedUrl } from '@/lib/contracts';
import { contractTierFromTags, contractTierLabel } from '@/lib/client-tags';

export const dynamic = 'force-dynamic';

// Client-facing: the contract templates available to read/sign + whether this
// client has already signed (with a link to their signed copy).
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [templates, signature, profile] = await Promise.all([getTemplates(), getLatestSignature(user.email), getUser(user.email)]);

  // A 14k/25k tag locks the client to that single contract; otherwise show all.
  const forcedTier = contractTierFromTags(profile?.tags);
  const visible = forcedTier ? templates.filter((t) => t.tier === forcedTier) : templates;

  // Label by duration, not by the stored label — templates uploaded before the
  // rename still carry a price in contract_templates.label.
  const tiers = await Promise.all(
    visible.map(async (t) => ({ tier: t.tier, label: contractTierLabel(t.tier) || t.label, version: t.version, viewUrl: await signedUrl(t.storage_path) }))
  );

  const signed = signature
    ? {
        tier: signature.tier,
        signerName: signature.signer_name,
        signedAt: signature.signed_at,
        viewUrl: await signedUrl(signature.signed_path),
      }
    : null;

  return NextResponse.json({ tiers, signed }, { headers: { 'Cache-Control': 'no-store' } });
}
