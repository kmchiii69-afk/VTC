// Data access for the onboarding wizard: per-client step completion + the
// onboarded_at flag. Reuses the service-role connection from lib/kv.

import { db, setRoadmapItem } from '@/lib/kv';
import { removeStoredFiles } from '@/lib/storage-cleanup';

const PROGRESS = 'onboarding_progress';
const UPLOADS = 'onboarding_uploads';
const USERS = 'portal_users';

function norm(email: string) {
  return email.toLowerCase().trim();
}

export async function getOnboardingProgress(email: string): Promise<string[]> {
  const { data } = await db()
    .from(PROGRESS)
    .select('step_id')
    .eq('user_email', norm(email));
  return (data ?? []).map((r: { step_id: string }) => r.step_id);
}

// step completions with timestamps, for the CSM onboarding view.
export async function getOnboardingStepCompletions(
  email: string
): Promise<{ stepId: string; completedAt: string }[]> {
  const { data } = await db()
    .from(PROGRESS)
    .select('step_id, completed_at')
    .eq('user_email', norm(email));
  return (data ?? []).map((r: { step_id: string; completed_at: string }) => ({ stepId: r.step_id, completedAt: r.completed_at }));
}

// Mark a step done/undone. Roadmap Phase 0 mirrors onboarding 1:1 (item id ===
// step id), so the same toggle is mirrored into roadmap_progress to keep the
// roadmap's Phase 0 in sync. Best-effort: a mirror failure doesn't fail the step.
export async function setOnboardingStep(
  email: string,
  stepId: string,
  completed: boolean
): Promise<void> {
  const e = norm(email);
  if (completed) {
    await db().from(PROGRESS).upsert(
      { user_email: e, step_id: stepId, completed_at: new Date().toISOString() },
      { onConflict: 'user_email,step_id' }
    );
  } else {
    await db().from(PROGRESS).delete().eq('user_email', e).eq('step_id', stepId);
  }

  await setRoadmapItem(e, stepId, completed).catch(() => {});
}

export async function getOnboardedAt(email: string): Promise<number | null> {
  const { data } = await db()
    .from(USERS)
    .select('onboarded_at')
    .eq('email', norm(email))
    .maybeSingle();
  return (data?.onboarded_at as number | null | undefined) ?? null;
}

export async function setOnboardedAt(email: string, ts: number | null): Promise<void> {
  await db().from(USERS).update({ onboarded_at: ts }).eq('email', norm(email));
}

// For "Existing Client" / "Recent Onboarding" members: skip the wizard by
// marking them onboarded, and complete every onboarding step — which mirrors
// into roadmap Phase 0, so a phase-locked roadmap unlocks Phase 1 normally.
// Idempotent (upserts), so safe to call whenever a skip tag is (re)applied.
export async function seedSkipOnboarding(email: string): Promise<void> {
  const e = norm(email);
  const { stepIdsFor } = await import('@/lib/onboarding-variant');
  // Seed the steps of THEIR onboarding — a Creative Specialist has one step, a
  // standard client the full sequence.
  const { data } = await db().from(USERS).select('features').eq('email', e).maybeSingle();
  const stepIds = stepIdsFor((data?.features as string[] | null) ?? null);
  if (!(await getOnboardedAt(e))) await setOnboardedAt(e, Date.now());
  for (const stepId of stepIds) {
    try { await setOnboardingStep(e, stepId, true); } catch { /* non-fatal */ }
  }
}

export interface OnboardingUpload {
  id: string;
  url: string;
  name: string;
}

// step_id -> list of uploaded files (a step can require/accept multiple).
export async function getOnboardingUploads(email: string): Promise<Record<string, OnboardingUpload[]>> {
  const { data } = await db()
    .from(UPLOADS)
    .select('id, step_id, file_url, file_name')
    .eq('user_email', norm(email))
    .order('created_at', { ascending: true });
  const map: Record<string, OnboardingUpload[]> = {};
  for (const r of (data ?? []) as { id: string; step_id: string; file_url: string; file_name: string | null }[]) {
    (map[r.step_id] ||= []).push({ id: r.id, url: r.file_url, name: r.file_name || 'document.pdf' });
  }
  return map;
}

// Append a file to a step (multiple files per step are allowed).
export async function addOnboardingUpload(
  email: string,
  stepId: string,
  fileUrl: string,
  fileName: string
): Promise<OnboardingUpload | null> {
  const { data } = await db()
    .from(UPLOADS)
    .insert({ user_email: norm(email), step_id: stepId, file_url: fileUrl, file_name: fileName })
    .select('id, file_url, file_name')
    .single();
  return data ? { id: data.id as string, url: data.file_url as string, name: (data.file_name as string) || fileName } : null;
}

// Remove one of a client's uploaded files (scoped to that client) — the row AND
// the PDF, which lives in a public bucket and would otherwise stay downloadable.
export async function deleteOnboardingUpload(email: string, id: string): Promise<void> {
  const { data: row } = await db().from(UPLOADS)
    .select('file_url').eq('id', id).eq('user_email', norm(email)).maybeSingle();

  await db().from(UPLOADS).delete().eq('id', id).eq('user_email', norm(email));

  if (row?.file_url) await removeStoredFiles([row.file_url as string]);
}

// Flat, newest-first list of a client's uploaded deliverables, for the CSM view.
export async function listOnboardingUploads(
  email: string
): Promise<{ id: string; stepId: string; url: string; name: string; createdAt: string }[]> {
  const { data } = await db()
    .from(UPLOADS)
    .select('id, step_id, file_url, file_name, created_at')
    .eq('user_email', norm(email))
    .order('created_at', { ascending: false });
  return (data ?? []).map((r: { id: string; step_id: string; file_url: string; file_name: string | null; created_at: string }) => ({
    id: r.id, stepId: r.step_id, url: r.file_url, name: r.file_name || 'document.pdf', createdAt: r.created_at,
  }));
}
