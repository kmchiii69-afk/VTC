import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { fetchWhopRevenue } from "@/lib/whop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(token: string | undefined): boolean {
  const password = (process.env.ANALYTICS_PASSWORD || "").trim();
  if (!password || !token) return false;
  const expected = createHash("sha256").update(`ba-analytics:${password}`).digest("hex");
  return token === expected;
}

async function fetchCloseLeads(sinceDateStr: string) {
  const key = process.env.CLOSE_API_KEY || "";
  if (!key) return [];
  const auth = Buffer.from(`${key}:`).toString("base64");

  const leads: { status_label: string | null }[] = [];
  let skip = 0;

  while (skip < 3000) {
    const query = encodeURIComponent(`date_created >= "${sinceDateStr}"`);
    const url = `https://api.close.com/api/v1/lead/?query=${query}&_fields=status_label&_limit=100&_skip=${skip}`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) break;
    const data = await res.json();
    const page: { status_label: string | null }[] = data.data ?? [];
    leads.push(...page);
    if (page.length < 100) break;
    skip += 100;
  }

  return leads;
}

async function fetchCalendlyEvents(since: string) {
  const pat = process.env.CALENDLY_PAT || "";
  if (!pat) return [];

  const meRes = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!meRes.ok) return [];
  const me = await meRes.json();
  const userUri: string = me.resource?.uri ?? "";
  if (!userUri) return [];

  const events: { status: string; start_time: string; name: string }[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      user: userUri,
      min_start_time: since,
      max_start_time: new Date().toISOString(),
      count: "100",
    });
    if (pageToken) params.set("page_token", pageToken);

    const res = await fetch(`https://api.calendly.com/scheduled_events?${params}`, {
      headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) break;
    const data = await res.json();
    events.push(...(data.collection ?? []));
    pageToken = data.pagination?.next_page_token ?? null;
  } while (pageToken && events.length < 500);

  return events;
}

async function fetchWhopData(days: number) {
  const apiKey = process.env.WHOP_API_KEY || "";
  if (!apiKey) return null;
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  const cutoff = Math.floor(Date.now() / 1000) - days * 86_400;

  const totalRes = await fetch(
    "https://api.whop.com/api/v2/memberships?page=1&per_page=1&valid=true",
    { headers, next: { revalidate: 300 } }
  );
  const totalActive: number = totalRes.ok
    ? ((await totalRes.json()).pagination?.total_count ?? 0)
    : 0;

  let newMembers = 0;
  for (let page = 1; page <= 30; page++) {
    const res = await fetch(
      `https://api.whop.com/api/v2/memberships?page=${page}&per_page=100`,
      { headers, next: { revalidate: 300 } }
    );
    if (!res.ok) break;
    const items: { created_at: number }[] = (await res.json()).data ?? [];
    let done = false;
    for (const m of items) {
      if (m.created_at >= cutoff) newMembers++;
      else { done = true; break; }
    }
    if (done || items.length < 100) break;
  }

  const rev = await fetchWhopRevenue(days);
  return { totalActive, newMembers, revenue: rev?.net ?? 0, paymentCount: rev?.count ?? 0 };
}

const PH_HOST = "https://us.i.posthog.com";
const phProject = () => process.env.POSTHOG_PROJECT_ID || "";

// BA funnel events (replaces fous QC events)
const FUNNEL_EVENTS = [
  "$pageview",
  "lm_submitted",
  "lm_content_viewed",
  "application_started",
  "application_submitted",
  "qualify_form_submitted",
  "book_page_viewed",
  "book_fallback_requested",
  "call_booked",
];

type PhRow = [string, number, number];

