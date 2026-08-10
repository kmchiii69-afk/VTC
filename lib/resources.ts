import { db } from '@/lib/kv';
import { DEFAULT_RESOURCES, type ResourceDef, type ResourceType } from '@/lib/resources-data';
import { pruneRemovedFiles } from '@/lib/storage-cleanup';

// Admin-managed Resources library backed by the `resources` table. Reads
// auto-seed from DEFAULT_RESOURCES on first access; if the table doesn't exist
// yet (migration not run) every call degrades to the static defaults so the
// Resources tab keeps working (read-only until the SQL is run).

export interface Resource extends ResourceDef {
  id: string;
  persisted?: boolean;
}

const COLS = 'id, slug, title, description, category, type, body, embed_url, template_url, upload_step_id, upload_slot, sort_order';

function rowToResource(r: Record<string, unknown>, persisted = true): Resource {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    description: (r.description as string) ?? '',
    category: (r.category as string) ?? 'Resources',
    type: ((r.type as string) ?? 'native') as ResourceType,
    body: (r.body as string) ?? '',
    embed_url: (r.embed_url as string) ?? null,
    template_url: (r.template_url as string) ?? null,
    upload_step_id: (r.upload_step_id as string) ?? null,
    upload_slot: (r.upload_slot as string) ?? null,
    sort_order: (r.sort_order as number) ?? 0,
    persisted,
  };
}

// Static fallback (table missing / DB unreachable) — slug doubles as the id.
function defaultResources(): Resource[] {
  return DEFAULT_RESOURCES.map((d) => ({ ...d, id: d.slug, persisted: false }));
}

export async function getResources(): Promise<Resource[]> {
  try {
    await seedIfEmpty();
    const { data, error } = await db()
      .from('resources')
      .select(COLS)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => rowToResource(r));
  } catch {
    return defaultResources();
  }
}

export async function getResource(slug: string): Promise<Resource | null> {
  try {
    await seedIfEmpty();
    const { data, error } = await db().from('resources').select(COLS).eq('slug', slug).maybeSingle();
    if (error) throw error;
    return data ? rowToResource(data) : null;
  } catch {
    return defaultResources().find((r) => r.slug === slug) ?? null;
  }
}

// Seed the library from defaults the first time (table empty).
async function seedIfEmpty(): Promise<void> {
  const { count } = await db().from('resources').select('id', { count: 'exact', head: true });
  if (count && count > 0) return;
  const rows = DEFAULT_RESOURCES.map((d) => ({
    slug: d.slug,
    title: d.title,
    description: d.description,
    category: d.category,
    type: d.type,
    body: d.body,
    embed_url: d.embed_url ?? null,
    template_url: d.template_url ?? null,
    upload_step_id: d.upload_step_id ?? null,
    upload_slot: d.upload_slot ?? null,
    sort_order: d.sort_order,
  }));
  if (rows.length) await db().from('resources').insert(rows);
}

/* ─── Admin CRUD ──────────────────────────────────────────────────────────── */

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'resource';

export async function createResource(input: {
  title: string;
  description?: string;
  category?: string;
  type?: ResourceType;
  body?: string;
  embed_url?: string | null;
  template_url?: string | null;
  upload_step_id?: string | null;
  upload_slot?: string | null;
}): Promise<Resource | null> {
  // Unique slug from the title.
  let base = slugify(input.title);
  let slug = base;
  for (let n = 2; ; n++) {
    const { data: clash } = await db().from('resources').select('id').eq('slug', slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${n}`;
  }
  const { data: last } = await db()
    .from('resources')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number) ?? -1) + 1;
  const { data, error } = await db()
    .from('resources')
    .insert({
      slug,
      title: input.title,
      description: input.description ?? '',
      category: input.category ?? 'Resources',
      type: input.type ?? 'native',
      body: input.body ?? '',
      embed_url: input.embed_url ?? null,
      template_url: input.template_url ?? null,
      upload_step_id: input.upload_step_id ?? null,
      upload_slot: input.upload_slot ?? null,
      sort_order: nextOrder,
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return data ? rowToResource(data) : null;
}

export async function updateResource(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    category: string;
    type: ResourceType;
    body: string;
    embed_url: string | null;
    template_url: string | null;
    upload_step_id: string | null;
    upload_slot: string | null;
    sort_order: number;
  }>
): Promise<void> {
  const fields: Record<string, unknown> = {};
  for (const k of ['title', 'description', 'category', 'type', 'body', 'embed_url', 'template_url', 'upload_step_id', 'upload_slot', 'sort_order'] as const) {
    if (k in patch && patch[k] !== undefined) fields[k] = patch[k];
  }
  if (!Object.keys(fields).length) return;
  fields.updated_at = new Date().toISOString();
  const { error } = await db().from('resources').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteResource(id: string): Promise<void> {
  // Grab the row first: any uploaded PDF lives in a public bucket, so the file
  // has to go with the row or it stays downloadable by link.
  const { data: row } = await db().from('resources').select('*').eq('id', id).maybeSingle();

  const { error } = await db().from('resources').delete().eq('id', id);
  if (error) throw error;

  if (row) {
    // Diff against what's left rather than deleting blind — the same uploaded
    // URL can legitimately be pasted into a second resource.
    const { data: rest } = await db().from('resources').select('*');
    await pruneRemovedFiles(row, rest ?? []);
  }
}
