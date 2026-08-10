'use client';

import { useEffect, useState } from 'react';
import { OnboardingTour, type TourStep } from '@/components/onboarding/onboarding-tour';

// Drop-in guided tour for any page. Auto-starts ONCE per page PER MEMBER on first
// visit (remembered in localStorage under `tour_<id>_<email>`) and never again.
// Keying by member email (not just the browser) means every member gets the tour
// once, even on a shared browser that's already seen it for another account.
// Pages just add data-tour="…" to the elements referenced in `steps`.
export function PageTour({ id, steps, delay = 850 }: { id: string; steps: TourStep[]; delay?: number }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null); // null = unresolved

  // Resolve the signed-in member so the seen-flag is per-account.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (!cancelled) setEmail(u?.email ? String(u.email).toLowerCase().trim() : ''); })
      .catch(() => { if (!cancelled) setEmail(''); });
    return () => { cancelled = true; };
  }, []);

  const seenKey = email ? `tour_${id}_${email}` : null;

  useEffect(() => {
    if (email === null || !seenKey) return; // wait until auth resolves
    try { if (localStorage.getItem(seenKey)) return; } catch { return; }
    const t = setTimeout(() => setOpen(true), delay);
    return () => clearTimeout(t);
  }, [seenKey, delay, email]);

  const close = () => {
    setOpen(false);
    try { if (seenKey) localStorage.setItem(seenKey, '1'); } catch { /* ignore */ }
  };

  return <OnboardingTour steps={steps} open={open} onClose={close} />;
}
