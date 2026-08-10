import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/journey';

// Shares the Supabase service-role connection pattern used by lib/checkins.ts.
let _client: SupabaseClient | null = null;
function db() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  }
  return _client;
}

const TABLE = 'action_items';

export type ActionItemStatus = 'open' | 'completed';
export type ActionItemSource = 'admin' | 'ai';

export interface ActionItem {
  id: string;
  client_email: string;
  text: string;
  status: ActionItemStatus;
  source: ActionItemSource;
  due_date: string | null;
  assigned_by: string | null;
  check_in_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
}

function norm(email: string) {
  return email.toLowerCase().trim();
}

// Open items first, then by due date (soonest first, nulls last), then newest.
function sortItems(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1;
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

export async function listActionItems(
  clientEmail: string,
  opts: { includeCompleted?: boolean } = {}
): Promise<ActionItem[]> {
  let q = db().from(TABLE).select('*').eq('client_email', norm(clientEmail));
  if (!opts.includeCompleted) q = q.eq('status', 'open');
  const { data } = await q;
  return sortItems((data ?? []) as ActionItem[]);
}

export async function getActionItem(id: string): Promise<ActionItem | null> {
  const { data } = await db().from(TABLE).select('*').eq('id', id).maybeSingle();
  return (data as ActionItem) ?? null;
}

export async function createActionItem(input: {
  client_email: string;
  text: string;
  due_date?: string | null;
  source?: ActionItemSource;
  assigned_by?: string | null;
  check_in_id?: string | null;
}): Promise<ActionItem | null> {
  const { data } = await db()
    .from(TABLE)
    .insert({
      client_email: norm(input.client_email),
      text: input.text.trim(),
      due_date: input.due_date || null,
      source: input.source ?? 'admin',
      assigned_by: input.assigned_by ?? null,
      check_in_id: input.check_in_id ?? null,
      status: 'open',
    })
    .select()
    .single();
  const item = (data as ActionItem) ?? null;
  if (item) {
    await logEvent({
      clientEmail: item.client_email,
      type: 'action_item_created',
      title: item.text,
      refTable: TABLE,
      refId: item.id,
      metadata: { source: item.source, assigned_by: item.assigned_by, due_date: item.due_date },
    });
  }
  return item;
}

export async function updateActionItem(
  id: string,
  updates: Partial<Pick<ActionItem, 'text' | 'due_date' | 'status' | 'completed_at' | 'completed_by'>>
): Promise<ActionItem | null> {
  const { data } = await db().from(TABLE).update(updates).eq('id', id).select().single();
  return (data as ActionItem) ?? null;
}

// Toggle (or set) completion, stamping who/when. `by` is 'client' or an admin email.
export async function setActionItemStatus(
  id: string,
  status: ActionItemStatus,
  by: string
): Promise<ActionItem | null> {
  const item = await updateActionItem(id, {
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
    completed_by: status === 'completed' ? by : null,
  });
  if (item && status === 'completed') {
    await logEvent({
      clientEmail: item.client_email,
      type: 'action_item_completed',
      title: item.text,
      refTable: TABLE,
      refId: item.id,
      metadata: { completed_by: by, source: item.source },
    });
  }
  return item;
}

export async function deleteActionItem(id: string): Promise<void> {
  await db().from(TABLE).delete().eq('id', id);
}

// Remove the action items auto-generated from a check-in (used when a check-in is
// deleted). Only AI-sourced items are tied to a check_in_id.
export async function deleteActionItemsForCheckIn(checkInId: string): Promise<void> {
  await db().from(TABLE).delete().eq('check_in_id', checkInId);
}

// Auto-create trackable items from a check-in's AI action steps. Skips any step
// whose exact text already exists for this client as an 'ai' item, so a step
// recurring across calls (or one already completed) is never re-created.
export async function syncAiActionItems(
  clientEmail: string,
  checkInId: string | null,
  steps: string[]
): Promise<number> {
  const cleaned = [...new Set((steps ?? []).map((s) => s.trim()).filter(Boolean))];
  if (!cleaned.length) return 0;

  const email = norm(clientEmail);
  const { data: existing } = await db()
    .from(TABLE)
    .select('text')
    .eq('client_email', email)
    .eq('source', 'ai');
  const seen = new Set((existing ?? []).map((r: { text: string }) => r.text));

  const toInsert = cleaned
    .filter((text) => !seen.has(text))
    .map((text) => ({
      client_email: email,
      text,
      source: 'ai' as const,
      check_in_id: checkInId,
      status: 'open' as const,
    }));
  if (!toInsert.length) return 0;

  // ignoreDuplicates guards against the unique index if two webhooks race.
  const { data } = await db().from(TABLE).upsert(toInsert, {
    onConflict: 'client_email,text',
    ignoreDuplicates: true,
  }).select('id, text');

  // Log each genuinely-new AI item on the client's journey timeline.
  for (const row of (data ?? []) as { id: string; text: string }[]) {
    await logEvent({
      clientEmail: email,
      type: 'action_item_created',
      title: row.text,
      refTable: TABLE,
      refId: row.id,
      metadata: { source: 'ai', check_in_id: checkInId },
    });
  }
  return data?.length ?? 0;
}
