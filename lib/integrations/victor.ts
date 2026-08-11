// PLACEHOLDER — Victor integration (Slack AI tool on Jake's account that hosts
// client briefs + a custom back-and-forth AI interview, runs crons to detect
// completion, and moves the Airtable stage to "Interviewers Ready").
//
// Not wired yet. These stubs define the surface the app will call so the
// interview stage works end-to-end once Victor exposes an API / webhook.
// TODO: replace with real Victor calls (start interview, poll/receive webhook
// on completion, pull the transcript). Track VICTOR_API_KEY in env when ready.

export interface VictorInterview {
  interviewUrl: string; // where the client answers the AI interview
  transcript: string | null; // populated once complete
  status: "pending" | "complete";
}

// Kick off an interview for a video. Placeholder returns a stub link.
export async function startVictorInterview(videoId: string): Promise<VictorInterview> {
  // TODO: POST to Victor to generate the brief + interview for this video.
  return {
    interviewUrl: `https://victor.placeholder/interview/${videoId}`,
    transcript: null,
    status: "pending",
  };
}

// Poll Victor for interview completion. Placeholder always reports pending.
export async function checkVictorInterview(videoId: string): Promise<VictorInterview> {
  // TODO: GET interview status + transcript from Victor.
  return {
    interviewUrl: `https://victor.placeholder/interview/${videoId}`,
    transcript: null,
    status: "pending",
  };
}

export const VICTOR_ENABLED = false; // flip when the integration is live
