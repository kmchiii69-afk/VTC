import { db, isMissingTable } from '@/lib/kv';
import { DEFAULT_SECTIONS, defaultTree, type ModulesTree } from '@/lib/modules-data';

// Admin-managed module catalog backed by module_sections + module_items.
// Reads auto-seed from DEFAULT_SECTIONS on first access; if the tables don't
// exist yet (migration not run) every call degrades to the static defaults so
// the /modules page keeps working (read-only until the SQL is run).
//
// Any OTHER failure rethrows — a transient DB error must never quietly swap the
// live catalog for the built-in defaults, which reads to members as modules
// appearing and disappearing between page loads.

// Returns the full tree (sections ordered, each with its ordered items).
export async function getModulesTree(): Promise<ModulesTree> {
  try {
    await seedIfEmpty();
    const [{ data: sections, error: sErr }, { data: items, error: iErr }] = await Promise.all([
      db().from('module_sections').select('id, name, sort_order').order('sort_order', { ascending: true }),
      db().from('module_items').select('id, section_id, title, embed_id, sort_order').order('sort_order', { ascending: true }),
    ]);
    // Both reads must land. A swallowed items error renders as sections with no
    // modules in them — the library looks empty for what is really a hiccup.
    if (sErr) throw sErr;
    if (iErr) throw iErr;
    const rows = items ?? [];
    return {
      persisted: true,
      sections: (sections ?? []).map((s) => ({
        id: s.id as string,
        name: s.name as string,
        sort_order: s.sort_order as number,
        items: rows
          .filter((i) => i.section_id === s.id)
          .map((i) => ({ id: i.id as string, title: i.title as string, embed_id: (i.embed_id as string) ?? '', sort_order: i.sort_order as number })),
      })),
    };
  } catch (err) {
    // Tables not created yet — serve the static catalog read-only. Anything else
    // (network blip, DB unreachable) is surfaced so the caller can retry rather
    // than show the wrong catalog.
    if (isMissingTable(err)) return defaultTree();
    throw err;
  }
}

// Seed the catalog from defaults the first time (tables empty).
async function seedIfEmpty(): Promise<void> {
  const { count, error } = await db().from('module_sections').select('id', { count: 'exact', head: true });
  // A failed count used to read as "empty" and seed a second copy of the
  // defaults on top of the live catalog. Never seed unless we KNOW it's empty.
  if (error) throw error;
  if (count && count > 0) return;
  for (let si = 0; si < DEFAULT_SECTIONS.length; si++) {
    const sec = DEFAULT_SECTIONS[si];
    const { data: srow } = await db()
      .from('module_sections')
      .insert({ name: sec.name, sort_order: si })
      .select('id')
      .single();
    if (!srow) continue;
    const rows = sec.items.map((it, ii) => ({ section_id: srow.id, title: it.title, embed_id: it.embed_id, sort_order: ii }));
    if (rows.length) await db().from('module_items').insert(rows);
  }
}

/* ─── Sections (categories) ──────────────────────────────────────────────── */

export async function createSection(name: string): Promise<{ id: string } | null> {
  const { data } = await db()
    .from('module_sections')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((data?.sort_order as number) ?? -1) + 1;
  const { data: row, error } = await db()
    .from('module_sections')
    .insert({ name, sort_order: nextOrder })
    .select('id')
    .single();
  if (error) throw error;
  return row ? { id: row.id as string } : null;
}

export async function updateSection(id: string, patch: { name?: string; sort_order?: number }): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (typeof patch.name === 'string') fields.name = patch.name;
  if (typeof patch.sort_order === 'number') fields.sort_order = patch.sort_order;
  if (!Object.keys(fields).length) return;
  const { error } = await db().from('module_sections').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteSection(id: string): Promise<void> {
  // items cascade via FK on delete
  const { error } = await db().from('module_sections').delete().eq('id', id);
  if (error) throw error;
}

/* ─── Items (modules) ────────────────────────────────────────────────────── */

export async function createItem(input: { section_id: string; title: string; embed_id: string }): Promise<{ id: string } | null> {
  const { data } = await db()
    .from('module_items')
    .select('sort_order')
    .eq('section_id', input.section_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((data?.sort_order as number) ?? -1) + 1;
  const { data: row, error } = await db()
    .from('module_items')
    .insert({ section_id: input.section_id, title: input.title, embed_id: input.embed_id, sort_order: nextOrder })
    .select('id')
    .single();
  if (error) throw error;
  return row ? { id: row.id as string } : null;
}

export async function updateItem(
  id: string,
  patch: { title?: string; embed_id?: string; section_id?: string; sort_order?: number }
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (typeof patch.title === 'string') fields.title = patch.title;
  if (typeof patch.embed_id === 'string') fields.embed_id = patch.embed_id;
  if (typeof patch.section_id === 'string') fields.section_id = patch.section_id;
  if (typeof patch.sort_order === 'number') fields.sort_order = patch.sort_order;
  if (!Object.keys(fields).length) return;
  const { error } = await db().from('module_items').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await db().from('module_items').delete().eq('id', id);
  if (error) throw error;
}
