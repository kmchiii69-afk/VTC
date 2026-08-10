import { db } from '@/lib/kv';

// Admin-editable overrides for roadmap item description + links. Stored in
// roadmap_item_content (keyed by the stable item_id). Non-throwing: if the table
// doesn't exist yet, reads return {} and the roadmap falls back to static data.

export interface RoadmapLink { label: string; url: string }
export interface RoadmapOverride { description: string | null; links: RoadmapLink[] }

export async function getRoadmapOverrides(): Promise<Record<string, RoadmapOverride>> {
  const { data, error } = await db().from('roadmap_item_content').select('item_id, description, links');
  if (error || !data) return {};
  const map: Record<string, RoadmapOverride> = {};
  for (const r of data as { item_id: string; description: string | null; links: unknown }[]) {
    map[r.item_id] = {
      description: r.description ?? null,
      links: Array.isArray(r.links) ? (r.links as RoadmapLink[]) : [],
    };
  }
  return map;
}

export async function setRoadmapOverride(
  itemId: string,
  description: string | null,
  links: RoadmapLink[]
): Promise<void> {
  await db().from('roadmap_item_content').upsert(
    { item_id: itemId, description, links, updated_at: new Date().toISOString() },
    { onConflict: 'item_id' }
  );
}
