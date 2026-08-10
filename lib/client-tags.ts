// Behavioral client tags (pure, safe on client + server).
//
//  - "Existing Client"  → skips onboarding (auto-completed) AND the roadmap is
//    fully open (no phase locking).
//  - "Recent Onboarding" → skips onboarding (auto-completed) but the roadmap
//    stays phase-locked as usual.
export const TAG_EXISTING_CLIENT = 'existing_client';
export const TAG_RECENT_ONBOARDING = 'recent_onboarding';

// Contract-tier tags: a client tagged 14k only sees the 4 month contract to
// sign, 25k only the 6 month one. Untagged clients see whatever tiers exist.
// The keys stay '14k'/'25k' (they're persisted on tags, profiles and signed
// rows) — only the labels people read are by duration, never by price.
export const TAG_CONTRACT_14K = '14k';
export const TAG_CONTRACT_25K = '25k';

export const CONTRACT_TIER_LABELS: Record<string, string> = {
  [TAG_CONTRACT_14K]: '4 Month Contract',
  [TAG_CONTRACT_25K]: '6 Month Contract',
};

// Display name for a tier key ('14k' → '4 Month Contract'). Unknown keys fall
// back to the key itself so nothing renders blank.
export function contractTierLabel(tier?: string | null): string {
  if (!tier) return '';
  return CONTRACT_TIER_LABELS[tier] ?? tier;
}

// The contract tier a client's tags lock them to (null = no restriction).
export function contractTierFromTags(tags?: string[] | null): '14k' | '25k' | null {
  if (tags?.includes(TAG_CONTRACT_25K)) return '25k';
  if (tags?.includes(TAG_CONTRACT_14K)) return '14k';
  return null;
}

// Either tag means the member shouldn't go through the onboarding wizard.
export function skipsOnboarding(tags?: string[] | null): boolean {
  return !!tags?.some((t) => t === TAG_EXISTING_CLIENT || t === TAG_RECENT_ONBOARDING);
}

// Only "Existing Client" opens the roadmap (all phases unlocked, free toggling).
export function roadmapOpen(tags?: string[] | null): boolean {
  return !!tags?.includes(TAG_EXISTING_CLIENT);
}
