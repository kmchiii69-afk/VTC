// The Creative Specialist weekly reports — schema, week maths and every
// auto-calculated field.
//
// TWO reports per Mon-Sun week, both member-authored, distinguished by `kind`:
//
//   WEDNESDAY — the mid-week plan. Not numbers: it lists the to-dos assigned to
//     them this week with an "implementation" box against each, then asks for the
//     steps they'll take to finish them.
//       1. This week's to-dos
//       2. Steps you will take this week to complete your to-dos
//
//   FRIDAY — the week's results.
//       1. Sales      — booked/taken/closed, no-shows, revenue and the cash split
//       2. Content    — split into Instagram and YouTube sub-sections
//       3. Commitment — read live from the to-do list, with a "why" box against
//                       every item they didn't tick off
//
// Both stay open all week (a member who misses Wednesday can still fill it
// Thursday, and past weeks stay editable); the Discord prompt is what fires on the
// day. We read them and mark them sent from the CSM client profile — nothing in
// either is admin-authored, so there is no owner split.
//
// Answers are stored as one jsonb map of field id → value in
// creative_weekly_reports.answers, keyed by (member, week, kind), so FIELD IDS
// MUST STAY STABLE once live.
//
// PURE — no DB or server imports. Safe in client components (the member form and
// the admin review both render straight off these definitions). That's why the
// week helpers are re-implemented here rather than imported from lib/weekly-cash,
// which pulls in the service-role Supabase client.

export type ReportFieldType =
  | 'number'    // plain count
  | 'money'     // $ amount
  | 'percent'   // 0-100
  | 'duration'  // mm:ss, free text so "4:32" stays readable
  | 'text'
  | 'textarea';

export interface ReportField {
  id: string;
  label: string;
  type: ReportFieldType;
  help?: string;
  placeholder?: string;
  optional?: boolean;        // not needed before the report can be submitted
}

// A repeating row group. Row values are stored under the group id as an array of
// { columnId: value } objects.
//
// `numbered` groups are a single-column ordered list (the reels / video
// pipelines): each row renders as "1.", "2.", "3." … so the list numbers itself
// as they type, instead of showing a column header per row.
export interface ReportRepeat {
  id: string;
  label: string;
  help?: string;
  columns: ReportField[];
  rows: number;              // rows always rendered
  maxRows: number;
  addLabel: string;
  keyColumn: string;         // a row with this blank is ignored
  numbered?: boolean;
  optional?: boolean;        // no filled row required before submitting
}

// A sub-section (Content → Instagram / YouTube).
export interface ReportGroup {
  id: string;
  label: string;
  fields?: ReportField[];
  repeats?: ReportRepeat[];
}

// Sections that render from the member's to-do list rather than from typed
// fields. 'plan' is Wednesday's implementation-per-to-do list; 'commitment' is
// Friday's completed/missed split.
export type AppDataSection = 'plan' | 'commitment';

export interface ReportSection {
  id: string;
  num: string;
  title: string;
  fields?: ReportField[];
  repeats?: ReportRepeat[];
  groups?: ReportGroup[];
  appData?: AppDataSection;
}

/* ─── Report kinds ────────────────────────────────────────────────────────── */

export type ReportKind = 'wednesday' | 'friday';

export const REPORT_KINDS: ReportKind[] = ['wednesday', 'friday'];

export function isReportKind(v: unknown): v is ReportKind {
  return v === 'wednesday' || v === 'friday';
}

export const KIND_META: Record<ReportKind, { label: string; short: string; day: number; intro: string }> = {
  // `day` is the UTC weekday the Discord prompt fires on (1 = Mon … 5 = Fri).
  wednesday: {
    label: 'Wednesday weekly report',
    short: 'Wednesday',
    day: 3,
    intro: 'Mid-week: how you’re going to land this week’s to-dos.',
  },
  friday: {
    label: 'Friday weekly report',
    short: 'Friday',
    day: 5,
    intro: 'End of week: sales, content and what you actually shipped.',
  },
};

