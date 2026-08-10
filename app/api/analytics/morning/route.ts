// GET /api/analytics/morning?end=<iso>
//
// The Morning Report. 5am snapshot of the completed prior day. See fous version
// for full comments — this is adapted for Brand Architect BA events.

import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/analytics-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function revenueWithin(startSec: number, endSec: number) {
  const apiKey = process.env.WHOP_API_KEY || "";
  if (!apiKey) return null;
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  const floor = startSec - 2 * 86_400;
  // high-ticket close threshold (same as lib/whop.ts)
  const HT_THRESHOLD = parseInt(process.env.WHOP_HT_CLOSE_THRESHOLD || "2500");
  const htProductIds = new Set((process.env.WHOP_HT_PRODUCT_IDS || "").split(",").filter(Boolean));
  type Pay = { status?: string; final_amount?: number; paid_at?: number; created_at?: number; billing_reason?: string; product?: string };
  let net = 0, count = 0, highTicket = 0, highTicketRev = 0;
  for (let pg = 1; pg <= 20; pg++) {
    const res = await fetch(`https://api.whop.com/api/v2/payments?page=${pg}&per=50`, { headers, cache: "no-store" });
    if (!res.ok) break;
    const items: Pay[] = (await res.json()).data ?? [];
    if (items.length === 0) break;
    for (const p of items) {
      const ts = p.paid_at ?? p.created_at ?? 0;
      if (ts >= startSec && ts < endSec && p.status === "paid") {
        const amt = p.final_amount ?? 0;
        net += amt;
        count++;
        const pid = typeof p.product === "string" ? p.product : "";
        const oneTime = p.billing_reason === "one_time" || p.billing_reason === "subscription_create";
        const isHt = htProductIds.size > 0 ? htProductIds.has(pid) : true;
        if (oneTime && amt >= HT_THRESHOLD && isHt) {
          highTicket++;
          highTicketRev += amt;
        }
      }
    }
    if (Math.min(...items.map((p) => p.paid_at ?? p.created_at ?? 0)) < floor) break;
  }
  return { net: Math.round(net), count, highTicket, highTicketRev: Math.round(highTicketRev) };
}

const PH_HOST = "https://us.i.posthog.com";
const phProject = () => process.env.POSTHOG_PROJECT_ID || "";

async function hogql(query: string): Promise<unknown[][]> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || "";
  const project = phProject();
  if (!apiKey || !project) return [];
  const res = await fetch(`${PH_HOST}/api/projects/${project}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    cache: "no-store",
  });
  if (!res.ok) return [];
  return ((await res.json()).results ?? []) as unknown[][];
}

const dt = (iso: string) => `toDateTime('${iso.slice(0, 19).replace("T", " ")}')`;
const isoOk = (s: string | null) => !!s && /^[\dT:.\-+Z ]+$/.test(s);

function windowQuery(start: string, end: string): string {
  return `
    SELECT
      uniqIf(person_id, event = '$pageview') AS visitors,
      countIf(event = 'lm_submitted') AS lm_signups,
      countIf(event = 'application_started') AS ht_leads,
      countIf(event = 'application_submitted') AS apps_submitted,
      countIf(event = 'qualify_form_submitted') AS qualified,
      countIf(event = 'book_page_viewed') AS book_views,
      countIf(event = 'call_booked') AS booked,
      countIf(event = 'book_fallback_requested') AS callbacks,
      countIf(event = 'lm_submitted' AND person_id IN (
        SELECT DISTINCT person_id FROM events
        WHERE event = 'application_started'
          AND timestamp >= ${dt(start)} AND timestamp < ${dt(end)}
      )) AS crossover
    FROM events
    WHERE timestamp >= ${dt(start)} AND timestamp < ${dt(end)}
  `;
}

const KEYS = ["visitors", "lm_signups", "ht_leads", "apps_submitted", "qualified", "book_views", "booked", "callbacks", "crossover"] as const;

export async function GET(req: NextRequest) {
  if (!isAuthed(req.cookies.get("ba_auth")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const endParam = req.nextUrl.searchParams.get("end") || req.nextUrl.searchParams.get("since");
  const nowIso = new Date().toISOString();
  const DAY = 86_400_000;
  const end = isoOk(endParam) ? (endParam as string) : nowIso;
  const endMs = Date.parse(end);
  const start = new Date(endMs - DAY).toISOString();
  const prevStart = new Date(endMs - 2 * DAY).toISOString();

  const [curRows, prevRows, revenue] = await Promise.all([
    hogql(windowQuery(start, end)),
    hogql(windowQuery(prevStart, start)),
    revenueWithin(Math.floor(Date.parse(start) / 1000), Math.floor(endMs / 1000)).catch(() => null),
  ]);

  const toObj = (rows: unknown[][]) => {
    const row = rows[0] ?? [];
    const o: Record<string, number> = {};
    KEYS.forEach((k, i) => (o[k] = Number(row[i] ?? 0)));
    return o;
  };

  return NextResponse.json({
    start, end,
    now: nowIso,
    windowHours: Math.round((endMs - Date.parse(start)) / 3_600_000),
    current: toObj(curRows),
    previous: toObj(prevRows),
    revenue,
  });
}
