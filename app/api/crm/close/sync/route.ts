import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { closeSyncStatus, importCloseCalls, mirrorPipelinesToClose, syncLeadsToClose, CLOSE_BATCH_SIZE } from '@/lib/close-sync';

// Bulk Close sync for the whole CRM — the backfill of everything already in the
// CRM, and a manual catch-up for anything the per-lead hooks missed.
//
//   GET  → how much of the CRM is mirrored (drives the admin panel)
//   POST → push one bounded batch; body { limit?, includeStale? }
//   POST { pipelinesOnly: true } → just rebuild the pipelines/stages in Close,
//        touching no leads (needs none of the crm_leads columns, so it works
//        before the migration is run).
//   POST { callsOnly: true } → pull recent Close dials into the CRM timelines.
//
// Bounded per call so a request can't run past Vercel's limit: the admin panel
// calls POST in a loop until `pending` hits 0.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function requireAdmin() {
  const a = await getAuthUser();
  return a && a.role === 'admin' ? a : null;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await closeSyncStatus());
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({}));

  // Pull every recent dial from Close into the CRM timelines, on demand. The cron
  // does this automatically every 10 minutes; this is for "I want it now".
  if (b.callsOnly) {
    const res = await importCloseCalls({ limit: Number(b.limit) || 200 });
    return NextResponse.json(res, { status: res.skipped ? 503 : res.ok ? 200 : 502 });
  }

  if (b.pipelinesOnly) {
    const mirror = await mirrorPipelinesToClose();
    return NextResponse.json({
      ok: mirror.ok,
      pipelinesCreated: mirror.created,
      stagesAdded: mirror.addedStages,
      errors: mirror.errors,
      mirrored: [...mirror.pipelines.values()].map((p) => ({ name: p.name, stages: p.statuses.size, of: p.labels.size })),
    }, { status: mirror.ok ? 200 : 502 });
  }

  const limit = Number.isFinite(Number(b.limit)) ? Number(b.limit) : CLOSE_BATCH_SIZE;
  // Default on: a manual run should also refresh leads edited since their last
  // push, not just add the missing ones.
  const includeStale = b.includeStale !== false;

  const res = await syncLeadsToClose({ limit, includeStale });
  if (res.skipped) return NextResponse.json({ error: res.error }, { status: 503 });
  // A batch that pushed nothing and errored is a real failure; partial failures
  // come back 200 with the counts so the loop can keep going.
  if (!res.ok && res.pushed === 0 && res.error) return NextResponse.json(res, { status: 502 });
  return NextResponse.json(res);
}
