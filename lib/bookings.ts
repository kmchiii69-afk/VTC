/* Booking reconciliation: match Calendly bookings to funnel applications and
 * push booked leads into the right CRM pipeline.
 *
 *   - markApplicationBooked  → sets booked_at/scheduled_at on the matching
 *     application row (searched across all funnel tables by email).
 *   - recordBookingToCrm     → upserts a CRM lead into "VSL Pipeline" (vsl) or
 *     "Ads Pipeline" (ads segments, tagged by segment), stage "booked".
 *   - syncBookingsFromCalendly → pulls active Calendly events + invitees via the
 *     CALENDLY_PAT and runs the two above for each. Used by the manual sync
 *     endpoint; the Calendly webhook calls the first two in real time.
 */
import { db } from '@/lib/kv';
import { queueCloseSync } from '@/lib/close-sync';
import { queueAlowareSync } from '@/lib/aloware-sync';

const CAL_BASE = 'https://api.calendly.com';

// Application table → funnel key. Order matters only for first-match wins.
const APP_TABLES: { table: string; funnel: string }[] = [
  { table: 'vsl_applications',                 funnel: 'vsl' },
  { table: 'ads_under_100k_applications',      funnel: 'under-100k' },
  { table: 'ads_over_100k_ads_applications',   funnel: 'over-100k-ads' },
  { table: 'ads_over_100k_noads_applications', funnel: 'over-100k-no-ads' },
];

export interface AppRow {
  email: string;
  first_name?: string | null; last_name?: string | null; phone?: string | null;
  instagram?: string | null; current_revenue?: string | null; target_revenue?: string | null;
  investment_range?: string | null; commitment?: string | null; business_description?: string | null;
  blocker?: string | null; qualified?: boolean | null;
}

const pipelineCache = new Map<string, string | null>();
async function pipelineIdByName(name: string): Promise<string | null> {
  if (pipelineCache.has(name)) return pipelineCache.get(name)!;
  try {
    const { data } = await db().from('crm_pipelines').select('id').eq('name', name).limit(1).maybeSingle();
    const id = data?.id ?? null;
    if (id) pipelineCache.set(name, id);
    return id;
  } catch { return null; }
}

/* Find the application for an email across every funnel table; stamp booked. */
export async function markApplicationBooked(email: string, scheduledAt: string | null): Promise<{ funnel: string; app: AppRow } | null> {
  const e = email.trim();
  if (!e) return null;
  for (const { table, funnel } of APP_TABLES) {
    const { data } = await db().from(table).select('*').ilike('email', e).limit(1).maybeSingle();
    if (data) {
      await db().from(table).update({
        booked_at: new Date().toISOString(),
        scheduled_at: scheduledAt,
      }).eq('email', (data as AppRow).email);
      return { funnel, app: data as AppRow };
    }
  }
  return null;
}

/* Clear the booked flag across funnel tables (Calendly cancellation). */
export async function clearApplicationBooked(email: string): Promise<void> {
  const e = email.trim();
  if (!e) return;
  for (const { table } of APP_TABLES) {
    await db().from(table).update({ booked_at: null, scheduled_at: null }).ilike('email', e);
  }
}

