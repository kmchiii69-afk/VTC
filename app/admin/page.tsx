'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';
import { countCompleted, getCurrentPhase, totalItems } from '@/lib/roadmap-data';
import { phasesFor, roadmapVariantFor } from '@/lib/roadmap-variant';
import { CsmView } from '@/components/admin/csm-view';
import { RoadmapContentView } from '@/components/admin/roadmap-content-view';
import { SkeletonList, Dots, Spinner } from '@/components/ui/loaders';
import { computeActivityLevel, activityLabel, ACTIVITY_COLORS as AUTO_COLORS } from '@/lib/activity';
import { PORTAL_FEATURES, DEFAULT_FEATURES } from '@/lib/features';
import { LivingFunnel } from '@/components/admin/LivingFunnel';
import { RangePicker, type DateRange } from '@/components/admin/RangePicker';
import { AttributionVelocityPanel, type FunnelEventsAnalytics } from '@/components/admin/AttributionVelocityPanel';
import { PageFunnelTable, type PageFunnelRow } from '@/components/admin/PageFunnelTable';
import { ApplicantsPanel } from '@/components/admin/ApplicantsPanel';
import { DailyViewsChart } from '@/components/admin/DailyViewsChart';
import {
  cadenceFor, isDue, stageKind, findStageKey, ACTION_LABELS, CADENCE_LABELS,
  type SetterAction,
} from '@/lib/crm-followup';
import { useSoftphone, type Softphone } from '@/components/crm/use-softphone';
import { DialerPanel, buildE164, type QueueItem } from '@/components/crm/DialerPanel';

/* ─── Sales Calls Types ──────────────────────────────────────────────── */
interface IcpReport {
  id: string;
  created_at: string;
  icp_score: number;
  close_likelihood: number;
  pain_points: string[];
  call_summary: string;
  next_step: string;
  discord_sent: boolean;
  user_feedback: string | null;
  full_analysis: Record<string, unknown> | null;
  calls: {
    id: string;
    fathom_call_id: string;
    lead_name: string;
    closer: string;
    setter: string;
    call_date: string;
    outcome: string;
    revenue: number;
    cash_collected: number;
    product: string;
    raw_payload: Record<string, unknown>;
    status: string;
    source: string;
  } | null;
}

/* ─── Types ─────────────────────────────────────────────────────────── */
interface User {
  email: string;
  name: string;
  avatar: string;
  role: 'user' | 'admin';
  active: boolean;
  status?: 'pending' | 'approved' | 'rejected';
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

interface ClientWin {
  id: string;
  user_email: string;
  content: string;
  source: 'manual' | 'discord';
  discord_message_id: string;
  created_at: string;
}

interface DiscordMessage {
  id: string;
  content: string;
  author: string;
  timestamp: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
function fmt(ts: number) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function tsToDateInput(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toISOString().slice(0, 10);
}
function dateInputToTs(val: string): number {
  if (!val) return 0;
  return new Date(val + 'T00:00:00').getTime();
}
function fmtWinDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ACTIVITY_OPTS = ['', 'very_active', 'active', 'moderate', 'low', 'inactive'] as const;
const ACTIVITY_LABELS: Record<string, string> = {
  very_active: 'Very Active', active: 'Active', moderate: 'Moderate',
  low: 'Low', inactive: 'Inactive', '': '—',
};
const ACTIVITY_COLORS: Record<string, string> = {
  very_active: '#4ade80', active: '#86efac', moderate: '#fbbf24',
  low: '#f97316', inactive: '#ef4444', '': 'rgba(240,232,212,0.2)',
};

const TAG_OPTIONS = [
  { value: 'icp',              label: 'ICP',              color: '#4ade80' },
  { value: 'low_icp',          label: 'Low ICP',          color: '#94a3b8' },
  { value: 'on_fire',          label: 'On Fire',          color: '#f97316' },
  { value: 'needs_attention',  label: 'Needs Attention',  color: '#fbbf24' },
  { value: 'at_risk',          label: 'At Risk',          color: '#ef4444' },
  { value: 'alumni',           label: 'Alumni',           color: '#a78bfa' },
  { value: 'renewal_prospect', label: 'Renewal Prospect', color: '#2dd4bf' },
  // Behavioral tags: both skip onboarding; "Existing Client" also opens the roadmap.
  { value: 'existing_client',  label: 'Existing Client',  color: '#38bdf8' },
  { value: 'recent_onboarding', label: 'Recent Onboarding', color: '#c9a455' },
  // Contract-tier tags: control which contract the client is shown to sign.
  { value: '14k',              label: '4 Month Contract', color: '#34d399' },
  { value: '25k',              label: '6 Month Contract', color: '#e879f9' },
] as const;
type TagValue = typeof TAG_OPTIONS[number]['value'];
const TAG_MAP = Object.fromEntries(TAG_OPTIONS.map((t) => [t.value, t])) as Record<TagValue, typeof TAG_OPTIONS[number]>;

/* ─── Shared style tokens ────────────────────────────────────────────── */
const gold = 'rgba(201,164,85,0.7)';
const goldFaint = 'rgba(201,164,85,0.2)';
const cream = 'rgba(240,232,212,0.85)';
const creamFaint = 'rgba(240,232,212,0.55)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 14,
};
function inputStyle(error = false): React.CSSProperties {
  return {
    width: '100%', padding: '11px 14px',
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 10, color: cream,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13,
    outline: 'none', boxSizing: 'border-box' as const,
  };
}

/* ─── Sub-components ─────────────────────────────────────────────────── */
function Pill({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
      color: color || 'rgba(201,164,85,0.6)',
      border: `1px solid ${color ? color + '33' : 'rgba(201,164,85,0.15)'}`,
      background: color ? color + '10' : 'rgba(201,164,85,0.04)',
      fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
    }}>
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ ...card, padding: '18px 22px', flex: 1, minWidth: 120 }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, color: cream, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: creamFaint, marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

