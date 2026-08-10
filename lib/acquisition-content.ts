// Server-side persistence for per-client Acquisition Dashboard edits.
// One row per (client, page) holding a free-form JSON blob — see
// lib/acquisition-config.ts for the shape per page kind.

import { db } from '@/lib/kv';
import type { AcqData } from '@/lib/acquisition-config';
import { pruneRemovedFiles } from '@/lib/storage-cleanup';

const TABLE = 'acquisition_content';
const norm = (e: string) => e.toLowerCase().trim();

// All of a client's edits, keyed by page id.
export async function getAcqContent(email: string): Promise<Record<string, AcqData>> {
  const { data } = await db().from(TABLE).select('page_id, data').eq('user_email', norm(email));
  const out: Record<string, AcqData> = {};
  for (const row of data || []) out[row.page_id as string] = (row.data as AcqData) ?? {};
  return out;
}

export async function setAcqContent(email: string, pageId: string, data: AcqData): Promise<void> {
  // "Remove" and "Replace PDF" both just save a blob without the old URL in it —
  // read the previous one so the dropped file gets deleted, not orphaned.
  const { data: prev } = await db().from(TABLE).select('data')
    .eq('user_email', norm(email)).eq('page_id', pageId).maybeSingle();

  const { error } = await db().from(TABLE).upsert(
    { user_email: norm(email), page_id: pageId, data, updated_at: new Date().toISOString() },
    { onConflict: 'user_email,page_id' },
  );
  if (error) throw new Error(error.message);

  await pruneRemovedFiles(prev?.data, data);
}
