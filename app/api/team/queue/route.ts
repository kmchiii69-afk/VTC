import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { notifySlack } from "@/lib/slack";
import { isTeamRole, BOARD_COLUMNS } from "@/lib/vtc-roles";
import {
  STAGES,
  getAllVideos,
  getVideo,
  patchVideo,
  stagesFor,
  currentStage,
  withStage,
  type VtcVideo,
  type StageKey,
  type VideoFields,
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
  const url = new URL(req.url);
  // Admin can focus a seat (?role=) or a client (?client=).
  const focus = isAdmin ? url.searchParams.get("role") : role;
  const clientFilter = (url.searchParams.get("client") || "").toLowerCase().trim();

  // Columns = this seat's slice of the pipeline (admin with no focus sees all).
  const columnKeys = (focus && BOARD_COLUMNS[focus]) || STAGES.map((s) => s.key);
  const columns = columnKeys
    .map((k) => STAGES.find((s) => s.key === k))
    .filter(Boolean)
    .map((s) => ({ key: s!.key, label: s!.label, owner: s!.owner, actor: s!.actor }));

  const all = await getAllVideos();
  const videos = [];
  for (const v of all) {
    if (clientFilter && v.client_email.toLowerCase() !== clientFilter) continue;
    const stages = stagesFor(v);
    const cur = currentStage(stages, v.progress);
    if (!cur) continue; // delivered — off the boards
    if (!columnKeys.includes(cur.key)) continue; // outside this seat's remit

    // Which videos this seat sees: assigned to them, or currently in a stage
    // their role owns (claimable). Admin sees everything in the columns.
    const owned = focus ? cur.owner === focus : seatOwns(role, isAdmin, cur.owner);
    const assignedToMe = focus ? v.assignees[focus] === email : role ? v.assignees[role] === email : false;
    if (!isAdmin && !assignedToMe && !owned) continue;
    videos.push(shape(v));
  }

  return NextResponse.json({ role: focus ?? role, columns, videos });
}

export async function POST(req: NextRequest) {
  const auth = await requireSeat();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const isAdmin = auth.role === "admin";
  const role = auth.teamRole ?? null;
  const email = auth.email.toLowerCase().trim();

  let body: { videoId?: string; action?: "complete" | "claim" | "set_status" | "set_field" | "add_version"; note?: string; field?: string; value?: string; label?: string; url?: string } = {};
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
  if (action === "set_field") {
    const allow = ["script_url", "script_note", "brief_url", "reference_url", "due_date"];
    if (!body.field || !allow.includes(body.field)) return NextResponse.json({ error: "field not allowed" }, { status: 400 });
    const saved = await patchVideo(videoId, { [body.field]: (body.value ?? "").trim() || null } as VideoFields);
    return NextResponse.json({ video: shape(saved) });
  }
  if (action === "add_version") {
    if (!body.label) return NextResponse.json({ error: "label required" }, { status: 400 });
    const saved = await patchVideo(videoId, { versions: { ...video.versions, [body.label]: (body.url ?? "").trim() } });
    return NextResponse.json({ video: shape(saved) });
  }
  // complete
  const saved = await patchVideo(videoId, {
    progress: withStage(stages, video.progress, cur.key as StageKey, true, role ?? "team"),
  });
  await notifySlack(`✅ ${cur.label} done on “${video.title}” (${video.client_email}) by ${email}.`);
  return NextResponse.json({ video: shape(saved) });
}
