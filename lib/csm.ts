// CSM (client-success) aggregation layer. Composes the per-feature lib modules
// into the rollups the admin CSM dashboard needs: a list of every client with
// at-a-glance health, and a full per-client journey overview.

import { db, getAllUsers, getRoadmapProgress, getModuleProgress, getWins, type PublicUser, type ClientWin } from '@/lib/kv';
import {
  getClientProgress,
  listCheckInsForClient,
  countCheckInsForClient,
  type ClientProgress,
  type CheckIn,
} from '@/lib/checkins';
import { listActionItemsView as listActionItems, type ActionItemView as ActionItem } from '@/lib/todos';
import { getClientEvents, getJourneySummary, type ClientEvent, type JourneySummary } from '@/lib/journey';
import { getOnboardingStepCompletions, listOnboardingUploads } from '@/lib/onboarding';
import { formatFormsForAI, getFormsStructured, type FormResponseGroup } from '@/lib/forms-store';
import { getLatestSignature, signedUrl } from '@/lib/contracts';
import { countCompleted, getCurrentPhase, totalItems } from '@/lib/roadmap-data';
import { phasesFor } from '@/lib/roadmap-variant';
import { ONBOARDING_STEPS } from '@/lib/onboarding-data';
import { stepsFor } from '@/lib/onboarding-variant';
import { listReports, weekSignals, weekActionItems, onWeeklyReport } from '@/lib/creative-weekly-report-store';
import { derive, escalations, weekLabel } from '@/lib/creative-weekly-report';

export interface ClientHealth {
  email: string;
  name: string;
  active: boolean;
  last_login: number;
  activity_level: string;
  tags: string[];
  // Creative Specialist (raw `creative_specialist` feature) — the list view
  // filters on it.
  creativeSpecialist: boolean;
  momentum: string | null;
  roadmap: { completed: number; total: number; currentPhase: string };
  openActionItems: number;
  checkins: number;
  lastActivityAt: string | null;
  totalEvents: number;
}

// One client's health row for the list view. Five small parallel queries.
async function healthFor(user: PublicUser): Promise<ClientHealth> {
  const [completed, openItems, checkinCounts, progress, summary] = await Promise.all([
    getRoadmapProgress(user.email),
    listActionItems(user.email, { includeCompleted: false }),
    countCheckInsForClient(user.email),
    getClientProgress(user.email),
    getJourneySummary(user.email),
  ]);
  // Score against the roadmap this client is actually on ("Creative Specialist"
  // members have their own phases and step count).
  const phases = phasesFor(user.features);
  const currentPhase = getCurrentPhase(completed, phases);
  // Most recent signal of life: a journey event, else the last login.
  const lastActivityAt =
    summary.lastEventAt ??
    (user.last_login ? new Date(user.last_login).toISOString() : null);
  return {
    email: user.email,
    name: user.name,
    active: user.active,
    last_login: user.last_login,
    activity_level: user.activity_level,
    tags: user.tags || [],
    creativeSpecialist: onWeeklyReport(user.features),
    momentum: progress?.momentum ?? null,
    roadmap: {
      completed: countCompleted(completed, phases),
      total: totalItems(phases),
      currentPhase: currentPhase.title,
    },
    openActionItems: openItems.length,
    checkins: checkinCounts.total,
    lastActivityAt,
    totalEvents: summary.total,
  };
}

// All non-admin clients with health, most-recently-active first.
export async function getClientsHealth(): Promise<ClientHealth[]> {
  const users = await getAllUsers();
  const clients = users.filter((u) => u.role !== 'admin');
  const rows = await Promise.all(clients.map((u) => healthFor(u)));
  return rows.sort((a, b) => {
    const at = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const bt = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    return bt - at;
  });
}

