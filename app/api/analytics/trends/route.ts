// GET /api/analytics/trends
//
// Long-range growth trends — Whop monthly revenue + weekly PostHog leads +
// SegMetrics attribution + lead magnet ROI. Loaded lazily, cached 1h.

import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/analytics-auth";
import { fetchWhopTrends } from "@/lib/whop";
import { fetchSegAttribution } from "@/lib/segmetrics";
import { fetchLmRoi } from "@/lib/freecourse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PH_HOST = "https://us.i.posthog.com";
const phProject = () => process.env.POSTHOG_PROJECT_ID || "";

async function hogql(query: string): Promise<unknown[][]> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || "";
  const project = phProject();
  if (!apiKey || !project) return [];
  try {
    const res = await fetch(`${PH_HOST}/api/projects/${project}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    return ((await res.json()).results ?? []) as unknown[][];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req.cookies.get("ba_auth")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weeklyQuery = `
    SELECT toStartOfWeek(timestamp) AS wk,
      countIf(event = '$pageview') AS views,
      uniqIf(person_id, event = '$pageview') AS visitors,
      countIf(event = 'lm_submitted') AS lm,
      countIf(event = 'application_started') AS ht,
      countIf(event = 'qualify_form_submitted') AS qualified
    FROM events
    WHERE timestamp >= now() - INTERVAL 84 DAY
    GROUP BY wk ORDER BY wk
  `;

  const [trends, weeklyRows, attribution, lmRoi] = await Promise.all([
    fetchWhopTrends(8).catch(() => null),
    hogql(weeklyQuery),
    fetchSegAttribution().catch(() => null),
    fetchLmRoi(120).catch(() => null),
  ]);

  const weekly = weeklyRows.map((r) => ({
    week: String(r[0] ?? "").slice(0, 10),
    views: Number(r[1] ?? 0),
    visitors: Number(r[2] ?? 0),
    lm: Number(r[3] ?? 0),
    ht: Number(r[4] ?? 0),
    qualified: Number(r[5] ?? 0),
  }));

  return NextResponse.json({
    monthly: trends?.monthly ?? [],
    memberships: trends?.memberships ?? { active: 0, canceled: 0, expired: 0, completed: 0 },
    weekly,
    attribution,
    lmRoi,
  });
}
