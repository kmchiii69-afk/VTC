// Shared to-do constants/types with NO server dependencies, so both the server
// data layer (lib/todos.ts) and client components can import them safely.

export const TODO_CATEGORIES = ['Fulfilment', 'Sales', 'Content', 'Systems'] as const;
export type TodoCategory = (typeof TODO_CATEGORIES)[number];

// Which list a to-do belongs to. Used by the Acquisition "Actionables" board,
// which splits a member's items into a Program tab and an Individual tab.
// Everything else (the floating to-do bubble, the CSM view) is 'individual'.
export const TODO_LISTS = ['program', 'individual'] as const;
export type TodoList = (typeof TODO_LISTS)[number];
export const DEFAULT_TODO_LIST: TodoList = 'individual';
export function isTodoList(v: unknown): v is TodoList {
  return typeof v === 'string' && (TODO_LISTS as readonly string[]).includes(v);
}

// Priority 1 (highest) → 4 (lowest). Used for the dropdown + list ordering.
export const TODO_PRIORITIES = [1, 2, 3, 4] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];
export const DEFAULT_TODO_PRIORITY: TodoPriority = 3;

export function isTodoPriority(v: unknown): v is TodoPriority {
  return typeof v === 'number' && (TODO_PRIORITIES as readonly number[]).includes(v);
}

// Tag colors per category (used by both the client bubble and the CSM view).
export const TODO_CATEGORY_COLOR: Record<TodoCategory, string> = {
  Fulfilment: '#4ade80',
  Sales: '#c9a455',
  Content: '#60a5fa',
  Systems: '#a78bfa',
};

// Provenance of a to-do, folded in from the retired action_items system:
//   client → the member added it themselves
//   admin  → a coach/admin assigned it
//   ai     → auto-extracted from a coaching call (shows a "From call" badge)
export const TODO_SOURCES = ['client', 'admin', 'ai'] as const;
export type TodoSource = (typeof TODO_SOURCES)[number];

export interface Todo {
  id: string;
  client_email: string;
  text: string;
  category: TodoCategory | null; // null for merged action-items / AI call items
  priority: number;             // 1 (highest) → 4 (lowest)
  assigned_date: string;        // 'YYYY-MM-DD'
  due_date: string | null;      // 'YYYY-MM-DD' | null
  list: TodoList;               // 'program' | 'individual' (defaults 'individual')
  week: number | null;          // open-ended week number; null = unscheduled
  sort_order: number;           // manual drag order within a week group (lower first)
  done: boolean;
  created_by: string | null;    // 'client' or an admin email (who assigned it)
  source: TodoSource | null;    // provenance; null treated as 'admin'/'client' by created_by
  check_in_id: string | null;   // set for AI items extracted from a check-in
  completed_by: string | null;  // 'client' or an admin email
  completed_at: string | null;
  created_at: string;
}

export function isTodoCategory(v: unknown): v is TodoCategory {
  return typeof v === 'string' && (TODO_CATEGORIES as readonly string[]).includes(v);
}

// Bulk-add convenience: an admin can bake a priority/week into an action-item
// line with inline tags, e.g. "Record the VSL p1 w2" or "week 3 Book calls p2".
// Recognised tokens (case-insensitive, anywhere in the line, as whole words):
//   priority → p1 … p4          (out-of-range like p9 is left as literal text)
//   week     → week 2 / wk2 / w2 (1–260; anything larger is left as literal text)
// Tokens are stripped from the returned text; whichever value is found wins over
// the shared dropdowns. Returns priority/week only when a valid tag was present.
const PRIORITY_TAG = /\bp([1-4])\b/i;
const WEEK_TAG = /\b(?:week|wk|w)\s?(\d{1,3})\b/i;

export function parseInlineTags(raw: string): { text: string; priority?: TodoPriority; week?: number } {
  let text = typeof raw === 'string' ? raw : '';
  let priority: TodoPriority | undefined;
  let week: number | undefined;

  const wk = text.match(WEEK_TAG);
  if (wk) {
    const n = Number(wk[1]);
    if (n >= 1 && n <= 260) { week = n; text = text.replace(wk[0], ' '); }
  }
  const pr = text.match(PRIORITY_TAG);
  if (pr) {
    const n = Number(pr[1]) as TodoPriority;
    if (isTodoPriority(n)) { priority = n; text = text.replace(pr[0], ' '); }
  }

  return { text: text.replace(/\s{2,}/g, ' ').trim(), priority, week };
}
