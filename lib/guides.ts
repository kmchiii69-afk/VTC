// Shared "section guide" model.
//
// A guide is a short Loom walkthrough that explains how to navigate a given
// section of the app. Admins paste a Loom share link per section (in the UI);
// members see a banner card at the top of that section and can play it inline.
//
// Sections are keyed by a stable id. The portal views reuse their `activeView`
// id (dashboard / roadmap / modules / sops / recordings); the standalone Select
// screen uses `select`.

export const GUIDE_SECTIONS = [
  { id: 'select',     label: 'Select Screen' },
  { id: 'dashboard',  label: 'Portal · Dashboard' },
  { id: 'roadmap',    label: 'Portal · Roadmap' },
  { id: 'modules',    label: 'Portal · Video Modules' },
  { id: 'sops',       label: 'Portal · SOP Library' },
  { id: 'recordings', label: 'Portal · Recordings' },
] as const;

export const GUIDE_SECTION_IDS: string[] = GUIDE_SECTIONS.map((s) => s.id);

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]['id'];

export interface SectionGuide {
  section: string;
  loom_url: string | null;
  title: string | null;
  updated_at: string;
}

export function guideSection(id: string) {
  return GUIDE_SECTIONS.find((s) => s.id === id);
}

// Turn any Loom link (share, embed, or with query params) into the canonical
// embeddable URL: https://www.loom.com/embed/<id>. Returns null if no Loom id
// can be found, so callers can fall back to a plain link.
export function loomEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (m) return `https://www.loom.com/embed/${m[1]}`;
  return null;
}
