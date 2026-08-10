import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/kv';
import { classifyChannel, CHANNEL_ORDER, CHANNEL_COLORS } from '@/lib/channel';

export const dynamic = 'force-dynamic';

/* Every real funnel STAGE, in click-through order — not just one row per
 * funnel. A lead's actual path is Opt-in/Application page -> Booking
 * Calendar -> Thank You, and each is now tracked as its own event
 * (lib/funnel-tracker.ts fires `<funnel>_calendar_viewed` when the booking
 * step loads and `<funnel>_booking_completed` once BookingCalendar's
 * onBooked/Calendly's event_scheduled message fires), so each stage gets its
 * own row here with its own view count — same physical page/pagePath as its
 * siblings (there's no separate URL, the stage is a client-side state), but
 * a distinct `viewEvent` to count arrivals by.
 *
 * Only the entry stage of each funnel carries optins/qualified/booked/
 * showed/closed — those are lead-level facts, not page-view facts, so they'd
 * be misleading duplicated across the Booking/Thank You rows. */
type PageDef = {
  id: string;
  groupLabel: string;         // funnel-level display name (the group header)
  stageLabel: string;         // this stage's own name within the group
  pagePath: string;
  parentFunnel: string;       // the `funnel` column value in funnel_events for this stage
  viewEvent: string | null;   // specific event marking arrival; null = "any event for this funnel" (entry stage)
  isEntryStage: boolean;
  conversionTable: string | null;
  tsField: string;
  sourceFilterColumn: 'source' | 'funnel' | null; // set when the conversion table is shared across funnels
  sourceFilterValue: string | null;
  qualifiedField: string | null;
  callsSource: string | null; // value to match against calls.source, if attributable
};

