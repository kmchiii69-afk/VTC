import { NextRequest, NextResponse } from 'next/server';
import { parseAlowareEvent, verifyAlowareWebhook } from '@/lib/aloware';
import { applyAlowareEvent } from '@/lib/aloware-sync';

/**
 * Aloware's webhook — every call and text the team makes, landing in the CRM.
 *
 * Point Aloware → Integrations → Webhooks at this URL with Bearer auth set to
 * ALOWARE_WEBHOOK_SECRET, and subscribe the communication events (initiated is
 * noise; you want "Communication disposed" / "Call disposed", plus "Recording
 * saved", "Transcription saved" and "Call summarized" if you want those on the
 * timeline). Every one of those fires for the same communication id, and
 * applyAlowareEvent folds them into a single touchpoint rather than four.
 *
 * This is the only inbound path — Aloware publishes no endpoint for listing past
 * communications, so there is no sweep that can pick up an event dropped here. That
 * is why the receiver is idempotent instead of reconciled, and why it never rejects
 * work it merely can't attribute.
 *
 * Reachable without an auth cookie (proxy.ts allowlists /api/webhooks/), secured by
 * the shared secret. With ALOWARE_WEBHOOK_SECRET unset, verify fails closed and
 * this endpoint answers 403 to everything.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!verifyAlowareWebhook(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: true, skipped: 'unreadable body' });

  // Aloware posts one communication per delivery, but its "test webhook" button and
  // some bulk events send a list. Handling both costs one line.
  const items = Array.isArray(payload) ? payload : [payload];

  const results = [];
  for (const item of items) {
    const event = parseAlowareEvent(item);
    const res = await applyAlowareEvent(event);

    if (!res.ok) console.error(`[aloware] ${event.id ?? 'no-id'}: ${res.error}`);
    else if (res.warning) console.warn(`[aloware] ${event.id}: ${res.warning}`);
    else if (res.skipped) {
      // No id means the envelope didn't parse, which is what a change to Aloware's
      // payload shape looks like from here. Log the key names — not the values, so
      // no phone numbers or message bodies land in the log — because otherwise the
      // only evidence is a skip reason that names nothing.
      const shape =
        !event.id && item && typeof item === 'object' ? ` keys=[${Object.keys(item as object).join(',')}]` : '';
      console.log(`[aloware] ${event.id ?? 'no-id'} skipped — ${res.reason}${shape}`);
    }

    results.push({ id: event.id, kind: event.kind, ...res });
  }

  // Always 200, even on failure. Aloware retries non-2xx, and an event we can never
  // match (a number that isn't in the CRM) would retry forever; the console line
  // above is the record. A genuine outage shows up as missing calls in Close, which
  // the CRM timeline can still be reconciled against by hand.
  return NextResponse.json({ ok: true, events: results });
}
