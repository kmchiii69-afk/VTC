import crypto from 'node:crypto';
import { SignJWT } from 'jose';
import { normalizePhone } from '@/lib/contact-format';

/**
 * Twilio voice — server side of the CRM softphone.
 *
 * The browser holds a short-lived Access Token (minted here) and places calls
 * through a TwiML App. Twilio then fetches our TwiML webhook, which returns the
 * <Dial> that bridges the setter to the lead. That indirection is why a TwiML
 * App SID is required: the token can't carry a URL.
 *
 * Everything degrades to a clear "not configured" message rather than throwing,
 * so the CRM still works while credentials/numbers are still being set up.
 *
 * NOTE: deliberately does NOT import the `twilio` npm package. All three things
 * we need server-side are small, stable primitives — an HS256 JWT, an HMAC-SHA1
 * signature, and a fragment of XML — and pulling the full SDK into route handlers
 * ballooned the dev server's heap past 8 GB in minutes (its module graph is
 * enormous and Turbopack retains it across HMR). Each function below is verified
 * byte-for-byte against the SDK's output.
 */

export const TWILIO_ENV = {
  accountSid: () => process.env.TWILIO_ACCOUNT_SID ?? '',
  authToken:  () => process.env.TWILIO_AUTH_TOKEN ?? '',
  apiKeySid:  () => process.env.TWILIO_API_KEY_SID ?? '',
  apiKeySecret: () => process.env.TWILIO_API_KEY_SECRET ?? '',
  twimlAppSid: () => process.env.TWILIO_TWIML_APP_SID ?? '',
  numberUS: () => process.env.TWILIO_NUMBER_US ?? '',
  numberUK: () => process.env.TWILIO_NUMBER_UK ?? '',
  /** Where inbound calls to our numbers ring. Empty = play the callback message. */
  forwardNumber: () => (process.env.TWILIO_FORWARD_NUMBER ?? '').trim(),
  record: () => process.env.TWILIO_RECORD !== '0',
  recordingNotice: () => (process.env.TWILIO_RECORDING_NOTICE ?? '').trim(),
  appUrl: () => (process.env.APP_URL ?? '').replace(/\/+$/, ''),
};

export interface DialerStatus {
  ready: boolean;
  /** Human-readable reason the dialer can't place calls yet. */
  reason: string;
  callerIds: string[];
  recording: boolean;
}

/** What's still missing before a dial can succeed. Surfaced in the UI verbatim. */
export function dialerStatus(): DialerStatus {
  const missing: string[] = [];
  if (!TWILIO_ENV.accountSid()) missing.push('TWILIO_ACCOUNT_SID');
  if (!TWILIO_ENV.apiKeySid()) missing.push('TWILIO_API_KEY_SID');
  if (!TWILIO_ENV.apiKeySecret()) missing.push('TWILIO_API_KEY_SECRET');
  if (!TWILIO_ENV.twimlAppSid()) missing.push('TWILIO_TWIML_APP_SID (create a TwiML App in the Twilio console)');
  if (!TWILIO_ENV.numberUS() && !TWILIO_ENV.numberUK()) missing.push('TWILIO_NUMBER_US or TWILIO_NUMBER_UK (buy a number to use as caller ID)');

  const callerIds = [TWILIO_ENV.numberUS(), TWILIO_ENV.numberUK()].filter(Boolean);
  return {
    ready: missing.length === 0,
    reason: missing.length ? `Dialer not configured — missing ${missing.join(', ')}.` : '',
    callerIds,
    recording: TWILIO_ENV.record(),
  };
}

/* ─── Numbers ──────────────────────────────────────────────────────────── */

/**
 * Normalize to E.164. Never guesses a country: a number typed without a country
 * code is rejected rather than silently dialled as US, because a wrong guess
 * calls a stranger.
 */
export function toE164(raw: string, defaultCountryCode = ''): string | null {
  const cleaned = normalizePhone(raw);
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
  // No '+': only usable when the caller supplied an explicit dial prefix.
  const digits = cleaned.replace(/\D/g, '');
  const cc = defaultCountryCode.replace(/\D/g, '');
  if (cc && digits.length >= 6) {
    const local = digits.replace(new RegExp(`^${cc}`), '').replace(/^0+/, '');
    const candidate = `+${cc}${local}`;
    if (/^\+\d{8,15}$/.test(candidate)) return candidate;
  }
  return null;
}

// Country calling codes that should present the UK caller ID when we own one —
// a local-ish European number answers far better than a US one.
const UK_EU_PREFIXES = [
  '44',  // United Kingdom
  '353', // Ireland
  '49', '33', '31', '32', '34', '39', '351', '43', '41', // DE FR NL BE ES IT PT AT CH
  '45', '46', '47', '358', '48', '420', '30', '36', '40', // DK SE NO FI PL CZ GR HU RO
  '352', '353', '354', '356', '357', '359', '370', '371', '372', '385', '386',
];

/** Caller ID for a destination: UK number for UK/EU, US number for everything else. */
export function pickCallerId(to: string): string | null {
  const us = TWILIO_ENV.numberUS();
  const uk = TWILIO_ENV.numberUK();
  const digits = (to || '').replace(/\D/g, '');
  const isEu = UK_EU_PREFIXES.some((p) => digits.startsWith(p));
  if (isEu && uk) return uk;
  return us || uk || null;
}

