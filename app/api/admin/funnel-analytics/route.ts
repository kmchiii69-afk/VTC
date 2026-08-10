import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { classifyChannel, CHANNEL_ORDER, CHANNEL_COLORS } from '@/lib/channel';

export const dynamic = 'force-dynamic';

async function fetchCalendlyUpcoming() {
  const pat = process.env.CALENDLY_PAT || '';
  if (!pat) return [];
  try {
    // Calendly being slow/unresponsive must never hang the whole analytics
    // route — it's a nice-to-have "upcoming calls" widget, not core data.
    const meRes = await fetch('https://api.calendly.com/users/me', {
      headers: { Authorization: `Bearer ${pat}` },
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(8000),
    });
    if (!meRes.ok) return [];
    const me = await meRes.json();
    const userUri: string = me.resource?.uri ?? '';
    if (!userUri) return [];
    const now = new Date().toISOString();
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const res = await fetch(
      `https://api.calendly.com/scheduled_events?user=${encodeURIComponent(userUri)}&min_start_time=${now}&max_start_time=${future}&status=active&count=20`,
      { headers: { Authorization: `Bearer ${pat}` }, next: { revalidate: 120 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.collection ?? []).map((e: { name: string; start_time: string; status: string }) => ({
      name: e.name, start_time: e.start_time, status: e.status,
    }));
  } catch { return []; }
}

export async function GET(req: Request) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Database not configured — SUPABASE_URL and SUPABASE_SERVICE_KEY required' }, { status: 503 });
  }

  const url = new URL(req.url);
  const now = Date.now();

  /* Date range — from/to as Unix ms (client sends UTC timestamps regardless of TZ) */
  const fromParam = url.searchParams.get('from');
  const toParam   = url.searchParams.get('to');
  const rangeFrom = fromParam ? parseInt(fromParam, 10) : now - 30 * 86400000;
  const rangeTo   = toParam   ? parseInt(toParam,   10) : now;

  const d24h    = now - 86400000;
  const d30d    = rangeFrom;   // alias so existing code works unchanged
  const d30dISO = new Date(rangeFrom).toISOString();

  const safe = <T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<{ data: T | null; error: unknown }> =>
    Promise.resolve(p).catch(() => ({ data: null, error: 'query failed' }));

  /* Ad-gate segment tables — each is its own conversion table (see
   * supabase-ads-segments.sql) that uses `submitted_at` instead of
   * `created_at`; normalized to `created_at` below so they merge cleanly
   * into the same `apps` pipeline as vsl_applications. */
  const SEGMENT_TABLES = ['ads_under_100k_applications', 'ads_over_100k_ads_applications', 'ads_over_100k_noads_applications'];

  const [appsRes, leadsRes, usersRes, callsRes, upcoming, ...segmentResults] = await Promise.all([
    safe(db().from('vsl_applications').select('*').order('created_at', { ascending: false }).limit(500)),
    safe(db().from('funnel_leads').select('email,source,traffic_source,utm_source,utm_medium,created_at').order('created_at', { ascending: false }).limit(500)),
    safe(db().from('portal_users').select('email,name,created_at,role,active').order('created_at', { ascending: false })),
    safe(db().from('calls').select('id,lead_name,closer,outcome,revenue,cash_collected,call_date,source').gte('call_date', d30dISO).lte('call_date', new Date(rangeTo).toISOString()).order('call_date', { ascending: false }).limit(500)),
    fetchCalendlyUpcoming(),
    ...SEGMENT_TABLES.map(t => safe(db().from(t).select('*').order('submitted_at', { ascending: false }).limit(500))),
  ]);

  if (appsRes.error)  console.error('[analytics] vsl_applications error:', JSON.stringify(appsRes.error));
  if (leadsRes.error) console.error('[analytics] funnel_leads error:', JSON.stringify(leadsRes.error));
  if (usersRes.error) console.error('[analytics] portal_users error:', JSON.stringify(usersRes.error));
  if (callsRes.error) console.error('[analytics] calls error:', JSON.stringify(callsRes.error));
  segmentResults.forEach((r, i) => { if (r.error) console.error(`[analytics] ${SEGMENT_TABLES[i]} error:`, JSON.stringify(r.error)); });

  type AppRow = {
    id: string; first_name: string; last_name: string; email: string;
    qualified: boolean; investment_range: string; current_revenue: string;
    source: string; utm_source: string; utm_medium: string; utm_campaign: string;
    traffic_source: string; fbclid: string; gclid: string; ttclid: string;
    created_at: string;
  };

  const vslApps = (appsRes.data ?? []) as AppRow[];
  const segmentApps = segmentResults.flatMap(r =>
    ((r.data ?? []) as (AppRow & { submitted_at?: string })[]).map(row => ({ ...row, created_at: row.created_at || row.submitted_at || '' }))
  );
  const apps: AppRow[] = [...vslApps, ...segmentApps];

  const leads = (leadsRes.data ?? []) as {
    email: string; source: string; traffic_source: string;
    utm_source: string; utm_medium: string; created_at: string;
  }[];

  const clients = (usersRes.data ?? []) as {
    email: string; name: string; created_at: number; role: string; active: boolean;
  }[];

  const calls = (callsRes.data ?? []) as {
    id: string; lead_name: string; closer: string; outcome: string;
    revenue: number; cash_collected: number; call_date: string; source: string;
  }[];

  const apps30d = apps.filter(a => { const t = new Date(a.created_at).getTime(); return t >= rangeFrom && t <= rangeTo; });
  const apps24h = apps.filter(a => new Date(a.created_at).getTime() > d24h);
  const leads30d = leads.filter(l => { const t = new Date(l.created_at).getTime(); return t >= rangeFrom && t <= rangeTo; });

  const qual30d = apps30d.filter(a => a.qualified).length;
  const qual24h = apps24h.filter(a => a.qualified).length;

  /* ── Bottom-of-funnel call metrics ── */
  const showed30d   = calls.filter(c => c.outcome !== 'no_show' && c.outcome !== 'unknown').length;
  const noShow30d   = calls.filter(c => c.outcome === 'no_show').length;
  const closed30d   = calls.filter(c => c.outcome === 'closed').length;
  const noClose30d  = calls.filter(c => c.outcome === 'no_close').length;
  const dq30d       = calls.filter(c => c.outcome === 'dq').length;
  const revenue30d  = calls.filter(c => c.outcome === 'closed').reduce((s, c) => s + (c.revenue || 0), 0);
  const cash30d     = calls.filter(c => c.outcome === 'closed').reduce((s, c) => s + (c.cash_collected || 0), 0);
  const totalCalls30d = calls.length;
  const showRate    = totalCalls30d > 0 ? Math.round((showed30d / totalCalls30d) * 100) : 0;
  const closeRate   = showed30d > 0    ? Math.round((closed30d / showed30d) * 100) : 0;

  /* Recent calls for the call feed */
  const recentCalls = calls.slice(0, 12).map(c => ({
    lead_name: c.lead_name || 'Unknown',
    closer: c.closer || '—',
    outcome: c.outcome,
    revenue: c.revenue || 0,
    cash_collected: c.cash_collected || 0,
    call_date: c.call_date,
  }));

  /* UTM source HBars */
  const sourceMap: Record<string, { leads: number; qualified: number }> = {};
  for (const a of apps30d) {
    const src = a.utm_source || a.source || '(direct)';
    if (!sourceMap[src]) sourceMap[src] = { leads: 0, qualified: 0 };
    sourceMap[src].leads++;
    if (a.qualified) sourceMap[src].qualified++;
  }
  const sources = Object.entries(sourceMap)
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 8);

  /* Investment range */
  const investMap: Record<string, number> = {};
  for (const a of apps30d) {
    const k = a.investment_range || 'Unknown';
    investMap[k] = (investMap[k] ?? 0) + 1;
  }

  /* Recent apps */
  const recent = apps.slice(0, 10).map(a => ({
    name: `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email,
    email: a.email,
    qualified: a.qualified,
    investment: a.investment_range,
    source: a.utm_source || a.source || '(direct)',
    created_at: a.created_at,
  }));

  const activeClients = clients.filter(c => c.role === 'user' && c.active).length;
  const newClients30d = clients.filter(c => c.role === 'user' && c.created_at > d30d).length;

  /* ── Per-channel funnel strips — full pipeline ── */
  type Bucket = {
    optins: number; applications: number; qualified: number;
    booked: number; showed: number; closed: number;
  };
  const channelMap: Record<string, Bucket> = {};
  const ensure = (ch: string) => {
    if (!channelMap[ch]) channelMap[ch] = { optins: 0, applications: 0, qualified: 0, booked: 0, showed: 0, closed: 0 };
  };

  for (const l of leads30d) {
    const ch = classifyChannel(l.traffic_source, l.source);
    ensure(ch);
    channelMap[ch].optins++;
  }
  for (const a of apps30d) {
    const ch = classifyChannel(a.traffic_source, a.source);
    ensure(ch);
    channelMap[ch].applications++;
    if (a.qualified) channelMap[ch].qualified++;
  }
  for (const c of calls) {
    const ch = classifyChannel(c.source, c.source);
    ensure(ch);
    channelMap[ch].booked++;
    if (c.outcome !== 'no_show' && c.outcome !== 'unknown') channelMap[ch].showed++;
    if (c.outcome === 'closed') channelMap[ch].closed++;
  }

  const channelFunnels = CHANNEL_ORDER.map(ch => ({
    channel: ch,
    color: CHANNEL_COLORS[ch],
    optins: channelMap[ch]?.optins ?? 0,
    applications: channelMap[ch]?.applications ?? 0,
    qualified: channelMap[ch]?.qualified ?? 0,
    booked: channelMap[ch]?.booked ?? 0,
    showed: channelMap[ch]?.showed ?? 0,
    closed: channelMap[ch]?.closed ?? 0,
  }));

  /* ── Stage breakdowns — per-source counts for each funnel stage ── */
  type StageBucket = Record<string, number>;
  const stageBreakdowns: Record<string, StageBucket> = {
    optins: {}, applications: {}, qualified: {}, booked: {}, showed: {}, closed: {},
  };

  for (const l of leads30d) {
    const ch = classifyChannel(l.traffic_source, l.source);
    stageBreakdowns.optins[ch] = (stageBreakdowns.optins[ch] || 0) + 1;
  }
  for (const a of apps30d) {
    const ch = classifyChannel(a.traffic_source, a.source);
    stageBreakdowns.applications[ch] = (stageBreakdowns.applications[ch] || 0) + 1;
    if (a.qualified) {
      stageBreakdowns.qualified[ch] = (stageBreakdowns.qualified[ch] || 0) + 1;
    }
  }
  for (const c of calls) {
    const ch = classifyChannel(c.source, c.source);
    stageBreakdowns.booked[ch] = (stageBreakdowns.booked[ch] || 0) + 1;
    if (c.outcome !== 'no_show' && c.outcome !== 'unknown') {
      stageBreakdowns.showed[ch] = (stageBreakdowns.showed[ch] || 0) + 1;
    }
    if (c.outcome === 'closed') {
      stageBreakdowns.closed[ch] = (stageBreakdowns.closed[ch] || 0) + 1;
    }
  }

  /* Convert to sorted arrays for the frontend */
  const stageBreakdownArrays: Record<string, { channel: string; color: string; count: number }[]> = {};
  for (const stage of Object.keys(stageBreakdowns)) {
    stageBreakdownArrays[stage] = CHANNEL_ORDER
      .map(ch => ({ channel: ch, color: CHANNEL_COLORS[ch], count: stageBreakdowns[stage][ch] ?? 0 }));
  }

  return NextResponse.json({
    report24h: { leads: apps24h.length, qualified: qual24h, applications: apps24h.length },
    funnel30d: {
      leads: apps30d.length,
      qualified: qual30d,
      booked: upcoming.length + totalCalls30d,
      optins: leads30d.length,
    },
    pipeline: {
      totalCalls: totalCalls30d,
      showed: showed30d,
      noShow: noShow30d,
      closed: closed30d,
      noClose: noClose30d,
      dq: dq30d,
      showRate,
      closeRate,
      revenue: revenue30d,
      cash: cash30d,
      upcomingCount: upcoming.length,
    },
    totals: {
      allLeads: apps.length,
      allQualified: apps.filter(a => a.qualified).length,
      activeClients,
      newClients30d,
      allOptins: leads.length,
    },
    sources,
    investBreakdown: Object.entries(investMap).map(([range, count]) => ({ range, count })),
    recent,
    recentCalls,
    upcoming,
    channelFunnels,
    stageBreakdowns: stageBreakdownArrays,
  });
}
