import { NextRequest, NextResponse } from 'next/server';
import { importCloseCalls, syncLeadsToClose } from '@/lib/close-sync';
import { syncLeadsToAloware } from '@/lib/aloware-sync';
import { importCloseLeads } from '@/lib/close-import';

// CRM mirror sweep — Close and Aloware (scheduled by vercel.json → crons, every
// 10 minutes).
// Reachable without an auth cookie (proxy allowlists /api/cron/), secured instead
// by the CRON_SECRET bearer token Vercel Cron sends automatically.
//
// Out: the funnel/CRM entry points already push each new lead the moment it lands
// (queueCloseSync), so the push half is the safety net — leads created by paths
// without a hook (CSV import, ManyChat, direct DB edits), pushes that failed while
// Close was down, and leads edited since their last push. Bounded per run, so a big
// import drains over a few passes rather than hammering Close in one burst.
//
// In: every dial the team makes in Close comes back onto the CRM timeline, counted
// into dials_made and rolled into the follow-up cadence. One org-wide request, so
// this costs the same whether the CRM holds 300 leads or 30,000.
//
// Aloware: the contact push only. Calls and texts made in Aloware arrive by webhook
// (app/api/webhooks/aloware) the moment they finish — Aloware has no endpoint for
// listing past communications, so there is nothing for a sweep to pull back in.
// This half just makes sure a lead the CRM knows about exists in the dialer, so the
// number that rings carries a name. ALOWARE_SYNC_CONTACTS=0 turns it off.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PER_RUN = 100;

// Close → CRM rows created per pass. The ~700-lead backfill drains over several
// runs rather than landing in the CRM all at once.
const IMPORT_PER_RUN = 100;

// Recent calls re-read each pass. At a 10-minute cadence this is a wide overlap on
// purpose: the dedupe makes re-reads free, and a window is safer than a watermark
// that could skip a call logged late.
const CALLS_PER_RUN = 200;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — never run unauthenticated
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Close → CRM runs first so anything it imports is picked up by the Aloware
  // push below in the same pass, rather than waiting another ten minutes.
  //
  // Gated on CLOSE_IMPORT, and it fails safe: only an explicit `1` writes. Unset
  // reports what an import *would* do without touching the CRM, which is what you
  // want to read before letting it create several hundred rows in the working
  // board. `off` skips the scan entirely once the backfill is done and you'd
  // rather not spend the Close reads.
  const mode = (process.env.CLOSE_IMPORT || '').trim().toLowerCase();
  const live = mode === '1' || mode === 'true' || mode === 'on';
  const imported =
    mode === 'off' || mode === '0'
      ? { skipped: 'CLOSE_IMPORT=off' }
      : await importCloseLeads({ limit: IMPORT_PER_RUN, dryRun: !live });

  // Aloware runs independently of Close: an unconfigured or broken Close account
  // must not stop new leads reaching the dialer the team actually uses.
  const aloware = await syncLeadsToAloware({ limit: PER_RUN });

  const res = await syncLeadsToClose({ limit: PER_RUN, includeStale: true });
  // A missing key or un-run migration isn't worth failing the cron over — report
  // it and stay quiet until it's configured.
  if (res.skipped || (res.error && res.pushed === 0)) {
    return NextResponse.json({ ok: true, skipped: res.error, aloware, imported });
  }

  // Pull dials back after pushing: a lead created earlier in this same run can
  // already have calls against it.
  const calls = await importCloseCalls({ limit: CALLS_PER_RUN });

  return NextResponse.json({ ...res, calls, aloware, imported });
}
