// Server-side persistence for the Acquisition Roadmap.
//   • The DEFINITION (weeks/steps/resources) is admin-managed and GLOBAL — one
//     row in `acquisition_roadmap`, shared across every acquisition client.
//   • Per-client tick progress lives in `acquisition_roadmap_progress`
//     (mirrors roadmap_progress; kept separate so its step ids never collide
//     with the main roadmap's).

import { db } from '@/lib/kv';
import { DEFAULT_ACQ_ROADMAP, normalizeRoadmap, type AcqRoadmapDef } from '@/lib/acquisition-roadmap-data';

const DEF_TABLE = 'acquisition_roadmap';
const PROGRESS_TABLE = 'acquisition_roadmap_progress';
const DEF_ID = 'default'; // single shared row
const norm = (e: string) => e.toLowerCase().trim();

// The shared roadmap definition. Falls back to the baked default until an admin
// saves their own (or if the table hasn't been migrated yet).
export async function getAcqRoadmapDef(): Promise<AcqRoadmapDef> {
  try {
    const { data } = await db().from(DEF_TABLE).select('data').eq('id', DEF_ID).maybeSingle();
    if (data?.data && typeof data.data === 'object') return normalizeRoadmap(data.data);
  } catch {
    /* table missing → default */
  }
  return DEFAULT_ACQ_ROADMAP;
}

export async function setAcqRoadmapDef(def: AcqRoadmapDef): Promise<void> {
  const { error } = await db().from(DEF_TABLE).upsert(
    { id: DEF_ID, data: normalizeRoadmap(def), updated_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);
}

export async function getAcqRoadmapProgress(email: string): Promise<string[]> {
  try {
    const { data } = await db().from(PROGRESS_TABLE).select('item_id').eq('user_email', norm(email));
    return (data ?? []).map((r: { item_id: string }) => r.item_id);
  } catch {
    return [];
  }
}

export async function setAcqRoadmapItem(email: string, itemId: string, completed: boolean): Promise<void> {
  const e = norm(email);
  if (completed) {
    const { error } = await db().from(PROGRESS_TABLE).upsert(
      { user_email: e, item_id: itemId, completed_at: new Date().toISOString() },
      { onConflict: 'user_email,item_id' },
    );
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db().from(PROGRESS_TABLE).delete().eq('user_email', e).eq('item_id', itemId);
    if (error) throw new Error(error.message);
  }
}