/* ─── Add User Modal ──────────────────────────────────────────────────── */
function AddUserModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [tags, setTags] = useState<string[]>([]);
  const [discordChannelId, setDiscordChannelId] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!email || !password) { setErr('Email and password required'); return; }
    setSaving(true); setErr('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password, role, tags, discord_channel_id: discordChannelId.trim() }),
    });
    if (res.ok) { onAdded(); onClose(); }
    else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || 'Failed');
    }
    setSaving(false);
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.65)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...card, width: 380, padding: '28px 28px', background: 'rgba(14,11,7,0.92)',
      }}>
        <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: cream, marginBottom: 20, marginTop: 0 }}>
          Add Member
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input style={inputStyle()} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={inputStyle()} placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="password" style={inputStyle()} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value as 'user' | 'admin')} style={{ ...inputStyle(), cursor: 'pointer' }}>
            <option value="user">Member</option>
            <option value="admin">Admin</option>
          </select>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600, margin: '4px 0 8px' }}>Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {TAG_OPTIONS.map((t) => {
                const active = tags.includes(t.value);
                return (
                  <button key={t.value} type="button" onClick={() => setTags((prev) => active ? prev.filter((x) => x !== t.value) : [...prev, t.value])} style={{
                    padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                    background: active ? `${t.color}22` : 'transparent', border: `1px solid ${active ? t.color : 'rgba(255,255,255,0.12)'}`,
                    color: active ? t.color : creamFaint,
                  }}>{t.label}</button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600, margin: '4px 0 6px' }}>1-1 Discord Channel ID (optional)</div>
            <input style={inputStyle()} placeholder="Their 1-1 channel ID" value={discordChannelId} onChange={(e) => setDiscordChannelId(e.target.value)} />
          </div>
          {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={save} disabled={saving} style={{
              flex: 1, padding: '11px', background: 'rgba(201,164,85,0.12)',
              border: '1px solid rgba(201,164,85,0.3)', borderRadius: 10,
              color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12,
              letterSpacing: '0.15em', textTransform: 'uppercase', cursor: saving ? 'default' : 'pointer',
            }}>
              {saving ? 'Adding…' : 'Add Member'}
            </button>
            <button onClick={onClose} style={{
              flex: 1, padding: '11px', background: 'none',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
              color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 12,
              letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── User Detail Drawer ──────────────────────────────────────────────── */
// ─── Fathom check-in section (auto coaching-call progress) ───────────────────
const CHECKIN_PHASE_LABELS: Record<number, string> = {
  1: 'Foundation of Content',
  2: 'Mastering Camera Presence',
  3: 'Brand Positioning + Content Messaging',
  4: 'TOF Masterclass',
  5: 'MOF Masterclass',
};

interface AdminCheckIn {
  id: string;
  title: string | null;
  coach_name: string | null;
  call_date: string | null;
  status: string;
  summary_bullets?: string[];
  red_flags?: string[];
  recording_url?: string | null;
}
interface AdminClientProgress {
  narrative: string;
  momentum: string | null;
  admin_notes: string;
  roadmap_state?: { current_phase?: number };
}

// Summaries are hard-capped to 5 lines.
const clamp5: React.CSSProperties = {
  display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden',
};

function CheckInsSection({ email }: { email: string }) {
  const gold = '#c9a455';
  const cream = 'rgba(240,232,212,0.85)';
  const faint = 'rgba(240,232,212,0.6)';
  const ciCard: React.CSSProperties = {
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.12)',
    borderRadius: 10, padding: '12px 14px',
  };
  const [progress, setProgress] = useState<AdminClientProgress | null>(null);
  const [checkins, setCheckins] = useState<AdminCheckIn[]>([]);
  const [counts, setCounts] = useState<{ total: number; byCoach: { coach_name: string | null; count: number }[] }>({ total: 0, byCoach: [] });
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/clients/${encodeURIComponent(email)}/progress`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/admin/clients/${encodeURIComponent(email)}/checkins`).then((r) => r.ok ? r.json() : null),
    ]).then(([p, c]) => {
      if (p) setProgress(p);
      if (c) { setCheckins(c.checkins || []); setCounts(c.counts || { total: 0, byCoach: [] }); }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, [email]);

  if (!loaded) return null;

  const phase = Number(progress?.roadmap_state?.current_phase) || 0;
  const fmtDate = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <section>
      <SectionLabel>Check-ins</SectionLabel>
      {counts.total === 0 && !progress ? (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: faint }}>No recorded check-ins yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Counts + phase + momentum */}
          <div style={{ ...ciCard, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: cream }}>
                <span style={{ color: gold, fontWeight: 600, fontSize: 16 }}>{counts.total}</span> total
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {counts.byCoach.map((c, i) => (
                  <span key={i} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: gold, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(201,164,85,0.25)' }}>
                    {(c.coach_name || 'Coach')} · {c.count}
                  </span>
                ))}
              </div>
            </div>
            {(phase > 0 || progress?.momentum) && (
              <div style={{ display: 'flex', gap: 16, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: faint }}>
                {phase > 0 && <span>Phase <span style={{ color: gold }}>{phase}</span> · {CHECKIN_PHASE_LABELS[phase]}</span>}
                {progress?.momentum && <span>Momentum: <span style={{ color: cream }}>{progress.momentum}</span></span>}
              </div>
            )}
          </div>

          {/* Client-facing narrative (≤5 lines) */}
          {progress?.narrative && (
            <div style={ciCard}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)', marginBottom: 6 }}>Progress</div>
              <p style={{ ...clamp5, margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: cream, lineHeight: 1.6 }}>{progress.narrative}</p>
            </div>
          )}

          {/* Admin-only notes (≤5 lines) */}
          {progress?.admin_notes && (
            <div style={{ ...ciCard, border: '1px solid rgba(248,113,113,0.18)', background: 'rgba(248,113,113,0.04)' }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(248,113,113,0.7)', marginBottom: 6 }}>Admin notes · red flags</div>
              <p style={{ ...clamp5, margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(240,232,212,0.7)', lineHeight: 1.6 }}>{progress.admin_notes}</p>
            </div>
          )}

          {/* Recent check-ins */}
          {checkins.filter((c) => c.status !== 'unmatched_client').map((ci) => {
            const open = openId === ci.id;
            return (
              <div key={ci.id} style={{ ...ciCard, padding: 0, overflow: 'hidden' }}>
                <button onClick={() => setOpenId(open ? null : ci.id)} style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: cream, fontFamily: "'DM Sans', sans-serif",
                }}>
                  <span style={{ fontSize: 12 }}>{ci.title || 'Check-in'}
                    <span style={{ color: faint, marginLeft: 8, fontSize: 11 }}>{fmtDate(ci.call_date)}{ci.coach_name ? ` · ${ci.coach_name}` : ''}</span>
                  </span>
                  <span style={{ color: faint }}>{open ? '−' : '+'}</span>
                </button>
                {open && (
                  <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!!ci.summary_bullets?.length && (
                      <ul style={{ margin: 0, paddingLeft: 16, ...clamp5 }}>
                        {ci.summary_bullets.map((b, i) => (
                          <li key={i} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: 'rgba(240,232,212,0.65)', lineHeight: 1.5 }}>{b}</li>
                        ))}
                      </ul>
                    )}
                    {!!ci.red_flags?.length && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {ci.red_flags.map((f, i) => (
                          <div key={i} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(248,113,113,0.8)', lineHeight: 1.5 }}>⚑ {f}</div>
                        ))}
                      </div>
                    )}
                    {ci.recording_url && (
                      <a href={ci.recording_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: gold, textDecoration: 'none' }}>Recording ↗</a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface AdminActionItem {
  id: string;
  text: string;
  status: 'open' | 'completed';
  source: 'admin' | 'ai';
  due_date: string | null;
  assigned_by: string | null;
  completed_by: string | null;
  created_at: string;
}

function ActionItemsAdminSection({ email }: { email: string }) {
  const faint = 'rgba(240,232,212,0.6)';
  const aiCard: React.CSSProperties = {
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.12)',
    borderRadius: 10, padding: '10px 12px',
  };
  const [items, setItems] = useState<AdminActionItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch(`/api/admin/clients/${encodeURIComponent(email)}/action-items`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setItems(d || []))
      .catch(() => {})
      .finally(() => setLoaded(true));

  useEffect(() => { load(); }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    await fetch(`/api/admin/clients/${encodeURIComponent(email)}/action-items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), due_date: due || null }),
    }).catch(() => {});
    setText(''); setDue(''); setSaving(false); load();
  };
  const toggle = async (it: AdminActionItem) => {
    await fetch(`/api/admin/action-items/${it.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: it.status === 'open' ? 'completed' : 'open' }),
    }).catch(() => {});
    load();
  };
  const del = async (id: string) => {
    await fetch(`/api/admin/action-items/${id}`, { method: 'DELETE' }).catch(() => {});
    load();
  };

  if (!loaded) return null;

  const open = items.filter((i) => i.status === 'open');
  const fmtDate = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const isOverdue = (d: string | null) => !!d && new Date(d + 'T23:59:59').getTime() < Date.now();

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <section>
      <SectionLabel>To-dos{open.length ? ` · ${open.length} open` : ''}</SectionLabel>

      {/* Assign new */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' as const }}>
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Assign a to-do…"
          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
        />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="Due date (optional)" style={{ ...inputStyle, width: 140 }} />
        <button onClick={add} disabled={saving || !text.trim()} style={{
          padding: '8px 14px', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)',
          borderRadius: 8, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 11,
          letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer', opacity: saving || !text.trim() ? 0.5 : 1,
        }}>Assign</button>
      </div>

      {items.length === 0 ? (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: faint }}>No to-dos yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it) => {
            const done = it.status === 'completed';
            const overdue = !done && isOverdue(it.due_date);
            return (
              <div key={it.id} style={{ ...aiCard, display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <button onClick={() => toggle(it)} title={done ? 'Reopen' : 'Mark complete'} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1,
                  color: done ? '#4ade80' : gold, fontSize: 13, flexShrink: 0,
                }}>{done ? '☑' : '☐'}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5, color: done ? faint : cream, textDecoration: done ? 'line-through' : 'none' }}>
                    {it.text}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' as const }}>
                    {it.due_date && (
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: overdue ? '#ef4444' : faint }}>
                        {overdue ? 'Overdue · ' : 'Due '}{fmtDate(it.due_date)}
                      </span>
                    )}
                    <span style={{ fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: it.source === 'ai' ? 'rgba(96,165,250,0.7)' : 'rgba(201,164,85,0.5)' }}>
                      {it.source === 'ai' ? 'From call' : 'Assigned'}
                    </span>
                    {done && it.completed_by && (
                      <span style={{ fontSize: 9, color: faint }}>✓ {it.completed_by === 'client' ? 'by client' : 'by admin'}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => del(it.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: faint, fontSize: 15, padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function UserDrawer({ user, onClose, onUpdated, onDeleted }: {
  user: User; onClose: () => void; onUpdated: (u: User) => void; onDeleted: () => void;
}) {
  const [discordId, setDiscordId] = useState(user.discord_id || '');
  const [discordChannelId, setDiscordChannelId] = useState(user.discord_channel_id || '');
  const [discordInfo, setDiscordInfo] = useState<null | { username: string; display_name: string; avatar_url: string | null }>(null);
  const [newPw, setNewPw] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>(user.role);
  const [startDate, setStartDate] = useState(tsToDateInput(user.start_date));
  const [lastCallDate, setLastCallDate] = useState(tsToDateInput(user.last_call_date));
  const [contractEndDate, setContractEndDate] = useState(tsToDateInput(user.contract_end_date));
  const [revenueGoal, setRevenueGoal] = useState(String(user.revenue_goal || ''));
  const [revenueCurrent, setRevenueCurrent] = useState(String(user.revenue_current || ''));
  const [tags, setTags] = useState<string[]>(user.tags || []);
  // Portal features this client may see. Empty => the client falls back to the
  // default allowlist (recordings only), so we seed the UI with that default.
  const [features, setFeatures] = useState<string[]>(
    user.features && user.features.length ? user.features : [...DEFAULT_FEATURES]
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Roadmap completion drives the auto activity-level calc (the progress display
  // section was removed, but the count is still used below).
  const [roadmapCompleted, setRoadmapCompleted] = useState<string[]>([]);
  const [showNewPw, setShowNewPw] = useState(false);

  // Wins state
  const [wins, setWins] = useState<ClientWin[]>([]);
  const [newWin, setNewWin] = useState('');
  const [addingWin, setAddingWin] = useState(false);
  const [syncingDiscord, setSyncingDiscord] = useState(false);
  const [discordMessages, setDiscordMessages] = useState<DiscordMessage[]>([]);
  const [showDiscordMsgs, setShowDiscordMsgs] = useState(false);
  const [testingChannel, setTestingChannel] = useState(false);
  const [channelTest, setChannelTest] = useState('');

  const testChannel = async () => {
    const cid = discordChannelId.trim();
    if (!cid) { setChannelTest('Enter a channel ID first.'); return; }
    setTestingChannel(true); setChannelTest('');
    try {
      const res = await fetch('/api/admin/discord/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: cid }),
      });
      const d = await res.json().catch(() => ({}));
      setChannelTest(d.ok ? 'Sent — check the channel.' : (d.error || 'Failed to send.'));
    } catch { setChannelTest('Failed to send.'); }
    setTestingChannel(false);
  };

  useEffect(() => {
    if (user.discord_id) {
      fetch(`/api/admin/discord/${user.discord_id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setDiscordInfo(d))
        .catch(() => {});
    }
    fetch(`/api/admin/progress/${encodeURIComponent(user.email)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setRoadmapCompleted(d.completed))
      .catch(() => {});
    fetch(`/api/admin/wins/${encodeURIComponent(user.email)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setWins(d))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDiscord = () => {
    if (!discordId) return;
    fetch(`/api/admin/discord/${discordId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setDiscordInfo(d))
      .catch(() => {});
  };

  const toggleTag = (tag: string) => {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const [featSaving, setFeatSaving] = useState<string | null>(null);
  // Feature toggles save immediately (only the `features` field, so they work
  // regardless of other columns) — no "Save Changes" click needed.
  const toggleFeature = async (id: string) => {
    const prev = features;
    const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
    setFeatures(next);        // optimistic
    setFeatSaving(id);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: next }),
      });
      if (res.ok) {
        onUpdated(await res.json());
      } else {
        setFeatures(prev);    // revert on failure
        const d = await res.json().catch(() => ({}));
        setMsg(d.error ? `Failed: ${d.error}` : 'Failed to update feature');
      }
    } catch {
      setFeatures(prev);
      setMsg('Failed to update feature');
    } finally {
      setFeatSaving(null);
    }
  };

  const save = async () => {
    setSaving(true); setMsg('');
    const body: Record<string, unknown> = {
      discord_id: discordId,
      discord_channel_id: discordChannelId,
      role,
      start_date: dateInputToTs(startDate),
      last_call_date: dateInputToTs(lastCallDate),
      contract_end_date: dateInputToTs(contractEndDate),
      revenue_goal: parseFloat(revenueGoal) || 0,
      revenue_current: parseFloat(revenueCurrent) || 0,
      tags,
    };
    if (newPw) body.new_password = newPw;
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdated(updated);
      setMsg('Saved');
      setNewPw('');
      setTimeout(() => setMsg(''), 2000);
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error ? `Failed: ${d.error}` : 'Failed to save');
    }
    setSaving(false);
  };

  const toggleActive = async () => {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    });
    if (res.ok) onUpdated(await res.json());
  };

  const doDelete = async () => {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}`, { method: 'DELETE' });
    if (res.ok) { onDeleted(); onClose(); }
  };

  const submitWin = async () => {
    if (!newWin.trim()) return;
    setAddingWin(true);
    const res = await fetch(`/api/admin/wins/${encodeURIComponent(user.email)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newWin }),
    });
    if (res.ok) {
      const win = await res.json();
      setWins((prev) => [win, ...prev]);
      setNewWin('');
    }
    setAddingWin(false);
  };

  const removeWin = async (id: string) => {
    await fetch(`/api/admin/wins/${encodeURIComponent(user.email)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setWins((prev) => prev.filter((w) => w.id !== id));
  };

  const syncFromDiscord = async () => {
    const cid = discordChannelId.trim();
    if (!cid) return;
    setSyncingDiscord(true);
    const params = new URLSearchParams({ limit: '50' });
    if (discordId.trim()) params.set('author_id', discordId.trim());
    const res = await fetch(`/api/admin/discord/channel/${cid}?${params}`);
    if (res.ok) {
      const msgs: DiscordMessage[] = await res.json();
      const existingIds = new Set(wins.map((w) => w.discord_message_id));
      const withContent = msgs.filter((m) => m.content.trim() && !existingIds.has(m.id));
      setDiscordMessages(withContent);
      setShowDiscordMsgs(true);
    }
    setSyncingDiscord(false);
  };

  const addDiscordMsgAsWin = async (msg: DiscordMessage) => {
    const res = await fetch(`/api/admin/wins/${encodeURIComponent(user.email)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: msg.content, source: 'discord', discord_message_id: msg.id }),
    });
    if (res.ok) {
      const win = await res.json();
      setWins((prev) => [win, ...prev]);
      setDiscordMessages((prev) => prev.filter((m) => m.id !== msg.id));
    }
  };

  const goalPct = revenueGoal && revenueCurrent
    ? Math.min(100, Math.round((parseFloat(revenueCurrent) / parseFloat(revenueGoal)) * 100))
    : 0;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 150,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 400, height: '100%', background: 'rgba(10,8,6,0.92)',
        borderLeft: '1px solid rgba(201,164,85,0.1)',
        display: 'flex', flexDirection: 'column',
        padding: '28px 24px', overflowY: 'auto', gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: cream }}>
              {user.name || 'Member'}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint, marginTop: 3 }}>
              {user.email}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: creamFaint, fontSize: 20, lineHeight: 1, padding: 0,
          }}>×</button>
        </div>

        {/* Status pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <Pill color={user.active ? '#4ade80' : '#ef4444'}>{user.active ? 'Active' : 'Inactive'}</Pill>
          <Pill>{user.role === 'admin' ? 'Admin' : 'Member'}</Pill>
          {user.activity_level && (
            <Pill color={ACTIVITY_COLORS[user.activity_level]}>{ACTIVITY_LABELS[user.activity_level]}</Pill>
          )}
          {(user.tags || []).map((tag) => {
            const t = TAG_MAP[tag as TagValue];
            return t ? <Pill key={tag} color={t.color}>{t.label}</Pill> : null;
          })}
        </div>

        {/* Tags */}
        <section>
          <SectionLabel>Tags</SectionLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {TAG_OPTIONS.map((t) => {
              const active = tags.includes(t.value);
              return (
                <button key={t.value} onClick={() => toggleTag(t.value)} style={{
                  padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const, fontWeight: 600,
                  color: active ? t.color : 'rgba(240,232,212,0.25)',
                  background: active ? t.color + '15' : 'transparent',
                  border: `1px solid ${active ? t.color + '50' : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all 0.15s',
                }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Portal features — what this client sees in the member portal */}
        <section>
          <SectionLabel>Portal Access</SectionLabel>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint, marginBottom: 8, lineHeight: 1.4 }}>
            Toggle which tabs this client sees on login — saves instantly. New clients start with Recordings only.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {PORTAL_FEATURES.map((f) => {
              const on = features.includes(f.id);
              const busy = featSaving === f.id;
              return (
                <button key={f.id} onClick={() => toggleFeature(f.id)} disabled={busy} style={{
                  padding: '5px 12px', borderRadius: 20, cursor: busy ? 'default' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const, fontWeight: 600,
                  color: on ? '#c9a455' : 'rgba(240,232,212,0.25)',
                  background: on ? 'rgba(201,164,85,0.09)' : 'transparent',
                  border: `1px solid ${on ? 'rgba(201,164,85,0.31)' : 'rgba(255,255,255,0.08)'}`,
                  opacity: busy ? 0.5 : 1, transition: 'all 0.15s',
                }}>
                  {f.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Timestamps */}
        <section>
          <SectionLabel>Dates</SectionLabel>
          <div style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <InfoRow label="Account Created" value={fmt(user.created_at)} />
            <InfoRow label="Last Login" value={fmt(user.last_login)} />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint, flexShrink: 0 }}>Started Program</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  style={{ ...inputStyle(), padding: '5px 10px', fontSize: 11, width: 'auto', flex: '0 0 140px' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint, flexShrink: 0 }}>Last Call</span>
                <input type="date" value={lastCallDate} onChange={(e) => setLastCallDate(e.target.value)}
                  style={{ ...inputStyle(), padding: '5px 10px', fontSize: 11, width: 'auto', flex: '0 0 140px' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint, flexShrink: 0 }}>Contract Ends</span>
                <input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)}
                  style={{ ...inputStyle(), padding: '5px 10px', fontSize: 11, width: 'auto', flex: '0 0 140px' }} />
              </div>
            </div>
          </div>
        </section>

        {/* Revenue */}
        <section>
          <SectionLabel>Revenue</SectionLabel>
          <div style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint, marginBottom: 5, letterSpacing: '0.1em' }}>CURRENT</div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: creamFaint, fontSize: 12 }}>$</span>
                  <input type="number" min="0" value={revenueCurrent} onChange={(e) => setRevenueCurrent(e.target.value)}
                    style={{ ...inputStyle(), paddingLeft: 24 }} placeholder="0" />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint, marginBottom: 5, letterSpacing: '0.1em' }}>GOAL</div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: creamFaint, fontSize: 12 }}>$</span>
                  <input type="number" min="0" value={revenueGoal} onChange={(e) => setRevenueGoal(e.target.value)}
                    style={{ ...inputStyle(), paddingLeft: 24 }} placeholder="0" />
                </div>
              </div>
            </div>
            {revenueGoal && parseFloat(revenueGoal) > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint }}>Progress to goal</span>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: goalPct === 100 ? '#4ade80' : gold }}>{goalPct}%</span>
                </div>
                <div style={{ height: 3, background: 'rgba(201,164,85,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${goalPct}%`, background: goalPct === 100 ? '#4ade80' : 'rgba(201,164,85,0.6)', borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Fathom check-ins (auto coaching-call progress) */}
        <CheckInsSection email={user.email} />

        {/* Action items (manual assignment + AI-extracted, client-completable) */}
        <ActionItemsAdminSection email={user.email} />

        {/* Discord section */}
        <section>
          <SectionLabel>Discord</SectionLabel>
          {discordInfo && (
            <div style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              {discordInfo.avatar_url ? (
                <img src={discordInfo.avatar_url} style={{ width: 36, height: 36, borderRadius: '50%' }} alt="" />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: goldFaint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 14, color: gold }}>{discordInfo.username.slice(0, 2).toUpperCase()}</span>
                </div>
              )}
              <div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: cream }}>{discordInfo.display_name}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint }}>@{discordInfo.username}</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input style={{ ...inputStyle(), flex: 1 }} placeholder="Discord User ID" value={discordId}
              onChange={(e) => setDiscordId(e.target.value)} />
            <button onClick={fetchDiscord} style={{
              padding: '0 14px', background: 'rgba(201,164,85,0.08)',
              border: '1px solid rgba(201,164,85,0.2)', borderRadius: 10,
              color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 11,
              cursor: 'pointer', whiteSpace: 'nowrap' as const,
            }}>Fetch</button>
          </div>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint, marginBottom: 5, letterSpacing: '0.1em' }}>1-1 CHANNEL ID</div>
            <input style={inputStyle()} placeholder="Their 1-1 Discord channel ID" value={discordChannelId}
              onChange={(e) => { setDiscordChannelId(e.target.value); setChannelTest(''); }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7, flexWrap: 'wrap' }}>
              <button onClick={testChannel} disabled={testingChannel || !discordChannelId.trim()} style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 11, padding: '6px 12px', borderRadius: 8,
                background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.3)', color: gold,
                cursor: (testingChannel || !discordChannelId.trim()) ? 'default' : 'pointer', opacity: (testingChannel || !discordChannelId.trim()) ? 0.5 : 1,
              }}>{testingChannel ? 'Sending…' : 'Send test message'}</button>
              {channelTest && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: channelTest.startsWith('Sent') ? '#4ade80' : '#ef4444' }}>{channelTest}</span>}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10.5, color: creamFaint, marginTop: 5, lineHeight: 1.4 }}>Used to sync their wins and to post a congrats when they complete a roadmap phase. Save after editing.</div>
          </div>
        </section>

        {/* Activity level */}
        <section>
          <SectionLabel>Activity Level</SectionLabel>
          {(() => {
            const computed = computeActivityLevel(user.last_login, roadmapCompleted.length);
            const color = AUTO_COLORS[computed] ?? 'rgba(201,164,85,0.5)';
            const recalc = async () => {
              const fresh = await fetch(`/api/admin/progress/${encodeURIComponent(user.email)}`)
                .then((r) => r.ok ? r.json() : null);
              const items = fresh?.completed ?? roadmapCompleted;
              const level = computeActivityLevel(user.last_login, items.length);
              await fetch(`/api/admin/users/${encodeURIComponent(user.email)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activity_level: level }),
              });
              setRoadmapCompleted(items);
            };
            return (
              <div style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color, fontWeight: 600 }}>
                      {activityLabel(computed)}
                    </span>
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint, marginTop: 4 }}>
                    Auto · last login + {roadmapCompleted.length}/25 roadmap steps
                  </div>
                </div>
                <button onClick={recalc} style={{
                  padding: '6px 12px', background: 'rgba(201,164,85,0.07)',
                  border: '1px solid rgba(201,164,85,0.2)', borderRadius: 8,
                  color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 10,
                  letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                }}>Recalc</button>
              </div>
            );
          })()}
        </section>

        {/* Role */}
        <section>
          <SectionLabel>Role</SectionLabel>
          <select value={role} onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
            style={{ ...inputStyle(), cursor: 'pointer' }}>
            <option value="user">Member</option>
            <option value="admin">Admin</option>
          </select>
        </section>

        {/* Reset password */}
        <section>
          <SectionLabel>Reset Password</SectionLabel>
          <div style={{ position: 'relative' }}>
            <input
              type={showNewPw ? 'text' : 'password'}
              style={{ ...inputStyle(), paddingRight: 40 }}
              placeholder="New password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
            <button type="button" onClick={() => setShowNewPw((v) => !v)} style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: showNewPw ? 'rgba(201,164,85,0.7)' : 'rgba(240,232,212,0.25)',
              fontSize: 14, lineHeight: 1, transition: 'color 0.2s',
            }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.7)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = showNewPw ? 'rgba(201,164,85,0.7)' : 'rgba(240,232,212,0.25)')}
            >
              {showNewPw ? '🙈' : '👁'}
            </button>
          </div>
        </section>

        {msg && <span style={{ fontSize: 12, color: msg === 'Saved' ? '#4ade80' : '#ef4444' }}>{msg}</span>}

        <button onClick={save} disabled={saving} style={{
          padding: '12px', background: 'rgba(201,164,85,0.1)',
          border: '1px solid rgba(201,164,85,0.25)', borderRadius: 10,
          color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12,
          letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer',
        }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>

        {/* Wins Log */}
        <section>
          <SectionLabel>Wins Log</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Add win */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...inputStyle(), flex: 1 }}
                placeholder="Log a win…"
                value={newWin}
                onChange={(e) => setNewWin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitWin()}
              />
              <button onClick={submitWin} disabled={addingWin || !newWin.trim()} style={{
                padding: '0 14px', background: 'rgba(74,222,128,0.08)',
                border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10,
                color: '#4ade80', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                cursor: 'pointer', whiteSpace: 'nowrap' as const,
              }}>+ Add</button>
            </div>

            {/* Sync from Discord */}
            {discordChannelId && (
              <button onClick={syncFromDiscord} disabled={syncingDiscord} style={{
                padding: '8px 14px', background: 'rgba(88,101,242,0.08)',
                border: '1px solid rgba(88,101,242,0.25)', borderRadius: 10,
                color: 'rgba(148,166,255,0.8)', fontFamily: "'DM Sans', sans-serif",
                fontSize: 11, cursor: 'pointer', textAlign: 'left' as const,
                letterSpacing: '0.08em',
              }}>
                {syncingDiscord ? 'Fetching…' : '↓ Sync messages from Discord channel'}
              </button>
            )}

            {/* Discord messages to approve */}
            {showDiscordMsgs && discordMessages.length > 0 && (
              <div style={{ ...card, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint, letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>
                    {discordMessages.length} messages — click to add as win
                  </span>
                  <button onClick={() => setShowDiscordMsgs(false)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: creamFaint, fontSize: 14, padding: 0,
                  }}>×</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' as const }}>
                  {discordMessages.map((m) => (
                    <button key={m.id} onClick={() => addDiscordMsgAsWin(m)} style={{
                      padding: '8px 10px', background: 'rgba(201,164,85,0.04)',
                      border: '1px solid rgba(201,164,85,0.1)', borderRadius: 8,
                      color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                      textAlign: 'left' as const, cursor: 'pointer', lineHeight: 1.4,
                    }}>
                      <span style={{ color: creamFaint, marginRight: 6 }}>@{m.author}</span>
                      {m.content}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showDiscordMsgs && discordMessages.length === 0 && (
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint, textAlign: 'center' as const, padding: '8px 0' }}>
                All messages added
              </div>
            )}

            {/* Wins list */}
            {wins.length === 0 ? (
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint, padding: '12px 0' }}>No wins logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {wins.map((w) => (
                  <div key={w.id} style={{
                    ...card, padding: '10px 12px',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: cream, lineHeight: 1.4 }}>
                        {w.content}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: creamFaint }}>
                          {fmtWinDate(w.created_at)}
                        </span>
                        {w.source === 'discord' && (
                          <span style={{ fontSize: 9, color: 'rgba(148,166,255,0.7)', background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.2)', padding: '1px 5px', borderRadius: 4, letterSpacing: '0.1em' }}>
                            Discord
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeWin(w.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'rgba(239,68,68,0.35)', fontSize: 14, padding: 0, lineHeight: 1,
                      flexShrink: 0,
                    }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(239,68,68,0.7)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(239,68,68,0.35)')}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Danger zone */}
        <div style={{ ...card, padding: '16px', borderColor: 'rgba(239,68,68,0.1)' }}>
          <SectionLabel>Danger Zone</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={toggleActive} style={{
              padding: '10px 14px', background: 'none',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
              color: user.active ? 'rgba(239,68,68,0.6)' : '#4ade80',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer', textAlign: 'left',
            }}>
              {user.active ? 'Deactivate Account' : 'Reactivate Account'}
            </button>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} style={{
                padding: '10px 14px', background: 'none',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10,
                color: 'rgba(239,68,68,0.6)', fontFamily: "'DM Sans', sans-serif",
                fontSize: 12, cursor: 'pointer', textAlign: 'left',
              }}>Delete User</button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={doDelete} style={{
                  flex: 1, padding: '10px', background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10,
                  color: '#ef4444', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer',
                }}>Confirm Delete</button>
                <button onClick={() => setConfirmDelete(false)} style={{
                  flex: 1, padding: '10px', background: 'none',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
                  color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer',
                }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif", fontSize: 9,
      letterSpacing: '0.3em', textTransform: 'uppercase' as const,
      color: 'rgba(201,164,85,0.4)', marginBottom: 10,
    }}>{children}</div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint }}>{label}</span>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: cream }}>{value}</span>
    </div>
  );
}

// Global feature controls: set the default tab set new members get, and/or
// bulk-apply a tab set to every existing member at once. Per-member overrides
// (in each member's drawer) still win over these.
function FeatureControlsPanel({ onApplied }: { onApplied: () => void }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([...DEFAULT_FEATURES]);
  const [loaded, setLoaded] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/admin/features')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.default)) setSel(d.default); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const toggle = (id: string) =>
    setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const saveDefault = async () => {
    setSavingDefault(true); setMsg('');
    const res = await fetch('/api/admin/features', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default: sel }),
    }).catch(() => null);
    setSavingDefault(false);
    setMsg(res && res.ok ? '✓ Saved as default for new & ungated members.' : 'Failed to save default.');
  };

  const applyAll = async () => {
    if (!confirm('Apply this exact tab set to ALL existing members? This overwrites each member’s current access.')) return;
    setApplying(true); setMsg('');
    const res = await fetch('/api/admin/features', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: sel }),
    }).catch(() => null);
    setApplying(false);
    if (res && res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(`✓ Applied to ${d.updated ?? 0} member${d.updated === 1 ? '' : 's'}.`);
      onApplied();
    } else {
      const d = res ? await res.json().catch(() => ({})) : {};
      setMsg(d.error ? `Failed: ${d.error}` : 'Failed to apply.');
    }
  };

  return (
    <div style={{ ...card, padding: '16px 20px', marginBottom: 20 }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: '0.16em',
          textTransform: 'uppercase' as const, color: gold, fontWeight: 600 }}>
          Feature Access — defaults &amp; bulk apply
        </span>
        <span style={{ color: creamFaint, fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint, lineHeight: 1.6, marginBottom: 12 }}>
            Pick the tabs below, then either save them as the default every <em>new</em> member starts with,
            or apply them to <em>all existing</em> members at once. Per-member tweaks (in each member’s drawer) still override this.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 14 }}>
            {PORTAL_FEATURES.map((f) => {
              const on = sel.includes(f.id);
              return (
                <button key={f.id} onClick={() => toggle(f.id)} disabled={!loaded} style={{
                  padding: '6px 14px', borderRadius: 20, cursor: loaded ? 'pointer' : 'default',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const, fontWeight: 600,
                  color: on ? '#c9a455' : 'rgba(240,232,212,0.25)',
                  background: on ? 'rgba(201,164,85,0.09)' : 'transparent',
                  border: `1px solid ${on ? 'rgba(201,164,85,0.31)' : 'rgba(255,255,255,0.08)'}`,
                  opacity: loaded ? 1 : 0.5, transition: 'all 0.15s',
                }}>{f.label}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <button onClick={saveDefault} disabled={savingDefault || !loaded} style={{
              padding: '9px 16px', background: 'transparent', border: '1px solid rgba(201,164,85,0.3)',
              borderRadius: 10, color: 'rgba(201,164,85,0.8)', fontFamily: "'DM Sans', sans-serif",
              fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer',
            }}>{savingDefault ? 'Saving…' : 'Save as default'}</button>
            <button onClick={applyAll} disabled={applying || !loaded} style={{
              padding: '9px 16px', background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.3)',
              borderRadius: 10, color: gold, fontFamily: "'DM Sans', sans-serif",
              fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer',
            }}>{applying ? 'Applying…' : 'Apply to all members'}</button>
            {msg && <span style={{ fontSize: 11, color: creamFaint, fontFamily: "'DM Sans', sans-serif" }}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Admin Page ─────────────────────────────────────────────────── */
interface UnmatchedRow {
  id: string;
  title: string | null;
  coach_name: string | null;
  call_date: string | null;
  recording_url: string | null;
}

// Unmatched check-ins queue: calls with no client email match. Assigning runs
// the full analysis pipeline server-side.
function UnmatchedModal({ members, onClose, onAssigned }: {
  members: User[]; onClose: () => void; onAssigned: () => void;
}) {
  const [rows, setRows] = useState<UnmatchedRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/checkins/unmatched')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const clients = members.filter((m) => m.role === 'user');
  const fmtDate = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const assign = async (id: string) => {
    const email = assignTo[id];
    if (!email) return;
    setBusy(id);
    const res = await fetch('/api/admin/checkins/assign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ check_in_id: id, client_email: email }),
    });
    if (res.ok) { setRows((prev) => prev.filter((r) => r.id !== id)); onAssigned(); }
    setBusy(null);
  };

  // Discard an unmatched check-in entirely (e.g. an internal/irrelevant coach call
  // that shouldn't belong to any client).
  const discard = async (id: string) => {
    if (!confirm('Delete this check-in permanently? It will be removed from the queue.')) return;
    setBusy(id);
    const res = await fetch(`/api/admin/checkins/${id}`, { method: 'DELETE' });
    if (res.ok) { setRows((prev) => prev.filter((r) => r.id !== id)); onAssigned(); }
    setBusy(null);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 100%)', maxHeight: '80vh', overflowY: 'auto', background: '#0a0806', border: '1px solid rgba(201,164,85,0.18)', borderRadius: 14, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: cream }}>⚑ Unmatched Check-ins</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: creamFaint, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        {!loaded ? (
          <div style={{ padding: '6px 0' }}><Spinner size={18} /></div>
        ) : rows.length === 0 ? (
          <div style={{ color: creamFaint, fontSize: 12 }}>No unmatched check-ins.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ border: '1px solid rgba(201,164,85,0.12)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 13, color: cream }}>{r.title || 'Check-in'}
                  <span style={{ color: creamFaint, marginLeft: 8, fontSize: 11 }}>{fmtDate(r.call_date)}{r.coach_name ? ` · ${r.coach_name}` : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <select value={assignTo[r.id] ?? ''} onChange={(e) => setAssignTo((p) => ({ ...p, [r.id]: e.target.value }))} style={{ ...inputStyle(), flex: 1 }}>
                    <option value="">Assign to client…</option>
                    {clients.map((c) => <option key={c.email} value={c.email}>{c.name || c.email}</option>)}
                  </select>
                  <button disabled={!assignTo[r.id] || busy === r.id} onClick={() => assign(r.id)} style={{
                    padding: '0 16px', borderRadius: 10, background: 'rgba(201,164,85,0.12)',
                    border: '1px solid rgba(201,164,85,0.3)', color: gold, fontSize: 12, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                    opacity: (!assignTo[r.id] || busy === r.id) ? 0.5 : 1,
                  }}>{busy === r.id ? 'Assigning…' : 'Assign'}</button>
                  <button disabled={busy === r.id} onClick={() => discard(r.id)} title="Delete this check-in" style={{
                    padding: '0 12px', borderRadius: 10, background: 'transparent',
                    border: '1px solid rgba(239,68,68,0.25)', color: 'rgba(239,68,68,0.7)', fontSize: 12, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap', opacity: busy === r.id ? 0.5 : 1,
                  }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'members' | 'csm' | 'calls' | 'advisor' | 'referrals' | 'roadmap' | 'crm' | 'funnels' | 'analytics'>('members');
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
  const [decidingEmail, setDecidingEmail] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [reports, setReports] = useState<IcpReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d || d.role !== 'admin') { router.push('/select'); return; }
        loadUsers();
      })
      .catch(() => router.push('/select'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUsers = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/users');
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  };

  const loadReports = async () => {
    setReportsLoading(true);
    const res = await fetch('/api/reports');
    if (res.ok) setReports(await res.json());
    setReportsLoading(false);
  };

  useEffect(() => {
    if (tab === 'calls' && reports.length === 0) loadReports();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stats
  const activeCount = users.filter((u) => u.active).length;
  const recentLogins = users.filter((u) => u.last_login > Date.now() - 7 * 24 * 3600 * 1000).length;
  const pendingUsers = users.filter((u) => u.status === 'pending');

  // Approve/reject a self-serve signup.
  //   approved -> PATCH the status (keeps `active` in sync server-side)
  //   rejected -> delete the account outright, so it never shows in the panel and
  //               the email is free to sign up again
  // Either way we refresh so the row leaves "Pending".
  const decideSignup = async (email: string, status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !confirm(
      `Reject ${email}? The account is deleted permanently — it won't appear anywhere in the admin panel and they'd have to sign up again.`
    )) return;
    setDecidingEmail(email);
    try {
      const res = status === 'rejected'
        ? await fetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE' })
        : await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          });
      if (res.ok) await loadUsers();
    } finally {
      setDecidingEmail('');
    }
  };

  // Filtered
  const filtered = users.filter((u) => {
    const matchSearch = !search ||
      u.email.includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ? true :
      filter === 'pending' ? u.status === 'pending' :
      filter === 'active' ? u.active : !u.active;
    const matchTag = !tagFilter || (u.tags || []).includes(tagFilter);
    return matchSearch && matchFilter && matchTag;
  });

  /* ─── Admin panel ─── */
  return (
    <div style={{ minHeight: '100vh', background: '#050403', color: cream, fontFamily: "'DM Sans', sans-serif", position: 'relative' }}>
      <MeshBg speed={0.2} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 65% at 50% 50%, rgba(5,4,3,0.5) 0%, transparent 100%)' }} />
      <style>{`
        select option { background: #0a0806; }
        input::placeholder, textarea::placeholder { color: rgba(240,232,212,0.2); }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(201,164,85,0.2); border-radius: 4px; }
      `}</style>

      {/* Topbar */}
      <div style={{
        position: 'relative', zIndex: 2,
        padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <button onClick={() => router.push('/select')} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(201,164,85,0.5)', fontSize: 11, letterSpacing: '0.2em',
            textTransform: 'uppercase', fontWeight: 600, padding: 0,
          }}>← Back</button>
          <span style={{
            fontFamily: "'Cormorant Garamond', serif", fontSize: 22,
            fontWeight: 300, color: cream,
          }}>Admin Panel</span>
        </div>
        <span style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.4)' }}>
          VTC
        </span>
      </div>

      {/* Tab bar */}
      <div style={{ position: 'relative', zIndex: 2, padding: '0 32px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 0 }}>
        {([['members', 'Members'], ['csm', 'Client Success'], ['calls', 'Sales Calls'], ['referrals', 'Referrals'], ['advisor', 'AI Advisor'], ['roadmap', 'Roadmap'], ['crm', 'CRM'], ['funnels', 'Funnels'], ['analytics', 'Analytics']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: tab === t ? gold : creamFaint,
            borderBottom: `2px solid ${tab === t ? 'rgba(201,164,85,0.5)' : 'transparent'}`,
            marginBottom: -1,
          }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 2 }}>

        {tab === 'calls' && (
          <CallsView reports={reports} loading={reportsLoading} onRefresh={loadReports} router={router} />
        )}

        {tab === 'csm' && <CsmView />}

        {tab === 'referrals' && <ReferralsView />}

        {tab === 'roadmap' && <RoadmapContentView />}

        {tab === 'advisor' && <AdvisorView />}

        {tab === 'csm' && <ClientSuccessView users={users} />}

        {tab === 'roadmap' && <RoadmapView users={users} />}

        {tab === 'crm' && <CRMView />}

        {tab === 'funnels' && <FunnelsView />}

        {tab === 'analytics' && <AnalyticsView />}

        {tab === 'members' && <>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' as const }}>
          <Stat label="Total Members" value={users.length} />
          <Stat label="Active" value={activeCount} />
          <Stat label="Inactive" value={users.length - activeCount} />
          <Stat label="Pending" value={pendingUsers.length} />
          <Stat label="Active (7d)" value={recentLogins} />
        </div>

        {/* Pending signups awaiting approval */}
        {pendingUsers.length > 0 && (
          <div style={{ ...card, padding: 0, marginBottom: 24, borderColor: 'rgba(251,191,36,0.28)' }}>
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24' }} />
              <span style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(251,191,36,0.85)', fontWeight: 600 }}>
                Pending Approvals
              </span>
              <span style={{ fontSize: 11, color: creamFaint }}>{pendingUsers.length}</span>
            </div>
            {pendingUsers.map((u, i) => (
              <div key={u.email} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 20px',
                borderBottom: i === pendingUsers.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.03)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: cream }}>{u.name || '—'}</div>
                  <div style={{ fontSize: 11, color: creamFaint }}>{u.email}</div>
                </div>
                <span style={{ fontSize: 11, color: creamFaint, whiteSpace: 'nowrap' as const }}>
                  Requested {fmt(u.created_at)}
                </span>
                <button
                  onClick={() => decideSignup(u.email, 'approved')}
                  disabled={decidingEmail === u.email}
                  style={{
                    padding: '7px 16px', borderRadius: 8, cursor: decidingEmail === u.email ? 'default' : 'pointer',
                    background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)',
                    color: 'rgba(74,222,128,0.9)', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                    letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                    opacity: decidingEmail === u.email ? 0.5 : 1,
                  }}
                >
                  {decidingEmail === u.email ? '…' : 'Approve'}
                </button>
                <button
                  onClick={() => decideSignup(u.email, 'rejected')}
                  disabled={decidingEmail === u.email}
                  style={{
                    padding: '7px 16px', borderRadius: 8, cursor: decidingEmail === u.email ? 'default' : 'pointer',
                    background: 'transparent', border: '1px solid rgba(239,68,68,0.35)',
                    color: 'rgba(239,68,68,0.8)', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                    letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                    opacity: decidingEmail === u.email ? 0.5 : 1,
                  }}
                >
                  Reject
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const, alignItems: 'center' }}>
          <input
            placeholder="Search by email or name…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle(), maxWidth: 280, flex: '1 1 200px' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {(['all', 'active', 'inactive', 'pending'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '8px 16px', borderRadius: 20,
                background: filter === f ? 'rgba(201,164,85,0.1)' : 'transparent',
                border: `1px solid ${filter === f ? 'rgba(201,164,85,0.35)' : 'rgba(255,255,255,0.08)'}`,
                color: filter === f ? gold : creamFaint,
                fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                textTransform: 'capitalize', cursor: 'pointer',
              }}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            {TAG_OPTIONS.map((t) => (
              <button key={t.value} onClick={() => setTagFilter(tagFilter === t.value ? '' : t.value)} style={{
                padding: '8px 16px', borderRadius: 20,
                background: tagFilter === t.value ? t.color + '18' : 'transparent',
                border: `1px solid ${tagFilter === t.value ? t.color + '50' : 'rgba(255,255,255,0.08)'}`,
                color: tagFilter === t.value ? t.color : creamFaint,
                fontFamily: "'DM Sans', sans-serif", fontSize: 11, cursor: 'pointer',
              }}>{t.label}</button>
            ))}
          </div>
          <button onClick={() => setShowUnmatched(true)} style={{
            marginLeft: 'auto', padding: '10px 18px',
            background: 'transparent',
            border: '1px solid rgba(201,164,85,0.25)', borderRadius: 10,
            color: 'rgba(201,164,85,0.75)', fontFamily: "'DM Sans', sans-serif", fontSize: 12,
            letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
          }}>
            ⚑ Unmatched
          </button>
          <button onClick={() => setShowAdd(true)} style={{
            padding: '10px 20px',
            background: 'rgba(201,164,85,0.12)',
            border: '1px solid rgba(201,164,85,0.3)', borderRadius: 10,
            color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12,
            letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer',
          }}>
            + Add Member
          </button>
        </div>

        {/* Global feature defaults + bulk apply */}
        <FeatureControlsPanel onApplied={loadUsers} />

        {/* Users table (horizontally scrollable on narrow screens) */}
        <div style={{ ...card, overflow: 'hidden', overflowX: 'auto' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(150px, 1fr) 120px 120px 130px 100px',
            padding: '10px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            {['Member', 'Role', 'Status', 'Activity', 'Last Login'].map((h) => (
              <span key={h} style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.35)' }}>
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <SkeletonList rows={5} />
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: creamFaint, fontSize: 13 }}>
              {search ? 'No results' : 'No members yet'}
            </div>
          ) : (
            filtered.map((u, i) => (
              <UserRow
                key={u.email} user={u}
                isLast={i === filtered.length - 1}
                onClick={() => setSelectedUser(u)}
              />
            ))
          )}
        </div>

        {filtered.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: creamFaint, textAlign: 'right' }}>
            {filtered.length} of {users.length} members
          </div>
        )}

        </>}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddUserModal onClose={() => setShowAdd(false)} onAdded={loadUsers} />
      )}
      {showUnmatched && (
        <UnmatchedModal members={users} onClose={() => setShowUnmatched(false)} onAssigned={loadUsers} />
      )}
      {selectedUser && (
        <UserDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUpdated={(updated) => {
            setUsers((prev) => prev.map((u) => u.email === updated.email ? updated : u));
            setSelectedUser(updated);
          }}
          onDeleted={() => {
            setUsers((prev) => prev.filter((u) => u.email !== selectedUser.email));
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Calls View ──────────────────────────────────────────────────────── */
const OUTCOME_STYLE: Record<string, { color: string; label: string }> = {
  closed:   { color: '#4ade80', label: 'Closed' },
  no_close: { color: '#fbbf24', label: 'No-Close' },
  dq:       { color: '#f97316', label: 'DQ' },
  no_show:  { color: '#ef4444', label: 'No-Show' },
  unknown:  { color: 'rgba(240,232,212,0.55)', label: '—' },
};

/* The person on a call: the stored lead name, else the non-host attendee. */
function leadNameOf(report: IcpReport): string {
  const c = report.calls;
  if (c?.lead_name?.trim()) return c.lead_name.trim();
  const p = c?.raw_payload;
  const attendees = p?.attendees as Array<{ is_host?: boolean; name?: string }> | undefined;
  return attendees?.find((a) => !a.is_host)?.name ?? (p?.participant_name as string) ?? 'Unknown';
}

function callTime(report: IcpReport): number {
  const raw = report.calls?.call_date || report.created_at;
  const t = new Date(raw).getTime();
  return isNaN(t) ? 0 : t;
}

/* ── One profile per person ────────────────────────────────────────────────
 * Two calls with the same lead are one prospect, not two rows: a second call is
 * a follow-up on the same opportunity, so counting it twice deflates the close
 * rate and double-counts a DQ.
 */
interface CallGroup {
  key: string;
  name: string;
  reports: IcpReport[];     // newest call first
  outcome: string;          // the outcome that counts for this person
  revenue: number;
  cash: number;
}

function personKeyOf(report: IcpReport): string {
  const name = leadNameOf(report).trim().toLowerCase().replace(/\s+/g, ' ');
  // Nameless / "Unknown" calls can't be matched to a person — keep them separate
  // rather than collapsing every unidentified call into one bogus profile.
  return name && name !== 'unknown' ? `name:${name}` : `report:${report.id}`;
}

// Closed beats DQ beats everything else; otherwise the most recent call's outcome.
function groupOutcome(reports: IcpReport[]): string {
  const all = reports.map((r) => r.calls?.outcome ?? 'unknown');
  if (all.includes('closed')) return 'closed';
  if (all.includes('dq')) return 'dq';
  return all[0] ?? 'unknown';
}

function groupCalls(reports: IcpReport[]): CallGroup[] {
  const map = new Map<string, IcpReport[]>();
  for (const r of reports) {
    const k = personKeyOf(r);
    const bucket = map.get(k);
    if (bucket) bucket.push(r); else map.set(k, [r]);
  }
  return [...map.entries()].map(([key, rs]) => {
    const sorted = [...rs].sort((a, b) => callTime(b) - callTime(a));
    return {
      key,
      name: leadNameOf(sorted[0]),
      reports: sorted,
      outcome: groupOutcome(sorted),
      revenue: sorted.reduce((s, r) => s + (r.calls?.revenue ?? 0), 0),
      cash: sorted.reduce((s, r) => s + (r.calls?.cash_collected ?? 0), 0),
    };
  });
}

function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#fbbf24' : '#ef4444';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, color, fontWeight: 700 }}>{score}</span>
        <span style={{ fontSize: 9, color, opacity: 0.6 }}>/100</span>
      </div>
      {label && <span style={{ fontSize: 9, color, opacity: 0.55, letterSpacing: '0.06em' }}>{label}</span>}
    </div>
  );
}

function CallsView({ reports, loading, onRefresh, router }: {
  reports: IcpReport[];
  loading: boolean;
  onRefresh: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [showImport, setShowImport] = useState(false);
  const [showAddCall, setShowAddCall] = useState(false);
  const [syncing, setSyncing] = useState<'' | 'default' | 'sales_manager' | 'retry'>('');
  const [syncResult, setSyncResult] = useState('');
  const [failedCount, setFailedCount] = useState(0); // calls that exhausted analysis retries
  const [sourceFilter, setSourceFilter] = useState<'all' | 'main' | 'sales_manager'>('all');
  const [editing, setEditing] = useState<IcpReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showRubric, setShowRubric] = useState(false);
  // One row per person (default) vs one row per call.
  const [byPerson, setByPerson] = useState(true);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Surface any calls stuck in the terminal 'analysis_failed' state on load, so the
  // "Retry Failed" badge shows even before the admin runs a sync this session.
  useEffect(() => {
    fetch('/api/admin/calls/retry-failed')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.failed === 'number') setFailedCount(d.failed); })
      .catch(() => {});
  }, []);

  // 'sales_manager' = the sales manager's separate Fathom account; 'main' = the
  // primary team pipeline (Fathom sync + manual Discord imports).
  const visible = reports.filter((r) => {
    if (sourceFilter === 'all') return true;
    const isSM = r.calls?.source === 'sales_manager';
    return sourceFilter === 'sales_manager' ? isSM : !isSM;
  });

  const totalRev = visible.reduce((s, r) => s + (r.calls?.revenue ?? 0), 0);
  const totalCC = visible.reduce((s, r) => s + (r.calls?.cash_collected ?? 0), 0);

  // Rates are per PERSON, not per call — a second call with the same lead is a
  // follow-up on one opportunity, so counting it twice would deflate the close
  // rate and count that person's DQ twice.
  const groups = groupCalls(visible);
  const closedPeople = groups.filter((g) => g.outcome === 'closed').length;
  const dqPeople = groups.filter((g) => g.outcome === 'dq').length;
  const repeat = groups.filter((g) => g.reports.length > 1).length;

  const sync = async (source: 'default' | 'sales_manager') => {
    setSyncing(source); setSyncResult('');
    try {
      // Step 1: import (fast — no inline analysis, so this can't time out).
      const res = await fetch('/api/admin/sync-fathom', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source === 'sales_manager' ? { source } : {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setSyncResult(d.error ?? `Error (${res.status})`); return; }

      setSyncResult(`Imported ${d.imported} new calls (${d.skipped} skipped)`);
      setFailedCount(d.analysis_failed ?? 0);
      if (source === 'sales_manager' && d.imported > 0) setSourceFilter('sales_manager');

      // Step 2: sales-manager calls only surface once analyzed. Drive analysis in
      // small batches so each request stays well under the function timeout.
      const total = d.pending_analysis ?? 0;
      if (total > 0) {
        const drain = await drainPendingAnalysis(total, `Imported ${d.imported} •`);
        if (!drain.interrupted) {
          const stuck = (d.analysis_failed ?? 0) + drain.failedPerm;
          setFailedCount(stuck);
          const bits = [`Imported ${d.imported} new calls, all analyzed`];
          if (drain.internalTotal > 0) bits.push(` (${drain.internalTotal} internal call${drain.internalTotal === 1 ? '' : 's'} skipped)`);
          if (stuck > 0) bits.push(` • ${stuck} need attention — use Retry Failed`);
          setSyncResult(bits.join('') + '.');
        }
      }
      onRefresh();
    } catch (err) {
      setSyncResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing('');
    }
  };

  // Drain the analysis queue in bounded batches until nothing is left to analyze.
  // Shared by the sync flow and the "Retry Failed" action. Always converges: each
  // batch records an attempt, so persistently-failing calls hit the retry cap and
  // drop out of the queue (moving to the terminal 'analysis_failed' status).
  const drainPendingAnalysis = async (startPending: number, prefix: string) => {
    let pending = startPending;
    let done = 0, internalTotal = 0, failedPerm = 0, fails = 0;
    while (pending > 0) {
      let ad: { analyzed?: number; failed?: number; internal?: number; remaining?: number; failed_permanently?: number } | null = null;
      try {
        const ar = await fetch('/api/admin/calls/analyze-pending', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        });
        if (ar.ok) ad = await ar.json().catch(() => null);
      } catch { /* network/timeout — handled below */ }

      // A timed-out/failed batch doesn't lose work (calls stay queued); retry a few
      // times, then stop and tell the admin it's resumable.
      if (!ad) {
        fails++;
        if (fails >= 4) {
          setSyncResult(`${prefix} analyzed ${done}/${startPending}. Interrupted — run again to resume.`);
          return { done, internalTotal, failedPerm, interrupted: true };
        }
        setSyncResult(`${prefix} analyzing ${Math.min(done, startPending)}/${startPending}… (retrying)`);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      fails = 0;
      const batchDone = (ad.analyzed ?? 0) + (ad.failed ?? 0) + (ad.internal ?? 0);
      done += batchDone;
      internalTotal += ad.internal ?? 0;
      failedPerm += ad.failed_permanently ?? 0;
      pending = ad.remaining ?? 0;
      setSyncResult(`${prefix} analyzing ${Math.min(done, startPending)}/${startPending}…`);
      onRefresh();
      if (batchDone === 0 && pending > 0) break; // no progress — avoid infinite loop
    }
    return { done, internalTotal, failedPerm, interrupted: false };
  };

  // Recovery: requeue every terminally-failed call and re-drive analysis.
  const retryFailed = async () => {
    setSyncing('retry'); setSyncResult('Requeuing failed calls…');
    try {
      const res = await fetch('/api/admin/calls/retry-failed', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setSyncResult(d.error ?? `Error (${res.status})`); return; }
      const requeued = d.requeued ?? 0;
      setFailedCount(0);
      if (requeued === 0) { setSyncResult('No failed calls to retry.'); return; }
      const drain = await drainPendingAnalysis(requeued, `Retrying ${requeued} •`);
      if (!drain.interrupted) {
        setFailedCount(drain.failedPerm);
        setSyncResult(`Re-analyzed ${requeued} call${requeued === 1 ? '' : 's'}${drain.failedPerm > 0 ? ` • ${drain.failedPerm} still failing (check transcripts)` : ' — all recovered'}.`);
      }
      onRefresh();
    } catch (err) {
      setSyncResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing('');
    }
  };

  const deleteCall = async (callId: string, leadName: string) => {
    if (!confirm(`Delete this call${leadName ? ` with ${leadName}` : ''}? This removes the call and its analysis permanently.`)) return;
    const res = await fetch(`/api/admin/calls/${callId}`, { method: 'DELETE' });
    if (res.ok) onRefresh();
    else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to delete call.'); }
  };

  // Bulk selection (by call id) across the currently-visible rows.
  const visibleCallIds = visible.map((r) => r.calls?.id).filter((id): id is string => !!id);
  const allSelected = visibleCallIds.length > 0 && visibleCallIds.every((id) => selected.has(id));
  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => setSelected((prev) => {
    if (visibleCallIds.every((id) => prev.has(id))) {
      const next = new Set(prev);
      visibleCallIds.forEach((id) => next.delete(id));
      return next;
    }
    return new Set([...prev, ...visibleCallIds]);
  });
  const bulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected call${ids.length === 1 ? '' : 's'}? This removes them and their analysis permanently.`)) return;
    setBulkDeleting(true);
    const res = await fetch('/api/admin/calls/bulk-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    setBulkDeleting(false);
    if (res.ok) { setSelected(new Set()); onRefresh(); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to delete calls.'); }
  };

  const FILTERS: Array<[typeof sourceFilter, string]> = [
    ['all', 'All'], ['main', 'Main Pipeline'], ['sales_manager', 'Sales Manager'],
  ];

  // Sales AI lives inside this section (like the Client Success assistant) rather
  // than as its own top-level tab.
  if (showAi) {
    return (
      <div>
        <button onClick={() => setShowAi(false)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none',
          cursor: 'pointer', color: 'rgba(201,164,85,0.7)', fontSize: 11, letterSpacing: '0.14em',
          textTransform: 'uppercase' as const, fontWeight: 600, padding: 0, marginBottom: 18, fontFamily: "'DM Sans', sans-serif",
        }}>← All calls</button>
        <SalesAiView />
      </div>
    );
  }

  return (
    <div>
      {/* Stats — people-based, so two calls with one lead don't count twice */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' as const }}>
        <Stat label="People" value={groups.length} />
        <Stat label="Calls" value={visible.length} />
        <Stat label="Closed" value={closedPeople} />
        <Stat label="Close Rate" value={groups.length ? `${Math.round((closedPeople / groups.length) * 100)}%` : '—'} />
        <Stat label="DQ'd" value={dqPeople} />
        <Stat label="Revenue" value={totalRev ? `$${totalRev.toLocaleString()}` : '—'} />
        <Stat label="Cash In" value={totalCC ? `$${totalCC.toLocaleString()}` : '—'} />
      </div>

      {/* Source filter + row grouping */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' as const, alignItems: 'center' }}>
        {FILTERS.map(([val, label]) => {
          const on = sourceFilter === val;
          return (
            <button key={val} onClick={() => setSourceFilter(val)} style={{
              padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
              background: on ? 'rgba(201,164,85,0.12)' : 'transparent',
              border: `1px solid ${on ? 'rgba(201,164,85,0.3)' : 'rgba(255,255,255,0.08)'}`,
              color: on ? gold : creamFaint, fontFamily: "'DM Sans', sans-serif",
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            }}>{label}</button>
          );
        })}
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
        {([[true, 'By person'], [false, 'By call']] as const).map(([val, label]) => {
          const on = byPerson === val;
          return (
            <button key={label} onClick={() => setByPerson(val)} title={val ? 'Group every call with the same lead into one profile' : 'One row per call'} style={{
              padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
              background: on ? 'rgba(201,164,85,0.12)' : 'transparent',
              border: `1px solid ${on ? 'rgba(201,164,85,0.3)' : 'rgba(255,255,255,0.08)'}`,
              color: on ? gold : creamFaint, fontFamily: "'DM Sans', sans-serif",
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
            }}>{label}</button>
          );
        })}
        {byPerson && repeat > 0 && (
          <span style={{ fontSize: 10.5, color: creamFaint }}>
            {repeat} {repeat === 1 ? 'lead has' : 'leads have'} more than one call — grouped
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' as const }}>
        <button onClick={() => setShowAi(true)} style={{
          padding: '9px 16px', background: 'rgba(201,164,85,0.12)',
          border: '1px solid rgba(201,164,85,0.32)', borderRadius: 10,
          color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer',
        }}>✨ Sales AI</button>
        <button onClick={() => setShowRubric(true)} style={{
          padding: '9px 16px', background: 'rgba(201,164,85,0.08)',
          border: '1px solid rgba(201,164,85,0.2)', borderRadius: 10,
          color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 11,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer',
        }}>⚙ ICP Rubric</button>
        <button onClick={() => setShowAddCall(true)} style={{
          padding: '9px 16px', background: 'rgba(201,164,85,0.08)',
          border: '1px solid rgba(201,164,85,0.2)', borderRadius: 10,
          color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 11,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer',
        }}>＋ Add Call</button>
        <button onClick={() => setShowImport(true)} style={{
          padding: '9px 16px', background: 'rgba(201,164,85,0.08)',
          border: '1px solid rgba(201,164,85,0.2)', borderRadius: 10,
          color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 11,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer',
        }}>↑ Import Notes</button>
        <button onClick={() => sync('default')} disabled={!!syncing} style={{
          padding: '9px 16px', background: 'rgba(88,101,242,0.08)',
          border: '1px solid rgba(88,101,242,0.2)', borderRadius: 10,
          color: 'rgba(148,166,255,0.8)', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer',
        }}>{syncing === 'default' ? 'Syncing…' : '↓ Sync Fathom'}</button>
        <button onClick={() => sync('sales_manager')} disabled={!!syncing} style={{
          padding: '9px 16px', background: 'rgba(74,222,128,0.07)',
          border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10,
          color: 'rgba(134,229,170,0.85)', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer',
        }}>{syncing === 'sales_manager' ? 'Syncing…' : '↓ Sync Sales Mgr'}</button>
        {failedCount > 0 && (
          <button onClick={retryFailed} disabled={!!syncing} style={{
            padding: '9px 16px', background: 'rgba(239,68,68,0.09)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
            color: 'rgba(248,150,150,0.95)', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer',
          }}>{syncing === 'retry' ? 'Retrying…' : `⟳ Retry Failed (${failedCount})`}</button>
        )}
        <button onClick={onRefresh} style={{
          padding: '9px 14px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
          color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 11, cursor: 'pointer',
        }}>↻ Refresh</button>
        {syncResult && <span style={{ fontSize: 11, color: syncResult.includes('Error') || syncResult.includes('error') || syncResult.includes('not configured') ? '#ef4444' : '#4ade80' }}>{syncResult}</span>}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: '8px 14px',
          borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
        }}>
          <span style={{ fontSize: 12, color: cream }}>{selected.size} selected</span>
          <button onClick={bulkDelete} disabled={bulkDeleting} style={{
            padding: '6px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', fontFamily: "'DM Sans', sans-serif",
            fontSize: 11.5, fontWeight: 600, cursor: bulkDeleting ? 'default' : 'pointer', opacity: bulkDeleting ? 0.6 : 1,
          }}>{bulkDeleting ? 'Deleting…' : `🗑 Delete selected`}</button>
          <button onClick={() => setSelected(new Set())} style={{
            background: 'none', border: 'none', color: creamFaint, fontSize: 11.5, cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>Clear</button>
        </div>
      )}

      {/* Table (horizontally scrollable on narrow screens) */}
      <div style={{ ...card, overflow: 'hidden', overflowX: 'auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '34px minmax(140px, 1fr) 70px 90px 90px minmax(150px, 1fr) 90px',
          padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center',
        }}>
          <input
            type="checkbox" checked={allSelected} onChange={toggleSelectAll}
            title="Select all" style={{ cursor: 'pointer', accentColor: '#c9a455', width: 14, height: 14 }}
          />
          {[byPerson ? 'Lead / Profile' : 'Lead', 'ICP', 'Outcome', 'Closer', 'Summary / Next Step', 'Rev'].map((h) => (
            <span key={h} style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.35)' }}>{h}</span>
          ))}
        </div>

        {loading ? (
          <SkeletonList rows={5} />
        ) : visible.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: creamFaint, fontSize: 13 }}>
            {reports.length === 0
              ? 'No calls yet — use Import Notes, Sync Fathom, or Sync Sales Mgr to add calls.'
              : 'No calls match this filter.'}
          </div>
        ) : !byPerson ? (
          visible.map((r, i) => (
            <CallRow
              key={r.id}
              report={r}
              isLast={i === visible.length - 1}
              selected={!!r.calls?.id && selected.has(r.calls.id)}
              onToggle={() => { if (r.calls?.id) toggleSelect(r.calls.id); }}
              onClick={() => router.push(`/reports/${r.id}`)}
              onEdit={() => setEditing(r)}
              onDelete={() => { if (r.calls?.id) deleteCall(r.calls.id, r.calls.lead_name || ''); }}
            />
          ))
        ) : (
          groups.map((g, gi) => {
            const isLastGroup = gi === groups.length - 1;
            // A single call needs no profile wrapper — show it as its own row.
            if (g.reports.length === 1) {
              const r = g.reports[0];
              return (
                <CallRow
                  key={g.key}
                  report={r}
                  isLast={isLastGroup}
                  selected={!!r.calls?.id && selected.has(r.calls.id)}
                  onToggle={() => { if (r.calls?.id) toggleSelect(r.calls.id); }}
                  onClick={() => router.push(`/reports/${r.id}`)}
                  onEdit={() => setEditing(r)}
                  onDelete={() => { if (r.calls?.id) deleteCall(r.calls.id, r.calls.lead_name || ''); }}
                />
              );
            }
            const open = openGroups.has(g.key);
            const groupCallIds = g.reports.map((r) => r.calls?.id).filter((id): id is string => !!id);
            return (
              <div key={g.key}>
                <ProfileRow
                  group={g}
                  isLast={isLastGroup}
                  expanded={open}
                  selectedCount={groupCallIds.filter((id) => selected.has(id)).length}
                  onToggleExpand={() => setOpenGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                    return next;
                  })}
                  onToggleSelect={() => setSelected((prev) => {
                    const next = new Set(prev);
                    const all = groupCallIds.every((id) => next.has(id));
                    groupCallIds.forEach((id) => { if (all) next.delete(id); else next.add(id); });
                    return next;
                  })}
                />
                {open && g.reports.map((r, i) => (
                  <CallRow
                    key={r.id}
                    report={r}
                    nested
                    isLast={isLastGroup && i === g.reports.length - 1}
                    selected={!!r.calls?.id && selected.has(r.calls.id)}
                    onToggle={() => { if (r.calls?.id) toggleSelect(r.calls.id); }}
                    onClick={() => router.push(`/reports/${r.id}`)}
                    onEdit={() => setEditing(r)}
                    onDelete={() => { if (r.calls?.id) deleteCall(r.calls.id, r.calls.lead_name || ''); }}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); onRefresh(); }} />}
      {showRubric && <IcpRubricModal onClose={() => setShowRubric(false)} />}
      {showAddCall && <AddCallModal onClose={() => setShowAddCall(false)} onAdded={() => { setShowAddCall(false); onRefresh(); }} />}
      {editing && (
        <EditCallModal
          report={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onRefresh(); }}
        />
      )}
    </div>
  );
}

// Manually add a sales call the auto-sync missed: pull the transcript from a
// Fathom URL (or paste it), then store with the admin's closer/outcome/$ figures.
function AddCallModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [date, setDate] = useState('');
  const [closer, setCloser] = useState('');
  const [url, setUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [outcome, setOutcome] = useState('no_close');
  const [cash, setCash] = useState('');
  const [revenue, setRevenue] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const canAdd = (!!url.trim() || !!transcript.trim()) && !saving;

  const add = async () => {
    if (!canAdd) return;
    setSaving(true);
    setMsg(transcript.trim() ? 'Analyzing transcript…' : 'Fetching transcript & analyzing…');
    try {
      const res = await fetch('/api/admin/calls/manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: date || null, closer: closer.trim(), fathomUrl: url.trim(), transcript: transcript.trim(),
          outcome, cash_collected: parseFloat(cash) || 0, revenue: parseFloat(revenue) || 0,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { onAdded(); }
      else { setMsg(d.error || 'Failed to add call.'); setSaving(false); }
    } catch { setMsg('Failed to add call.'); setSaving(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: cream,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)', marginBottom: 6, display: 'block' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 520, maxHeight: '88vh', overflowY: 'auto', background: 'rgba(14,11,7,0.97)', padding: '28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: cream, margin: 0 }}>Add Sales Call</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: creamFaint, fontSize: 20, padding: 0 }}>×</button>
        </div>

        <div>
          <label style={lbl}>Fathom URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://fathom.video/share/… or /calls/…" style={inputStyle} />
        </div>
        <div style={{ fontSize: 10.5, color: creamFaint, textAlign: 'center', letterSpacing: '0.06em' }}>— or paste the transcript (works for any account) —</div>
        <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5}
          placeholder="Paste the full call transcript here… (handles long calls)"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 90, lineHeight: 1.5 }} />
        {transcript.trim() && <div style={{ fontSize: 10.5, color: creamFaint, textAlign: 'right' }}>{transcript.trim().length.toLocaleString()} characters</div>}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
          <div style={{ flex: '1 1 150px' }}>
            <label style={lbl}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' as const }} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={lbl}>Closer</label>
            <input value={closer} onChange={(e) => setCloser(e.target.value)} placeholder="Closer name" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={lbl}>Outcome</label>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} style={inputStyle}>
            <option value="closed">Close</option>
            <option value="no_close">No Close</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Cash Collected ($)</label>
            <input type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Revenue ($)</label>
            <input type="number" min="0" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
        </div>

        {msg && <span style={{ fontSize: 12, color: msg.includes('Failed') || msg.includes("Couldn") || msg.includes('already') || msg.includes('short') || msg.includes('Provide') ? '#ef4444' : creamFaint }}>{msg}</span>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={add} disabled={!canAdd} style={{ flex: 1, padding: '11px', background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.3)', borderRadius: 10, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: canAdd ? 'pointer' : 'default', opacity: canAdd ? 1 : 0.5 }}>
            {saving ? 'Adding…' : 'Add Call'}
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CallRow({ report, isLast, selected, onToggle, onClick, onEdit, onDelete, nested }: { report: IcpReport; isLast: boolean; selected: boolean; onToggle: () => void; onClick: () => void; onEdit: () => void; onDelete: () => void; nested?: boolean }) {
  const [hov, setHov] = useState(false);
  const c = report.calls;
  const leadName = leadNameOf(report);
  const outcome = OUTCOME_STYLE[c?.outcome ?? 'unknown'] ?? OUTCOME_STYLE.unknown;
  const isSM = c?.source === 'sales_manager';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: '34px minmax(140px, 1fr) 70px 90px 90px minmax(150px, 1fr) 90px',
        padding: nested ? '10px 20px 10px 44px' : '13px 20px', cursor: 'pointer',
        background: selected ? 'rgba(239,68,68,0.05)' : hov ? 'rgba(201,164,85,0.03)' : nested ? 'rgba(255,255,255,0.012)' : 'transparent',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.03)',
        borderLeft: nested ? '2px solid rgba(201,164,85,0.18)' : undefined,
        alignItems: 'center', transition: 'background 0.15s',
      }}
    >
      <input
        type="checkbox" checked={selected} onClick={(e) => e.stopPropagation()} onChange={onToggle}
        title="Select call" style={{ cursor: 'pointer', accentColor: '#c9a455', width: 14, height: 14 }}
      />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 13, color: cream }}>{leadName}</span>
          {isSM && (
            <span style={{
              fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
              color: 'rgba(134,229,170,0.85)', background: 'rgba(74,222,128,0.12)',
              border: '1px solid rgba(74,222,128,0.25)', padding: '1px 5px', borderRadius: 4,
              fontWeight: 600, flexShrink: 0,
            }}>Sales Mgr</span>
          )}
        </div>
        <div style={{ fontSize: 10, color: creamFaint, marginTop: 2 }}>
          {c?.call_date ? new Date(c.call_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {c?.product ? ` · ${c.product}` : ''}
        </div>
      </div>
      <ScoreBadge score={report.icp_score} />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: outcome.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: outcome.color }}>{outcome.label}</span>
      </div>
      <div style={{ fontSize: 11, color: creamFaint }}>{c?.closer || '—'}</div>
      <div style={{ paddingRight: 10 }}>
        <div style={{ fontSize: 11, color: creamFaint, lineHeight: 1.4 }}>
          {report.call_summary?.slice(0, 80)}{(report.call_summary?.length ?? 0) > 80 ? '…' : ''}
        </div>
        <div style={{ fontSize: 10, color: gold, marginTop: 2 }}>
          {report.next_step?.slice(0, 60)}{(report.next_step?.length ?? 0) > 60 ? '…' : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: (c?.revenue ?? 0) > 0 ? '#4ade80' : creamFaint }}>
            {(c?.revenue ?? 0) > 0 ? `$${c!.revenue.toLocaleString()}` : '—'}
          </div>
          {(c?.cash_collected ?? 0) > 0 && (
            <div style={{ fontSize: 9, color: 'rgba(134,229,170,0.6)', marginTop: 1 }}>
              CC ${c!.cash_collected.toLocaleString()}
            </div>
          )}
        </div>
        {c?.id && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              title="Edit outcome / revenue / cash"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                color: creamFaint, fontSize: 12, opacity: hov ? 0.8 : 0, transition: 'opacity 0.15s',
              }}
            >✎</button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete this call"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                color: 'rgba(239,68,68,0.7)', fontSize: 13, lineHeight: 1, opacity: hov ? 0.85 : 0, transition: 'opacity 0.15s',
              }}
            >🗑</button>
          </>
        )}
      </div>
    </div>
  );
}

