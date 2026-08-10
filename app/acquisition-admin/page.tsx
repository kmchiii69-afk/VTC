'use client';

// Acquisition Admin panel — a READ-ONLY member view scoped to acquisition
// clients, for accounts holding the `acq_admin` tag (and full admins). It mirrors
// the main admin user drawer but strips every editing control. All data comes
// from the isAcqAdmin-guarded /api/acq-admin/* endpoints; this page's own guard
// (redirect if not acq-admin) is just UX — real enforcement lives server-side.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';
import { ProfileButton } from '@/components/ui/profile-button';
import { PORTAL_FEATURES } from '@/lib/features';
import { computeActivityLevel, activityLabel, ACTIVITY_COLORS as AUTO_COLORS } from '@/lib/activity';

/* ─── Style tokens (kept in sync with app/admin/page.tsx) ─────────────── */
const gold = 'rgba(201,164,85,0.7)';
const goldSolid = '#c9a455';
const cream = 'rgba(240,232,212,0.85)';
const creamFaint = 'rgba(240,232,212,0.55)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 14,
};
const clamp5: React.CSSProperties = {
  display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden',
};

const ACTIVITY_LABELS: Record<string, string> = {
  very_active: 'Very Active', active: 'Active', moderate: 'Moderate',
  low: 'Low', inactive: 'Inactive', '': '—',
};
const ACTIVITY_COLORS: Record<string, string> = {
  very_active: '#4ade80', active: '#86efac', moderate: '#fbbf24',
  low: '#f97316', inactive: '#ef4444', '': 'rgba(240,232,212,0.2)',
};
const TAG_OPTIONS = [
  { value: 'icp', label: 'ICP', color: '#4ade80' },
  { value: 'low_icp', label: 'Low ICP', color: '#94a3b8' },
  { value: 'on_fire', label: 'On Fire', color: '#f97316' },
  { value: 'needs_attention', label: 'Needs Attention', color: '#fbbf24' },
  { value: 'at_risk', label: 'At Risk', color: '#ef4444' },
  { value: 'alumni', label: 'Alumni', color: '#a78bfa' },
  { value: 'existing_client', label: 'Existing Client', color: '#38bdf8' },
  { value: 'recent_onboarding', label: 'Recent Onboarding', color: '#c9a455' },
  { value: '14k', label: '4 Month Contract', color: '#34d399' },
  { value: '25k', label: '6 Month Contract', color: '#e879f9' },
] as const;
const TAG_MAP = Object.fromEntries(TAG_OPTIONS.map((t) => [t.value, t])) as Record<string, typeof TAG_OPTIONS[number]>;
const FEATURE_LABELS = Object.fromEntries(PORTAL_FEATURES.map((f) => [f.id, f.label]));
const CHECKIN_PHASE_LABELS: Record<number, string> = {
  1: 'Foundation of Content',
  2: 'Mastering Camera Presence',
  3: 'Brand Positioning + Content Messaging',
  4: 'TOF Masterclass',
  5: 'MOF Masterclass',
};

function fmt(ts: number) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtIso(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── Types ───────────────────────────────────────────────────────────── */
interface ClientProfile {
  email: string;
  name: string;
  role: 'user' | 'admin';
  active: boolean;
  activity_level: string;
  discord_id: string;
  discord_channel_id: string;
  created_at: number;
  last_login: number;
  start_date: number;
  last_call_date: number;
  contract_end_date: number;
  revenue_goal: number;
  revenue_current: number;
  tags: string[];
  features: string[];
}
interface CheckIn {
  id: string;
  title: string | null;
  coach_name: string | null;
  call_date: string | null;
  status: string;
  summary_bullets?: string[];
  red_flags?: string[];
  recording_url?: string | null;
}
interface Progress {
  narrative?: string;
  momentum?: string | null;
  admin_notes?: string;
  roadmap_state?: { current_phase?: number };
}
interface ActionItem {
  id: string;
  text: string;
  status: 'open' | 'completed';
  source: 'admin' | 'ai';
  due_date: string | null;
  completed_by: string | null;
}
interface Win {
  id: string;
  content: string;
  source: 'manual' | 'discord';
  created_at: string;
}
interface Detail {
  user: ClientProfile;
  roadmapCompleted: string[];
  checkins: CheckIn[];
  counts: { total: number; byCoach: { coach_name: string | null; count: number }[] };
  progress: Progress | null;
  actionItems: ActionItem[];
  wins: Win[];
}

/* ─── Small presentational helpers ────────────────────────────────────── */
function Pill({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: color || 'rgba(201,164,85,0.6)',
      border: `1px solid ${color ? color + '33' : 'rgba(201,164,85,0.15)'}`,
      background: color ? color + '10' : 'rgba(201,164,85,0.04)',
      fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
    }}>{children}</span>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.2em',
      textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)', marginBottom: 10,
    }}>{children}</div>
  );
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint }}>{label}</span>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: cream, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
const ciCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.12)',
  borderRadius: 10, padding: '12px 14px',
};

