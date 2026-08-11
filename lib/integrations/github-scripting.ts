// PLACEHOLDER — GitHub scripting bot (Harris's AI script generation: a GitHub
// library of his scripting method driving Claude; Harris then QA's the output).
//
// Not wired yet. This stub defines the call the app makes when a script is
// assigned so scripting can be auto-kicked-off later; for now the scriptwriter
// still posts the finished script URL manually via the admin board.
// TODO: dispatch a GitHub Action / call the bot with the brief + client
// context, receive the drafted script back, attach it for QA.

export interface ScriptDraft {
  draftUrl: string | null;
  status: "queued" | "drafting" | "ready";
}

// Request an AI first-draft for a video's script. Placeholder returns queued.
export async function requestScriptDraft(videoId: string): Promise<ScriptDraft> {
  // TODO: trigger the GitHub scripting bot with the brief/context for videoId.
  return { draftUrl: null, status: "queued" };
}

export const GITHUB_SCRIPTING_ENABLED = false; // flip when the bot is wired
