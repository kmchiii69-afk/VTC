import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/kv';
import { getClientsHealth, getClientJourney } from '@/lib/csm';
import { getCheckInById } from '@/lib/checkins';
import { contractTierLabel } from '@/lib/client-tags';

// Read-only tools the AI bots use to query the dashboard's data. They are split
// into groups so each bot's data access is enforced by which tools it gets:
//   CLIENT_TOOLS  — per-client data only (CSM bot + Advisor)
//   COMPANY_TOOLS — sales/financial/company data, incl. full sales transcripts (Advisor only)
//   SALES_TOOLS   — sales calls + transcripts + ICP rubric only (Sales AI bot only)
// The CSM bot is never handed COMPANY_TOOLS, so it structurally cannot read
// sales/revenue/referral data; the Sales bot is never handed CLIENT_TOOLS, so it
// cannot read client/roadmap/onboarding data — not a matter of prompt compliance.

export interface AgentTool {
  definition: Anthropic.Tool;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

const norm = (e: string) => e.toLowerCase().trim();

/* ─── CLIENT tools ─────────────────────────────────────────────────────────── */

const listClients: AgentTool = {
  definition: {
    name: 'list_clients',
    description:
      'List every client with at-a-glance health: name, email, roadmap progress, current phase, open action items, check-in count, momentum, and last activity. Use this first to find who exists or to compare clients.',
    input_schema: { type: 'object', properties: {} },
  },
  handler: async () => {
    const clients = await getClientsHealth();
    return { count: clients.length, clients };
  },
};

const searchClients: AgentTool = {
  definition: {
    name: 'search_clients',
    description: 'Find clients whose name or email contains the query. Returns their health rows.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Name or email substring' } },
      required: ['query'],
    },
  },
  handler: async (input) => {
    const q = String(input.query || '').toLowerCase();
    const clients = await getClientsHealth();
    return {
      matches: clients.filter(
        (c) => c.email.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q)
      ),
    };
  },
};

const getClientJourneyTool: AgentTool = {
  definition: {
    name: 'get_client_journey',
    description:
      "Get the full journey for ONE client by email: profile + contract tier, the where-they're-at narrative, admin notes / red flags, momentum, roadmap phase progress, onboarding step status, uploaded deliverables, action items, check-in calls (summaries only — no transcripts), wins, and recent activity timeline. For Creative Specialists it also returns their weekly reports, one entry per week: the Friday numbers — sales (booked/closed/cash), content (Instagram and YouTube views, followers, watch time) and commitment (what share of their assigned to-dos they completed) — plus whether that week's Wednesday plan came in, and any escalation trigger those fire; `weeklyReports` is null for every other client. This is the primary tool for any question about a specific client.",
    input_schema: {
      type: 'object',
      properties: { email: { type: 'string', description: "The client's email" } },
      required: ['email'],
    },
  },
  handler: async (input) => {
    const j = await getClientJourney(norm(String(input.email || '')));
    if (!j.profile) return { error: 'No client found with that email.' };
    return {
      profile: j.profile,
      progress: j.progress
        ? { narrative: j.progress.narrative, momentum: j.progress.momentum, admin_notes: j.progress.admin_notes }
        : null,
      roadmap: {
        completed: j.roadmap.completed,
        total: j.roadmap.total,
        phases: j.roadmap.phases.map((p) => ({ title: p.title, completed: p.completed, total: p.total })),
      },
      onboarding: {
        onboardedAt: j.onboarding.onboardedAt,
        completed: j.onboarding.completed,
        total: j.onboarding.total,
        contract: contractTierLabel(j.onboarding.contractTier) || null,
        pendingSteps: j.onboarding.steps.filter((s) => !s.done).map((s) => s.title),
      },
      deliverables: j.deliverables.map((d) => ({ name: d.name, step: d.stepTitle, at: d.createdAt })),
      // Creative Specialists only — null for everyone else.
      weeklyReports: j.weeklyReports
        ? {
            escalations: j.weeklyReports.escalations,
            outstanding: {
              awaitingWednesdayPlan: j.weeklyReports.awaitingPlan,
              awaitingFridayReport: j.weeklyReports.awaitingSubmission,
              awaitingSend: j.weeklyReports.awaitingSend,
            },
            weeks: j.weeklyReports.weeks,
          }
        : null,
      onboardingForms: j.forms || null,
      actionItems: j.actionItems.map((a) => ({ text: a.text, status: a.status, source: a.source, due_date: a.due_date })),
      checkins: j.checkins.map((c) => ({
        id: c.id, title: c.title, coach: c.coach_name, date: c.call_date, sentiment: c.sentiment,
        summary: c.summary_bullets, action_steps: c.action_steps, wins: c.wins, blockers: c.blockers,
      })),
      wins: j.wins.map((w) => ({ content: w.content, date: w.created_at })),
      recentActivity: j.events.slice(0, 40).map((e) => ({ type: e.event_type, title: e.title, at: e.occurred_at })),
    };
  },
};

