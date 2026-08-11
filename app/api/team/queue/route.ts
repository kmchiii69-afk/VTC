import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { notifySlack } from "@/lib/slack";
import { isTeamRole } from "@/lib/vtc-roles";
import {
  getAllVideos,
  getVideo,
  patchVideo,
  stagesFor,
  currentStage,
  isStageDone,
  withStage,
  type VtcVideo,
  type StageKey,
} from "@/lib/vtc-videos";

// "My work" queue for an internal seat. GET returns the videos waiting on this
// seat now + coming up. POST advances a stage this seat owns (or sets a status
// note / claims a video). Admins act across all seats.

export const dynamic = "force-dynamic";

async function requireSeat() {
  const auth = await getAuthUser();
  if (!auth) return null;
  if (auth.role === "admin" || isTeamRole(auth.teamRole)) return auth;
  return null;
}

// Does this seat own a given stage owner? Admins own everything.
function seatOwns(role: string | null | undefined, isAdmin: boolean, owner: string) {
  return isAdmin || role === owner;
}

function shape(v: VtcVideo) {
  const stages = stagesFor(v);
  const cur = currentStage(stages, v.progress);
  return { ...v, stages, currentKey: cur?.key ?? null };
}

export async function GET(req: NextRequest) {
  const auth = await requireSeat();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const isAdmin = auth.role === "admin";
  const role = auth.teamRole ?? null;
  const email = auth.email.toLowerCase().trim();
  // Admin may focus a specific seat via ?role=
  const focus = isAdmin ? new URL(req.url).searchParams.get("role") : role;

  const all = await getAllVideos();
  const needsAction: ReturnType<typeof shape>[] = [];
  const upcoming: ReturnType<typeof shape>[] = [];

  for (const v of all) {
    const stages = stagesFor(v);
    const cur = currentStage(stages, v.progress);
    if (!cur) continue; // delivered

    const mineNow =
      cur.actor === "team" &&
      (focus ? cur.owner === focus : seatOwns(role, isAdmin, cur.owner)) &&
      // assigned to me, or unclaimed (so I can pick it up)
      (!v.assignees[cur.owner] || v.assignees[cur.owner] === email || isAdmin);
    if (mineNow) {
      needsAction.push(shape(v));
      continue;
    }
    // Coming up: a later team stage I own that isn't done yet.
    const laterMine = stages.some(
      (s) =>
        !isStageDone(v.progress, s.key) &&
        s.actor === "team" &&
        (focus ? s.owner === focus : seatOwns(role, isAdmin, s.owner)) &&
        (!v.assignees[s.owner] || v.assignees[s.owner] === email || isAdmin),
    );
    if (laterMine) upcoming.push(shape(v));
  }

  return NextResponse.json({ role: focus ?? role, needsAction, upcoming });
}

export async function POST(req: NextRequest) {
  const auth = await requireSeat();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const isAdmin = auth.role === "admin";
  const role = auth.teamRole ?? null;
  const email = auth.email.toLowerCase().trim();

  let body: { videoId?: string; action?: "complete" | "claim" | "set_status"; note?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const { videoId, action } = body;
  if (!videoId || !action) return NextResponse.json({ error: "videoId and action required" }, { status: 400 });

  const video = await getVideo(videoId);
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  const stages = stagesFor(video);
  const cur = currentStage(stages, video.progress);
  if (!cur) return NextResponse.json({ error: "This video is already delivered." }, { status: 409 });
  if (cur.actor !== "team" || !seatOwns(role, isAdmin, cur.owner)) {
    return NextResponse.json({ error: "This stage isn't yours to action." }, { status: 403 });
  }

  if (action === "claim") {
    const saved = await patchVideo(videoId, { assignees: { ...video.assignees, [cur.owner]: email } });
    return NextResponse.json({ video: shape(saved) });
  }
  if (action === "set_status") {
    const saved = await patchVideo(videoId, { status_note: (body.note ?? "").trim() || null });
    return NextResponse.json({ video: shape(saved) });
  }
  // complete
  const saved = await patchVideo(videoId, {
    progress: withStage(stages, video.progress, cur.key as StageKey, true, role ?? "team"),
  });
  await notifySlack(`✅ ${cur.label} done on “${video.title}” (${video.client_email}) by ${email}.`);
  return NextResponse.json({ video: shape(saved) });
}
