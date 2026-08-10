'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ClientActionItem {
  id: string;
  text: string;
  status: 'open' | 'completed';
  source: 'admin' | 'ai';
  due_date: string | null;
  created_at: string;
}

// Module-level cache + pub/sub so every useActionItems() consumer (topbar bell,
// dashboard checklist, stat) shares one fetch and stays in sync after a toggle.
let cache: ClientActionItem[] | null = null;
const subscribers = new Set<() => void>();
function emit() { subscribers.forEach((fn) => fn()); }

async function fetchItems() {
  try {
    const r = await fetch('/api/me/action-items');
    if (!r.ok) { cache = cache ?? []; emit(); return; }
    const d = await r.json();
    cache = (d.items ?? []) as ClientActionItem[];
    emit();
  } catch {
    cache = cache ?? [];
    emit();
  }
}

export function useActionItems() {
  const [items, setItems] = useState<ClientActionItem[]>(cache ?? []);

  useEffect(() => {
    const update = () => setItems(cache ?? []);
    subscribers.add(update);
    if (cache === null) fetchItems();
    else update();
    return () => { subscribers.delete(update); };
  }, []);

  const toggle = useCallback(async (id: string, status: 'open' | 'completed') => {
    // Optimistic update, then reconcile with the server.
    cache = (cache ?? []).map((i) => (i.id === id ? { ...i, status } : i));
    emit();
    try {
      await fetch(`/api/me/action-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } finally {
      fetchItems();
    }
  }, []);

  const openItems = items.filter((i) => i.status === 'open');
  return { items, openItems, openCount: openItems.length, toggle, refresh: fetchItems };
}

// Returns 'overdue' | 'soon' | null for a due date (today is treated as soon).
export function dueState(due: string | null): 'overdue' | 'soon' | null {
  if (!due) return null;
  const d = new Date(due + 'T23:59:59');
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  if (d.getTime() < now.getTime()) return 'overdue';
  const soon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  return d.getTime() <= soon.getTime() ? 'soon' : null;
}
