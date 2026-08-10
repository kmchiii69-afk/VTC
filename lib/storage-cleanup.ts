import { db } from '@/lib/kv';

/**
 * Deleting an uploaded document has to delete the FILE, not just the row that
 * points at it.
 *
 * Every upload route in this app puts the PDF in a public Supabase Storage
 * bucket and stores the public URL somewhere — a table column, a JSON blob, a
 * settings array. Removing the reference alone left the file sitting in a public
 * bucket, still downloadable by anyone holding the link, long after the client
 * believed they'd deleted it.
 *
 * These helpers work off the URL, so they don't care which shape stored it:
 * `storageRefsIn` walks any JSON value for our storage URLs, `removeStoredFiles`
 * deletes them, and `pruneRemovedFiles` diffs a before/after blob and deletes
 * whatever the save dropped.
 *
 * Deletion is best-effort by design — a storage hiccup must never fail the write
 * the caller actually asked for. The worst case is the old behaviour.
 */

/** `/storage/v1/object/(public|sign)/<bucket>/<path…>` */
const OBJECT_PATH = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/;

function supabaseHost(): string {
  try {
    return new URL(process.env.SUPABASE_URL ?? '').host;
  } catch {
    return '';
  }
}

/**
 * Split one of our public storage URLs into bucket + object path. Returns null
 * for anything else — a Google Doc link, a YouTube embed, a Fathom share URL —
 * so a stray string can never turn into a delete.
 */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const host = supabaseHost();
  if (!host) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.host !== host) return null;
  const m = parsed.pathname.match(OBJECT_PATH);
  if (!m) return null;
  const path = decodeURIComponent(m[2]);
  // No traversal, no empty keys.
  if (!path || path.includes('..')) return null;
  return { bucket: m[1], path };
}

/** Every storage URL anywhere inside a JSON-ish value, deduped. */
export function storageRefsIn(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 12 || v == null) return;
    if (typeof v === 'string') {
      if (parseStorageUrl(v)) found.add(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item, depth + 1);
      return;
    }
    if (typeof v === 'object') {
      for (const item of Object.values(v as Record<string, unknown>)) walk(item, depth + 1);
    }
  };
  walk(value, 0);
  return [...found];
}

/** Delete the given storage URLs, one call per bucket. Never throws. */
export async function removeStoredFiles(urls: Iterable<string>): Promise<void> {
  const byBucket = new Map<string, string[]>();
  for (const url of urls) {
    const ref = parseStorageUrl(url);
    if (!ref) continue;
    const paths = byBucket.get(ref.bucket) ?? [];
    paths.push(ref.path);
    byBucket.set(ref.bucket, paths);
  }
  if (!byBucket.size) return;

  await Promise.all([...byBucket].map(async ([bucket, paths]) => {
    try {
      const { error } = await db().storage.from(bucket).remove(paths);
      if (error) console.error(`[storage-cleanup] ${bucket}: ${error.message}`);
    } catch (e) {
      console.error(`[storage-cleanup] ${bucket}:`, e);
    }
  }));
}

/**
 * Delete the files a save dropped: anything referenced by `before` that `after`
 * no longer mentions. Use for JSON blobs that are rewritten wholesale, where a
 * removed file shows up as an absent key rather than a delete call.
 */
export async function pruneRemovedFiles(before: unknown, after: unknown): Promise<void> {
  try {
    const kept = new Set(storageRefsIn(after));
    const gone = storageRefsIn(before).filter((url) => !kept.has(url));
    if (gone.length) await removeStoredFiles(gone);
  } catch (e) {
    // Callers await this AFTER their write has landed, so throwing here would
    // report a successful save as a 500. Cleanup is best-effort by contract.
    console.error('[storage-cleanup] prune failed:', e);
  }
}