/* ─── Read-only profile drawer ────────────────────────────────────────── */
function ClientDrawer({ email, onClose }: { email: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [openCheckIn, setOpenCheckIn] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(false); setErr('');
    fetch(`/api/acq-admin/clients/${encodeURIComponent(email)}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(await r.json().catch(() => ({})))))
      .then((d) => setDetail(d))
      .catch((e) => setErr(e?.error || 'Failed to load'))
      .finally(() => setLoaded(true));
  }, [email]);

  const u = detail?.user;
  const goalPct = u && u.revenue_goal && u.revenue_current
    ? Math.min(100, Math.round((u.revenue_current / u.revenue_goal) * 100)) : 0;
  const phase = Number(detail?.progress?.roadmap_state?.current_phase) || 0;
  const openItems = (detail?.actionItems || []).filter((i) => i.status === 'open');

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 420, maxWidth: '92vw', height: '100%', background: 'rgba(10,8,6,0.94)',
        borderLeft: '1px solid rgba(201,164,85,0.1)', display: 'flex', flexDirection: 'column',
        padding: '28px 24px', overflowY: 'auto', gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: cream }}>
              {u?.name || 'Member'}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint, marginTop: 3 }}>{email}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: creamFaint, fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {!loaded && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: creamFaint }}>Loading…</div>}
        {loaded && err && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#ef4444' }}>{err}</div>}

        {loaded && u && (
          <>
            {/* Read-only banner */}
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.45)' }}>
              Read-only · Acquisition
            </div>

            {/* Status pills */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Pill color={u.active ? '#4ade80' : '#ef4444'}>{u.active ? 'Active' : 'Inactive'}</Pill>
              <Pill>{u.role === 'admin' ? 'Admin' : 'Member'}</Pill>
              {u.activity_level && <Pill color={ACTIVITY_COLORS[u.activity_level]}>{ACTIVITY_LABELS[u.activity_level]}</Pill>}
              {(u.tags || []).map((tag) => {
                const t = TAG_MAP[tag];
                return t ? <Pill key={tag} color={t.color}>{t.label}</Pill> : null;
              })}
            </div>

            {/* Portal access */}
            <section>
              <SectionLabel>Portal Access</SectionLabel>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(u.features && u.features.length ? u.features : ['recordings']).map((f) => (
                  <span key={f} style={{
                    padding: '5px 12px', borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 10,
                    letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, color: goldSolid,
                    background: 'rgba(201,164,85,0.09)', border: '1px solid rgba(201,164,85,0.31)',
                  }}>{FEATURE_LABELS[f] || f}</span>
                ))}
              </div>
            </section>

            {/* Dates */}
            <section>
              <SectionLabel>Dates</SectionLabel>
              <div style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <InfoRow label="Account Created" value={fmt(u.created_at)} />
                <InfoRow label="Last Login" value={fmt(u.last_login)} />
                <InfoRow label="Started Program" value={fmt(u.start_date)} />
                <InfoRow label="Last Call" value={fmt(u.last_call_date)} />
                <InfoRow label="Contract Ends" value={fmt(u.contract_end_date)} />
              </div>
            </section>

            {/* Revenue */}
            <section>
              <SectionLabel>Revenue</SectionLabel>
              <div style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint, letterSpacing: '0.1em' }}>CURRENT</div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: cream }}>${(u.revenue_current || 0).toLocaleString()}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint, letterSpacing: '0.1em' }}>GOAL</div>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: cream }}>${(u.revenue_goal || 0).toLocaleString()}</div>
                  </div>
                </div>
                {u.revenue_goal > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint }}>Progress to goal</span>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: goalPct === 100 ? '#4ade80' : gold }}>{goalPct}%</span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(201,164,85,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${goalPct}%`, background: goalPct === 100 ? '#4ade80' : 'rgba(201,164,85,0.6)', borderRadius: 2 }} />
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Check-ins */}
            <section>
              <SectionLabel>Check-ins</SectionLabel>
              {detail!.counts.total === 0 && !detail!.progress ? (
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint }}>No recorded check-ins yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ ...ciCard, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: cream }}>
                        <span style={{ color: goldSolid, fontWeight: 600, fontSize: 16 }}>{detail!.counts.total}</span> total
                      </span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {detail!.counts.byCoach.map((c, i) => (
                          <span key={i} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: goldSolid, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(201,164,85,0.25)' }}>
                            {(c.coach_name || 'Coach')} · {c.count}
                          </span>
                        ))}
                      </div>
                    </div>
                    {(phase > 0 || detail!.progress?.momentum) && (
                      <div style={{ display: 'flex', gap: 16, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint }}>
                        {phase > 0 && <span>Phase <span style={{ color: goldSolid }}>{phase}</span> · {CHECKIN_PHASE_LABELS[phase]}</span>}
                        {detail!.progress?.momentum && <span>Momentum: <span style={{ color: cream }}>{detail!.progress.momentum}</span></span>}
                      </div>
                    )}
                  </div>

                  {detail!.progress?.narrative && (
                    <div style={ciCard}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)', marginBottom: 6 }}>Progress</div>
                      <p style={{ ...clamp5, margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: cream, lineHeight: 1.6 }}>{detail!.progress.narrative}</p>
                    </div>
                  )}
                  {detail!.progress?.admin_notes && (
                    <div style={{ ...ciCard, border: '1px solid rgba(248,113,113,0.18)', background: 'rgba(248,113,113,0.04)' }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(248,113,113,0.7)', marginBottom: 6 }}>Admin notes · red flags</div>
                      <p style={{ ...clamp5, margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(240,232,212,0.7)', lineHeight: 1.6 }}>{detail!.progress.admin_notes}</p>
                    </div>
                  )}

                  {detail!.checkins.filter((c) => c.status !== 'unmatched_client').map((ci) => {
                    const open = openCheckIn === ci.id;
                    return (
                      <div key={ci.id} style={{ ...ciCard, padding: 0, overflow: 'hidden' }}>
                        <button onClick={() => setOpenCheckIn(open ? null : ci.id)} style={{
                          width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                          padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          color: cream, fontFamily: "'DM Sans', sans-serif",
                        }}>
                          <span style={{ fontSize: 12 }}>{ci.title || 'Check-in'}
                            <span style={{ color: creamFaint, marginLeft: 8, fontSize: 11 }}>{fmtIso(ci.call_date)}{ci.coach_name ? ` · ${ci.coach_name}` : ''}</span>
                          </span>
                          <span style={{ color: creamFaint }}>{open ? '−' : '+'}</span>
                        </button>
                        {open && (
                          <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {!!ci.summary_bullets?.length && (
                              <ul style={{ margin: 0, paddingLeft: 16 }}>
                                {ci.summary_bullets.map((b, i) => (
                                  <li key={i} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: 'rgba(240,232,212,0.65)', lineHeight: 1.5 }}>{b}</li>
                                ))}
                              </ul>
                            )}
                            {!!ci.red_flags?.length && ci.red_flags.map((f, i) => (
                              <div key={i} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(248,113,113,0.8)', lineHeight: 1.5 }}>⚑ {f}</div>
                            ))}
                            {ci.recording_url && (
                              <a href={ci.recording_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: goldSolid, textDecoration: 'none' }}>Recording ↗</a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Action items */}
            <section>
              <SectionLabel>Action Items{openItems.length ? ` · ${openItems.length} open` : ''}</SectionLabel>
              {detail!.actionItems.length === 0 ? (
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint }}>No action items yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detail!.actionItems.map((it) => {
                    const done = it.status === 'completed';
                    return (
                      <div key={it.id} style={{ ...ciCard, display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                        <span style={{ color: done ? '#4ade80' : gold, fontSize: 13, marginTop: 1, flexShrink: 0 }}>{done ? '☑' : '☐'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5, color: done ? creamFaint : cream, textDecoration: done ? 'line-through' : 'none' }}>{it.text}</div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                            {it.due_date && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint }}>Due {fmtIso(it.due_date)}</span>}
                            <span style={{ fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: it.source === 'ai' ? 'rgba(96,165,250,0.7)' : 'rgba(201,164,85,0.5)' }}>{it.source === 'ai' ? 'From call' : 'Assigned'}</span>
                            {done && it.completed_by && <span style={{ fontSize: 9, color: creamFaint }}>✓ {it.completed_by === 'client' ? 'by client' : 'by admin'}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Discord */}
            {(u.discord_id || u.discord_channel_id) && (
              <section>
                <SectionLabel>Discord</SectionLabel>
                <div style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {u.discord_id && <InfoRow label="User ID" value={u.discord_id} />}
                  {u.discord_channel_id && <InfoRow label="1-1 Channel" value={u.discord_channel_id} />}
                </div>
              </section>
            )}

            {/* Activity level (computed, read-only) */}
            <section>
              <SectionLabel>Activity Level</SectionLabel>
              {(() => {
                const computed = computeActivityLevel(u.last_login, detail!.roadmapCompleted.length);
                const color = AUTO_COLORS[computed] ?? 'rgba(201,164,85,0.5)';
                return (
                  <div style={{ ...card, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color, fontWeight: 600 }}>{activityLabel(computed)}</span>
                    </div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint, marginTop: 4 }}>
                      Auto · last login + {detail!.roadmapCompleted.length}/25 roadmap steps
                    </div>
                  </div>
                );
              })()}
            </section>

            {/* Wins log */}
            <section>
              <SectionLabel>Wins Log</SectionLabel>
              {detail!.wins.length === 0 ? (
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint }}>No wins logged yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detail!.wins.map((w) => (
                    <div key={w.id} style={{ ...ciCard }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: cream, lineHeight: 1.5 }}>{w.content}</div>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, color: creamFaint, marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {fmtIso(w.created_at)}{w.source === 'discord' ? ' · Discord' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────── */
export default function AcquisitionAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me/features', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const f = Array.isArray(d?.features) ? d.features : [];
        if (f.includes('acq_admin')) {
          setAllowed(true);
        } else {
          setAllowed(false);
          router.replace('/select');
        }
      })
      .catch(() => { setAllowed(false); router.replace('/'); });
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    fetch('/api/acq-admin/clients', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.clients)) setClients(d.clients); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [allowed]);

  if (allowed === null || allowed === false) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? clients.filter((c) => (c.name || '').toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : clients;

  return (
    <main style={{ minHeight: '100vh', position: 'relative', background: '#0a0806' }}>
      <MeshBg speed={0.4} />
      <ProfileButton />
      <div style={{ position: 'relative', zIndex: 10, maxWidth: 760, margin: '0 auto', padding: '72px 24px 80px' }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)' }}>
          Acquisition Admin
        </div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, fontWeight: 300, color: cream, margin: '6px 0 4px' }}>
          Clients
        </h1>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: creamFaint, marginTop: 0, marginBottom: 28, lineHeight: 1.5 }}>
          Read-only profiles for every member tagged Acquisition. Click a client to view their full profile.
        </p>

        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          style={{
            width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: cream,
            fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 18,
          }}
        />

        {loading ? (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: creamFaint }}>Loading clients…</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: creamFaint }}>
            {clients.length === 0 ? 'No acquisition-tagged clients yet.' : 'No matches.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((c) => (
              <button key={c.email} onClick={() => setSelected(c.email)} style={{
                ...card, padding: '14px 18px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: cream, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || c.email}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint, marginTop: 2 }}>{c.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {!c.active && <Pill color="#ef4444">Inactive</Pill>}
                  {c.activity_level && <Pill color={ACTIVITY_COLORS[c.activity_level]}>{ACTIVITY_LABELS[c.activity_level]}</Pill>}
                  <span style={{ color: creamFaint, fontSize: 18, lineHeight: 1 }}>›</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && <ClientDrawer email={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
