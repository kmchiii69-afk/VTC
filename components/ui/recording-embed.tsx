'use client';

import { memo, useEffect, useRef } from 'react';
import { acquireVideoActive } from '@/lib/video-active';

// Renders an admin-provided embed snippet (raw HTML). Only admins can add
// recordings, so this HTML is trusted input.
//
// IMPORTANT: <script> tags inserted via innerHTML do NOT run. Script-based
// players (Vidalytics, Wistia, etc.) ship a <div> placeholder + a loader
// <script>, so we re-create every script node after injecting the markup —
// otherwise the placeholder just shows a black box. Plain <iframe> embeds
// (e.g. Fathom) have no script and render either way.
//
// Memoized + guarded so the markup is injected exactly once per html value: a
// parent re-render (e.g. typing in the "Ask about this call" box) must never
// re-inject and reload the iframe, which would reset a playing video.
function RecordingEmbedImpl({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const injected = useRef<string | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    // Already injected this exact markup — leave the live player untouched.
    if (injected.current === html) return;
    injected.current = html;
    container.innerHTML = html;

    const scripts = Array.from(container.querySelectorAll('script'));
    for (const old of scripts) {
      const s = document.createElement('script');
      for (const attr of Array.from(old.attributes)) s.setAttribute(attr.name, attr.value);
      s.text = old.textContent || '';
      old.parentNode?.replaceChild(s, old);
    }
  }, [html]);

  // While this player is on screen, ask the page background to go static so the
  // WebGL shader stops stealing GPU time from video playback.
  useEffect(() => acquireVideoActive(), []);

  return (
    <div
      ref={ref}
      className="recording-embed"
      style={{ width: '100%', borderRadius: 12, overflow: 'hidden', background: '#000', isolation: 'isolate' }}
    />
  );
}

export const RecordingEmbed = memo(RecordingEmbedImpl);
