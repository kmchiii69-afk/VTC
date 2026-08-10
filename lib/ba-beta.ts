import { db, isMissingTable } from '@/lib/kv';
import { getModulesTree } from '@/lib/modules';
import { pruneRemovedFiles } from '@/lib/storage-cleanup';

// Brand Architect Beta — admin-only sandbox catalog backed by
// ba_beta_categories + ba_beta_lessons + ba_beta_resources (see
// supabase-ba-beta.sql). On first load it auto-seeds as a full duplicate of the
// live /modules catalog (categories + videos) so admins start from a copy they
// can freely edit without touching what members see. Reads degrade to an empty
// (read-only) tree if the tables don't exist yet, so the admin view never
// crashes pre-migration.

export type BetaResourceKind = 'link' | 'note';

export interface BetaResource {
  id: string;
  title: string;
  kind: BetaResourceKind;
  url: string;
  body: string;
  inline: boolean; // true = embed below the video; false = popup pill
  sort_order: number;
}

export interface BetaLesson {
  id: string;
  title: string;
  embed_id: string;
  sort_order: number;
  resources: BetaResource[];
}

export interface BetaCategory {
  id: string;
  name: string;
  sort_order: number;
  lessons: BetaLesson[];
}

export interface BetaTree {
  categories: BetaCategory[];
  persisted: boolean; // false when the tables aren't set up yet
}

const emptyTree = (): BetaTree => ({ categories: [], persisted: false });

const normKind = (k: unknown): BetaResourceKind => (k === 'note' ? 'note' : 'link');

// Seed the beta catalog as a duplicate of the live /modules catalog the first
// time it's opened (tables empty). Copies categories + videos only; resource
// pills start empty for admins to add. If the admin deletes every category the
// next load re-seeds the duplicate (a natural reset).
async function seedBetaIfEmpty(): Promise<void> {
  const { count, error } = await db().from('ba_beta_categories').select('id', { count: 'exact', head: true });
  // Only seed when we KNOW the table is empty — a failed count read as "empty"
  // and duplicated the whole program catalog on top of the live one.
  if (error) throw error;
  if (count && count > 0) return;
  const tree = await getModulesTree(); // live catalog (or built-in defaults)
  for (let ci = 0; ci < tree.sections.length; ci++) {
    const sec = tree.sections[ci];
    const { data: cat } = await db()
      .from('ba_beta_categories')
      .insert({ name: sec.name, sort_order: ci })
      .select('id')
      .single();
    if (!cat) continue;
    const rows = sec.items.map((it, li) => ({ category_id: cat.id, title: it.title, embed_id: it.embed_id, sort_order: li }));
    if (rows.length) await db().from('ba_beta_lessons').insert(rows);
  }
}

// Full tree: categories ordered, each with ordered lessons, each with ordered resources.
export async function getBetaTree(): Promise<BetaTree> {
  try {
    await seedBetaIfEmpty();
    const [{ data: cats, error: cErr }, { data: lessons, error: lErr }, { data: resources, error: rErr }] = await Promise.all([
      db().from('ba_beta_categories').select('id, name, sort_order').order('sort_order', { ascending: true }),
      db().from('ba_beta_lessons').select('id, category_id, title, embed_id, sort_order').order('sort_order', { ascending: true }),
      db().from('ba_beta_resources').select('id, lesson_id, title, kind, url, body, inline, sort_order').order('sort_order', { ascending: true }),
    ]);
    // Categories + lessons must both land. A swallowed lessons error left every
    // category empty, which members saw as "No modules yet" — the whole library
    // gone for what was really a hiccup.
    if (cErr) throw cErr;
    if (lErr) throw lErr;
    // Resource pills are supplementary: tolerate the table not existing yet, but
    // not a transient failure that would silently drop every attachment.
    if (rErr && !isMissingTable(rErr)) throw rErr;
    const lessonRows = lessons ?? [];
    const resRows = resources ?? [];
    return {
      persisted: true,
      categories: (cats ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        sort_order: c.sort_order as number,
        lessons: lessonRows
          .filter((l) => l.category_id === c.id)
          .map((l) => ({
            id: l.id as string,
            title: l.title as string,
            embed_id: (l.embed_id as string) ?? '',
            sort_order: l.sort_order as number,
            resources: resRows
              .filter((r) => r.lesson_id === l.id)
              .map((r) => ({
                id: r.id as string,
                title: r.title as string,
                kind: normKind(r.kind),
                url: (r.url as string) ?? '',
                body: (r.body as string) ?? '',
                inline: !!r.inline,
                sort_order: r.sort_order as number,
              })),
          })),
      })),
    };
  } catch (err) {
    // Pre-migration the tables genuinely aren't there — degrade to an empty
    // read-only tree. Every other failure rethrows so the caller answers 503 and
    // the page can retry, instead of telling a member they have no modules.
    if (isMissingTable(err)) return emptyTree();
    throw err;
  }
}

// Next sort_order for a new row in `table`, scoped by `match` (e.g. a parent id).
async function nextOrder(table: string, match: Record<string, string> = {}): Promise<number> {
  let q = db().from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data } = await q.maybeSingle();
  return ((data?.sort_order as number) ?? -1) + 1;
}

/* ─── Categories ─────────────────────────────────────────────────────────── */

export async function createBetaCategory(name: string): Promise<{ id: string } | null> {
  const sort_order = await nextOrder('ba_beta_categories');
  const { data, error } = await db().from('ba_beta_categories').insert({ name, sort_order }).select('id').single();
  if (error) throw error;
  return data ? { id: data.id as string } : null;
}

