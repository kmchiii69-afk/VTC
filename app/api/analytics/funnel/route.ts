// GET /api/analytics/funnel?days=30
//
// Brand Architect analytics backend. Returns two ORDERED funnels (lead magnet +
// $5K HT offer) plus: LM→HT crossover, traffic sources, Whop revenue, and
// Call/Kit email nurture data.

import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/analytics-auth";
import { fetchWhopRevenue } from "@/lib/whop";
import { attributeClosesToLm } from "@/lib/freecourse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const _cache = new Map<number, { t: number; payload: unknown }>();
const CACHE_MS = 90_000;

const PH_HOST = "https://us.i.posthog.com";
const phProject = () => process.env.POSTHOG_PROJECT_ID || "";

async function fetchCallStats(days: number) {
  const key = process.env.CLOSE_API_KEY || "";
  if (!key) return [];
  const auth = Buffer.from(`${key}:`).toString("base64");
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19);

  type Rep = { name: string; calls: number; answered: number; talkSec: number };
  const reps: Record<string, Rep> = {};
  let skip = 0;
  for (let p = 0; p < 30; p++) {
    const url = `https://api.close.com/api/v1/activity/call/?date_created__gte=${encodeURIComponent(since)}&_limit=100&_skip=${skip}`;
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }, next: { revalidate: 300 } });
    if (!res.ok) break;
    const d = await res.json();
    for (const c of (d.data ?? []) as { user_name?: string; duration?: number; disposition?: string }[]) {
      const name = c.user_name || "Unknown";
      const r = (reps[name] ??= { name, calls: 0, answered: 0, talkSec: 0 });
      r.calls++;
      const dur = c.duration ?? 0;
      r.talkSec += dur;
      if (c.disposition === "answered" || dur > 0) r.answered++;
    }
    if (!d.has_more) break;
    skip += 100;
  }
  return Object.values(reps)
    .filter((r) => r.calls >= 2)
    .sort((a, b) => b.calls - a.calls)
    .map((r) => ({
      name: r.name,
      calls: r.calls,
      answered: r.answered,
      connectPct: r.calls ? Math.round((r.answered / r.calls) * 100) : 0,
      talkMin: Math.round(r.talkSec / 60),
    }));
}

async function fetchBookingFunnel(days: number) {
  const key = process.env.CLOSE_API_KEY || "";
  if (!key) return null;
  const auth = Buffer.from(`${key}:`).toString("base64");
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let idName: Record<string, string> = {};
  try {
    const sd = await (await fetch("https://api.close.com/api/v1/status/lead/", { headers, next: { revalidate: 3600 } })).json();
    idName = Object.fromEntries((sd.data ?? []).map((s: { id: string; label: string }) => [s.id, s.label]));
  } catch {
    return null;
  }

  const histDays = Math.max(days + 60, 90);
  const histSince = new Date(Date.now() - histDays * 86_400_000).toISOString();
  const bookCutoff = Date.now() - days * 86_400_000;
  const seq: Record<string, { t: number; label: string }[]> = {};
  for (let p = 0; p < 32; p++) {
    const url = `https://api.close.com/api/v1/activity/status_change/lead/?date_created__gte=${encodeURIComponent(histSince)}&_limit=100&_skip=${p * 100}`;
    const res = await fetch(url, { headers, next: { revalidate: 600 } });
    if (!res.ok) break;
    const d = await res.json();
    for (const sc of (d.data ?? []) as { lead_id?: string; new_status_id?: string; status_id?: string; date_created?: string }[]) {
      const lid = sc.lead_id ?? "";
      const label = idName[(sc.new_status_id ?? sc.status_id) ?? ""] ?? "?";
      (seq[lid] ??= []).push({ t: sc.date_created ? Date.parse(sc.date_created) : 0, label });
    }
    if (!d.has_more) break;
  }
  let booked = 0, immediateBooked = 0, setterRescued = 0, laterBooked = 0;
  for (const events of Object.values(seq)) {
    events.sort((a, b) => a.t - b.t);
    const bi = events.findIndex((e) => e.label === "Demo Booked");
    if (bi < 0) continue;
    const bookedAt = events[bi].t;
    if (bookedAt < bookCutoff) continue;
    booked++;
    const setterBefore = events.slice(0, bi).some((e) => e.label.includes("Setter"));
    if (setterBefore) {
      setterRescued++;
    } else {
      const gapHours = (bookedAt - events[0].t) / 3_600_000;
      if (gapHours <= 24) immediateBooked++;
      else laterBooked++;
    }
  }
  let showed = 0, canceled = 0, meetings = 0;
  for (let p = 0; p < 12; p++) {
    const url = `https://api.close.com/api/v1/activity/meeting/?date_created__gte=${encodeURIComponent(since)}&_limit=100&_skip=${p * 100}`;
    const res = await fetch(url, { headers, next: { revalidate: 600 } });
    if (!res.ok) break;
    const d = await res.json();
    for (const m of (d.data ?? []) as { status?: string }[]) {
      meetings++;
      if (m.status === "completed") showed++;
      else if (m.status === "canceled") canceled++;
    }
    if (!d.has_more) break;
  }
  return { booked, immediateBooked, setterRescued, laterBooked, selfBooked: immediateBooked, meetings, showed, canceled };
}

