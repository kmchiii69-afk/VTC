'use client';
/* Date range control for admin analytics — preset pills plus a real
 * calendar for a custom range. Matches the rest of the admin app's look
 * (Cormorant Garamond + DM Sans, soft cards) rather than a technical HUD. */
import { useState, useRef, useEffect } from 'react';

export type TZ = 'utc' | 'eastern';
export interface DateRange { from: Date; to: Date; tz: TZ }

const SERIF = '"Cormorant Garamond","Source Serif Pro",Georgia,serif';
const SANS = "'DM Sans', sans-serif";
const GOLD = '#F5E6A3';
const cream = 'rgba(240,232,212,0.85)';
const creamFaint = 'rgba(240,232,212,0.5)';
const creamDim = 'rgba(240,232,212,0.32)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14,
};

const PRESETS: { label: string; days: number | 'mtd' }[] = [
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'MTD', days: 'mtd' },
];

function fmtDate(d: Date, tz: TZ) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz === 'eastern' ? 'America/New_York' : 'UTC' });
}
function isoDay(d: Date) { return d.toLocaleDateString('en-CA'); }
function daysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function startDow(year: number, month: number) { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; }
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface Props { value: DateRange; onChange: (r: DateRange) => void }

function Pill({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: SANS, fontSize: 14.5, fontWeight: active ? 700 : 500,
      padding: '7px 14px', borderRadius: 20,
      background: active ? GOLD : 'transparent',
      color: active ? '#1a1710' : creamFaint,
      border: `1px solid ${active ? GOLD : 'rgba(255,255,255,0.1)'}`,
      cursor: 'pointer', transition: 'all 150ms',
    }}>{children}</button>
  );
}

function MiniCalendar({
  pending, onPick,
}: { pending: { start: Date | null; end: Date | null }; onPick: (d: Date) => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const days = daysInMonth(year, month);
  const offset = startDow(year, month);
  const todayIso = isoDay(now);

  function prev() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  const startIso = pending.start ? isoDay(pending.start) : null;
  const endIso = pending.end ? isoDay(pending.end) : null;

  return (
    <div style={{ width: 260 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={prev} style={{ background: 'transparent', border: 'none', color: creamFaint, cursor: 'pointer', fontSize: 18, padding: 4 }}>‹</button>
        <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 400, color: cream }}>
          {new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
        <button onClick={next} style={{ background: 'transparent', border: 'none', color: creamFaint, cursor: 'pointer', fontSize: 18, padding: 4 }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: 'center', fontFamily: SANS, fontSize: 12, color: creamDim, padding: '2px 0' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = i + 1;
          const d = new Date(year, month, day, 12);
          const iso = isoDay(d);
          const isToday = iso === todayIso;
          const isStart = iso === startIso;
          const isEnd = iso === endIso;
          const inRange = startIso && endIso && iso > startIso && iso < endIso;
          const isFuture = iso > todayIso;
          return (
            <button
              key={day}
              onClick={() => !isFuture && onPick(d)}
              disabled={isFuture}
              style={{
                aspectRatio: '1', border: 'none', borderRadius: 8, cursor: isFuture ? 'default' : 'pointer',
                fontFamily: SANS, fontSize: 14,
                background: isStart || isEnd ? GOLD : inRange ? 'rgba(245,230,163,0.14)' : 'transparent',
                color: isFuture ? creamDim : (isStart || isEnd) ? '#1a1710' : isToday ? GOLD : cream,
                fontWeight: isStart || isEnd || isToday ? 700 : 400,
              }}
            >{day}</button>
          );
        })}
      </div>
    </div>
  );
}

export function RangePicker({ value, onChange }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [pending, setPending] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!customOpen) return;
    function onDocClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setCustomOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [customOpen]);

  function applyPreset(days: number | 'mtd') {
    const to = new Date();
    let from: Date;
    if (days === 'mtd') from = new Date(to.getFullYear(), to.getMonth(), 1, 0, 0, 0, 0);
    else from = new Date(to.getTime() - (days as number) * 86400000);
    onChange({ ...value, from, to });
    setCustomOpen(false);
  }

  function pickDay(d: Date) {
    setPending(p => {
      if (!p.start || (p.start && p.end)) return { start: d, end: null };
      if (d < p.start) return { start: d, end: p.start };
      return { start: p.start, end: d };
    });
  }

  function applyCustom() {
    if (!pending.start) return;
    const from = new Date(pending.start); from.setHours(0, 0, 0, 0);
    const to = pending.end ? new Date(pending.end) : new Date(pending.start);
    to.setHours(23, 59, 59, 999);
    onChange({ ...value, from, to });
    setCustomOpen(false);
  }

  const diffDays = Math.max(1, Math.round((value.to.getTime() - value.from.getTime()) / 86400000));
  const isMtd = (() => {
    const now = new Date();
    return value.from.getDate() === 1 && value.from.getMonth() === now.getMonth() && value.from.getFullYear() === now.getFullYear();
  })();
  const activePreset = isMtd ? 'MTD' : PRESETS.find(p => p.days === diffDays)?.label ?? null;

  return (
    <div style={{ ...card, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
        {PRESETS.map(p => (
          <Pill key={p.label} active={activePreset === p.label} onClick={() => applyPreset(p.days)}>{p.label}</Pill>
        ))}

        <div style={{ position: 'relative' }} ref={popRef}>
          <Pill
            active={activePreset === null}
            onClick={() => { setPending({ start: null, end: null }); setCustomOpen(o => !o); }}
          >Custom</Pill>

          {customOpen && (
            <div style={{
              position: 'absolute', top: '110%', left: 0, zIndex: 50,
              background: '#0d0c0a', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, padding: 18, boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
            }}>
              <MiniCalendar pending={pending} onPick={pickDay} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 10 }}>
                <span style={{ fontFamily: SANS, fontSize: 13, color: creamFaint }}>
                  {pending.start ? fmtDate(pending.start, value.tz) : 'Start date'}
                  {' – '}
                  {pending.end ? fmtDate(pending.end, value.tz) : (pending.start ? fmtDate(pending.start, value.tz) : 'End date')}
                </span>
                <button
                  onClick={applyCustom}
                  disabled={!pending.start}
                  style={{
                    fontFamily: SANS, fontSize: 14, fontWeight: 700, padding: '6px 16px', borderRadius: 20,
                    background: pending.start ? GOLD : 'rgba(255,255,255,0.06)', color: pending.start ? '#1a1710' : creamDim,
                    border: 'none', cursor: pending.start ? 'pointer' : 'default',
                  }}
                >Apply</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
          {(['utc', 'eastern'] as TZ[]).map(tz => (
            <button key={tz} onClick={() => onChange({ ...value, tz })} style={{
              fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: '6px 12px', border: 0,
              background: value.tz === tz ? 'rgba(245,230,163,0.16)' : 'transparent',
              color: value.tz === tz ? GOLD : creamFaint, cursor: 'pointer',
            }}>{tz === 'utc' ? 'UTC' : 'ET'}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, fontFamily: SANS, fontSize: 14, color: creamFaint }}>
        <span style={{ color: cream, fontWeight: 600 }}>{fmtDate(value.from, value.tz)}</span>
        {' → '}
        <span style={{ color: cream, fontWeight: 600 }}>{fmtDate(value.to, value.tz)}</span>
        <span style={{ marginLeft: 8, color: creamDim }}>· {diffDays}d · {value.tz === 'eastern' ? 'Eastern' : 'UTC'}</span>
      </div>
    </div>
  );
}
