/* Shared contact-field validation + formatting for every funnel application
 * (ads segments, VSL, IG). Keeps what we collect in the exact shape Calendly
 * accepts — a standard email and an E.164 phone number (leading + and country
 * code) — so bookings prefill cleanly and the CRM never stores junk. */

/** Standard email shape. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value ?? '').trim());
}

/** Strip formatting toward E.164: keep a single leading + (if the user typed
 *  one), drop every other non-digit. Does NOT invent a country code — a number
 *  without one stays without one so validation can flag it. */
export function normalizePhone(value: string): string {
  const trimmed = (value ?? '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return (hasPlus ? '+' : '') + digits;
}

/** Calendly's phone field requires E.164 — a leading +, country code, and
 *  8–15 total digits. */
export function isValidPhone(value: string): boolean {
  return /^\+\d{8,15}$/.test(normalizePhone(value));
}

export const EMAIL_HINT = 'Please enter a valid email address (e.g. you@example.com).';
export const PHONE_HINT = 'Please enter your phone in international format, including country code (e.g. +1 415 555 0123).';
