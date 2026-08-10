/* Client-side only — granular VSL/video engagement tracking. Two sinks per
 * event: our own funnel_events pipeline (lib/funnel-tracker.ts — so the admin
 * dashboard can show a Video Analytics panel) AND Vercel Web Analytics custom
 * events (already installed via <Analytics /> in app/layout.tsx — free to use,
 * shows up in the Vercel dashboard's Events tab as a second, zero-setup view). */

import { trackEvent } from './funnel-tracker';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VercelTrack = (name: string, properties?: Record<string, any>) => void;

function vercelTrack(): VercelTrack | null {
  // Avoid a hard import so this file works even if @vercel/analytics isn't
  // mounted yet (e.g. before hydration) — grabbed lazily off the window shim
  // that the <Analytics /> component installs.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).va ? (name: string, props?: Record<string, unknown>) => (window as any).va('event', { name, data: props }) : null;
  } catch { return null; }
}

function compressSegments(seconds: number[]): { s: number; e: number }[] {
  if (seconds.length === 0) return [];
  const sorted = [...seconds].sort((a, b) => a - b);
  const ranges: { s: number; e: number }[] = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) { end = sorted[i]; }
    else { ranges.push({ s: start, e: end }); start = sorted[i]; end = sorted[i]; }
  }
  ranges.push({ s: start, e: end });
  return ranges;
}

export interface VideoTrackerConfig {
  funnel: string;
  videoTitle: string;
}

export class VideoTracker {
  private config: VideoTrackerConfig;
  private milestonesHit = new Set<number>();
  private totalWatchTime = 0;
  private lastPlayTime = 0;
  private isPlaying = false;
  private highWaterMark = 0;
  private seekCount = 0;
  private rewindCount = 0;
  private playCount = 0;
  private pauseCount = 0;
  private lastDropOffSecond = 0;
  private lastKnownDuration = 0;
  private disposed = false;
  private viewedSeconds = new Set<number>();
  private boundVisibilityHandler: () => void;
  private boundPageHideHandler: () => void;

  constructor(config: VideoTrackerConfig) {
    this.config = config;
    this.boundVisibilityHandler = () => {
      if (document.visibilityState === 'hidden' && this.playCount > 0 && !this.disposed) this.endSession();
    };
    this.boundPageHideHandler = () => {
      if (this.playCount > 0 && !this.disposed) this.endSession();
    };
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
    window.addEventListener('pagehide', this.boundPageHideHandler);
  }

  private emit(event: string, data?: Record<string, unknown>) {
    if (this.disposed) return;
    trackEvent(this.config.funnel, event, { videoTitle: this.config.videoTitle, ...data });
    vercelTrack()?.(event, { videoTitle: this.config.videoTitle, ...data });
  }

  trackPlay(currentTime: number) {
    this.playCount++;
    this.isPlaying = true;
    this.lastPlayTime = Date.now();
    if (this.playCount === 1) this.emit('video_play', { currentTime: Math.round(currentTime), isFirstPlay: true });
  }

  trackPause(currentTime: number) {
    this.pauseCount++;
    if (this.isPlaying) { this.totalWatchTime += (Date.now() - this.lastPlayTime) / 1000; this.isPlaying = false; }
    this.lastDropOffSecond = currentTime;
    this.emit('video_pause', { currentTime: Math.round(currentTime), totalWatchTime: Math.round(this.totalWatchTime) });
  }

  trackSeek(fromTime: number, toTime: number) {
    this.seekCount++;
    if (toTime < fromTime - 1) {
      this.rewindCount++;
      this.emit('video_rewatch', { fromTime: Math.round(fromTime), toTime: Math.round(toTime) });
    }
  }

  trackTimeUpdate(currentTime: number, duration: number) {
    if (duration <= 0) return;
    if (currentTime > this.highWaterMark) this.highWaterMark = currentTime;
    this.lastDropOffSecond = currentTime;
    this.lastKnownDuration = duration;
    this.viewedSeconds.add(Math.floor(currentTime));

    const pct = (currentTime / duration) * 100;
    for (const m of [25, 50, 75, 100]) {
      if (pct >= m && !this.milestonesHit.has(m)) {
        this.milestonesHit.add(m);
        this.emit('video_milestone', { milestone: m, currentTime: Math.round(currentTime), duration: Math.round(duration) });
      }
    }
  }

  endSession() {
    if (this.disposed) return;
    if (this.isPlaying) { this.totalWatchTime += (Date.now() - this.lastPlayTime) / 1000; this.isPlaying = false; }
    this.emit('video_session_end', {
      totalWatchTime: Math.round(this.totalWatchTime),
      highWaterMark: Math.round(this.highWaterMark),
      dropOffSecond: Math.round(this.lastDropOffSecond),
      videoDuration: Math.round(this.lastKnownDuration),
      playCount: this.playCount,
      pauseCount: this.pauseCount,
      seekCount: this.seekCount,
      rewindCount: this.rewindCount,
      milestonesReached: Array.from(this.milestonesHit).sort((a, b) => a - b),
      viewedSegments: compressSegments(Array.from(this.viewedSeconds)),
      viewedSecondsCount: this.viewedSeconds.size,
    });
    this.disposed = true;
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
    window.removeEventListener('pagehide', this.boundPageHideHandler);
    if (!this.disposed) this.endSession();
  }
}

/** Finds the native <video> element a third-party embed (Vidalytics, etc.)
 *  renders into `containerId` and wires a VideoTracker to it. Polls briefly
 *  since embeds mount their player asynchronously; no-ops if the embed turns
 *  out to be a cross-origin iframe (no <video> tag reachable from this page). */
export function attachVideoTracker(containerId: string, config: VideoTrackerConfig): () => void {
  let tracker: VideoTracker | null = null;
  let video: HTMLVideoElement | null = null;
  let stopped = false;
  let attempts = 0;

  const listeners: [keyof HTMLVideoElementEventMap, EventListener][] = [];

  function bind(v: HTMLVideoElement) {
    video = v;
    tracker = new VideoTracker(config);
    const onPlay = () => tracker?.trackPlay(v.currentTime);
    const onPause = () => tracker?.trackPause(v.currentTime);
    const onTimeUpdate = () => tracker?.trackTimeUpdate(v.currentTime, v.duration);
    let lastTime = 0;
    const onSeeking = () => tracker?.trackSeek(lastTime, v.currentTime);
    const onTimeTrack = () => { lastTime = v.currentTime; };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('timeupdate', onTimeTrack);
    v.addEventListener('seeking', onSeeking);
    v.addEventListener('ended', onPause);
    listeners.push(['play', onPlay], ['pause', onPause], ['timeupdate', onTimeUpdate], ['timeupdate', onTimeTrack], ['seeking', onSeeking], ['ended', onPause]);
  }

  function poll() {
    if (stopped || video) return;
    const el = document.getElementById(containerId)?.querySelector('video');
    if (el) { bind(el); return; }
    if (++attempts < 40) setTimeout(poll, 500); // ~20s window for the embed to mount
  }
  poll();

  return () => {
    stopped = true;
    if (video) for (const [ev, fn] of listeners) video.removeEventListener(ev, fn);
    tracker?.dispose();
  };
}