const getCheckinDetail: AgentTool = {
  definition: {
    name: 'get_checkin_detail',
    description:
      'Get the full detail of a single check-in / coaching call by its id (ids come from get_client_journey → checkins), including the transcript and full AI analysis. Use only when you need specifics of what was actually said on a call.',
    input_schema: {
      type: 'object',
      properties: { checkin_id: { type: 'string' } },
      required: ['checkin_id'],
    },
  },
  handler: async (input) => {
    const c = await getCheckInById(String(input.checkin_id || ''));
    if (!c) return { error: 'Check-in not found.' };
    return {
      title: c.title, coach: c.coach_name, client: c.client_email, date: c.call_date, sentiment: c.sentiment,
      summary_bullets: c.summary_bullets, action_steps: c.action_steps, wins: c.wins, blockers: c.blockers,
      queries_answered: c.queries_answered, red_flags: c.red_flags,
      // Full, untruncated transcript — coaching calls can run 80–90 min. The
      // runAgent tool-result backstop (800k chars) is the only safety bound.
      transcript: c.transcript || '',
    };
  },
};

export const CLIENT_TOOLS: AgentTool[] = [listClients, searchClients, getClientJourneyTool, getCheckinDetail];

/* ─── COMPANY tools (Advisor only) ─────────────────────────────────────────── */

const salesOverview: AgentTool = {
  definition: {
    name: 'get_sales_overview',
    description:
      'Company sales performance across recent calls: total calls, closed, close rate, average ICP score and close likelihood, total revenue and cash collected, and the most common objections and pain points.',
    input_schema: { type: 'object', properties: {} },
  },
  handler: async () => {
    const { data } = await db()
      .from('icp_reports')
      .select('icp_score, close_likelihood, pain_points, full_analysis, calls ( outcome, revenue, cash_collected )')
      .order('created_at', { ascending: false })
      .limit(100);
    const reports = data ?? [];
    const calls = (r: { calls: unknown }) => r.calls as { outcome?: string; revenue?: number; cash_collected?: number } | null;
    const closed = reports.filter((r) => calls(r)?.outcome === 'closed').length;
    const revenue = reports.reduce((s, r) => s + (calls(r)?.revenue ?? 0), 0);
    const cash = reports.reduce((s, r) => s + (calls(r)?.cash_collected ?? 0), 0);
    const objections: Record<string, number> = {};
    const pains: Record<string, number> = {};
    for (const r of reports) {
      const fa = r.full_analysis as Record<string, unknown> | null;
      for (const o of [...((fa?.objections ?? []) as string[]), ...((fa?.blockers ?? []) as string[])]) objections[o] = (objections[o] ?? 0) + 1;
      for (const p of (r.pain_points ?? []) as string[]) pains[p] = (pains[p] ?? 0) + 1;
    }
    const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
    return {
      total_calls: reports.length,
      closed,
      close_rate: reports.length ? Math.round((closed / reports.length) * 100) : 0,
      avg_icp_score: reports.length ? Math.round(reports.reduce((s, r) => s + (r.icp_score ?? 0), 0) / reports.length) : 0,
      avg_close_likelihood: reports.length ? Math.round(reports.reduce((s, r) => s + ((r.close_likelihood as number) ?? 0), 0) / reports.length) : 0,
      total_revenue: revenue,
      total_cash_collected: cash,
      top_objections: top(objections),
      top_pain_points: top(pains),
    };
  },
};

