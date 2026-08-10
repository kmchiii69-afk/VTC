'use client';
/* Applicants per funnel — everyone who started the application (partial saves
 * included), with all their answers, whether they finished, and whether they
 * booked a call (booked_at, set by the Calendly webhook or the sync-bookings
 * pull). Lives under the Funnels analytics tab. */
import { useCallback, useEffect, useState } from 'react';

const SERIF = '"Cormorant Garamond","Source Serif Pro",Georgia,serif';
const SANS = "'DM Sans', sans-serif";
const GOLD = '#F5E6A3';
const cream = 'rgba(240,232,212,0.85)';
const creamFaint = 'rgba(240,232,212,0.5)';
const creamDim = 'rgba(240,232,212,0.32)';
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 };

interface Applicant {
  email: string; name: string | null; phone: string | null; instagram: string | null;
  business: string | null; current_revenue: string | null; target_revenue: string | null;
  investment_range: string | null; commitment: string | null; blocker: string | null;
  decision_maker: string | null; qualified: boolean | null; completed: boolean;
  booked: boolean; scheduled_at: string | null; last_step: number | null; submitted_at: string | null;
}
interface FunnelGroup { funnel: string; label: string; applicants: Applicant[]; counts: { total: number; completed: number; partial: number; booked: number } }

const FAMILY_COLORS: Record<string, string> = { vsl: GOLD, 'under-100k': '#C9A8FF', 'over-100k-ads': '#F0826D', 'over-100k-no-ads': '#BFFA46' };
// The page each funnel's application was filled out on (the "source").
const SOURCE_PATH: Record<string, string> = {
  vsl: '/funnel/vsl',
  'under-100k': '/funnel/ads/under-100k',
  'over-100k-ads': '/funnel/ads/over-100k-ads',
  'over-100k-no-ads': '/funnel/ads/over-100k-no-ads',
};

// Investment-range distribution for a funnel's applicants (full label, no truncation).
function investmentMix(applicants: Applicant[]): { range: string; count: number }[] {
  const m = new Map<string, number>();
  for (const a of applicants) {
    if (!a.investment_range) continue;
    m.set(a.investment_range, (m.get(a.investment_range) || 0) + 1);
  }
  return [...m.entries()].map(([range, count]) => ({ range, count })).sort((a, b) => b.count - a.count);
}

type Filter = 'all' | 'completed' | 'partial' | 'booked' | 'notbooked';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'completed', label: 'Finished' }, { id: 'partial', label: 'Partial (didn’t finish)' },
  { id: 'booked', label: 'Booked' }, { id: 'notbooked', label: 'Not booked' },
];

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: `${color}1f`, color, border: `1px solid ${color}55`, whiteSpace: 'nowrap' }}>{text}</span>;
}

function AnswerRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, padding: '4px 0' }}>
      <span style={{ fontFamily: SANS, fontSize: 12, color: creamDim }}>{label}</span>
      <span style={{ fontFamily: SANS, fontSize: 13, color: cream }}>{value}</span>
    </div>
  );
}

