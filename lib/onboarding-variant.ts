// Which onboarding a member goes through. Members tagged "Creative Specialist"
// get the Creative Specialist onboarding INSTEAD of the standard client wizard —
// it fully replaces it. Their onboarding is a single step: fill out one form (the
// CD Onboarding Questions). No Discord intro, no contract, no modules, no CSM
// call — those belong to the Brand Architect client journey, not to a creative
// hire embedded in a founder's team.
//
// Mirrors lib/roadmap-variant.ts, which does the same for the roadmap. The same
// `creative_specialist` tag drives both, plus the Creative Specialist SOP group.
//
// Pure — safe on both client and server.

import { ONBOARDING_STEPS, type OnboardingStep } from '@/lib/onboarding-data';
import { TAG_CREATIVE_SPECIALIST } from '@/lib/roadmap-variant';

export type OnboardingVariant = 'default' | 'creative';

// The Creative Specialist's one and only onboarding step. The id is stored in
// onboarding_progress, so it MUST stay stable — and must not collide with a
// standard step id or a creative roadmap item id (cs1xx).
export const CREATIVE_ONBOARDING_FORM_STEP = 'cd-onboarding-form';

export const CREATIVE_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: CREATIVE_ONBOARDING_FORM_STEP,
    title: 'Complete Your Onboarding Form',
    subtitle: 'One form — then straight into your roadmap.',
    body: 'Fill out the Creative Specialist onboarding form below. It covers your setup, your content operation and the brand you build for, so we can plug straight into how you already work. This is the only step — submit it and you\'re in.',
  },
];

export const CREATIVE_ONBOARDING_WELCOME = {
  title: 'Welcome, Creative Specialist',
  body: "There's one thing to do before you start: the onboarding form below. It maps your workflow, your team and the brand you build for — so nothing we give you is generic. Takes about 15 minutes.",
  links: [],
};

// The "why this matters" accent shown under the step headline, mirroring
// STEP_WHY in lib/onboarding-data for the standard sequence.
export const CREATIVE_STEP_WHY: Record<string, string> = {
  [CREATIVE_ONBOARDING_FORM_STEP]:
    'Your answers map your team, your workflow and the brand you build for — so every SOP, review and recommendation you get fits how you already work.',
};

// Decide from the RAW stored feature list — NOT resolveFeatures(), which grants
// admins every feature and would silently swap every admin onto this onboarding.
export function onboardingVariantFor(features?: string[] | null): OnboardingVariant {
  return features?.includes(TAG_CREATIVE_SPECIALIST) ? 'creative' : 'default';
}

export function stepsForVariant(variant: OnboardingVariant): OnboardingStep[] {
  return variant === 'creative' ? CREATIVE_ONBOARDING_STEPS : ONBOARDING_STEPS;
}

// Convenience for callers that already hold a profile's feature list.
export function stepsFor(features?: string[] | null): OnboardingStep[] {
  return stepsForVariant(onboardingVariantFor(features));
}
export function stepIdsFor(features?: string[] | null): string[] {
  return stepsFor(features).map((s) => s.id);
}

// Every step id across BOTH onboardings — used where a surface must recognise an
// id without knowing whose it is (e.g. resolving an upload's step title).
export const ALL_ONBOARDING_STEP_IDS: string[] = [
  ...ONBOARDING_STEPS.map((s) => s.id),
  ...CREATIVE_ONBOARDING_STEPS.map((s) => s.id),
];

// The native form the Creative Specialist's single step collects.
export const CREATIVE_FORM_ID = 'creative';

// Which native form a variant's form step collects.
export function formIdForVariant(variant: OnboardingVariant): typeof CREATIVE_FORM_ID | null {
  return variant === 'creative' ? CREATIVE_FORM_ID : null;
}

// Which onboarding variant a form belongs to; null = not variant-specific.
export function variantForForm(formId: string): OnboardingVariant | null {
  return formId === CREATIVE_FORM_ID ? 'creative' : null;
}

// Whether a member may read or submit a given onboarding form.
//
// Variant-specific forms are limited to members on that variant (admins can
// always preview). The STANDARD forms deliberately stay open to everyone: a
// Creative Specialist may have filled them before the tag was applied, and the
// wizard prefills shared fields (name/phone/handles) from `primary` regardless of
// which onboarding the member is on.
export function canAccessForm(formId: string, features?: string[] | null, role?: string): boolean {
  const owner = variantForForm(formId);
  if (!owner) return true;
  if (role === 'admin') return true;
  return onboardingVariantFor(features) === owner;
}