async function fetchPostHogFunnel(days: number): Promise<Record<string, { total: number; unique: number }>> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || "";
  const project = phProject();
  if (!apiKey || !project) return {};

  const eventList = FUNNEL_EVENTS.map((e) => `'${e}'`).join(", ");
  const query = `
    SELECT event, count() AS total, count(DISTINCT person_id) AS unique_users
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND event IN (${eventList})
    GROUP BY event
    ORDER BY total DESC
  `.trim();

  const res = await fetch(`${PH_HOST}/api/projects/${project}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    next: { revalidate: 300 },
  });

  if (!res.ok) return {};
  const data = await res.json();

  const result: Record<string, { total: number; unique: number }> = {};
  for (const row of (data.results ?? []) as PhRow[]) {
    result[row[0]] = { total: Number(row[1]), unique: Number(row[2]) };
  }
  return result;
}

type KitTag = { id: number; name: string; total_subscriptions: number; subscriptions_count: number };

type BroadcastStats = {
  id: number;
  subject: string;
  created_at: string;
  recipients: number;
  open_rate: number;
  click_rate: number;
  unsubscribe_rate: number;
  emails_opened: number;
  total_clicks: number;
  status: string;
};

async function fetchKitData() {
  const apiKey = process.env.KIT_API_KEY || "";
  const apiSecret = process.env.KIT_API_SECRET || "";
  if (!apiKey) return null;

  const sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [subRes, newSubRes, tagsRes, broadcastsRes, sequencesRes] = await Promise.all([
    fetch(`https://api.convertkit.com/v3/subscribers?api_secret=${apiSecret}&count=0`, { next: { revalidate: 300 } }),
    fetch(`https://api.convertkit.com/v3/subscribers?api_secret=${apiSecret}&count=0&from=${sinceIso}`, { next: { revalidate: 300 } }),
    fetch(`https://api.convertkit.com/v3/tags?api_key=${apiKey}`, { next: { revalidate: 300 } }),
    fetch(`https://api.convertkit.com/v3/broadcasts?api_secret=${apiSecret}`, { next: { revalidate: 300 } }),
    fetch(`https://api.convertkit.com/v3/sequences?api_key=${apiKey}`, { next: { revalidate: 300 } }),
  ]);

  const subData    = subRes.ok        ? await subRes.json()        : null;
  const newSubData = newSubRes.ok     ? await newSubRes.json()     : null;
  const tagsData   = tagsRes.ok       ? await tagsRes.json()       : null;
  const bcastData  = broadcastsRes.ok ? await broadcastsRes.json() : null;
  const seqData    = sequencesRes.ok  ? await sequencesRes.json()  : null;

  // BA Kit tag env vars — set these in .env.local
  const TAG_MAP: Record<string, string> = {
    [process.env.KIT_TAG_OPTIN     ?? ""]: "Opt In",
    [process.env.KIT_TAG_APPLIED   ?? ""]: "Applied",
    [process.env.KIT_TAG_QUALIFIED ?? ""]: "Qualified",
    [process.env.KIT_TAG_BOOKED    ?? ""]: "Booked",
  };
  const tagCounts: Record<string, number> = {};
  for (const tag of (tagsData?.tags ?? []) as KitTag[]) {
    const label = TAG_MAP[String(tag.id)];
    if (label) tagCounts[label] = tag.total_subscriptions ?? tag.subscriptions_count ?? 0;
  }

  const allBroadcasts: { id: number; subject: string; created_at: string }[] =
    (bcastData?.broadcasts ?? [])
      .sort((a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at))
      .slice(0, 10);

  const statsResults = await Promise.all(
    allBroadcasts.map((b) =>
      fetch(`https://api.convertkit.com/v3/broadcasts/${b.id}/stats?api_secret=${apiSecret}`, { next: { revalidate: 600 } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );

  const broadcasts: BroadcastStats[] = [];
  for (let i = 0; i < allBroadcasts.length; i++) {
    const s = statsResults[i]?.broadcast?.stats;
    if (!s || s.status !== "completed") continue;
    broadcasts.push({
      id: allBroadcasts[i].id,
      subject: allBroadcasts[i].subject,
      created_at: allBroadcasts[i].created_at,
      recipients: s.recipients ?? 0,
      open_rate: s.open_rate ?? 0,
      click_rate: s.click_rate ?? 0,
      unsubscribe_rate: s.unsubscribe_rate ?? 0,
      emails_opened: s.emails_opened ?? 0,
      total_clicks: s.total_clicks ?? 0,
      status: s.status,
    });
  }

  const sequences: { id: number; name: string; created_at: string }[] =
    (seqData?.courses ?? []).map((s: { id: number; name: string; created_at: string }) => ({
      id: s.id, name: s.name, created_at: s.created_at,
    }));

  return {
    totalSubscribers: subData?.total_subscribers ?? 0,
    newSubscribers: newSubData?.total_subscribers ?? 0,
    tags: tagCounts,
    broadcasts,
    sequences,
  };
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("ba_auth")?.value;
  if (!isAuthed(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(parseInt(req.nextUrl.searchParams.get("days") ?? "30"), 365);
  const sinceDate = new Date(Date.now() - days * 86_400_000);
  const sinceDateStr = sinceDate.toISOString().split("T")[0];

  const [leads, calendlyEvents, posthog, kit, whop] = await Promise.all([
    fetchCloseLeads(sinceDateStr),
    fetchCalendlyEvents(sinceDate.toISOString()),
    fetchPostHogFunnel(days),
    fetchKitData(),
    fetchWhopData(days),
  ]);

  const byStatus: Record<string, number> = {};
  for (const lead of leads) {
    const s = lead.status_label ?? "Unknown";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  const cActive = calendlyEvents.filter((e) => e.status === "active").length;
  const cCanceled = calendlyEvents.filter((e) => e.status === "canceled").length;

  return NextResponse.json({
    period: days,
    close: { byStatus, total: leads.length },
    calendly: { total: calendlyEvents.length, active: cActive, canceled: cCanceled },
    posthog,
    kit,
    whop,
  });
}
