// Which resource links open in an in-app modal instead of a new tab, and what
// URL the iframe should actually load.
//
// Shared by the roadmap, the onboarding wizard and the acquisition roadmap so a
// Google Doc behaves the same wherever it's linked: it opens in a popup over
// the app, never a native page and never a tab switch.
//
// Pure — safe on both client and server.

// Captures the doc kind and its file id from any Google Docs/Sheets/Slides URL,
// whatever tail it carries (/edit?usp=sharing, /view, #heading=..., etc).
const GOOGLE_DOC = /^https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/i;

const ALWAYS_EMBEDDABLE = /calendly\.com|calendar\.google\.com/i;

export function isEmbeddable(url: string): boolean {
  if (!url || url === '#') return false;
  return ALWAYS_EMBEDDABLE.test(url) || GOOGLE_DOC.test(url);
}

// Google refuses to render /edit inside an iframe (X-Frame-Options), so swap it
// for the preview view, which embeds fine for any "anyone with the link" doc.
// Anything else is already embeddable as-is.
//
// Preview is read-only by design — the modal keeps an "Open in new tab" link on
// the ORIGINAL url so template docs can still be copied and filled in.
export function toEmbedUrl(url: string): string {
  const m = url.match(GOOGLE_DOC);
  if (!m) return url;
  const kind = m[1].toLowerCase();
  const id = m[2];
  return kind === 'presentation'
    ? `https://docs.google.com/presentation/d/${id}/embed`
    : `https://docs.google.com/${kind}/d/${id}/preview`;
}