/* One row per PERSON. Expands into that person's individual calls. */
function ProfileRow({ group, isLast, expanded, selectedCount, onToggleExpand, onToggleSelect }: {
  group: CallGroup;
  isLast: boolean;
  expanded: boolean;
  selectedCount: number;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
}) {
  const [hov, setHov] = useState(false);
  const latest = group.reports[0];
  const outcome = OUTCOME_STYLE[group.outcome] ?? OUTCOME_STYLE.unknown;
  const n = group.reports.length;
  const bestScore = Math.max(...group.reports.map((r) => r.icp_score ?? 0));
  const closers = [...new Set(group.reports.map((r) => r.calls?.closer).filter(Boolean))] as string[];
  const first = group.reports[n - 1];
  const allSelected = selectedCount === n;

  return (
    <div
      onClick={onToggleExpand}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: '34px minmax(140px, 1fr) 70px 90px 90px minmax(150px, 1fr) 90px',
        padding: '13px 20px', cursor: 'pointer',
        background: allSelected ? 'rgba(239,68,68,0.05)' : hov ? 'rgba(201,164,85,0.03)' : 'transparent',
        borderBottom: isLast && !expanded ? 'none' : '1px solid rgba(255,255,255,0.03)',
        alignItems: 'center', transition: 'background 0.15s',
      }}
    >
      <input
        type="checkbox" checked={allSelected} onClick={(e) => e.stopPropagation()} onChange={onToggleSelect}
        title={`Select all ${n} calls with this person`}
        style={{ cursor: 'pointer', accentColor: '#c9a455', width: 14, height: 14 }}
      />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 11, color: 'rgba(201,164,85,0.6)', width: 9, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</span>
          <span style={{ fontSize: 13, color: cream }}>{group.name}</span>
          <span style={{
            fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
            color: 'rgba(201,164,85,0.9)', background: 'rgba(201,164,85,0.12)',
            border: '1px solid rgba(201,164,85,0.25)', padding: '1px 6px', borderRadius: 4,
            fontWeight: 600, flexShrink: 0,
          }}>{n} call{n === 1 ? '' : 's'}</span>
        </div>
        <div style={{ fontSize: 10, color: creamFaint, marginTop: 2, paddingLeft: 16 }}>
          {new Date(callTime(latest)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {n > 1 ? ` · first ${new Date(callTime(first)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
        </div>
      </div>
      <ScoreBadge score={bestScore} label={n > 1 ? 'best' : undefined} />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: outcome.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: outcome.color }}>{outcome.label}</span>
      </div>
      <div style={{ fontSize: 11, color: creamFaint }}>
        {closers.length ? closers.join(', ') : '—'}
      </div>
      <div style={{ paddingRight: 10 }}>
        <div style={{ fontSize: 11, color: creamFaint, lineHeight: 1.4 }}>
          {latest.call_summary?.slice(0, 80)}{(latest.call_summary?.length ?? 0) > 80 ? '…' : ''}
        </div>
        <div style={{ fontSize: 10, color: gold, marginTop: 2 }}>
          {latest.next_step?.slice(0, 60)}{(latest.next_step?.length ?? 0) > 60 ? '…' : ''}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: group.revenue > 0 ? '#4ade80' : creamFaint }}>
          {group.revenue > 0 ? `$${group.revenue.toLocaleString()}` : '—'}
        </div>
        {group.cash > 0 && (
          <div style={{ fontSize: 9, color: 'rgba(134,229,170,0.6)', marginTop: 1 }}>
            CC ${group.cash.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Import Modal ───────────────────────────────────────────────────── */
function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [raw, setRaw] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; results: Array<{ lead_name: string; ok?: boolean; error?: string }> } | null>(null);
  const [err, setErr] = useState('');

  const run = async () => {
    if (!raw.trim()) { setErr('Paste call notes first'); return; }
    setImporting(true); setErr(''); setResult(null);
    const res = await fetch('/api/admin/calls/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw, analyze: true }),
    });
    const d = await res.json();
    if (res.ok) setResult(d);
    else setErr(d.error ?? 'Import failed');
    setImporting(false);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 560, maxHeight: '80vh', background: 'rgba(14,11,7,0.97)', padding: '28px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' as const }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: cream, margin: 0 }}>Import Call Notes</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: creamFaint, fontSize: 20, padding: 0 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: creamFaint, margin: 0, lineHeight: 1.6 }}>
          Paste Discord call notes in the standard format (starting with <code style={{ color: gold, background: 'rgba(201,164,85,0.08)', padding: '1px 5px', borderRadius: 4 }}>Closer:</code>). Multiple calls OK — each will be AI-analyzed automatically.
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={'Closer: george\nSetter: danny\nDate of Call: 2026-05-14\nLead Name: JP Silva\n...'}
          rows={10}
          style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: cream, fontFamily: 'ui-monospace, monospace', fontSize: 11, resize: 'vertical' as const, outline: 'none', boxSizing: 'border-box' as const, lineHeight: 1.5 }}
        />
        {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#4ade80' }}>Imported {result.imported} calls</span>
            {result.results.map((r, i) => (
              <div key={i} style={{ fontSize: 11, color: r.ok ? cream : '#ef4444', display: 'flex', gap: 8 }}>
                <span style={{ color: r.ok ? '#4ade80' : '#ef4444' }}>{r.ok ? '✓' : '✗'}</span>
                <span>{r.lead_name}</span>
                {r.error && <span style={{ color: '#ef4444', opacity: 0.7 }}>{r.error}</span>}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          {!result ? (
            <button onClick={run} disabled={importing} style={{ flex: 1, padding: '11px', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', borderRadius: 10, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
              {importing ? 'Analyzing & Importing…' : 'Import + Analyze'}
            </button>
          ) : (
            <button onClick={onImported} style={{ flex: 1, padding: '11px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10, color: '#4ade80', fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
              Done
            </button>
          )}
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 12, textTransform: 'uppercase' as const, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Edit Call Modal (manual money / outcome override) ──────────────── */
function EditCallModal({ report, onClose, onSaved }: { report: IcpReport; onClose: () => void; onSaved: () => void }) {
  const c = report.calls;
  const [leadName, setLeadName] = useState(c?.lead_name || '');
  const [closer, setCloser] = useState(c?.closer || '');
  const [callDate, setCallDate] = useState(c?.call_date ? new Date(c.call_date).toISOString().slice(0, 10) : '');
  const [outcome, setOutcome] = useState(c?.outcome || 'unknown');
  const [revenue, setRevenue] = useState(String(c?.revenue || ''));
  const [cash, setCash] = useState(String(c?.cash_collected || ''));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!c?.id) { setErr('This call has no editable record.'); return; }
    setSaving(true); setErr('');
    const res = await fetch(`/api/admin/calls/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_name: leadName.trim(), closer: closer.trim(), call_date: callDate, outcome, revenue: parseFloat(revenue) || 0, cash_collected: parseFloat(cash) || 0 }),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Save failed'); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: cream,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)', marginBottom: 6, display: 'block' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 420, background: 'rgba(14,11,7,0.97)', padding: '28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: cream, margin: 0 }}>Edit Call</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: creamFaint, fontSize: 20, padding: 0 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: creamFaint, margin: 0, lineHeight: 1.5 }}>
          Edit the lead name, closer, and the AI-extracted figures.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Lead name</label>
            <input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Prospect name" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Closer</label>
            <input value={closer} onChange={(e) => setCloser(e.target.value)} placeholder="Closer" style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={lbl}>Call date</label>
          <input type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' as const }} />
        </div>
        <div>
          <label style={lbl}>Outcome</label>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} style={inputStyle}>
            {Object.entries(OUTCOME_STYLE).map(([val, { label }]) => (
              <option key={val} value={val}>{val === 'unknown' ? 'Unknown' : label}</option>
            ))}
          </select>
          {/* The analyzer judges "was this prospect actually qualified?" separately
              from the outcome enum. When the two disagree, surface it — this is the
              case that used to sit in No-Close and never get counted as a DQ. */}
          {(() => {
            const fa = report.full_analysis as { disqualified?: boolean; dq_reason?: string } | null;
            if (!fa?.disqualified || outcome === 'dq') return null;
            return (
              <div style={{
                marginTop: 8, padding: '8px 10px', borderRadius: 8, fontSize: 11, lineHeight: 1.5,
                background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', color: '#fbbf24',
              }}>
                AI flagged this prospect as <strong>not qualified</strong>
                {fa.dq_reason ? ` — ${fa.dq_reason}` : ''}.{' '}
                <button onClick={() => setOutcome('dq')} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: '#f97316', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                  textDecoration: 'underline', fontWeight: 600,
                }}>Mark as DQ</button>
              </div>
            );
          })()}
          <div style={{ marginTop: 6, fontSize: 10.5, color: creamFaint, lineHeight: 1.5 }}>
            Saving pins this outcome — a later re-sync or Retry Failed won&apos;t overwrite it.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Revenue ($)</label>
            <input type="number" min="0" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Cash Collected ($)</label>
            <input type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
        </div>
        {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: '11px', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', borderRadius: 10, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// In-app editor for the ICP lead-scoring rubric. Loads the live (highest-version)
// rubric the analyzer scores against; saving inserts a new version. Edits apply to
// calls analyzed AFTER saving (existing reports keep their original scores).
function IcpRubricModal({ onClose }: { onClose: () => void }) {
  const [rubric, setRubric] = useState('');
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/icp-criteria');
        const d = await res.json();
        if (res.ok) { setRubric(d.rubric || ''); setVersion(d.version ?? 0); }
        else setErr(d.error ?? 'Failed to load rubric');
      } catch { setErr('Failed to load rubric'); }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    if (!rubric.trim()) { setErr('Rubric cannot be empty.'); return; }
    setSaving(true); setErr(''); setSaved(false);
    const res = await fetch('/api/admin/icp-criteria', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rubric: rubric.trim() }),
    });
    setSaving(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setVersion(d.version ?? null); setSaved(true); }
    else setErr(d.error ?? 'Save failed');
  };

  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)', marginBottom: 6, display: 'block' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 640, maxWidth: '100%', maxHeight: '88vh', background: 'rgba(14,11,7,0.97)', padding: '28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: cream, margin: 0 }}>
            ICP Scoring Rubric{version != null && version > 0 ? <span style={{ fontSize: 12, color: creamFaint, marginLeft: 10 }}>v{version}</span> : null}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: creamFaint, fontSize: 20, padding: 0 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: creamFaint, margin: 0, lineHeight: 1.5 }}>
          The model scores every new sales call <em>strictly</em> to this rubric. Use clear weighted
          factors (summing to 100) and a missing-data rule. Saving creates a new version and applies to
          calls analyzed afterward — existing reports keep their original scores.
        </p>
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: creamFaint, fontSize: 13 }}>Loading…</div>
        ) : (
          <div>
            <label style={lbl}>Rubric</label>
            <textarea
              value={rubric}
              onChange={(e) => { setRubric(e.target.value); setSaved(false); }}
              placeholder="e.g. Factor 1 — Revenue fit (30 pts): ..."
              spellCheck={false}
              style={{
                width: '100%', minHeight: 320, padding: '12px 14px', background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: cream,
                fontFamily: "'DM Mono', ui-monospace, monospace", fontSize: 12.5, lineHeight: 1.6,
                outline: 'none', boxSizing: 'border-box', resize: 'vertical' as const,
              }}
            />
          </div>
        )}
        {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
        {saved && <span style={{ fontSize: 12, color: '#4ade80' }}>Saved as v{version}. New calls will score against it.</span>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={save} disabled={saving || loading} style={{ flex: 1, padding: '11px', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', borderRadius: 10, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: saving || loading ? 'default' : 'pointer', opacity: saving || loading ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save new version'}
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 12, textTransform: 'uppercase', cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── AI Advisor View ─────────────────────────────────────────────────── */
interface ChatMsg { role: 'user' | 'assistant'; content: string; transcript?: string }

const ADVISOR_STARTERS = [
  'What patterns do you see in my no-close calls?',
  'Which objections am I losing to most often?',
  'Who should I prioritize following up with?',
  'What\'s my average ICP score and what does it mean?',
  'Coach me on how to handle the price objection better',
  'What are the top reasons deals closed?',
];

const SALES_AI_STARTERS = [
  'What do my best closes have in common?',
  'Read my most recent call and tell me where it leaked',
  'Which objections come up most, and how were they handled?',
  'What\'s my close rate and what\'s driving it?',
  'Pull a quote from a transcript that shows a strong close',
  'Where in the call do deals usually stall?',
];

// Wrappers wire each bot to its endpoint; the panel itself is shared.
function AdvisorView() {
  return (
    <BotChatPanel
      endpoint="/api/advisor"
      title="AI Sales Advisor"
      intro="Ask me anything about your pipeline. I have full context on your calls, close rates, objections, ICP scores, and patterns — plus every client's data across the dashboard."
      placeholder="Ask about your pipeline, clients, closes, objections, patterns…"
      starters={ADVISOR_STARTERS}
    />
  );
}

function SalesAiView() {
  return (
    <BotChatPanel
      endpoint="/api/sales-advisor"
      title="Sales AI"
      intro="I live in your sales data. I read every closing call's full transcript, outcome, objections and ICP score — and I learn your sales motion over time. I can only see sales calls (no client/roadmap data)."
      placeholder="Ask about your sales calls, transcripts, objections, closes…"
      starters={SALES_AI_STARTERS}
    />
  );
}

function BotChatPanel({ endpoint, title, intro, placeholder, starters }: {
  endpoint: string; title: string; intro: string; placeholder: string; starters: string[];
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useState<HTMLDivElement | null>(null);

  const send = async (msg?: string) => {
    const text = (msg ?? input).trim();
    if (!text || loading) return;
    const newHistory: ChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(newHistory);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages }),
      });
      const d = await res.json();
      setMessages([...newHistory, { role: 'assistant', content: d.reply ?? d.error ?? 'Error' }]);
    } catch {
      setMessages([...newHistory, { role: 'assistant', content: 'Network error — please try again.' }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Intro */}
      {messages.length === 0 && (
        <div style={{ ...card, padding: '24px 28px' }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: cream, marginBottom: 8 }}>
            {title}
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: creamFaint, lineHeight: 1.7, marginBottom: 20 }}>
            {intro}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
            {starters.map((s) => (
              <button key={s} onClick={() => send(s)} style={{
                padding: '8px 14px', background: 'rgba(201,164,85,0.06)',
                border: '1px solid rgba(201,164,85,0.15)', borderRadius: 20,
                color: 'rgba(201,164,85,0.65)', fontFamily: "'DM Sans', sans-serif",
                fontSize: 11, cursor: 'pointer', textAlign: 'left' as const,
              }}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Chat messages */}
      {messages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '75%', padding: '14px 18px',
                background: m.role === 'user' ? 'rgba(201,164,85,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${m.role === 'user' ? 'rgba(201,164,85,0.18)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                color: m.role === 'user' ? cream : 'rgba(240,232,212,0.8)',
                lineHeight: 1.65, whiteSpace: 'pre-wrap' as const,
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px 14px 14px 4px' }}>
                <Dots />
              </div>
            </div>
          )}
          <div ref={bottomRef[1]} />
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={placeholder}
          style={{ ...card as React.CSSProperties, flex: 1, padding: '13px 16px', fontSize: 13, color: cream, fontFamily: "'DM Sans', sans-serif", outline: 'none', background: 'rgba(255,255,255,0.02)' }}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{
          padding: '0 22px', background: 'rgba(201,164,85,0.1)',
          border: '1px solid rgba(201,164,85,0.25)', borderRadius: 14,
          color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12,
          letterSpacing: '0.1em', cursor: 'pointer', opacity: loading || !input.trim() ? 0.5 : 1,
        }}>Send</button>
      </div>

      {/* Quick asks after first message */}
      {messages.length > 0 && !loading && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
          {starters.filter((s) => !messages.some((m) => m.content === s)).slice(0, 4).map((s) => (
            <button key={s} onClick={() => send(s)} style={{
              padding: '6px 12px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20,
              color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 10, cursor: 'pointer',
            }}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── CRM Assistant (vision: screenshots + screen recordings) ──────────────── */

// Downscale an image file to a JPEG data URL (keeps payloads small + tokens down).
async function fileToScaledJpeg(file: File, maxW = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('image load failed'));
      im.src = url;
    });
    const scale = Math.min(1, maxW / (img.width || maxW));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((img.width || maxW) * scale);
    canvas.height = Math.round((img.height || maxW) * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Sample frames from a video file, evenly across its duration, as JPEG data URLs.
// Chat recordings scroll, so evenly-spaced frames capture the messages; overlap
// is merged by the extraction prompt server-side.
async function extractVideoFrames(file: File, maxFrames = 12, maxW = 1200): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error('Could not read that video'));
    });
    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) throw new Error('Could not read the video length — try screenshots instead.');
    const count = Math.min(maxFrames, Math.max(3, Math.ceil(duration / 1.5)));
    const scale = Math.min(1, maxW / (video.videoWidth || maxW));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((video.videoWidth || maxW) * scale);
    canvas.height = Math.round((video.videoHeight || maxW) * scale);
    const ctx = canvas.getContext('2d')!;
    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
      const t = (duration * (i + 0.5)) / count;
      await new Promise<void>((res) => {
        const on = () => { video.removeEventListener('seeked', on); res(); };
        video.addEventListener('seeked', on);
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.8));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const CRM_ASSISTANT_STARTERS = [
  'Add this lead to the CRM and save the conversation',
  'Draft a reply to move this conversation forward',
  'What stage and status should this lead be?',
  'What objections or buying signals do you see?',
  'Who in my pipeline is due for follow-up?',
  'Which leads look like Perfect ICP?',
];

// A read DM conversation, kept in the chat history but collapsed by default —
// so the transcript isn't dumped in full, but you can expand to scroll through
// it and check nothing was mis-read before/after the AI files the lead.
function TranscriptBlock({ transcript }: { transcript: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        color: 'rgba(201,164,85,0.7)', fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: '0.04em',
      }}>{open ? '▾ Hide conversation' : '▸ View conversation'}</button>
      {open && (
        <div style={{
          marginTop: 8, padding: '10px 12px', maxHeight: 280, overflowY: 'auto' as const,
          background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
          fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: 'rgba(240,232,212,0.7)',
          lineHeight: 1.6, whiteSpace: 'pre-wrap' as const,
        }}>{transcript}</div>
      )}
    </div>
  );
}

