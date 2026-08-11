import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { notifySlack } from "@/lib/slack";
import {
  getAllVideos,
  getVideo,
  createVideo,
  patchVideo,
  deleteVideo,
  stagesFor,
  withStage,
  type StageKey,
  type ScriptType,
  type VtcVideo,
  type VideoFields,
  type Progress,
} from "@/lib/vtc-videos";

// Team/admin pipeline board. Admin only (Pass 1 — team-role gating comes with
// /team). Create videos, assign seats, advance team-owned stages, post the
// script, attach versions, deliver.

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== "admin") return null;
  return auth;
}

function withStages(v: VtcVideo) {
  return { ...v, stages: stagesFor(v) };
}

// Complete every stage up through `key` (backfilling gaps), preserving existing
// completion stamps — keeps the progress prefix gap-free for admin overrides.
function completeThrough(video: VtcVideo, key: StageKey): Progress {
  const list = stagesFor(video);
  let p = { ...video.progress };
  for (const s of list) {
    if (!p[s.key]) p = withStage(list, p, s.key, true, "team");
    if (s.key === key) break;
  }
  return p;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const videos = await getAllVideos();
  return NextResponse.json({ videos: videos.map(withStages) });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { clientEmail?: string; title?: string; scriptType?: ScriptType; dfy?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const clientEmail = (body.clientEmail ?? "").trim();
  if (!clientEmail) return NextResponse.json({ error: "clientEmail is required" }, { status: 400 });
  const video = await createVideo({
    clientEmail,
    title: body.title ?? "Untitled video",
    scriptType: body.scriptType,
    dfy: body.dfy,
  });
  return NextResponse.json({ video: withStages(video) });
}

type PatchAction =
  | "complete_stage" | "reopen_stage" | "assign" | "post_script"
  | "attach_version" | "set_status" | "set_thumbnail" | "deliver" | "update";

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: {
    videoId?: string; action?: PatchAction; stageKey?: StageKey;
    role?: string; email?: string; scriptUrl?: string; scriptNote?: string;
    label?: string; url?: string; note?: string; stage?: string; finalUrl?: string;
    title?: string; scriptType?: ScriptType; dfy?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const { videoId, action } = body;
  if (!videoId || !action) return NextResponse.json({ error: "videoId and action are required" }, { status: 400 });

  const video = await getVideo(videoId);
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  const list = stagesFor(video);
  let updates: VideoFields;
  let slack = "";

  switch (action) {
    case "complete_stage": {
      if (!body.stageKey) return NextResponse.json({ error: "stageKey required" }, { status: 400 });
      updates = { progress: completeThrough(video, body.stageKey) };
      const lbl = list.find((s) => s.key === body.stageKey)?.label ?? body.stageKey;
      slack = `➡️ “${video.title}” (${video.client_email}) advanced past *${lbl}*.`;
      break;
    }
    case "reopen_stage":
      if (!body.stageKey) return NextResponse.json({ error: "stageKey required" }, { status: 400 });
      updates = { progress: withStage(list, video.progress, body.stageKey, false, "team") };
      break;
    case "assign": {
      if (!body.role) return NextResponse.json({ error: "role required" }, { status: 400 });
      const assignees = { ...video.assignees };
      if (body.email) assignees[body.role] = body.email.toLowerCase().trim();
      else delete assignees[body.role];
      updates = { assignees };
      break;
    }
    case "post_script":
      updates = {
        script_url: (body.scriptUrl ?? "").trim() || null,
        script_note: (body.scriptNote ?? "").trim() || null,
        progress: completeThrough(video, "scripting"),
      };
      slack = `📄 Script posted for “${video.title}” (${video.client_email}).`;
      break;
    case "attach_version": {
      if (!body.label) return NextResponse.json({ error: "label required" }, { status: 400 });
      updates = { versions: { ...video.versions, [body.label]: (body.url ?? "").trim() } };
      break;
    }
    case "set_status":
      updates = { status_note: (body.note ?? "").trim() || null };
      break;
    case "set_thumbnail":
      updates = { thumbnail_stage: (body.stage ?? "").trim() || null };
      break;
    case "deliver":
      updates = {
        final_url: (body.finalUrl ?? "").trim() || null,
        progress: completeThrough(video, "published"),
      };
      slack = `🚀 Delivered “${video.title}” to ${video.client_email}.`;
      break;
    case "update":
      updates = {};
      if (typeof body.title === "string") updates.title = body.title.trim() || "Untitled video";
      if (body.scriptType) updates.script_type = body.scriptType;
      if (typeof body.dfy === "boolean") updates.dfy = body.dfy;
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const saved = await patchVideo(videoId, updates);
  if (slack) await notifySlack(slack);
  return NextResponse.json({ video: withStages(saved) });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { videoId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!body.videoId) return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  await deleteVideo(body.videoId);
  return NextResponse.json({ ok: true });
}