export function ApplicantsPanel({ range }: { range: { from: Date; to: Date } }) {
  const [funnels, setFunnels] = useState<FunnelGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [openFunnel, setOpenFunnel] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Depend on the primitive range bounds, not the `range` object identity.
  // The parent re-renders every second (a live clock), handing us a fresh
  // `{from,to}` object each time; keying off the object would refire this
  // fetch every second, flashing the panel back to its "Loading…" state.
  const from = range.from.getTime();
  const to = range.to.getTime();
  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ from: from.toString(), to: to.toString() });
    fetch(`/api/admin/applicants?${params}`, { signal: AbortSignal.timeout(20000) })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setFunnels(d.funnels ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const r = await fetch('/api/admin/sync-bookings', { method: 'POST' });
      const d = await r.json();
      const b = d.bookings;
      setSyncMsg(d.error
        ? `Sync error: ${d.error}`
        : `Synced — ${d.matched} booking(s) matched to applicants, ${d.crm} pushed to CRM.`
          + (b ? ` Strategy calls (last ${b.days}d + upcoming): ${b.events} booking(s) → ${b.created} new lead(s), ${b.updated} updated${b.canceled ? `, ${b.canceled} cancelled` : ''}.${b.error ? ` (${b.error})` : ''}` : ''));
      load();
    } catch { setSyncMsg('Sync failed.'); }
    setSyncing(false);
  };

  const matchFilter = (a: Applicant) =>
    filter === 'all' ? true : filter === 'completed' ? a.completed : filter === 'partial' ? !a.completed : filter === 'booked' ? a.booked : !a.booked;

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 22, color: cream }}>Applicants</span>
        <span style={{ fontFamily: SANS, fontSize: 12.5, color: creamDim }}>Everyone who started the application — answers, whether they finished, and whether they booked.</span>
        <div style={{ flex: 1 }} />
        <button onClick={sync} disabled={syncing} style={{ padding: '7px 14px', borderRadius: 20, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.3)', color: GOLD, fontFamily: SANS, fontSize: 12.5, cursor: 'pointer' }}>
          {syncing ? 'Syncing…' : '↻ Sync bookings from Calendly'}
        </button>
      </div>
      {syncMsg && <div style={{ fontFamily: SANS, fontSize: 12, color: creamFaint, marginBottom: 10 }}>{syncMsg}</div>}

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: SANS, fontSize: 12,
            background: filter === f.id ? 'rgba(201,164,85,0.14)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${filter === f.id ? 'rgba(201,164,85,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: filter === f.id ? GOLD : creamFaint,
          }}>{f.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ fontFamily: SANS, fontSize: 14, color: creamDim, padding: '20px 0', textAlign: 'center' }}>Loading applicants…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {funnels.map(g => {
            const color = FAMILY_COLORS[g.funnel] || '#6FE9FF';
            const list = g.applicants.filter(matchFilter);
            const isOpen = openFunnel === g.funnel;
            return (
              <div key={g.funnel} style={{ ...card, padding: 0, borderLeft: `3px solid ${color}` }}>
                <div onClick={() => setOpenFunnel(isOpen ? null : g.funnel)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', cursor: 'pointer', flexWrap: 'wrap' }}>
                  <span style={{ color: creamDim, fontSize: 12, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>▶</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  <span style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 20, color: cream }}>{g.label}</span>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: creamDim }}>{SOURCE_PATH[g.funnel] || ''}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontFamily: SANS, fontSize: 12.5, color: creamFaint }}>
                    {g.counts.total} applied · {g.counts.completed} finished · {g.counts.partial} partial · <span style={{ color: '#4ade80' }}>{g.counts.booked} booked</span>
                  </span>
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Investment-range mix for this funnel (full labels) */}
                    {(() => {
                      const mix = investmentMix(g.applicants);
                      if (mix.length === 0) return null;
                      const max = Math.max(...mix.map(x => x.count), 1);
                      return (
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: creamDim, marginBottom: 8 }}>Investment range mix</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {mix.map(r => (
                              <div key={r.range} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, max-content) 1fr 32px', gap: 10, alignItems: 'center' }}>
                                <span style={{ fontFamily: SANS, fontSize: 13, color: cream, whiteSpace: 'normal' }}>{r.range}</span>
                                <div style={{ background: 'rgba(255,255,255,0.05)', height: 6, borderRadius: 3 }}>
                                  <div style={{ height: '100%', width: `${Math.round((r.count / max) * 100)}%`, background: color, opacity: 0.8, borderRadius: 3 }} />
                                </div>
                                <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color, textAlign: 'right' }}>{r.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {list.length === 0 ? (
                      <div style={{ fontFamily: SANS, fontSize: 13, color: creamDim, padding: '16px 18px' }}>No applicants match this filter.</div>
                    ) : list.map(a => {
                      const key = `${g.funnel}:${a.email}`;
                      const isEx = expanded === key;
                      return (
                        <div key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <div onClick={() => setExpanded(isEx ? null : key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', cursor: 'pointer', flexWrap: 'wrap' }}>
                            <span style={{ color: creamDim, fontSize: 11, transform: isEx ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>▶</span>
                            <div style={{ minWidth: 200, flex: 1 }}>
                              <div style={{ fontFamily: SANS, fontSize: 14, color: cream }}>{a.name || a.email}</div>
                              <div style={{ fontFamily: SANS, fontSize: 11.5, color: creamDim }}>{a.email}{a.instagram ? ` · @${a.instagram.replace(/^@/, '')}` : ''}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              {a.completed ? <Badge text="Finished" color="#4ade80" /> : <Badge text={`Partial${a.last_step != null ? ` · step ${a.last_step}` : ''}`} color="#F0826D" />}
                              {a.qualified != null && <Badge text={a.qualified ? 'Qualified' : 'DQ'} color={a.qualified ? '#4ade80' : 'rgba(239,68,68,0.8)'} />}
                              {a.booked ? <Badge text={`Booked · ${fmtDate(a.scheduled_at)}`} color="#C9A8FF" /> : <Badge text="Not booked" color="rgba(240,232,212,0.35)" />}
                            </div>
                          </div>
                          {isEx && (
                            <div style={{ padding: '4px 18px 16px 40px', background: 'rgba(0,0,0,0.15)' }}>
                              <AnswerRow label="Phone" value={a.phone} />
                              <AnswerRow label="Instagram" value={a.instagram} />
                              <AnswerRow label="Business" value={a.business} />
                              <AnswerRow label="Current revenue" value={a.current_revenue} />
                              <AnswerRow label="Target revenue" value={a.target_revenue} />
                              <AnswerRow label="Investment range" value={a.investment_range} />
                              <AnswerRow label="Commitment" value={a.commitment} />
                              <AnswerRow label="Decision maker" value={a.decision_maker} />
                              <AnswerRow label="Biggest blocker" value={a.blocker} />
                              <AnswerRow label="Applied" value={fmtDate(a.submitted_at)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
