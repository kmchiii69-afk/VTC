import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { notifySlack } from "@/lib/slack";
import {
  getAllVideos,
  getVideo,
  createVideo,
  patchVideo,
  deleteVideo,
  isCheckpointDone,
  withCheckpoint,
  TOTAL_CHECKPOINTS,
  type VideoFields,
} from "@/lib/vtc-videos";

// Team-facing production pipeline. Admin only. GET all videos; POST create a
// new video for a client; PATCH advances team-owned checkpoints (post script,
// mark editing, deliver) or overrides any checkpoint; DELETE removes a video.

async function requireAdmin() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== "admin") return null;
  return auth;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const videos = await getAllVideos();
  return NextResponse.json({ videos });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { clientEmail?: string; title?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const clientEmail = (body.clientEmail ?? "").trim();
  if (!clientEmail) return NextResponse.json({ error: "clientEmail is required" }, { status: 400 });
  const video = await createVideo(clientEmail, body.title ?? "Untitled video");
  return NextResponse.json({ video });
}

type PatchAction = "post_script" | "set_editing" | "deliver" | "set_checkpoint" | "update";

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: {
    videoId?: string;
    action?: PatchAction;
    scriptUrl?: string;
    scriptNote?: string;
    finalUrl?: string;
    title?: string;
    index?: number;
    done?: boolean;
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
  const p = video.progress;
  let updates: VideoFields;
  let slack = "";

  switch (action) {
    case "post_script":
      updates = {
        script_url: (body.scriptUrl ?? "").trim() || null,
        script_note: (body.scriptNote ?? "").trim() || null,
        progress: withCheckpoint(p, 0, true, "team"),
      };
      slack = `📝 Script posted for “${video.title}” (${video.client_email}).`;
      break;
    case "set_editing":
      if (!isCheckpointDone(p, 3)) return NextResponse.json({ error: "No recording uploaded yet." }, { status: 409 });
      updates = { progress: withCheckpoint(p, 4, true, "team") };
      slack = `✂️ Editing started for “${video.title}” (${video.client_email}).`;
      break;
    case "deliver":
      updates = {
        final_url: (body.finalUrl ?? "").trim() || null,
        progress: withCheckpoint(p, 5, true, "team"),
      };
      slack = `🚀 Delivered “${video.title}” to ${video.client_email}.`;
      break;
    case "set_checkpoint": {
      const i = body.index;
      if (typeof i !== "number" || i < 0 || i >= TOTAL_CHECKPOINTS) {
        return NextResponse.json({ error: "index out of range" }, { status: 400 });
      }
      updates = { progress: withCheckpoint(p, i, body.done !== false, "team") };
      break;
    }
    case "update":
      updates = {};
      if (typeof body.title === "string") updates.title = body.title.trim() || "Untitled video";
      if (typeof body.scriptUrl === "string") updates.script_url = body.scriptUrl.trim() || null;
      if (typeof body.scriptNote === "string") updates.script_note = body.scriptNote.trim() || null;
      if (typeof body.finalUrl === "string") updates.final_url = body.finalUrl.trim() || null;
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const saved = await patchVideo(videoId, updates);
  if (slack) await notifySlack(slack);
  return NextResponse.json({ video: saved });
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
