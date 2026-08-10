import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { type Todo, type TodoCategory, type TodoPriority, type TodoList, type TodoSource, isTodoCategory, isTodoPriority, isTodoList, parseInlineTags } from '@/lib/todo-shared';

// Shares the Supabase service-role connection pattern used by lib/action-items.ts.
let _client: SupabaseClient | null = null;
function db() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  }
  return _client;
}

const TABLE = 'client_todos';

function norm(email: string) {
  return email.toLowerCase().trim();
}

// Open items first, then by manual drag order (sort_order, lower first), then by
// priority (1 highest), then by due date (soonest first, nulls last), then by
// assigned date (newest first). Un-reordered rows all share sort_order 0, so they
// fall through to the priority/date ordering until someone drags them.
function sortTodos(items: Todo[]): Todo[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if ((a.priority ?? 4) !== (b.priority ?? 4)) return (a.priority ?? 4) - (b.priority ?? 4);
    if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return a.assigned_date < b.assigned_date ? 1 : -1;
  });
}

export async function listTodos(clientEmail: string): Promise<Todo[]> {
  const { data } = await db().from(TABLE).select('*').eq('client_email', norm(clientEmail));
  return sortTodos((data ?? []) as Todo[]);
}

export async function getTodo(id: string): Promise<Todo | null> {
  const { data } = await db().from(TABLE).select('*').eq('id', id).maybeSingle();
  return (data as Todo) ?? null;
}

export async function createTodo(input: {
  client_email: string;
  text: string;
  category?: TodoCategory | null;
  priority?: TodoPriority;
  assigned_date?: string | null;
  due_date?: string | null;
  list?: TodoList;
  week?: number | null;
  created_by?: string | null;
  source?: TodoSource | null;
  check_in_id?: string | null;
  sort_order?: number;
}): Promise<Todo | null> {
  const row: Record<string, unknown> = {
    client_email: norm(input.client_email),
    text: input.text.trim(),
    category: input.category ?? null,
    due_date: input.due_date || null,
    created_by: input.created_by ?? null,
  };
  if (input.priority) row.priority = input.priority;
  if (input.sort_order != null) row.sort_order = input.sort_order;
  if (input.source) row.source = input.source;
  if (input.check_in_id) row.check_in_id = input.check_in_id;
  const hasExtras = !!input.list || input.week != null;
  if (input.list) row.list = input.list;
  if (input.week != null) row.week = input.week;
  // Let Postgres default assigned_date to current_date when not supplied.
  if (input.assigned_date) row.assigned_date = input.assigned_date;
  const first = await db().from(TABLE).insert(row).select().single();
  let data = first.data;
  // Resilience: if the `list`/`week` columns haven't been migrated yet, retry
  // without them so the core to-do bubble keeps working until the ALTER is run.
  if (first.error && hasExtras) {
    delete row.list; delete row.week;
    data = (await db().from(TABLE).insert(row).select().single()).data;
  }
  return (data as Todo) ?? null;
}

// How long one Discord "action items assigned" ping covers. A coach adding six
// to-dos — in one bulk paste or one at a time over a few minutes — should ping
// the client's channel once, not six times.
export const ASSIGN_PING_WINDOW_MIN = 30;

// True when this client already had a coach-assigned to-do land inside that
// window, ignoring the ids just created. If so their channel was already pinged
// and the caller should stay quiet.
export async function wasRecentlyAssigned(clientEmail: string, exceptIds: string[] = []): Promise<boolean> {
  const since = new Date(Date.now() - ASSIGN_PING_WINDOW_MIN * 60_000).toISOString();
  const { data } = await db()
    .from(TABLE)
    .select('id')
    .eq('client_email', norm(clientEmail))
    .eq('source', 'admin')
    .gte('created_at', since)
    .limit(exceptIds.length + 1); // enough rows that one must be from outside the batch
  return (data ?? []).some((r: { id: string }) => !exceptIds.includes(r.id));
}