// A sales/closing call attributed to this client (calls.client_email match),
// with its ICP analysis. Sensitive (revenue/ICP) → admin CSM view only.
export interface ClientSalesCall {
  id: string;
  lead_name: string | null;
  call_date: string | null;
  outcome: string | null;
  revenue: number;
  cash_collected: number;
  icp_score: number | null;
  close_likelihood: number | null;
  call_summary: string | null;
}

async function getClientSalesCalls(email: string): Promise<ClientSalesCall[]> {
  const { data } = await db()
    .from('calls')
    .select('id, lead_name, call_date, outcome, revenue, cash_collected, created_at, icp_reports(icp_score, close_likelihood, call_summary)')
    .eq('client_email', email.toLowerCase().trim())
    .neq('status', 'internal')
    .order('call_date', { ascending: false, nullsFirst: false });
  return (data ?? []).map((r) => {
    const rep = Array.isArray(r.icp_reports) ? r.icp_reports[0] : r.icp_reports;
    return {
      id: r.id as string,
      lead_name: (r.lead_name as string | null) ?? null,
      call_date: (r.call_date as string | null) ?? (r.created_at as string | null) ?? null,
      outcome: (r.outcome as string | null) ?? null,
      revenue: Number(r.revenue) || 0,
      cash_collected: Number(r.cash_collected) || 0,
      icp_score: (rep?.icp_score as number | null) ?? null,
      close_likelihood: (rep?.close_likelihood as number | null) ?? null,
      call_summary: (rep?.call_summary as string | null) ?? null,
    };
  });
}

export interface RoadmapPhaseProgress {
  id: string;
  title: string;
  total: number;
  completed: number;
  items: { id: string; text: string; done: boolean }[];
}

// A Creative Specialist's weekly reports, flattened for the client profile and
// the CSM assistant. One entry per week, carrying the FRIDAY numbers plus whether
// that week's Wednesday plan came in. `derived` numbers are recomputed rather than
// stored, so they always match the schema in lib/creative-weekly-report.ts.
export interface WeeklyReportWeek {
  weekStart: string;
  weekLabel: string;
  submittedAt: string | null;        // the Friday report came in
  sentAt: string | null;             // it went to the founder
  // The Wednesday plan for the same week.
  planSubmittedAt: string | null;
  // Commitment (Friday section 3) — read off their to-do list, not typed.
  completionRate: number | null;
  todosAssigned: number;
  todosCompleted: number;
  // Sales (Friday section 1)
  bookedCalls: number;
  closed: number;
  closeRate: number | null;
  totalCash: number;
  newCash: number;
  // Content (Friday section 2)
  igViews7d: number;
  igFollowerGrowth: number;
  ytViews: number;
  ytWatchHours: number;
}
export interface WeeklyReportDigest {
  weeks: WeeklyReportWeek[];
  escalations: string[];
  // What still needs doing on the most recent week, for an at-a-glance nudge.
  awaitingPlan: boolean;         // no Wednesday plan for the latest week
  awaitingSubmission: boolean;   // no Friday report for the latest week
  awaitingSend: boolean;         // Friday report in, not yet sent
}

export interface ClientJourney {
  profile: {
    email: string;
    name: string;
    active: boolean;
    role: string;
    last_login: number;
    created_at: number;
    start_date: number;
    activity_level: string;
    tags: string[];
    features: string[];
    revenue_goal: number;
    revenue_current: number;
    contract_tier: string | null;
    onboarded_at: number | null;
  } | null;
  progress: ClientProgress | null;
  wins: ClientWin[];
  checkins: CheckIn[];
  salesCalls: ClientSalesCall[];
  actionItems: ActionItem[];
  roadmap: { completed: number; total: number; phases: RoadmapPhaseProgress[] };
  modules: { completed: number };
  onboarding: {
    onboardedAt: number | null;
    total: number;
    completed: number;
    contractTier: string | null;
    steps: { id: string; title: string; done: boolean; completedAt: string | null }[];
  };
  deliverables: { id: string; stepId: string; stepTitle: string; name: string; url: string; createdAt: string }[];
  // Only populated for Creative Specialists (null for everyone else) — their
  // weekly KPI report, newest week first, plus the escalation triggers it fires.
  weeklyReports: WeeklyReportDigest | null;
  contract: { signed: boolean; tier: string | null; signerName: string | null; signedAt: string | null; viewUrl: string | null };
  forms: string;
  formsStructured: FormResponseGroup[];
  events: ClientEvent[];
  summary: JourneySummary;
}