export async function updateBetaCategory(id: string, patch: { name?: string; sort_order?: number }): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (typeof patch.name === 'string') fields.name = patch.name;
  if (typeof patch.sort_order === 'number') fields.sort_order = patch.sort_order;
  if (!Object.keys(fields).length) return;
  const { error } = await db().from('ba_beta_categories').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteBetaCategory(id: string): Promise<void> {
  // lessons + resources cascade via FK on delete — which means their uploaded
  // PDFs would be orphaned in the public bucket, so collect them beforehand.
  const { data: lessons } = await db().from('ba_beta_lessons').select('id').eq('category_id', id);
  const lessonIds = (lessons ?? []).map((l) => l.id as string);
  const { data: doomed } = lessonIds.length
    ? await db().from('ba_beta_resources').select('*').in('lesson_id', lessonIds)
    : { data: [] };

  const { error } = await db().from('ba_beta_categories').delete().eq('id', id);
  if (error) throw error;

  const { data: rest } = await db().from('ba_beta_resources').select('*');
  await pruneRemovedFiles(doomed ?? [], rest ?? []);
}

/* ─── Lessons ────────────────────────────────────────────────────────────── */

export async function createBetaLesson(input: { category_id: string; title: string; embed_id: string }): Promise<{ id: string } | null> {
  const sort_order = await nextOrder('ba_beta_lessons', { category_id: input.category_id });
  const { data, error } = await db()
    .from('ba_beta_lessons')
    .insert({ category_id: input.category_id, title: input.title, embed_id: input.embed_id, sort_order })
    .select('id')
    .single();
  if (error) throw error;
  return data ? { id: data.id as string } : null;
}

export async function updateBetaLesson(
  id: string,
  patch: { title?: string; embed_id?: string; category_id?: string; sort_order?: number },
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (typeof patch.title === 'string') fields.title = patch.title;
  if (typeof patch.embed_id === 'string') fields.embed_id = patch.embed_id;
  if (typeof patch.category_id === 'string') fields.category_id = patch.category_id;
  if (typeof patch.sort_order === 'number') fields.sort_order = patch.sort_order;
  if (!Object.keys(fields).length) return;
  const { error } = await db().from('ba_beta_lessons').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteBetaLesson(id: string): Promise<void> {
  // Deleting a lesson cascades its resource pills, so collect their files too —
  // otherwise every PDF attached to the lesson is orphaned in the public bucket.
  const { data: lesson } = await db().from('ba_beta_lessons').select('*').eq('id', id).maybeSingle();
  const { data: pills } = await db().from('ba_beta_resources').select('*').eq('lesson_id', id);

  const { error } = await db().from('ba_beta_lessons').delete().eq('id', id);
  if (error) throw error;

  const { data: rest } = await db().from('ba_beta_resources').select('*');
  await pruneRemovedFiles([lesson, pills ?? []], rest ?? []);
}

// Bulk drag-and-drop persistence: set each lesson's category + position in one
// go (used by the editor's drag-to-reorder / drag-between-categories).
export async function reorderBetaLessons(
  items: { id: string; category_id: string; sort_order: number }[],
): Promise<void> {
  const results = await Promise.all(
    items.map((it) =>
      db().from('ba_beta_lessons').update({ category_id: it.category_id, sort_order: it.sort_order }).eq('id', it.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/* ─── Resources (pill boxes) ─────────────────────────────────────────────── */

export async function createBetaResource(input: {
  lesson_id: string;
  title: string;
  kind: BetaResourceKind;
  url?: string;
  body?: string;
  inline?: boolean;
}): Promise<{ id: string } | null> {
  const sort_order = await nextOrder('ba_beta_resources', { lesson_id: input.lesson_id });
  const { data, error } = await db()
    .from('ba_beta_resources')
    .insert({
      lesson_id: input.lesson_id,
      title: input.title,
      kind: normKind(input.kind),
      url: input.url ?? '',
      body: input.body ?? '',
      inline: !!input.inline,
      sort_order,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data ? { id: data.id as string } : null;
}

export async function updateBetaResource(
  id: string,
  patch: { title?: string; kind?: BetaResourceKind; url?: string; body?: string; inline?: boolean; sort_order?: number },
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (typeof patch.title === 'string') fields.title = patch.title;
  if (patch.kind !== undefined) fields.kind = normKind(patch.kind);
  if (typeof patch.url === 'string') fields.url = patch.url;
  if (typeof patch.body === 'string') fields.body = patch.body;
  if (typeof patch.inline === 'boolean') fields.inline = patch.inline;
  if (typeof patch.sort_order === 'number') fields.sort_order = patch.sort_order;
  if (!Object.keys(fields).length) return;
  const { error } = await db().from('ba_beta_resources').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteBetaResource(id: string): Promise<void> {
  // An uploaded PDF is stored as the resource's url; delete the file with the row
  // (diffed against the remaining rows, since a url can be reused on purpose).
  const { data: row } = await db().from('ba_beta_resources').select('*').eq('id', id).maybeSingle();

  const { error } = await db().from('ba_beta_resources').delete().eq('id', id);
  if (error) throw error;

  if (row) {
    const { data: rest } = await db().from('ba_beta_resources').select('*');
    await pruneRemovedFiles(row, rest ?? []);
  }
}
