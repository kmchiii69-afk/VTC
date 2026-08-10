'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { getTracking } from '@/lib/tracking';

const Y = '#F5E6A3';
const BG = '#161512';
const BORDER = 'rgba(245,230,163,0.16)';

// Common timezones for the selector
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Istanbul',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Kuala_Lumpur',
  'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
  'Africa/Johannesburg', 'Africa/Lagos',
];

function tzLabel(tz: string) {
  try {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    const parts = tz.split('/');
    const city = parts[parts.length - 1].replace(/_/g, ' ');
    return `${city} (${time})`;
  } catch {
    return tz;
  }
}

function monthName(year: number, month: number) {
  return new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// What day of week does the month start on (0=Mon ... 6=Sun)
function startDayOfWeek(year: number, month: number) {
  const d = new Date(year, month, 1).getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1; // convert to Mon=0
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  name: string;
  email: string;
  phone?: string;
  /** Semantic answers to prefill onto the Calendly event's custom questions
   *  (phone / instagram / revenue / business) — matched best-effort by the
   *  question's name on the server. */
  answers?: Record<string, string>;
  /** Optional per-funnel Calendly event override (exact name + slug). Defaults
   *  to the shared "1 on 1 Strategy Call" when unset. */
  eventName?: string;
  eventSlug?: string;
  onBooked?: () => void;
}

export default function BookingCalendar({ name, email, phone, answers, eventName, eventSlug, onBooked }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
  });
  const [slots, setSlots] = useState<Record<string, { time: string; iso: string }[]>>({});
  const [eventTypeUri, setEventTypeUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedIso, setSelectedIso] = useState('');
  const [step, setStep] = useState<'calendar' | 'done'>('calendar');
  const [booking, setBooking] = useState(false);
  const [err, setErr] = useState('');

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  const fetchSlots = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const ev = new URLSearchParams();
      if (eventName) ev.set('eventName', eventName);
      if (eventSlug) ev.set('eventSlug', eventSlug);
      const evq = ev.toString() ? `&${ev.toString()}` : '';
      const res = await fetch(`/api/calendly/available-times?month=${monthStr}&timezone=${encodeURIComponent(timezone)}${evq}`);
      if (!res.ok) throw new Error('Failed to load');
      const d = await res.json();
      setSlots(d.slots ?? {});
      if (d.eventTypeUri) setEventTypeUri(d.eventTypeUri);
    } catch {
      setErr('Could not load available times. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [monthStr, timezone, eventName, eventSlug]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
    setSelectedDate(''); setSelectedTime(''); setSelectedIso('');
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
    setSelectedDate(''); setSelectedTime(''); setSelectedIso('');
  }

  /* Book the call SERVER-SIDE via Calendly's Create Event Invitee API — the
   * invitee is scheduled the moment this succeeds, so there's no Calendly popup
   * / embedded form to confirm. We send the slot's EXACT UTC start (selectedIso)
   * because Calendly only accepts a real available-slot time. */
  async function confirmBooking() {
    if (!selectedDate || !selectedTime || !selectedIso || !eventTypeUri) return;
    setBooking(true); setErr('');
    try {
      // Pass the captured UTMs through to Calendly. Server-side booking bypasses
      // Calendly's hosted page, so it can't read the funnel URL's ?utm_* itself —
      // we must send them in the Create Event Invitee `tracking` field.
      const t = getTracking();
      const tracking = {
        utm_source: t.utm_source, utm_medium: t.utm_medium, utm_campaign: t.utm_campaign,
        utm_content: t.utm_content, utm_term: t.utm_term,
      };
      const res = await fetch('/api/calendly/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, answers, startTime: selectedIso, timezone, eventTypeUri, tracking }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.error || 'Booking failed');
      setStep('done');
      onBooked?.();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Could not create booking. Please try again.');
    } finally {
      setBooking(false);
    }
  }

  const days = daysInMonth(year, month);
  const startOffset = startDayOfWeek(year, month);
  const todayStr = now.toLocaleDateString('en-CA');

  const btnBase: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  };

  if (step === 'done') {
    return (
      <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 'clamp(28px,4vw,44px)', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: Y, marginBottom: 8 }}>You&apos;re booked in</div>
        <div style={{ fontSize: 14, color: '#ccc' }}>
          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {selectedTime}
        </div>
        <div style={{ fontSize: 12, color: '#777', marginTop: 6 }}>
          ({timezone.split('/').pop()?.replace(/_/g, ' ')}) — a calendar invite is on its way to {email}.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 'clamp(20px,3vw,36px)', maxWidth: 640, margin: '0 auto' }}>

      {/* ── Month nav ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button onClick={prevMonth} style={{ ...btnBase, color: '#aaa', fontSize: 20, width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
        <div style={{ fontFamily: 'inherit', fontSize: 16, fontWeight: 700, color: '#fff' }}>{monthName(year, month)}</div>
        <button onClick={nextMonth} style={{ ...btnBase, color: '#aaa', fontSize: 20, width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
      </div>

      {/* ── Day headers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 8 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, color: '#888', fontWeight: 600, letterSpacing: '0.08em', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* ── Calendar grid ── */}
      {loading ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>
          Loading available times…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 24 }}>
          {Array.from({ length: startOffset }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const available = !!(slots[dateStr]?.length);
            const isToday = dateStr === todayStr;
            const isPast = dateStr < todayStr;
            const isSelected = dateStr === selectedDate;

            return (
              <button
                key={day}
                onClick={() => { if (available && !isPast) { setSelectedDate(dateStr); setSelectedTime(''); setSelectedIso(''); } }}
                disabled={!available || isPast}
                style={{
                  ...btnBase,
                  width: '100%', aspectRatio: '1', borderRadius: 8,
                  fontSize: 14, fontWeight: available ? 700 : 400,
                  color: isPast ? '#3a3a3a' : isSelected ? '#111' : available ? '#fff' : '#555',
                  background: isSelected ? Y : available ? 'rgba(245,230,163,0.08)' : isToday ? 'rgba(255,255,255,0.04)' : 'transparent',
                  border: isSelected ? `1px solid ${Y}` : available ? `1px solid ${Y}44` : isToday ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent',
                  cursor: available && !isPast ? 'pointer' : 'default',
                  position: 'relative',
                }}
              >
                {day}
                {available && !isPast && !isSelected && (
                  <span style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: Y, display: 'block' }} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Time slots ── */}
      {selectedDate && slots[selectedDate] && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#999', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
            {slots[selectedDate].map(slot => (
              <button
                key={slot.iso}
                onClick={() => { setSelectedTime(slot.time); setSelectedIso(slot.iso); }}
                style={{
                  ...btnBase,
                  padding: '10px 8px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: selectedIso === slot.iso ? Y : 'rgba(255,255,255,0.05)',
                  color: selectedIso === slot.iso ? '#111' : '#fff',
                  border: `1px solid ${selectedIso === slot.iso ? Y : 'rgba(255,255,255,0.14)'}`,
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >{slot.time}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Timezone ── */}
      <div style={{ marginBottom: selectedTime ? 20 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#999', marginRight: 4 }}>Time zone</span>
          <select
            value={timezone}
            onChange={e => { setTimezone(e.target.value); setSelectedDate(''); setSelectedTime(''); setSelectedIso(''); }}
            style={{
              background: 'transparent', border: 'none', color: '#ddd', fontSize: 12,
              cursor: 'pointer', outline: 'none', fontFamily: 'inherit',
            }}
          >
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz} style={{ background: '#111' }}>{tzLabel(tz)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Confirm button ── */}
      {selectedDate && selectedTime && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, color: '#999', marginBottom: 12 }}>
            Booking as <span style={{ color: '#fff', fontWeight: 600 }}>{name}</span> · {email}
          </div>
          {err && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>{err}</div>}
          <button
            onClick={confirmBooking}
            disabled={booking}
            style={{
              width: '100%', padding: '14px', borderRadius: 50,
              background: Y, border: 'none', cursor: booking ? 'wait' : 'pointer',
              color: '#111', fontSize: 15, fontWeight: 800, letterSpacing: '0.02em',
              opacity: booking ? 0.7 : 1, transition: 'opacity 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {booking ? 'Confirming your call…' : `Confirm · ${selectedTime}, ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </button>
        </div>
      )}

    </div>
  );
}
