import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getSlaHours, setSlaHours } from "@/lib/vtc-settings";
import { STAGES } from "@/lib/vtc-videos";

// Owner stage/SLA editor. GET returns the stage list + current SLA hours;
// PATCH saves SLA-hour overrides. Admin only.

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const auth = await getAuthUser();
  return auth && auth.role === "admin" ? auth : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const slaHours = await getSlaHours();
  const stages = STAGES.map((s) => ({ key: s.key, label: s.label, owner: s.owner, actor: s.actor }));
  return NextResponse.json({ stages, slaHours });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { slaHours?: Record<string, number> } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!body.slaHours || typeof body.slaHours !== "object") {
    return NextResponse.json({ error: "slaHours required" }, { status: 400 });
  }
  // Coerce to positive numbers.
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.slaHours)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) clean[k] = n;
  }
  await setSlaHours(clean);
  return NextResponse.json({ slaHours: await getSlaHours() });
}