const listSalesCalls: AgentTool = {
  definition: {
    name: 'list_sales_calls',
    description:
      'Recent sales / closing calls with lead name, closer, setter, outcome, revenue, cash collected, ICP score, close likelihood, source, and call summary. Optional limit (default 20, max 100).',
    input_schema: { type: 'object', properties: { limit: { type: 'integer', description: 'How many calls (default 20)' } } },
  },
  handler: async (input) => {
    const limit = Math.min(Number(input.limit) || 20, 100);
    const { data } = await db()
      .from('icp_reports')
      .select('call_id, icp_score, close_likelihood, call_summary, next_step, created_at, calls ( id, lead_name, closer, setter, call_date, outcome, revenue, cash_collected, source )')
      .order('created_at', { ascending: false })
      .limit(limit);
    return { calls: data ?? [] };
  },
};

const getSalesCallDetail: AgentTool = {
  definition: {
    name: 'get_sales_call_detail',
    description:
      "Get the FULL detail of one sales / closing call: its COMPLETE, untruncated transcript (calls can run 80+ minutes — the whole thing is returned) plus the full AI analysis (ICP score, close likelihood & outcome, objections, strengths, BANT signals, pain points, summary, next step) and the call's revenue / cash collected. Pass call_id (the calls.id from list_sales_calls) for one specific call, OR a lead_name to search by prospect name. A call_id (or a name that matches exactly one call) returns the full transcript; an ambiguous name returns short previews of each match — then call again with the right call_id to read that call's full transcript. Use this to read exactly what was said on a call — list_sales_calls only returns summaries.",
    input_schema: {
      type: 'object',
      properties: {
        call_id: { type: 'string', description: 'The calls.id from list_sales_calls' },
        lead_name: { type: 'string', description: 'Prospect name to search for (substring match) if call_id is unknown' },
      },
    },
  },
  handler: async (input) => {
    const callId = input.call_id ? String(input.call_id).trim() : '';
    const leadName = input.lead_name ? String(input.lead_name).trim() : '';

    let q = db()
      .from('calls')
      .select('id, lead_name, closer, setter, call_date, outcome, revenue, cash_collected, source, summary, transcript, icp_reports ( icp_score, close_likelihood, pain_points, call_summary, next_step, full_analysis )')
      .eq('call_type', 'closing');
    if (callId) q = q.eq('id', callId);
    else if (leadName) q = q.ilike('lead_name', `%${leadName}%`);
    else return { error: 'Provide either call_id or lead_name.' };

    const { data } = await q.order('call_date', { ascending: false }).limit(callId ? 1 : 8);
    const rows = data ?? [];
    if (!rows.length) return { error: 'No sales call found matching that.' };

    const meta = (c: (typeof rows)[number]) => {
      const report = Array.isArray(c.icp_reports) ? c.icp_reports[0] : c.icp_reports;
      return {
        id: c.id, lead_name: c.lead_name, closer: c.closer, setter: c.setter,
        call_date: c.call_date, outcome: c.outcome, revenue: c.revenue, cash_collected: c.cash_collected,
        source: c.source,
        analysis: report
          ? {
              icp_score: report.icp_score, close_likelihood: report.close_likelihood,
              pain_points: report.pain_points, call_summary: report.call_summary,
              next_step: report.next_step, full_analysis: report.full_analysis,
            }
          : null,
      };
    };

    // Fetched by id (or a name search that matched exactly one call): return the
    // COMPLETE transcript — no character cap (calls can run 80+ minutes). When a
    // name search is ambiguous, return metadata + a short preview for each and
    // point the bot at call_id so it pulls one full transcript at a time rather
    // than dumping several huge ones into context at once.
    if (rows.length === 1) {
      const c = rows[0];
      return { call: { ...meta(c), transcript: c.transcript || '' } };
    }
    return {
      note: 'Multiple calls matched. Call get_sales_call_detail again with a specific call_id to read that call\'s FULL transcript.',
      matches: rows.map((c) => ({ ...meta(c), transcript_preview: (c.transcript || '').slice(0, 1500) })),
    };
  },
};