/* ─── Access tokens ────────────────────────────────────────────────────── */

/**
 * A browser Voice token for one setter. `identity` is the setter's email — it
 * comes back on the webhook, which is how each dial gets attributed.
 */
export async function mintVoiceToken(identity: string, ttlSeconds = 3600): Promise<string> {
  const apiKeySid = TWILIO_ENV.apiKeySid();
  const iat = Math.floor(Date.now() / 1000);
  // Shape matches twilio.jwt.AccessToken exactly, including the `cty` header the
  // Voice SDK requires and the `<keySid>-<iat>` jti.
  return new SignJWT({
    jti: `${apiKeySid}-${iat}`,
    grants: {
      identity,
      // Outbound only — nothing dials into the browser, so no incoming grant.
      voice: { outgoing: { application_sid: TWILIO_ENV.twimlAppSid() } },
    },
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT', cty: 'twilio-fpa;v=1' })
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttlSeconds)
    .setIssuer(apiKeySid)
    .setSubject(TWILIO_ENV.accountSid())
    .sign(new TextEncoder().encode(TWILIO_ENV.apiKeySecret()));
}

/* ─── Webhook signature ────────────────────────────────────────────────── */

/**
 * Verify a request really came from Twilio. The signature is computed over the
 * exact URL Twilio was configured with, so build it from APP_URL rather than the
 * request host (Vercel's proxy rewrites Host, which would break the hash).
 */
export function validateTwilioRequest(
  signature: string | null,
  path: string,
  params: Record<string, string>,
  extraBases: string[] = [],
): boolean {
  const authToken = TWILIO_ENV.authToken();
  if (!authToken || !signature) return false;
  // Try APP_URL first, then the forwarded host — a mismatch between the two is
  // the single most likely reason a correctly-signed request would be rejected.
  const bases = [TWILIO_ENV.appUrl(), ...extraBases].filter(Boolean);
  return bases.some((base) => {
    const expected = signRequest(authToken, `${base.replace(/\/+$/, '')}${path}`, params);
    // Constant-time compare — the lengths always match (both base64 SHA-1).
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

/**
 * Twilio's signature: the full URL, then every POST field as key immediately
 * followed by value in key-sorted order, HMAC-SHA1 with the auth token, base64.
 */
function signRequest(authToken: string, url: string, params: Record<string, string>): string {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

/** Candidate public base URLs for signature validation, from the request headers. */
export function basesFromHeaders(h: Headers): string[] {
  const host = h.get('x-forwarded-host') || h.get('host');
  if (!host) return [];
  const proto = h.get('x-forwarded-proto') || 'https';
  return [`${proto}://${host}`];
}

/** Parse a Twilio form-encoded webhook body into a plain object. */
export function parseTwilioBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  new URLSearchParams(raw).forEach((v, k) => { out[k] = v; });
  return out;
}

/* ─── TwiML ────────────────────────────────────────────────────────────────
 * Hand-built to keep the `twilio` SDK out of the request path. Verified against
 * twilio.twiml.VoiceResponse — attribute order and escaping match.
 */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attrs(o: Record<string, string | number | boolean | string[] | undefined>): string {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => ` ${k}="${esc(Array.isArray(v) ? v.join(' ') : String(v))}"`)
    .join('');
}

/** <Response><Say …>message</Say><Hangup/></Response> — a spoken dead end. */
export function twimlSayHangup(message: string): string {
  return `${XML_HEAD}<Response><Say voice="Polly.Joanna">${esc(message)}</Say><Hangup/></Response>`;
}

export function twimlReject(): string {
  return `${XML_HEAD}<Response><Reject/></Response>`;
}

export function twimlSay(message: string): string {
  return `${XML_HEAD}<Response>${message ? `<Say voice="Polly.Joanna">${esc(message)}</Say>` : ''}</Response>`;
}

/** The dial itself: bridge the browser leg to the lead's number. */
export function twimlDial(opts: {
  to: string;
  callerId: string;
  timeout?: number;
  record?: boolean;
  recordingStatusCallback?: string;
  statusCallback?: string;
  numberUrl?: string;
}): string {
  const dialAttrs = attrs({
    callerId: opts.callerId,
    // answerOnBridge: the setter hears real ringback and billing starts on answer.
    answerOnBridge: true,
    timeout: opts.timeout ?? 25,
    ...(opts.record ? {
      record: 'record-from-answer-dual',
      recordingStatusCallback: opts.recordingStatusCallback,
      recordingStatusCallbackEvent: 'completed',
    } : {}),
  });
  const numberAttrs = attrs({
    statusCallback: opts.statusCallback,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    url: opts.numberUrl,
  });
  return `${XML_HEAD}<Response><Dial${dialAttrs}><Number${numberAttrs}>${esc(opts.to)}</Number></Dial></Response>`;
}

/**
 * A Twilio recording URL is only fetchable with account credentials, so it can't
 * be handed to the browser directly — we proxy it through our own authed route.
 */
export function recordingProxyPath(recordingSid: string): string {
  return `/api/crm/calls/recording/${recordingSid}`;
}
