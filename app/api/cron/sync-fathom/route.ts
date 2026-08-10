import { NextRequest, NextResponse } from 'next/server';
import { importFathomSalesCalls, analyzePendingCalls } from '@/lib/sales-sync';
import { attributeUnlinkedCalls } from '@/lib/sales-attribution';

// Daily Fathom sales-call sync (scheduled by vercel.json → crons). Reachable
// without an auth cookie (proxy allowlists /api/cron/), secured instead by the
// CRON_SECRET bearer token Vercel Cron sends automatically when that env var is
// set. Pulls ONLY the dedicated sales manager's Fathom account.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// How many pending calls to analyze per run. Each closing-call analysis can take
// 30-60s; kept small so the whole run stays under maxDuration. Daily repetition
// (plus the real-time webhook) drains any backlog.
const ANALYZE_PER_RUN = 4;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — never run unauthenticated
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 1) Import new sales calls from the sales manager's Fathom account.
  const imported = await importFathomSalesCalls({ source: 'sales_manager' });
  if ('error' in imported) {
    // A missing sales key or empty account isn't a failure worth alerting on.
    return NextResponse.json({ ok: true, skipped: imported.error });
  }

  // 2) Link any still-unlinked calls to clients (covers webhook/legacy rows).
  const backfill = await attributeUnlinkedCalls(200);

  // 3) Analyze a bounded batch of pending calls so the dashboard stays current.
  let analyzed = 0, failed = 0, internal = 0, failedPermanently = 0;
  let remaining = imported.pending_analysis;
  for (let i = 0; i < ANALYZE_PER_RUN; i++) {
    const r = await analyzePendingCalls(1);
    analyzed += r.analyzed; failed += r.failed; internal += r.internal;
    failedPermanently += r.failed_permanently; remaining = r.remaining;
    if (r.remaining === 0 || (r.analyzed === 0 && r.failed === 0 && r.internal === 0)) break;
  }

  return NextResponse.json({
    ok: true,
    imported: imported.imported,
    attributed_on_import: imported.attributed,
    backfill_linked: backfill.linked,
    analyzed, failed, internal,
    pending_remaining: remaining,
    // Non-zero means calls exhausted their retries and need attention (bad
    // transcript, or a persistent analysis error) — visible for monitoring.
    analysis_failed_total: imported.analysis_failed + failedPermanently,
  });
}