const listReferrals: AgentTool = {
  definition: {
    name: 'list_referrals',
    description: 'All referrals: who referred, who was referred, date, cash collected, and commission owed.',
    input_schema: { type: 'object', properties: {} },
  },
  handler: async () => {
    const { data } = await db().from('referrals').select('*').order('referral_date', { ascending: false });
    return { referrals: data ?? [] };
  },
};

const getIcpCriteria: AgentTool = {
  definition: {
    name: 'get_icp_criteria',
    description: 'The current ICP (ideal client profile) criteria used to score sales calls.',
    input_schema: { type: 'object', properties: {} },
  },
  handler: async () => {
    const { data } = await db().from('icp_criteria').select('criteria').order('version', { ascending: false }).limit(1).maybeSingle();
    return { criteria: data?.criteria ?? {} };
  },
};

export const COMPANY_TOOLS: AgentTool[] = [salesOverview, listSalesCalls, getSalesCallDetail, listReferrals, getIcpCriteria];

/* ─── SALES tools (Sales AI bot only) ──────────────────────────────────────────
   The dedicated Sales bot is handed ONLY these — sales-call performance, the
   call list, and full transcripts/analysis (+ the ICP rubric used to score
   them). It gets no CLIENT_TOOLS and no referrals, so it structurally cannot
   read client/roadmap/onboarding data or anything outside the Sales tab. */
export const SALES_TOOLS: AgentTool[] = [salesOverview, listSalesCalls, getSalesCallDetail, getIcpCriteria];

/* ─── CRM tools (CRM Assistant only) ────────────────────────────────────────────
   The CRM Assistant is handed ONLY these — the CRM leads pipeline and each lead's
   manually-logged touchpoints. It gets no CLIENT_TOOLS, no COMPANY_TOOLS and no
   SALES_TOOLS, so it structurally cannot read client/roadmap/onboarding data,
   sales-call transcripts, revenue, or referrals — only the CRM tab's own data,
   plus whatever screenshots/recordings the user feeds it (injected as context). */

const LEAD_FIELDS =
  'id, ig_handle, whatsapp, has_whatsapp, name, source, icp_tier, status, revenue, business, dials_made, stage, next_followup_at, ai_summary, ai_next_move, notes, created_at, updated_at';

const crmListLeads: AgentTool = {
  definition: {
    name: 'list_crm_leads',
    description:
      'List CRM leads with their pipeline fields: handle/name, source, ICP tier (Low ICP / Perfect ICP), status (Qualified / DQ), monthly revenue band, business type (Coach / Agency Owner / Other), stage, next follow-up date, and notes. Use this first to see the pipeline or find who exists. Optional stage filter and limit (default 50, max 200).',
    input_schema: {
      type: 'object',
      properties: {
        stage: { type: 'string', description: 'Optional exact stage filter, e.g. new, contacted, nurturing, application_sent, call_booked, call_held, closed_won, closed_lost, ghosted' },
        limit: { type: 'integer', description: 'How many leads (default 50)' },
      },
    },
  },
  handler: async (input) => {
    const limit = Math.min(Number(input.limit) || 50, 200);
    let q = db().from('crm_leads').select(LEAD_FIELDS).order('updated_at', { ascending: false }).limit(limit);
    if (input.stage) q = q.eq('stage', String(input.stage));
    const { data } = await q;
    return { count: (data ?? []).length, leads: data ?? [] };
  },
};

