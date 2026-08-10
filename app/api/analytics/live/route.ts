// GET /api/analytics/live?after=<iso>
//
// Real-time funnel feed. Returns recent BA funnel events (newest first).
// With ?after=<iso> returns only events newer than that timestamp.

import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/analytics-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  if (!isAuthed(req.cookies.get("ba_auth")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const after = req.nextUrl.searchParams.get("after");
  const afterClause = after && /^[\dT:.\-+Z ]+$/.test(after) ? `AND timestamp > toDateTime('${after.slice(0, 19).replace("T", " ")}')` : "";

  const rows = await hogql(`
    SELECT
      event,
      toString(timestamp) AS ts,
      coalesce(nullIf(properties.email, ''), nullIf(person.properties.email, ''), '') AS email,
      coalesce(properties.first_name, person.properties.first_name, '') AS first_name,
      coalesce(properties.$geoip_country_code, '') AS country
    FROM events
    WHERE timestamp >= now() - INTERVAL 3 DAY
      AND event IN (
        'lm_submitted',
        'lm_content_viewed',
        'application_started',
        'application_submitted',
        'qualify_form_submitted',
        'book_page_viewed',
        'book_fallback_requested',
        'call_booked'
      )
      ${afterClause}
    ORDER BY timestamp DESC
    LIMIT 80
  `);

  const mask = (email: string) => {
    if (!email || !email.includes("@")) return "";
    const [u, d] = email.split("@");
    return `${u.slice(0, 3)}***@${d}`;
  };

  const events = rows.map((r) => {
    const [event, ts, email, firstName, country] = r as string[];
    return {
      event,
      ts,
      who: (firstName && String(firstName).trim()) || mask(String(email)) || "someone",
      country: String(country || ""),
    };
  });

  return NextResponse.json({ events, now: new Date().toISOString() });
}
