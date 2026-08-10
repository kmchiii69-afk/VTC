// Server-side persistence for admin-managed GLOBAL Acquisition Dashboard content
// (the "Building" / reference pages). One row per page, shared across every
// acquisition-tagged client. See lib/acquisition-config.ts for the shape.

import { db } from '@/lib/kv';
import type { AcqAdminData } from '@/lib/acquisition-config';
import { pruneRemovedFiles } from '@/lib/storage-cleanup';

const TABLE = 'acquisition_admin_content';

// Everything admins have authored, keyed by page id. Read by all clients.
export async function getAllAdminContent(): Promise<Record<string, AcqAdminData>> {
  const { data } = await db().from(TABLE).select('page_id, data');
  const out: Record<string, AcqAdminData> = {};
  for (const row of data || []) out[row.page_id as string] = (row.data as AcqAdminData) ?? {};
  return out;
}

export async function setAdminContent(pageId: string, data: AcqAdminData): Promise<void> {
  // The editor rewrites the whole blob, so a PDF the admin removed shows up as an
  // absent entry. Read the old blob first to know which files to delete.
  const { data: prev } = await db().from(TABLE).select('data').eq('page_id', pageId).maybeSingle();

  const { error } = await db().from(TABLE).upsert(
    { page_id: pageId, data, updated_at: new Date().toISOString() },
    { onConflict: 'page_id' },
  );
  if (error) throw new Error(error.message);

  await pruneRemovedFiles(prev?.data, data);
}