const crmSearchLeads: AgentTool = {
  definition: {
    name: 'search_crm_leads',
    description: 'Find CRM leads whose Instagram handle, name, or WhatsApp number contains the query. Returns their full pipeline rows.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Handle, name, or number substring' } },
      required: ['query'],
    },
  },
  handler: async (input) => {
    const q = String(input.query || '').trim();
    if (!q) return { error: 'Provide a query.' };
    const { data } = await db()
      .from('crm_leads')
      .select(LEAD_FIELDS)
      .or(`ig_handle.ilike.%${q}%,name.ilike.%${q}%,whatsapp.ilike.%${q}%`)
      .order('updated_at', { ascending: false })
      .limit(50);
    return { matches: data ?? [] };
  },
};

const crmGetLead: AgentTool = {
  definition: {
    name: 'get_crm_lead',
    description:
      "Get ONE CRM lead's full record plus its complete touchpoint timeline (every logged interaction: channel, direction, content, date). Pass lead_id (from list/search) for one lead, OR a name/handle to look it up. Use this to read the full history with a specific lead before answering about them or drafting a reply.",
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'The crm_leads.id from list/search' },
        query: { type: 'string', description: 'Handle or name to look up if lead_id is unknown' },
      },
    },
  },
  handler: async (input) => {
    const leadId = input.lead_id ? String(input.lead_id).trim() : '';
    const query = input.query ? String(input.query).trim() : '';

    let lead;
    if (leadId) {
      const { data } = await db().from('crm_leads').select(LEAD_FIELDS).eq('id', leadId).maybeSingle();
      lead = data;
    } else if (query) {
      const { data } = await db()
        .from('crm_leads').select(LEAD_FIELDS)
        .or(`ig_handle.ilike.%${query}%,name.ilike.%${query}%`)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      lead = data;
    } else {
      return { error: 'Provide lead_id or query.' };
    }
    if (!lead) return { error: 'No CRM lead found matching that.' };

    const { data: touchpoints } = await db()
      .from('crm_touchpoints')
      .select('channel, direction, content, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true });

    return { lead, touchpoints: touchpoints ?? [] };
  },
};

const crmPipelineOverview: AgentTool = {
  definition: {
    name: 'get_crm_pipeline_overview',
    description:
      'A roll-up of the whole CRM pipeline: total leads, count by stage, by status (Qualified/DQ), by ICP tier, by business type, by revenue band, and how many follow-ups are due. Use for "how is the pipeline doing" / distribution questions.',
    input_schema: { type: 'object', properties: {} },
  },
  handler: async () => {
    const { data } = await db().from('crm_leads').select('stage, status, icp_tier, business, revenue, next_followup_at');
    const rows = data ?? [];
    const tally = (key: 'stage' | 'status' | 'icp_tier' | 'business' | 'revenue') => {
      const m: Record<string, number> = {};
      for (const r of rows) { const v = (r[key] as string) || 'unset'; m[v] = (m[v] ?? 0) + 1; }
      return m;
    };
    const now = Date.now();
    return {
      total_leads: rows.length,
      by_stage: tally('stage'),
      by_status: tally('status'),
      by_icp_tier: tally('icp_tier'),
      by_business: tally('business'),
      by_revenue_band: tally('revenue'),
      followups_due: rows.filter((r) => r.next_followup_at && new Date(r.next_followup_at as string).getTime() <= now).length,
    };
  },
};

/* ─── CRM write tools ───────────────────────────────────────────────────────
   Let the assistant attribute a shared conversation to a lead: create/update the
   lead record and log the DM messages onto its touchpoint timeline. Still scoped
   to the CRM tables only. Values that the DB constrains (stage, source, channel,
   direction) are validated here so a bad value can't error the insert. */

