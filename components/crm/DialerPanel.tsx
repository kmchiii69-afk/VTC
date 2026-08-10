'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { normalizePhone } from '@/lib/contact-format';
import { fmtElapsed, type Softphone } from '@/components/crm/use-softphone';

/* Palette matched to the admin panel. */
const gold = 'rgba(201,164,85,0.7)';
const cream = 'rgba(240,232,212,0.85)';
const creamFaint = 'rgba(240,232,212,0.55)';

/** Countries the keypad can prefix a bare local number with. */
export const DIAL_COUNTRIES: Array<{ code: string; label: string; flag: string }> = [
  { code: '1', label: 'US / CA', flag: '🇺🇸' },
  { code: '44', label: 'UK', flag: '🇬🇧' },
  { code: '353', label: 'Ireland', flag: '🇮🇪' },
  { code: '49', label: 'Germany', flag: '🇩🇪' },
  { code: '31', label: 'Netherlands', flag: '🇳🇱' },
  { code: '33', label: 'France', flag: '🇫🇷' },
  { code: '34', label: 'Spain', flag: '🇪🇸' },
  { code: '39', label: 'Italy', flag: '🇮🇹' },
  { code: '41', label: 'Switzerland', flag: '🇨🇭' },
  { code: '61', label: 'Australia', flag: '🇦🇺' },
  { code: '971', label: 'UAE', flag: '🇦🇪' },
  { code: '60', label: 'Malaysia', flag: '🇲🇾' },
  { code: '65', label: 'Singapore', flag: '🇸🇬' },
];

/**
 * Turn whatever was typed into E.164. A '+' is trusted as-is; a bare local number
 * gets the selected country's code, with any trunk '0' dropped. Never guesses.
 */
export function buildE164(raw: string, countryCode: string): string | null {
  const cleaned = normalizePhone(raw);
  if (cleaned.startsWith('+')) return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  // No '+' and no country to prefix → not diallable. Without this guard a stored
  // "0123456789" would become "+123456789", which dials a real stranger.
  const cc = countryCode.replace(/\D/g, '');
  if (!cc) return null;
  const digits = cleaned.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return null;
  const candidate = `+${cc}${digits}`;
  return /^\+\d{8,15}$/.test(candidate) ? candidate : null;
}

/**
 * Live microphone level — the one thing that proves the lead can actually hear you.
 *
 * Animated straight into the DOM off a rAF loop rather than through React state:
 * the level updates ~50×/sec and this panel sits in the same tree as the CRM
 * board, so re-rendering on every sample would drag the whole page down.
 */
function MicMeter({ levelRef, live }: { levelRef: { current: number }; live: boolean }) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    let raf = 0;
    let shown = 0;
    let lastSound = Date.now();
    let flagged = false;

    const tick = () => {
      const v = Math.min(1, levelRef.current * 2.2);   // speech rarely tops ~0.45
      // Snap up, ease down, so a single word still registers as a visible jump.
      shown = v > shown ? v : shown * 0.9;
      const bar = barRef.current;
      if (bar) {
        bar.style.width = `${Math.round(shown * 100)}%`;
        bar.style.background = shown > 0.04 ? '#4ade80' : 'rgba(240,232,212,0.2)';
      }

      if (v > 0.03) lastSound = Date.now();
      // A live call with a flat mic for four seconds means the lead hears nothing.
      const quiet = live && Date.now() - lastSound > 4000;
      if (quiet !== flagged) { flagged = quiet; setSilent(quiet); }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef, live]);

  return (
    <>
      <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div ref={barRef} style={{ height: '100%', width: '0%', borderRadius: 3 }} />
      </div>
      {silent && (
        <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.45, color: '#fca5a5' }}>
          ⚠ Nothing is reaching this mic — the lead can’t hear you. Check you’re not
          muted in Windows, or pick a different microphone above.
        </div>
      )}
    </>
  );
}

export interface QueueItem {
  leadId: string;
  label: string;
  number: string;   // E.164 or raw; validated before dialling
}