// Optional open-ended week number (null = unscheduled). Returns null when the
// field is absent/blank, or false when present-but-invalid.
export function parseWeek(v: unknown): number | null | false {
  if (v == null || v === '') return null;
  const w = Number(v);
  return Number.isInteger(w) && w >= 1 && w <= 260 ? w : false;
}

export type TodoCreateFields = {
  category: TodoCategory;
  priority?: TodoPriority;
  assigned_date: string | null;
  due_date: string | null;
  list?: TodoList;
  week: number | null;
};

// A single item to create: its text, plus any priority/week baked into the line
// via inline tags (see parseInlineTags), which override the shared fields.
export type TodoCreateItem = { text: string; priority?: TodoPriority; week?: number };

// Validate the shared fields and collect one-or-many items from a create request
// body. Supports both the single ({ text }) and bulk ({ texts: [...] }) shapes so
// a coach can assign many actionables in one go. In bulk mode each line is run
// through parseInlineTags, so "Record the VSL p1 w2" sets that item's priority
// and week individually. Returns { error } on the first invalid field. Shared by
// the client + admin POST routes.
export function parseTodoCreate(
  body: Record<string, unknown>,
): { error: string } | { items: TodoCreateItem[]; fields: TodoCreateFields } {
  const isBulk = Array.isArray(body?.texts);
  const rawTexts: unknown[] = isBulk ? (body.texts as unknown[]) : [body?.text];
  const items = rawTexts
    .map((t) => (typeof t === 'string' ? t : ''))
    // Only bulk lines get inline-tag parsing; a single add is taken verbatim.
    .map((t): TodoCreateItem => (isBulk ? parseInlineTags(t) : { text: t.trim() }))
    .filter((it) => it.text);
  if (!items.length) return { error: 'Action item text is required' };
  if (!isTodoCategory(body?.category)) return { error: 'Invalid category' };
  const priority = Number(body?.priority);
  if (body?.priority != null && !isTodoPriority(priority)) return { error: 'Invalid priority' };
  if (body?.list != null && !isTodoList(body.list)) return { error: 'Invalid list' };
  const week = parseWeek(body?.week);
  if (week === false) return { error: 'Invalid week' };
  return {
    items,
    fields: {
      category: body.category as TodoCategory,
      priority: isTodoPriority(priority) ? priority : undefined,
      assigned_date: typeof body?.assigned_date === 'string' ? body.assigned_date : null,
      due_date: typeof body?.due_date === 'string' ? body.due_date : null,
      list: isTodoList(body?.list) ? body.list : undefined,
      week,
    },
  };
}

export type TodoUpdate = Partial<Pick<Todo, 'text' | 'category' | 'priority' | 'assigned_date' | 'due_date' | 'week' | 'done'>>;

export async function updateTodo(id: string, updates: TodoUpdate): Promise<Todo | null> {
  const patch: Record<string, unknown> = { ...updates };
  if (typeof updates.text === 'string') patch.text = updates.text.trim();
  if ('done' in updates) {
    patch.completed_at = updates.done ? new Date().toISOString() : null;
    if (!updates.done) patch.completed_by = null; // clear stamp when re-opened
  }
  const { data } = await db().from(TABLE).update(patch).eq('id', id).select().single();
  return (data as Todo) ?? null;
}

// Toggle (or set) completion, stamping who/when. `by` is 'client' or an admin
// email. Mirrors the old action-item setStatus so the compat routes behave the same.
export async function setTodoDone(id: string, done: boolean, by: string): Promise<Todo | null> {
  const { data } = await db().from(TABLE).update({
    done,
    completed_at: done ? new Date().toISOString() : null,
    completed_by: done ? by : null,
  }).eq('id', id).select().single();
  return (data as Todo) ?? null;
}

export async function deleteTodo(id: string): Promise<void> {
  await db().from(TABLE).delete().eq('id', id);
}

// Remove the to-dos auto-generated from a check-in (used when a check-in is
// deleted). Only AI-sourced items carry a check_in_id.
export async function deleteTodosForCheckIn(checkInId: string): Promise<void> {
  await db().from(TABLE).delete().eq('check_in_id', checkInId);
}

