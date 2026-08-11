import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { notifySlack } from "@/lib/slack";
import { getActiveClients } from "@/lib/airtable";
import { getAllClientStates } from "@/lib/vtc-clients";
import { getAllVideos, stagesFor, currentStage, type VtcVideo } from "@/lib/vtc-videos";
import { getSlaHours } from "@/lib/vtc-settings";
import { computeSla, worstStatus, healthFromStatus, worseHealth } from "@/lib/vtc-sla";

// End-of-day digest: every client that's at-risk/Defcon, grouped by account
// manager, posted to Slack. Runs on a Vercel cron (secured by CRON_SECRET) or
// on demand by an admin (the "Send EOD report" button on the health board).

export const dynamic = "force-dynamic";

async function authorized(req: NextRequest): Promise<boolean> {
  const bearer = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return true;
  const auth = await getAuthUser();
  return !!auth && auth.role === "admin";
}

async function build() {
  const [clients, states, videos, slaHours] = await Promise.all([
    getActiveClients().catch(() => []),
    getAllClientStates(),
    getAllVideos(),
    getSlaHours(),
  ]);
  const byClient = new Map<string, VtcVideo[]>();
  for (const v of videos) {
    const k = v.client_email.toLowerCase();
    (byClient.get(k) ?? byClient.set(k, []).get(k)!).push(v);
  }

  // email -> { name, am, health, overdue, atRisk }
  const flagged: { name: string; am: string; health: string; overdue: number; atRisk: number }[] = [];
  for (const c of clients) {
    const email = (c.fields.Email ?? "").toLowerCase().trim();
    if (!email) continue;
    const vids = byClient.get(email) ?? [];
    const statuses = vids.map((v) => {
      const ordered = stagesFor(v);
      const cur = currentStage(ordered, v.progress);
      return cur ? computeSla(v, ordered, cur.key, slaHours).status : "none";
    });
    const manual = states.get(email)?.health ?? "healthy";
    const health = worseHealth(manual, healthFromStatus(worstStatus(statuses)));
    if (health === "healthy") continue;
    flagged.push({
      name: c.fields.Name ?? email,
      am: states.get(email)?.account_manager_email ?? "Unassigned",
      health,
      overdue: statuses.filter((s) => s === "overdue").length,
      atRisk: statuses.filter((s) => s === "at_risk").length,
    });
  }

  // Group by AM.
  const byAm = new Map<string, typeof flagged>();
  for (const f of flagged) (byAm.get(f.am) ?? byAm.set(f.am, []).get(f.am)!).push(f);

  const emoji = (h: string) => (h === "defcon" ? "🔴" : "🟡");
  let text = `📊 *VTC — end-of-day health*\n${flagged.length} client${flagged.length === 1 ? "" : "s"} need attention.`;
  for (const [am, list] of byAm) {
    list.sort((a, b) => (a.health === "defcon" ? -1 : 1) - (b.health === "defcon" ? -1 : 1));
    text += `\n\n*${am === "Unassigned" ? "Unassigned" : am}* — ${list.length}`;
    for (const f of list) {
      const bits = [f.overdue ? `${f.overdue} overdue` : "", f.atRisk ? `${f.atRisk} at risk` : ""].filter(Boolean).join(", ");
      text += `\n${emoji(f.health)} ${f.name}${bits ? ` — ${bits}` : ""}`;
    }
  }
  if (flagged.length === 0) text = "✅ *VTC — end-of-day health*\nAll clients healthy. Nothing at risk.";
  return { text, flagged: flagged.length };
}

async function run(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { text, flagged } = await build();
  await notifySlack(text);
  return NextResponse.json({ ok: true, flagged, preview: text });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