function CrmAssistantView() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // extraction status text
  const [conversationId, setConversationId] = useState<string | null>(null);
  const fileRef = useState<HTMLInputElement | null>(null);
  // Synchronous source of truth for the thread — lets us append a message and
  // immediately auto-send the next turn without waiting for React state to flush.
  const messagesRef = React.useRef<ChatMsg[]>([]);
  const commit = (next: ChatMsg[]) => { messagesRef.current = next; setMessages(next); };

  const send = async (msg?: string, opts?: { convId?: string | null }) => {
    const text = (msg ?? input).trim();
    if (!text || loading) return;
    const base = messagesRef.current;
    const convId = opts && 'convId' in opts ? (opts.convId ?? null) : conversationId;
    commit([...base, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/crm/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: base, conversationId: convId }),
      });
      const d = await res.json();
      if (d.conversationId) setConversationId(d.conversationId);
      commit([...messagesRef.current, { role: 'assistant', content: d.reply ?? d.error ?? 'Error' }]);
    } catch {
      commit([...messagesRef.current, { role: 'assistant', content: 'Network error — please try again.' }]);
    }
    setLoading(false);
  };

  // After a DM conversation is read, don't show its full transcript — jump straight
  // into filing the lead. The AI already "sees" the transcript via crmbot_context,
  // so this instruction is all it needs to create the record and log the messages.
  const AUTO_ADD_INSTRUCTION =
    'Add this lead to the CRM now and save the whole conversation to their timeline. ' +
    'Use the DM conversation I just shared as the source of truth: create or update the lead by their @handle, ' +
    'set the stage, status, ICP tier, revenue, business type, and source fields you can justify from the conversation, ' +
    'and log every message as a touchpoint (inbound/outbound). Then give me a short recap of exactly what you saved. ' +
    'If no @handle is visible anywhere in the conversation, ask me for it instead of creating a lead.';

  const runExtract = async (
    images: string[],
    source: 'screenshot' | 'recording',
  ): Promise<{ transcript: string; convId: string | null; kind: string } | null> => {
    const res = await fetch('/api/crm/assistant/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images, source, conversationId }),
    });
    const d = await res.json();
    if (!res.ok) {
      commit([...messagesRef.current, { role: 'assistant', content: `⚠️ ${d.error || 'Could not read that upload.'}` }]);
      return null;
    }
    if (d.conversationId) setConversationId(d.conversationId);
    const kind = source === 'recording'
      ? `${d.imageCount} frames`
      : `${d.imageCount} screenshot${d.imageCount > 1 ? 's' : ''}`;
    return { transcript: d.transcript as string, convId: (d.conversationId ?? conversationId) as string | null, kind };
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length || busy) return;
    const list = Array.from(files);
    const imageFiles = list.filter((f) => f.type.startsWith('image/'));
    const videoFiles = list.filter((f) => f.type.startsWith('video/'));
    if (!imageFiles.length && !videoFiles.length) return;

    // Read each dropped item once, then immediately turn it into a CRM lead.
    const jobs: { images: string[]; source: 'screenshot' | 'recording' }[] = [];
    try {
      if (imageFiles.length) {
        setBusy(`Reading ${imageFiles.length} screenshot${imageFiles.length > 1 ? 's' : ''}…`);
        const images = await Promise.all(imageFiles.slice(0, 20).map((f) => fileToScaledJpeg(f)));
        jobs.push({ images, source: 'screenshot' });
      }
      for (const vf of videoFiles) {
        setBusy(`Extracting frames from ${vf.name}…`);
        const frames = await extractVideoFrames(vf);
        jobs.push({ images: frames, source: 'recording' });
      }

      for (const job of jobs) {
        setBusy(`Reading ${job.images.length} ${job.source === 'recording' ? 'frames' : `screenshot${job.images.length > 1 ? 's' : ''}`}…`);
        const ex = await runExtract(job.images, job.source);
        if (!ex) continue;
        // Keep the conversation in the history — collapsed, not dumped — so you can
        // scroll back and check it, then let the AI file the lead automatically.
        commit([...messagesRef.current, {
          role: 'assistant',
          content: `📄 Read ${ex.kind} of this ${job.source === 'recording' ? 'screen recording' : 'conversation'}. Adding this lead to the CRM now…`,
          transcript: ex.transcript,
        }]);
        setBusy(null);
        await send(AUTO_ADD_INSTRUCTION, { convId: ex.convId });
      }
    } catch (e) {
      commit([...messagesRef.current, { role: 'assistant', content: `⚠️ ${e instanceof Error ? e.message : 'Could not process that file.'}` }]);
    } finally {
      setBusy(null);
      if (fileRef[0]) fileRef[0].value = '';
    }
  };

  const empty = messages.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {empty && (
        <div style={{ ...card, padding: '24px 28px' }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: cream, marginBottom: 8 }}>
            CRM Assistant
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: creamFaint, lineHeight: 1.7, marginBottom: 16 }}>
            I read your CRM pipeline and whatever you feed me. Attach <strong style={{ color: 'rgba(240,232,212,0.8)' }}>screenshots or a screen recording</strong> of an
            Instagram/WhatsApp DM and I&apos;ll pull out exactly what was said — then draft replies, recommend the right stage, and spot objections.
            Give me the lead&apos;s <strong style={{ color: 'rgba(240,232,212,0.8)' }}>@handle and name</strong> and I&apos;ll add them to the CRM and save the conversation to their timeline.
            I only see the CRM tab&apos;s data (no client roadmaps or sales calls).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
            {CRM_ASSISTANT_STARTERS.map((s) => (
              <button key={s} onClick={() => send(s)} style={{
                padding: '8px 14px', background: 'rgba(201,164,85,0.06)', border: '1px solid rgba(201,164,85,0.15)',
                borderRadius: 20, color: 'rgba(201,164,85,0.65)', fontFamily: "'DM Sans', sans-serif", fontSize: 11, cursor: 'pointer', textAlign: 'left' as const,
              }}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {!empty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '14px 18px',
                background: m.role === 'user' ? 'rgba(201,164,85,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${m.role === 'user' ? 'rgba(201,164,85,0.18)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                color: m.role === 'user' ? cream : 'rgba(240,232,212,0.8)',
                lineHeight: 1.65, whiteSpace: 'pre-wrap' as const,
              }}>
                {m.content}
                {m.transcript && <TranscriptBlock transcript={m.transcript} />}
              </div>
            </div>
          ))}
          {(loading || busy) && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px 14px 14px 4px' }}>
                <Dots />
              </div>
              {busy && <span style={{ fontSize: 11, color: creamFaint, fontFamily: "'DM Sans', sans-serif" }}>{busy}</span>}
            </div>
          )}
        </div>
      )}

      {/* Input row with attach */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          ref={(el) => { fileRef[1](el); }}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileRef[0]?.click()}
          disabled={!!busy}
          title="Attach screenshots or a screen recording"
          style={{
            flexShrink: 0, width: 46, height: 46, background: 'rgba(201,164,85,0.06)',
            border: '1px solid rgba(201,164,85,0.2)', borderRadius: 12, color: gold,
            fontSize: 18, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
          }}
        >📎</button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask about a lead, or attach a DM screenshot/recording…"
          style={{ ...card as React.CSSProperties, flex: 1, padding: '13px 16px', fontSize: 13, color: cream, fontFamily: "'DM Sans', sans-serif", outline: 'none', background: 'rgba(255,255,255,0.02)' }}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{
          padding: '0 22px', height: 46, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)',
          borderRadius: 14, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12, letterSpacing: '0.1em',
          cursor: 'pointer', opacity: loading || !input.trim() ? 0.5 : 1,
        }}>Send</button>
      </div>

      {!empty && !loading && !busy && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
          {CRM_ASSISTANT_STARTERS.filter((s) => !messages.some((m) => m.content === s)).slice(0, 4).map((s) => (
            <button key={s} onClick={() => send(s)} style={{
              padding: '6px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 20, color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 10, cursor: 'pointer',
            }}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Referrals View ──────────────────────────────────────────────────── */
interface Referral {
  id: string;
  referrer_name: string;
  referred_name: string;
  referral_date: string | null;
  cash_collected: number;
  commission: number;
  created_at: string;
}

function ReferralsView() {
  const [items, setItems] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [referrer, setReferrer] = useState('');
  const [referred, setReferred] = useState('');
  const [date, setDate] = useState('');
  const [cash, setCash] = useState('');
  const [commission, setCommission] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/referrals').then((r) => (r.ok ? r.json() : [])).then((d) => setItems(d || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => { setEditingId(null); setReferrer(''); setReferred(''); setDate(''); setCash(''); setCommission(''); setErr(''); };
  const startEdit = (r: Referral) => {
    setEditingId(r.id); setReferrer(r.referrer_name); setReferred(r.referred_name);
    setDate(r.referral_date || ''); setCash(r.cash_collected ? String(r.cash_collected) : '');
    setCommission(r.commission ? String(r.commission) : ''); setErr('');
  };

  const save = async () => {
    if (!referrer.trim() || !referred.trim()) { setErr('Both names are required'); return; }
    setSaving(true); setErr('');
    const body = {
      referrer_name: referrer.trim(), referred_name: referred.trim(),
      referral_date: date || null, cash_collected: parseFloat(cash) || 0, commission: parseFloat(commission) || 0,
    };
    const res = await fetch(editingId ? `/api/admin/referrals/${editingId}` : '/api/admin/referrals', {
      method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) { resetForm(); load(); }
    else { const d = await res.json().catch(() => ({})); setErr(d.error || 'Save failed'); }
  };
  const del = async (id: string) => {
    await fetch(`/api/admin/referrals/${id}`, { method: 'DELETE' }).catch(() => {});
    if (editingId === id) resetForm();
    load();
  };

  // Date-range presets (month-to-month is just a quick month preset).
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthRange = (d: Date) => {
    const y = d.getFullYear(), m = d.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return [`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-${pad(last)}`] as const;
  };
  const thisMonth = () => { const [f, t] = monthRange(new Date()); setFrom(f); setTo(t); };
  const lastMonth = () => { const n = new Date(); const [f, t] = monthRange(new Date(n.getFullYear(), n.getMonth() - 1, 1)); setFrom(f); setTo(t); };
  const clearRange = () => { setFrom(''); setTo(''); };

  const inRange = (r: Referral) => {
    if (!r.referral_date) return !from && !to;
    if (from && r.referral_date < from) return false;
    if (to && r.referral_date > to) return false;
    return true;
  };
  const visible = items.filter(inRange);
  const totalCash = visible.reduce((s, r) => s + (r.cash_collected || 0), 0);
  const totalCommission = visible.reduce((s, r) => s + (r.commission || 0), 0);

  const inputStyle: React.CSSProperties = {
    padding: '9px 11px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: 'none', boxSizing: 'border-box',
  };
  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const cols = 'minmax(120px, 1fr) minmax(120px, 1fr) 130px 110px 120px 56px';

  return (
    <div>
      {/* Scorecards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' as const }}>
        <Stat label="Total Referrals" value={visible.length} />
        <Stat label="Cash Collected" value={`$${totalCash.toLocaleString()}`} />
        <Stat label="Commission Payout" value={`$${totalCommission.toLocaleString()}`} />
      </div>

      {/* Date range filter */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.5)' }}>Range</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputStyle, width: 150 }} />
        <span style={{ color: creamFaint, fontSize: 12 }}>→</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inputStyle, width: 150 }} />
        {([['This Month', thisMonth], ['Last Month', lastMonth], ['All', clearRange]] as const).map(([label, fn]) => (
          <button key={label} onClick={fn} style={{
            padding: '7px 12px', borderRadius: 20, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {/* Add / edit form */}
      <div style={{ ...card, padding: '16px 18px', marginBottom: 18 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.5)', marginBottom: 10 }}>
          {editingId ? 'Edit referral' : 'Add referral'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px 120px 130px', gap: 8, marginBottom: 10 }}>
          <input value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="Referred by (client)" style={inputStyle} />
          <input value={referred} onChange={(e) => setReferred(e.target.value)} placeholder="Referred client" style={inputStyle} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title="Date referral sent" style={inputStyle} />
          <input type="number" min="0" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="Cash $" style={inputStyle} />
          <input type="number" min="0" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="Commission $" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={save} disabled={saving} style={{ padding: '9px 18px', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', borderRadius: 8, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer' }}>
            {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Referral'}
          </button>
          {editingId && <button onClick={resetForm} style={{ padding: '9px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 11, textTransform: 'uppercase' as const, cursor: 'pointer' }}>Cancel</button>}
          {err && <span style={{ fontSize: 11, color: '#ef4444' }}>{err}</span>}
        </div>
      </div>

      {/* Table (horizontally scrollable on narrow screens) */}
      <div style={{ ...card, overflow: 'hidden', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {['Referred By', 'Referred Client', 'Date Sent', 'Cash', 'Commission', ''].map((h, i) => (
            <span key={i} style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.35)' }}>{h}</span>
          ))}
        </div>
        {loading ? (
          <SkeletonList rows={5} />
        ) : visible.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' as const, color: creamFaint, fontSize: 13 }}>
            {items.length === 0 ? 'No referrals yet — add one above.' : 'No referrals in this range.'}
          </div>
        ) : visible.map((r, i) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: cols, padding: '12px 20px', alignItems: 'center', borderBottom: i === visible.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ fontSize: 13, color: cream }}>{r.referrer_name}</span>
            <span style={{ fontSize: 13, color: cream }}>{r.referred_name}</span>
            <span style={{ fontSize: 11, color: creamFaint }}>{fmtDate(r.referral_date)}</span>
            <span style={{ fontSize: 12, color: (r.cash_collected || 0) > 0 ? '#4ade80' : creamFaint }}>{(r.cash_collected || 0) > 0 ? `$${r.cash_collected.toLocaleString()}` : '—'}</span>
            <span style={{ fontSize: 12, color: (r.commission || 0) > 0 ? gold : creamFaint }}>{(r.commission || 0) > 0 ? `$${r.commission.toLocaleString()}` : '—'}</span>
            <span style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => startEdit(r)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: creamFaint, fontSize: 12, padding: 0 }}>✎</button>
              <button onClick={() => del(r.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: creamFaint, fontSize: 15, padding: 0, lineHeight: 1 }}>×</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserRow({ user, isLast, onClick }: { user: User; isLast: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  const initials = user.name
    ? user.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : user.email.slice(0, 2).toUpperCase();

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(150px, 1fr) 120px 120px 130px 100px',
        padding: '14px 20px', cursor: 'pointer',
        background: hov ? 'rgba(201,164,85,0.03)' : 'transparent',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.03)',
        alignItems: 'center',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: user.avatar ? 'transparent' : 'rgba(201,164,85,0.1)',
          border: '1px solid rgba(201,164,85,0.2)',
          overflow: 'hidden', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {user.avatar
            ? <img src={user.avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
            : <span style={{ fontSize: 11, fontWeight: 600, color: gold }}>{initials}</span>
          }
        </div>
        <div>
          <div style={{ fontSize: 13, color: cream }}>{user.name || '—'}</div>
          <div style={{ fontSize: 11, color: creamFaint }}>{user.email}</div>
          {(user.tags || []).length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' as const }}>
              {(user.tags || []).map((tag) => {
                const t = TAG_MAP[tag as TagValue];
                return t ? (
                  <span key={tag} style={{
                    fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                    color: t.color, background: t.color + '15',
                    border: `1px solid ${t.color}30`,
                    padding: '1px 5px', borderRadius: 4,
                    fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                  }}>{t.label}</span>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
      <div><Pill>{user.role === 'admin' ? 'Admin' : 'Member'}</Pill></div>
      <div>
        {user.status === 'pending' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(251,191,36,0.85)', letterSpacing: '0.06em' }}>
              Pending
            </span>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: user.active ? '#4ade80' : '#ef4444', flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: user.active ? 'rgba(74,222,128,0.75)' : 'rgba(239,68,68,0.65)', letterSpacing: '0.06em' }}>
              {user.status === 'rejected' ? 'Rejected' : user.active ? 'Active' : 'Inactive'}
            </span>
          </span>
        )}
      </div>
      <div>
        {user.activity_level ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: ACTIVITY_COLORS[user.activity_level], flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'rgba(240,232,212,0.62)', letterSpacing: '0.04em' }}>
              {ACTIVITY_LABELS[user.activity_level]}
            </span>
          </span>
        ) : (
          <span style={{ fontSize: 11, color: creamFaint }}>—</span>
        )}
      </div>
      <span style={{ fontSize: 11, color: creamFaint }}>{fmt(user.last_login)}</span>
    </div>
  );
}

/* ─── ManyChat Action Panel ────────────────────────────────────────────── */
function ManyChActionPanel({ leadId, igHandle, notes, onTouchpoint }: {
  leadId: string; igHandle: string | null; notes: string | null; onTouchpoint: () => void;
}) {
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const mcId = notes?.match(/\[mc:([^\]]+)\]/)?.[1] ?? null;
  const linked = !!(mcId || igHandle);

  async function action(type: 'add_tag' | 'remove_tag', tagName: string) {
    if (!tagName.trim()) return;
    setBusy(type); setMsg('');
    const res = await fetch('/api/crm/manychat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, action: type, tag_name: tagName.trim() }),
    });
    setBusy('');
    if (res.ok) { setMsg(`✓ Tag ${type === 'add_tag' ? 'added' : 'removed'}`); setTag(''); onTouchpoint(); }
    else { const d = await res.json().catch(() => ({})); setMsg(`✗ ${d.error || 'Failed'}`); }
  }

  const iStyle2: React.CSSProperties = {
    padding: '7px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 7, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 11, outline: 'none',
    flex: 1,
  };
  const btnStyle2 = (col: string): React.CSSProperties => ({
    padding: '7px 11px', background: 'none', border: `1px solid ${col}44`,
    borderRadius: 7, color: col, fontFamily: "'DM Sans', sans-serif", fontSize: 10,
    letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap' as const,
  });

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.5)', marginBottom: 8 }}>
        <span>ManyChat</span>
        <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 8, background: linked ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)', color: linked ? '#4ade80' : '#444' }}>
          {linked ? (mcId ? 'ID linked' : 'IG linked') : 'not linked'}
        </span>
      </div>
      {!linked ? (
        <div style={{ fontSize: 11, color: '#444', padding: '8px 0' }}>
          No ManyChat subscriber found. They need to DM through a ManyChat flow first to be linked.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag name…" style={iStyle2} />
            <button onClick={() => action('add_tag', tag)} disabled={busy === 'add_tag' || !tag.trim()} style={btnStyle2('#4ade80')}>
              {busy === 'add_tag' ? '…' : '+ Tag'}
            </button>
            <button onClick={() => action('remove_tag', tag)} disabled={busy === 'remove_tag' || !tag.trim()} style={btnStyle2('#f87171')}>
              {busy === 'remove_tag' ? '…' : '− Tag'}
            </button>
          </div>
          {msg && <div style={{ fontSize: 11, color: msg.startsWith('✓') ? '#4ade80' : '#f87171' }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

/* Close (calling) + Kit (email) sync for a lead. Close dialling happens in
 * Close's own app — we push the lead, deep-link to its dialer, and pull call
 * activity back. Kit tags the subscriber / drops them into a sequence. */
function CloseKitPanel({ lead, onUpdated, onTouchpoint }: {
  lead: CRMLead; onUpdated: (l: CRMLead) => void; onTouchpoint: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [tag, setTag] = useState('');
  const [seqId, setSeqId] = useState('');
  const [kit, setKit] = useState<{ tags: { id: number; name: string }[]; sequences: { id: number; name: string }[] }>({ tags: [], sequences: [] });

  useEffect(() => {
    fetch('/api/crm/kit').then((r) => r.ok ? r.json() : null).then((d) => { if (d) setKit(d); }).catch(() => {});
  }, []);

  const flash = (t: string, ok: boolean) => setMsg({ t, ok });
  async function call(url: string, body: object, key: string, okMsg: string, after?: (d: unknown) => void) {
    setBusy(key); setMsg(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { flash(d.warning || okMsg, !d.warning); after?.(d); onTouchpoint(); }
      else flash(d.error || 'Failed', false);
    } catch { flash('Request failed', false); }
    finally { setBusy(''); }
  }

  const linked = !!lead.close_lead_id;
  const iStyle2: React.CSSProperties = {
    padding: '7px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 7, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 11, outline: 'none', flex: 1,
  };
  const btn = (col: string): React.CSSProperties => ({
    padding: '7px 11px', background: 'none', border: `1px solid ${col}44`, borderRadius: 7, color: col,
    fontFamily: "'DM Sans', sans-serif", fontSize: 10, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap' as const,
  });
  const heading = (label: string, ok: boolean, badge: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.5)', marginBottom: 8 }}>
      <span>{label}</span>
      <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 8, background: ok ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)', color: ok ? '#4ade80' : '#444' }}>{badge}</span>
    </div>
  );

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Close — calling */}
      {heading('Close · Calling', linked, linked ? 'linked' : 'not synced')}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          <button onClick={() => call(`/api/crm/leads/${lead.id}/close`, { action: 'push' }, 'push', linked ? '✓ Re-synced' : '✓ Synced to Close', (d) => { const id = (d as { close_lead_id?: string }).close_lead_id; if (id) onUpdated({ ...lead, close_lead_id: id }); })} disabled={busy === 'push'} style={btn('#8FD0FF')}>
            {busy === 'push' ? '…' : linked ? 'Re-sync' : 'Sync to Close'}
          </button>
          {linked && (
            <>
              <a href={`https://app.close.com/lead/${lead.close_lead_id}/`} target="_blank" rel="noopener noreferrer" style={{ ...btn('#4ade80'), textDecoration: 'none' }}>Open in Close ↗</a>
              <button onClick={() => call(`/api/crm/leads/${lead.id}/close`, { action: 'sync_calls' }, 'calls', '✓ Calls pulled')} disabled={busy === 'calls'} style={btn('#c9a455')}>
                {busy === 'calls' ? '…' : 'Pull calls'}
              </button>
            </>
          )}
        </div>
        {!linked && <div style={{ fontSize: 10, color: '#555' }}>Sync pushes this lead to Close, then you can dial from Close’s app.</div>}
      </div>

      {/* Kit — email */}
      {heading('Kit · Email', false, lead.email ? 'ready' : 'no email')}
      {!lead.email ? (
        <div style={{ fontSize: 11, color: '#444' }}>Add an email to this lead to sync it into Kit.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag name…" list="kit-tags" style={iStyle2} />
            <datalist id="kit-tags">{kit.tags.map((t) => <option key={t.id} value={t.name} />)}</datalist>
            <button onClick={() => call(`/api/crm/leads/${lead.id}/kit`, { action: 'tag', tag }, 'tag', '✓ Tagged in Kit')} disabled={busy === 'tag' || !tag.trim()} style={btn('#C9A8FF')}>
              {busy === 'tag' ? '…' : '+ Tag'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={seqId} onChange={(e) => setSeqId(e.target.value)} style={{ ...iStyle2, cursor: 'pointer' }}>
              <option value="">Add to sequence…</option>
              {kit.sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={() => call(`/api/crm/leads/${lead.id}/kit`, { action: 'sequence', sequenceId: seqId }, 'seq', '✓ Added to sequence')} disabled={busy === 'seq' || !seqId} style={btn('#C9A8FF')}>
              {busy === 'seq' ? '…' : 'Add'}
            </button>
          </div>
        </div>
      )}
      {msg && <div style={{ fontSize: 11, marginTop: 8, color: msg.ok ? '#4ade80' : '#f87171' }}>{msg.t}</div>}
    </div>
  );
}

/* ─── CRM View ─────────────────────────────────────────────────────────── */
interface CRMLead {
  id: string;
  ig_handle: string | null;
  whatsapp: string | null;
  has_whatsapp: boolean;
  name: string | null;
  email: string | null;
  makes_money: string | null;
  source: string | null;
  icp_tier: string | null;
  status: string | null;
  revenue: string | null;
  business: string | null;
  tags: string[] | null;
  pipeline_id: string | null;
  dials_made: number | null;
  close_lead_id: string | null;
  stage: string;
  next_followup_at: string | null;
  ai_summary: string | null;
  ai_next_move: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PipelineStage { key: string; label: string; color: string }
interface Pipeline { id: string; name: string; stages: PipelineStage[]; position: number }

interface CRMTouchpoint {
  id: string;
  lead_id: string;
  channel: string;
  direction: string;
  content: string;
  created_at: string;
}

const STAGES = ['new', 'contacted', 'nurturing', 'application_sent', 'call_booked', 'call_held', 'closed_won', 'closed_lost', 'ghosted'] as const;
const STAGE_LABELS: Record<string, string> = {
  new: 'New', contacted: 'Contacted', nurturing: 'Nurturing',
  application_sent: 'App Sent', call_booked: 'Call Booked',
  call_held: 'Call Held', closed_won: 'Closed Won',
  closed_lost: 'Closed Lost', ghosted: 'Ghosted',
};
const STAGE_COLORS: Record<string, string> = {
  new: 'rgba(240,232,212,0.4)', contacted: 'rgba(143,208,255,0.7)',
  nurturing: 'rgba(201,164,85,0.7)', application_sent: 'rgba(201,164,85,0.9)',
  call_booked: '#4ade80', call_held: '#34d399',
  closed_won: '#4ade80', closed_lost: 'rgba(239,68,68,0.7)', ghosted: 'rgba(240,232,212,0.25)',
};

const SOURCES = ['ig_dm', 'whatsapp', 'referral', 'cold_outreach', 'inbound', 'freebie', 'other'];
const CHANNELS = ['ig_dm', 'whatsapp', 'sms', 'call', 'email', 'other'];
const ICP_TIERS = ['Low ICP', 'Perfect ICP'];
const LEAD_STATUSES = ['Qualified', 'DQ'];
const REVENUE_RANGES = ['$0 - $10k', '$10k - $30k', '$30k - $50k', '$50k - $100k', '$100k - $200k', '$200k - $500k', '$500k - $1mil'];
const BUSINESS_TYPES = ['Coach', 'Agency Owner', 'Other'];
const STATUS_COLORS: Record<string, string> = { Qualified: '#4ade80', DQ: 'rgba(239,68,68,0.8)' };

function crmFmt(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function leadLabel(l: CRMLead) {
  return l.ig_handle ? `@${l.ig_handle.replace(/^@+/, '')}` : l.name || l.whatsapp || l.email || 'Unknown';
}

/* Deterministic color for a free-form tag (stable across renders). */
const TAG_PALETTE = ['#8FD0FF', '#C9A8FF', '#4ade80', '#F5E6A3', '#F0826D', '#BFFA46', '#f0a5c0', '#7dd3c0'];
function tagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

/* Resolve a lead's stage label + color from its own pipeline (falls back to
 * the global sales-stage constants for legacy / unassigned leads). */
function stageMetaFor(lead: CRMLead, pipeMap: Map<string, Pipeline>): { label: string; color: string } {
  const p = lead.pipeline_id ? pipeMap.get(lead.pipeline_id) : null;
  const st = p?.stages.find((s) => s.key === lead.stage);
  if (st) return { label: st.label, color: st.color };
  return { label: STAGE_LABELS[lead.stage] || lead.stage, color: STAGE_COLORS[lead.stage] || creamFaint };
}

/* Minimal, dependency-free CSV parser. Handles quoted fields, escaped quotes
 * (""), commas and newlines inside quotes, and CRLF line endings. Returns a
 * matrix of rows → cells. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, ''); // strip BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '') || rows.length) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/* CRM field a CSV column maps to. */
type ImportField = 'name' | 'email' | 'whatsapp' | 'ig_handle' | 'revenue' | 'makes_money' | 'status_tag' | 'freebiesource_tag' | 'tag' | 'ignore';
const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: 'Name', email: 'Email', whatsapp: 'Phone / WhatsApp', ig_handle: 'Instagram handle',
  revenue: 'Monthly revenue', makes_money: 'Makes money from content', status_tag: 'Qualified/DQ → status + tag',
  freebiesource_tag: 'Freebie source → tag', tag: 'Extra tag', ignore: 'Ignore column',
};

/* Guess the CRM field for a CSV header by name. */
function autoMapHeader(header: string): ImportField {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/(^|\b)(firstname|fullname|name)($|\b)/.test(h) || h === 'name') return 'name';
  if (h.includes('email') || h.includes('mail')) return 'email';
  if (h.includes('phone') || h.includes('whatsapp') || h.includes('mobile') || h.includes('number')) return 'whatsapp';
  if (h.includes('instagram') || h.includes('ig') || h.includes('handle') || h.includes('social')) return 'ig_handle';
  if (h.includes('freebiesource') || h.includes('leadsource') || h.includes('freebie')) return 'freebiesource_tag';
  if (h.includes('makemoney') || h.includes('makesmoney') || h.includes('makingmoney') || h.includes('monetiz') || h.includes('moneyfromcontent')) return 'makes_money';
  if (h.includes('monthly') || h.includes('revenue') || h.includes('cash') || h.includes('income') || h.includes('mrr')) return 'revenue';
  if (h.includes('qualif') || h.includes('disqualif') || h === 'status' || h.includes('tag')) return 'status_tag';
  return 'ignore';
}

/* Truthy check for a "makes money from content" cell. */
function isYes(v: string) {
  const t = v.toLowerCase().trim();
  return t === 'yes' || t === 'y' || t === 'true' || t === '1' || t.startsWith('yes');
}

/* ─── Reusable: free-form tag chip editor ─────────────────────────────────── */
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const t = raw.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  };
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      padding: '7px 9px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8, minHeight: 38,
    }}>
      {tags.map((t) => {
        const c = tagColor(t);
        return (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20,
            fontSize: 11, background: `${c}1f`, color: c, border: `1px solid ${c}55`,
          }}>
            {t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} style={{
              background: 'none', border: 'none', color: c, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0,
            }}>×</button>
          </span>
        );
      })}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
          else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => add(draft)}
        placeholder={tags.length ? 'add tag…' : 'type a tag, press Enter'}
        style={{ flex: '1 1 90px', minWidth: 90, background: 'none', border: 'none', outline: 'none', color: cream, fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}
      />
    </div>
  );
}

/* ─── Pipeline editor modal (create / rename / edit stages) ───────────────── */
const PIPE_COLORS = ['#8FD0FF', '#C9A8FF', '#4ade80', '#34d399', '#F5E6A3', '#BFFA46', '#F0826D', '#f0a5c0'];
function PipelineEditorModal({ pipeline, onClose, onSave }: {
  pipeline: Pipeline | null;
  onClose: () => void;
  onSave: (name: string, stages: PipelineStage[], id?: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(pipeline?.name || '');
  const [stages, setStages] = useState<PipelineStage[]>(
    pipeline?.stages?.length ? pipeline.stages.map((s) => ({ ...s })) : [{ key: 'new', label: 'New', color: PIPE_COLORS[0] }],
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const setStage = (i: number, patch: Partial<PipelineStage>) =>
    setStages((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const move = (i: number, dir: -1 | 1) => setStages((prev) => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const submit = async () => {
    if (!name.trim()) { setErr('Give the pipeline a name'); return; }
    const clean = stages.filter((s) => s.label.trim());
    if (!clean.length) { setErr('Add at least one stage'); return; }
    setSaving(true); setErr('');
    const error = await onSave(name.trim(), clean, pipeline?.id);
    setSaving(false);
    if (error) setErr(error); else onClose();
  };

  const inp: React.CSSProperties = { padding: '9px 11px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 520, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', background: 'rgba(14,11,7,0.98)', padding: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 700, color: cream }}>
          {pipeline ? 'Edit pipeline' : 'New pipeline'}
        </div>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(240,232,212,0.35)', marginBottom: 5 }}>Name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Pipeline" style={{ ...inp, width: '100%' }} />
        </div>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(240,232,212,0.35)', marginBottom: 8 }}>Stages (in order)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stages.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="color" value={/^#/.test(s.color) ? s.color : '#8FD0FF'} onChange={(e) => setStage(i, { color: e.target.value })}
                  title="Stage color" style={{ width: 30, height: 30, border: 'none', background: 'none', cursor: 'pointer', padding: 0, borderRadius: 6 }} />
                <input value={s.label} onChange={(e) => setStage(i, { label: e.target.value })} placeholder="Stage name" style={{ ...inp, flex: 1 }} />
                <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...inp, cursor: 'pointer', opacity: i === 0 ? 0.3 : 1, padding: '6px 9px' }}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === stages.length - 1} style={{ ...inp, cursor: 'pointer', opacity: i === stages.length - 1 ? 0.3 : 1, padding: '6px 9px' }}>↓</button>
                <button onClick={() => setStages((prev) => prev.filter((_, idx) => idx !== i))} disabled={stages.length <= 1}
                  style={{ ...inp, cursor: 'pointer', color: 'rgba(239,68,68,0.7)', opacity: stages.length <= 1 ? 0.3 : 1, padding: '6px 10px' }}>×</button>
              </div>
            ))}
          </div>
          <button onClick={() => setStages((prev) => [...prev, { key: `stage_${prev.length}`, label: '', color: PIPE_COLORS[prev.length % PIPE_COLORS.length] }])}
            style={{ marginTop: 10, padding: '8px 14px', background: 'rgba(201,164,85,0.08)', border: '1px dashed rgba(201,164,85,0.3)', borderRadius: 8, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer' }}>
            + Add stage
          </button>
        </div>
        {err && <div style={{ fontSize: 12, color: '#ef4444' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{ padding: '9px 18px', background: gold, border: 'none', borderRadius: 8, color: '#111', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Saving…' : pipeline ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── CSV import modal (upload → auto-map → preview → import) ──────────────── */
/* Bulk Close sync — mirrors the whole CRM into Close: every lead (with its notes,
 * tags and contact details), the pipelines rebuilt as Close pipelines, and each
 * lead parked on the matching Close stage.
 *
 * Runs in batches and loops until nothing is pending, so one long request can't
 * time out mid-import. Safe to run again — leads already linked get updated, not
 * duplicated. */
function CloseSyncModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  type Status = { configured: boolean; migrated: boolean; total: number; linked: number; pending: number; stale: number; error?: string };
  type Batch = { pushed: number; created: number; updated: number; failed: number; unplaced: number; pending: number; pipelinesCreated: string[]; stagesAdded: string[]; errors: string[]; error?: string };

  const [status, setStatus] = useState<Status | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  // Totals accumulated across every batch of this run.
  const [totals, setTotals] = useState({ created: 0, updated: 0, failed: 0, unplaced: 0 });
  const [pipelines, setPipelines] = useState<{ created: string[]; stages: string[] }>({ created: [], stages: [] });
  const [errors, setErrors] = useState<string[]>([]);
  // Bumped after a run to re-read the counts.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch('/api/crm/close/sync')
      .then((r) => r.json().catch(() => null).then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && d) setStatus(d as Status);
        else setErr((d as { error?: string } | null)?.error || 'Could not read the Close sync status');
      })
      .catch(() => setErr('Could not read the Close sync status'));
  }, [reload]);

  const run = async () => {
    setRunning(true); setErr(''); setDone(false);
    setTotals({ created: 0, updated: 0, failed: 0, unplaced: 0 });
    setErrors([]); setPipelines({ created: [], stages: [] });

    // Bounded loop: each pass pushes a batch and reports what's left. The cap is a
    // stop-gap against a pending count that never falls (nothing left to do, or a
    // lead that fails every time) — the cron picks up any remainder.
    for (let pass = 0; pass < 40; pass++) {
      const res = await fetch('/api/crm/close/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeStale: true }),
      });
      const d: Batch = await res.json().catch(() => ({} as Batch));
      if (!res.ok) { setErr(d?.error || 'Close sync failed'); break; }

      setTotals((t) => ({
        created: t.created + (d.created || 0),
        updated: t.updated + (d.updated || 0),
        failed: t.failed + (d.failed || 0),
        unplaced: t.unplaced + (d.unplaced || 0),
      }));
      if (d.pipelinesCreated?.length || d.stagesAdded?.length) {
        setPipelines((p) => ({
          created: Array.from(new Set([...p.created, ...(d.pipelinesCreated || [])])),
          stages: Array.from(new Set([...p.stages, ...(d.stagesAdded || [])])),
        }));
      }
      if (d.errors?.length) setErrors((e) => [...e, ...d.errors].slice(0, 12));
      setStatus((s) => (s ? { ...s, pending: d.pending ?? s.pending, linked: s.total - (d.pending ?? 0) } : s));

      // Nothing pushed and nothing pending → the mirror is up to date.
      if ((d.pending ?? 0) === 0 && (d.pushed ?? 0) === 0) break;
      if ((d.pending ?? 0) === 0 && (d.failed ?? 0) === 0 && (d.pushed ?? 0) < 50) break;
    }
    setRunning(false); setDone(true);
    setReload((n) => n + 1);
    onDone();
  };

  const blocked = status && (!status.configured || !status.migrated);

  return (
    <div onClick={running ? undefined : onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 620, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'rgba(14,11,7,0.98)', padding: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 700, color: cream }}>Sync the CRM into Close</div>
          <button onClick={onClose} disabled={running} style={{ background: 'none', border: 'none', color: creamFaint, fontSize: 20, cursor: running ? 'default' : 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ fontSize: 12, color: creamFaint, lineHeight: 1.6 }}>
          Pushes every lead to Close with its notes, tags and contact details, rebuilds each CRM pipeline
          as a Close pipeline with the same stages, and parks each lead on the stage it sits on here.
          Leads already in Close are updated, never duplicated — safe to run again any time.
        </div>

        {status && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stat label="Leads in CRM" value={status.total} />
            <Stat label="In Close" value={status.linked} />
            <Stat label="Not yet synced" value={status.pending} />
            {status.stale > 0 && <Stat label="Edited since sync" value={status.stale} />}
          </div>
        )}

        {status && !status.configured && (
          <div style={{ fontSize: 12, color: '#fbbf24', lineHeight: 1.6 }}>
            Close isn&apos;t configured — add <code>CLOSE_API_KEY</code> to your env before syncing.
          </div>
        )}
        {status && status.configured && !status.migrated && (
          <div style={{ fontSize: 12, color: '#fbbf24', lineHeight: 1.6 }}>
            {status.error || 'The Close columns are missing — run supabase/close_kit_integration.sql first.'}
          </div>
        )}

        {(running || done) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, color: cream, fontWeight: 600 }}>
              {running ? 'Syncing…' : 'Sync complete'}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Stat label="Added to Close" value={totals.created} />
              <Stat label="Updated" value={totals.updated} />
              {totals.failed > 0 && <Stat label="Failed" value={totals.failed} />}
            </div>
            {pipelines.created.length > 0 && (
              <div style={{ fontSize: 11.5, color: creamFaint }}>Pipelines created in Close: <strong style={{ color: cream }}>{pipelines.created.join(', ')}</strong></div>
            )}
            {pipelines.stages.length > 0 && (
              <div style={{ fontSize: 11.5, color: creamFaint }}>Stages added: <strong style={{ color: cream }}>{pipelines.stages.join(', ')}</strong></div>
            )}
            {totals.unplaced > 0 && (
              <div style={{ fontSize: 11.5, color: creamFaint }}>
                <strong style={{ color: cream }}>{totals.unplaced}</strong> lead(s) synced but not placed on a Close pipeline — their CRM stage no longer exists in their pipeline.
              </div>
            )}
            {errors.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#f87171' }}>
                {errors.slice(0, 6).map((e, i) => <div key={i}>{e}</div>)}
                {errors.length > 6 && <div style={{ color: creamFaint }}>+{errors.length - 6} more</div>}
              </div>
            )}
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: '#f87171' }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={run} disabled={running || !!blocked} style={{
            padding: '9px 18px', background: running || blocked ? 'rgba(201,164,85,0.2)' : gold, border: 'none', borderRadius: 8,
            color: running || blocked ? creamFaint : '#111', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700,
            cursor: running || blocked ? 'default' : 'pointer',
          }}>
            {running ? 'Syncing…' : done ? 'Sync again' : status?.pending ? `Sync ${status.pending} lead${status.pending === 1 ? '' : 's'} to Close` : 'Sync now'}
          </button>
          <button onClick={onClose} disabled={running} style={{
            padding: '9px 18px', background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
            color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: running ? 'default' : 'pointer',
          }}>Close</button>
        </div>
        <div style={{ fontSize: 10.5, color: 'rgba(240,232,212,0.35)', lineHeight: 1.6 }}>
          New leads sync on their own from here on — funnel opt-ins, applications and bookings push to Close the
          moment they land, and a sweep every 10 minutes catches anything else (CSV imports, IG DMs, edits).
        </div>
      </div>
    </div>
  );
}

function CsvImportModal({ pipelines, onClose, onDone }: {
  pipelines: Pipeline[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [fileName, setFileName] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageKey, setStageKey] = useState('');
  const [importing, setImporting] = useState(false);
  const [startFollowups, setStartFollowups] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; total: number; errors: string[]; skippedBreakdown?: { duplicatesInSheet: number; alreadyInCrm: number; other: number }; skippedExamples?: string[] } | null>(null);
  const [err, setErr] = useState('');

  // Default the target to the Freebie Leads pipeline / Opt-Ins stage.
  useEffect(() => {
    const freebie = pipelines.find((p) => /freebie/i.test(p.name)) || pipelines[0];
    if (freebie) {
      setPipelineId(freebie.id);
      const opt = freebie.stages.find((s) => /opt/i.test(s.label)) || freebie.stages[0];
      setStageKey(opt ? opt.key : '');
    }
  }, [pipelines]);

  const targetPipeline = pipelines.find((p) => p.id === pipelineId);

  const onFile = async (file: File) => {
    setErr(''); setResult(null);
    const text = await file.text();
    const matrix = parseCSV(text);
    if (matrix.length < 2) { setErr('That file has no data rows.'); return; }
    setFileName(file.name);
    setHeaders(matrix[0]);
    setRows(matrix.slice(1));
    setMapping(matrix[0].map(autoMapHeader));
  };

  // Turn a parsed row into a CRM import row using the current mapping.
  const buildRow = (row: string[]) => {
    const out: { name?: string; email?: string; whatsapp?: string; ig_handle?: string; revenue?: string; status?: string; makes_money?: string; tags: string[] } = { tags: [] };
    mapping.forEach((field, i) => {
      const v = (row[i] ?? '').trim();
      if (!v) return;
      switch (field) {
        case 'name': out.name = v; break;
        case 'email': out.email = v; break;
        case 'whatsapp': out.whatsapp = v; break;
        case 'ig_handle': out.ig_handle = v; break;
        case 'revenue': out.revenue = v; break;
        case 'makes_money': out.makes_money = isYes(v) ? 'Yes' : 'No'; break;
        case 'status_tag': {
          const low = v.toLowerCase();
          if (low.includes('disqual') || low === 'dq' || low === 'no') { out.status = 'DQ'; out.tags.push('disqualified'); }
          else if (low.includes('qual') || low === 'yes') { out.status = 'Qualified'; out.tags.push('qualified'); }
          else out.tags.push(v.toLowerCase());
          break;
        }
        case 'freebiesource_tag': out.tags.push(v); break;
        case 'tag': out.tags.push(v); break;
        default: break;
      }
    });
    out.tags = Array.from(new Set(out.tags));
    return out;
  };

  const runImport = async () => {
    setImporting(true); setErr('');
    const built = rows.map(buildRow);
    const res = await fetch('/api/crm/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_id: pipelineId || null, stage: stageKey, rows: built, start_followups: startFollowups }),
    });
    setImporting(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || 'Import failed'); return; }
    setResult(d);
    onDone();
  };

  const sel: React.CSSProperties = { padding: '7px 9px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer', outline: 'none' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 860, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'rgba(14,11,7,0.98)', padding: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 700, color: cream }}>Import leads from CSV</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: creamFaint, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 0' }}>
            <div style={{ fontSize: 14, color: cream }}>Import complete.</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Stat label="Added" value={result.inserted} />
              <Stat label="Merged into existing" value={result.updated} />
              <Stat label="Skipped" value={result.skipped} />
            </div>
            {result.skipped > 0 && result.skippedBreakdown && (
              <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12, color: cream, marginBottom: 8, fontWeight: 600 }}>Why {result.skipped} were skipped</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: creamFaint }}>
                  {result.skippedBreakdown.duplicatesInSheet > 0 && (
                    <div>• <strong style={{ color: cream }}>{result.skippedBreakdown.duplicatesInSheet}</strong> duplicate row(s) within your sheet (same IG handle or email appeared more than once — their info was merged into the one kept copy).</div>
                  )}
                  {result.skippedBreakdown.alreadyInCrm > 0 && (
                    <div>• <strong style={{ color: cream }}>{result.skippedBreakdown.alreadyInCrm}</strong> already in the CRM (handle already existed).</div>
                  )}
                  {result.skippedBreakdown.other > 0 && (
                    <div>• <strong style={{ color: cream }}>{result.skippedBreakdown.other}</strong> matched a lead already updated by another row in this import.</div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(240,232,212,0.4)', marginTop: 8 }}>No one was lost — skipped rows were either merged in or already present.</div>
                {result.skippedExamples && result.skippedExamples.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {result.skippedExamples.map((s, i) => (
                      <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', color: creamFaint }}>{s}</span>
                    ))}
                    {result.skipped > result.skippedExamples.length && (
                      <span style={{ fontSize: 10, color: 'rgba(240,232,212,0.3)' }}>+{result.skipped - result.skippedExamples.length} more</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {result.errors?.length > 0 && (
              <div style={{ fontSize: 11, color: '#ef4444' }}>{result.errors.join(' · ')}</div>
            )}
            <button onClick={onClose} style={{ alignSelf: 'flex-start', padding: '9px 18px', background: gold, border: 'none', borderRadius: 8, color: '#111', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Done</button>
          </div>
        ) : headers.length === 0 ? (
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 20px', border: '1.5px dashed rgba(201,164,85,0.3)', borderRadius: 12, cursor: 'pointer', background: 'rgba(201,164,85,0.03)' }}>
            <div style={{ fontSize: 32 }}>📄</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: cream }}>Choose a CSV file</div>
            <div style={{ fontSize: 11, color: creamFaint }}>First row must be column headers (name, email, phone, instagram, …)</div>
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </label>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: creamFaint }}>{fileName} · <strong style={{ color: cream }}>{rows.length}</strong> rows</span>
              <div style={{ flex: 1 }} />
              <label style={{ fontSize: 11, color: creamFaint, display: 'flex', alignItems: 'center', gap: 6 }}>
                Into pipeline
                <select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); const p = pipelines.find((x) => x.id === e.target.value); setStageKey(p?.stages[0]?.key || ''); }} style={sel}>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: creamFaint, display: 'flex', alignItems: 'center', gap: 6 }}>
                Stage
                <select value={stageKey} onChange={(e) => setStageKey(e.target.value)} style={sel}>
                  {(targetPipeline?.stages || []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {/* Opt in to the follow-up cadence — off by default so a bulk
                freebie list doesn't bury the setter's Due Today queue. */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', background: startFollowups ? 'rgba(201,164,85,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${startFollowups ? 'rgba(201,164,85,0.25)' : 'rgba(255,255,255,0.05)'}` }}>
              <input type="checkbox" checked={startFollowups} onChange={(e) => setStartFollowups(e.target.checked)} style={{ marginTop: 2, accentColor: '#c9a455' }} />
              <span style={{ fontSize: 11.5, color: cream, lineHeight: 1.5 }}>
                Start follow-ups on these leads
                <span style={{ color: creamFaint }}> — they enter the daily cadence and show up in Due Today from tomorrow. Leave off for a list you&apos;re only storing.</span>
              </span>
            </label>

            {/* Column mapping */}
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(240,232,212,0.35)' }}>Column mapping</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
              {headers.map((h, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 11, color: cream, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h || <em style={{ color: creamFaint }}>(blank)</em>}</span>
                  <select value={mapping[i]} onChange={(e) => setMapping((prev) => prev.map((m, idx) => idx === i ? e.target.value as ImportField : m))} style={sel}>
                    {(Object.keys(IMPORT_FIELD_LABELS) as ImportField[]).map((f) => <option key={f} value={f}>{IMPORT_FIELD_LABELS[f]}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(240,232,212,0.35)' }}>Preview (first 6)</div>
            <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                <thead>
                  <tr>{['Name', 'Email', 'Phone', 'IG', 'Revenue', 'Makes $', 'Status', 'Tags'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: creamFaint, fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 6).map((r, ri) => {
                    const b = buildRow(r);
                    return (
                      <tr key={ri}>
                        <td style={{ padding: '7px 10px', color: cream, whiteSpace: 'nowrap' }}>{b.name || '—'}</td>
                        <td style={{ padding: '7px 10px', color: creamFaint, whiteSpace: 'nowrap' }}>{b.email || '—'}</td>
                        <td style={{ padding: '7px 10px', color: creamFaint, whiteSpace: 'nowrap' }}>{b.whatsapp || '—'}</td>
                        <td style={{ padding: '7px 10px', color: creamFaint, whiteSpace: 'nowrap' }}>{b.ig_handle || '—'}</td>
                        <td style={{ padding: '7px 10px', color: creamFaint, whiteSpace: 'nowrap' }}>{b.revenue || '—'}</td>
                        <td style={{ padding: '7px 10px', color: creamFaint, whiteSpace: 'nowrap' }}>{b.makes_money || '—'}</td>
                        <td style={{ padding: '7px 10px', color: creamFaint, whiteSpace: 'nowrap' }}>{b.status || '—'}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {b.tags.map((t) => <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: `${tagColor(t)}1f`, color: tagColor(t) }}>{t}</span>)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {err && <div style={{ fontSize: 12, color: '#ef4444' }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setHeaders([]); setRows([]); setMapping([]); setFileName(''); }} style={{ padding: '9px 16px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer' }}>Choose different file</button>
              <button onClick={runImport} disabled={importing} style={{ padding: '9px 20px', background: gold, border: 'none', borderRadius: 8, color: '#111', fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {importing ? 'Importing…' : `Import ${rows.length} leads`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Setter follow-up system ─────────────────────────────────────────────
 * The setter's whole job: open Due Today, contact everyone in it, log what
 * happened. Every date is derived (lib/crm-followup.ts) — nothing is set by hand.
 */

/** Which one-click outcomes make sense for a lead in this stage. */
function actionsForStage(stage: string, stageLabel: string): SetterAction[] {
  const kind = stageKind(stage, stageLabel);
  // "Call Held" / "Showed" mean the call already happened — same buttons as booked.
  const held = kind !== 'reset' && /held|showed/i.test(`${stage} ${stageLabel}`);
  // On the calendar, or the call already happened → log the call's result.
  if (kind === 'booked' || held) return ['closed', 'follow_up_call', 'dq', 'no_show', 'cancelled', 'rescheduled'];
  // Still working the lead (New / Contacted / Nurturing / No Show / Cancelled).
  return ['contacted', 'booked', 'dq'];
}

const ACTION_COLORS: Record<SetterAction, string> = {
  contacted: 'rgba(143,208,255,0.85)',
  booked: '#4ade80',
  rescheduled: '#8FD0FF',
  no_show: '#F0826D',
  cancelled: '#F0826D',
  closed: '#4ade80',
  follow_up_call: '#F5E6A3',
  dq: '#f97316',
};

/**
 * The setter's action row: log the outcome, or log a touch. Both re-stamp Last
 * Activity server-side, which rolls the next follow-up date and drops the lead
 * out of Due Today until it's due again.
 */
function SetterActions({ lead, stages, stageLabel, busy, onStage, onLogFollowUp, compact }: {
  lead: CRMLead;
  stages: PipelineStage[];
  stageLabel: string;
  busy: boolean;
  onStage: (stageKey: string) => void;
  onLogFollowUp: () => void;
  compact?: boolean;
}) {
  const wanted = actionsForStage(lead.stage, stageLabel);
  const available = wanted
    .map((a) => ({ action: a, key: findStageKey(stages, a) }))
    .filter((x): x is { action: SetterAction; key: string } => !!x.key);
  const missing = wanted.length - available.length;

  const btn = (color: string): React.CSSProperties => ({
    padding: compact ? '5px 10px' : '7px 12px', borderRadius: 7, cursor: busy ? 'default' : 'pointer',
    background: `${color}14`, border: `1px solid ${color}44`, color,
    fontFamily: "'DM Sans', sans-serif", fontSize: compact ? 10.5 : 11.5, fontWeight: 600,
    letterSpacing: '0.02em', opacity: busy ? 0.5 : 1, whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
      <button
        onClick={(e) => { e.stopPropagation(); onLogFollowUp(); }}
        disabled={busy}
        title="Logs a touch and rolls the next follow-up date — no stage change"
        style={btn('rgba(240,232,212,0.6)')}
      >↻ Log Follow-Up</button>
      {available.map(({ action, key }) => (
        <button
          key={action}
          onClick={(e) => { e.stopPropagation(); onStage(key); }}
          disabled={busy}
          style={btn(ACTION_COLORS[action])}
        >{ACTION_LABELS[action]}</button>
      ))}
      {missing > 0 && (
        <span
          title="Run supabase-crm-followup-cadence.sql to add the Rescheduled / No Show / Cancelled / Follow-Up Call / DQ stages to this pipeline"
          style={{ fontSize: 10, color: 'rgba(240,232,212,0.3)' }}
        >+{missing} stage{missing === 1 ? '' : 's'} missing</span>
      )}
    </div>
  );
}

/** Click-to-contact. The Dial button places the call in the browser softphone. */
function ContactLinks({ lead, compact, softphone, onDialEnd }: {
  lead: CRMLead; compact?: boolean; softphone?: Softphone; onDialEnd?: (leadId: string) => void;
}) {
  const phone = (lead.whatsapp || '').replace(/[^0-9+]/g, '');
  const digits = phone.replace(/\D/g, '');
  const link: React.CSSProperties = {
    padding: compact ? '4px 9px' : '6px 11px', borderRadius: 7, textDecoration: 'none',
    border: '1px solid rgba(255,255,255,0.1)', color: creamFaint,
    fontFamily: "'DM Sans', sans-serif", fontSize: compact ? 10.5 : 11.5, whiteSpace: 'nowrap',
  };
  // The stored number must carry its own country code — we never guess one for a
  // lead, because a wrong guess dials a stranger.
  const e164 = buildE164(lead.whatsapp || '', '');
  const dialable = !!e164 && !!softphone && softphone.state === 'idle';
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
      {!!softphone && !!e164 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            softphone.dial(e164, {
              leadId: lead.id, label: leadLabel(lead),
              onEnd: () => onDialEnd?.(lead.id),
            });
          }}
          disabled={!dialable}
          title={dialable ? `Dial ${e164}` : softphone.state === 'idle' ? 'Dialer not ready' : 'Already on a call'}
          style={{
            ...link, cursor: dialable ? 'pointer' : 'default',
            color: '#4ade80', borderColor: 'rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.08)',
            fontWeight: 600, opacity: dialable ? 1 : 0.45,
          }}
        >📞 Dial</button>
      )}
      {!!softphone && !e164 && digits.length > 5 && (
        <span title="Number has no country code — edit the lead and store it as +1…, +44… to dial from here"
          style={{ ...link, color: 'rgba(251,191,36,0.75)', borderColor: 'rgba(251,191,36,0.25)' }}>no country code</span>
      )}
      {digits.length > 5 && lead.has_whatsapp && (
        <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          style={{ ...link, color: 'rgba(74,222,128,0.85)', borderColor: 'rgba(74,222,128,0.25)' }}>WhatsApp</a>
      )}
      {digits.length > 5 && !softphone && (
        <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()} style={link}>☎ Call</a>
      )}
      {lead.ig_handle && (
        <a href={`https://instagram.com/${lead.ig_handle.replace(/^@+/, '')}`} target="_blank" rel="noreferrer"
          onClick={(e) => e.stopPropagation()} style={link}>IG DM</a>
      )}
      {lead.email && (
        <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()} style={link}>✉ Email</a>
      )}
    </div>
  );
}

