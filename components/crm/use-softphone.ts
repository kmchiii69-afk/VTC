'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call, Device } from '@twilio/voice-sdk';

/**
 * The browser softphone.
 *
 * Owns one Twilio Device for the session and exposes a tiny state machine the UI
 * can render from. The SDK is imported dynamically because it touches `window`
 * at module scope, which would break the server render of /admin.
 */

export type PhoneState = 'loading' | 'unconfigured' | 'error' | 'idle' | 'connecting' | 'ringing' | 'live' | 'ending';

export interface ActiveCall {
  /** E.164 number being dialled. */
  to: string;
  /** Lead this dial belongs to, when it started from a lead row. */
  leadId: string | null;
  /** Display name for the UI. */
  label: string;
  startedAt: number | null;   // ms, set when the far end answers
}

/** One selectable microphone. */
export interface MicOption {
  id: string;
  label: string;
}

export interface Softphone {
  state: PhoneState;
  reason: string;              // setup/error detail, shown verbatim
  recording: boolean;
  callerIds: string[];
  active: ActiveCall | null;
  muted: boolean;
  /** Seconds since answer, ticking while live. */
  elapsed: number;
  /** Input devices the browser will let us use. Empty until permission is granted. */
  mics: MicOption[];
  /** Device ID of the mic currently feeding the call, or null if none is open. */
  micId: string | null;
  /** Non-empty when no mic is open — meaning the lead would hear pure silence. */
  micError: string;
  /**
   * Live input level, 0–1. Deliberately a ref, not state: this updates ~50×/sec
   * and the CRM board renders off the same tree, so a state write here would
   * re-render the whole page continuously. The meter animates it via rAF.
   */
  micLevelRef: { current: number };
  /** Switch microphones. Safe to call mid-call — the SDK swaps the track. */
  setMic: (deviceId: string) => Promise<void>;
  /** Re-ask for the mic after the user fixes permission or plugs a headset in. */
  retryMic: () => Promise<void>;
  /**
   * Place a call. `onEnd` fires once when the call finishes for any reason
   * (answered and hung up, declined, failed) — callers use it to refresh the lead
   * or advance a dial list, which keeps that logic out of a render effect.
   */
  dial: (to: string, opts?: {
    leadId?: string | null;
    label?: string;
    onEnd?: (info: { leadId: string | null; answered: boolean }) => void;
  }) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  sendDigit: (digit: string) => void;
  /** Resolves once the current call has fully ended — used by the list dialer. */
  waitForIdle: () => Promise<void>;
}

interface TokenResponse {
  ready: boolean;
  reason?: string;
  token?: string;
  identity?: string;
  callerIds?: string[];
  recording?: boolean;
  expiresInSec?: number;
}

/** Remembered mic choice, so a setter picks their headset once and not every day. */
const MIC_KEY = 'crm.dialer.micId';

/**
 * Ask for the microphone. Returns '' when it's usable, or a message to show.
 *
 * Called BEFORE the Device is built, for two reasons: a denial has to surface
 * while the panel is idle rather than 30 seconds into a call with a lead, and
 * device labels/IDs stay blank until permission is granted — so the SDK's own
 * device list is useless if we build it first.
 */
async function probeMic(): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'This browser will not share a microphone here — the page has to be served over HTTPS.';
  }
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((t) => t.stop());   // the SDK opens its own stream
    return '';
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Microphone blocked. Allow it for this site from the icon in the address bar, then hit Retry.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No microphone found. Plug a headset in, then hit Retry.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'The microphone is being held by another app. Close it, then hit Retry.';
    }
    return `Microphone unavailable${name ? ` (${name})` : ''}.`;
  }
}