// Both reports are reachable every day of the week — nothing about them is
// gated on the weekday, and this default deliberately doesn't vary by day either
// (it used to, which made the Wednesday report look absent on a Friday). A bare
// /weekly-report opens the Wednesday plan; the Friday report is one pill — or one
// menu tile — away.
export const DEFAULT_REPORT_KIND: ReportKind = 'wednesday';

/* ─── Wednesday sections ──────────────────────────────────────────────────── */

// The steps box lives under its own heading, so the field itself is unlabelled.
export const STEPS_FIELD_ID = 'steps_this_week';

export const WEDNESDAY_SECTIONS: ReportSection[] = [
  {
    id: 'plan',
    num: '1',
    title: "This week's to-dos",
    appData: 'plan',
  },
  {
    id: 'steps',
    num: '2',
    title: 'Steps you will take this week to complete your to-dos',
    fields: [
      { id: STEPS_FIELD_ID, label: '', type: 'textarea', placeholder: 'What you’re doing, in what order, to get these done.' },
    ],
  },
];

/* ─── Friday sections ─────────────────────────────────────────────────────── */

export const FRIDAY_SECTIONS: ReportSection[] = [
  {
    id: 'sales',
    num: '1',
    title: 'Sales',
    fields: [
      { id: 'qualified_booked_calls', label: 'Total qualified booked calls', type: 'number' },
      { id: 'closed', label: 'Closed', type: 'number' },
      { id: 'taken', label: 'Taken', type: 'number' },
      { id: 'no_shows', label: 'No show', type: 'number' },
      { id: 'revenue_generated', label: 'Revenue generated', type: 'money' },
      { id: 'total_cash', label: 'Total cash generated', type: 'money' },
      { id: 'new_cash', label: 'New cash generated', type: 'money' },
      { id: 'payment_plans_collected', label: 'Payment plans collected', type: 'money', help: 'Cash collected from existing payment plans.' },
      { id: 'icps_this_week', label: "ICPs this week", type: 'number', help: 'How many of this week’s leads were genuinely ideal-client fit.' },
    ],
  },
  {
    id: 'content',
    num: '2',
    title: 'Content',
    groups: [
      {
        id: 'instagram',
        label: 'Instagram',
        fields: [
          { id: 'ig_views_7d', label: 'Total views — last 7 days', type: 'number' },
          { id: 'ig_follower_growth', label: 'Net follower growth', type: 'number' },
          { id: 'ig_views_month', label: 'Monthly total views', type: 'number' },
        ],
        repeats: [
          {
            id: 'ig_top_reels',
            label: 'Top reels this week',
            keyColumn: 'name',
            rows: 1,
            maxRows: 6,
            addLabel: 'Add a reel',
            columns: [
              { id: 'name', label: 'Reel', type: 'text' },
              { id: 'views', label: 'Views', type: 'number' },
              { id: 'followers', label: 'Followers gained', type: 'number' },
            ],
          },
          {
            id: 'ig_reels_pipeline',
            label: 'Reels in the pipeline',
            help: 'Add them in the order they ship — the list numbers itself.',
            keyColumn: 'name',
            numbered: true,
            optional: true,
            rows: 1,
            maxRows: 20,
            addLabel: 'Add a reel',
            columns: [{ id: 'name', label: 'Reel', type: 'text' }],
          },
        ],
      },
      {
        id: 'youtube',
        label: 'YouTube',
        fields: [
          { id: 'yt_views', label: 'Total views', type: 'number' },
          { id: 'yt_watch_hours', label: 'Watch time (hours)', type: 'number' },
          { id: 'yt_subscribers_net', label: 'Subscribers (net)', type: 'number' },
          { id: 'yt_avg_view_duration', label: 'Avg view duration', type: 'duration', placeholder: '4:32' },
          { id: 'yt_ctr', label: 'Click-through rate', type: 'percent' },
        ],
        repeats: [
          {
            id: 'yt_pipeline',
            label: 'Current pipeline of videos',
            help: 'Add them in the order they ship — the list numbers itself.',
            keyColumn: 'name',
            numbered: true,
            optional: true,
            rows: 1,
            maxRows: 20,
            addLabel: 'Add a video',
            columns: [{ id: 'name', label: 'Video', type: 'text' }],
          },
        ],
      },
    ],
  },
  {
    id: 'commitment',
    num: '3',
    title: 'Commitment',
    appData: 'commitment',
  },
];