async function fetchSequences() {
  const key = process.env.KIT_API_KEY || "";
  const sec = process.env.KIT_API_SECRET || "";
  if (!key || !sec) return [];
  const listRes = await fetch(`https://api.convertkit.com/v3/sequences?api_key=${key}`, { next: { revalidate: 600 } });
  if (!listRes.ok) return [];
  const seqs: { id: number; name: string }[] = (await listRes.json()).courses ?? [];

  const funnelOf = (name: string): "lm" | "ht" | "post-call" | "other" => {
    const n = name.toLowerCase();
    if (n.includes("lead magnet") || n.includes("free")) return "lm";
    if (n.includes("brand architect") || n.includes("$5k") || n.includes("high ticket") || n.includes("apply")) return "ht";
    if (n.includes("booked call") || n.includes("book")) return "post-call";
    return "other";
  };

  const relevant = seqs.filter((s) => funnelOf(s.name) !== "other").slice(0, 12);
  const out = await Promise.all(
    relevant.map(async (s) => {
      const r = await fetch(`https://api.convertkit.com/v3/sequences/${s.id}/subscriptions?api_secret=${sec}&page=1`, { next: { revalidate: 600 } });
      const enrolled = r.ok ? (await r.json()).total_subscriptions ?? 0 : 0;
      return { id: s.id, name: s.name, funnel: funnelOf(s.name), enrolled };
    }),
  );
  return out.filter((s) => s.enrolled > 0).sort((a, b) => b.enrolled - a.enrolled);
}

