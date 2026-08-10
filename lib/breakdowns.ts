import { db } from '@/lib/kv';

// "Exclusive Guest Masterminds" (shown in /hub) — admin-editable showcase tiles
// (profile image → modal with an embed, summary doc, and AI chat). The full list
// is stored as a JSON array in portal_settings (key 'breakdowns'), so admins can
// ADD / edit / delete tiles with no schema migration. The original two tiles are
// seeded from BREAKDOWN_DEFS (images in public/breakdowns/) and their embed/
// summary are read from the legacy client_breakdowns table until the first
// mutation persists everything into the setting.

const SETTINGS_TABLE = 'portal_settings';
const BREAKDOWNS_KEY = 'breakdowns';

export interface Breakdown {
  slug: string;
  title: string;
  image: string;            // /breakdowns/<slug>.png OR an uploaded public URL
  embed_code: string | null;
  summary_url: string | null;
  sort_order?: number;
}

export const BREAKDOWN_DEFS: { slug: string; title: string; image: string }[] = [
  { slug: 'wyatt', title: "Wyatt's $7k to $100k/mo in 30 days breakdown", image: '/breakdowns/wyatt.jpg' },
  { slug: 'emma', title: "Emma's $100k/mo in 2 months breakdown", image: '/breakdowns/emma.jpg' },
];

// Persisted list, or null when the setting has never been written.
async function readStored(): Promise<Breakdown[] | null> {
  try {
    const { data } = await db().from(SETTINGS_TABLE).select('value').eq('key', BREAKDOWNS_KEY).maybeSingle();
    const v = data?.value;
    return Array.isArray(v) ? (v as Breakdown[]) : null;
  } catch {
    return null;
  }
}

// Legacy fallback: the two code-seeded tiles, with embed/summary from the old
// client_breakdowns table (before anything has been saved into the setting).
async function legacyList(): Promise<Breakdown[]> {
  const stored: Record<string, { embed_code: string | null; summary_url: string | null }> = {};
  try {
    const { data } = await db().from('client_breakdowns').select('slug, embed_code, summary_url');
    for (const r of (data ?? []) as { slug: string; embed_code: string | null; summary_url: string | null }[]) {
      stored[r.slug] = { embed_code: r.embed_code, summary_url: r.summary_url };
    }
  } catch {
    /* table not created yet — serve defaults with no embed/summary */
  }
  return BREAKDOWN_DEFS.map((d, i) => ({
    ...d,
    embed_code: stored[d.slug]?.embed_code ?? null,
    summary_url: stored[d.slug]?.summary_url ?? null,
    sort_order: i,
  }));
}

export async function getBreakdowns(): Promise<Breakdown[]> {
  const stored = await readStored();
  const list = stored ?? (await legacyList());
  return [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

async function saveBreakdowns(list: Breakdown[]): Promise<void> {
  const clean = list.map((b, i) => ({
    slug: b.slug,
    title: b.title,
    image: b.image,
    embed_code: b.embed_code ?? null,
    summary_url: b.summary_url ?? null,
    sort_order: typeof b.sort_order === 'number' ? b.sort_order : i,
  }));
  const { error } = await db()
    .from(SETTINGS_TABLE)
    .upsert({ key: BREAKDOWNS_KEY, value: clean, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

function slugify(title: string): string {
  return (
    title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'guest-mastermind'
  );
}

export async function isBreakdownSlug(slug: string): Promise<boolean> {
  return (await getBreakdowns()).some((b) => b.slug === slug);
}

export async function createBreakdown(input: {
  title: string; image?: string; embed_code?: string | null; summary_url?: string | null;
}): Promise<Breakdown> {
  const list = await getBreakdowns();
  const taken = new Set(list.map((b) => b.slug));
  const base = slugify(input.title);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const item: Breakdown = {
    slug,
    title: input.title.trim(),
    image: input.image?.trim() || '',
    embed_code: input.embed_code?.trim() || null,
    summary_url: input.summary_url?.trim() || null,
    sort_order: list.length,
  };
  await saveBreakdowns([...list, item]);
  return item;
}

export async function updateBreakdown(
  slug: string,
  patch: { title?: string; image?: string; embed_code?: string | null; summary_url?: string | null },
): Promise<void> {
  const list = await getBreakdowns();
  const next = list.map((b) =>
    b.slug === slug
      ? {
          ...b,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.image !== undefined ? { image: patch.image } : {}),
          ...('embed_code' in patch ? { embed_code: patch.embed_code ?? null } : {}),
          ...('summary_url' in patch ? { summary_url: patch.summary_url ?? null } : {}),
        }
      : b,
  );
  await saveBreakdowns(next);
}

export async function deleteBreakdown(slug: string): Promise<void> {
  const list = await getBreakdowns();
  await saveBreakdowns(list.filter((b) => b.slug !== slug));
}