export function sectionsFor(kind: ReportKind): ReportSection[] {
  return kind === 'wednesday' ? WEDNESDAY_SECTIONS : FRIDAY_SECTIONS;
}

export type ReportRow = Record<string, unknown>;
export type ReportAnswers = Record<string, unknown>;

// Every scalar field on a report, sections and sub-sections flattened.
export function allFields(kind: ReportKind): ReportField[] {
  return sectionsFor(kind).flatMap((s) => [
    ...(s.fields ?? []),
    ...(s.groups ?? []).flatMap((g) => g.fields ?? []),
  ]);
}

// Every repeating group on a report.
export function allRepeats(kind: ReportKind): ReportRepeat[] {
  return sectionsFor(kind).flatMap((s) => [
    ...(s.repeats ?? []),
    ...(s.groups ?? []).flatMap((g) => g.repeats ?? []),
  ]);
}

// Per-to-do maps, keyed by to-do id:
//   implementations — Wednesday: how they'll get each item done
//   missed_reasons  — Friday: why an unticked item slipped
export const IMPLEMENTATIONS_KEY = 'implementations';
export const MISSED_REASONS_KEY = 'missed_reasons';
export const PER_TODO_KEYS = [IMPLEMENTATIONS_KEY, MISSED_REASONS_KEY];

function knownKeys(kind: ReportKind): Set<string> {
  return new Set([
    ...allFields(kind).map((f) => f.id),
    ...allRepeats(kind).map((r) => r.id),
    ...(kind === 'wednesday' ? [IMPLEMENTATIONS_KEY] : [MISSED_REASONS_KEY]),
  ]);
}

// Drop anything that isn't a field on THIS report, so a crafted payload can't
// write arbitrary keys — or the other report's keys — into the answers blob.
export function pickKnown(answers: ReportAnswers, kind: ReportKind): ReportAnswers {
  const allowed = knownKeys(kind);
  const out: ReportAnswers = {};
  for (const [k, v] of Object.entries(answers ?? {})) if (allowed.has(k)) out[k] = v;
  return out;
}

