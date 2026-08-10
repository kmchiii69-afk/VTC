'use client';

import { usePathname } from 'next/navigation';

// Fades each route in on navigation so pages/sections resolve smoothly instead
// of popping in. Keyed by pathname so the animation replays on every change.
// Opacity-only (no transform) so it never creates a containing block that would
// displace position:fixed overlays. Honors prefers-reduced-motion via the CSS.
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="route-fade">
      {children}
    </div>
  );
}
