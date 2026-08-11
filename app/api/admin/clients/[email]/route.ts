import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getClientFullByEmail } from "@/lib/airtable";
import { getAllClientStates } from "@/lib/vtc-clients";
import { getClientVideos, stagesFor, currentStage } from "@/lib/vtc-videos";
import { getSlaHours } from "@/lib/vtc-settings";
import { computeSla } from "@/lib/vtc-sla";

// Full client drill-down for the AM board: operational state + their videos +
// everything Airtable holds (incl. the onboarding form answers). Admin sees
// any client; an AM sees clients in their pod.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || (auth.role !== "admin" && auth.teamRole !== "am")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const email = decodeURIComponent(req.nextUrl.pathname.split("/").pop() || "").toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const [full, states, videos, slaHours] = await Promise.all([
    getClientFullByEmail(email).catch(() => null),
    getAllClientStates(),
    getClientVideos(email),
    getSlaHours(),
  ]);
  const state = states.get(email) ?? null;

  // AM may only view their own pod.
  if (auth.role !== "admin" && state?.account_manager_email !== auth.email.toLowerCase().trim()) {
    return NextResponse.json({ error: "Not in your pod" }, { status: 403 });
  }

  const rawFields = (full?.fields ?? {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    fields[k] = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  }

  const vids = videos.map((v) => {
    const stages = stagesFor(v);
    const cur = currentStage(stages, v.progress);
    return { ...v, stages, currentKey: cur?.key ?? null, sla: computeSla(v, stages, cur?.key ?? null, slaHours) };
  });

  return NextResponse.json({
    email,
    name: (rawFields.Name as string) ?? email,
    plan: state?.plan ?? (rawFields["Client Plan"] as string) ?? null,
    health: state?.health ?? "healthy",
    status: state?.status ?? "active",
    accountManager: state?.account_manager_email ?? null,
    fields,
    videos: vids,
  });
}
