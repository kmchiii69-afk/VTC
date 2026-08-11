// VTC production pipeline data layer (Supabase). One row per video. Airtable is
// read-only elsewhere; all pipeline STATE lives here. Stages are keyed by name
// (not index) because some stages are conditional (the client interview only
// exists for interview-type scripts; DWY clients get Packaging instead of
// Editing/Revisions). See supabase/vtc_videos.sql and [[project-vtc-pipeline]].

import { db, isMissingTable } from "@/lib/kv";

export const VIDEOS_TABLE = "vtc_videos";

export type StageKey =
  | "ideas"
  | "script_assigned"
  | "interview"
  | "scripting"
  | "record"
  | "footage_qa"
  | "editing"
  | "packaging"
  | "client_review"
  | "revisions"
  | "published";

// Seat that owns a stage (maps to portal_users.team_role; 'am' = account manager).
export type Owner =
  | "client"
  | "strategist"
  | "lead_strategist"
  | "scriptwriter"
  | "qa"
  | "editor"
  | "editor_lead"
  | "ops"
  | "thumbnail"
  | "am";

export interface Stage {
  key: StageKey;
  label: string;
  owner: Owner;
  actor: "client" | "team";
  hint: string;
}

// Canonical master order. stagesFor() filters this per video.
export const STAGES: Stage[] = [
  { key: "ideas", label: "Ideas", owner: "strategist", actor: "team", hint: "We craft your video ideas from your strategy and best-performing formats." },
  { key: "script_assigned", label: "Script Assigned", owner: "strategist", actor: "team", hint: "We lock the ideas and assign your script." },
  { key: "interview", label: "Interview", owner: "client", actor: "client", hint: "Answer a short AI interview so we can write in your voice." },
  { key: "scripting", label: "Scripting", owner: "scriptwriter", actor: "team", hint: "Our team writes and QAs your script." },
  { key: "record", label: "Record", owner: "client", actor: "client", hint: "Your script is ready — record your video and submit the footage." },
  { key: "footage_qa", label: "Footage Review", owner: "qa", actor: "team", hint: "We check your footage meets standard before editing." },
  { key: "editing", label: "Editing", owner: "editor", actor: "team", hint: "Our editors cut V1 → V2 → V3." },
  { key: "packaging", label: "Packaging", owner: "thumbnail", actor: "team", hint: "We package the video — title, thumbnail and upload." },
  { key: "client_review", label: "Your Review", owner: "client", actor: "client", hint: "Review the video and approve it or request changes." },
  { key: "revisions", label: "Revisions", owner: "editor", actor: "team", hint: "We action your feedback." },
  { key: "published", label: "Published", owner: "am", actor: "team", hint: "Your video is live." },
];

// Four real script paths (from the strategist board). "Interview*" types add
// the client-interview stage before scripting.
export type ScriptType = "straight_outline" | "interview_outline" | "straight_script" | "interview_script";

export const SCRIPT_TYPE_LABELS: Record<ScriptType, string> = {
  straight_outline: "Straight to Outline",
  interview_outline: "Interview to Outline",
  straight_script: "Straight to Script",
  interview_script: "Interview to Script",
};
export const SCRIPT_TYPES = Object.keys(SCRIPT_TYPE_LABELS) as ScriptType[];

export type Progress = Record<string, { done: true; at: string; by: string }>;

export interface VtcVideo {
  id: string;
  client_email: string;
  title: string;
  script_type: ScriptType;
  dfy: boolean; // true = we edit (DFY); false = packaging-only (DWY)
  script_url: string | null;
  script_note: string | null;
  reference_url: string | null; // YouTube reference the idea is modelled on
  brief_url: string | null;     // scripting brief link
  due_date: string | null;      // script due (ISO date)
  recording_url: string | null;
  final_url: string | null;
  versions: Record<string, string>; // { V1: url, CRV1: url, ... }
  assignees: Record<string, string>; // { editor: email, scriptwriter: email, ... }
  status_note: string | null;
  thumbnail_stage: string | null; // concept / design / approved (parallel track)
  progress: Progress;
  created_at: string;
  updated_at: string;
}

export type VideoFields = Partial<
  Pick<
    VtcVideo,
    | "title" | "script_type" | "dfy" | "script_url" | "script_note"
    | "reference_url" | "brief_url" | "due_date"
    | "recording_url" | "final_url" | "versions" | "assignees"
    | "status_note" | "thumbnail_stage" | "progress"
  >
>;

