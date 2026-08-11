'use client';

// Shared page background. Now unified onto the app-wide "Waves" flow shader so
// every page matches the theme (plum → rose → blush → cream). Kept as a thin
// wrapper (same `<MeshBg />` call sites) that renders the Waves canvas fixed
// behind the page. The `speed` prop is accepted for compatibility and ignored.
import { WavesBackground } from '@/components/ui/waves-shader';

export function MeshBg({ speed }: { speed?: number }) {
  void speed;
  return (
    <div className="!fixed inset-0 w-full h-full" style={{ zIndex: 0, pointerEvents: 'none' }} aria-hidden>
      <WavesBackground className="h-full w-full" />
    </div>
  );
}
