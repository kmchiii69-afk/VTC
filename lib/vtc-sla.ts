// SLA engine — pure (no DB), so it's safe on client or server. A video's
// current stage has a due time = when it entered the stage + the stage's SLA
// hours. From that we derive on-track / at-risk / overdue. "Entered" is the
// completion time of the previous stage (or the video's creation for stage 0).
//
// v1 uses wall-clock hours (not working-hours). Good enough to flag drift; a
// working-hours refinement can come later.

export const DEFAULT_SLA_HOURS: Record<string, number> = {
  ideas: 24,
  script_assigned: 4,
  interview: 24,
  scripting: 24,
  record: 48,
  footage_qa: 4,
  editing: 48,
  packaging: 24,
  client_review: 24,
  revisions: 24,
  published: 24,
};

export type SlaStatus = "on_track" | "at_risk" | "overdue" | "none";

export const SLA_COLOR: Record<SlaStatus, string> = {
  on_track: "#8FD19E",
  at_risk: "#EACDC2",
  overdue: "#B75D69",
  none: "rgba(255,245,235,0.4)",
};
export const SLA_LABEL: Record<SlaStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  overdue: "Overdue",
  none: "—",
};

interface StageLite { key: string }
interface VideoLite {
  created_at?: string | null;
  progress: Record<string, { done: true; at: string; by: string } | undefined>;
}

// When the current stage started: previous stage's completion, or created_at.
export function stageEnteredAt(video: VideoLite, ordered: StageLite[], stageKey: string): string | null {
  const idx = ordered.findIndex((s) => s.key === stageKey);
  if (idx <= 0) return video.created_at ?? null;
  const prev = ordered[idx - 1];
  return video.progress[prev.key]?.at ?? video.created_at ?? null;
}

export interface Sla {
  status: SlaStatus;
  dueAt: string | null;
  hoursLeft: number | null; // negative = overdue by that many hours
  slaHours: number | null;
}

export function computeSla(
  video: VideoLite,
  ordered: StageLite[],
  currentKey: string | null,
  slaHours: Record<string, number> = DEFAULT_SLA_HOURS,
  now: number = Date.now(),
): Sla {
  if (!currentKey) return { status: "none", dueAt: null, hoursLeft: null, slaHours: null };
  const hrs = slaHours[currentKey] ?? DEFAULT_SLA_HOURS[currentKey] ?? 24;
  const enteredIso = stageEnteredAt(video, ordered, currentKey);
  if (!enteredIso) return { status: "on_track", dueAt: null, hoursLeft: null, slaHours: hrs };
  const entered = new Date(enteredIso).getTime();
  if (Number.isNaN(entered)) return { status: "on_track", dueAt: null, hoursLeft: null, slaHours: hrs };
  const due = entered + hrs * 3600_000;
  const hoursLeft = (due - now) / 3600_000;
  let status: SlaStatus = "on_track";
  if (now > due) status = "overdue";
  else if (hoursLeft < hrs * 0.25) status = "at_risk";
  return { status, dueAt: new Date(due).toISOString(), hoursLeft, slaHours: hrs };
}

// Roll a set of per-video statuses up to the worst one (for client health).
export function worstStatus(list: SlaStatus[]): SlaStatus {
  if (list.includes("overdue")) return "overdue";
  if (list.includes("at_risk")) return "at_risk";
  if (list.some((s) => s === "on_track")) return "on_track";
  return "none";
}
