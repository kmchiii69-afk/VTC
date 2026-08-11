// Onboarding flow content — the step-by-step sequence a new client completes
// before entering the portal. Sourced from the Notion "Onboarding" database.
//
// This is the single source of truth for the wizard UI. Step `id`s are stored
// in the `onboarding_progress` table, so they MUST stay stable once live.
//
// ROADMAP SYNC: these step ids double as the item ids of roadmap Phase 0
// ("Onboarding") — see lib/roadmap-data.ts, which builds that phase straight
// from ONBOARDING_STEPS. Completing a step mirrors into roadmap_progress under
// the same id (see lib/onboarding.ts), keeping Phase 0 in sync automatically.
//
// VARIANTS: members tagged "Creative Specialist" go through a different, single-
// step onboarding instead — see lib/onboarding-variant.ts. Everything below is
// the STANDARD client sequence; resolve per-member with stepsFor(features).

export interface OnboardingLink {
  label: string;
  url: string;
}

// A contract option the client can sign. Clicking records which one they chose
// against their account (tier) before opening the signing form.
export interface OnboardingContract {
  label: string;
  url: string;
  tier: string;
}

export interface OnboardingStep {
  id: string;
  title: string;
  subtitle?: string;            // short one-liner under the title
  body?: string;                // instruction text (plain paragraphs, \n separated)
  links?: OnboardingLink[];     // external resource links / forms / booking
  internalHref?: string;        // in-app destination (e.g. portal modules)
  images?: string[];            // /onboarding/*.png screenshots
  contracts?: OnboardingContract[]; // pick-one contracts; selection is tracked
  requiresUpload?: boolean;     // step needs a PDF upload before it can be completed
  note?: string;                // small helper footnote
  todo?: string;                // content gap for the team to fill (not shown to clients)
  video?: string;               // Loom share URL embedded in the step body
  // Which roadmap phase this step belongs to. The wizard runs straight through
  // all of them; the roadmap splits them into Week 1 and Week 2 (see
  // lib/roadmap-data.ts). Defaults to 0 for the Creative Specialist variant,
  // which has its own roadmap and never reads this.
  phase?: 0 | 1;
}

// The welcome screen shown first — a short walkthrough of how onboarding works.
export const ONBOARDING_WELCOME = {
  title: 'Welcome to VTC',
  body: "Let's get you set up for your first video. Work through each step in order — the strategy call unlocks once the essentials are done, then we hit the ground running.",
  video: 'https://www.loom.com/share/placeholder', // TODO: VTC onboarding walkthrough Loom
  links: [] as OnboardingLink[],
};

// VTC day-1 onboarding checklist. Booking the strategy call sits LAST, so the
// sequential-unlock rule (isStepUnlocked) keeps it locked until Slack, the
// agreement, the onboarding form and equipment are all done — the agreed gate.
// Links are placeholders; swap for the real VTC URLs.
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'join-slack',
    phase: 0,
    title: 'Join your Slack channel',
    subtitle: 'Your direct line to the whole VTC team.',
    body: "Accept your Slack invite and say hello in your channel — this is where your team, scripts, and updates live.",
    links: [{ label: 'Open Slack', url: 'https://slack.com' }], // TODO: per-client Slack invite
    note: "Can't find your invite? Reply to your welcome email and we'll resend it.",
  },
  {
    id: 'sign-agreement',
    phase: 0,
    title: 'Sign your agreement',
    subtitle: 'Locks in your plan so we can start.',
    body: 'Review and sign your service agreement. Takes two minutes.',
    links: [{ label: 'Sign the agreement', url: 'https://form.pandadoc.com/placeholder' }], // TODO: VTC agreement
  },
  {
    id: 'onboarding-form',
    phase: 0,
    title: 'Fill out your onboarding form',
    subtitle: 'Everything we need to write in your voice.',
    body: "Complete your onboarding form — your ICP, offer, numbers, and best-performing content. This is what your strategist and scriptwriter build from, so the more detail the better.",
    links: [{ label: 'Open the onboarding form', url: 'https://airtable.com/placeholder' }], // TODO: Airtable onboarding form
  },
  {
    id: 'order-equipment',
    phase: 0,
    title: 'Order your equipment',
    subtitle: 'Get record-ready.',
    body: 'Order the recommended kit so your footage meets standard from video one. Links below.',
    links: [{ label: 'Recommended equipment list', url: 'https://www.amazon.com/placeholder' }], // TODO: VTC equipment list
    note: 'Already have a good setup? Send us a test clip in Slack and we\'ll confirm it works.',
  },
  {
    id: 'book-strategy-call',
    phase: 0,
    title: 'Book your strategy call',
    subtitle: 'The kickoff — we map your first videos.',
    body: 'Last step. Book your strategy call and we\'ll walk you through your video ideas and set your first-video timeline. (Unlocks once the steps above are done.)',
    links: [{ label: 'Book your strategy call', url: 'https://calendly.com/placeholder/strategy-call' }], // TODO: VTC strategy-call Calendly
  },
];