/* Upsert a booked lead into the VSL/Ads pipeline, stage "booked". */
export async function recordBookingToCrm(funnel: string, app: AppRow, scheduledAt: string | null): Promise<void> {
  const isVsl = funnel === 'vsl';
  const pipelineId = await pipelineIdByName(isVsl ? 'VSL Pipeline' : 'Ads Pipeline');
  const tag = isVsl ? 'vsl' : funnel; // ads segments differentiate by tag
  const igHandle = app.instagram ? String(app.instagram).replace(/^@/, '').trim() || null : null;
  const name = [app.first_name, app.last_name].filter(Boolean).join(' ').trim() || null;
  const notes = [
    scheduledAt && `Call scheduled: ${scheduledAt}`,
    app.current_revenue && `Revenue: ${app.current_revenue}`,
    app.target_revenue && `Target: ${app.target_revenue}`,
    app.investment_range && `Investment: ${app.investment_range}`,
    app.commitment && `Commitment: ${app.commitment}`,
    app.business_description && `Business: ${app.business_description}`,
    app.blocker && `Blocker: ${app.blocker}`,
    `Funnel: ${funnel}`,
  ].filter(Boolean).join(' · ') || null;

  const cols = 'id, name, email, whatsapp, revenue, status, tags';
  let match: { id: string; name: string | null; email: string | null; whatsapp: string | null; revenue: string | null; status: string | null; tags: string[] | null } | null = null;
  if (igHandle) {
    const { data } = await db().from('crm_leads').select(cols).eq('ig_handle', igHandle).limit(1).maybeSingle();
    match = data ?? null;
  }
  if (!match && app.email) {
    const { data } = await db().from('crm_leads').select(cols).ilike('email', app.email).limit(1).maybeSingle();
    match = data ?? null;
  }

  if (match) {
    // Booking is a forward move → set the booking pipeline + stage, add the tag,
    // fill any blank contact fields (never blank out real data).
    const patch: Record<string, unknown> = {
      stage: 'booked',
      pipeline_id: pipelineId,
      tags: Array.from(new Set([...(match.tags || []), tag])),
      next_followup_at: scheduledAt || undefined,
      updated_at: new Date().toISOString(),
    };
    if (!match.name && name) patch.name = name;
    if (!match.email && app.email) patch.email = app.email;
    if (!match.whatsapp && app.phone) patch.whatsapp = app.phone;
    if (!match.revenue && app.current_revenue) patch.revenue = app.current_revenue;
    if (!match.status) patch.status = app.qualified ? 'Qualified' : 'DQ';
    await db().from('crm_leads').update(patch).eq('id', match.id);
    // A booked call is the one Close lead the team will definitely dial — mirror
    // it (and its new stage) immediately rather than waiting for the sweep.
    queueCloseSync(match.id, `booking:${funnel}`);
    queueAlowareSync(match.id, `booking:${funnel}`);
  } else {
    const { data: created } = await db().from('crm_leads').insert({
      ig_handle: igHandle,
      name,
      email: app.email || null,
      whatsapp: app.phone || null,
      revenue: app.current_revenue || null,
      status: app.qualified ? 'Qualified' : 'DQ',
      source: 'inbound',
      stage: 'booked',
      pipeline_id: pipelineId,
      tags: [tag],
      notes,
      next_followup_at: scheduledAt || null,
      updated_at: new Date().toISOString(),
    }).select('id').maybeSingle();
    queueCloseSync(created?.id, `booking:${funnel}`);
    queueAlowareSync(created?.id, `booking:${funnel}`);
  }
}

/* ── Calendly API pull ────────────────────────────────────────────────────── */

function calHeaders() {
  return { Authorization: `Bearer ${process.env.CALENDLY_PAT}`, 'Content-Type': 'application/json' };
}

interface Invitee { email?: string; name?: string }
interface CalEvent { uri: string; start_time: string }

async function currentOrg(): Promise<string | null> {
  try {
    const r = await fetch(`${CAL_BASE}/users/me`, { headers: calHeaders() });
    const d = await r.json();
    return d?.resource?.current_organization ?? null;
  } catch { return null; }
}

/* Pull active scheduled events in [minStart, maxStart] and mark every invitee's
 * application booked + push to CRM. Returns reconciliation counts. */
export async function syncBookingsFromCalendly(minStartISO: string, maxStartISO: string): Promise<{ events: number; invitees: number; matched: number; crm: number; error?: string }> {
  if (!process.env.CALENDLY_PAT) return { events: 0, invitees: 0, matched: 0, crm: 0, error: 'CALENDLY_PAT not set' };
  const org = await currentOrg();
  if (!org) return { events: 0, invitees: 0, matched: 0, crm: 0, error: 'Could not resolve Calendly organization' };

  let events = 0, invitees = 0, matched = 0, crm = 0;
  let url: string | null = `${CAL_BASE}/scheduled_events?organization=${encodeURIComponent(org)}&status=active&count=100&min_start_time=${encodeURIComponent(minStartISO)}&max_start_time=${encodeURIComponent(maxStartISO)}`;
  let pages = 0;

  while (url && pages < 20) {
    pages++;
    let payload: { collection?: CalEvent[]; pagination?: { next_page?: string | null } };
    try {
      const r = await fetch(url, { headers: calHeaders() });
      payload = await r.json();
    } catch { break; }
    const collection = payload.collection ?? [];
    for (const ev of collection) {
      events++;
      try {
        const ir = await fetch(`${ev.uri}/invitees?count=100`, { headers: calHeaders() });
        const idata = await ir.json();
        const list = (idata?.collection ?? []) as Invitee[];
        for (const inv of list) {
          invitees++;
          if (!inv.email) continue;
          const res = await markApplicationBooked(inv.email, ev.start_time);
          if (res) { matched++; try { await recordBookingToCrm(res.funnel, res.app, ev.start_time); crm++; } catch { /* non-fatal */ } }
        }
      } catch { /* skip this event's invitees */ }
    }
    url = payload.pagination?.next_page ?? null;
  }

  return { events, invitees, matched, crm };
}
