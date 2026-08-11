import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getActiveClients } from "@/lib/airtable";
import { getAllClientStates } from "@/lib/vtc-clients";
import { getAllVideos, stagesFor, currentStage, type VtcVideo } from "@/lib/vtc-videos";
import { getWeek, upsertWeek, mondayOf, videosPerWeekFromPlan } from "@/lib/vtc-weekly";

// Weekly CSM tracker board. Admin sees all; an AM sees their pod. Backlog =
// videos sitting ready-to-upload (buffer); Needed = cadence − backlog.

export const dynamic = "force-dynamic";

async function requireAmOrAdmin() {
  const auth = await getAuthUser();
  if (!auth) return null;
  if (auth.role === "admin" || auth.teamRole === "am") return auth;
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAmOrAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const isAdmin = auth.role === "admin";
  const me = auth.email.toLowerCase().trim();
  const weekStart = req.nextUrl.searchParams.get("week") || mondayOf();

  const [clients, states, videos, week] = await Promise.all([
    getActiveClients().catch(() => []),
    getAllClientStates(),
    getAllVideos(),
    getWeek(weekStart),
  ]);

  const byClient = new Map<string, VtcVideo[]>();
  for (const v of videos) {
    const k = v.client_email.toLowerCase();
    (byClient.get(k) ?? byClient.set(k, []).get(k)!).push(v);
  }

  const rows = clients
    .map((c) => {
      const email = (c.fields.Email ?? "").toLowerCase().trim();
      const st = states.get(email);
      const plan = st?.plan ?? c.fields["Client Plan"] ?? null;
      const vpw = st?.videos_per_week && st.videos_per_week > 0 ? st.videos_per_week : videosPerWeekFromPlan(plan);
      // Backlog = videos ready to upload (buffer awaiting publish).
      const vids = byClient.get(email) ?? [];
      let backlog = 0;
      for (const v of vids) {
        const cur = currentStage(stagesFor(v), v.progress);
        if (cur?.key === "published") backlog++;
      }
      const wk = week.get(email);
      return {
        email,
        name: c.fields.Name ?? email,
        plan,
        accountManager: st?.account_manager_email ?? null,
        videosPerWeek: vpw,
        backlog,
        needed: Math.max(0, vpw - backlog),
        days: wk?.days ?? {},
        posted: wk?.posted ?? "",
      };
    })
    .filter((r) => r.email)
    .filter((r) => (isAdmin ? true : r.accountManager === me));

  return NextResponse.json({ weekStart, isAdmin, rows });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAmOrAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { clientEmail?: string; weekStart?: string; day?: string; value?: string; posted?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!body.clientEmail || !body.weekStart) return NextResponse.json({ error: "clientEmail and weekStart required" }, { status: 400 });
  const row = await upsertWeek(body.clientEmail, body.weekStart, { day: body.day, value: body.value, posted: body.posted });
  return NextResponse.json({ row });
}