/** The devices the SDK will accept. Entries without an ID are pre-permission stubs. */
function readMics(device: Device): MicOption[] {
  return Array.from(device.audio?.availableInputDevices?.values() ?? [])
    .filter((d) => !!d.deviceId)
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

/**
 * The SDK's AudioHelper enumerates devices asynchronously in its constructor, so
 * the list is empty for a beat after `new Device()`. Poll briefly rather than
 * racing it and concluding there's no mic.
 */
async function waitForMics(device: Device): Promise<MicOption[]> {
  for (let i = 0; i < 10; i += 1) {
    const list = readMics(device);
    if (list.length) return list;
    await new Promise((r) => { setTimeout(r, 100); });
  }
  return [];
}

function readStoredMic(): string | null {
  try { return localStorage.getItem(MIC_KEY); } catch { return null; }
}

export function useSoftphone(): Softphone {
  const [state, setState] = useState<PhoneState>('loading');
  const [reason, setReason] = useState('');
  const [recording, setRecording] = useState(false);
  const [callerIds, setCallerIds] = useState<string[]>([]);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mics, setMics] = useState<MicOption[]>([]);
  const [micId, setMicId] = useState<string | null>(null);
  const [micError, setMicError] = useState('');

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const idleWaiters = useRef<Array<() => void>>([]);
  const micLevelRef = useRef(0);

  const resolveIdle = useCallback(() => {
    idleWaiters.current.forEach((r) => r());
    idleWaiters.current = [];
  }, []);

  /**
   * Open a microphone and start metering it. `preferred` wins, then whatever was
   * chosen last, then the system default. Opening the stream here — rather than
   * letting the SDK grab one at dial time — is what makes `inputVolume` fire
   * while idle, so a dead mic is visible BEFORE a lead is on the line.
   */
  const openMic = useCallback(async (preferred?: string): Promise<void> => {
    const device = deviceRef.current;
    const audio = device?.audio;
    if (!device || !audio) return;

    const denied = await probeMic();
    if (denied) {
      setMicError(denied);
      setMics([]);
      setMicId(null);
      return;
    }

    const list = await waitForMics(device);
    setMics(list);
    if (!list.length) {
      setMicError('No microphone found. Plug one in and reload the page.');
      setMicId(null);
      return;
    }

    const stored = readStoredMic();
    const pick = [preferred, stored].find((id) => id && list.some((m) => m.id === id))
      || (list.some((m) => m.id === 'default') ? 'default' : list[0].id);

    try {
      await audio.setInputDevice(pick as string);
      setMicId(pick as string);
      setMicError('');
      try { localStorage.setItem(MIC_KEY, pick as string); } catch { /* private mode */ }
    } catch (e) {
      setMicError(`Could not open that microphone: ${e instanceof Error ? e.message : String(e)}`);
      setMicId(null);
    }
  }, []);

  // ── Device setup: fetch a token, build the Device, keep the token fresh ──
  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const getToken = async (): Promise<TokenResponse | null> => {
      try {
        const res = await fetch('/api/crm/dialer/token');
        if (!res.ok) return { ready: false, reason: `Token request failed (${res.status})` };
        return await res.json();
      } catch {
        return { ready: false, reason: 'Could not reach the token endpoint.' };
      }
    };

    (async () => {
      const data = await getToken();
      if (cancelled || !data) return;
      setRecording(!!data.recording);
      setCallerIds(data.callerIds ?? []);

      if (!data.ready || !data.token) {
        setState('unconfigured');
        setReason(data.reason || 'Dialer is not configured yet.');
        return;
      }

      // Ask for the mic before building the Device: the SDK snapshots the device
      // list in its constructor, and that list has no usable IDs or labels until
      // the user has granted permission.
      const micDenied = await probeMic();
      if (cancelled) return;
      if (micDenied) setMicError(micDenied);

      try {
        const { Device, Call: TwilioCall } = await import('@twilio/voice-sdk');
        if (cancelled) return;
        const device = new Device(data.token, {
          // Opus first for call quality; PCMU as the fallback codec.
          codecPreferences: [TwilioCall.Codec.Opus, TwilioCall.Codec.PCMU],
          disableAudioContextSounds: false,
        });
        deviceRef.current = device;

        device.on('error', (e: { message?: string; code?: number }) => {
          setState('error');
          setReason(`${e.code ? `Twilio ${e.code}: ` : ''}${e.message || 'Device error'}`);
        });
        device.on('registered', () => setState((s) => (s === 'loading' || s === 'unconfigured' ? 'idle' : s)));
        device.on('unregistered', () => setState((s) => (s === 'live' || s === 'ringing' ? s : 'idle')));

        // Straight into a ref — see the note on micLevelRef. This fires ~50×/sec.
        device.audio?.on('inputVolume', (v: number) => { micLevelRef.current = v; });
        // A headset unplugged mid-session otherwise falls back to a silent default
        // with no visible change at all — which is the failure this panel exists for.
        device.audio?.on('deviceChange', () => { void openMic(); });

        await device.register();
        if (!cancelled) { setState('idle'); setReason(''); }

        // After register so the AudioHelper has finished its initial enumeration.
        if (!cancelled) await openMic();

        // Refresh a minute before expiry so a long dialling session never drops.
        const ttl = Math.max(120, (data.expiresInSec ?? 3600) - 60) * 1000;
        const scheduleRefresh = () => {
          refreshTimer = setTimeout(async () => {
            const next = await getToken();
            if (!cancelled && next?.token && deviceRef.current) {
              deviceRef.current.updateToken(next.token);
              scheduleRefresh();
            }
          }, ttl);
        };
        scheduleRefresh();
      } catch (e) {
        if (!cancelled) {
          setState('error');
          setReason(e instanceof Error ? e.message : 'Could not start the softphone.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      callRef.current?.disconnect();
      deviceRef.current?.destroy();   // also tears down the AudioHelper's input stream
      deviceRef.current = null;
    };
  }, [openMic]);

  // ── Live call timer ──
  useEffect(() => {
    if (state !== 'live' || !active?.startedAt) return;
    const started = active.startedAt;
    const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, active?.startedAt]);

  const dial = useCallback(async (to: string, opts?: {
    leadId?: string | null;
    label?: string;
    onEnd?: (info: { leadId: string | null; answered: boolean }) => void;
  }) => {
    const device = deviceRef.current;
    if (!device || callRef.current) return;

    setActive({ to, leadId: opts?.leadId ?? null, label: opts?.label || to, startedAt: null });
    setMuted(false);
    setElapsed(0);
    setState('connecting');

    try {
      // These params arrive as POST fields on our TwiML webhook.
      const call = await device.connect({ params: { To: to, LeadId: opts?.leadId ?? '' } });
      callRef.current = call;
      let answered = false;
      let ended = false;

      call.on('ringing', () => setState('ringing'));
      call.on('accept', () => {
        answered = true;
        setState('live');
        setActive((a) => (a ? { ...a, startedAt: Date.now() } : a));
      });
      const end = () => {
        if (ended) return;   // disconnect + cancel can both fire
        ended = true;
        callRef.current = null;
        setState('idle');
        setActive(null);
        setMuted(false);
        setElapsed(0);
        resolveIdle();
        opts?.onEnd?.({ leadId: opts?.leadId ?? null, answered });
      };
      call.on('disconnect', end);
      call.on('cancel', end);
      call.on('reject', end);
      call.on('error', (e: { message?: string; code?: number }) => {
        setReason(`${e.code ? `Twilio ${e.code}: ` : ''}${e.message || 'Call failed'}`);
        end();
      });
    } catch (e) {
      setReason(e instanceof Error ? e.message : 'Could not place the call.');
      setState('idle');
      setActive(null);
      resolveIdle();
    }
  }, [resolveIdle]);

  const hangup = useCallback(() => {
    if (!callRef.current) return;
    setState('ending');
    callRef.current.disconnect();
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !call.isMuted();
    call.mute(next);
    setMuted(next);
  }, []);

  const sendDigit = useCallback((digit: string) => {
    callRef.current?.sendDigits(digit);
  }, []);

  const waitForIdle = useCallback(() => {
    if (!callRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => { idleWaiters.current.push(resolve); });
  }, []);

  const setMic = useCallback((deviceId: string) => openMic(deviceId), [openMic]);
  const retryMic = useCallback(() => openMic(), [openMic]);

  return {
    state, reason, recording, callerIds, active, muted, elapsed,
    mics, micId, micError, micLevelRef, setMic, retryMic,
    dial, hangup, toggleMute, sendDigit, waitForIdle,
  };
}

/** mm:ss for the live timer. */
export function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
