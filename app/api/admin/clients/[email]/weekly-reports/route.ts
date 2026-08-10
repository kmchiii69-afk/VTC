import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getUser } from '@/lib/kv';
import { listReports, weekSignals, weekActionItems, onWeeklyReport } from '@/lib/creative-weekly-report-store';
import {
  derive, escalations, missingFor, weekLabel, currentReportWeek, isReportKind, REPORT_KINDS,
  type ReportKind,
} from '@/lib/creative-weekly-report';

type Params = { params: Promise<{ email: string }> };

// A Creative Specialist's weekly reports for the CSM view — Wednesday plans or
// Friday results, newest week first, each with its auto-calculated fields and the
// week's to-do list behind the to-do sections. `?kind=` picks which; the counts
// for both come back either way so the tab can label its toggle.
//
// Read-only: the only write is PATCH .../weekly-reports/[id] to mark one sent.
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email } = await params;
  const decoded = decodeURIComponent(email);
  const raw = req.nextUrl.searchParams.get('kind');
  const kind: ReportKind = isReportKind(raw) ? raw : 'friday';

  const [profile, reports, signals, allKinds] = await Promise.all([
    getUser(decoded),
    listReports(decoded, kind),
    weekSignals(decoded),
    Promise.all(REPORT_KINDS.map(async (k) => [k, (await listReports(decoded, k)).length] as const)),
  ]);

  const since = profile?.start_date || profile?.created_at || null;
  const withItems = await Promise.all(
    reports.map(async (r) => {
      const actionItems = await weekActionItems(decoded, r.week_start);
      const answers = r.answers ?? {};
      return {
        id: r.id,
        kind: r.kind,
        weekStart: r.week_start,
        weekLabel: weekLabel(r.week_start),
        answers,
        actionItems,
        submittedAt: r.submitted_at,
        sentAt: r.sent_at,
        derived: derive(answers, r.week_start, { startDateMs: since, actionItems }),
        missing: missingFor(r.kind, answers, { actionItems }),
      };
    }),
  );

  return NextResponse.json({
    onWeeklyReport: onWeeklyReport(profile?.features),
    currentWeek: currentReportWeek(),
    kind,
    counts: Object.fromEntries(allKinds) as Record<ReportKind, number>,
    escalations: escalations(signals),
    reports: withItems,
  });
}
