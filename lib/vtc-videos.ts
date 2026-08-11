// VTC production pipeline data layer (Supabase). One row per video moving
// through the DFY checkpoints. Airtable is read-only elsewhere; all pipeline
// STATE is owned here so clients + team can advance it. See supabase/vtc_videos.sql.

import { db, isMissingTable } from "@/lib/kv";

export const VIDEOS_TABLE = "vtc_videos";

export type CheckpointOwner = "team" | "client";
export interface Checkpoint {
  id: number;
  label: string;
  owner: CheckpointOwner;
  hint: string;
}

// The canonical 6-stage pipeline. Order is the source of truth for locking.
export const CHECKPOINTS: Checkpoint[] = [
  { id: 0, label: "Script Ready", owner: "team", hint: "Your team writes and posts the script." },
  { id: 1, label: "Script Approved", owner: "client", hint: "Review the script and approve it (or request changes)." },
  { id: 2, label: "Recorded", owner: "client", hint: "Record your video following the approved script." },
  { id: 3, label: "Recording Uploaded", owner: "client", hint: "Paste a share link to your raw recording." },
  { id: 4, label: "Editing", owner: "team", hint: "Your team edits the footage." },
  { id: 5, label: "Delivered", owner: "team", hint: "Final video delivered / published." },
];
export const TOTAL_CHECKPOINTS = CHECKPOINTS.length;

export type Progress = Record<string, { done: true; at: string; by: string }>;

export interface VtcVideo {
  id: string;
  client_email: string;
  title: string;
  script_url: string | null;
  script_note: string | null;
  recording_url: string | null;
  final_url: string | null;
  progress: Progress;
  created_at: string;
  updated_at: string;
}

export type VideoFields = Partial<
  Pick<VtcVideo, "title" | "script_url" | "script_note" | "recording_url" | "final_url" | "progress">
>;

// ── Checkpoint helpers ─────────────────────────────────────────────────────
export function isCheckpointDone(p: Progress, i: number): boolean {
  return !!p[String(i)]?.done;
}
// Number of consecutive completed checkpoints from the start — the "current stage".
export function completedCount(p: Progress): number {
  let n = 0;
  for (let i = 0; i < TOTAL_CHECKPOINTS; i++) {
    if (isCheckpointDone(p, i)) n++;
    else break;
  }
  return n;
}
// A checkpoint is actionable only once the one before it is done.
export function isCheckpointUnlocked(p: Progress, i: number): boolean {
  return i === 0 ? true : isCheckpointDone(p, i - 1);
}
// Set/clear a checkpoint. Clearing cascades forward so there are never gaps.
export function withCheckpoint(p: Progress, i: number, done: boolean, by: string): Progress {
  const next: Progress = { ...p };
  if (done) {
    next[String(i)] = { done: true, at: new Date().toISOString(), by };
  } else {
    for (let k = i; k < TOTAL_CHECKPOINTS; k++) delete next[String(k)];
  }
  return next;
}

// ── Persistence ────────────────────────────────────────────────────────────
function normalize(row: Record<string, unknown>): VtcVideo {
  return {
    id: String(row.id),
    client_email: String(row.client_email ?? ""),
    title: (row.title as string) ?? "Untitled video",
    script_url: (row.script_url as string) ?? null,
    script_note: (row.script_note as string) ?? null,
    recording_url: (row.recording_url as string) ?? null,
    final_url: (row.final_url as string) ?? null,
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
    if (isMissingTable(e)) return []; // migration not run yet
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

export async function createVideo(clientEmail: string, title: string): Promise<VtcVideo> {
  const { data, error } = await db()
    .from(VIDEOS_TABLE)
    .insert({ client_email: clientEmail.toLowerCase().trim(), title: title || "Untitled video", progress: {} })
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
