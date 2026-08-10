'use client';

// Reusable to-do CRUD list. Talks to a REST base that exposes:
//   GET    {apiBase}          → { items: Todo[] }
//   POST   {apiBase}          → create   { text, category, assigned_date, due_date }
//   PATCH  {apiBase}/{id}     → edit     (any of text/category/assigned_date/due_date/done)
//   DELETE {apiBase}/{id}     → remove
// Used by the client bubble (/api/me/todos) and the admin CSM view
// (/api/admin/clients/{email}/todos).

import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import { TODO_CATEGORIES, TODO_CATEGORY_COLOR, TODO_PRIORITIES, DEFAULT_TODO_PRIORITY, type Todo, type TodoCategory, type TodoPriority, type TodoList } from '@/lib/todo-shared';

const G = '#c9a455';
const cream = '#f0e8d4';
const faint = '#857a67';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmt(d: string | null): string {
  if (!d) return '—';
  const t = new Date(d + 'T00:00:00');
  return isNaN(t.getTime()) ? '—' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const field: React.CSSProperties = {
  padding: '7px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,164,85,0.2)',
  borderRadius: 8, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, outline: 'none', colorScheme: 'dark',
};

function CategoryTag({ c }: { c: TodoCategory }) {
  const color = TODO_CATEGORY_COLOR[c] ?? G;
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', color,
      background: `${color}1a`, border: `1px solid ${color}44`, borderRadius: 6, padding: '1px 7px' }}>
      {c}
    </span>
  );
}

const PRIORITY_COLOR: Record<number, string> = { 1: '#f87171', 2: '#f59e0b', 3: '#c9a455', 4: '#857a67' };
function PriorityTag({ p }: { p: number }) {
  const color = PRIORITY_COLOR[p] ?? faint;
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', color,
      background: `${color}1a`, border: `1px solid ${color}44`, borderRadius: 6, padding: '1px 7px' }}>
      P{p}
    </span>
  );
}

interface Draft { text: string; category: TodoCategory; priority: TodoPriority; assigned_date: string; due_date: string; week: string; }
const emptyDraft = (): Draft => ({ text: '', category: 'Fulfilment', priority: DEFAULT_TODO_PRIORITY, assigned_date: todayStr(), due_date: '', week: '' });

