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

// The welcome screen shown first — a walkthrough video + the master onboarding doc.
export const ONBOARDING_WELCOME = {
  title: 'Welcome to Brand Architect',
  body: "Here's everything you need to get started. Watch the quick walkthrough below, then work through each step in order — we'll unlock the next one as you go.",
  video: 'https://www.loom.com/share/32bba321d59140139bb67f42f4ce8dc6',
  links: [
    {
      label: 'Open the Onboarding Doc',
      url: 'https://docs.google.com/document/d/1AW56BCSqoaVKy4sCfoTISOL1w1W44q3r_l2SQd6hUqg/edit?usp=sharing',
    },
  ] as OnboardingLink[],
};

// The onboarding wizard now covers roadmap Week 1 (phase 0) and Week 2 (phase 1)
// — see lib/roadmap-data.ts, which splits these steps into those two phases.
// Source of truth: the client's "BA Roadmap" sheet (Aug 2026).
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'select-contract',
    phase: 0,
    title: 'Sign the Contract',
    subtitle: 'Choose your Brand Architect package and sign.',
    body: 'Select the contract that matches your package and complete it. We\'ll record which one you signed.',
    contracts: [
      { label: '4 Month Contract', tier: '14k', url: 'https://form.pandadoc.com/form/af6odgFm24ahVozFBTXZsT' },
      { label: '6 Month Contract', tier: '25k', url: 'https://form.pandadoc.com/form/gr5sg2XhbHydKcPfm53riL' },
    ],
    note: 'Pick the one you were enrolled on — reach out in the Discord if you\'re unsure.',
  },
  {
    id: 'meet-team',
    phase: 0,
    title: 'Meet the C-Suite Team',
    subtitle: 'Get to know the team behind your results.',
    body: "Watch this quick intro to meet the Goh Consulting C-Suite team you'll be working with.",
    video: 'https://www.loom.com/share/a8cba596836145a187ac5fb353edaf8f',
  },
  {
    id: 'join-discord',
    phase: 0,
    title: 'Join the Discord & Introduce Yourself',
    subtitle: 'Your home base for support, community, and announcements.',
    body: 'Join the Brand Architect Discord — this is where you\'ll get support, meet the community, and see important updates.\n\nOnce you\'re in, post a quick introduction: who you are, what your brand is about, and what you want to achieve in the program. Here\'s a great example to model yours on:',
    links: [{ label: 'Join Here', url: 'https://discord.gg/SkW9zak6EK' }],
    images: ['/onboarding/community-intro-example-3.png'],
  },
  {
    id: 'calendar-calls',
    phase: 0,
    title: 'Group Calls Added to Calendar',
    subtitle: 'Lock in the live calls so you never miss one.',
    body: 'Add each weekly group call to your calendar — click each one to save it.',
    links: [
      { label: 'Monday — Content Mastermind w/ Yash', url: 'https://calendar.google.com/calendar/event?action=TEMPLATE&tmeid=MG9xMHExbTZjczRldGZxbzN0bjRhMTY3aWlfMjAyNjA0MjdUMTYwMDAwWiBjXzNmOGZiZjkyOGEwNGQwNDAwNjZiYjAxMTdjNTE1ODU2ZDJkYWFhOWIzNDJiNDhlZmYyNzNhM2QyZmUwZTgzM2ZAZw&tmsrc=c_3f8fbf928a04d040066bb0117c515856d2daaa9b342b48eff273a3d2fe0e833f%40group.calendar.google.com&scp=ALL' },
      { label: 'Wednesday — Brand Architect w/ SooWei', url: 'https://calendar.google.com/calendar/event?action=TEMPLATE&tmeid=YWt2Y2UyOXR0NzgzdWdpbGl2OGRiNTBhanBfMjAyNTExMTlUMTcwMDAwWiBjXzNmOGZiZjkyOGEwNGQwNDAwNjZiYjAxMTdjNTE1ODU2ZDJkYWFhOWIzNDJiNDhlZmYyNzNhM2QyZmUwZTgzM2ZAZw&tmsrc=c_3f8fbf928a04d040066bb0117c515856d2daaa9b342b48eff273a3d2fe0e833f%40group.calendar.google.com&scp=ALL' },
      { label: 'Scripting Mastermind w/ Aidan', url: 'https://calendar.google.com/calendar/event?action=TEMPLATE&tmeid=dDBlbG85cmRncWZqdmoyYnQ3Z2h1Z3JndjhfMjAyNjA0MjRUMTYwMDAwWiBjXzNmOGZiZjkyOGEwNGQwNDAwNjZiYjAxMTdjNTE1ODU2ZDJkYWFhOWIzNDJiNDhlZmYyNzNhM2QyZmUwZTgzM2ZAZw&tmsrc=c_3f8fbf928a04d040066bb0117c515856d2daaa9b342b48eff273a3d2fe0e833f%40group.calendar.google.com&scp=ALL' },
    ],
  },
  {
    id: 'complete-forms',
    phase: 0,
    title: 'Complete Onboarding Forms',
    subtitle: 'Tell us about you so we can tailor your experience.',
    body: 'Fill out both onboarding forms below so our team has everything we need to get you started. Both must be submitted to continue.',
    todo: 'BA Roadmap sheet lists a "Data Collection Form" resource for this step — not built yet.',
  },

  // ── Week 2 ────────────────────────────────────────────────────────────────
  {
    id: 'offer-foundation',
    phase: 1,
    title: 'Watch Offer Modules',
    subtitle: 'Sharpen your offer before you document it.',
    body: 'Watch the “Sharpening the Offer” modules below — they set you up to nail the Market Research and Offer docs in the next step.',
    todo: 'BA Roadmap sheet lists an "AI Offer Creation" resource for this step — no link supplied yet.',
  },
  {
    id: 'submit-docs',
    phase: 1,
    title: 'Submit Market Research & Offer Docs For Approval',
    subtitle: 'Fill both docs out, then upload them for the team to review.',
    body: 'Fill out your Market Research doc and your Offer doc using the templates below. Once they\'re complete, export them as PDFs and upload them here for approval.',
    links: [
      { label: 'Market Research Doc', url: 'https://docs.google.com/document/d/1Xg3qMiem2dqXRjzWN9hrHTWpiecOjMoREZZNfOQpq5w/edit?usp=sharing' },
      { label: 'Offer Doc', url: 'https://docs.google.com/document/d/181wHjQQ7QmktXgQzvZ4zD5jmLD7-PxQt0YGsmbfts8M/edit?usp=sharing' },
    ],
    requiresUpload: true,
  },
  {
    id: 'onboarding-call',
    phase: 1,
    title: 'Onboarding Call with Kim',
    subtitle: 'The final step — meet your CSM.',
    body: 'Book your onboarding call with your Client Success Manager to kick things off properly.',
    links: [{ label: 'Book your onboarding call', url: 'https://calendly.com/kimchi-gohconsulting/onboarding-strategy' }],
  },
];