const CRM_STAGES = ['new', 'contacted', 'nurturing', 'application_sent', 'call_booked', 'call_held', 'closed_won', 'closed_lost', 'ghosted'];
const CRM_SOURCES = ['ig_dm', 'whatsapp', 'referral', 'cold_outreach', 'inbound', 'freebie', 'other'];
const CRM_CHANNELS = ['ig_dm', 'whatsapp', 'sms', 'call', 'email', 'other'];
const cleanHandle = (h: string) => h.replace(/^@+/, '').trim();

const crmUpsertLead: AgentTool = {
  definition: {
    name: 'upsert_crm_lead',
    description:
      "Create a CRM lead, or update an existing one, matched by Instagram handle. Use this to attribute a shared DM conversation to a lead — e.g. after the user gives you the @handle and name. Only pass fields you actually know; omitted fields are left unchanged (on update) or blank (on create). If a lead with that handle already exists it is UPDATED, never duplicated. After upserting, use log_crm_touchpoints to attach the conversation itself.",
    input_schema: {
      type: 'object',
      properties: {
        ig_handle: { type: 'string', description: 'Instagram handle, with or without @' },
        name: { type: 'string', description: "Lead's real name" },
        whatsapp: { type: 'string', description: 'WhatsApp number if known' },
        stage: { type: 'string', description: `Pipeline stage — one of: ${CRM_STAGES.join(', ')}` },
        status: { type: 'string', description: "'Qualified' or 'DQ'" },
        icp_tier: { type: 'string', description: "'Low ICP' or 'Perfect ICP'" },
        revenue: { type: 'string', description: 'Monthly revenue band — use EXACTLY one of: "$0 - $10k", "$10k - $30k", "$30k - $50k", "$50k - $100k", "$100k - $200k", "$200k - $500k", "$500k - $1mil". Pick the band the lead\'s figure falls into.' },
        business: { type: 'string', description: "'Coach', 'Agency Owner', or 'Other'" },
        dials_made: { type: 'integer', description: 'Number of dials/calls made to this lead (whole number)' },
        source: { type: 'string', description: `Where the lead came from — one of: ${CRM_SOURCES.join(', ')} (defaults to ig_dm on create)` },
        notes: { type: 'string', description: 'Freeform notes / context to save on the lead' },
        next_followup_at: { type: 'string', description: 'Next follow-up date as ISO or YYYY-MM-DD' },
      },
    },
  },
  handler: async (input) => {
    const handle = input.ig_handle ? cleanHandle(String(input.ig_handle)) : '';
    const name = input.name ? String(input.name).trim() : '';
    if (!handle && !name) return { error: 'Provide at least ig_handle or name.' };

    const patch: Record<string, unknown> = {};
    if (handle) patch.ig_handle = handle;
    if (name) patch.name = name;
    if (input.whatsapp) patch.whatsapp = String(input.whatsapp).trim();
    if (input.stage) {
      const s = String(input.stage).trim();
      if (!CRM_STAGES.includes(s)) return { error: `Invalid stage "${s}". Use one of: ${CRM_STAGES.join(', ')}` };
      patch.stage = s;
    }
    if (input.source) {
      const s = String(input.source).trim();
      if (!CRM_SOURCES.includes(s)) return { error: `Invalid source "${s}". Use one of: ${CRM_SOURCES.join(', ')}` };
      patch.source = s;
    }
    if (input.status) patch.status = String(input.status).trim();
    if (input.icp_tier) patch.icp_tier = String(input.icp_tier).trim();
    if (input.revenue) patch.revenue = String(input.revenue).trim();
    if (input.business) patch.business = String(input.business).trim();
    if (input.dials_made !== undefined && input.dials_made !== null && input.dials_made !== '') {
      const n = Number(input.dials_made);
      if (Number.isFinite(n)) patch.dials_made = Math.trunc(n);
    }
    if (input.notes) patch.notes = String(input.notes).trim();
    if (input.next_followup_at) {
      const d = new Date(String(input.next_followup_at));
      if (!isNaN(d.getTime())) patch.next_followup_at = d.toISOString();
    }

    // Match existing by handle (case-insensitive).
    let existing: { id: string } | null = null;
    if (handle) {
      const { data } = await db().from('crm_leads').select('id').ilike('ig_handle', handle).maybeSingle();
      existing = data;
    }

    if (existing) {
      const { data, error } = await db().from('crm_leads').update(patch).eq('id', existing.id).select(LEAD_FIELDS).single();
      if (error) return { error: error.message };
      return { updated: true, lead: data };
    }
    const { data, error } = await db()
      .from('crm_leads')
      .insert({ stage: 'new', source: 'ig_dm', ...patch })
      .select(LEAD_FIELDS)
      .single();
    if (error) return { error: error.message };
    return { created: true, lead: data };
  },
};

