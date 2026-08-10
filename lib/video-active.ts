'use client';

// Tracks whether any embedded video player is currently mounted on the page.
//
// The portal/select/hub pages render a continuously-animating WebGL background
// (MeshBg). That per-frame GPU + main-thread work competes with embedded video
// players (Fathom / Vidalytics iframes), which is what made recordings stutter
// while playing and stall after a pause. When a player mounts we flip this
// signal so MeshBg drops to a static gradient and frees the GPU; when the last
// player unmounts the live shader resumes.

let count = 0;
const subscribers = new Set<() => void>();

function emit() {
  for (const cb of subscribers) cb();
}

// Call when a video player mounts; returns a release fn for unmount. Reference
// counted so multiple open players keep the background static until all close.
export function acquireVideoActive(): () => void {
  count += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    emit();
  };
}

export function isVideoActive(): boolean {
  return count > 0;
}

export function subscribeVideoActive(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
