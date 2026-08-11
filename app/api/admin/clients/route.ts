import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getActiveClients } from "@/lib/airtable";
import { getAllClientStates, upsertClientState, type ClientStateFields } from "@/lib/vtc-clients";
import { getAllVideos, stagesFor, currentStage, type VtcVideo } from "@/lib/vtc-videos";

// AM client-health board. Admin sees everyone; an account manager (team_role
// 'am') sees their own pod. Merges Airtable client identity (read-only) with the
// Supabase operational overlay (health/owner/status) + live video signals.

export const dynamic = "force-dynamic";

async function requireAmOrAdmin() {
  const auth = await getAuthUser();
  if (!auth) return null;
  if (auth.role === "admin" || auth.teamRole === "am") return auth;
  return null;
}

interface VideoSignal { total: number; active: number; waitingOnClient: number; currentStages: string[]; }

function signalFor(videos: VtcVideo[]): VideoSignal {
  let active = 0, waiting = 0;
  const stages: string[] = [];
  for (const v of videos) {
    const list = stagesFor(v);
    const cur = currentStage(list, v.progress);
    if (cur) {
      active++;
      stages.push(cur.label);
      if (cur.actor === "client") waiting++;
    }
  }
  return { total: videos.length, active, waitingOnClient: waiting, currentStages: stages };
}

export async function GET() {
  const auth = await requireAmOrAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const isAdmin = auth.role === "admin";
  const me = auth.email.toLowerCase().trim();

  const [clients, states, videos] = await Promise.all([
    getActiveClients().catch(() => []),
    getAllClientStates(),
    getAllVideos(),
  ]);

  // Group videos by client email.
  const byClient = new Map<string, VtcVideo[]>();
  for (const v of videos) {
    const k = v.client_email.toLowerCase();
    (byClient.get(k) ?? byClient.set(k, []).get(k)!).push(v);
  }

  const rows = clients
    .map((c) => {
      const email = (c.fields.Email ?? "").toLowerCase().trim();
      const st = states.get(email);
      return {
        email,
        name: c.fields.Name ?? email,
        plan: st?.plan ?? c.fields["Client Plan"] ?? null,
        deliveryStatus: c.fields["Delivery Status (manual update)"] ?? null,
        slackChannelId: st?.slack_channel_id ?? c.fields["Slack Channel ID"] ?? null,
        accountManager: st?.account_manager_email ?? null,
        health: st?.health ?? "healthy",
        status: st?.status ?? "active",
        signal: signalFor(byClient.get(email) ?? []),
      };
    })
    .filter((r) => r.email)
    .filter((r) => (isAdmin ? true : r.accountManager === me));

  return NextResponse.json({ isAdmin, me, rows });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAmOrAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { email?: string; health?: string; accountManagerEmail?: string | null; status?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!body.email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const fields: ClientStateFields = {};
  if (body.health) fields.health = body.health as ClientStateFields["health"];
  if (body.status) fields.status = body.status as ClientStateFields["status"];
  if (body.accountManagerEmail !== undefined) {
    fields.account_manager_email = body.accountManagerEmail ? body.accountManagerEmail.toLowerCase().trim() : null;
  }
  const saved = await upsertClientState(body.email, fields);
  return NextResponse.json({ client: saved });
}
