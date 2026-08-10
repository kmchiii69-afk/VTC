import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import {
  getReport, listReports, getWeekPair, saveAnswers, markSubmitted, weekSignals, weekActionItems,
  onWeeklyReport, MigrationPendingError,
} from '@/lib/creative-weekly-report-store';
import {
  currentReportWeek, mondayOf, isoDate, weekLabel, weekNumber, DEFAULT_REPORT_KIND, isReportKind,
  derive, escalations, missingFor, KIND_META, type ReportAnswers, type ReportKind,
} from '@/lib/creative-weekly-report';
import { sendSubmissionNotice } from '@/lib/discord/notify';

// The two weekly reports a Creative Specialist fills: the Wednesday plan (how
// they'll land this week's to-dos) and the Friday results (Sales, Content,
// Commitment). Both stay open all week; ?kind= picks one. The to-do sections
// aren't typed — they're read live off client_todos and returned here. Never
// cached: the report changes as they type, and so does the to-do list behind it.
export const dynamic = 'force-dynamic';

// Resolve the week a request is about: an explicit ?week= (normalized to its
// Monday), else the current Mon-Sun week. A future week is clamped back to the
// current one — you can't report a week that hasn't started.
function resolveWeek(raw: string | null | undefined): string {
  const current = currentReportWeek();
  if (!raw) return current;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return current;
  const wk = isoDate(mondayOf(d));
  return wk > current ? current : wk;
}

// Which report: an explicit ?kind=, else the Wednesday plan. Both kinds are
// available every day — nothing here depends on the weekday.
function resolveKind(raw: string | null | undefined): ReportKind {
  return isReportKind(raw) ? raw : DEFAULT_REPORT_KIND;
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getUser(auth.email);
  // Admins can open the page to see what members see; everyone else needs the tag.
  if (!profile || (!onWeeklyReport(profile.features) && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const week = resolveWeek(req.nextUrl.searchParams.get('week'));
  const kind = resolveKind(req.nextUrl.searchParams.get('kind'));

  const [report, history, signals, actionItems, pair] = await Promise.all([
    getReport(auth.email, week, kind),
    listReports(auth.email, kind, 12),
    weekSignals(auth.email),
    weekActionItems(auth.email, week),
    getWeekPair(auth.email, week),
  ]);

  const answers: ReportAnswers = report?.answers ?? {};
  const since = profile.start_date || profile.created_at;

  return NextResponse.json({
    kind,
    kindLabel: KIND_META[kind].label,
    weekStart: week,
    weekLabel: weekLabel(week),
    weekNumber: weekNumber(week, since),
    answers,
    // The to-do sections are rendered from these, not from stored answers.
    actionItems,
    submittedAt: report?.submitted_at ?? null,
    sentAt: report?.sent_at ?? null,
    // So the toggle can show which of the two is already in for this week.
    weekStatus: {
      wednesday: !!pair.wednesday?.submitted_at,
      friday: !!pair.friday?.submitted_at,
    },
    derived: derive(answers, week, { startDateMs: since, actionItems }),
    missing: missingFor(kind, answers, { actionItems }),
    escalations: escalations(signals),
    history: history.map((r) => ({
      weekStart: r.week_start,
      weekLabel: weekLabel(r.week_start),
      submittedAt: r.submitted_at,
      sentAt: r.sent_at,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

// Save a draft (`submit` omitted) or submit the report (`submit: true`). Keys that
// don't belong to this kind of report are dropped by pickKnown.
export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getUser(auth.email);
  if (!profile || !onWeeklyReport(profile.features)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const week = resolveWeek(String(body?.weekStart ?? ''));
  const kind = resolveKind(body?.kind);
  const patch = (body?.answers ?? {}) as ReportAnswers;
  const submit = body?.submit === true;

  let saved;
  try {
    saved = await saveAnswers(auth.email, week, kind, patch);
  } catch (e) {
    const pending = e instanceof MigrationPendingError;
    return NextResponse.json(
      { error: pending ? e.message : 'Could not save the report — try again.' },
      { status: pending ? 503 : 500 },
    );
  }
  if (!saved) return NextResponse.json({ error: 'Could not save the report' }, { status: 500 });

  if (!submit) return NextResponse.json({ ok: true, weekStart: week, kind, saved: true });

  const actionItems = await weekActionItems(auth.email, week);
  const missing = missingFor(kind, saved.answers ?? {}, { actionItems });
  if (missing.length) {
    return NextResponse.json({ error: 'Some answers are still missing', missing }, { status: 400 });
  }

  const wasSubmitted = !!saved.submitted_at;
  const report = await markSubmitted(auth.email, week, kind);

  // Ping the team once, on the first submission of this report.
  if (!wasSubmitted && report) {
    const since = profile.start_date || profile.created_at;
    const d = derive(report.answers ?? {}, week, { startDateMs: since, actionItems });
    const detail = kind === 'wednesday'
      ? `${actionItems.length} to-do${actionItems.length === 1 ? '' : 's'} planned`
      : d.commitment.completionRate === null
        ? 'no to-dos assigned'
        : `${d.commitment.completionRate}% of to-dos done`;
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    await sendSubmissionNotice({
      webhookUrl: process.env.DISCORD_WEEKLY_REPORT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL,
      who: profile.name || auth.email,
      label: `${KIND_META[kind].label} · Week ${d.weekNumber} (${d.rangeLabel}) · ${detail}`,
      link: `${appUrl}/admin`,
      linkLabel: 'Read it (Client Success → client → Weekly reports)',
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, weekStart: week, kind, submittedAt: report?.submitted_at ?? null });
}