/** Read-only view of everything the cadence is derived from. */
function CadencePanel({ lead, stageLabel }: { lead: CRMLead; stageLabel: string }) {
  const c = cadenceFor(lead, stageLabel);
  const row = (label: string, value: React.ReactNode, color?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0' }}>
      <span style={{ fontSize: 10.5, color: 'rgba(240,232,212,0.4)' }}>{label}</span>
      <span style={{ fontSize: 11, color: color || 'rgba(240,232,212,0.85)', textAlign: 'right' as const }}>{value}</span>
    </div>
  );
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const due = isDue(lead.next_followup_at);

  return (
    <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.5)', marginBottom: 6 }}>
        Follow-up cadence
      </div>
      {row('Created', `${fmtDay(lead.created_at)} · day ${c.ageDays}`)}
      {row('Last activity', fmtDay(c.lastActivityAt))}
      {row('Follow-up?', c.followUp ? 'Yes' : `No · ${c.kind === 'booked' ? 'on the calendar' : 'closed out'}`,
        c.followUp ? '#4ade80' : 'rgba(240,232,212,0.5)')}
      {c.followUp && row('Cadence', CADENCE_LABELS[c.bucket ?? 'daily'], c.resetActive ? '#F0826D' : undefined)}
      {c.resetActive && row('Reset window', `${c.resetDaysLeft} day${c.resetDaysLeft === 1 ? '' : 's'} left of daily`, '#F0826D')}
      {row('Next follow-up',
        lead.next_followup_at ? (due ? `${fmtDay(lead.next_followup_at)} · due now` : fmtDay(lead.next_followup_at)) : '—',
        due ? '#ef4444' : gold)}
    </div>
  );
}

