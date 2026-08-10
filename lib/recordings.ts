// Shared call-recordings model.
//
// Both the member portal Recordings view and the standalone /hub page read from
// /api/recordings and render with these exact categories, so the two surfaces
// always show the same uploaded recordings. Recordings are embed-code based:
// an admin pastes an embed snippet (e.g. a Fathom <iframe>) and members play it
// inline. `fathom_url` is kept only for backward-compatibility with older rows.

export const RECORDING_CATEGORIES = [
  { id: 'content_mastermind',   day: 'Monday',    name: 'Content Mastermind',   coach: 'Yash',
    blurb: 'Your Monday content sessions with Yash — sharpen your hooks, formats, and posting rhythm so every piece of content pulls its weight.' },
  { id: 'brand_architect',      day: 'Wednesday', name: 'Brand Architect',      coach: 'SooWei',
    blurb: 'Wednesday brand-building with SooWei — positioning, offer, and the strategic moves that make you the obvious choice in your space.' },
  { id: 'scripting_mastermind', day: 'Friday',    name: 'Scripting Mastermind', coach: 'Aidan',
    blurb: 'Friday scripting calls with Aidan — turn proven frameworks into scripts that book calls and close deals.' },
] as const;

export const RECORDING_CATEGORY_IDS: string[] = RECORDING_CATEGORIES.map((c) => c.id);

export type RecordingCategoryId = (typeof RECORDING_CATEGORIES)[number]['id'];

// Private 1-1 coaching check-ins. Deliberately NOT part of RECORDING_CATEGORIES:
// these are sourced from the `check_ins` table (Fathom auto-detected coach calls +
// manual CSM additions), scoped per-client, and are never admin-editable as a
// regular recording. Kept separate so it doesn't show up in the admin add/edit
// recording dropdowns, while still resolving for display via recordingCategory().
export const CHECKIN_CATEGORY = {
  id: 'checkins', day: '1-1', name: '1-1 Check-Ins', coach: 'Your coaches',
  blurb: 'Your private 1-1 coaching check-ins — every call your coaches recorded with you, in one place. Only you can see these.',
} as const;

export interface Recording {
  id: string;
  category: string;
  title: string | null;
  fathom_url: string | null;
  embed_code: string | null;
  summary_url: string | null;
  call_date: string | null;
  sort_order: number | null;
  created_at: string;
}

export function recordingCategory(id: string) {
  if (id === CHECKIN_CATEGORY.id) return CHECKIN_CATEGORY;
  return RECORDING_CATEGORIES.find((c) => c.id === id);
}

// Turn a Fathom share/embed link into an inline-embeddable iframe snippet.
// Fathom's /share/<token> page sends X-Frame-Options: SAMEORIGIN (can't iframe it),
// but the /embed/<token> variant allows framing — so we swap to that. Returns null
// for links we can't safely embed (e.g. numeric /calls/<id> URLs), in which case
// the player falls back to a "Watch ↗" button via fathom_url.
export function fathomShareToEmbed(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/fathom\.video\/(?:share|embed)\/([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  const src = `https://fathom.video/embed/${m[1]}`;
  return `<div style="position:relative;width:100%;padding-top:56.25%">`
    + `<iframe src="${src}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" `
    + `allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" allowfullscreen></iframe>`
    + `</div>`;
}

export function formatCallDate(iso: string | null): string {
  if (!iso) return 'Undated';
  const d = new Date(iso + 'T00:00:00');
  // No weekday — the category tag already shows the call's day (Mon/Wed/Fri).
  return isNaN(d.getTime())
    ? 'Undated'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
