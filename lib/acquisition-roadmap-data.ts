// Client-safe types + default content for the Acquisition Roadmap — a
// week-by-week checklist shown on the Acquisition board, styled like the main
// /roadmap. The DEFINITION (weeks/steps/resources) is admin-editable and shared
// GLOBALLY across every acquisition client (stored once in `acquisition_roadmap`).
// Each client's tick progress is stored per-client in `acquisition_roadmap_progress`.
// Step ids are the progress keys, so they MUST stay stable once assigned.

export interface AcqRoadmapResource {
  id: string;
  label: string;
  url: string;
}
export interface AcqRoadmapStep {
  id: string;
  text: string;
  desc?: string;                    // optional supporting note (line breaks ok)
  resources?: AcqRoadmapResource[]; // links / docs shown as pills under the step
}
export interface AcqRoadmapWeek {
  id: string;
  num: string;   // display index, e.g. "01"
  label: string; // e.g. "Week One"
  title: string; // e.g. "Data Analysis"
  sub?: string;  // one-line description under the title
  steps: AcqRoadmapStep[];
}
export interface AcqRoadmapDef {
  weeks: AcqRoadmapWeek[];
}

// ── Default roadmap (used until an admin saves their own) ─────────────────────
export const DEFAULT_ACQ_ROADMAP: AcqRoadmapDef = {
  weeks: [
    {
      id: 'week-1', num: '01', label: 'Week One', title: 'Data Analysis',
      sub: 'Get set up, plug into the systems, and go through the core SOPs.',
      steps: [
        { id: 'w1s1', text: 'Fill in onboarding form', resources: [{ id: 'w1s1r1', label: 'Onboarding form', url: 'https://form.typeform.com/to/eb7tqR6G' }] },
        { id: 'w1s2', text: 'Set up Lovable dashboard', resources: [{ id: 'w1s2r1', label: 'Sales dashboard', url: 'https://salesdashaqmastery.lovable.app/' }] },
        { id: 'w1s3', text: 'Connect automations to the Discord' },
        { id: 'w1s4', text: "Go through setting SOP's" },
        { id: 'w1s5', text: "Go through closing SOP's" },
        { id: 'w1s6', text: 'Go through follow up SOP' },
        { id: 'w1s7', text: 'Attend data analysis group call' },
        { id: 'w1s8', text: 'Attend your 1-1 call with Teddy' },
      ],
    },
    {
      id: 'week-2', num: '02', label: 'Week Two', title: 'Managing A Team',
      sub: 'Fill in your foundations, bring your setters on, and build your team docs.',
      steps: [
        { id: 'w2s1', text: 'Fill in month 0 data' },
        { id: 'w2s2', text: "Fill in 'your offer'" },
        { id: 'w2s3', text: "Fill in 'personal SOPs'" },
        { id: 'w2s4', text: "Fill in 'important links'" },
        { id: 'w2s5', text: 'Add your setters to the Discord and have them drop their emails in the chat to receive invites to meetings', resources: [{ id: 'w2s5r1', label: 'Discord invite', url: 'https://discord.gg/WBEpVntkZ' }] },
        { id: 'w2s6', text: 'Attend team call on management' },
        { id: 'w2s7', text: 'Create expectations document and KPI sheet (SOP)' },
        { id: 'w2s8', text: 'Run calls with team to get their why and add to team document (SOP)' },
        { id: 'w2s9', text: 'Book in next 1-1 for review' },
      ],
    },
    {
      id: 'week-3', num: '03', label: 'Week Three', title: 'Hiring and Firing',
      sub: 'Set your hiring criteria, audit your team, and plan each person forward.',
      steps: [
        { id: 'w3s1', text: 'Attend 1-1' },
        { id: 'w3s2', text: 'Attend group call on hiring and firing, setting criteria' },
        { id: 'w3s3', text: 'Fully audit your team — who is operating as an A player, B player, C player' },
        { id: 'w3s4', text: 'Submit actionables for each person in your business' },
        { id: 'w3s5', text: 'Book your 1-1 for review' },
      ],
    },
    {
      id: 'week-4', num: '04', label: 'Week Four', title: 'How to Train A Team',
      sub: 'Train your setters, closers and managers — then review how your managers train.',
      steps: [
        { id: 'w4s1', text: 'Attend 1-1 call to review team overview and actionables to create A-players' },
        { id: 'w4s2', text: 'Attend group call on team training (training a setter, training a closer, training a manager, how to monitor managers training)' },
        { id: 'w4s3', text: 'Review your managers training process / submit a training call in for review' },
      ],
    },
  ],
};

// Coerce arbitrary stored JSON into a valid definition (drops malformed rows).
export function normalizeRoadmap(raw: unknown): AcqRoadmapDef {
  const weeksIn = (raw && typeof raw === 'object' && Array.isArray((raw as AcqRoadmapDef).weeks))
    ? (raw as AcqRoadmapDef).weeks : [];
  const weeks: AcqRoadmapWeek[] = weeksIn
    .filter((w): w is AcqRoadmapWeek => !!w && typeof w === 'object' && typeof w.id === 'string')
    .map((w, wi) => ({
      id: w.id,
      num: typeof w.num === 'string' && w.num ? w.num : String(wi + 1).padStart(2, '0'),
      label: typeof w.label === 'string' ? w.label : `Week ${wi + 1}`,
      title: typeof w.title === 'string' ? w.title : '',
      sub: typeof w.sub === 'string' ? w.sub : '',
      steps: Array.isArray(w.steps)
        ? w.steps
            .filter((s): s is AcqRoadmapStep => !!s && typeof s === 'object' && typeof s.id === 'string')
            .map((s) => ({
              id: s.id,
              text: typeof s.text === 'string' ? s.text : '',
              desc: typeof s.desc === 'string' ? s.desc : '',
              resources: Array.isArray(s.resources)
                ? s.resources
                    .filter((r): r is AcqRoadmapResource => !!r && typeof r === 'object' && typeof r.id === 'string')
                    .map((r) => ({ id: r.id, label: typeof r.label === 'string' ? r.label : '', url: typeof r.url === 'string' ? r.url : '' }))
                : [],
            }))
        : [],
    }));
  return { weeks };
}

// Flat list of every step id in week order — the spine of the gating logic.
export function flatStepIds(def: AcqRoadmapDef): string[] {
  return def.weeks.flatMap((w) => w.steps.map((s) => s.id));
}

export function totalSteps(def: AcqRoadmapDef): number {
  return def.weeks.reduce((n, w) => n + w.steps.length, 0);
}

// A week is complete once every step in it is ticked (empty weeks count as done).
export function weekComplete(week: AcqRoadmapWeek, completed: Set<string>): boolean {
  return week.steps.every((s) => completed.has(s.id));
}

// Sequential unlock, mirroring the main roadmap: week 0 is always open; every
// later week unlocks only once all earlier weeks are fully complete.
export function isWeekUnlocked(def: AcqRoadmapDef, weekIdx: number, completed: Set<string>): boolean {
  if (weekIdx <= 0) return true;
  for (let i = 0; i < weekIdx; i++) {
    if (!weekComplete(def.weeks[i], completed)) return false;
  }
  return true;
}

// The week the client is currently working through (first incomplete), or the
// last week once everything is done.
export function currentWeekIdx(def: AcqRoadmapDef, completed: Set<string>): number {
  const i = def.weeks.findIndex((w) => !weekComplete(w, completed));
  return i < 0 ? Math.max(0, def.weeks.length - 1) : i;
}
