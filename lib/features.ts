// Per-client portal feature gating.
//
// Every TOGGLEABLE nav item in the member portal is a gateable feature. A
// client's `portal_users.features` column holds the allowlist of feature ids
// they can see. When that column is null/empty the client falls back to
// DEFAULT_FEATURES (recordings only).
//
// Dashboard is NOT toggleable — it is always available to every client.
//
// Feature ids MUST match the nav item ids in app/portal/page.tsx.

// NOTE: The standalone pages /hub, /select and /portal are not gated — only the
// per-tab toggles inside /portal are, enforced client-side via /api/me/features.
export const PORTAL_FEATURES = [
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'modules', label: 'Modules' },
  { id: 'sops', label: 'SOP Library' },
  // Gates ONLY the "Creative Specialist" group inside the (open-to-all) SOP
  // library — members without this tag see every other SOP category but not it.
  { id: 'creative_specialist', label: 'Creative Specialist SOPs' },
  { id: 'recordings', label: 'Recordings' },
  { id: 'resources', label: 'Resources' },
  // "Acquisition" tag — unlocks the Acquisition Dashboard tab inside /roadmap for
  // this client. Not a portal nav tab (see app/portal navItems), just a gate.
  { id: 'acquisition', label: 'Acquisition Dashboard' },
  // "Acquisition Admin" tag — grants admin powers ON the Acquisition Dashboard:
  // edit the global SOP sections + view/edit every acquisition client's content.
  // Implies dashboard access. Enforced via lib/acquisition-admin.ts server-side.
  { id: 'acq_admin', label: 'Acquisition Admin' },
] as const;

export type FeatureId = 'dashboard' | (typeof PORTAL_FEATURES)[number]['id'];

// The toggleable ids (drive the admin toggles), in canonical nav order.
export const TOGGLEABLE_FEATURE_IDS: FeatureId[] = PORTAL_FEATURES.map((f) => f.id);

// Every recognised id, dashboard first (always granted).
export const ALL_FEATURE_IDS: FeatureId[] = ['dashboard', ...TOGGLEABLE_FEATURE_IDS];

// Always granted to every member, regardless of their allowlist — never gated.
// Dashboard is the always-on home; SOP Library is open to everyone.
export const ALWAYS_ON_FEATURES: FeatureId[] = ['dashboard', 'sops'];

// What a new / ungated client gets by default (beyond the always-on ones).
export const DEFAULT_FEATURES: FeatureId[] = ['recordings', 'roadmap', 'modules', 'sops'];

// Resolve a client's stored allowlist into the features they may actually see.
// - admins see everything
// - ALWAYS_ON_FEATURES (Dashboard + SOP Library) are ALWAYS included
// - null / empty stored list falls back to the admin-configured global default
//   (or DEFAULT_FEATURES when none is set)
// - result is returned in canonical nav order
export function resolveFeatures(
  stored: string[] | null | undefined,
  role: 'user' | 'admin' = 'user',
  globalDefault?: string[] | null
): FeatureId[] {
  if (role === 'admin') return [...ALL_FEATURE_IDS];
  const fallback = globalDefault && globalDefault.length ? globalDefault : DEFAULT_FEATURES;
  const allow = stored && stored.length ? stored : fallback;
  // 'sops' is forced on for everyone (open to all); the rest follow the allowlist.
  return ['dashboard', ...TOGGLEABLE_FEATURE_IDS.filter((id) => id === 'sops' || allow.includes(id))];
}