// A Creative Specialist's weekly reports, or null if they aren't on them. Reads
// the RAW features column (see lib/roadmap-variant.ts for why not resolveFeatures).
async function weeklyReportDigestFor(
  email: string,
  features: string[] | null | undefined,
  sinceMs: number | null,
): Promise<WeeklyReportDigest | null> {
  if (!onWeeklyReport(features)) return null;
  const [reports, plans, signals] = await Promise.all([
    listReports(email, 'friday', 12),
    listReports(email, 'wednesday', 12),
    weekSignals(email),
  ]);
  const planByWeek = new Map(plans.map((p) => [p.week_start, p]));

  // Weeks that have a Wednesday plan but no Friday report yet still need a row,
  // or a mid-week client would look like they'd reported nothing at all.
  const allWeeks = [...new Set([...reports.map((r) => r.week_start), ...plans.map((p) => p.week_start)])]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 12);
  const reportByWeek = new Map(reports.map((r) => [r.week_start, r]));

  const weeks: WeeklyReportWeek[] = await Promise.all(allWeeks.map(async (week) => {
    const r = reportByWeek.get(week);
    const a = r?.answers ?? {};
    // The Commitment section is live to-do data, so it has to be read per week.
    const actionItems = await weekActionItems(email, week);
    const d = derive(a, week, { startDateMs: sinceMs, actionItems });
    return {
      weekStart: week,
      weekLabel: weekLabel(week),
      submittedAt: r?.submitted_at ?? null,
      sentAt: r?.sent_at ?? null,
      planSubmittedAt: planByWeek.get(week)?.submitted_at ?? null,
      completionRate: d.commitment.completionRate,
      todosAssigned: d.commitment.assigned,
      todosCompleted: d.commitment.completed,
      bookedCalls: Number(a.qualified_booked_calls ?? 0) || 0,
      closed: Number(a.closed ?? 0) || 0,
      closeRate: d.closeRate,
      totalCash: d.totalCash,
      newCash: d.newCash,
      igViews7d: d.igViews7d,
      igFollowerGrowth: d.igFollowerGrowth,
      ytViews: d.ytViews,
      ytWatchHours: d.ytWatchHours,
    };
  }));

  const latest = weeks[0] ?? null;
  return {
    weeks,
    escalations: escalations(signals),
    awaitingPlan: !!latest && !latest.planSubmittedAt,
    awaitingSubmission: !!latest && !latest.submittedAt,
    awaitingSend: !!latest?.submittedAt && !latest.sentAt,
  };
}

