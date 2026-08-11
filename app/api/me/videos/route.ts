import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { notifySlack } from "@/lib/slack";
import {
  CHECKPOINTS,
  getClientVideos,
  getVideo,
  patchVideo,
  isCheckpointDone,
  withCheckpoint,
  type VideoFields,
} from "@/lib/vtc-videos";

// Client-facing production pipeline. GET lists the signed-in client's videos;
// POST advances one of THEIR checkpoints. Team-owned checkpoints (script,
// editing, delivery) are only settable via the admin route. Order is validated
// server-side so a raw API call can't skip ahead.

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const videos = await getClientVideos(auth.email);
  return NextResponse.json({ videos, checkpoints: CHECKPOINTS });
}

type Action = "approve_script" | "mark_recorded" | "submit_recording";

export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { videoId?: string; action?: Action; url?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const { videoId, action, url } = body;
  if (!videoId || !action) {
    return NextResponse.json({ error: "videoId and action are required" }, { status: 400 });
  }

  const video = await getVideo(videoId);
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  // A client may only touch their own videos (admins can act via the admin route).
  if (auth.role !== "admin" && video.client_email !== auth.email.toLowerCase().trim()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const p = video.progress;
  let updates: VideoFields;
  let slack: string;

  switch (action) {
    case "approve_script":
      if (!isCheckpointDone(p, 0)) return NextResponse.json({ error: "Script isn't ready yet." }, { status: 409 });
      updates = { progress: withCheckpoint(p, 1, true, "client") };
      slack = `✅ *${video.client_email}* approved the script for “${video.title}”.`;
      break;
    case "mark_recorded":
      if (!isCheckpointDone(p, 1)) return NextResponse.json({ error: "Approve the script first." }, { status: 409 });
      updates = { progress: withCheckpoint(p, 2, true, "client") };
      slack = `🎬 *${video.client_email}* marked “${video.title}” as recorded.`;
      break;
    case "submit_recording": {
      if (!isCheckpointDone(p, 2)) return NextResponse.json({ error: "Mark it recorded first." }, { status: 409 });
      const link = (url ?? "").trim();
      if (!/^https?:\/\//i.test(link)) {
        return NextResponse.json({ error: "Enter a valid link (https://…)." }, { status: 400 });
      }
      updates = { recording_url: link, progress: withCheckpoint(p, 3, true, "client") };
      slack = `📤 *${video.client_email}* uploaded a recording for “${video.title}”: ${link}`;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const saved = await patchVideo(videoId, updates);
  await notifySlack(slack);
  return NextResponse.json({ video: saved });
}
