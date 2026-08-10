// Single source of truth for the client roadmap — used by the /roadmap page,
// the portal dashboard cards, and the admin progress view. Item ids are the
// keys stored in the `roadmap_progress` table, so they MUST stay stable.

import { onboardingStepsInPhase, STEP_WHY } from '@/lib/onboarding-data';

export interface RoadmapItem {
  id: string;
  text: string;
  sop?: string | null;
  mods?: { num: number; title: string }[];
  href?: string | null; // internal app route to open (e.g. '/modules'); rendered as an in-app link
  desc?: string | null;  // shown in the item's dropdown (supports line breaks)
  links?: { label: string; url: string }[]; // external resource links shown in the dropdown
  guides?: { label: string; slug: string }[]; // native in-app guide pages → /guides/<slug>
  recording?: { label: string; category: string; match: string }; // opens a matching recording in a popup player
  optional?: boolean;     // "If Applicable" — skippable; never blocks phase completion
}
export interface RoadmapPhase {
  id: string;
  num: string;
  label: string;
  title: string;
  sub: string;
  color: string;
  items: RoadmapItem[];
}

// Resource links come from the client's "BA Roadmap" sheet (Aug 2026) — one doc
// per step, shown as a pill under the item.
const doc = (label: string, url: string) => [{ label, url }];