function segmentStages(segment: string, groupLabel: string, pagePath: string, conversionTable: string): PageDef[] {
  return [
    { id: segment, groupLabel, stageLabel: 'Application', pagePath, parentFunnel: segment, viewEvent: null, isEntryStage: true,
      conversionTable, tsField: 'submitted_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: 'qualified', callsSource: null },
    { id: `${segment}-booking`, groupLabel, stageLabel: 'Booking Calendar', pagePath, parentFunnel: segment, viewEvent: `${segment}_calendar_viewed`, isEntryStage: false,
      conversionTable: null, tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: null, callsSource: null },
    // Post-booking "confirm your call" page — its own route per funnel, tracked
    // by the `<funnel>_call_confirm_view` event ConfirmCall fires on load
    // (replaced the old thank-you page).
    { id: `${segment}-confirm`, groupLabel, stageLabel: 'Post-Booking', pagePath: `${pagePath}/confirm`, parentFunnel: segment, viewEvent: `${segment}_call_confirm_view`, isEntryStage: false,
      conversionTable: null, tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: null, callsSource: null },
  ];
}

const FUNNEL_PAGES: PageDef[] = [
  { id: 'ig', groupLabel: 'Instagram DM', stageLabel: 'Opt-in', pagePath: '/funnel/ig', parentFunnel: 'ig', viewEvent: null, isEntryStage: true,
    conversionTable: 'funnel_leads', tsField: 'created_at', sourceFilterColumn: 'source', sourceFilterValue: 'ig', qualifiedField: null, callsSource: 'ig' },
  { id: 'ig-booking', groupLabel: 'Instagram DM', stageLabel: 'Booking Calendar', pagePath: '/funnel/ig', parentFunnel: 'ig', viewEvent: 'ig_calendar_viewed', isEntryStage: false,
    conversionTable: null, tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: null, callsSource: null },
  { id: 'ig-thankyou', groupLabel: 'Instagram DM', stageLabel: 'Thank You', pagePath: '/funnel/ig/thank-you', parentFunnel: 'ig', viewEvent: 'ig_booking_completed', isEntryStage: false,
    conversionTable: null, tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: null, callsSource: null },

  { id: 'ads-gate', groupLabel: 'Ads Entry Gate', stageLabel: 'Gate', pagePath: '/funnel/ads', parentFunnel: 'ads-gate', viewEvent: null, isEntryStage: true,
    conversionTable: null, tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: null, callsSource: null },

  ...segmentStages('under-100k', 'Ads · Under $100k', '/funnel/ads/under-100k', 'ads_under_100k_applications'),
  ...segmentStages('over-100k-ads', 'Ads · $100k+ (Running Ads)', '/funnel/ads/over-100k-ads', 'ads_over_100k_ads_applications'),
  ...segmentStages('over-100k-no-ads', 'Ads · $100k+ (No Ads)', '/funnel/ads/over-100k-no-ads', 'ads_over_100k_noads_applications'),

  /* Opt-in entry gates that feed the VSL funnel — each stores to the shared
   * freebie_optins table tagged with its `funnel`, so filter on that column. */
  { id: 'clipping', groupLabel: 'VSL · Clipping Gate', stageLabel: 'Opt-in', pagePath: '/funnel/clipping', parentFunnel: 'clipping', viewEvent: null, isEntryStage: true,
    conversionTable: 'freebie_optins', tsField: 'submitted_at', sourceFilterColumn: 'funnel', sourceFilterValue: 'clipping', qualifiedField: null, callsSource: null },
  { id: 'buyer-mirror', groupLabel: 'VSL · Buyer-Mirror Gate', stageLabel: 'Opt-in', pagePath: '/funnel/buyer-mirror', parentFunnel: 'buyer-mirror', viewEvent: null, isEntryStage: true,
    conversionTable: 'freebie_optins', tsField: 'submitted_at', sourceFilterColumn: 'funnel', sourceFilterValue: 'buyer-mirror', qualifiedField: null, callsSource: null },

  { id: 'vsl', groupLabel: 'VSL', stageLabel: 'Application', pagePath: '/funnel/vsl', parentFunnel: 'vsl', viewEvent: null, isEntryStage: true,
    conversionTable: 'vsl_applications', tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: 'qualified', callsSource: 'vsl' },
  { id: 'vsl-booking', groupLabel: 'VSL', stageLabel: 'Booking Calendar', pagePath: '/funnel/vsl', parentFunnel: 'vsl', viewEvent: 'vsl_calendar_viewed', isEntryStage: false,
    conversionTable: null, tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: null, callsSource: null },
  { id: 'vsl-confirm', groupLabel: 'VSL', stageLabel: 'Post-Booking', pagePath: '/funnel/vsl/confirm', parentFunnel: 'vsl', viewEvent: 'vsl_call_confirm_view', isEntryStage: false,
    conversionTable: null, tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: null, callsSource: null },

  /* Media Team webinar script doc (/funnel/webinar). A single-stage page with
   * no application/booking/calls flow, so it only carries view counts (+ the
   * channel/trend breakdown) — same shape as the ads-gate entry row. The page
   * fires a `webinar_view` event on load; with viewEvent:null the entry stage
   * counts any event on the `webinar` funnel as a view. */
  { id: 'webinar', groupLabel: 'Media Team Webinar', stageLabel: 'Preview Page', pagePath: '/funnel/webinar', parentFunnel: 'webinar', viewEvent: 'webinar_view', isEntryStage: true,
    conversionTable: null, tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: null, callsSource: null },
  { id: 'webinar-register', groupLabel: 'Media Team Webinar', stageLabel: 'Registration Page', pagePath: '/funnel/webinar/register', parentFunnel: 'webinar', viewEvent: 'webinar_register_view', isEntryStage: false,
    conversionTable: null, tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: null, callsSource: null },
  { id: 'webinar-confirm', groupLabel: 'Media Team Webinar', stageLabel: 'Confirmation', pagePath: '/funnel/webinar/confirm', parentFunnel: 'webinar', viewEvent: 'webinar_confirm_view', isEntryStage: false,
    conversionTable: null, tsField: 'created_at', sourceFilterColumn: null, sourceFilterValue: null, qualifiedField: null, callsSource: null },
];

type ConversionRow = {
  traffic_source?: string | null; utm_source?: string | null; source?: string | null;
  funnel?: string | null;
  qualified?: boolean | null; created_at?: string; submitted_at?: string;
};
type EventRow = { funnel: string; event: string; session_id: string; created_at: string; utm_source: string | null; referrer: string | null };
type CallRow = { source: string; outcome: string; revenue: number | null };

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
  const fromISO = new Date(rangeFrom).toISOString();
  const toISO = new Date(rangeTo).toISOString();

  const safe = async <T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await Promise.resolve(p);
      if (error) { console.error('[page-funnel-stats] query error:', JSON.stringify(error)); return []; }
      return data ?? [];
    } catch (err) { console.error('[page-funnel-stats] query threw:', err); return []; }
  };

  const events = await safe<EventRow>(
    db().from('funnel_events').select('funnel,event,session_id,created_at,utm_source,referrer')
      .gte('created_at', fromISO).lte('created_at', toISO).limit(20000)
  );
  const calls = await safe<CallRow>(
    db().from('calls').select('source,outcome,revenue')
      .gte('call_date', fromISO).lte('call_date', toISO).limit(2000)
  );

  const conversionCache = new Map<string, ConversionRow[]>();
  async function getConversions(table: string): Promise<ConversionRow[]> {
    if (conversionCache.has(table)) return conversionCache.get(table)!;
    // Tables differ in schema (e.g. freebie_optins has `funnel`/`submitted_at`
    // but no `source`/`qualified`/`created_at`), so select * rather than naming
    // columns that may not exist on every table (a missing column errors the
    // whole query). We filter both possible timestamp fields client-side.
    const rows = await safe<ConversionRow>(
      db().from(table).select('*').limit(5000)
    );
    const filtered = rows.filter(r => {
      const ts = r.created_at || r.submitted_at;
      if (!ts) return false;
      const t = new Date(ts).getTime();
      return t >= rangeFrom && t <= rangeTo;
    });
    conversionCache.set(table, filtered);
    return filtered;
  }

  const pages = await Promise.all(FUNNEL_PAGES.map(async (def) => {
    const funnelEvents = events.filter(e => e.funnel === def.parentFunnel);
    // Entry stage = arrived at all (any event for this funnel). A later
    // stage = specifically fired its own arrival event (calendar/thank-you).
    const stageEvents = def.viewEvent ? funnelEvents.filter(e => e.event === def.viewEvent) : funnelEvents;
    const views = stageEvents.length;
    const viewsUnique = new Set(stageEvents.map(e => e.session_id)).size;

    let conversions: ConversionRow[] = [];
    if (def.isEntryStage && def.conversionTable) {
      conversions = await getConversions(def.conversionTable);
      if (def.sourceFilterColumn && def.sourceFilterValue) {
        conversions = conversions.filter(c => c[def.sourceFilterColumn!] === def.sourceFilterValue);
      }
    }
    const optins = conversions.length;
    const optinRate = viewsUnique > 0 ? Math.round((optins / viewsUnique) * 1000) / 10 : 0;
    const qualified = def.isEntryStage && def.qualifiedField ? conversions.filter(c => c.qualified === true).length : null;

    let booked: number | null = null, showed: number | null = null, closed: number | null = null, revenue: number | null = null;
    if (def.isEntryStage && def.callsSource) {
      const pageCalls = calls.filter(c => c.source === def.callsSource);
      booked = pageCalls.length;
      showed = pageCalls.filter(c => c.outcome !== 'no_show' && c.outcome !== 'unknown').length;
      closed = pageCalls.filter(c => c.outcome === 'closed').length;
      revenue = pageCalls.filter(c => c.outcome === 'closed').reduce((s, c) => s + (c.revenue || 0), 0);
    }

    /* Channel breakdown — views classified by referrer/utm_source (funnel_events),
     * optins classified by traffic_source/utm_source (conversion table, entry stage only). */
    const channelMap: Record<string, { views: number; optins: number; qualified: number }> = {};
    const ensure = (ch: string) => { if (!channelMap[ch]) channelMap[ch] = { views: 0, optins: 0, qualified: 0 }; };
    for (const e of stageEvents) {
      const ch = e.utm_source ? classifyChannel(e.utm_source) : (!e.referrer || e.referrer === 'direct' ? 'Direct' : 'Referral');
      ensure(ch); channelMap[ch].views++;
    }
    for (const c of conversions) {
      const ch = classifyChannel(c.traffic_source, c.source || c.utm_source);
      ensure(ch); channelMap[ch].optins++;
      if (c.qualified === true) channelMap[ch].qualified++;
    }
    /* Always list every known channel (zero-filled), not just the ones with
     * data — so the breakdown reads as a complete picture, not a partial one. */
    const channels = CHANNEL_ORDER.map(ch => ({
      channel: ch, color: CHANNEL_COLORS[ch],
      views: channelMap[ch]?.views ?? 0, optins: channelMap[ch]?.optins ?? 0,
      qualified: def.isEntryStage && def.qualifiedField ? (channelMap[ch]?.qualified ?? 0) : null,
    }));

    /* Daily view trend, last 14 days */
    const dayMap: Record<string, number> = {};
    for (const e of stageEvents) {
      const day = e.created_at.slice(0, 10);
      dayMap[day] = (dayMap[day] || 0) + 1;
    }
    const trend = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([day, count]) => ({ day, count }));

    return {
      id: def.id, groupId: def.parentFunnel, groupLabel: def.groupLabel, stageLabel: def.stageLabel,
      pagePath: def.pagePath,
      views, viewsUnique, optins, optinRate, qualified,
      booked, showed, closed, revenue,
      channels, trend,
    };
  }));

  /* Daily total views across every page, for the range-wide graph at the
   * bottom of the Funnels tab (per-page `trend` above is capped to 14 days
   * and only covers one page at a time). Counted from entry-stage arrivals
   * only, so a single session isn't triple-counted across its 3 stages. */
  const entryFunnels = new Set(FUNNEL_PAGES.filter(d => d.isEntryStage).map(d => d.parentFunnel));
  const dayTotals: Record<string, number> = {};
  const dayByPage: Record<string, Record<string, number>> = {};
  for (const e of events) {
    if (!entryFunnels.has(e.funnel)) continue;
    const day = e.created_at.slice(0, 10);
    dayTotals[day] = (dayTotals[day] || 0) + 1;
    if (!dayByPage[day]) dayByPage[day] = {};
    dayByPage[day][e.funnel] = (dayByPage[day][e.funnel] || 0) + 1;
  }
  const dailyTotals = Object.entries(dayTotals)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, total]) => ({ day, total, byPage: dayByPage[day] }));

  return NextResponse.json({ configured: true, from: rangeFrom, to: rangeTo, pages, dailyTotals });
}
