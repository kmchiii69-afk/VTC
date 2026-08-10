'use client';

import { useEffect, useState } from 'react';

// Bottom-right corner is shared real estate: globally-mounted round FABs (the
// to-do + leaderboard bubbles, marked with `data-corner-fab`) live there, and
// individual pages sometimes pin their own floating content there too (e.g. the
// roadmap's quick-redirect pills). This hook measures whatever corner FABs are
// actually rendered right now and returns the `bottom` (px from the viewport
// bottom) a page's floating content should use to sit clear ABOVE them — so it
// never overlaps, and auto-adjusts as FABs appear/disappear across pages.
export function useCornerClearance(base = 28, gap = 16): number {
  const [clearance, setClearance] = useState(base);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Corner FABs are position:fixed, so `offsetParent` is always null —
        // detect visibility via the bounding box instead (a non-rendered FAB is
        // absent from the DOM entirely, since its component returns null).
        const rects = Array.from(document.querySelectorAll<HTMLElement>('[data-corner-fab]'))
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0);
        if (!rects.length) { setClearance(base); return; }
        const vh = window.innerHeight;
        // Distance from the viewport bottom to the TOP of the highest FAB.
        const highest = Math.max(...rects.map((r) => vh - r.top));
        setClearance(Math.max(base, highest + gap));
      });
    };

    measure();
    window.addEventListener('resize', measure);
    // FABs mount asynchronously (after their role fetch) and vary per page, so
    // watch the DOM for them appearing/disappearing.
    const mo = new MutationObserver(measure);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', measure);
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [base, gap]);

  return clearance;
}