export function DialerPanel({ phone, queue, onSelectLead, onCallEnded }: {
  phone: Softphone;
  /** The set the list dialer walks — usually whatever is on screen. */
  queue: QueueItem[];
  onSelectLead?: (leadId: string) => void;
  onCallEnded?: (leadId: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [num, setNum] = useState('');
  const [country, setCountry] = useState('1');
  const [err, setErr] = useState('');

  // ── List dialer ──
  const [listOn, setListOn] = useState(false);
  const [listIdx, setListIdx] = useState(0);
  const [awaitingOutcome, setAwaitingOutcome] = useState<QueueItem | null>(null);

  // A queued lead must carry its own country code. The keypad's country picker
  // applies ONLY to numbers typed by hand — never to stored lead numbers, so the
  // list dialer can't invent a prefix and call a stranger.
  const dialable = useMemo(() => queue.filter((q) => !!buildE164(q.number, '')), [queue]);

  const busy = ['connecting', 'ringing', 'live', 'ending'].includes(phone.state);
  // No mic means a call the lead can't hear, so it's not worth burning the dial.
  const canDial = phone.state === 'idle' && !phone.micError;

  const dialManual = async () => {
    setErr('');
    const e164 = buildE164(num, country);
    if (!e164) { setErr('Needs a full number — include the country code or pick one.'); return; }
    await phone.dial(e164, { label: e164, onEnd: () => onCallEnded?.(null) });
  };

  // Dial one item of the list. When it ends we pause on that lead (selected in
  // the drawer, so its outcome buttons are right there) until Next is pressed.
  const dialItem = async (item: QueueItem) => {
    onSelectLead?.(item.leadId);
    await phone.dial(buildE164(item.number, '') as string, {
      leadId: item.leadId,
      label: item.label,
      onEnd: ({ leadId }) => {
        onCallEnded?.(leadId);
        setAwaitingOutcome(item);
        onSelectLead?.(item.leadId);
      },
    });
  };

  const startList = async () => {
    if (!dialable.length) return;
    setListOn(true);
    setListIdx(0);
    setAwaitingOutcome(null);
    await dialItem(dialable[0]);
  };

  const nextInList = async () => {
    const next = listIdx + 1;
    setAwaitingOutcome(null);
    if (next >= dialable.length) { setListOn(false); setListIdx(0); return; }
    setListIdx(next);
    await dialItem(dialable[next]);
  };

  const stopList = () => { setListOn(false); setAwaitingOutcome(null); setListIdx(0); };

  /* ── styles ── */
  const shell: React.CSSProperties = {
    position: 'fixed', right: 20, bottom: 20, zIndex: 300, width: open ? 292 : 168,
    background: 'rgba(14,11,7,0.97)', border: '1px solid rgba(201,164,85,0.22)',
    borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
    fontFamily: "'DM Sans', sans-serif", overflow: 'hidden',
  };
  const btn = (color: string, filled = false): React.CSSProperties => ({
    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
    background: filled ? color : `${color}14`, border: `1px solid ${color}55`,
    color: filled ? '#111' : color, fontFamily: "'DM Sans', sans-serif",
    fontSize: 11.5, fontWeight: 600, letterSpacing: '0.02em',
  });
  const input: React.CSSProperties = {
    padding: '9px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: cream, fontFamily: 'ui-monospace, monospace', fontSize: 14,
    outline: 'none', boxSizing: 'border-box', width: '100%',
  };

  const statusDot = phone.state === 'live' ? '#4ade80'
    : phone.state === 'ringing' || phone.state === 'connecting' ? '#fbbf24'
    : phone.state === 'error' || phone.state === 'unconfigured' ? '#ef4444'
    : phone.state === 'idle' ? gold : creamFaint;

  const statusText = phone.state === 'live' ? `On call · ${fmtElapsed(phone.elapsed)}`
    : phone.state === 'ringing' ? 'Ringing…'
    : phone.state === 'connecting' ? 'Connecting…'
    : phone.state === 'ending' ? 'Hanging up…'
    : phone.state === 'loading' ? 'Starting phone…'
    : phone.state === 'unconfigured' ? 'Setup needed'
    : phone.state === 'error' ? 'Phone error'
    : 'Ready';

  return (
    <div style={shell}>
      {/* Header */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', cursor: 'pointer',
          borderBottom: open ? '1px solid rgba(255,255,255,0.06)' : 'none',
          background: phone.state === 'live' ? 'rgba(74,222,128,0.07)' : 'transparent',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusDot, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: cream, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {phone.active ? phone.active.label : 'Dialer'}
        </span>
        <span style={{ fontSize: 10.5, color: creamFaint, flexShrink: 0 }}>{statusText}</span>
        <span style={{ fontSize: 11, color: creamFaint, flexShrink: 0 }}>{open ? '▾' : '▴'}</span>
      </div>

      {open && (
        <div style={{ padding: '13px' }}>
          {/* Setup / error detail */}
          {(phone.state === 'unconfigured' || phone.state === 'error') && (
            <div style={{
              padding: '9px 10px', borderRadius: 8, marginBottom: 11, fontSize: 11, lineHeight: 1.5,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5',
            }}>{phone.reason || 'Dialer unavailable.'}</div>
          )}

          {/* Microphone. Shown in every state — the lead only ever hears what
              shows up on this meter, so it stays visible during the call too. */}
          <div style={{ marginBottom: 11 }}>
            {phone.micError ? (
              <div style={{
                padding: '9px 10px', borderRadius: 8, fontSize: 11, lineHeight: 1.5,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5',
              }}>
                <div style={{ marginBottom: 8 }}>🎙 {phone.micError}</div>
                <button onClick={() => { void phone.retryMic(); }} style={btn('#ef4444')}>Retry mic</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, flexShrink: 0 }}>🎙</span>
                  <select
                    value={phone.micId ?? ''}
                    onChange={(e) => { void phone.setMic(e.target.value); }}
                    disabled={!phone.mics.length}
                    title="The microphone the lead hears"
                    style={{
                      ...input, flex: 1, minWidth: 0, padding: '6px 8px',
                      fontFamily: "'DM Sans', sans-serif", fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    {!phone.mics.length && <option value="">Starting microphone…</option>}
                    {phone.mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <MicMeter levelRef={phone.micLevelRef} live={phone.state === 'live'} />
              </>
            )}
          </div>

          {/* Live call controls */}
          {busy ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontSize: 20, fontFamily: 'ui-monospace, monospace', color: cream, textAlign: 'center' }}>
                {phone.state === 'live' ? fmtElapsed(phone.elapsed) : '—'}
              </div>
              <div style={{ fontSize: 11, color: creamFaint, textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}>
                {phone.active?.to}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <button onClick={phone.toggleMute} style={{ ...btn(phone.muted ? '#fbbf24' : 'rgba(240,232,212,0.6)'), flex: 1 }}>
                  {phone.muted ? '🔇 Unmute' : '🎙 Mute'}
                </button>
                <button onClick={phone.hangup} style={{ ...btn('#ef4444'), flex: 1 }}>■ Hang up</button>
              </div>
              {/* DTMF for phone trees */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((d) => (
                  <button key={d} onClick={() => phone.sendDigit(d)} style={{
                    padding: '7px 0', borderRadius: 7, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    color: cream, fontSize: 13, fontFamily: 'ui-monospace, monospace',
                  }}>{d}</button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Manual dial */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
                <select value={country} onChange={(e) => setCountry(e.target.value)} title="Country code for numbers typed without a +"
                  style={{ ...input, width: 96, fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, cursor: 'pointer' }}>
                  {DIAL_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>)}
                </select>
                <input
                  value={num}
                  onChange={(e) => { setNum(e.target.value); setErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canDial) dialManual(); }}
                  placeholder="Paste or type a number"
                  style={{ ...input, flex: 1, fontSize: 13 }}
                />
              </div>
              {err && <div style={{ fontSize: 10.5, color: '#fca5a5', marginBottom: 7 }}>{err}</div>}
              <button
                onClick={dialManual}
                disabled={!canDial || !num.trim()}
                style={{ ...btn('#4ade80', true), width: '100%', opacity: !canDial || !num.trim() ? 0.4 : 1, marginBottom: 11 }}
              >📞 Call</button>

              {/* Keypad */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 11 }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((d) => (
                  <button key={d} onClick={() => setNum((n) => n + d)} style={{
                    padding: '9px 0', borderRadius: 7, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    color: cream, fontSize: 15, fontFamily: 'ui-monospace, monospace',
                  }}>{d}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 11 }}>
                <button onClick={() => setNum((n) => n.slice(0, -1))} style={{ ...btn('rgba(240,232,212,0.5)'), flex: 1 }}>⌫ Back</button>
                <button onClick={() => { setNum(''); setErr(''); }} style={{ ...btn('rgba(240,232,212,0.5)'), flex: 1 }}>Clear</button>
              </div>
            </>
          )}

          {/* List dialer */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 11 }}>
            {!listOn ? (
              <button
                onClick={startList}
                disabled={!canDial || dialable.length === 0}
                title={dialable.length === 0 ? 'No leads with a diallable number in this list' : `Dial ${dialable.length} leads in order`}
                style={{ ...btn(gold), width: '100%', opacity: !canDial || !dialable.length ? 0.4 : 1 }}
              >▶ Dial list ({dialable.length})</button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10.5, color: creamFaint }}>
                  List dialing · {Math.min(listIdx + 1, dialable.length)} of {dialable.length}
                </div>
                {awaitingOutcome && (
                  <div style={{ fontSize: 11, color: cream, lineHeight: 1.45 }}>
                    Log the outcome for <strong>{awaitingOutcome.label}</strong>, then continue.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={nextInList} disabled={busy} style={{ ...btn('#4ade80', true), flex: 1, opacity: busy ? 0.4 : 1 }}>
                    {listIdx + 1 >= dialable.length ? 'Finish' : 'Next ▶'}
                  </button>
                  <button onClick={stopList} style={{ ...btn('rgba(240,232,212,0.5)') }}>Stop</button>
                </div>
              </div>
            )}
          </div>

          {phone.recording && (
            <div style={{ marginTop: 10, fontSize: 9.5, color: 'rgba(240,232,212,0.3)', letterSpacing: '0.06em' }}>
              ● Calls are recorded
            </div>
          )}
        </div>
      )}
    </div>
  );
}
