import { db } from '@/lib/kv';

/**
 * Writes that survive a not-yet-run migration.
 *
 * Schema changes here are applied by hand in the Supabase SQL editor, so app code
 * has to tolerate a column that doesn't exist yet: PostgREST rejects the ENTIRE
 * write with "column ... does not exist" (or a schema-cache miss). This helper
 * retries once without the optional columns, so the feature degrades instead of
 * 500-ing every save until the SQL is run.
 */

type Row = Record<string, unknown>;

function mentionsColumn(message: string, columns: readonly string[]): boolean {
  const m = message.toLowerCase();
  return columns.some((c) => m.includes(c.toLowerCase()));
}

async function run(table: string, row: Row, id?: string) {
  const q = id
    ? db().from(table).update(row).eq('id', id)
    : db().from(table).insert(row);
  return q.select().single();
}

export async function writeWithOptionalColumns(
  table: string,
  row: Row,
  opts: { id?: string; optional: readonly string[] },
) {
  const first = await run(table, row, opts.id);
  if (!first.error || !mentionsColumn(first.error.message, opts.optional)) return first;

  const stripped = { ...row };
  for (const c of opts.optional) delete stripped[c];
  if (!Object.keys(stripped).length) return first;
  return run(table, stripped, opts.id);
}