// Roadmap Week 1 / Week 2 are these steps, split by `phase`.
export const onboardingStepsInPhase = (phase: 0 | 1): OnboardingStep[] =>
  ONBOARDING_STEPS.filter((s) => (s.phase ?? 0) === phase);

// One-line "why this matters" shown as an accent under each step's headline —
// keeps clients motivated by connecting every step to the outcome.
export const STEP_WHY: Record<string, string> = {
  'join-slack': "It's your direct line to the whole team — nothing slips when we're all in one place.",
  'sign-agreement': 'Locks in your plan so we can kick off production straight away.',
  'onboarding-form': 'Your answers are what we script and strategise from — the more detail, the sharper your videos.',
  'order-equipment': 'Good footage from day one means faster edits and better videos — no re-records.',
  'book-strategy-call': 'Where we map your first videos and set the timeline — the real kickoff.',
};

export const ONBOARDING_STEP_IDS = ONBOARDING_STEPS.map((s) => s.id);
export const TOTAL_ONBOARDING_STEPS = ONBOARDING_STEPS.length;

// The strategy-call step shows a Calendly link (booking is gated until the
// earlier steps are complete). Resolved per-client server-side.
export const ONBOARDING_CALL_STEP_ID = 'book-strategy-call';
export const ONBOARDING_CALL_LINKS = {
  default: 'https://calendly.com/placeholder/strategy-call', // TODO: VTC strategy-call Calendly
  icp: 'https://calendly.com/placeholder/strategy-call',
  low_icp: 'https://calendly.com/placeholder/strategy-call',
};

export function resolveOnboardingCallLink(tags: string[] | null | undefined): string {
  const t = tags ?? [];
  if (t.includes('icp')) return ONBOARDING_CALL_LINKS.icp;
  if (t.includes('low_icp')) return ONBOARDING_CALL_LINKS.low_icp;
  return ONBOARDING_CALL_LINKS.default;
}

// Sequential gating, mirroring the roadmap's one-step-at-a-time rule. The
// "boundary" is the length of the contiguous completed prefix.
//
// All three take an optional `stepIds` so they work for either onboarding — pass
// stepIdsFor(features) from lib/onboarding-variant for a Creative Specialist.
// Omitting it keeps the standard client sequence (the default everywhere else).
export function onboardingBoundary(completed: Set<string>, stepIds: string[] = ONBOARDING_STEP_IDS): number {
  let i = 0;
  while (i < stepIds.length && completed.has(stepIds[i])) i++;
  return i;
}

// A step is reachable if it's at or before the boundary (done, or the next one up).
export function isStepUnlocked(stepId: string, completed: Set<string>, stepIds: string[] = ONBOARDING_STEP_IDS): boolean {
  const idx = stepIds.indexOf(stepId);
  if (idx < 0) return false;
  return idx <= onboardingBoundary(completed, stepIds);
}

// Toggling is allowed only at the frontier: complete the next step, or undo the
// most recent one. Keeps the completed set a gap-free prefix.
export function canToggleStep(stepId: string, completed: Set<string>, stepIds: string[] = ONBOARDING_STEP_IDS): boolean {
  const idx = stepIds.indexOf(stepId);
  if (idx < 0) return false;
  const b = onboardingBoundary(completed, stepIds);
  return idx === b || idx === b - 1;
}