// ── Stage helpers ───────────────────────────────────────────────────────────
// The ordered stage list for one video (drops the interview unless needed;
// swaps Editing/Revisions for Packaging on DWY).
export function stagesFor(v: { script_type?: ScriptType | null; dfy?: boolean | null }): Stage[] {
  const isDwy = v.dfy === false;
  return STAGES.filter((s) => {
    if (s.key === "interview") return (v.script_type ?? "").startsWith("interview");
    if (s.key === "editing" || s.key === "revisions") return !isDwy;
    if (s.key === "packaging") return isDwy;
    return true;
  });
}

export function isStageDone(p: Progress, key: StageKey): boolean {
  return !!p[key]?.done;
}
export function completedCount(list: Stage[], p: Progress): number {
  return list.filter((s) => isStageDone(p, s.key)).length;
}
// First stage that isn't complete = where the video currently sits.
export function currentStage(list: Stage[], p: Progress): Stage | null {
  return list.find((s) => !isStageDone(p, s.key)) ?? null;
}
// A stage is actionable only once every earlier stage in the list is done.
export function isStageUnlocked(list: Stage[], p: Progress, key: StageKey): boolean {
  for (const s of list) {
    if (s.key === key) return true;
    if (!isStageDone(p, s.key)) return false;
  }
  return false;
}
// Set/clear a stage. Clearing cascades forward (clears later stages) so the
// progress prefix stays gap-free even when the ordered list is dynamic.
export function withStage(list: Stage[], p: Progress, key: StageKey, done: boolean, by: string): Progress {
  const next: Progress = { ...p };
  if (done) {
    next[key] = { done: true, at: new Date().toISOString(), by };
  } else {
    const idx = list.findIndex((s) => s.key === key);
    if (idx >= 0) for (let i = idx; i < list.length; i++) delete next[list[i].key];
  }
  return next;
}

// ── Persistence ─────────────────────────────────────────────────────────────
function normalize(row: Record<string, unknown>): VtcVideo {
  return {
    id: String(row.id),
    client_email: String(row.client_email ?? ""),
    title: (row.title as string) ?? "Untitled video",
    script_type: ((row.script_type as ScriptType) ?? "straight_outline"),
    dfy: row.dfy === undefined || row.dfy === null ? true : Boolean(row.dfy),
    script_url: (row.script_url as string) ?? null,
    script_note: (row.script_note as string) ?? null,
    reference_url: (row.reference_url as string) ?? null,
    brief_url: (row.brief_url as string) ?? null,
    due_date: (row.due_date as string) ?? null,
    recording_url: (row.recording_url as string) ?? null,
    final_url: (row.final_url as string) ?? null,
    versions: (row.versions as Record<string, string>) ?? {},
    assignees: (row.assignees as Record<string, string>) ?? {},
    status_note: (row.status_note as string) ?? null,
    thumbnail_stage: (row.thumbnail_stage as string) ?? null,
    progress: (row.progress as Progress) ?? {},
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function getClientVideos(email: string): Promise<VtcVideo[]> {
  try {
    const { data, error } = await db()
      .from(VIDEOS_TABLE)
      .select("*")
      .eq("client_email", email.toLowerCase().trim())
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(normalize);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export async function getAllVideos(): Promise<VtcVideo[]> {
  try {
    const { data, error } = await db()
      .from(VIDEOS_TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(normalize);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export async function getVideo(id: string): Promise<VtcVideo | null> {
  const { data, error } = await db().from(VIDEOS_TABLE).select("*").eq("id", id).single();
  if (error && error.code === "PGRST116") return null;
  if (error) throw new Error(error.message);
  return data ? normalize(data as Record<string, unknown>) : null;
}

export async function createVideo(input: {
  clientEmail: string;
  title: string;
  scriptType?: ScriptType;
  dfy?: boolean;
}): Promise<VtcVideo> {
  const { data, error } = await db()
    .from(VIDEOS_TABLE)
    .insert({
      client_email: input.clientEmail.toLowerCase().trim(),
      title: input.title || "Untitled video",
      script_type: input.scriptType ?? "straight_outline",
      dfy: input.dfy ?? true,
      progress: {},
      versions: {},
      assignees: {},
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normalize(data as Record<string, unknown>);
}

export async function patchVideo(id: string, updates: VideoFields): Promise<VtcVideo> {
  const { data, error } = await db()
    .from(VIDEOS_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return normalize(data as Record<string, unknown>);
}

export async function deleteVideo(id: string): Promise<void> {
  const { error } = await db().from(VIDEOS_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