async function fetchBroadcasts() {
  const sec = process.env.KIT_API_SECRET || "";
  if (!sec) return [];
  const listRes = await fetch(`https://api.convertkit.com/v3/broadcasts?api_secret=${sec}`, { next: { revalidate: 600 } });
  if (!listRes.ok) return [];
  const all: { id: number; subject: string; created_at: string }[] = ((await listRes.json()).broadcasts ?? [])
    .sort((a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8);
  const stats = await Promise.all(
    all.map((b) =>
      fetch(`https://api.convertkit.com/v3/broadcasts/${b.id}/stats?api_secret=${sec}`, { next: { revalidate: 600 } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  );
  const out: { subject: string; date: string; recipients: number; openRate: number; clickRate: number; clicks: number }[] = [];
  for (let i = 0; i < all.length; i++) {
    const s = stats[i]?.broadcast?.stats;
    if (!s || s.status !== "completed") continue;
    out.push({
      subject: all[i].subject,
      date: all[i].created_at,
      recipients: s.recipients ?? 0,
      openRate: s.open_rate ?? 0,
      clickRate: s.click_rate ?? 0,
      clicks: s.total_clicks ?? 0,
    });
  }
  return out;
}

async function hogql(query: string): Promise<unknown[][]> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || "";
  const project = phProject();
  if (!apiKey || !project) return [];
  const res = await fetch(`${PH_HOST}/api/projects/${project}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    console.error("[funnel] HogQL failed:", res.status, (await res.text()).slice(0, 300));
    return [];
  }
  return ((await res.json()).results ?? []) as unknown[][];
}

type Step = { id: string; label: string; cond: string; note?: string };

// Lead magnet funnel steps
const LM_STEPS: Step[] = [
  { id: "lm_visit", label: "Visited lead magnet page", cond: `event = '$pageview' AND (properties.$pathname LIKE '%lead-magnet%' OR properties.$pathname LIKE '%free%' OR properties.page_category = 'lead_magnet')` },
  { id: "lm_optin", label: "Signed up (email captured)", cond: `event = 'lm_submitted'` },
  { id: "lm_content", label: "Accessed lead magnet content", cond: `event = 'lm_content_viewed'` },
];

// $5K high-ticket offer funnel steps
const HT_STEPS: Step[] = [
  { id: "ht_visit", label: "Visited $5K offer page", cond: `event = '$pageview' AND (properties.$pathname IN ('/', '/apply', '/work-with-us', '/brand-architect') OR properties.page_category = 'ht_offer')` },
  { id: "ht_optin", label: "Started application", cond: `event = 'application_started'` },
  { id: "ht_app", label: "Submitted application", cond: `event = 'application_submitted'` },
  { id: "ht_qualified", label: "Qualified", cond: `event = 'qualify_form_submitted'` },
];

function orderedFunnelQuery(steps: Step[], days: number): string {
  const minCols = steps
    .map((s, i) => `nullIf(minIf(timestamp, ${s.cond}), toDateTime(0)) AS s${i}`)
    .join(",\n      ");

  const counts = steps
    .map((_, i) => {
      const chain = Array.from({ length: i + 1 }, (_, j) => `isNotNull(s${j})`).concat(
        Array.from({ length: i }, (_, j) => `s${j + 1} >= s${j}`),
      );
      return `countIf(${chain.join(" AND ")}) AS c${i}`;
    })
    .join(",\n    ");

  return `
    SELECT ${counts}
    FROM (
      SELECT person_id,
      ${minCols}
      FROM events
      WHERE timestamp >= now() - INTERVAL ${days} DAY
      GROUP BY person_id
    )
  `;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req.cookies.get("ba_auth")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "30") || 30, 1), 365);

  const cached = _cache.get(days);
  if (cached && Date.now() - cached.t < CACHE_MS) return NextResponse.json(cached.payload);

  // LM signups who also started the $5K application — the crossover
  const crossoverQuery = `
    SELECT
      (SELECT count(DISTINCT person_id) FROM events WHERE event = 'lm_submitted' AND timestamp >= now() - INTERVAL ${days} DAY) AS lm_total,
      (SELECT count(DISTINCT person_id) FROM events WHERE event IN ('application_started','application_submitted','qualify_form_submitted') AND timestamp >= now() - INTERVAL ${days} DAY) AS ht_total,
      count(DISTINCT person_id) AS crossed
    FROM events
    WHERE event IN ('application_started','application_submitted','qualify_form_submitted')
      AND timestamp >= now() - INTERVAL ${days} DAY
      AND person_id IN (
        SELECT DISTINCT person_id FROM events
        WHERE event = 'lm_submitted' AND timestamp >= now() - INTERVAL ${days} DAY
      )
  `;

  const sourcesQuery = `
    SELECT
      coalesce(nullIf(person.properties.$initial_utm_source, ''), nullIf(replaceAll(person.properties.$initial_referring_domain, '$direct', ''), ''), '(direct)') AS source,
      coalesce(nullIf(person.properties.$initial_utm_content, ''), '') AS content,
      uniqIf(person_id, event = '$pageview') AS visitors,
      uniqIf(person_id, event = 'lm_submitted') AS lm_signups,
      uniqIf(person_id, event = 'application_submitted') AS surveys
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days} DAY
    GROUP BY source, content
    HAVING visitors > 1 OR lm_signups > 0 OR surveys > 0
    ORDER BY visitors DESC
    LIMIT 12
  `;

  const dailyQuery = `
    SELECT toDate(timestamp) AS d,
      countIf(event = 'lm_submitted') AS lm,
      countIf(event IN ('application_started', 'application_submitted')) AS ht
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND event IN ('lm_submitted', 'application_started', 'application_submitted')
    GROUP BY d ORDER BY d
  `;

  // $5K routing split: qualified → book page viewed → booked
  const htSplitQuery = `
    SELECT
      uniqIf(person_id, event = 'qualify_form_submitted') AS ht_qualified,
      uniqIf(person_id, event = 'book_page_viewed') AS book_viewed
    FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY
  `;

  // LM signup → HT application → qualified, with timing
  const nurtureQuery = `
    SELECT
      countIf(isNotNull(t_lm)) AS enrolled,
      countIf(isNotNull(t_lm) AND isNotNull(t_ht) AND t_ht >= t_lm) AS to_ht,
      countIf(isNotNull(t_lm) AND isNotNull(t_q) AND t_q >= t_lm) AS to_qual,
      round(avg(if(isNotNull(t_lm) AND isNotNull(t_ht) AND t_ht >= t_lm, dateDiff('day', t_lm, t_ht), null)), 1) AS avg_days,
      countIf(isNotNull(t_lm) AND isNotNull(t_ht) AND t_ht >= t_lm AND dateDiff('day', t_lm, t_ht) <= 7) AS within7
    FROM (
      SELECT person_id,
        nullIf(minIf(timestamp, event = 'lm_submitted'), toDateTime(0)) AS t_lm,
        nullIf(minIf(timestamp, event = 'application_started'), toDateTime(0)) AS t_ht,
        nullIf(minIf(timestamp, event = 'qualify_form_submitted'), toDateTime(0)) AS t_q
      FROM events WHERE timestamp >= now() - INTERVAL 120 DAY
      GROUP BY person_id
    )
    WHERE isNotNull(t_lm) AND t_lm >= now() - INTERVAL ${days} DAY
  `;

  const [htRows, lmRows, crossRows, sourceRows, dailyRows, htSplitRows, nurtureRows, trackingSinceRows, team, sequences, broadcasts, revenue, booking] = await Promise.all([
    hogql(orderedFunnelQuery(HT_STEPS, days)),
    hogql(orderedFunnelQuery(LM_STEPS, days)),
    hogql(crossoverQuery),
    hogql(sourcesQuery),
    hogql(dailyQuery),
    hogql(htSplitQuery),
    hogql(nurtureQuery),
    hogql(`SELECT min(timestamp) FROM events`),
    fetchCallStats(days).catch(() => []),
    fetchSequences().catch(() => []),
    fetchBroadcasts().catch(() => []),
    fetchWhopRevenue(days).catch(() => null),
    fetchBookingFunnel(days).catch(() => null),
  ]);

  const buildSteps = (defs: Step[], rows: unknown[][]) => {
    const row = rows[0] ?? [];
    return defs.map((s, i) => ({ id: s.id, label: s.label, count: Number(row[i] ?? 0), note: s.note }));
  };

  const cr = crossRows[0] ?? [];
  const crossover = {
    lmTotal: Number(cr[0] ?? 0),
    htTotal: Number(cr[1] ?? 0),
    crossed: Number(cr[2] ?? 0),
  };

  const sources = sourceRows.map((r) => ({
    source: String(r[0] ?? "(direct)"),
    content: String(r[1] ?? ""),
    visitors: Number(r[2] ?? 0),
    lmSignups: Number(r[3] ?? 0),
    surveys: Number(r[4] ?? 0),
  }));

  const daily = dailyRows.map((r) => ({
    date: String(r[0] ?? ""),
    lm: Number(r[1] ?? 0),
    ht: Number(r[2] ?? 0),
  }));

  const hs = htSplitRows[0] ?? [];
  const htSplit = {
    htQualified: Number(hs[0] ?? 0),
    bookViewed: Number(hs[1] ?? 0),
  };

  const closeOrigin = await attributeClosesToLm(revenue?.htCloseMems ?? []).catch(() => null);
  const htSplitWithClose = {
    ...htSplit,
    htFromLm: closeOrigin?.htFromLm ?? 0,
  };

  const nr = nurtureRows[0] ?? [];
  const nurture = {
    enrolled: Number(nr[0] ?? 0),
    toHt: Number(nr[1] ?? 0),
    toQualified: Number(nr[2] ?? 0),
    avgDays: Number(nr[3] ?? 0),
    within7: Number(nr[4] ?? 0),
  };

  const trackingSince = trackingSinceRows[0]?.[0] ? String(trackingSinceRows[0][0]) : null;

  const payload = {
    period: days,
    trackingSince,
    lm: buildSteps(LM_STEPS, lmRows),
    ht: buildSteps(HT_STEPS, htRows),
    crossover,
    sources,
    daily,
    htSplit: htSplitWithClose,
    nurture,
    team,
    sequences,
    broadcasts,
    booking,
    revenue,
  };
  _cache.set(days, { t: Date.now(), payload });
  return NextResponse.json(payload);
}
