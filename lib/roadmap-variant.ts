// Which roadmap a member sees. Members tagged "Creative Specialist" get the
// Creative Specialist roadmap INSTEAD of the standard client roadmap — it fully
// replaces it (no Phase 0 onboarding, different phases, different item ids).
//
// Pure — safe on both client and server.

import { PHASES, totalItems, flatItemIds, type RoadmapPhase } from '@/lib/roadmap-data';
import { CREATIVE_PHASES } from '@/lib/creative-roadmap-data';

// Same id as the `creative_specialist` portal feature (lib/features.ts) — one
// tag drives both the Creative Specialist SOP group and this roadmap.
export const TAG_CREATIVE_SPECIALIST = 'creative_specialist';

export type RoadmapVariant = 'default' | 'creative';

// Decide from the RAW stored feature list — NOT resolveFeatures(), which grants
// admins every feature and would silently swap every admin onto this roadmap.
export function roadmapVariantFor(features?: string[] | null): RoadmapVariant {
  return features?.includes(TAG_CREATIVE_SPECIALIST) ? 'creative' : 'default';
}

export function phasesForVariant(variant: RoadmapVariant): RoadmapPhase[] {
  return variant === 'creative' ? CREATIVE_PHASES : PHASES;
}

// Convenience for server callers that already hold a profile.
export function phasesFor(features?: string[] | null): RoadmapPhase[] {
  return phasesForVariant(roadmapVariantFor(features));
}
export function totalItemsFor(features?: string[] | null): number {
  return totalItems(phasesFor(features));
}

// Every item id across BOTH roadmaps — used where a surface must recognise an id
// without knowing whose it is (e.g. the admin content-override editor).
export const ALL_ROADMAP_ITEM_IDS: string[] = [...flatItemIds(PHASES), ...flatItemIds(CREATIVE_PHASES)];