const PHASES_RAW: RoadmapPhase[] = [
  // Weeks 1 and 2 mirror the onboarding wizard 1:1 — each item id IS the matching
  // onboarding step id, so completing a step in the wizard ticks the item here
  // (see lib/onboarding.ts). The wizard runs them as one continuous sequence;
  // only the roadmap splits them across two weeks.
  {
    id: 'week-1', num: '01', label: 'Week 1', color: '#c9a455',
    title: 'Onboarding',
    sub: 'Get signed, get set up, and get plugged into the community.',
    items: onboardingStepsInPhase(0).map((s) => ({ id: s.id, text: s.title, sop: null, mods: [], desc: STEP_WHY[s.id] ?? null })),
  },
  {
    id: 'week-2', num: '02', label: 'Week 2', color: '#4ade80',
    title: 'Offer Creation',
    sub: 'Sharpen the offer, document it, and get it approved before you build on it.',
    items: onboardingStepsInPhase(1).map((s) => ({ id: s.id, text: s.title, sop: null, mods: [], desc: STEP_WHY[s.id] ?? null })),
  },
  // Weeks 3 and 4 come from the BA Roadmap sheet. Item ids are reused from the
  // previous roadmap wherever a step is the same piece of work under a new name,
  // so the 88 members with progress keep their ticks; genuinely new steps take
  // fresh r129+ ids. Retired ids (r100a/b, r102, r103, r105, r109, r116, r118–r128)
  // are simply no longer listed — countCompleted() ignores orphaned rows.
  {
    id: 'week-3', num: '03', label: 'Week 3', color: '#60a5fa',
    title: 'Branding Foundations',
    sub: 'Dial in how you look, how you show up, and the assets that do the selling for you.',
    items: [
      { id: 'r101', text: 'Watch Camera Presence Modules', sop: null, mods: [], desc: 'Learn to show up confidently and naturally on camera — the delivery that makes your content land.',
        links: doc('Camera Presence (Doc)', 'https://docs.google.com/document/d/1QnyyBudDOHq8M5W9DWedr8OPChsGfTstCw4GD5Gs75g/edit?usp=sharing') },
      { id: 'r104', text: 'Optimise your Visual Identity & Filming Setup', sop: null, mods: [], desc: 'Lock in your framing, lighting and sound once — it makes every video you shoot from here look the part.',
        links: doc('Visual Identity & Filming Setup (Doc)', 'https://docs.google.com/document/d/1pn91ytFlMhRw-hE2v4QqlkGo06UPJfSDHtPZgbpW4k0/edit?usp=sharing') },
      { id: 'r106', text: 'Optimise Your IG profile', sop: null, mods: [], desc: 'Your profile is the first thing a new viewer judges — make it obvious who you help and what to do next.',
        links: doc('IG Profile (Doc)', 'https://docs.google.com/document/d/1bVpNJX0T0SNrTy2AKgjSVxbjlaooFujLODx5oA0VorA/edit?usp=sharing') },
      { id: 'r107', text: 'Create Your Pinned Posts', sop: null, mods: [], desc: 'Your pinned posts sell while you sleep — they introduce you, prove the results, and point people to the offer.',
        links: doc('Pinned Posts (Doc)', 'https://docs.google.com/document/d/1_l3tmTQ5nPifarMiK6TKho6W78XSwaNVJb6f7lJXlAs/edit?usp=sharing') },
      { id: 'r129', text: 'Send Buyer Mirror Form', sop: null, mods: [], desc: 'Ask your buyers what actually made them book — that answer gives you the hooks and angles the rest of your content is built from.',
        links: doc('Buyer Mirror Form (Doc)', 'https://docs.google.com/document/d/1dW3IJrJgNXewJCYu4V-bEL3nkg4bmzzW8ywWnFnmpOg/edit?usp=sharing') },
      { id: 'r130', text: 'Start Cash Injection', sop: null, mods: [], desc: 'Run a short, focused campaign against the leads and buyers you already have — the fastest revenue available to you.',
        links: doc('Cash Injection (Doc)', 'https://docs.google.com/document/d/1lCicoQ50cdTE7C7UT2jnvEczaTRJZJeLnH3wrIuacVk/edit?usp=sharing') },
      { id: 'r131', text: 'Sales Department Standards', sop: null, mods: [], desc: 'Set the standards your sales team runs to, so revenue stops depending on you being on every call.' },
      { id: 'r132', text: 'Publish Story Sequences', sop: null, mods: [], desc: 'Stories are where warm followers convert — structure sequences that build trust and then ask for the booking.',
        links: doc('Story Sequences (Doc)', 'https://docs.google.com/document/d/1vlcPJ3Wt1FP8eKP472CRQOv1gJVIE7WvvQRieGK8hSM/edit?usp=sharing') },
      { id: 'r108', text: 'Book 1-1 With Aidan', sop: null, mods: [],
        links: [{ label: 'Book your 1-1 call', url: 'https://calendly.com/aidanlukecordes/new-meeting' }],
        desc: "Once you've implemented the above, book a 1-1 with your Content Specialist for tailored feedback." },
    ],
  },
  {
    id: 'week-4', num: '04', label: 'Week 4', color: '#f59e0b',
    title: 'Content Optimisation',
    sub: 'Build the messaging, the formats, and the cadence that turn attention into buyers.',
    items: [
      { id: 'r110', text: 'Define your Content Messaging Pillars', sop: null, mods: [], desc: 'Pick the few themes you speak on every week — repetition is what gets you known for something.',
        links: doc('Messaging Pillars (Doc)', 'https://docs.google.com/document/d/18DykX2iJ8jMjvp_D_W60g1hNvJSRBbTKG3E2I7ecZXM/edit?usp=sharing') },
      { id: 'r111', text: 'TOF Masterclass', sop: null, mods: [], desc: 'Top-of-funnel content is how strangers find you — learn what earns reach without pulling in the wrong audience.',
        links: doc('TOF Masterclass (Doc)', 'https://docs.google.com/document/d/1Th8WCuekUK2Zk9S0nPE84k9Rb0zT3Nx3X0YW8nLXdDo/edit?usp=sharing') },
      { id: 'r117', text: 'MOF Masterclass', sop: null, mods: [], desc: 'Middle-of-funnel content is what turns followers into buyers — the proof, the mechanism, and the objections handled up front.',
        recording: { label: 'Watch: MOF Content', category: 'brand_architect', match: 'mof|middle of funnel' },
        links: doc('MOF Masterclass (Doc)', 'https://docs.google.com/document/d/1MeCADrMTsjDEO6mpJEkAWvylYlSNfGxY7YH3dYCb6wQ/edit?usp=sharing') },
      { id: 'r112', text: 'Test 3x NEW Content Formats', sop: null, mods: [], desc: 'Experiment with new formats to find what resonates and earns reach.',
        links: doc('Content Formats (Canva)', 'https://canva.link/ktmwm79bocxtghk') },
      { id: 'r113', text: 'Hooks & Scripts', sop: null, mods: [], desc: 'Script strong hooks and get them reviewed by your Content Specialist before filming.',
        links: doc('Hooks & Scripts (Doc)', 'https://docs.google.com/document/d/1lUEp4HGWHtdy4VUW7WZgcCdI_vz37n0rTiWBvspTpB0/edit?usp=sharing') },
      { id: 'r115', text: 'Hit Posting Cadence', sop: null, mods: [], desc: 'Consistency compounds — hitting your cadence every week is what makes the growth predictable instead of lucky.',
        links: doc('Posting Cadence (Doc)', 'https://docs.google.com/document/d/1tShfCCKQIrfVNaBMbRCfa9WDYM65aj3e9PVssHd4zHE/edit?usp=sharing') },
      { id: 'r114', text: 'Attend Content Review Calls', sop: null, mods: [], desc: 'Bring your content to the weekly mastermind calls for direct, specific feedback. Add them to your calendar:', links: [
        { label: 'Mastermind Call w/ SooWei (Wed)', url: 'https://calendar.google.com/calendar/u/0/r/eventedit?dates=20260617T170000/20260617T180000&details=For+Coaches+of+every+bracket.+In+this+weekly+Mastermind+Call+with+Soowei,+he+will+be+going+over+new+high+level+concepts+each+week+on+how+you+can+grow+your+business+to+$30k+-+$100k/mo&location=https://us06web.zoom.us/j/6698939694?pwd%3Dcm9qYlVwaEhnVVlUTDkvd0QveVJZZz09&recur=RRULE:FREQ%3DWEEKLY;INTERVAL%3D1;BYDAY%3DWE&text=Mastermind+Call+w/+SooWei' },
        { label: 'Content Mastermind w/ Yash (Mon)', url: 'https://calendar.google.com/calendar/u/0/r/eventedit?dates=20260622T170000/20260622T180000&details=Yash+will+be+covering+all+facets+of+content+related+to+creative+direction,+cinematics,+story+telling+and+more+weekly+on+Monday.&location=https://us06web.zoom.us/j/85450222635?pwd%3Di5RMbLT98XRvFsaDENgUULaZDntt2Q.1&recur=RRULE:FREQ%3DWEEKLY;INTERVAL%3D1;BYDAY%3DMO&text=Content+Mastermind+w/+Yash' },
        { label: 'Scripting Mastermind w/ Aidan (Fri)', url: 'https://calendar.google.com/calendar/u/0/r/eventedit?dates=20260619T170000/20260619T180000&details=You%27ll+be+going+over+key+components+in+scripting+content+w/+Aidan+every+week+to+understand+on+how+to+dial+in+your+content+through+better+scripts+and+frameworks&location=https://us05web.zoom.us/j/81621884284&recur=RRULE:FREQ%3DWEEKLY;INTERVAL%3D1;BYDAY%3DFR&text=Scripting+Mastermind+W/+Aidan' },
      ] },
      { id: 'r133', text: 'Check In 1-1 With Aidan', sop: null, mods: [],
        links: [{ label: 'Book your check-in', url: 'https://calendly.com/aidanlukecordes/new-meeting' }],
        desc: 'Check back in with your Content Specialist to review what shipped and what to sharpen next.' },
    ],
  },
];

