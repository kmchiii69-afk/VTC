import crypto from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Fathom signs every webhook with the Svix scheme:
//   headers: webhook-id, webhook-timestamp, webhook-signature
//   signed content: `${id}.${timestamp}.${rawBody}`
//   signature: base64( HMAC-SHA256( base64decode(secret after "whsec_"), content ) )
//   webhook-signature header is a space-delimited list of `v1,<sig>` entries.
// Docs: https://developers.fathom.ai/webhooks
//
// FATHOM_WEBHOOK_SECRET must hold the `whsec_…` secret Fathom shows when the
// webhook is created (NOT an arbitrary string).
// ─────────────────────────────────────────────────────────────────────────────

const TOLERANCE_SECONDS = 5 * 60; // reject stale/replayed deliveries

export interface FathomVerifyResult {
  ok: boolean;
  reason?: string;
}

function decodeSecret(secret: string): Buffer {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  return Buffer.from(raw, 'base64');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify a Fathom (Svix) webhook signature.
 * @param rawBody  the exact request body string (must NOT be re-serialized)
 * @param headers  the incoming request headers
 * @param secret   the `whsec_…` value from FATHOM_WEBHOOK_SECRET
 */
export function verifyFathomSignature(
  rawBody: string,
  headers: Headers,
  secret: string | undefined
): FathomVerifyResult {
  if (!secret) return { ok: false, reason: 'no_secret_configured' };

  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatureHeader = headers.get('webhook-signature');
  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: 'missing_signature_headers' };
  }

  // Replay protection.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', decodeSecret(secret))
    .update(signedContent)
    .digest('base64');

  // Header may carry multiple space-delimited `version,signature` pairs.
  for (const part of signatureHeader.split(' ')) {
    const comma = part.indexOf(',');
    const sig = comma === -1 ? part : part.slice(comma + 1);
    if (sig && timingSafeEqualStr(sig, expected)) return { ok: true };
  }
  return { ok: false, reason: 'signature_mismatch' };
}