export function TodoManager({ apiBase, showCategory = true, showWeek = false, list, createApiBase }: {
  apiBase: string; showCategory?: boolean; showWeek?: boolean; list?: TodoList;
  // When set, new items POST here instead of apiBase (GET/PATCH/DELETE still use
  // apiBase). Used to broadcast admin-added Program actionables to all members.
  createApiBase?: string;
}) {
  const [items, setItems] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [add, setAdd] = useState<Draft>(emptyDraft());
  // Bulk mode: the text box becomes a textarea, one action item per line, all
  // sharing the category/priority/week/dates chosen below.
  const [bulk, setBulk] = useState(false);
  const addTexts = bulk
    ? add.text.split('\n').map((s) => s.trim()).filter(Boolean)
    : (add.text.trim() ? [add.text.trim()] : []);

  const load = useCallback(() => {
    fetch(apiBase, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!addTexts.length || busy) return;
    setBusy(true);
    try {
      const shared = { category: add.category, priority: add.priority, assigned_date: add.assigned_date || todayStr(), due_date: add.due_date || null, list, week: add.week ? Number(add.week) : null };
      const payload = bulk ? { ...shared, texts: addTexts } : { ...shared, text: addTexts[0] };
      const res = await fetch(createApiBase ?? apiBase, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) { setAdd(emptyDraft()); load(); }
    } finally { setBusy(false); }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) load();
    } finally { setBusy(false); }
  };

  // Ticking a box has to feel instant, so flip it locally first and persist in the
  // background — going through `patch` meant every check waited on the PATCH and
  // then on a full list refetch before the tick even appeared. Roll back if the
  // write fails. No `busy` here either: that re-rendered (and disabled) the whole
  // list mid-click.
  const toggleDone = (t: Todo) => {
    const next = !t.done;
    setItems((prev) => prev.map((i) => (i.id === t.id ? { ...i, done: next } : i)));
    fetch(`${apiBase}/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: next }),
    })
      .then((r) => { if (!r.ok) throw new Error('failed'); })
      .catch(() => setItems((prev) => prev.map((i) => (i.id === t.id ? { ...i, done: t.done } : i))));
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' });
      if (res.ok) load();
    } finally { setBusy(false); }
  };

  const startEdit = (t: Todo) => {
    setEditingId(t.id);
    setDraft({ text: t.text, category: t.category ?? 'Fulfilment', priority: (t.priority as TodoPriority) || DEFAULT_TODO_PRIORITY, assigned_date: t.assigned_date, due_date: t.due_date ?? '', week: t.week != null ? String(t.week) : '' });
  };
  const saveEdit = async (id: string) => {
    if (!draft.text.trim()) return;
    await patch(id, { text: draft.text.trim(), category: draft.category, priority: draft.priority, assigned_date: draft.assigned_date, due_date: draft.due_date || null, week: draft.week ? Number(draft.week) : null });
    setEditingId(null);
  };

  // ── Drag-and-drop reorder (within a week group) ──────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const itemsRef = useRef<Todo[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const sameGroup = (a: Todo, b: Todo) =>
    (a.week ?? null) === (b.week ?? null) && (a.list ?? 'individual') === (b.list ?? 'individual');

  // Live-preview: move the dragged item to the hovered row's slot, but only
  // within the same week+list group (dragging across weeks is a no-op).
  const onDragEnterRow = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setItems((prev) => {
      const from = prev.findIndex((t) => t.id === dragId);
      const to = prev.findIndex((t) => t.id === targetId);
      if (from < 0 || to < 0 || !sameGroup(prev[from], prev[to])) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // On drop: number each week group 0..n from the current on-screen order and
  // persist. reorder endpoint lives at `${apiBase}/reorder`.
  const persistOrder = async () => {
    if (!dragId) return;
    setDragId(null);
    const rows = list ? itemsRef.current.filter((t) => (t.list ?? 'individual') === list) : itemsRef.current;
    const counters = new Map<number | null, number>();
    const payload = rows.map((t) => {
      const w = t.week ?? null;
      const n = counters.get(w) ?? 0;
      counters.set(w, n + 1);
      return { id: t.id, sort_order: n };
    });
    try {
      await fetch(`${apiBase}/reorder`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: payload }),
      });
    } finally { load(); }
  };

  const iconBtn = (color: string): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer', color, padding: 3, display: 'inline-flex', alignItems: 'center',
  });

  // Numbers-only week input (open-ended; blank = unscheduled).
  const weekInput = (value: string, onChange: (v: string) => void) => (
    <input type="text" inputMode="numeric" title="Week #" placeholder="Week"
      value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      style={{ ...field, width: 72 }} />
  );

  // Only show this list's items (the Actionables board splits program/individual;
  // everything else passes list=undefined and sees them all).
  const shown = list ? items.filter((t) => (t.list ?? 'individual') === list) : items;

  // When grouping by week: ascending week numbers, with unscheduled items last.
  const groups: { week: number | null; items: Todo[] }[] = (() => {
    if (!showWeek) return [{ week: null, items: shown }];
    const byWeek = new Map<number | null, Todo[]>();
    for (const t of shown) {
      const w = t.week ?? null;
      if (!byWeek.has(w)) byWeek.set(w, []);
      byWeek.get(w)!.push(t);
    }
    const weeks = [...byWeek.keys()].filter((w): w is number => w !== null).sort((a, b) => a - b);
    const out: { week: number | null; items: Todo[] }[] = weeks.map((w) => ({ week: w, items: byWeek.get(w)! }));
    if (byWeek.has(null)) out.push({ week: null, items: byWeek.get(null)! });
    return out;
  })();

  const renderRow = (t: Todo) => editingId === t.id ? (
    <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12,
      border: `1px solid ${G}55`, background: 'rgba(201,164,85,0.05)' }}>
      <input value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} style={{ ...field, width: '100%', boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {showCategory && (
          <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as TodoCategory }))} style={field}>
            {TODO_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) as TodoPriority }))} style={field} title="Priority (1 = highest)">
          {TODO_PRIORITIES.map((p) => <option key={p} value={p}>P{p}</option>)}
        </select>
        {showWeek && weekInput(draft.week, (v) => setDraft((d) => ({ ...d, week: v })))}
        <input type="date" title="Date assigned" value={draft.assigned_date} onChange={(e) => setDraft((d) => ({ ...d, assigned_date: e.target.value }))} style={field} />
        <label style={{ fontSize: 10, color: faint, display: 'flex', flexDirection: 'column', gap: 2 }}>Due Date
          <input type="date" value={draft.due_date} onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))} style={field} /></label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={() => saveEdit(t.id)} style={iconBtn('#4ade80')} title="Save"><Check size={16} /></button>
          <button onClick={() => setEditingId(null)} style={iconBtn(faint)} title="Cancel"><X size={16} /></button>
        </div>
      </div>
    </div>
  ) : (
    <div key={t.id}
      draggable={showWeek}
      onDragStart={showWeek ? (e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; } : undefined}
      onDragEnter={showWeek ? () => onDragEnterRow(t.id) : undefined}
      onDragOver={showWeek ? (e) => { if (dragId) e.preventDefault(); } : undefined}
      onDragEnd={showWeek ? persistOrder : undefined}
      style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12,
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.1)',
      opacity: t.done ? 0.6 : dragId === t.id ? 0.4 : 1 }}>
      {showWeek && (
        <span title="Drag to reorder" style={{ cursor: 'grab', color: 'rgba(201,164,85,0.4)', display: 'flex', flexShrink: 0, marginTop: 1 }}>
          <GripVertical size={15} />
        </span>
      )}
      <button onClick={() => toggleDone(t)} title={t.done ? 'Mark not done' : 'Mark done'}
        style={{ ...iconBtn(t.done ? '#4ade80' : faint), marginTop: 1, width: 18, height: 18, borderRadius: 5,
          border: `1.5px solid ${t.done ? '#4ade80' : 'rgba(201,164,85,0.4)'}`, justifyContent: 'center', flexShrink: 0 }}>
        {t.done && <Check size={12} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: t.done ? faint : cream, lineHeight: 1.4,
          textDecoration: t.done ? 'line-through' : 'none', fontFamily: "'DM Sans', sans-serif",
          overflowWrap: 'anywhere' }}>{t.text}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}>
          <PriorityTag p={t.priority} />
          {showCategory && t.category && <CategoryTag c={t.category} />}
          {!showWeek && t.week != null && (
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', color: G,
              background: `${G}1a`, border: `1px solid ${G}44`, borderRadius: 6, padding: '1px 7px' }}>W{t.week}</span>
          )}
          <span style={{ fontSize: 10.5, color: faint }}>Assigned {fmt(t.assigned_date)}</span>
          {t.due_date && <span style={{ fontSize: 10.5, color: faint }}>· Due {fmt(t.due_date)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <button onClick={() => startEdit(t)} style={iconBtn('rgba(201,164,85,0.7)')} title="Edit"><Pencil size={14} /></button>
        <button onClick={() => remove(t.id)} style={iconBtn('rgba(248,113,113,0.6)')} title="Delete"><Trash2 size={14} /></button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Add row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px', borderRadius: 12,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.14)' }}>
        {/* Single ⇄ Bulk toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setBulk((b) => !b)} type="button" style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
            fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
            color: bulk ? G : faint,
          }}>{bulk ? '↩ Add one at a time' : '≡ Add multiple'}</button>
        </div>
        {bulk ? (
          <textarea value={add.text} onChange={(e) => setAdd((a) => ({ ...a, text: e.target.value }))}
            rows={5} placeholder={showWeek
              ? 'One action item per line…\nDraft the offer doc p1 w1\nRecord the VSL p2 w2\nDM 20 leads w1'
              : 'One action item per line…\nDraft the offer doc p1\nRecord the VSL p2\nDM 20 leads'}
            style={{ ...field, width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }} />
        ) : (
          <input value={add.text} onChange={(e) => setAdd((a) => ({ ...a, text: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
            placeholder="Add an action item…" style={{ ...field, width: '100%', boxSizing: 'border-box' }} />
        )}
        {bulk && (
          <span style={{ fontSize: 10.5, color: faint, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
            {addTexts.length > 0 && <>{addTexts.length} item{addTexts.length === 1 ? '' : 's'} — </>}
            fields below apply to all. Tip: type <code style={{ color: G }}>p1</code>–<code style={{ color: G }}>p4</code>
            {showWeek && <> or <code style={{ color: G }}>w2</code> / <code style={{ color: G }}>week 2</code></>} in a line to set that item’s priority{showWeek ? ' & week' : ''}.
          </span>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {showCategory && (
            <select value={add.category} onChange={(e) => setAdd((a) => ({ ...a, category: e.target.value as TodoCategory }))} style={field}>
              {TODO_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select value={add.priority} onChange={(e) => setAdd((a) => ({ ...a, priority: Number(e.target.value) as TodoPriority }))} style={field} title="Priority (1 = highest)">
            {TODO_PRIORITIES.map((p) => <option key={p} value={p}>P{p}</option>)}
          </select>
          {showWeek && weekInput(add.week, (v) => setAdd((a) => ({ ...a, week: v })))}
          <input type="date" title="Date assigned" value={add.assigned_date} onChange={(e) => setAdd((a) => ({ ...a, assigned_date: e.target.value }))} style={field} />
          <label style={{ fontSize: 10, color: faint, display: 'flex', flexDirection: 'column', gap: 2 }}>
            Due Date
            <input type="date" value={add.due_date} onChange={(e) => setAdd((a) => ({ ...a, due_date: e.target.value }))} style={field} />
          </label>
          <button onClick={create} disabled={busy || !addTexts.length} style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
            background: addTexts.length ? G : 'rgba(201,164,85,0.18)', border: 'none',
            color: addTexts.length ? '#0a0806' : 'rgba(240,232,212,0.4)', fontFamily: "'DM Sans', sans-serif",
            fontSize: 12.5, fontWeight: 700, cursor: addTexts.length && !busy ? 'pointer' : 'default',
          }}><Plus size={14} /> {bulk && addTexts.length > 1 ? `Add ${addTexts.length}` : 'Add'}</button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ fontSize: 12.5, color: faint }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ fontSize: 12.5, color: faint, padding: '4px 2px' }}>Nothing here yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map((g) => (
            <div key={g.week ?? 'none'} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {showWeek && (
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.18em',
                  textTransform: 'uppercase', fontWeight: 700, color: g.week != null ? G : faint, marginTop: 2 }}>
                  {g.week != null ? `Week ${g.week}` : 'Unscheduled'}
                </div>
              )}
              {g.items.map(renderRow)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