// Source step titles carry leading emojis (🎤 🎥 📞 ↻ …) — strip them for display.
function stripEmoji(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const PHASES: RoadmapPhase[] = PHASES_RAW.map((p) => ({
  ...p,
  items: p.items.map((it) => ({ ...it, text: stripEmoji(it.text) })),
}));

export const TOTAL_ITEMS = PHASES.reduce((s, p) => s + p.items.length, 0);

// Flat, phase-ordered list of every item id — the spine of the gating logic.
export const FLAT_ITEM_IDS: string[] = PHASES.flatMap((p) => p.items.map((i) => i.id));

// Same two derivations for any phase set (e.g. the Creative Specialist roadmap
// in lib/creative-roadmap-data.ts — see lib/roadmap-variant.ts).
export function totalItems(phases: RoadmapPhase[]): number {
  return phases.reduce((s, p) => s + p.items.length, 0);
}
export function flatItemIds(phases: RoadmapPhase[]): string[] {
  return phases.flatMap((p) => p.items.map((i) => i.id));
}

// `roadmap_progress` accumulates every id a member has ever ticked — including
// ids belonging to the OTHER roadmap and the retired r10–r45 range. Count only
// the ones that exist on the roadmap being scored, so x/y always adds up.
export function countCompleted(completedIds: string[], phases: RoadmapPhase[]): number {
  const ids = new Set(flatItemIds(phases));
  return completedIds.filter((id) => ids.has(id)).length;
}

// ─── Phase-level gating ──────────────────────────────────────────────────────
// Each PHASE unlocks only once every required item in all earlier phases is
// complete. Within an unlocked phase, items can be checked in any order.
// "Optional" items (If Applicable) never block phase completion.
//
// Every helper takes the phase set to gate against, defaulting to the standard
// roadmap so existing callers keep their behaviour.

// A phase is complete when all of its required (non-optional) items are done.
export function phaseComplete(phase: RoadmapPhase, completed: Set<string>): boolean {
  return phase.items.every((it) => it.optional || completed.has(it.id));
}

export function isPhaseUnlocked(phaseId: string, completed: Set<string>, phases: RoadmapPhase[] = PHASES): boolean {
  const idx = phases.findIndex((p) => p.id === phaseId);
  if (idx < 0) return false;
  if (idx === 0) return true; // first phase (onboarding on the standard roadmap) is always open
  for (let i = 0; i < idx; i++) if (!phaseComplete(phases[i], completed)) return false;
  return true;
}

// An item is actionable if its phase is unlocked (no per-step order within a phase).
export function isItemUnlocked(itemId: string, completed: Set<string>, phases: RoadmapPhase[] = PHASES): boolean {
  const phase = phases.find((p) => p.items.some((it) => it.id === itemId));
  return phase ? isPhaseUnlocked(phase.id, completed, phases) : false;
}

// Free toggling anywhere inside an unlocked phase.
export function canToggleItem(itemId: string, completed: Set<string>, phases: RoadmapPhase[] = PHASES): boolean {
  return isItemUnlocked(itemId, completed, phases);
}

// The phase the client is currently working through (first incomplete phase,
// ignoring optional items), or the last phase once everything required is done.
export function getCurrentPhase(completedIds: string[], phases: RoadmapPhase[] = PHASES): RoadmapPhase {
  const set = new Set(completedIds);
  for (const phase of phases) {
    if (!phaseComplete(phase, set)) return phase;
  }
  return phases[phases.length - 1];
}
