'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { isVideoActive, subscribeVideoActive } from '@/lib/video-active';

// Lazy-loads @paper-design/shaders-react MeshGradient — same approach as login page.
// Usage: <MeshBg speed={0.25} />
// All pages share the same amber-gold-black color stops for visual continuity.

type MeshGradientType = React.ComponentType<{
  className?: string;
  colors?: string[];
  speed?: number;
}>;

let _Comp: MeshGradientType | null = null;

const COLORS = ['#000000', '#160705', '#8a1a14', '#F55A4E', '#000000'];

// Static fallback that visually matches the live gradient. Rendered while the
// shader is still loading AND whenever a video player is on screen, so the
// constant WebGL redraw never competes with video playback.
const STATIC_BG = `linear-gradient(135deg, ${COLORS.join(', ')})`;

export function MeshBg({ speed = 0.25 }: { speed?: number }) {
  const [Comp, setComp] = useState<MeshGradientType | null>(_Comp);
  const videoActive = useSyncExternalStore(
    subscribeVideoActive,
    isVideoActive,
    () => false, // server snapshot
  );

  useEffect(() => {
    if (_Comp) return; // already cached — useState seeded it, nothing to do
    import('@paper-design/shaders-react').then((mod) => {
      _Comp = mod.MeshGradient as MeshGradientType;
      setComp(_Comp);
    }).catch(() => {});
  }, []);

  // Always paint the static gradient underneath; layer the live shader on top
  // once it's ready. This removes the black flash that happened when the WebGL
  // canvas re-mounted on a route change and was blank for a frame before paint.
  return (
    <>
      <div className="!fixed inset-0 w-full h-full" style={{ background: STATIC_BG }} />
      {Comp && !videoActive && (
        <Comp className="!fixed inset-0 w-full h-full" colors={COLORS} speed={speed} />
      )}
    </>
  );
}