const crmLogTouchpoints: AgentTool = {
  definition: {
    name: 'log_crm_touchpoints',
    description:
      "Attach messages from a shared DM conversation onto a lead's touchpoint timeline, so the conversation is saved to that lead in the CRM. Identify the lead by lead_id (preferred, from upsert_crm_lead) or ig_handle. Pass the messages you extracted, each tagged 'inbound' (from the lead) or 'outbound' (from us). Log the real messages verbatim — don't summarise.",
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'crm_leads.id (from upsert_crm_lead / get_crm_lead)' },
        ig_handle: { type: 'string', description: 'Instagram handle if lead_id is unknown' },
        messages: {
          type: 'array',
          description: 'The conversation messages, in order',
          items: {
            type: 'object',
            properties: {
              direction: { type: 'string', description: "'inbound' (lead) or 'outbound' (us)" },
              content: { type: 'string', description: 'The message text' },
              channel: { type: 'string', description: `One of: ${CRM_CHANNELS.join(', ')} (default ig_dm)` },
            },
            required: ['direction', 'content'],
          },
        },
      },
      required: ['messages'],
    },
  },
  handler: async (input) => {
    const msgs = Array.isArray(input.messages) ? (input.messages as Record<string, unknown>[]) : [];
    if (!msgs.length) return { error: 'No messages to log.' };

    let leadId = input.lead_id ? String(input.lead_id).trim() : '';
    if (!leadId && input.ig_handle) {
      const { data } = await db().from('crm_leads').select('id').ilike('ig_handle', cleanHandle(String(input.ig_handle))).maybeSingle();
      if (!data) return { error: 'No lead with that handle. Call upsert_crm_lead first to create it.' };
      leadId = data.id as string;
    }
    if (!leadId) return { error: 'Provide lead_id or ig_handle.' };

    const rows = msgs
      .filter((m) => m && String(m.content || '').trim())
      .map((m) => {
        const ch = String(m.channel || 'ig_dm');
        return {
          lead_id: leadId,
          direction: String(m.direction).toLowerCase() === 'outbound' ? 'outbound' : 'inbound',
          channel: CRM_CHANNELS.includes(ch) ? ch : 'ig_dm',
          content: String(m.content).trim(),
        };
      });
    if (!rows.length) return { error: 'No non-empty messages to log.' };

    const { error } = await db().from('crm_touchpoints').insert(rows);
    if (error) return { error: error.message };
    // Bump the lead's updated_at so it surfaces as recently touched.
    await db().from('crm_leads').update({ updated_at: new Date().toISOString() }).eq('id', leadId);
    return { logged: rows.length, lead_id: leadId };
  },
};

export const CRM_TOOLS: AgentTool[] = [
  crmListLeads, crmSearchLeads, crmGetLead, crmPipelineOverview,
  crmUpsertLead, crmLogTouchpoints,
];