// Roadmap Week 1 / Week 2 are these steps, split by `phase`.
export const onboardingStepsInPhase = (phase: 0 | 1): OnboardingStep[] =>
  ONBOARDING_STEPS.filter((s) => (s.phase ?? 0) === phase);

// One-line "why this matters" shown as an accent under each step's headline —
// keeps clients motivated by connecting every step to the outcome.
export const STEP_WHY: Record<string, string> = {
  'select-contract': 'Locks in your package so we kick off the right scope of work for you, right away.',
  'meet-team': "Knowing who's in your corner — and how the team operates — sets the tone for everything ahead.",
  'join-discord': "It's your home base, and a quick hello gets the community behind you from day one.",
  'calendar-calls': 'The weekly group calls are where the fastest progress happens — never miss one.',
  'complete-forms': 'Your answers let us tailor your strategy, content, and calls to you — no generic advice.',
  'offer-foundation': 'A sharp offer is the foundation everything else is built on — tighten it before you document and market it.',
  'submit-docs': 'We review your foundations before you build on them — so you never scale the wrong thing.',
  'onboarding-call': 'Meet your Client Success Manager and map your personal game plan — where it all comes together.',
};

export const ONBOARDING_STEP_IDS = ONBOARDING_STEPS.map((s) => s.id);
export const TOTAL_ONBOARDING_STEPS = ONBOARDING_STEPS.length;

// The "Hop on Onboarding Call" step (id 'onboarding-call') shows a Calendly link
// that depends on the client's ICP tag. Resolved per-client server-side.
export const ONBOARDING_CALL_STEP_ID = 'onboarding-call';
export const ONBOARDING_CALL_LINKS = {
  default: 'https://calendly.com/kimchi-gohconsulting/onboarding-strategy',
  icp: 'https://calendly.com/kimchi-gohconsulting/onboarding-strategy',
  low_icp: 'https://calendly.com/kimchi-gohconsulting/funnel-leakage',
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
