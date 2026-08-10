import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';

export const dynamic = 'force-dynamic';

type EventRow = {
  event: string; funnel: string; session_id: string; created_at: string; device: string | null;
  attr_first_source: string | null; attr_last_source: string | null; attr_touch_count: number | null;
  velocity_prev_stage: string | null; velocity_ms_from_prev: number | null;
  journey_funnels: string | null;
  metadata: Record<string, unknown> | null;
};

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const url = new URL(req.url);
  const now = Date.now();
  const rangeFrom = url.searchParams.get('from') ? parseInt(url.searchParams.get('from')!, 10) : now - 30 * 86400000;
  const rangeTo = url.searchParams.get('to') ? parseInt(url.searchParams.get('to')!, 10) : now;

  const { data, error } = await db()
    .from('funnel_events')
    .select('event,funnel,session_id,created_at,device,attr_first_source,attr_last_source,attr_touch_count,velocity_prev_stage,velocity_ms_from_prev,journey_funnels,metadata')
    .gte('created_at', new Date(rangeFrom).toISOString())
    .lte('created_at', new Date(rangeTo).toISOString())
    .limit(10000);

  if (error) {
    console.error('[funnel-events-analytics] query error:', JSON.stringify(error));
    // Table probably doesn't exist yet (migration not run) — return empty shape, not an error page.
    return NextResponse.json({
      configured: false,
      attribution: { first: [], last: [], touchBuckets: [] },
      velocity: [],
      dailyCohorts: [],
      journeys: [],
      video: { plays: 0, completionRate: 0, avgWatchTimeFmt: '—', milestones: [], heatmap: [] },
    });
  }

  const rows = (data ?? []) as EventRow[];

  /* ── Attribution — distinct sessions per first/last-touch source ── */
  const bySession = new Map<string, EventRow>();
  for (const r of rows) {
    const existing = bySession.get(r.session_id);
    if (!existing || new Date(r.created_at) > new Date(existing.created_at)) bySession.set(r.session_id, r);
  }
  const sessions = [...bySession.values()];

  function bucketBy(pick: (r: EventRow) => string | null) {
    const map: Record<string, number> = {};
    for (const s of sessions) {
      const key = pick(s) || 'direct';
      map[key] = (map[key] || 0) + 1;
    }
    return Object.entries(map).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }
  const attrFirst = bucketBy(s => s.attr_first_source);
  const attrLast = bucketBy(s => s.attr_last_source);

  const touchBucketMap: Record<string, number> = { '1 touch': 0, '2 touches': 0, '3-5 touches': 0, '6+ touches': 0 };
  for (const s of sessions) {
    const n = s.attr_touch_count || 0;
    if (n <= 1) touchBucketMap['1 touch']++;
    else if (n === 2) touchBucketMap['2 touches']++;
    else if (n <= 5) touchBucketMap['3-5 touches']++;
    else touchBucketMap['6+ touches']++;
  }
  const touchBuckets = Object.entries(touchBucketMap).map(([bucket, count]) => ({ bucket, count }));

  /* ── Velocity — median time from previous stage, per (funnel, stage transition) ── */
  const velocityMap = new Map<string, { funnel: string; from: string; to: string; samples: number[] }>();
  for (const r of rows) {
    if (!r.velocity_prev_stage || r.velocity_ms_from_prev == null) continue;
    const key = `${r.funnel}::${r.velocity_prev_stage}::${r.event}`;
    if (!velocityMap.has(key)) velocityMap.set(key, { funnel: r.funnel, from: r.velocity_prev_stage, to: r.event, samples: [] });
    velocityMap.get(key)!.samples.push(r.velocity_ms_from_prev);
  }
  const velocity = [...velocityMap.values()]
    .map(v => ({ funnel: v.funnel, from: v.from, to: v.to, medianMs: median(v.samples), medianFmt: fmtMs(median(v.samples)), n: v.samples.length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 20);

  /* ── Daily cohorts — distinct sessions per day per funnel ── */
  const dayFunnelSessions = new Map<string, Set<string>>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    const key = `${day}::${r.funnel}`;
    if (!dayFunnelSessions.has(key)) dayFunnelSessions.set(key, new Set());
    dayFunnelSessions.get(key)!.add(r.session_id);
  }
  const dailyCohorts = [...dayFunnelSessions.entries()]
    .map(([key, set]) => { const [day, funnel] = key.split('::'); return { day, funnel, sessions: set.size }; })
    .sort((a, b) => a.day.localeCompare(b.day));

  /* ── Cross-funnel journeys — most common multi-funnel paths ── */
  const journeyMap: Record<string, number> = {};
  for (const s of sessions) {
    if (s.journey_funnels && s.journey_funnels.includes(',')) {
      journeyMap[s.journey_funnels] = (journeyMap[s.journey_funnels] || 0) + 1;
    }
  }
  const journeys = Object.entries(journeyMap).map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  /* ── Video — plays, milestone funnel, completion + avg watch time ── */
  const playSessions = new Set(rows.filter(r => r.event === 'video_play').map(r => r.session_id));
  const milestoneSessions: Record<number, Set<string>> = { 25: new Set(), 50: new Set(), 75: new Set(), 100: new Set() };
  for (const r of rows) {
    if (r.event !== 'video_milestone') continue;
    const m = Number(r.metadata?.milestone);
    if (milestoneSessions[m]) milestoneSessions[m].add(r.session_id);
  }
  const sessionEnds = rows.filter(r => r.event === 'video_session_end');
  const watchTimes = sessionEnds.map(r => Number(r.metadata?.totalWatchTime) || 0).filter(n => n > 0);
  const avgWatchTimeSec = watchTimes.length > 0 ? Math.round(watchTimes.reduce((a, b) => a + b, 0) / watchTimes.length) : 0;
  const completions = sessionEnds.filter(r => Array.isArray(r.metadata?.milestonesReached) && (r.metadata!.milestonesReached as number[]).includes(100)).length;
  const completionRate = sessionEnds.length > 0 ? Math.round((completions / sessionEnds.length) * 100) : 0;

  /* Watch-through heatmap — bucket each session's viewed segments into N
   * equal slices of its own video duration, count how many sessions covered
   * each slice, normalize to % of sessions that reported segment data. */
  const HEATMAP_BUCKETS = 20;
  const heatmapCounts = new Array(HEATMAP_BUCKETS).fill(0);
  let heatmapSamples = 0;
  for (const r of sessionEnds) {
    const duration = Number(r.metadata?.videoDuration) || 0;
    const segments = Array.isArray(r.metadata?.viewedSegments) ? (r.metadata!.viewedSegments as { s: number; e: number }[]) : [];
    if (duration <= 0 || segments.length === 0) continue;
    heatmapSamples++;
    const bucketsHit = new Set<number>();
    for (const seg of segments) {
      const startBucket = Math.max(0, Math.floor((seg.s / duration) * HEATMAP_BUCKETS));
      const endBucket = Math.min(HEATMAP_BUCKETS - 1, Math.floor((seg.e / duration) * HEATMAP_BUCKETS));
      for (let b = startBucket; b <= endBucket; b++) bucketsHit.add(b);
    }
    for (const b of bucketsHit) heatmapCounts[b]++;
  }
  const heatmap = heatmapCounts.map((count, i) => ({
    bucketPct: Math.round((i / HEATMAP_BUCKETS) * 100),
    count,
    pct: heatmapSamples > 0 ? Math.round((count / heatmapSamples) * 100) : 0,
  }));

  const video = {
    plays: playSessions.size,
    completionRate,
    avgWatchTimeFmt: avgWatchTimeSec > 0 ? fmtMs(avgWatchTimeSec * 1000) : '—',
    milestones: [25, 50, 75, 100].map(m => ({
      milestone: m,
      sessions: milestoneSessions[m].size,
      pct: playSessions.size > 0 ? Math.round((milestoneSessions[m].size / playSessions.size) * 100) : 0,
    })),
    heatmap,
  };

  return NextResponse.json({
    configured: true,
    totalEvents: rows.length,
    totalSessions: sessions.length,
    attribution: { first: attrFirst, last: attrLast, touchBuckets },
    velocity,
    dailyCohorts,
    journeys,
    video,
  });
}