// Everything we know about one client's journey, for the detail view.
export async function getClientJourney(email: string): Promise<ClientJourney> {
  const users = await getAllUsers();
  const user = users.find((u) => u.email === email.toLowerCase().trim()) ?? null;

  const [progress, wins, checkins, salesCalls, actionItems, completedIds, events, summary, stepCompletions, uploads, forms, formsStructured, moduleIds, signature] =
    await Promise.all([
      getClientProgress(email),
      getWins(email),
      listCheckInsForClient(email),
      getClientSalesCalls(email),
      listActionItems(email, { includeCompleted: true }),
      getRoadmapProgress(email),
      getClientEvents(email, { limit: 200 }),
      getJourneySummary(email),
      getOnboardingStepCompletions(email),
      listOnboardingUploads(email),
      formatFormsForAI(email),
      getFormsStructured(email),
      getModuleProgress(email),
      getLatestSignature(email).catch(() => null),
    ]);

  // A fresh signed URL to view the signed contract PDF (private bucket).
  const contractViewUrl = signature ? await signedUrl(signature.signed_path).catch(() => null) : null;

  // Needs the resolved profile (features + start date), so it runs after the batch.
  const weeklyReports = await weeklyReportDigestFor(
    email, user?.features, user?.start_date || user?.created_at || null,
  ).catch(() => null);

  const done = new Set(completedIds);
  const stepDoneAt = new Map(stepCompletions.map((s) => [s.stepId, s.completedAt]));
  // Score onboarding against THEIR wizard — a Creative Specialist has a single
  // form step, not the standard client sequence.
  const onboardingStepDefs = stepsFor(user?.features);
  const onboardingSteps = onboardingStepDefs.map((s) => ({
    id: s.id, title: s.title, done: stepDoneAt.has(s.id), completedAt: stepDoneAt.get(s.id) ?? null,
  }));
  // Deliverable step titles can come from either wizard, so look across both.
  const stepTitle = (id: string) =>
    [...ONBOARDING_STEPS, ...onboardingStepDefs].find((s) => s.id === id)?.title ?? id;
  const roadmapPhases = phasesFor(user?.features);
  const phases: RoadmapPhaseProgress[] = roadmapPhases.map((p) => ({
    id: p.id,
    title: p.title,
    total: p.items.length,
    completed: p.items.filter((i) => done.has(i.id)).length,
    items: p.items.map((i) => ({ id: i.id, text: i.text, done: done.has(i.id) })),
  }));

  return {
    profile: user
      ? {
          email: user.email,
          name: user.name,
          active: user.active,
          role: user.role,
          last_login: user.last_login,
          created_at: user.created_at,
          start_date: user.start_date,
          activity_level: user.activity_level,
          tags: user.tags || [],
          // Raw allowlist (not resolveFeatures) — the CSM view keys the
          // Creative-Specialist-only tabs off it.
          features: user.features || [],
          revenue_goal: user.revenue_goal,
          revenue_current: user.revenue_current,
          contract_tier: user.contract_tier ?? null,
          onboarded_at: user.onboarded_at ?? null,
        }
      : null,
    progress,
    wins,
    checkins,
    salesCalls,
    actionItems,
    roadmap: { completed: countCompleted(completedIds, roadmapPhases), total: totalItems(roadmapPhases), phases },
    modules: { completed: moduleIds.length },
    onboarding: {
      onboardedAt: user?.onboarded_at ?? null,
      total: onboardingStepDefs.length,
      completed: onboardingSteps.filter((s) => s.done).length,
      contractTier: user?.contract_tier ?? null,
      steps: onboardingSteps,
    },
    deliverables: uploads.map((u) => ({
      id: u.id, stepId: u.stepId, stepTitle: stepTitle(u.stepId), name: u.name, url: u.url, createdAt: u.createdAt,
    })),
    weeklyReports,
    contract: {
      signed: !!signature,
      tier: signature?.tier ?? user?.contract_tier ?? null,
      signerName: signature?.signer_name ?? null,
      signedAt: signature?.signed_at ?? null,
      viewUrl: contractViewUrl,
    },
    forms,
    formsStructured,
    events,
    summary,
  };
}

/* ─── Cached AI journey summary ───────────────────────────────────────────── */
export interface ClientSummary { summary: string; generatedAt: string | null }

export async function getClientSummary(email: string): Promise<ClientSummary | null> {
  const { data } = await db()
    .from('client_summaries')
    .select('summary, generated_at')
    .eq('client_email', email.toLowerCase().trim())
    .maybeSingle();
  return data ? { summary: data.summary as string, generatedAt: data.generated_at as string } : null;
}

export async function setClientSummary(email: string, summary: string): Promise<string> {
  const generated_at = new Date().toISOString();
  await db().from('client_summaries').upsert(
    { client_email: email.toLowerCase().trim(), summary, generated_at },
    { onConflict: 'client_email' }
  );
  return generated_at;
}