/* ─── Week maths (all UTC) ────────────────────────────────────────────────── */

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 00:00 UTC on the Monday of the week containing `d`.
export function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const diff = (day + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

// The week a report is being filled for: the CURRENT Mon-Sun week, because it is
// submitted on the Friday of the week just worked.
export function currentReportWeek(now: Date = new Date()): string {
  return isoDate(mondayOf(now));
}

// The Sunday that closes the week starting at `weekStartISO`.
export function weekEnd(weekStartISO: string): string {
  return isoDate(new Date(new Date(`${weekStartISO}T00:00:00Z`).getTime() + 6 * 86400000));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Jul 7–13" style label for the Mon-Sun week starting at `weekStartISO`.
export function weekLabel(weekStartISO: string): string {
  const start = new Date(`${weekStartISO}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return weekStartISO;
  const end = new Date(start.getTime() + 6 * 86400000);
  const sM = MONTHS[start.getUTCMonth()], eM = MONTHS[end.getUTCMonth()];
  return sM === eM
    ? `${sM} ${start.getUTCDate()}–${end.getUTCDate()}`
    : `${sM} ${start.getUTCDate()} – ${eM} ${end.getUTCDate()}`;
}

export function prevWeek(weekStartISO: string): string {
  return isoDate(new Date(new Date(`${weekStartISO}T00:00:00Z`).getTime() - 7 * 86400000));
}

// The engagement week number. Counts from the Monday of the client's start date
// when we know it (week 1 = kickoff week), else falls back to the ISO week number
// so the header always has something meaningful in it.
export function weekNumber(weekStartISO: string, startDateMs?: number | null): number {
  const wk = new Date(`${weekStartISO}T00:00:00Z`);
  if (Number.isNaN(wk.getTime())) return 0;
  if (startDateMs && startDateMs > 0) {
    const from = mondayOf(new Date(startDateMs));
    const weeks = Math.round((wk.getTime() - from.getTime()) / (7 * 86400000));
    return Math.max(1, weeks + 1);
  }
  // ISO 8601 week number of the Thursday in this week.
  const thu = new Date(wk.getTime() + 3 * 86400000);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return Math.floor((thu.getTime() - jan1) / 86400000 / 7) + 1;
}

/* ─── The Commitment section's live data ──────────────────────────────────── */

// One of the member's to-dos that was assigned inside the report week.
export interface WeekActionItem {
  id: string;
  text: string;
  done: boolean;
  assignedDate: string;
  completedAt: string | null;
}

export interface CommitmentStats {
  assigned: number;
  completed: number;
  completionRate: number | null;   // %
  missed: WeekActionItem[];        // assigned this week, still unticked
}

export function commitmentStats(items: WeekActionItem[] = []): CommitmentStats {
  const completed = items.filter((i) => i.done).length;
  return {
    assigned: items.length,
    completed,
    completionRate: items.length ? Math.round((completed / items.length) * 100) : null,
    missed: items.filter((i) => !i.done),
  };
}

// A per-to-do text value (implementation / missed reason) for one to-do.
export function perTodo(answers: ReportAnswers, key: string, todoId: string): string {
  const map = answers?.[key];
  if (!map || typeof map !== 'object') return '';
  return String((map as Record<string, unknown>)[todoId] ?? '');
}

// Wednesday: how they plan to get this to-do done.
export function implementation(answers: ReportAnswers, todoId: string): string {
  return perTodo(answers, IMPLEMENTATIONS_KEY, todoId);
}

// Friday: why an unticked to-do slipped.
export function missedReason(answers: ReportAnswers, todoId: string): string {
  return perTodo(answers, MISSED_REASONS_KEY, todoId);
}

/* ─── Derived / auto-calculated fields ────────────────────────────────────── */

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function rows(answers: ReportAnswers, groupId: string): ReportRow[] {
  const v = answers?.[groupId];
  return Array.isArray(v) ? (v as ReportRow[]) : [];
}

// Rows that actually carry content, judged by the group's key column.
export function filledRows(answers: ReportAnswers, repeat: ReportRepeat): ReportRow[] {
  return rows(answers, repeat.id).filter((r) => String(r?.[repeat.keyColumn] ?? '').trim() !== '');
}

export interface DeriveOpts {
  startDateMs?: number | null;
  actionItems?: WeekActionItem[];
}

export interface Derived {
  weekNumber: number;
  rangeLabel: string;
  // 1. Sales
  closeRate: number | null;         // closed / taken
  revenue: number;
  totalCash: number;
  newCash: number;
  // 2. Content
  igViewsPerDay: number | null;     // last 7 days ÷ 7
  igViews7d: number;
  igFollowerGrowth: number;
  ytViews: number;
  ytWatchHours: number;
  reelsInPipeline: number;
  videosInPipeline: number;
  // 3. Commitment
  commitment: CommitmentStats;
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function derive(answers: ReportAnswers, weekStartISO: string, opts: DeriveOpts = {}): Derived {
  const taken = num(answers.taken);
  const igViews7d = num(answers.ig_views_7d);

  return {
    weekNumber: weekNumber(weekStartISO, opts.startDateMs),
    rangeLabel: weekLabel(weekStartISO),

    closeRate: pct(num(answers.closed), taken),
    revenue: num(answers.revenue_generated),
    totalCash: num(answers.total_cash),
    newCash: num(answers.new_cash),

    // "Views / Day" — auto, straight off the last-7-days figure.
    igViewsPerDay: igViews7d > 0 ? Math.round(igViews7d / 7) : null,
    igViews7d,
    igFollowerGrowth: num(answers.ig_follower_growth),
    ytViews: num(answers.yt_views),
    ytWatchHours: num(answers.yt_watch_hours),
    reelsInPipeline: rows(answers, 'ig_reels_pipeline').filter((r) => String(r?.name ?? '').trim() !== '').length,
    videosInPipeline: rows(answers, 'yt_pipeline').filter((r) => String(r?.name ?? '').trim() !== '').length,

    commitment: commitmentStats(opts.actionItems),
  };
}

/* ─── Escalation trigger ──────────────────────────────────────────────────── */

// Completion rate is the leading indicator: under 70% two weeks running is the
// intervention point, not the "let's see how next week goes" point.
export const COMPLETION_FLOOR = 70;

export interface WeekSignal { weekStart: string; completionRate: number | null }

export function escalations(history: WeekSignal[]): string[] {
  // Newest first, so the two most recent weeks are [0] and [1].
  const recent = [...history].sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, 2);
  if (recent.length < 2) return [];
  if (!recent.every((w) => w.completionRate !== null && w.completionRate < COMPLETION_FLOOR)) return [];
  return [
    `Commitment completion under ${COMPLETION_FLOOR}% two weeks running (${recent[1].completionRate}% → ${recent[0].completionRate}%) — this is the intervention point.`,
  ];
}

// The at-a-glance health band for a week, from its commitment completion rate.
// Used for the status dot on week pills and in the CSM digest.
export type HealthBand = 'green' | 'amber' | 'red' | 'none';
export function healthBand(completionRate: number | null): HealthBand {
  if (completionRate === null) return 'none';
  if (completionRate >= 85) return 'green';
  if (completionRate >= COMPLETION_FLOOR) return 'amber';
  return 'red';
}

/* ─── Validation ──────────────────────────────────────────────────────────── */

export interface Missing { sectionId: string; label: string }

// What the member still has to fill before the report can be submitted.
export function missingFor(kind: ReportKind, answers: ReportAnswers, opts: DeriveOpts = {}): Missing[] {
  const out: Missing[] = [];

  const checkFields = (sectionId: string, prefix: string, fields: ReportField[] = []) => {
    for (const f of fields) {
      if (f.optional) continue;
      // An unlabelled field sits under its own section heading (the steps box).
      const label = prefix + (f.label || sectionsFor(kind).find((s) => s.id === sectionId)?.title || f.id);
      if (String(answers[f.id] ?? '').trim() === '') out.push({ sectionId, label });
    }
  };
  const checkRepeats = (sectionId: string, prefix: string, repeats: ReportRepeat[] = []) => {
    for (const r of repeats) {
      const filled = filledRows(answers, r);
      if (!r.optional && filled.length === 0) {
        out.push({ sectionId, label: `${prefix}${r.label} — add at least one` });
        continue;
      }
      // A started row must be finished: every non-optional column needs a value.
      for (const [i, row] of filled.entries()) {
        for (const c of r.columns) {
          if (c.optional || c.id === r.keyColumn) continue;
          if (String(row[c.id] ?? '').trim() === '') {
            out.push({ sectionId, label: `${prefix}${r.label} row ${i + 1} — ${c.label}` });
          }
        }
      }
    }
  };

  for (const s of sectionsFor(kind)) {
    checkFields(s.id, '', s.fields);
    checkRepeats(s.id, '', s.repeats);
    for (const g of s.groups ?? []) {
      checkFields(s.id, `${g.label} — `, g.fields);
      checkRepeats(s.id, `${g.label} — `, g.repeats);
    }
  }

  const items = opts.actionItems ?? [];

  if (kind === 'wednesday') {
    // Every to-do assigned this week needs an implementation — that's the report.
    for (const item of items) {
      if (implementation(answers, item.id).trim() === '') {
        out.push({ sectionId: 'plan', label: `How will you do "${item.text}"?` });
      }
    }
  } else {
    // Every to-do they didn't tick off needs a reason. This is the whole point of
    // the section: a miss with no explanation tells you nothing next week.
    for (const item of commitmentStats(items).missed) {
      if (missedReason(answers, item.id).trim() === '') {
        out.push({ sectionId: 'commitment', label: `Why was "${item.text}" missed?` });
      }
    }
  }

  return out;
}
