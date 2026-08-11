import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { notifySlack } from "@/lib/slack";
import {
  getClientVideos,
  getVideo,
  patchVideo,
  stagesFor,
  currentStage,
  withStage,
  type VtcVideo,
  type VideoFields,
} from "@/lib/vtc-videos";

// Client-facing pipeline. GET lists the signed-in client's videos with each
// one's computed stage list; POST advances one of THEIR stages (interview,
// record, client_review) with server-side order validation.

export const dynamic = "force-dynamic";

function withStages(v: VtcVideo) {
  return { ...v, stages: stagesFor(v) };
}

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const videos = await getClientVideos(auth.email);
  return NextResponse.json({ videos: videos.map(withStages) });
}

type Action = "complete_interview" | "submit_footage" | "approve_video" | "request_changes";

export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { videoId?: string; action?: Action; url?: string; note?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const { videoId, action } = body;
  if (!videoId || !action) {
    return NextResponse.json({ error: "videoId and action are required" }, { status: 400 });
  }

  const video = await getVideo(videoId);
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (auth.role !== "admin" && video.client_email !== auth.email.toLowerCase().trim()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const list = stagesFor(video);
  const cur = currentStage(list, video.progress);
  if (!cur || cur.actor !== "client") {
    return NextResponse.json({ error: "It's not your turn on this video right now." }, { status: 409 });
  }

  let updates: VideoFields;
  let slack: string;

  switch (action) {
    case "complete_interview":
      if (cur.key !== "interview") return NextResponse.json({ error: "No interview is due." }, { status: 409 });
      updates = { progress: withStage(list, video.progress, "interview", true, "client") };
      slack = `📝 *${video.client_email}* completed the interview for “${video.title}”.`;
      break;
    case "submit_footage": {
      if (cur.key !== "record") return NextResponse.json({ error: "You can't submit footage yet." }, { status: 409 });
      const link = (body.url ?? "").trim();
      if (!/^https?:\/\//i.test(link)) {
        return NextResponse.json({ error: "Enter a valid link (https://…)." }, { status: 400 });
      }
      updates = { recording_url: link, progress: withStage(list, video.progress, "record", true, "client") };
      slack = `🎬 *${video.client_email}* submitted footage for “${video.title}”: ${link}`;
      break;
    }
    case "approve_video":
      if (cur.key !== "client_review") return NextResponse.json({ error: "Nothing to review yet." }, { status: 409 });
      updates = { progress: withStage(list, video.progress, "client_review", true, "client") };
      slack = `✅ *${video.client_email}* approved “${video.title}”.`;
      break;
    case "request_changes": {
      if (cur.key !== "client_review") return NextResponse.json({ error: "Nothing to review yet." }, { status: 409 });
      const note = (body.note ?? "").trim();
      updates = {
        status_note: note ? `Changes requested: ${note}` : "Changes requested",
        progress: withStage(list, video.progress, "client_review", true, "client"),
      };
      slack = `✏️ *${video.client_email}* requested changes on “${video.title}”: ${note || "(no note)"}`;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const saved = await patchVideo(videoId, updates);
  await notifySlack(slack);
  return NextResponse.json({ video: withStages(saved) });
}
