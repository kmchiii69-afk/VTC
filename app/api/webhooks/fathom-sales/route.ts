import { NextRequest, NextResponse } from 'next/server';
import { verifyFathomSignature } from '@/lib/fathom-verify';
import { processSalesCall } from '@/lib/sales-call';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Dedicated webhook for the SALES MANAGER's / closer's separate Fathom account.
// Same closing-call pipeline as the unified /api/fathom/webhook, but verified
// against its OWN signing secret (FATHOM_SALES_WEBHOOK_SECRET) and tagged
// source='sales_manager' so the dashboard can filter these calls. Internal/team
// calls are skipped inside processSalesCall (see isInternalCallTitle).
//
// Fathom signs with the Svix scheme, so we verify exactly like the main webhook
// (lib/fathom-verify) — the previous hand-rolled HMAC did not match Fathom's
// real signatures and would have 401'd every live delivery.

// Local-only test bypass (same convention as the main webhook): set
// FATHOM_WEBHOOK_TEST_SECRET and pass ?secret= or x-webhook-secret. Never in prod.
function isTestBypass(req: NextRequest): boolean {
  const testSecret = process.env.FATHOM_WEBHOOK_TEST_SECRET;
  if (!testSecret) return false;
  const provided =
    req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('secret');
  return provided === testSecret;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    if (!isTestBypass(req)) {
      const verdict = verifyFathomSignature(
        rawBody,
        req.headers,
        process.env.FATHOM_SALES_WEBHOOK_SECRET
      );
      if (!verdict.ok) {
        console.warn('Sales Fathom webhook rejected:', verdict.reason);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const { report_id, skipped } = await processSalesCall(payload, { source: 'sales_manager' });
    if (skipped) return NextResponse.json({ success: true, skipped: true, reason: 'internal_call' });
    return NextResponse.json({ success: true, report_id });
  } catch (err) {
    console.error('Sales-manager Fathom webhook error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