// Auto-create trackable to-dos from a check-in's AI action steps. Skips any step
// whose exact text already exists for this client as an 'ai' item, so a step
// recurring across calls (or one already completed) is never re-created. Folded
// in from the retired syncAiActionItems.
export async function syncAiTodos(
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
      list: 'individual' as const,
      done: false,
    }));
  if (!toInsert.length) return 0;

  const { data } = await db().from(TABLE).insert(toInsert).select('id');
  return data?.length ?? 0;
}

// Persist a manual drag order. Each row is scoped to the owning client_email, so
// a caller can only reorder their own (or, via the admin route, one client's) rows.
export async function reorderTodos(clientEmail: string, items: { id: string; sort_order: number }[]): Promise<void> {
  const email = norm(clientEmail);
  await Promise.all(
    items.map((it) => db().from(TABLE).update({ sort_order: it.sort_order }).eq('id', it.id).eq('client_email', email)),
  );
}

// Build a validated update from a request body (shared by the client + admin
// PATCH routes). Returns { error } when a supplied field is invalid.
export function parseTodoUpdate(body: Record<string, unknown>): TodoUpdate | { error: string } {
  const updates: TodoUpdate = {};
  if ('text' in body) {
    const t = typeof body.text === 'string' ? body.text.trim() : '';
    if (!t) return { error: 'Action item text is required' };
    updates.text = t;
  }
  if ('category' in body) {
    if (!isTodoCategory(body.category)) return { error: 'Invalid category' };
    updates.category = body.category;
  }
  if ('priority' in body) {
    const p = Number(body.priority);
    if (!isTodoPriority(p)) return { error: 'Invalid priority' };
    updates.priority = p;
  }
  if ('assigned_date' in body && typeof body.assigned_date === 'string') updates.assigned_date = body.assigned_date;
  if ('due_date' in body) updates.due_date = (typeof body.due_date === 'string' && body.due_date) ? body.due_date : null;
  if ('week' in body) {
    if (body.week == null || body.week === '') updates.week = null;
    else {
      const w = Number(body.week);
      if (!Number.isInteger(w) || w < 1 || w > 260) return { error: 'Invalid week' };
      updates.week = w;
    }
  }
  if ('done' in body) updates.done = !!body.done;
  return updates;
}

// ── Action-item compatibility view ──────────────────────────────────────────
// The old action_items system was folded into client_todos. These helpers let
// the existing "action item" API routes + UI keep their shape while reading and
// writing the unified table. An action item is just a to-do, viewed simply.

export type ActionItemView = {
  id: string;
  client_email: string;
  text: string;
  status: 'open' | 'completed';
  source: 'client' | 'admin' | 'ai';
  due_date: string | null;
  assigned_by: string | null;
  check_in_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
};

export function todoToActionItem(t: Todo): ActionItemView {
  // Provenance: explicit source column wins; else infer from who created it.
  const source: ActionItemView['source'] =
    t.source ?? (t.created_by === 'client' || t.created_by == null ? 'client' : 'admin');
  return {
    id: t.id,
    client_email: t.client_email,
    text: t.text,
    status: t.done ? 'completed' : 'open',
    source,
    due_date: t.due_date,
    assigned_by: t.created_by,
    check_in_id: t.check_in_id,
    completed_at: t.completed_at,
    completed_by: t.completed_by,
    created_at: t.created_at,
  };
}

// Action-item-style listing over the unified table: open first, then by due date
// (soonest first, nulls last), then newest — matching the old action_items sort.
export async function listActionItemsView(
  clientEmail: string,
  opts: { includeCompleted?: boolean } = {}
): Promise<ActionItemView[]> {
  const all = await listTodos(clientEmail);
  const items = all
    .filter((t) => (opts.includeCompleted ? true : !t.done))
    .map(todoToActionItem);
  return items.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1;
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
}
