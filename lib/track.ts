'use client';

// Client-side content-engagement beacon. Fires a best-effort POST to
// /api/me/track when a client opens an SOP, watches a module, plays a
// recording, or watches a section guide. The server dedupes within a time
// window; this module also guards against firing the same view twice in one
// page load. Failures are swallowed — tracking must never disrupt the UI.

export type ViewType = 'sop_view' | 'module_view' | 'recording_view' | 'guide_view';

const sentThisLoad = new Set<string>();

export function trackView(type: ViewType, refId: string, title?: string): void {
  if (!refId) return;
  const key = `${type}:${refId}`;
  if (sentThisLoad.has(key)) return;
  sentThisLoad.add(key);
  try {
    fetch('/api/me/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, refId, title }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best-effort */
  }
}
