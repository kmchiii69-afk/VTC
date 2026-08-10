import { db } from '@/lib/kv';
import { removeStoredFiles } from '@/lib/storage-cleanup';

// Admin-managed SOPs for the "Creative Specialist" group in the SOP library.
// Stored as a JSON array in portal_settings (key 'creative_sops') — no schema
// migration — with the PDF uploaded to the public `sop-files` storage bucket.

const SETTINGS_TABLE = 'portal_settings';
const KEY = 'creative_sops';

export interface CreativeSop {
  id: string;
  title: string;
  sub: string;
  file: string; // public PDF url
  sort_order?: number;
}

async function read(): Promise<CreativeSop[]> {
  try {
    const { data } = await db().from(SETTINGS_TABLE).select('value').eq('key', KEY).maybeSingle();
    const v = data?.value;
    return Array.isArray(v) ? (v as CreativeSop[]) : [];
  } catch {
    return [];
  }
}

async function save(list: CreativeSop[]): Promise<void> {
  const clean = list.map((s, i) => ({
    id: s.id, title: s.title, sub: s.sub, file: s.file,
    sort_order: typeof s.sort_order === 'number' ? s.sort_order : i,
  }));
  const { error } = await db()
    .from(SETTINGS_TABLE)
    .upsert({ key: KEY, value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

function slugify(t: string): string {
  return t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'sop';
}

export async function getCreativeSops(): Promise<CreativeSop[]> {
  return (await read()).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export async function createCreativeSop(input: { title: string; sub?: string; file: string }): Promise<CreativeSop> {
  const list = await read();
  const taken = new Set(list.map((s) => s.id));
  const base = `cs-${slugify(input.title)}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  const item: CreativeSop = { id, title: input.title.trim(), sub: (input.sub || '').trim(), file: input.file, sort_order: list.length };
  await save([...list, item]);
  return item;
}

export async function deleteCreativeSop(id: string): Promise<void> {
  const list = await read();
  const gone = list.find((s) => s.id === id);
  await save(list.filter((s) => s.id !== id));
  // Drop the PDF too — `sop-files` is public, so leaving it means the SOP is
  // still readable by anyone who kept the link.
  if (gone?.file) await removeStoredFiles([gone.file]);
}