function CRMView() {
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [crmSub, setCrmSub] = useState<'leads' | 'assistant'>('leads');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CRMLead | null>(null);
  const [touchpoints, setTouchpoints] = useState<CRMTouchpoint[]>([]);
  const [tpLoading, setTpLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [crmTab, setCrmTab] = useState<'queue' | 'pipeline' | 'all'>('queue');
  const [busyLead, setBusyLead] = useState('');       // lead id mid-action
  const [showUpcoming, setShowUpcoming] = useState(false);

  // Browser softphone — one Device for the whole CRM session.
  const softphone = useSoftphone();

  // Pipelines
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipeline, setActivePipeline] = useState<string>('');   // kanban selection
  const [tagFilter, setTagFilter] = useState('');                      // All-leads tag filter
  const [pipeFilter, setPipeFilter] = useState('');                    // All-leads pipeline filter
  const [kbSearch, setKbSearch] = useState('');                        // kanban search
  const [kbTag, setKbTag] = useState('');                              // kanban tag filter
  const [kbStatus, setKbStatus] = useState('');                        // kanban status filter
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);   // native DnD
  const [dropStage, setDropStage] = useState<string | null>(null);     // hovered column

  // Pipeline editor modal
  const [showPipeEditor, setShowPipeEditor] = useState(false);
  const [editPipe, setEditPipe] = useState<Pipeline | null>(null);     // null = new

  // CSV import modal
  const [showImport, setShowImport] = useState(false);
  // Bulk "mirror the CRM into Close" modal
  const [showCloseSync, setShowCloseSync] = useState(false);

  // Add/edit lead form
  const [showForm, setShowForm] = useState(false);
  const [formIg, setFormIg] = useState('');
  const [formWa, setFormWa] = useState('');
  const [formHasWa, setFormHasWa] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSource, setFormSource] = useState('ig_dm');
  const [formTier, setFormTier] = useState('');
  const [formStatus, setFormStatus] = useState('');
  const [formRevenue, setFormRevenue] = useState('');
  const [formBusiness, setFormBusiness] = useState('');
  const [formMakesMoney, setFormMakesMoney] = useState('');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formPipeline, setFormPipeline] = useState('');
  const [formDials, setFormDials] = useState('');
  const [formStage, setFormStage] = useState('new');
  const [formFollowup, setFormFollowup] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // Touchpoint form
  const [tpContent, setTpContent] = useState('');
  const [tpChannel, setTpChannel] = useState('ig_dm');
  const [tpDirection, setTpDirection] = useState('outbound');
  const [tpSaving, setTpSaving] = useState(false);

  // Inline dials editor (lives in the lead drawer). The draft is seeded from the
  // lead whenever selection or the saved count changes (see selectLead/patchDials/saveLead).
  const [dialsDraft, setDialsDraft] = useState('');
  const [dialsSaving, setDialsSaving] = useState(false);
  const seedDials = (l: CRMLead | null) => setDialsDraft(l?.dials_made != null ? String(l.dials_made) : '');

  const load = () => {
    setLoading(true);
    fetch('/api/crm/leads').then((r) => r.ok ? r.json() : []).then((d) => setLeads(d || [])).finally(() => setLoading(false));
  };

  const loadPipelines = () => {
    fetch('/api/crm/pipelines').then((r) => r.ok ? r.json() : []).then((d: Pipeline[]) => {
      setPipelines(d || []);
      setActivePipeline((cur) => cur || (d && d[0] ? d[0].id : ''));
    });
  };

  useEffect(() => { load(); loadPipelines(); }, []);

  // Lookups derived from the loaded pipelines.
  const pipeMap = useMemo(() => new Map(pipelines.map((p) => [p.id, p])), [pipelines]);
  const stageMeta = (l: CRMLead) => stageMetaFor(l, pipeMap);
  // Stages available for a given pipeline id (falls back to the global sales stages).
  const stagesForPipeline = (pid: string | null): PipelineStage[] => {
    const p = pid ? pipeMap.get(pid) : null;
    if (p) return p.stages;
    return STAGES.map((s) => ({ key: s, label: STAGE_LABELS[s], color: STAGE_COLORS[s] }));
  };
  // All tags present across leads (for the filter dropdown).
  const allTags = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => (l.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [leads]);

  const loadTouchpoints = (leadId: string) => {
    setTpLoading(true);
    fetch(`/api/crm/touchpoints?lead_id=${leadId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setTouchpoints(d || []))
      .finally(() => setTpLoading(false));
  };

  const selectLead = (l: CRMLead) => { setSelected(l); seedDials(l); loadTouchpoints(l.id); };

  const resetForm = () => {
    setShowForm(false); setFormIg(''); setFormWa(''); setFormHasWa(false); setFormName(''); setFormEmail('');
    setFormSource('ig_dm'); setFormTier(''); setFormStatus(''); setFormRevenue(''); setFormBusiness(''); setFormMakesMoney(''); setFormDials('');
    setFormTags([]); setFormPipeline(''); setFormStage('new'); setFormFollowup(''); setFormNotes(''); setFormErr('');
  };

  const openEdit = (l: CRMLead) => {
    setFormIg(l.ig_handle || ''); setFormWa(l.whatsapp || ''); setFormHasWa(l.has_whatsapp);
    setFormName(l.name || ''); setFormEmail(l.email || ''); setFormSource(l.source || 'ig_dm'); setFormTier(l.icp_tier || '');
    setFormStatus(l.status || ''); setFormRevenue(l.revenue || ''); setFormBusiness(l.business || ''); setFormMakesMoney(l.makes_money || ''); setFormDials(l.dials_made != null ? String(l.dials_made) : '');
    setFormTags(l.tags || []); setFormPipeline(l.pipeline_id || '');
    setFormStage(l.stage); setFormFollowup(l.next_followup_at ? l.next_followup_at.slice(0, 10) : '');
    setFormNotes(l.notes || ''); setFormErr(''); setShowForm(true);
  };

  const saveLead = async () => {
    if (!formIg.trim() && !formWa.trim() && !formName.trim() && !formEmail.trim()) {
      setFormErr('Enter IG handle, WhatsApp, name, or email'); return;
    }
    setFormSaving(true); setFormErr('');
    const body = {
      ig_handle: formIg.trim() || null, whatsapp: formWa.trim() || null,
      has_whatsapp: formHasWa, name: formName.trim() || null, email: formEmail.trim() || null,
      source: formSource, icp_tier: formTier || null, stage: formStage,
      status: formStatus || null, revenue: formRevenue || null, business: formBusiness || null,
      makes_money: formMakesMoney || null,
      tags: formTags, pipeline_id: formPipeline || null,
      dials_made: formDials.trim() ? parseInt(formDials, 10) : null,
      next_followup_at: formFollowup ? new Date(formFollowup + 'T09:00:00').toISOString() : null,
      notes: formNotes.trim() || null,
    };
    const url = selected && showForm ? `/api/crm/leads/${selected.id}` : '/api/crm/leads';
    const method = selected && showForm ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setFormSaving(false);
    if (res.ok) {
      const updated = await res.json();
      if (selected && showForm) { setSelected(updated); seedDials(updated); setLeads((prev) => prev.map((l) => l.id === updated.id ? updated : l)); }
      else { setLeads((prev) => [updated, ...prev]); }
      resetForm();
    } else {
      const d = await res.json().catch(() => ({}));
      setFormErr(d.error || 'Save failed');
    }
  };

  const deleteLead = async (id: string) => {
    await fetch(`/api/crm/leads/${id}`, { method: 'DELETE' });
    setLeads((prev) => prev.filter((l) => l.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  // Generic partial update with optimistic UI + rollback on failure.
  const patchLead = async (l: CRMLead, patch: Partial<CRMLead>) => {
    const prevLead = l;
    const optimistic = { ...l, ...patch } as CRMLead;
    setLeads((prev) => prev.map((x) => x.id === l.id ? optimistic : x));
    if (selected?.id === l.id) setSelected(optimistic);
    const res = await fetch(`/api/crm/leads/${l.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setLeads((prev) => prev.map((x) => x.id === l.id ? updated : x));
      if (selected?.id === l.id) setSelected(updated);
    } else {
      // Roll back.
      setLeads((prev) => prev.map((x) => x.id === l.id ? prevLead : x));
      if (selected?.id === l.id) setSelected(prevLead);
    }
  };

  const patchStage = (l: CRMLead, stage: string) => patchLead(l, { stage });

  // Move a lead to another pipeline, resetting to that pipeline's first stage.
  const movePipeline = (l: CRMLead, pipelineId: string) => {
    const first = stagesForPipeline(pipelineId || null)[0];
    patchLead(l, { pipeline_id: pipelineId || null, stage: first ? first.key : l.stage });
  };

  const patchTags = (l: CRMLead, tags: string[]) => patchLead(l, { tags });

  // ── Native HTML5 drag-and-drop between kanban columns ──
  const onCardDragStart = (e: React.DragEvent, l: CRMLead) => {
    setDragLeadId(l.id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', l.id); } catch {}
  };
  const onColumnDrop = (stageKey: string) => {
    const l = leads.find((x) => x.id === dragLeadId);
    setDragLeadId(null); setDropStage(null);
    if (l && l.stage !== stageKey) patchStage(l, stageKey);
  };

  // ── Pipeline create / edit / delete ──
  const savePipeline = async (name: string, stages: PipelineStage[], id?: string): Promise<string | null> => {
    const res = await fetch(id ? `/api/crm/pipelines/${id}` : '/api/crm/pipelines', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stages }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); return d.error || 'Save failed'; }
    const saved: Pipeline = await res.json();
    setPipelines((prev) => id ? prev.map((p) => p.id === saved.id ? saved : p) : [...prev, saved]);
    if (!id) setActivePipeline(saved.id);
    return null;
  };

  const deletePipeline = async (id: string) => {
    const inUse = leads.filter((l) => l.pipeline_id === id).length;
    if (!confirm(inUse
      ? `Delete this pipeline? ${inUse} lead(s) will stay in the CRM but become unassigned (still visible under All Leads).`
      : 'Delete this pipeline?')) return;
    const res = await fetch(`/api/crm/pipelines/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setPipelines((prev) => prev.filter((p) => p.id !== id));
      setLeads((prev) => prev.map((l) => l.pipeline_id === id ? { ...l, pipeline_id: null } : l));
      setActivePipeline((cur) => cur === id ? (pipelines.find((p) => p.id !== id)?.id || '') : cur);
    }
  };

  const patchDials = async (value: number | null) => {
    if (!selected) return;
    setDialsSaving(true);
    const res = await fetch(`/api/crm/leads/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dials_made: value }),
    });
    setDialsSaving(false);
    if (res.ok) {
      const updated = await res.json();
      setSelected(updated);
      seedDials(updated);
      setLeads((prev) => prev.map((l) => l.id === updated.id ? updated : l));
    }
  };

  const addTouchpoint = async () => {
    if (!selected || !tpContent.trim()) return;
    setTpSaving(true);
    const res = await fetch('/api/crm/touchpoints', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: selected.id, channel: tpChannel, direction: tpDirection, content: tpContent.trim() }),
    });
    setTpSaving(false);
    if (res.ok) { setTpContent(''); loadTouchpoints(selected.id); }
  };

  const deleteTp = async (id: string) => {
    await fetch(`/api/crm/touchpoints/${id}`, { method: 'DELETE' });
    setTouchpoints((prev) => prev.filter((t) => t.id !== id));
  };

  const runAI = async () => {
    if (!selected) return;
    setAiLoading(true);
    const res = await fetch('/api/crm/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: selected.id }),
    });
    setAiLoading(false);
    if (res.ok) {
      const d = await res.json();
      const updated = { ...selected, ai_summary: d.summary, ai_next_move: d.next_move };
      setSelected(updated);
      setLeads((prev) => prev.map((l) => l.id === selected.id ? updated : l));
    }
  };

  const visible = leads.filter((l) => {
    const matchPipe = !pipeFilter || l.pipeline_id === pipeFilter;
    const matchTag = !tagFilter || (l.tags || []).includes(tagFilter);
    const q = search.toLowerCase();
    const matchSearch = !search ||
      (l.ig_handle || '').toLowerCase().includes(q) ||
      (l.name || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.whatsapp || '').includes(search);
    return matchPipe && matchTag && matchSearch;
  });

  // ── The setter's working set ──
  // "Follow-Up? = Yes AND Next Follow-Up Date ≤ today". A follow-up is due for the
  // whole calendar day it lands on, and stages that clear follow-ups (Call Booked,
  // Rescheduled, Closed, DQ) drop out no matter what date is stored.
  const dueToday = leads.filter((l) => cadenceFor(l, stageMeta(l).label).followUp && isDue(l.next_followup_at));
  const upcoming = leads
    .filter((l) => cadenceFor(l, stageMeta(l).label).followUp && l.next_followup_at && !isDue(l.next_followup_at))
    .sort((a, b) => (a.next_followup_at || '').localeCompare(b.next_followup_at || ''));

  // Stamp a touch without changing the stage — the server rolls the next date.
  const logActivity = async (l: CRMLead) => {
    setBusyLead(l.id);
    const res = await fetch(`/api/crm/leads/${l.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log_activity: true }),
    });
    setBusyLead('');
    if (res.ok) {
      const updated: CRMLead = await res.json();
      setLeads((prev) => prev.map((x) => x.id === updated.id ? updated : x));
      if (selected?.id === updated.id) setSelected(updated);
    }
  };

  const markStage = async (l: CRMLead, stageKey: string) => {
    setBusyLead(l.id);
    await patchLead(l, { stage: stageKey });
    setBusyLead('');
  };

  // Pull one lead again — used after a dial, where the server rolled the
  // follow-up date and bumped Dials Made from Twilio's status callback.
  const refreshLead = async (id: string) => {
    const res = await fetch(`/api/crm/leads/${id}`);
    if (!res.ok) return;
    const updated: CRMLead = await res.json();
    setLeads((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    if (selected?.id === updated.id) setSelected(updated);
  };

  // What the list dialer walks: the visible set of the tab you're on.
  const dialQueue: QueueItem[] = (crmTab === 'all' ? visible : dueToday)
    .filter((l) => !!l.whatsapp)
    .map((l) => ({ leadId: l.id, label: leadLabel(l), number: l.whatsapp || '' }));

  const iStyle: React.CSSProperties = {
    padding: '9px 11px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 12, outline: 'none', boxSizing: 'border-box',
  };
  const selStyle: React.CSSProperties = { ...iStyle, cursor: 'pointer' };

  // Stats
  const wonCount = leads.filter((l) => l.stage === 'closed_won').length;
  const activeCount = leads.filter((l) => !['closed_won', 'closed_lost', 'ghosted'].includes(l.stage)).length;

  const crmToggle = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
      {([['leads', 'Leads'], ['assistant', 'AI Assistant']] as const).map(([v, lbl]) => (
        <button key={v} onClick={() => setCrmSub(v)} style={{
          padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: '0.06em',
          background: crmSub === v ? 'rgba(201,164,85,0.12)' : 'transparent',
          border: `1px solid ${crmSub === v ? 'rgba(201,164,85,0.3)' : 'rgba(255,255,255,0.08)'}`,
          color: crmSub === v ? gold : creamFaint,
        }}>{lbl}</button>
      ))}
    </div>
  );

  // The dialer follows you across CRM sub-views so an in-progress call can never
  // lose its hang-up button.
  const dialer = (
    <DialerPanel
      phone={softphone}
      queue={dialQueue}
      onSelectLead={(id) => { const l = leads.find((x) => x.id === id); if (l) selectLead(l); }}
      onCallEnded={(id) => { if (id) refreshLead(id); }}
    />
  );

  if (crmSub === 'assistant') {
    return (<div>{crmToggle}<CrmAssistantView />{dialer}</div>);
  }

  return (
    <div>
      {crmToggle}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Left panel */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* ── CRM Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 20, fontWeight: 700, color: cream, letterSpacing: '-0.01em' }}>
              COMMAND QUEUE
            </div>
            <div style={{ fontSize: 11, color: creamFaint, marginTop: 2 }}>Never miss a follow-up</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowImport(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', background: 'rgba(201,164,85,0.08)', border: '1px solid rgba(201,164,85,0.25)',
              borderRadius: 8, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 12,
              fontWeight: 700, cursor: 'pointer',
            }}>↑ Import CSV</button>
            <button onClick={() => setShowCloseSync(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', background: 'rgba(143,208,255,0.08)', border: '1px solid rgba(143,208,255,0.25)',
              borderRadius: 8, color: '#8FD0FF', fontFamily: "'DM Sans', sans-serif", fontSize: 12,
              fontWeight: 700, cursor: 'pointer',
            }}>⇄ Sync to Close</button>
            <button onClick={() => { setSelected(null); resetForm(); if (activePipeline) setFormPipeline(activePipeline); setShowForm(true); }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', background: gold, border: 'none',
              borderRadius: 8, color: '#111', fontFamily: "'DM Sans', sans-serif", fontSize: 12,
              fontWeight: 700, cursor: 'pointer',
            }}>+ Add Lead</button>
          </div>
        </div>

        {/* ── Modals ── */}
        {showImport && (
          <CsvImportModal pipelines={pipelines} onClose={() => setShowImport(false)} onDone={load} />
        )}
        {showCloseSync && (
          <CloseSyncModal onClose={() => setShowCloseSync(false)} onDone={load} />
        )}
        {showPipeEditor && (
          <PipelineEditorModal pipeline={editPipe} onClose={() => { setShowPipeEditor(false); setEditPipe(null); }} onSave={savePipeline} />
        )}

        {/* ── Stats row ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const }}>
          <Stat label="Total Leads" value={leads.length} />
          <Stat label="Active Pipeline" value={activeCount} />
          <Stat label="Closed Won" value={wonCount} />
          <Stat label="Due Today" value={dueToday.length} />
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            ['queue', `Due Today (${dueToday.length})`],
            ['pipeline', 'Pipeline'],
            ['all', `All Leads (${leads.length})`],
          ] as const).map(([t, label]) => (
            <button key={t} onClick={() => setCrmTab(t)} style={{
              padding: '8px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              color: crmTab === t ? gold : creamFaint,
              borderBottom: `2px solid ${crmTab === t ? gold : 'transparent'}`,
              marginBottom: -1,
              fontWeight: crmTab === t ? 700 : 400,
            }}>{label}</button>
          ))}
        </div>

        {/* ── Add/Edit form (all tabs) ── */}
        {showForm && (
          <div style={{ ...card, padding: '16px 18px', marginBottom: 16, borderColor: 'rgba(201,164,85,0.15)' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.6)', marginBottom: 12 }}>
              {selected ? 'Edit lead' : 'Add lead'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input value={formIg} onChange={(e) => setFormIg(e.target.value)} placeholder="IG handle (without @)" style={iStyle} />
              <input value={formWa} onChange={(e) => setFormWa(e.target.value)} placeholder="Phone / WhatsApp" style={iStyle} />
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Name" style={iStyle} />
              <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="Email" style={iStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <select value={formPipeline} onChange={(e) => {
                const pid = e.target.value; setFormPipeline(pid);
                const st = stagesForPipeline(pid || null);
                if (!st.some((s) => s.key === formStage)) setFormStage(st[0]?.key || 'new');
              }} style={selStyle}>
                <option value="">No pipeline</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={formStage} onChange={(e) => setFormStage(e.target.value)} style={selStyle}>
                {stagesForPipeline(formPipeline || null).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select value={formSource} onChange={(e) => setFormSource(e.target.value)} style={selStyle}>
                {SOURCES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
              <input type="date" value={formFollowup} onChange={(e) => setFormFollowup(e.target.value)} title="Follow-up date" style={iStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} style={selStyle}>
                <option value="">Status</option>
                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={formRevenue} onChange={(e) => setFormRevenue(e.target.value)} style={selStyle}>
                <option value="">Revenue</option>
                {REVENUE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={formBusiness} onChange={(e) => setFormBusiness(e.target.value)} style={selStyle}>
                <option value="">Business</option>
                {BUSINESS_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={formTier} onChange={(e) => setFormTier(e.target.value)} style={selStyle}>
                <option value="">ICP tier</option>
                {ICP_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px', gap: 8, marginBottom: 8, alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(240,232,212,0.3)', marginBottom: 4 }}>Tags</div>
                <TagEditor tags={formTags} onChange={setFormTags} />
              </div>
              <div>
                <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(240,232,212,0.3)', marginBottom: 4 }}>Makes money?</div>
                <select value={formMakesMoney} onChange={(e) => setFormMakesMoney(e.target.value)} style={{ ...selStyle, width: '100%' }}>
                  <option value="">—</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(240,232,212,0.3)', marginBottom: 4 }}>Dials</div>
                <input
                  value={formDials}
                  onChange={(e) => setFormDials(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  placeholder="0"
                  title="Dials made (numbers only)"
                  style={{ ...iStyle, width: '100%' }}
                />
              </div>
            </div>
            <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Notes…" rows={2}
              style={{ ...iStyle, width: '100%', resize: 'vertical' as const, marginBottom: 8 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: creamFaint, cursor: 'pointer' }}>
                <input type="checkbox" checked={formHasWa} onChange={(e) => setFormHasWa(e.target.checked)} />
                Has WhatsApp
              </label>
              <button onClick={saveLead} disabled={formSaving} style={{
                padding: '9px 18px', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)',
                borderRadius: 8, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                letterSpacing: '0.1em', textTransform: 'uppercase' as const, cursor: 'pointer',
              }}>{formSaving ? 'Saving…' : selected ? 'Save Changes' : 'Add Lead'}</button>
              <button onClick={resetForm} style={{
                padding: '9px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 11, cursor: 'pointer',
              }}>Cancel</button>
              {formErr && <span style={{ fontSize: 11, color: '#ef4444' }}>{formErr}</span>}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center' as const, color: creamFaint, fontSize: 12 }}>Loading leads…</div>
        ) : (
          <>
            {/* ── DUE TODAY TAB ──
                The setter's entire morning: everyone in this list gets contacted
                today, and each row logs its own outcome. Overdue sits at the top;
                nothing here needs a date to be picked by hand. */}
            {crmTab === 'queue' && (() => {
              // Overdue = due on a day BEFORE today (i.e. already due as of yesterday).
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const overdueOf = (l: CRMLead) => isDue(l.next_followup_at, yesterday);
              const sorted = [...dueToday].sort((a, b) => (a.next_followup_at || '').localeCompare(b.next_followup_at || ''));

              const row = (l: CRMLead, overdue: boolean) => {
                const isSelected = selected?.id === l.id;
                const sm = stageMeta(l);
                const c = cadenceFor(l, sm.label);
                const busy = busyLead === l.id;
                return (
                  <div key={l.id} onClick={() => selectLead(l)} style={{
                    padding: '13px 16px', borderRadius: 10, cursor: 'pointer', marginBottom: 6,
                    background: isSelected ? 'rgba(201,164,85,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'rgba(201,164,85,0.25)' : 'rgba(255,255,255,0.05)'}`,
                    transition: 'background 0.12s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' as const }}>
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: cream }}>
                            {leadLabel(l)}
                          </span>
                          <span style={{
                            padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                            background: `${sm.color}22`, color: sm.color || creamFaint,
                            border: `1px solid ${sm.color}44`,
                          }}>{sm.label}</span>
                          {l.status && (
                            <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 9, color: STATUS_COLORS[l.status] || creamFaint, border: `1px solid ${STATUS_COLORS[l.status] || 'rgba(255,255,255,0.1)'}` }}>{l.status}</span>
                          )}
                          <span style={{ fontSize: 10, color: 'rgba(240,232,212,0.35)' }}>
                            day {c.ageDays} · {c.resetActive ? 'daily (reset)' : c.everyDays === 1 ? 'daily' : `every ${c.everyDays}d`}
                          </span>
                          {overdue && l.next_followup_at && (
                            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                              Overdue {crmFmt(l.next_followup_at)}
                            </span>
                          )}
                        </div>
                        {l.ai_next_move && (
                          <div style={{ fontSize: 11.5, color: 'rgba(240,232,212,0.55)', lineHeight: 1.45, marginBottom: 7 }}>
                            {l.ai_next_move}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                          <ContactLinks lead={l} compact softphone={softphone} onDialEnd={refreshLead} />
                          <SetterActions
                            lead={l} stages={stagesForPipeline(l.pipeline_id)} stageLabel={sm.label} busy={busy}
                            onStage={(key) => markStage(l, key)}
                            onLogFollowUp={() => logActivity(l)}
                            compact
                          />
                        </div>
                      </div>
                      <span style={{ color: creamFaint, fontSize: 14, flexShrink: 0 }}>›</span>
                    </div>
                  </div>
                );
              };

              const overdueLeads = sorted.filter((l) => overdueOf(l));
              const todayLeads = sorted.filter((l) => !overdueOf(l));

              return (
                <div>
                  <div style={{ fontSize: 11, color: creamFaint, marginBottom: 14, lineHeight: 1.6 }}>
                    Everyone here gets contacted today. Log what happened and the lead leaves the
                    list — the next date is worked out for you (daily for the first week, every 3 days
                    to day 21, weekly after that; a no-show or cancel resets to daily for 7 days).
                  </div>

                  {sorted.length === 0 ? (
                    <div style={{ padding: '48px 0', textAlign: 'center' as const, color: creamFaint, fontSize: 13 }}>
                      Nothing due today. {upcoming.length > 0 ? `${upcoming.length} lead${upcoming.length === 1 ? '' : 's'} scheduled ahead.` : 'Add a lead to start the cadence.'}
                    </div>
                  ) : (
                    <>
                      {overdueLeads.length > 0 && (
                        <>
                          <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: '#ef4444', padding: '4px 0 8px', fontWeight: 700 }}>
                            Overdue ({overdueLeads.length})
                          </div>
                          {overdueLeads.map((l) => row(l, true))}
                        </>
                      )}
                      {todayLeads.length > 0 && (
                        <>
                          <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: gold, padding: '14px 0 8px', fontWeight: 700 }}>
                            Due today ({todayLeads.length})
                          </div>
                          {todayLeads.map((l) => row(l, false))}
                        </>
                      )}
                    </>
                  )}

                  {/* Everything scheduled ahead — visible, but not today's job. */}
                  {upcoming.length > 0 && (
                    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <button onClick={() => setShowUpcoming((v) => !v)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint,
                        letterSpacing: '0.1em', textTransform: 'uppercase' as const,
                      }}>{showUpcoming ? '▾' : '▸'} Upcoming ({upcoming.length})</button>
                      {showUpcoming && (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
                          {upcoming.map((l) => (
                            <div key={l.id} onClick={() => selectLead(l)} style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
                              cursor: 'pointer', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)',
                            }}>
                              <span style={{ fontSize: 12.5, color: cream, flex: 1, minWidth: 0 }}>{leadLabel(l)}</span>
                              <span style={{ fontSize: 10, color: stageMeta(l).color || creamFaint }}>{stageMeta(l).label}</span>
                              <span style={{ fontSize: 10.5, color: creamFaint }}>{l.next_followup_at ? crmFmt(l.next_followup_at) : '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── PIPELINE KANBAN TAB ── */}
            {crmTab === 'pipeline' && (() => {
              const pipe = pipeMap.get(activePipeline) || pipelines[0] || null;
              const stages = pipe ? pipe.stages : [];
              // Apply the kanban search + tag/status filters to the active pipeline's leads.
              const kbQ = kbSearch.trim().toLowerCase();
              const kbActive = !!(kbQ || kbTag || kbStatus);
              const kbLeads = pipe ? leads.filter((l) =>
                l.pipeline_id === pipe.id &&
                (!kbTag || (l.tags || []).includes(kbTag)) &&
                (!kbStatus || l.status === kbStatus) &&
                (!kbQ ||
                  (l.name || '').toLowerCase().includes(kbQ) ||
                  (l.ig_handle || '').toLowerCase().includes(kbQ) ||
                  (l.email || '').toLowerCase().includes(kbQ) ||
                  (l.whatsapp || '').toLowerCase().includes(kbQ))
              ) : [];
              const pill = (active: boolean): React.CSSProperties => ({
                padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                background: active ? 'rgba(201,164,85,0.14)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${active ? 'rgba(201,164,85,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: active ? gold : creamFaint, whiteSpace: 'nowrap',
              });
              const ghost: React.CSSProperties = {
                padding: '7px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: creamFaint, whiteSpace: 'nowrap',
              };
              return (
                <div>
                  {/* Pipeline selector bar */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' as const }}>
                    {pipelines.map((p) => (
                      <button key={p.id} onClick={() => setActivePipeline(p.id)} style={pill(pipe?.id === p.id)}>
                        {p.name} <span style={{ opacity: 0.6 }}>· {leads.filter((l) => l.pipeline_id === p.id).length}</span>
                      </button>
                    ))}
                    <button onClick={() => { setEditPipe(null); setShowPipeEditor(true); }} style={{ ...ghost, color: gold, borderColor: 'rgba(201,164,85,0.3)', borderStyle: 'dashed' }}>+ New pipeline</button>
                    <div style={{ flex: 1 }} />
                    {pipe && (
                      <>
                        <button onClick={() => { setEditPipe(pipe); setShowPipeEditor(true); }} style={ghost}>Edit stages</button>
                        <button onClick={() => deletePipeline(pipe.id)} style={{ ...ghost, color: 'rgba(239,68,68,0.7)' }}>Delete</button>
                      </>
                    )}
                  </div>

                  {!pipe ? (
                    <div style={{ padding: '60px 0', textAlign: 'center' as const, color: creamFaint, fontSize: 13 }}>
                      No pipelines yet. Click <span style={{ color: gold }}>+ New pipeline</span> to create one.
                    </div>
                  ) : (
                    <>
                    {/* Kanban search + filters */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                      <input
                        placeholder="Search name, IG, email, phone…"
                        value={kbSearch} onChange={(e) => setKbSearch(e.target.value)}
                        style={{ ...iStyle, flex: '1 1 200px', maxWidth: 280 }}
                      />
                      <select value={kbStatus} onChange={(e) => setKbStatus(e.target.value)} style={{ ...selStyle, width: 130 }}>
                        <option value="">All statuses</option>
                        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <select value={kbTag} onChange={(e) => setKbTag(e.target.value)} style={{ ...selStyle, width: 150 }}>
                        <option value="">All tags</option>
                        {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {kbActive && (
                        <>
                          <span style={{ fontSize: 11, color: creamFaint }}>{kbLeads.length} match{kbLeads.length === 1 ? '' : 'es'}</span>
                          <button onClick={() => { setKbSearch(''); setKbTag(''); setKbStatus(''); }} style={{
                            padding: '7px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                            background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: creamFaint,
                          }}>Clear</button>
                        </>
                      )}
                    </div>
                    <div style={{ overflowX: 'auto' as const, paddingBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 12, minWidth: Math.max(stages.length, 1) * 232 }}>
                        {stages.map((stage) => {
                          const stagLeads = kbLeads.filter((l) => l.stage === stage.key);
                          const isTarget = dropStage === stage.key && !!dragLeadId;
                          return (
                            <div key={stage.key}
                              onDragOver={(e) => { if (dragLeadId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropStage(stage.key); } }}
                              onDragLeave={() => setDropStage((s) => s === stage.key ? null : s)}
                              onDrop={(e) => { e.preventDefault(); onColumnDrop(stage.key); }}
                              style={{
                                width: 220, flexShrink: 0, borderRadius: 10, padding: 4,
                                background: isTarget ? `${stage.color}14` : 'transparent',
                                outline: isTarget ? `1.5px dashed ${stage.color}99` : '1.5px solid transparent',
                                transition: 'background 0.12s',
                              }}>
                              {/* Column header */}
                              <div style={{
                                padding: '8px 12px', marginBottom: 8, borderRadius: 8,
                                background: `${stage.color}0f`, borderBottom: `2px solid ${stage.color}44`,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: stage.color, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                                  {stage.label}
                                </span>
                                <span style={{ fontSize: 11, color: stage.color, fontWeight: 700 }}>{stagLeads.length}</span>
                              </div>
                              {/* Cards */}
                              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, minHeight: 40 }}>
                                {stagLeads.length === 0 ? (
                                  <div style={{ padding: '18px 12px', textAlign: 'center' as const, color: isTarget ? stage.color : '#333', fontSize: 11 }}>
                                    {isTarget ? 'Drop here' : '—'}
                                  </div>
                                ) : stagLeads.map((l) => {
                                  const isSelected = selected?.id === l.id;
                                  const overdue = l.next_followup_at && new Date(l.next_followup_at) < new Date();
                                  return (
                                    <div key={l.id}
                                      draggable
                                      onDragStart={(e) => onCardDragStart(e, l)}
                                      onDragEnd={() => { setDragLeadId(null); setDropStage(null); }}
                                      onClick={() => selectLead(l)}
                                      style={{
                                        padding: '12px 14px', borderRadius: 10, cursor: 'grab',
                                        background: isSelected ? 'rgba(201,164,85,0.08)' : 'rgba(255,255,255,0.025)',
                                        border: `1px solid ${isSelected ? 'rgba(201,164,85,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                        opacity: dragLeadId === l.id ? 0.4 : 1, transition: 'opacity 0.12s',
                                      }}>
                                      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: cream, marginBottom: l.name && l.ig_handle ? 1 : 4 }}>
                                        {l.name || leadLabel(l)}
                                      </div>
                                      {l.name && l.ig_handle && (
                                        <div style={{ fontSize: 10, color: creamFaint, marginBottom: 4 }}>@{l.ig_handle.replace(/^@+/, '')}</div>
                                      )}
                                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const }}>
                                        {l.icp_tier && (
                                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(201,164,85,0.12)', color: gold }}>{l.icp_tier}</span>
                                        )}
                                        {l.has_whatsapp && (
                                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(74,222,128,0.1)', color: 'rgba(74,222,128,0.7)' }}>WA</span>
                                        )}
                                        {(l.tags || []).slice(0, 3).map((t) => (
                                          <span key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${tagColor(t)}1f`, color: tagColor(t) }}>{t}</span>
                                        ))}
                                        {l.next_followup_at && (
                                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: overdue ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)', color: overdue ? '#ef4444' : creamFaint }}>
                                            {crmFmt(l.next_followup_at)}
                                          </span>
                                        )}
                                      </div>
                                      {l.ai_next_move && (
                                        <div style={{ fontSize: 10, color: 'rgba(240,232,212,0.4)', marginTop: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                                          {l.ai_next_move}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* ── ALL LEADS TAB ── */}
            {crmTab === 'all' && (
              <>
                {/* Toolbar */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                  <input
                    placeholder="Search handle, name, email, WhatsApp…"
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    style={{ ...iStyle, flex: '1 1 160px', maxWidth: 260 }}
                  />
                  <select value={pipeFilter} onChange={(e) => setPipeFilter(e.target.value)} style={{ ...selStyle, width: 160 }}>
                    <option value="">All pipelines</option>
                    {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ ...selStyle, width: 150 }}>
                    <option value="">All tags</option>
                    {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {visible.length === 0 ? (
                  <div style={{ padding: '40px 0', textAlign: 'center' as const, color: creamFaint, fontSize: 12 }}>
                    {leads.length === 0 ? 'No leads yet — add your first one above' : 'No leads match your filters'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 70px 100px 90px 32px', gap: 8, padding: '6px 12px',
                      fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'rgba(240,232,212,0.3)' }}>
                      <span>Lead</span><span>Stage</span><span>ICP</span><span>Source</span><span>Follow-up</span><span />
                    </div>
                    {visible.map((l) => (
                      <div key={l.id} onClick={() => selectLead(l)} style={{
                        display: 'grid', gridTemplateColumns: '1fr 90px 70px 100px 90px 32px', gap: 8,
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer', alignItems: 'center',
                        background: selected?.id === l.id ? 'rgba(201,164,85,0.06)' : 'rgba(255,255,255,0.015)',
                        border: `1px solid ${selected?.id === l.id ? 'rgba(201,164,85,0.2)' : 'rgba(255,255,255,0.04)'}`,
                      }}>
                        <div>
                          <div style={{ fontSize: 13, color: cream, fontFamily: "'DM Sans', sans-serif" }}>{leadLabel(l)}</div>
                          {l.name && l.ig_handle && <div style={{ fontSize: 10, color: creamFaint }}>{l.name}</div>}
                        </div>
                        <span style={{ fontSize: 10, color: stageMeta(l).color || creamFaint }}>{stageMeta(l).label}</span>
                        <span style={{ fontSize: 11, color: l.icp_tier ? gold : creamFaint }}>{l.icp_tier ? `Tier ${l.icp_tier}` : '—'}</span>
                        <span style={{ fontSize: 10, color: creamFaint }}>{(l.source || '').replace('_', ' ')}</span>
                        <span style={{ fontSize: 10, color: l.next_followup_at && new Date(l.next_followup_at) <= new Date() ? '#ef4444' : creamFaint }}>
                          {l.next_followup_at ? crmFmt(l.next_followup_at) : '—'}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete this lead?')) deleteLead(l.id); }} style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.4)', fontSize: 14, lineHeight: 1, padding: 4,
                        }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Right panel: Lead profile drawer */}
      {selected && (
        <div style={{
          width: 360, flexShrink: 0, ...card, borderColor: 'rgba(201,164,85,0.12)', padding: '20px 18px',
          maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' as const, position: 'sticky' as const, top: 20,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: cream, marginBottom: 2 }}>
                {leadLabel(selected)}
              </div>
              {selected.name && selected.ig_handle && (
                <div style={{ fontSize: 11, color: creamFaint }}>{selected.name}</div>
              )}
            </div>
            <button onClick={() => setSelected(null)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: creamFaint, fontSize: 18, lineHeight: 1,
            }}>×</button>
          </div>

          {/* Pipeline + Stage selectors */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(240,232,212,0.35)', marginBottom: 5 }}>Pipeline</div>
              <select value={selected.pipeline_id || ''} onChange={(e) => movePipeline(selected, e.target.value)} style={{ ...selStyle, width: '100%' }}>
                <option value="">No pipeline</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(240,232,212,0.35)', marginBottom: 5 }}>Stage</div>
              <select value={selected.stage} onChange={(e) => patchStage(selected, e.target.value)} style={{ ...selStyle, width: '100%', color: stageMeta(selected).color || cream }}>
                {stagesForPipeline(selected.pipeline_id).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Log the outcome — the only follow-up input the setter ever needs */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.5)', marginBottom: 6 }}>
              Log outcome
            </div>
            <SetterActions
              lead={selected}
              stages={stagesForPipeline(selected.pipeline_id)}
              stageLabel={stageMeta(selected).label}
              busy={busyLead === selected.id}
              onStage={(key) => markStage(selected, key)}
              onLogFollowUp={() => logActivity(selected)}
            />
            <div style={{ marginTop: 8 }}>
              <ContactLinks lead={selected} softphone={softphone} onDialEnd={refreshLead} />
            </div>
          </div>

          {/* Contact line: email + phone */}
          {(selected.email || selected.whatsapp) && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 3, marginBottom: 12 }}>
              {selected.email && <div style={{ fontSize: 11, color: 'rgba(240,232,212,0.7)' }}>✉ {selected.email}</div>}
              {selected.whatsapp && <div style={{ fontSize: 11, color: 'rgba(240,232,212,0.7)' }}>☎ {selected.whatsapp}</div>}
            </div>
          )}

          {/* Meta chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 14 }}>
            {selected.icp_tier && (
              <span style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(201,164,85,0.25)', fontSize: 10, color: gold }}>
                {selected.icp_tier}
              </span>
            )}
            {selected.status && (
              <span style={{ padding: '3px 10px', borderRadius: 20, border: `1px solid ${STATUS_COLORS[selected.status] || 'rgba(255,255,255,0.08)'}`, fontSize: 10, color: STATUS_COLORS[selected.status] || creamFaint }}>
                {selected.status}
              </span>
            )}
            {selected.revenue && (
              <span style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, color: creamFaint }}>
                {selected.revenue}
              </span>
            )}
            {selected.makes_money && (
              <span style={{ padding: '3px 10px', borderRadius: 20, border: `1px solid ${selected.makes_money === 'Yes' ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`, fontSize: 10, color: selected.makes_money === 'Yes' ? 'rgba(74,222,128,0.8)' : creamFaint }}>
                Makes money: {selected.makes_money}
              </span>
            )}
            {selected.business && (
              <span style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, color: creamFaint }}>
                {selected.business}
              </span>
            )}
            {selected.source && (
              <span style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, color: creamFaint }}>
                {selected.source.replace('_', ' ')}
              </span>
            )}
            {selected.has_whatsapp && (
              <span style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(74,222,128,0.2)', fontSize: 10, color: 'rgba(74,222,128,0.75)' }}>
                WhatsApp
              </span>
            )}
          </div>

          {/* Tags — editable inline */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(240,232,212,0.35)', marginBottom: 5 }}>Tags</div>
            <TagEditor tags={selected.tags || []} onChange={(t) => patchTags(selected, t)} />
          </div>

          {/* Dials — inline editable */}
          {(() => {
            const savedDials = selected.dials_made != null ? String(selected.dials_made) : '';
            const base = selected.dials_made || 0;
            const stepBtn: React.CSSProperties = {
              flexShrink: 0, width: 34, height: 34, borderRadius: 8, cursor: dialsSaving ? 'default' : 'pointer',
              background: 'rgba(201,164,85,0.08)', border: '1px solid rgba(201,164,85,0.2)', color: gold,
              fontSize: 16, lineHeight: 1, fontFamily: "'DM Sans', sans-serif",
            };
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(240,232,212,0.35)', marginBottom: 5 }}>Dials Made</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => patchDials(Math.max(0, base - 1))} disabled={dialsSaving || base <= 0} style={{ ...stepBtn, opacity: dialsSaving || base <= 0 ? 0.4 : 1 }}>−</button>
                  <input
                    value={dialsDraft}
                    onChange={(e) => setDialsDraft(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && patchDials(dialsDraft.trim() ? parseInt(dialsDraft, 10) : null)}
                    inputMode="numeric" placeholder="0"
                    style={{ ...iStyle, width: 60, textAlign: 'center' as const, fontSize: 14 }}
                  />
                  <button onClick={() => patchDials(base + 1)} disabled={dialsSaving} style={{ ...stepBtn, opacity: dialsSaving ? 0.4 : 1 }}>+</button>
                  <button
                    onClick={() => patchDials(dialsDraft.trim() ? parseInt(dialsDraft, 10) : null)}
                    disabled={dialsSaving || dialsDraft === savedDials}
                    style={{
                      marginLeft: 'auto', padding: '0 14px', height: 34, borderRadius: 8,
                      background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', color: gold,
                      fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: '0.08em',
                      cursor: dialsSaving || dialsDraft === savedDials ? 'default' : 'pointer',
                      opacity: dialsSaving || dialsDraft === savedDials ? 0.4 : 1,
                    }}
                  >{dialsSaving ? '…' : 'Save'}</button>
                </div>
              </div>
            );
          })()}

          {/* Follow-up cadence — every field here is derived, none are typed in */}
          <CadencePanel lead={selected} stageLabel={stageMeta(selected).label} />

          {/* Notes */}
          {selected.notes && (
            <div style={{ marginBottom: 14, fontSize: 12, color: 'rgba(240,232,212,0.7)', lineHeight: 1.6, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
              {selected.notes}
            </div>
          )}

          {/* Edit button */}
          <button onClick={() => openEdit(selected)} style={{
            width: '100%', padding: '9px', background: 'none', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, color: creamFaint, fontFamily: "'DM Sans', sans-serif", fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer', marginBottom: 12,
          }}>Edit Profile</button>

          {/* ManyChat Actions — hidden per request 2026-07-24. To restore, just
              uncomment the line below (the ManyChActionPanel component is kept intact). */}
          {/* <ManyChActionPanel leadId={selected.id} igHandle={selected.ig_handle} notes={selected.notes} onTouchpoint={() => loadTouchpoints(selected.id)} /> */}

          {/* Close (calling) + Kit (email) sync */}
          <CloseKitPanel
            lead={selected}
            onUpdated={(l) => { setSelected(l); setLeads((prev) => prev.map((x) => x.id === l.id ? l : x)); }}
            onTouchpoint={() => loadTouchpoints(selected.id)}
          />

          {/* AI Assist */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.5)', marginBottom: 8 }}>AI Assist</div>
            {(selected.ai_summary || selected.ai_next_move) && (
              <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {selected.ai_summary && (
                  <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: 11, color: 'rgba(240,232,212,0.75)', lineHeight: 1.65 }}>
                    {selected.ai_summary}
                  </div>
                )}
                {selected.ai_next_move && (
                  <div style={{ padding: '10px 12px', background: 'rgba(201,164,85,0.04)', border: '1px solid rgba(201,164,85,0.12)', borderRadius: 8 }}>
                    <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.5)', marginBottom: 4 }}>Next move</div>
                    <div style={{ fontSize: 12, color: cream, lineHeight: 1.6 }}>{selected.ai_next_move}</div>
                  </div>
                )}
              </div>
            )}
            <button onClick={runAI} disabled={aiLoading} style={{
              width: '100%', padding: '9px', background: 'rgba(201,164,85,0.08)', border: '1px solid rgba(201,164,85,0.2)',
              borderRadius: 8, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 10,
              letterSpacing: '0.12em', textTransform: 'uppercase' as const, cursor: 'pointer',
            }}>{aiLoading ? 'Thinking…' : selected.ai_summary ? 'Refresh AI' : 'Generate AI Brief'}</button>
          </div>

          {/* Touchpoint timeline */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.5)', marginBottom: 10 }}>
              Touchpoints · {touchpoints.length}
            </div>

            {/* Add touchpoint */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <select value={tpChannel} onChange={(e) => setTpChannel(e.target.value)} style={{ ...selStyle, flex: 1 }}>
                  {CHANNELS.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
                <select value={tpDirection} onChange={(e) => setTpDirection(e.target.value)} style={{ ...selStyle, width: 100 }}>
                  <option value="outbound">Outbound</option>
                  <option value="inbound">Inbound</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={tpContent} onChange={(e) => setTpContent(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addTouchpoint()}
                  placeholder="Log this touchpoint…"
                  style={{ ...iStyle, flex: 1, fontSize: 11 }} />
                <button onClick={addTouchpoint} disabled={tpSaving || !tpContent.trim()} style={{
                  padding: '9px 14px', background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.2)',
                  borderRadius: 8, color: gold, fontFamily: "'DM Sans', sans-serif", fontSize: 11, cursor: 'pointer',
                }}>Log</button>
              </div>
            </div>

            {/* Timeline */}
            {tpLoading ? (
              <div style={{ fontSize: 11, color: creamFaint, padding: '10px 0' }}>Loading…</div>
            ) : touchpoints.length === 0 ? (
              <div style={{ fontSize: 11, color: 'rgba(240,232,212,0.3)', padding: '10px 0' }}>No touchpoints yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {touchpoints.map((tp) => (
                  <div key={tp.id} style={{ position: 'relative' as const, paddingLeft: 16,
                    borderLeft: `2px solid ${tp.direction === 'inbound' ? 'rgba(143,208,255,0.3)' : 'rgba(201,164,85,0.2)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                      <div>
                        <span style={{ fontSize: 9, letterSpacing: '0.08em', color: tp.direction === 'inbound' ? 'rgba(143,208,255,0.6)' : 'rgba(201,164,85,0.6)', textTransform: 'uppercase' as const }}>
                          {tp.direction} · {tp.channel.replace('_', ' ')} ·
                        </span>
                        <span style={{ fontSize: 9, color: 'rgba(240,232,212,0.3)', marginLeft: 4 }}>{crmFmt(tp.created_at)}</span>
                      </div>
                      <button onClick={() => deleteTp(tp.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.3)',
                        fontSize: 12, lineHeight: 1, padding: 0, flexShrink: 0,
                      }}>×</button>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(240,232,212,0.8)', lineHeight: 1.55, marginTop: 3 }}>
                      {tp.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
      {dialer}
    </div>
  );
}

/* ─── Analytics View ──────────────────────────────────────────────────── */

type FunnelData = {
  report24h: { leads: number; qualified: number; applications: number };
  funnel30d: { leads: number; qualified: number; booked: number; optins: number };
  pipeline: {
    totalCalls: number; showed: number; noShow: number;
    closed: number; noClose: number; dq: number;
    showRate: number; closeRate: number;
    revenue: number; cash: number; upcomingCount: number;
  };
  totals: { allLeads: number; allQualified: number; activeClients: number; newClients30d: number; allOptins: number };
  sources: { source: string; leads: number; qualified: number }[];
  investBreakdown: { range: string; count: number }[];
  recent: { name: string; email: string; qualified: boolean; investment: string; source: string; created_at: string }[];
  recentCalls: { lead_name: string; closer: string; outcome: string; revenue: number; cash_collected: number; call_date: string }[];
  upcoming: { name: string; start_time: string; status: string }[];
  channelFunnels: { channel: string; color: string; optins: number; applications: number; qualified: number; booked: number; showed: number; closed: number }[];
  stageBreakdowns: Record<string, { channel: string; color: string; count: number }[]>;
};

const GLD  = '#F5E6A3';
const AMB  = 'rgba(201,164,85,0.85)';
const CRFN = 'rgba(240,232,212,0.85)';
const CRFD = 'rgba(240,232,212,0.35)';
const LINE = 'rgba(245,230,163,0.12)';
const CARD_S: React.CSSProperties = {
  background: 'rgba(255,255,255,0.022)',
  border: '1px solid rgba(245,230,163,0.1)',
  borderRadius: 8, padding: '16px 18px',
};
const MONO = '"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace';
const SERIF = '"Cormorant Garamond","Source Serif Pro",Georgia,serif';

function AStat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ ...CARD_S, flex: '1 1 120px', minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: CRFD, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: color || GLD, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 9.5, color: CRFD, marginTop: 5, letterSpacing: '0.04em' }}>{sub}</div>}
    </div>
  );
}

function ASection({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '22px 0 14px', flexWrap: 'wrap' as const }}>
      <span style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 22, color: CRFN }}>{title}</span>
      {sub && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: CRFD }}>{sub}</span>}
    </div>
  );
}

/* Light, minimal stat tile — replaces the old hairline-grid-of-boxes look. */
/* Borderless stat block — no card, no box. Just a label + big number,
 * separated from its neighbors by whitespace and a faint hairline, not a
 * bordered container (that's what was still reading as "boxy" grids). */
function LightStat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ flex: '1 1 140px', minWidth: 140, padding: '4px 20px 4px 0', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CRFD, marginBottom: 7 }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 34, lineHeight: 1, color: color || CRFN }}>{value}</div>
      {sub && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CRFD, marginTop: 7 }}>{sub}</div>}
    </div>
  );
}

function cvr2(a: number, b: number) { return b > 0 ? `${Math.round((a / b) * 100)}%` : '—'; }

function AnalyticsView() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [clock, setClock] = useState('');
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [eventsData, setEventsData] = useState<FunnelEventsAnalytics | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [range, setRange] = useState<DateRange>(() => ({
    from: new Date(Date.now() - 30 * 86400000),
    to: new Date(),
    tz: 'eastern',
  }));

  useEffect(() => {
    setLoading(true);
    setErr('');
    const params = new URLSearchParams({
      from: range.from.getTime().toString(),
      to:   range.to.getTime().toString(),
      tz:   range.tz,
    });
    // A hung upstream call (Calendly, Supabase) must surface as an error, not
    // spin on "LOADING COMMAND DATA..." forever.
    fetch(`/api/admin/funnel-analytics?${params}`, { signal: AbortSignal.timeout(20000) })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setErr('Failed to load — request timed out or errored. Try reloading.'); setLoading(false); });
  }, [range]);

  useEffect(() => {
    setEventsLoading(true);
    const params = new URLSearchParams({
      from: range.from.getTime().toString(),
      to:   range.to.getTime().toString(),
    });
    fetch(`/api/admin/funnel-events-analytics?${params}`, { signal: AbortSignal.timeout(20000) })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setEventsData(d); setEventsLoading(false); })
      .catch(() => setEventsLoading(false));
  }, [range]);

  useEffect(() => {
    function tick() {
      const n = new Date();
      setClock(n.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) return (
    <div style={{ padding: '80px 0', textAlign: 'center', fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: CRFD }}>
      Loading analytics…
    </div>
  );
  if (err || !data) return (
    <div style={{ padding: '80px 0', textAlign: 'center', fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: '#e05555' }}>{err || 'No data'}</div>
  );

  const d = data;

  /* Living Funnel topology — each stage carries its per-channel breakdown so
   * the Sankey can render a colored ribbon per traffic source/ad-segment
   * instead of one undifferentiated gold ribbon. */
  const funnelStages = [
    { id: 'optins',  num: '01', label: 'OPT-INS',     sub: 'IG + ads leads',  count: d.funnel30d.optins,           xFrac: 0.08, color: '#8FD0FF', channels: d.stageBreakdowns?.optins },
    { id: 'apps',    num: '02', label: 'APPLICATIONS', sub: 'all funnels',    count: d.funnel30d.leads,            xFrac: 0.26, color: GLD,       channels: d.stageBreakdowns?.applications },
    { id: 'qual',    num: '03', label: 'QUALIFIED',    sub: 'passed criteria', count: d.funnel30d.qualified,        xFrac: 0.44, color: GLD,       channels: d.stageBreakdowns?.qualified },
    { id: 'booked',  num: '04', label: 'BOOKED',       sub: 'calls scheduled', count: d.pipeline.totalCalls + d.pipeline.upcomingCount, xFrac: 0.60, color: '#C9A8FF', channels: d.stageBreakdowns?.booked },
    { id: 'showed',  num: '05', label: 'SHOWED',       sub: `${d.pipeline.showRate}% show rate`,  count: d.pipeline.showed, xFrac: 0.76, color: GLD, channels: d.stageBreakdowns?.showed },
    { id: 'closed',  num: '06', label: 'CLOSED',       sub: `${d.pipeline.closeRate}% close rate`, count: d.pipeline.closed, xFrac: 0.92, color: '#BFFA46', channels: d.stageBreakdowns?.closed },
  ];

  const stageNames: Record<string, string> = {
    optins: 'Opt-ins', apps: 'Applications', qual: 'Qualified',
    booked: 'Booked', showed: 'Showed', closed: 'Closed',
  };
  const stageSubs: Record<string, string> = {
    optins: 'IG + ads leads', apps: 'all funnel applications', qual: 'passed criteria',
    booked: 'calls scheduled', showed: 'attended call', closed: 'signed deal',
  };
  const stageBreakdownKey: Record<string, string> = {
    optins: 'optins', apps: 'applications', qual: 'qualified',
    booked: 'booked', showed: 'showed', closed: 'closed',
  };
  const stageCounts: Record<string, number> = {
    optins: d.funnel30d.optins,
    apps: d.funnel30d.leads,
    qual: d.funnel30d.qualified,
    booked: d.pipeline.totalCalls + d.pipeline.upcomingCount,
    showed: d.pipeline.showed,
    closed: d.pipeline.closed,
  };
  const stageOrder = ['optins', 'apps', 'qual', 'booked', 'showed', 'closed'];

  const outcomeColor: Record<string, string> = {
    closed: '#BFFA46', no_close: CRFD, no_show: '#F0826D', dq: '#F0826D', unknown: CRFD,
  };
  const outcomeName: Record<string, string> = {
    closed: 'CLOSED', no_close: 'NO CLOSE', no_show: 'NO SHOW', dq: "DQ'D", unknown: '—',
  };

  return (
    <div style={{ minHeight: '100%' }}>

      {/* ── TOPBAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0 18px' }}>
        <div>
          <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 26, color: CRFN }}>VTC</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CRFD }}>Funnel command center</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CRFD }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: GLD, boxShadow: `0 0 6px ${GLD}` }} />
          {loading ? 'Loading…' : 'Live'}
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: CRFN, fontVariantNumeric: 'tabular-nums' }}>{clock}</div>
      </div>

      {/* ── RANGE PICKER ── */}
      <div style={{ marginBottom: 18 }}>
        <RangePicker value={range} onChange={(r) => { setRange(r); setSelectedStage(null); setExpandedChannel(null); }} />
      </div>

      {/* ── THE LIVING FUNNEL ── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '18px 22px 6px', display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 24, color: CRFN }}>
            The <em style={{ color: GLD, fontStyle: 'italic' }}>Living</em> Funnel
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CRFD }}>
            {Math.round((range.to.getTime() - range.from.getTime()) / 86400000)} days · {range.tz === 'eastern' ? 'Eastern' : 'UTC'}
          </div>
        </div>
        <LivingFunnel
          stages={funnelStages}
          selectedStage={selectedStage ?? undefined}
          onStageClick={(id) => setSelectedStage(id)}
        />
      </div>

      {/* ── STAGE BREAKDOWN PANEL ── */}
      {selectedStage && (() => {
        const key = stageBreakdownKey[selectedStage];
        const rows = (d.stageBreakdowns?.[key] ?? []);
        const total = stageCounts[selectedStage] ?? 0;
        const stageIdx = stageOrder.indexOf(selectedStage);
        const prevStage = stageIdx > 0 ? stageOrder[stageIdx - 1] : null;
        const prevCount = prevStage ? stageCounts[prevStage] : null;
        const cvrFromPrev = prevCount && prevCount > 0 ? Math.round((total / prevCount) * 100) : null;
        return (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${GLD}`, borderRadius: 14, padding: '20px 22px', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' as const }}>
              <div>
                <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 20, color: CRFN, marginBottom: 2 }}>
                  {stageNames[selectedStage]} breakdown
                </div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, color: CRFD }}>{stageSubs[selectedStage]}</div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 32, color: GLD, lineHeight: 1 }}>{total}</div>
                {cvrFromPrev !== null && (
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: cvrFromPrev >= 40 ? '#BFFA46' : '#F0826D', marginTop: 3 }}>
                    {cvrFromPrev}% from {stageNames[prevStage!]}
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedStage(null)} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CRFD, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '6px 12px', cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {rows.map(row => {
                const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
                const hasData = row.count > 0;
                return (
                  <div key={row.channel} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 20,
                    background: hasData ? `${row.color}14` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${hasData ? row.color + '44' : 'rgba(255,255,255,0.07)'}`,
                    opacity: hasData ? 1 : 0.55,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: hasData ? CRFN : CRFD }}>{row.channel}</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CRFD }}>{row.count}{hasData ? ` · ${pct}%` : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── SCOREBOARD ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 10, marginBottom: 18 }}>
        {[
          { l: 'Opt-ins 30D',      v: d.funnel30d.optins,          c: '#8FD0FF', s: 'IG + ads leads' },
          { l: 'Applications 30D', v: d.funnel30d.leads,            c: GLD,       s: cvr2(d.funnel30d.leads, d.funnel30d.optins + d.funnel30d.leads) + ' of top-funnel' },
          { l: 'Qualified 30D',    v: d.funnel30d.qualified,        c: GLD,       s: cvr2(d.funnel30d.qualified, d.funnel30d.leads) + ' of apps' },
          { l: 'Calls Booked',     v: d.pipeline.totalCalls + d.pipeline.upcomingCount, c: '#C9A8FF',
            // "of qual" only means something when booked calls are actually a
            // subset of qualified apps — most booked calls today come from
            // before/outside the tracked qualification flow, so a naive
            // ratio (e.g. 50 booked / 1 qualified) would show as "5000%".
            s: (() => {
              const booked = d.pipeline.totalCalls + d.pipeline.upcomingCount;
              const pct = d.funnel30d.qualified > 0 ? Math.round((booked / d.funnel30d.qualified) * 100) : null;
              return pct !== null && pct <= 100 ? `${pct}% of qual` : 'calls this period';
            })() },
          { l: 'Active Clients',   v: d.totals.activeClients,       c: CRFN,      s: 'total portal users' },
          { l: 'New Clients 30D',  v: d.totals.newClients30d,       c: AMB,       s: 'joined this month' },
        ].map(item => (
          <LightStat key={item.l} label={item.l} value={item.v} sub={item.s} color={item.c} />
        ))}
      </div>

      {/* ── CALL PIPELINE ── */}
      <ASection title="Call Pipeline" sub="booked → showed → closed · 30D" />
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 10, marginBottom: 10 }}>
        {[
          { l: 'Upcoming',     v: d.pipeline.upcomingCount,   c: '#8FD0FF' },
          { l: 'Total Booked', v: d.pipeline.totalCalls,      c: '#C9A8FF' },
          { l: 'Showed',       v: d.pipeline.showed,          c: GLD },
          { l: 'No Show',      v: d.pipeline.noShow,          c: '#F0826D' },
          { l: 'Closed',       v: d.pipeline.closed,          c: '#BFFA46' },
          { l: 'No Close',     v: d.pipeline.noClose,         c: CRFD },
          { l: "DQ'd",         v: d.pipeline.dq,              c: CRFD },
        ].map(item => (
          <LightStat key={item.l} label={item.l} value={item.v} color={item.c} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 10, marginBottom: 18 }}>
        {[
          { l: 'Revenue 30D',       v: `$${(d.pipeline.revenue / 1000).toFixed(1)}k`,  c: GLD,                                                                 s: 'contract value' },
          { l: 'Cash Collected 30D',v: `$${(d.pipeline.cash    / 1000).toFixed(1)}k`,  c: AMB,                                                                 s: 'cash in bank' },
          { l: 'Show Rate',         v: `${d.pipeline.showRate}%`,                       c: d.pipeline.showRate >= 60 ? GLD : '#F0826D',                         s: 'showed of booked' },
          { l: 'Close Rate',        v: `${d.pipeline.closeRate}%`,                      c: d.pipeline.closeRate >= 25 ? GLD : 'rgba(245,200,100,0.7)',           s: 'closed of showed' },
        ].map(item => (
          <LightStat key={item.l} label={item.l} value={item.v} sub={item.s} color={item.c} />
        ))}
      </div>

      {/* ── SOURCE FUNNELS ── */}
      {d.channelFunnels.length > 0 && (
        <>
          <ASection title="Source Funnels" sub="opt-in → qualify → close · full pipeline · 30D" />
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 10, marginBottom: expandedChannel ? 14 : 18 }}>
            {d.channelFunnels.map((ch) => {
              const total = ch.optins + ch.applications;
              const isOpen = expandedChannel === ch.channel;
              return (
                <button
                  key={ch.channel}
                  onClick={() => setExpandedChannel(isOpen ? null : ch.channel)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '9px 16px', borderRadius: 24, cursor: 'pointer',
                    background: isOpen ? `${ch.color}1c` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isOpen ? ch.color : 'rgba(255,255,255,0.08)'}`,
                    transition: 'all 150ms',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: ch.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: isOpen ? ch.color : CRFN }}>{ch.channel}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CRFD }}>
                    {total} in{ch.closed > 0 ? ` · ${ch.closed} closed` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {expandedChannel && (() => {
            const ch = d.channelFunnels.find(c => c.channel === expandedChannel);
            if (!ch) return null;
            /* rawDenom (unclamped) decides whether a percentage is even
             * meaningful — e.g. 51 booked against 0 qualified isn't "5100%",
             * it's a channel where booking doesn't come from the tracked
             * qualification step at all. Only render a rate when the real
             * prior-stage count is > 0. */
            const stages = [
              { l: 'Opt-ins',      v: ch.optins,       rawDenom: ch.optins + ch.applications },
              { l: 'Applications', v: ch.applications,  rawDenom: ch.optins },
              { l: 'Qualified',    v: ch.qualified,     rawDenom: ch.applications },
              { l: 'Booked',       v: ch.booked,        rawDenom: ch.qualified },
              { l: 'Showed',       v: ch.showed,        rawDenom: ch.booked },
              { l: 'Closed',       v: ch.closed,        rawDenom: ch.showed },
            ];
            const barMax = Math.max(...stages.map(s => s.v), 1);
            const overallDenom = ch.optins + ch.applications;
            return (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${ch.color}`, borderRadius: 14, padding: '20px 22px', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 700, color: ch.color }}>{ch.channel}</div>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setExpandedChannel(null)} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: CRFD, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '6px 12px', cursor: 'pointer' }}>Close</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '10px 24px' }}>
                  {stages.map((st, i) => (
                    <div key={st.l}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, color: i >= 3 ? CRFN : CRFD }}>{st.l}</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          {i > 0 && st.rawDenom > 0 && (
                            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, color: Math.round((st.v / st.rawDenom) * 100) >= 40 ? '#BFFA46' : '#F0826D' }}>
                              {Math.round((st.v / st.rawDenom) * 100)}%
                            </span>
                          )}
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15.5, fontWeight: 700, color: st.v > 0 ? ch.color : CRFD }}>{st.v}</span>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.05)', height: 4, borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${Math.round((st.v / barMax) * 100)}%`, background: ch.color, opacity: i >= 3 ? 0.9 : 0.5, transition: 'width 900ms', borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
                {ch.closed > 0 && (
                  <div style={{ marginTop: 14, padding: '9px 14px', background: `${ch.color}12`, border: `1px solid ${ch.color}30`, borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, color: ch.color, display: 'inline-block' }}>
                    {overallDenom > 0
                      ? `${Math.round((ch.closed / overallDenom) * 100)}% overall close rate`
                      : `${ch.closed} closed — no opt-in/application data tracked for this channel`}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* ── ATTRIBUTION & VELOCITY ── */}
      <AttributionVelocityPanel data={eventsData} loading={eventsLoading} />

      {/* ── TRAFFIC SOURCES ── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px', marginBottom: 18 }}>
        <ASection title="Traffic Sources" sub="30d applications" />
        {d.sources.length === 0 ? (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: CRFD, padding: '8px 0' }}>No UTM data yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 11 }}>
            {d.sources.map(s => (
              <div key={s.source} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 32px', gap: 8, alignItems: 'center' }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: CRFN, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.source || '(direct)'}</div>
                <div style={{ background: 'rgba(255,255,255,0.05)', height: 6, borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${Math.round((s.leads / Math.max(...d.sources.map(x => x.leads), 1)) * 100)}%`, background: GLD, opacity: 0.7, borderRadius: 3 }} />
                </div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 700, color: GLD, textAlign: 'right' as const }}>{s.leads}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ALL-TIME (Investment range now lives per-funnel in the Applicants panel below) ── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px', marginBottom: 18 }}>
        <ASection title="All-Time" />
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 10 }}>
          {[
            { l: 'Total Leads',  v: d.totals.allLeads,        c: GLD },
            { l: 'Qualified',    v: d.totals.allQualified,     c: GLD },
            { l: 'Active Clients', v: d.totals.activeClients,  c: CRFN },
            { l: 'All Opt-ins',  v: d.totals.allOptins,        c: '#8FD0FF' },
          ].map(item => (
            <div key={item.l} style={{ flex: '1 1 100px' }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: CRFD, marginBottom: 5 }}>{item.l}</div>
              <div style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 26, lineHeight: 1, color: item.c }}>{item.v}</div>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, color: CRFD, marginTop: 14 }}>
          Qual rate all-time: <span style={{ color: GLD, fontWeight: 600 }}>{cvr2(d.totals.allQualified, d.totals.allLeads)}</span>
        </div>
      </div>

      {/* ── APPLICATIONS + BOOKED CALLS, grouped by funnel (source page) ── */}
      <ApplicantsPanel range={{ from: range.from, to: range.to }} />

    </div>
  );
}

/* ─── CLIENT SUCCESS VIEW ─────────────────────────────────────────────── */
function ClientSuccessView({ users }: { users: User[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const sorted = [...users].filter((u) => u.active).sort((a, b) => b.last_login - a.last_login);

  if (!sorted.length) {
    return <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: creamFaint, padding: '40px 0', textAlign: 'center' }}>No active clients.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.4)', marginBottom: 8 }}>
        {sorted.length} active clients — click to view check-ins &amp; action items
      </div>
      {sorted.map((user) => {
        const isOpen = expanded === user.email;
        const initials = user.name ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : user.email.slice(0, 2).toUpperCase();
        return (
          <div key={user.email} style={{ ...card, overflow: 'hidden' }}>
            <button
              onClick={() => setExpanded(isOpen ? null : user.email)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: gold, fontWeight: 600,
              }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: cream, marginBottom: 3 }}>
                  {user.name || user.email}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: creamFaint }}>
                    Last login {fmt(user.last_login)}
                  </span>
                  {(user.tags || []).slice(0, 3).map((tag) => (
                    <span key={tag} style={{
                      fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: gold,
                      padding: '1px 6px', borderRadius: 20, border: '1px solid rgba(201,164,85,0.2)',
                    }}>{tag}</span>
                  ))}
                </div>
              </div>
              <span style={{ color: creamFaint, fontSize: 16, flexShrink: 0 }}>{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 20px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <CheckInsSection email={user.email} />
                <ActionItemsAdminSection email={user.email} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── ROADMAP VIEW ────────────────────────────────────────────────────── */
function RoadmapClientCard({ user }: { user: User }) {
  const [completed, setCompleted] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && completed === null) {
      fetch(`/api/admin/progress/${encodeURIComponent(user.email)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => setCompleted(d?.completed ?? []))
        .catch(() => setCompleted([]));
    }
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = user.name ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : user.email.slice(0, 2).toUpperCase();
  const completedSet = new Set(completed ?? []);
  // "Creative Specialist" members are on their own roadmap — score them against
  // its phases, not the standard client one.
  const variant = roadmapVariantFor(user.features);
  const phases = phasesFor(user.features);
  const total = totalItems(phases);
  const done = countCompleted(completed ?? [], phases);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const currentPhase = completed !== null ? getCurrentPhase(completed, phases) : null;

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
          padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: gold, fontWeight: 600,
        }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: cream, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
            {user.name || user.email}
            {variant === 'creative' && (
              <span style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase' as const, color: '#22d3ee', background: 'rgba(34,211,238,0.08)',
                border: '1px solid rgba(34,211,238,0.28)', borderRadius: 20, padding: '2px 7px',
              }}>Creative Specialist</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 3, background: 'rgba(201,164,85,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: completed !== null ? `${pct}%` : '0%',
                background: pct === 100 ? '#4ade80' : 'rgba(201,164,85,0.6)',
                borderRadius: 2, transition: 'width 0.4s',
              }} />
            </div>
            {completed !== null ? (
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: pct === 100 ? '#4ade80' : gold, flexShrink: 0 }}>
                {done}/{total}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: creamFaint, flexShrink: 0 }}>—</span>
            )}
          </div>
          {currentPhase && (
            <div style={{ marginTop: 4, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: creamFaint }}>
              {currentPhase.label} · {currentPhase.title}
            </div>
          )}
        </div>
        <span style={{ color: creamFaint, fontSize: 16, flexShrink: 0 }}>{expanded ? '−' : '+'}</span>
      </button>

      {expanded && completed !== null && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {phases.map((phase) => {
            const phaseDone = phase.items.filter((i) => completedSet.has(i.id)).length;
            const phasePct = Math.round((phaseDone / phase.items.length) * 100);
            return (
              <div key={phase.id} style={{ ...card, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: phaseDone > 0 ? cream : creamFaint }}>
                    {phase.label} · {phase.title}
                  </span>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: phasePct === 100 ? '#4ade80' : 'rgba(201,164,85,0.4)' }}>
                    {phaseDone}/{phase.items.length}
                  </span>
                </div>
                <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${phasePct}%`, background: phasePct === 100 ? '#4ade80' : 'rgba(201,164,85,0.45)', borderRadius: 2 }} />
                </div>
                {phaseDone > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                    {phase.items.filter((i) => completedSet.has(i.id)).map((i) => (
                      <span key={i.id} style={{
                        fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                        color: 'rgba(74,222,128,0.7)', background: 'rgba(74,222,128,0.06)',
                        border: '1px solid rgba(74,222,128,0.15)',
                        padding: '2px 6px', borderRadius: 4,
                      }}>✓ {i.text}</span>
                    ))}
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

function RoadmapView({ users }: { users: User[] }) {
  const active = [...users].filter((u) => u.active).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

  if (!active.length) {
    return <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: creamFaint, padding: '40px 0', textAlign: 'center' }}>No active clients.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'rgba(201,164,85,0.4)', marginBottom: 8 }}>
        {active.length} active clients — expand to see phase breakdown
      </div>
      {active.map((user) => <RoadmapClientCard key={user.email} user={user} />)}
    </div>
  );
}

/* ─── FUNNELS VIEW ────────────────────────────────────────────────────── */
function FunnelsView() {
  const [pages, setPages] = useState<PageFunnelRow[]>([]);
  const [dailyTotals, setDailyTotals] = useState<{ day: string; total: number; byPage: Record<string, number> }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [range, setRange] = useState<DateRange>(() => ({
    from: new Date(Date.now() - 30 * 86400000),
    to: new Date(),
    tz: 'eastern',
  }));

  useEffect(() => {
    setLoading(true);
    setErr('');
    const params = new URLSearchParams({
      from: range.from.getTime().toString(),
      to:   range.to.getTime().toString(),
    });
    fetch(`/api/admin/page-funnel-stats?${params}`, { signal: AbortSignal.timeout(20000) })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setPages(d.pages ?? []); setDailyTotals(d.dailyTotals ?? []); setLoading(false); })
      .catch(() => { setErr('Failed to load — request timed out or errored. Try reloading.'); setLoading(false); });
  }, [range]);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 300, color: cream, marginBottom: 6 }}>Funnels</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: creamFaint, lineHeight: 1.6 }}>
          Every real funnel page — views → optins → qualified → booked → showed → closed. Click a row for its channel
          breakdown; click Link on any page to build a UTM-tagged promo link (pick medium, pick platform, copied to
          clipboard) or grab a preview link that opens the real page without counting toward analytics.
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {err && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#e05555', marginBottom: 12 }}>{err}</div>}

      <div style={{ marginBottom: 16 }}>
        <PageFunnelTable pages={pages} loading={loading} />
      </div>

      {!loading && <DailyViewsChart data={dailyTotals} />}
    </div>
  );
}
