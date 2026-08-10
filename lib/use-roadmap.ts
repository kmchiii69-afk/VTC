'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { phasesForVariant, type RoadmapVariant } from '@/lib/roadmap-variant';
import { flatItemIds, totalItems, type RoadmapPhase } from '@/lib/roadmap-data';

// Shared roadmap-completion state. Module-level cache + pub/sub means the
// dashboard cards and the /roadmap page read one fetch and stay in sync after
// any toggle (check on one surface → reflected on the other instantly).
let cache: Set<string> | null = null;
let openCache = false; // "Existing Client" → roadmap fully open (no phase locking)
// Which roadmap this member sees — "Creative Specialist" members get their own
// phase set, which fully replaces the standard one. Server-resolved.
let variantCache: RoadmapVariant = 'default';
const subscribers = new Set<() => void>();
function emit() { subscribers.forEach((fn) => fn()); }

async function fetchProgress() {
  try {
    const r = await fetch('/api/progress/roadmap');
    if (r.ok) {
      const d = await r.json();
      cache = new Set<string>(d.completed ?? []);
      openCache = !!d.open;
      variantCache = d.variant === 'creative' ? 'creative' : 'default';
    } else {
      cache = cache ?? new Set();
    }
  } catch {
    cache = cache ?? new Set();
  }
  emit();
}

export function useRoadmap() {
  const [stored, setStored] = useState<Set<string>>(cache ?? new Set());
  const [open, setOpen] = useState<boolean>(openCache);
  const [variant, setVariant] = useState<RoadmapVariant>(variantCache);

  useEffect(() => {
    const update = () => { setStored(new Set(cache ?? new Set())); setOpen(openCache); setVariant(variantCache); };
    subscribers.add(update);
    if (cache === null) fetchProgress();
    else update();
    return () => { subscribers.delete(update); };
  }, []);

  // Optimistic toggle, then reconcile with the server (which also enforces order).
  const toggle = useCallback(async (itemId: string) => {
    const cur = cache ?? new Set<string>();
    const nowCompleted = !cur.has(itemId);
    const next = new Set(cur);
    if (nowCompleted) next.add(itemId); else next.delete(itemId);
    cache = next;
    emit();
    try {
      await fetch('/api/progress/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, completed: nowCompleted }),
      });
    } finally {
      fetchProgress();
    }
  }, []);

  const phases: RoadmapPhase[] = useMemo(() => phasesForVariant(variant), [variant]);

  // `roadmap_progress` holds every id a member has ever ticked, including ids
  // from the OTHER roadmap (onboarding steps, the retired r10–r45 range). Scope
  // the set to the roadmap they're actually on so counts and percentages match
  // the steps on screen.
  const completed = useMemo(() => {
    const ids = new Set(flatItemIds(phases));
    return new Set([...stored].filter((id) => ids.has(id)));
  }, [stored, phases]);

  return {
    completed, toggle, open, loaded: cache !== null,
    variant, phases, total: totalItems(phases),
  };
}
