'use client';

import { useEffect, useState } from 'react';
import {
  Search, ChevronRight, ArrowLeft, Phone, PhoneOutgoing, CheckSquare, Map, FileText,
  Film, BookOpen, Video, StickyNote, LogIn, Flag, Award, Activity, Upload, Check, Sparkles, Plus, Trash2,
} from 'lucide-react';
import { AiChat } from '@/components/admin/ai-chat';
import { SkeletonList, CenterLoader } from '@/components/ui/loaders';
import { TodoManager } from '@/components/ui/todo-manager';
import { WeeklyReportsTab } from '@/components/admin/weekly-reports-tab';
import { TAG_CREATIVE_SPECIALIST } from '@/lib/roadmap-variant';
import { contractTierLabel, CONTRACT_TIER_LABELS } from '@/lib/client-tags';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';
const faint = '#857a67';

/* ── shared shapes (mirror lib/csm.ts) ─────────────────────────────────────── */
interface ClientHealth {
  email: string; name: string; active: boolean; last_login: number;
  activity_level: string; tags: string[]; creativeSpecialist: boolean; momentum: string | null;
  roadmap: { completed: number; total: number; currentPhase: string };
  openActionItems: number; checkins: number; lastActivityAt: string | null; totalEvents: number;
}
interface ClientEvent {
  id: string; event_type: string; title: string | null; summary: string | null;
  metadata: Record<string, unknown> | null; occurred_at: string;
}
interface Journey {
  profile: {
    email: string; name: string; active: boolean; last_login: number; created_at: number;
    start_date: number; activity_level: string; tags: string[]; revenue_goal: number; revenue_current: number;
    contract_tier: string | null; onboarded_at: number | null;
    // Raw feature allowlist — drives the Creative-Specialist-only tabs.
    features: string[];
  } | null;
  progress: { narrative: string; momentum: string | null; admin_notes: string; wins: string[] } | null;
  wins: { id: string; content: string; created_at: string }[];
  checkins: { id: string; title: string | null; coach_name: string | null; call_date: string | null; sentiment: string | null }[];
  salesCalls: { id: string; lead_name: string | null; call_date: string | null; outcome: string | null; revenue: number; cash_collected: number; icp_score: number | null; close_likelihood: number | null; call_summary: string | null }[];
  actionItems: { id: string; text: string; status: string; source: string; due_date: string | null; completed_at: string | null }[];
  roadmap: { completed: number; total: number; phases: { id: string; title: string; total: number; completed: number; items: { id: string; text: string; done: boolean }[] }[] };
  modules: { completed: number };
  onboarding: { onboardedAt: number | null; total: number; completed: number; contractTier: string | null; steps: { id: string; title: string; done: boolean; completedAt: string | null }[] };
  deliverables: { id: string; stepId: string; stepTitle: string; name: string; url: string; createdAt: string }[];
  // Creative Specialists only; null for every other client.
  weeklyReports: {
    weeks: {
      weekStart: string; weekLabel: string;
      submittedAt: string | null; sentAt: string | null; planSubmittedAt: string | null;
      completionRate: number | null; todosAssigned: number; todosCompleted: number;
      bookedCalls: number; closed: number; closeRate: number | null;
      totalCash: number; newCash: number;
      igViews7d: number; igFollowerGrowth: number; ytViews: number; ytWatchHours: number;
    }[];
    escalations: string[];
    awaitingPlan: boolean; awaitingSubmission: boolean; awaitingSend: boolean;
  } | null;
  contract: { signed: boolean; tier: string | null; signerName: string | null; signedAt: string | null; viewUrl: string | null };
  forms: string;
  formsStructured: { formId: string; title: string; items: { id: string; label: string; help?: string; answer: string }[] }[];
  events: ClientEvent[];
  summary: { total: number; lastEventAt: string | null; distinctContent: { sops: number; modules: number; recordings: number; guides: number } };
}

/* ── helpers ───────────────────────────────────────────────────────────────── */
function relTime(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = Date.now() - t;
  const day = 86400_000;
  if (d < 3600_000) return `${Math.max(1, Math.round(d / 60000))}m ago`;
  if (d < day) return `${Math.round(d / 3600_000)}h ago`;
  if (d < 30 * day) return `${Math.round(d / day)}d ago`;
  return new Date(t).toLocaleDateString();
}
function fmtDate(v: string | number | null): string {
  if (!v) return '—';
  const t = typeof v === 'number' ? v : Date.parse(v);
  if (!t || Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const MOMENTUM_COLOR: Record<string, string> = {
  accelerating: '#4ade80', steady: '#c9a455', stalling: '#f59e0b',
  at_risk: '#ef4444', positive: '#4ade80', neutral: '#c9a455', negative: '#ef4444',
};
function momentumColor(m: string | null): string {
  return (m && MOMENTUM_COLOR[m]) || faint;
}

const EVENT_META: Record<string, { icon: typeof Phone; color: string; label: string }> = {
  checkin: { icon: Phone, color: '#60a5fa', label: 'Check-in call' },
  call: { icon: Phone, color: '#60a5fa', label: 'Call' },
  sales_call: { icon: PhoneOutgoing, color: '#34d399', label: 'Sales call' },
  action_item_created: { icon: CheckSquare, color: '#c9a455', label: 'Task assigned' },
  action_item_completed: { icon: CheckSquare, color: '#4ade80', label: 'Task completed' },
  roadmap_completed: { icon: Map, color: '#4ade80', label: 'Roadmap step done' },
  roadmap_uncompleted: { icon: Map, color: faint, label: 'Roadmap step undone' },
  admin_note: { icon: StickyNote, color: '#f59e0b', label: 'Admin note' },
  login: { icon: LogIn, color: faint, label: 'Signed in' },
  onboarding_started: { icon: Flag, color: '#c9a455', label: 'Onboarding started' },
  onboarding_completed: { icon: Flag, color: '#4ade80', label: 'Onboarding completed' },
  contract_selected: { icon: FileText, color: '#4ade80', label: 'Contract selected' },
  contract_signed: { icon: FileText, color: '#4ade80', label: 'Contract signed' },
  document_uploaded: { icon: Upload, color: '#a78bfa', label: 'Document uploaded' },
  form_submitted: { icon: FileText, color: '#60a5fa', label: 'Form submitted' },
  weekly_cash_submitted: { icon: Award, color: '#4ade80', label: 'Organic cash reported' },
  weekly_report_submitted: { icon: Activity, color: '#c9a455', label: 'Weekly KPI report' },
  sop_view: { icon: FileText, color: '#a78bfa', label: 'Viewed SOP' },
  module_view: { icon: Film, color: '#a78bfa', label: 'Watched module' },
  recording_view: { icon: Video, color: '#a78bfa', label: 'Watched recording' },
  guide_view: { icon: BookOpen, color: '#a78bfa', label: 'Watched guide' },
};
function eventMeta(type: string) {
  return EVENT_META[type] || { icon: Activity, color: faint, label: type };
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.12)',
  borderRadius: 14, padding: '18px 20px',
};
const sectionLabel: React.CSSProperties = {
  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'rgba(201,164,85,0.55)', fontWeight: 600, marginBottom: 12,
};

/* ── progress bar ──────────────────────────────────────────────────────────── */
function Bar({ done, total, color = G }: { done: number; total: number; color?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: faint, minWidth: 56, textAlign: 'right' }}>{done}/{total}</span>
    </div>
  );
}

/* ── list view ─────────────────────────────────────────────────────────────── */
export function CsmView() {
  const [clients, setClients] = useState<ClientHealth[] | null>(null);
  const [search, setSearch] = useState('');
  const [creativeOnly, setCreativeOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [chat, setChat] = useState(false);

  useEffect(() => {
    fetch('/api/admin/csm')
      .then((r) => (r.ok ? r.json() : { clients: [] }))
      .then((d) => setClients(Array.isArray(d?.clients) ? d.clients : []))
      .catch(() => setClients([]));
  }, []);

  if (selected) {
    return <ClientDetail email={selected} onBack={() => setSelected(null)} />;
  }

  if (chat) {
    return (
      <div>
        <button onClick={() => setChat(false)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none',
          cursor: 'pointer', color: 'rgba(201,164,85,0.7)', fontSize: 11, letterSpacing: '0.14em',
          textTransform: 'uppercase', fontWeight: 600, padding: 0, marginBottom: 18, fontFamily: "'DM Sans', sans-serif",
        }}><ArrowLeft size={14} /> All clients</button>
        <h2 className="font-serif" style={{ fontSize: '1.5rem', color: cream, margin: '0 0 4px', fontWeight: 300 }}>Client Success Assistant</h2>
        <p style={{ fontSize: 12.5, color: sub, margin: '0 0 18px' }}>Ask anything about any client. This assistant only reads client data — calls, onboarding, roadmap, deliverables, notes — and has no access to sales or company figures.</p>
        <AiChat
          endpoint="/api/csm/chat"
          intro="Ask about any client's journey — where they're at, what's stalled, what they've done, what was said on their calls."
          suggestions={[
            'Which clients are stalling on their roadmap?',
            'Who hasn’t completed onboarding yet?',
            'Summarize the latest check-in for each active client.',
            'Which clients have open action items overdue?',
          ]}
        />
      </div>
    );
  }

  const creativeCount = (clients || []).filter((c) => c.creativeSpecialist).length;
  const filtered = (clients || []).filter(
    (c) => (!creativeOnly || c.creativeSpecialist) && (
      !search ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.name || '').toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 className="font-serif" style={{ fontSize: '1.5rem', color: cream, margin: 0, fontWeight: 300 }}>Client Success</h2>
          <p style={{ fontSize: 12.5, color: sub, margin: '4px 0 0' }}>Every client&apos;s full journey — calls, tasks, roadmap, and engagement in one place.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setChat(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.3)', color: G,
            fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap',
          }}><Sparkles size={14} /> Ask AI</button>
          <div style={{ position: 'relative', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: faint }} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients…"
              style={{
                width: '100%', padding: '9px 12px 9px 32px', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.15)',
                borderRadius: 8, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* tag filter — one chip per audience we look at as a group */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([[false, `All clients${clients ? ` (${clients.length})` : ''}`], [true, `Creative Specialists${clients ? ` (${creativeCount})` : ''}`]] as [boolean, string][]).map(([on, label]) => (
          <button
            key={label}
            onClick={() => setCreativeOnly(on)}
            style={{
              padding: '6px 13px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em',
              background: creativeOnly === on ? 'rgba(201,164,85,0.14)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${creativeOnly === on ? 'rgba(201,164,85,0.4)' : 'rgba(201,164,85,0.12)'}`,
              color: creativeOnly === on ? G : faint,
            }}
          >{label}</button>
        ))}
      </div>

      {clients === null ? (
        <SkeletonList rows={6} />
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: sub, fontSize: 13 }}>No clients found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((c) => (
            <button
              key={c.email}
              onClick={() => setSelected(c.email)}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(160px, 1.6fr) 1fr 1fr 0.8fr auto',
                alignItems: 'center', gap: 16, width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '14px 18px', background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(201,164,85,0.1)', borderRadius: 12, color: 'inherit',
                fontFamily: "'DM Sans', sans-serif",
              }}
              className="csm-row"
            >
              {/* identity */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name || c.email}
                  {!c.active && <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 8 }}>inactive</span>}
                </div>
                <div style={{ fontSize: 11.5, color: faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
              </div>
              {/* roadmap */}
              <div>
                <div style={{ fontSize: 10, color: faint, marginBottom: 4 }}>{c.roadmap.currentPhase}</div>
                <Bar done={c.roadmap.completed} total={c.roadmap.total} />
              </div>
              {/* engagement */}
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: sub }}>
                <span title="Check-in calls"><Phone size={12} style={{ verticalAlign: -1, color: faint }} /> {c.checkins}</span>
                <span title="Open action items"><CheckSquare size={12} style={{ verticalAlign: -1, color: faint }} /> {c.openActionItems}</span>
              </div>
              {/* momentum */}
              <div>
                {c.momentum ? (
                  <span style={{
                    fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
                    color: momentumColor(c.momentum), background: `${momentumColor(c.momentum)}18`,
                    padding: '3px 9px', borderRadius: 20,
                  }}>{c.momentum.replace('_', ' ')}</span>
                ) : <span style={{ fontSize: 11, color: faint }}>—</span>}
              </div>
              {/* last activity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: faint, whiteSpace: 'nowrap' }}>{relTime(c.lastActivityAt)}</span>
                <ChevronRight size={15} style={{ color: faint }} />
              </div>
            </button>
          ))}
        </div>
      )}
      <style>{`.csm-row:hover { border-color: rgba(201,164,85,0.32) !important; background: rgba(201,164,85,0.04) !important; }`}</style>
    </div>
  );
}

/* ── detail view ───────────────────────────────────────────────────────────── */
function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div style={{ ...card, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: faint, marginBottom: 6 }}>{label}</div>
      <div className="font-serif" style={{ fontSize: '1.5rem', color: cream, lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: faint, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

// A line is a section header if it's a short ALL-CAPS label (e.g. "RED FLAGS").
function isHeaderLine(s: string): boolean {
  const t = s.trim();
  return /^[A-Z][A-Z0-9 &/'’-]{2,40}$/.test(t) && !/[.?!]$/.test(t);
}

// Renders the summary with prominent section headers (RED FLAGS in red).
function SummaryBody({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div>
      {lines.map((ln, i) => {
        const t = ln.trim();
        if (!t) return <div key={i} style={{ height: 8 }} />;
        if (isHeaderLine(t)) {
          const red = /red flag/i.test(t);
          return (
            <div key={i} style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: red ? '#ef4444' : G, marginTop: i ? 14 : 0, marginBottom: 4 }}>
              {t}
            </div>
          );
        }
        return <div key={i} style={{ fontSize: 13.5, color: '#d9cfba', lineHeight: 1.6 }}>{t}</div>;
      })}
    </div>
  );
}

// Journey summary tab — auto-generates on first open if not cached, regenerable.
function JourneySummaryTab({ email }: { email: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/clients/${encodeURIComponent(email)}/summary`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.summary) { setSummary(d.summary); setGeneratedAt(d.generatedAt ?? null); }
    } finally { setBusy(false); }
  };

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/clients/${encodeURIComponent(email)}/summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d?.summary) { setSummary(d.summary); setGeneratedAt(d.generatedAt ?? null); setBusy(false); }
        else generate(); // pre-generate on first open
      })
      .catch(() => { if (alive) generate(); });
    return () => { alive = false; };
  }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <span style={{ ...sectionLabel, marginBottom: 0, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Sparkles size={13} style={{ color: G }} /> Journey summary
        </span>
        <button onClick={generate} disabled={busy} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontFamily: "'DM Sans', sans-serif",
          color: G, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.28)', borderRadius: 8,
          padding: '6px 12px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        }}>{busy ? 'Generating…' : 'Regenerate'}</button>
      </div>
      {busy && !summary ? (
        <div style={{ fontSize: 12.5, color: faint }}>Composing this client&apos;s journey summary…</div>
      ) : summary ? (
        <>
          <SummaryBody text={summary} />
          {generatedAt && <div style={{ fontSize: 10.5, color: faint, marginTop: 14 }}>Generated {relTime(generatedAt)}</div>}
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: faint }}>Couldn&apos;t generate a summary — try Regenerate.</div>
      )}
    </div>
  );
}

// Admin: assign a new action item (with optional deadline) to a client.
const CHECKIN_COACHES = ['SooWei', 'Kim', 'Aidan', 'George'];

// Manually attach a Fathom check-in call to this client. Pulls the transcript
// from the URL and runs it through the same AI pipeline as auto-ingested calls.
function AddCheckInForm({ email, onAdded }: { email: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [url, setUrl] = useState('');
  const [coach, setCoach] = useState('');
  const [transcript, setTranscript] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const fieldStyle: React.CSSProperties = {
    padding: '8px 11px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.18)',
    borderRadius: 8, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none',
  };

  const canAdd = !!coach && (!!url.trim() || !!transcript.trim()) && !saving;

  const add = async () => {
    if (!canAdd) return;
    setSaving(true);
    setMsg(transcript.trim() ? 'Analyzing transcript…' : 'Fetching transcript & analyzing…');
    try {
      const res = await fetch(`/api/admin/clients/${encodeURIComponent(email)}/checkins`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: date || null, fathomUrl: url.trim(), coach, transcript: transcript.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setDate(''); setUrl(''); setCoach(''); setTranscript(''); setMsg(''); setOpen(false); onAdded(); }
      else setMsg(d.error || 'Failed to add check-in.');
    } catch { setMsg('Failed to add check-in.'); }
    setSaving(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '7px 13px', borderRadius: 8,
        background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.3)', color: G,
        fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, cursor: 'pointer',
      }}><Plus size={14} /> Add check-in call</button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Fathom call URL (team account)" style={fieldStyle} />
      <div style={{ fontSize: 10.5, color: faint, textAlign: 'center', letterSpacing: '0.08em' }}>— or paste the transcript (works for any account/platform) —</div>
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste the full call transcript here… (handles 2–3 hour calls)"
        rows={5}
        style={{ ...fieldStyle, resize: 'vertical', minHeight: 90, lineHeight: 1.5 }}
      />
      {transcript.trim() && <div style={{ fontSize: 10.5, color: faint, textAlign: 'right' }}>{transcript.trim().length.toLocaleString()} characters</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title="Call date" style={{ ...fieldStyle, colorScheme: 'dark' }} />
        <select value={coach} onChange={(e) => setCoach(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
          <option value="">Coach…</option>
          {CHECKIN_COACHES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={add} disabled={!canAdd} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
          background: G, border: 'none', color: '#0a0806', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700,
          cursor: canAdd ? 'pointer' : 'default', opacity: canAdd ? 1 : 0.5,
        }}><Plus size={14} /> {saving ? 'Adding…' : 'Add'}</button>
        <button onClick={() => { setOpen(false); setMsg(''); }} style={{ background: 'none', border: 'none', color: faint, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
      </div>
      {msg && <span style={{ fontSize: 11.5, color: (msg.includes('Failed') || msg.includes('Couldn') || msg.includes('Provide')) ? '#ef4444' : faint }}>{msg}</span>}
    </div>
  );
}

// A single check-in row with a delete control. Deleting removes the check-in plus
// the AI action items + timeline event it generated (see DELETE /api/admin/checkins/[id]).
function CheckInRow({ c, onDeleted }: {
  c: { id: string; title: string | null; coach_name: string | null; call_date: string | null };
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (deleting) return;
    if (!confirm('Delete this check-in? This removes the call, its AI action items, and its timeline entry. (The client progress summary is kept.)')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/checkins/${c.id}`, { method: 'DELETE' });
      if (res.ok) onDeleted();
      else setDeleting(false);
    } catch { setDeleting(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5, opacity: deleting ? 0.5 : 1 }}>
      <span style={{ color: '#d9cfba', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.title || 'Check-in'}{c.coach_name ? ` · ${c.coach_name}` : ''}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: faint }}>{fmtDate(c.call_date)}</span>
        <button
          onClick={remove}
          disabled={deleting}
          title="Delete check-in"
          style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: deleting ? 'default' : 'pointer', color: 'rgba(239,68,68,0.55)', padding: 2 }}
          onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.color = 'rgba(239,68,68,0.95)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(239,68,68,0.55)'; }}
        >
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  );
}

// Member's end-of-month accountability submissions (self-fetching, like the
// journey summary tab). Read-only.
interface MonthlyForm {
  id: string; period: string; cash_collected: number | null;
  ig_reels_posted: number | null; yt_videos_posted: number | null;
  a_plus_problem: string | null; submitted_at: string;
}
function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return y && m ? `${names[m - 1]} ${y}` : period;
}
function MonthlyReportsCard({ email }: { email: string }) {
  const [forms, setForms] = useState<MonthlyForm[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/clients/${encodeURIComponent(email)}/monthly-forms`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (alive) setForms(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setForms([]); });
    return () => { alive = false; };
  }, [email]);

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <div style={sectionLabel}>Monthly reports</div>
      {forms === null ? (
        <div style={{ fontSize: 12.5, color: faint }}>Loading…</div>
      ) : forms.length === 0 ? (
        <div style={{ fontSize: 12.5, color: faint }}>No monthly forms submitted yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {forms.map((f) => (
            <div key={f.id} style={{ borderTop: '1px solid rgba(201,164,85,0.1)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: cream }}>{monthLabel(f.period)}</span>
                <span style={{ fontSize: 10.5, color: faint }}>submitted {relTime(f.submitted_at)}</span>
              </div>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: f.a_plus_problem ? 8 : 0 }}>
                <span style={{ fontSize: 12.5, color: '#d9cfba' }}>
                  <span style={{ color: faint }}>Cash: </span>${(f.cash_collected ?? 0).toLocaleString()}
                </span>
                <span style={{ fontSize: 12.5, color: '#d9cfba' }}>
                  <span style={{ color: faint }}>IG reels: </span>{f.ig_reels_posted ?? 0}
                </span>
                <span style={{ fontSize: 12.5, color: '#d9cfba' }}>
                  <span style={{ color: faint }}>YT videos: </span>{f.yt_videos_posted ?? 0}
                </span>
              </div>
              {f.a_plus_problem && (
                <div style={{ fontSize: 12.5, color: '#d9cfba', lineHeight: 1.55 }}>
                  <span style={{ color: G, fontWeight: 600 }}>A+ problem: </span>{f.a_plus_problem}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── weekly report digest (Creative Specialists, on the Overview tab) ───────── */
// The week's dot colours by commitment completion — the leading indicator.
function wrBandColor(rate: number | null): string {
  if (rate === null) return 'rgba(255,255,255,0.18)';
  if (rate >= 85) return '#4ade80';
  if (rate >= 70) return '#f59e0b';
  return '#ef4444';
}
const stat = (label: string, value: string) => (
  <span key={label} style={{ fontSize: 12.5, color: '#d9cfba' }}>
    <span style={{ color: faint }}>{label}: </span>{value}
  </span>
);

function WeeklyReportsCard({ wr, onOpen }: {
  wr: NonNullable<Journey['weeklyReports']>;
  onOpen: () => void;
}) {
  // Read in cadence order: Wednesday plan → Friday report → send.
  const todo = [
    wr.awaitingPlan ? 'Waiting on this week’s Wednesday plan' : null,
    wr.awaitingSubmission ? 'Waiting on this week’s Friday report' : null,
    !wr.awaitingSubmission && wr.awaitingSend ? 'Friday report in — ready to send to the founder' : null,
  ].filter(Boolean).join(' · ') || null;

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={sectionLabel}>Weekly reports</div>
        <button onClick={onOpen} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: -6,
          color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 11.5,
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>Open the report <ChevronRight size={13} /></button>
      </div>

      {wr.escalations.map((t) => (
        <div key={t} style={{
          marginBottom: 10, padding: '9px 12px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.55,
          color: '#fca5a5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
        }}>{t}</div>
      ))}

      {todo && (
        <div style={{
          marginBottom: 12, padding: '9px 12px', borderRadius: 10, fontSize: 12.5,
          color: '#f0d9a8', background: 'rgba(201,164,85,0.07)', border: '1px dashed rgba(201,164,85,0.3)',
        }}>{todo}</div>
      )}

      {wr.weeks.length === 0 ? (
        <div style={{ fontSize: 12.5, color: faint }}>
          No weekly reports yet. The Wednesday and Friday prompts ask them to submit.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {wr.weeks.slice(0, 5).map((w) => (
            <div key={w.weekStart} style={{ borderTop: '1px solid rgba(201,164,85,0.1)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7, flexWrap: 'wrap' }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: wrBandColor(w.completionRate),
                }} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: cream }}>{w.weekLabel}</span>
                {/* Which of the two reports came in for this week. */}
                <span style={{ fontSize: 10, color: w.planSubmittedAt ? '#4ade80' : faint }}>
                  Wed {w.planSubmittedAt ? '✓' : '—'}
                </span>
                <span style={{ fontSize: 10, color: w.submittedAt ? '#4ade80' : faint }}>
                  Fri {w.submittedAt ? '✓' : '—'}
                </span>
                <span style={{ fontSize: 10.5, color: faint }}>
                  {w.sentAt ? `sent ${relTime(w.sentAt)}` : w.submittedAt ? `submitted ${relTime(w.submittedAt)}` : 'draft'}
                </span>
              </div>
              {/* Friday numbers. Commitment first — it's the leading indicator. */}
              {w.submittedAt ? (
                <>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 5 }}>
                    {stat('To-dos', w.completionRate === null
                      ? 'none assigned'
                      : `${w.completionRate}% (${w.todosCompleted}/${w.todosAssigned})`)}
                    {stat('Booked', String(w.bookedCalls))}
                    {stat('Closed', w.closeRate === null ? String(w.closed) : `${w.closed} · ${w.closeRate}%`)}
                    {stat('Cash', `$${w.totalCash.toLocaleString()}${w.newCash ? ` (new $${w.newCash.toLocaleString()})` : ''}`)}
                  </div>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    {stat('IG views (7d)', w.igViews7d.toLocaleString())}
                    {stat('IG followers', `${w.igFollowerGrowth > 0 ? '+' : ''}${w.igFollowerGrowth.toLocaleString()}`)}
                    {stat('YT views', w.ytViews.toLocaleString())}
                    {stat('YT watch hrs', w.ytWatchHours.toLocaleString())}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: faint }}>
                  {w.planSubmittedAt
                    ? `Plan is in for ${w.todosAssigned} to-do${w.todosAssigned === 1 ? '' : 's'}; no Friday numbers yet.`
                    : 'No numbers yet.'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientDetail({ email, onBack }: { email: string; onBack: () => void }) {
  const [j, setJ] = useState<Journey | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<'overview' | 'onboarding' | 'weekly' | 'deliverables' | 'summary'>('overview');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch(`/api/admin/clients/${encodeURIComponent(email)}/journey`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setJ)
      .catch(() => setErr(true));
  }, [email, reload]);

  const back = (
    <button onClick={onBack} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none',
      cursor: 'pointer', color: 'rgba(201,164,85,0.7)', fontSize: 11, letterSpacing: '0.14em',
      textTransform: 'uppercase', fontWeight: 600, padding: 0, marginBottom: 20, fontFamily: "'DM Sans', sans-serif",
    }}><ArrowLeft size={14} /> All clients</button>
  );

  if (err) return <div>{back}<div style={{ color: sub, fontSize: 13 }}>Couldn&apos;t load this client&apos;s journey.</div></div>;
  if (!j) return <div>{back}<CenterLoader label="Loading journey…" minHeight="50vh" /></div>;

  const p = j.profile;
  const dc = j.summary.distinctContent;
  const openItems = j.actionItems.filter((a) => a.status === 'open');
  const doneItems = j.actionItems.filter((a) => a.status === 'completed');

  type TabId = 'overview' | 'onboarding' | 'weekly' | 'deliverables' | 'summary';
  const tabs: [TabId, string][] = [
    ['overview', 'Overview'],
    ['onboarding', 'Onboarding'],
    ...((p?.features ?? []).includes(TAG_CREATIVE_SPECIALIST) ? ([['weekly', 'Weekly reports']] as [TabId, string][]) : []),
    ['deliverables', 'Deliverables'],
    ['summary', 'Summary'],
  ];

  return (
    <div>
      {back}

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h2 className="font-serif" style={{ fontSize: '1.8rem', color: cream, margin: 0, fontWeight: 300 }}>{p?.name || email}</h2>
          <div style={{ fontSize: 12.5, color: sub, marginTop: 3 }}>{email}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {p?.contract_tier && (
              <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', padding: '2px 9px', borderRadius: 20, fontWeight: 600 }}>
                {contractTierLabel(p.contract_tier)}
              </span>
            )}
            {(p?.tags || []).map((t) => (
              <span key={t} style={{ fontSize: 10, color: G, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.2)', padding: '2px 9px', borderRadius: 20 }}>{CONTRACT_TIER_LABELS[t] ?? t.replace('_', ' ')}</span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: sub, lineHeight: 1.7 }}>
          <div>Started <strong style={{ color: cream }}>{fmtDate(p?.start_date || p?.created_at || null)}</strong></div>
          <div>Last login {relTime(p?.last_login ? new Date(p.last_login).toISOString() : null)}</div>
          {j.progress?.momentum && (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, color: momentumColor(j.progress.momentum), background: `${momentumColor(j.progress.momentum)}18`, padding: '3px 9px', borderRadius: 20 }}>
                {j.progress.momentum.replace('_', ' ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* tabs — the weekly KPI report only exists for Creative Specialists */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 22, borderBottom: '1px solid rgba(201,164,85,0.12)' }}>
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: tab === t ? G : faint, borderBottom: `2px solid ${tab === t ? G : 'transparent'}`, marginBottom: -1,
          }}>{label}{t === 'deliverables' && j.deliverables.length > 0 ? ` (${j.deliverables.length})` : ''}</button>
        ))}
      </div>

      {tab === 'overview' && (<>
      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Roadmap" value={`${j.roadmap.total ? Math.round((j.roadmap.completed / j.roadmap.total) * 100) : 0}%`} hint={`${j.roadmap.completed}/${j.roadmap.total} steps`} />
        <StatCard label="Modules done" value={j.modules.completed} />
        <StatCard label="Check-ins" value={j.checkins.length} />
        <StatCard label="To-dos" value={openItems.length} hint={`${doneItems.length} completed`} />
        <StatCard label="Content viewed" value={dc.sops + dc.modules + dc.recordings + dc.guides} hint={`${dc.modules} mod · ${dc.sops} sop · ${dc.recordings} rec`} />
      </div>

      {/* admin notes / narrative */}
      {(j.progress?.admin_notes || j.progress?.narrative) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
          {j.progress?.narrative && (
            <div style={card}>
              <div style={sectionLabel}>Where they&apos;re at</div>
              <div style={{ fontSize: 13.5, color: '#d9cfba', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{j.progress.narrative}</div>
            </div>
          )}
          {j.progress?.admin_notes && (
            <div style={{ ...card, borderColor: 'rgba(248,113,113,0.22)' }}>
              <div style={{ ...sectionLabel, color: 'rgba(248,113,113,0.7)' }}>Admin notes · red flags</div>
              <div style={{ fontSize: 13.5, color: '#e8c9c9', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{j.progress.admin_notes}</div>
            </div>
          )}
        </div>
      )}

      {/* roadmap phases */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={sectionLabel}>Roadmap progression</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {j.roadmap.phases.map((ph) => (
            <div key={ph.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 2fr', gap: 14, alignItems: 'center' }}>
              <div style={{ fontSize: 12.5, color: ph.completed === ph.total && ph.total ? '#4ade80' : cream }}>{ph.title}</div>
              <Bar done={ph.completed} total={ph.total} color={ph.completed === ph.total && ph.total ? '#4ade80' : G} />
            </div>
          ))}
        </div>
      </div>

      {/* check-in calls (action items are now unified into the To-dos section below) */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={sectionLabel}>Check-in calls</div>
        {j.checkins.length === 0 ? <div style={{ fontSize: 12.5, color: faint }}>None yet.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {j.checkins.slice(0, 10).map((c) => (
              <CheckInRow key={c.id} c={c} onDeleted={() => setReload((r) => r + 1)} />
            ))}
          </div>
        )}
        <AddCheckInForm email={email} onAdded={() => setReload((r) => r + 1)} />
      </div>

      {/* weekly KPI reports — Creative Specialists only */}
      {j.weeklyReports && <WeeklyReportsCard wr={j.weeklyReports} onOpen={() => setTab('weekly')} />}

      {/* monthly accountability reports */}
      <MonthlyReportsCard email={email} />

      {/* client to-dos (same list the client manages from their bubble) */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={sectionLabel}>To-dos</div>
        <TodoManager apiBase={`/api/admin/clients/${encodeURIComponent(email)}/todos`} list="individual" />
      </div>

      {/* sales calls (attributed by matching email) */}
      {j.salesCalls.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={sectionLabel}>Sales calls</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {j.salesCalls.slice(0, 10).map((s) => {
              const closed = s.outcome === 'closed';
              const oColor = closed ? '#4ade80' : s.outcome === 'no_show' || s.outcome === 'dq' ? '#ef4444' : '#f59e0b';
              return (
                <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
                  <PhoneOutgoing size={14} style={{ flexShrink: 0, marginTop: 2, color: '#34d399' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: cream }}>{s.lead_name || 'Sales call'}</span>
                      <span style={{ fontSize: 10.5, color: faint }}>{fmtDate(s.call_date)}</span>
                      {s.outcome && <span style={{ fontSize: 10, color: oColor, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.outcome.replace('_', ' ')}</span>}
                      {s.icp_score != null && <span style={{ fontSize: 10, color: sub }}>ICP {s.icp_score}</span>}
                      {s.revenue > 0 && <span style={{ fontSize: 10.5, color: '#4ade80' }}>${s.revenue.toLocaleString()}</span>}
                    </div>
                    {s.call_summary && <div style={{ fontSize: 12, color: '#d9cfba', lineHeight: 1.5, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.call_summary}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* wins */}
      {j.wins.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={sectionLabel}>Wins</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {j.wins.slice(0, 8).map((w) => (
              <div key={w.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13 }}>
                <Award size={14} style={{ flexShrink: 0, marginTop: 2, color: '#4ade80' }} />
                <span style={{ color: '#d9cfba' }}>{w.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* timeline */}
      <div style={card}>
        <div style={sectionLabel}>Journey timeline</div>
        {j.events.length === 0 ? (
          <div style={{ fontSize: 12.5, color: faint }}>No tracked activity yet. Events appear here as the client interacts with the program.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {j.events.map((e, i) => {
              const m = eventMeta(e.event_type);
              const Icon = m.icon;
              const isCheckpoint = !!(e.metadata && (e.metadata as { phase_completed?: boolean }).phase_completed);
              return (
                <div key={e.id} style={{ display: 'flex', gap: 12, paddingBottom: i === j.events.length - 1 ? 0 : 14 }}>
                  {/* rail */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: `${m.color}18`, border: `1px solid ${m.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.color }}>
                      <Icon size={13} />
                    </div>
                    {i !== j.events.length - 1 && <div style={{ width: 1, flex: 1, background: 'rgba(201,164,85,0.12)', marginTop: 4 }} />}
                  </div>
                  {/* content */}
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: m.color, fontWeight: 600 }}>
                        {m.label}{isCheckpoint && <span style={{ color: '#4ade80', marginLeft: 6 }}>✦ checkpoint</span>}
                      </span>
                      <span style={{ fontSize: 11, color: faint, flexShrink: 0 }}>{relTime(e.occurred_at)}</span>
                    </div>
                    {e.title && <div style={{ fontSize: 13, color: '#d9cfba', marginTop: 2, lineHeight: 1.4 }}>{e.title}</div>}
                    {e.summary && <div style={{ fontSize: 12, color: faint, marginTop: 2, lineHeight: 1.5 }}>{e.summary}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>)}

      {tab === 'onboarding' && <OnboardingTab j={j} />}
      {/* Saving a review / marking a report sent changes the Overview digest too,
          so refetch the journey behind it. */}
      {tab === 'weekly' && <WeeklyReportsTab email={email} onChanged={() => setReload((r) => r + 1)} />}
      {tab === 'deliverables' && <DeliverablesTab j={j} />}
      {tab === 'summary' && <JourneySummaryTab email={email} />}
    </div>
  );
}

/* ── onboarding tab ────────────────────────────────────────────────────────── */
function OnboardingTab({ j }: { j: Journey }) {
  const o = j.onboarding;
  const complete = !!o.onboardedAt;
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{
          fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, padding: '4px 11px', borderRadius: 20,
          color: complete ? '#4ade80' : G, background: complete ? 'rgba(74,222,128,0.14)' : 'rgba(201,164,85,0.12)',
          border: `1px solid ${complete ? 'rgba(74,222,128,0.35)' : 'rgba(201,164,85,0.3)'}`,
        }}>{complete ? 'Onboarding complete' : 'In progress'}</span>
        {o.contractTier && <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', padding: '4px 11px', borderRadius: 20, fontWeight: 600 }}>{contractTierLabel(o.contractTier)}</span>}
        {complete && <span style={{ fontSize: 12, color: faint }}>Finished {fmtDate(o.onboardedAt)}</span>}
      </div>
      <div style={card}>
        <div style={sectionLabel}>Onboarding steps · {o.completed}/{o.total}</div>
        <div style={{ marginBottom: 16 }}><Bar done={o.completed} total={o.total} color={complete ? '#4ade80' : G} /></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {o.steps.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 2px', borderTop: i === 0 ? 'none' : '1px solid rgba(201,164,85,0.07)' }}>
              <span style={{
                flexShrink: 0, width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: s.done ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${s.done ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.12)'}`,
                color: s.done ? '#4ade80' : faint,
              }}>{s.done ? <Check size={12} /> : i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: s.done ? cream : sub }}>{s.title}</span>
              <span style={{ fontSize: 11, color: faint, flexShrink: 0 }}>{s.done ? fmtDate(s.completedAt) : 'Pending'}</span>
            </div>
          ))}
        </div>
      </div>

      {j.formsStructured?.length ? (
        j.formsStructured.map((form) => (
          <div key={form.formId} style={{ ...card, marginTop: 12 }}>
            <div style={sectionLabel}>{form.title} · {form.items.length} responses</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {form.items.map((item, i) => (
                <div
                  key={item.id}
                  style={{
                    padding: i === 0 ? '0 0 14px' : '14px 0',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(201,164,85,0.1)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: cream, lineHeight: 1.45, marginBottom: item.help ? 3 : 6 }}>
                    {item.label}
                  </div>
                  {item.help && (
                    <div style={{ fontSize: 11.5, color: faint, lineHeight: 1.4, marginBottom: 6, fontStyle: 'italic' }}>{item.help}</div>
                  )}
                  <div style={{ fontSize: 13, color: '#d9cfba', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.answer}</div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : j.forms ? (
        <div style={{ ...card, marginTop: 12 }}>
          <div style={sectionLabel}>Onboarding form responses</div>
          <div style={{ fontSize: 13, color: '#d9cfba', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{j.forms}</div>
        </div>
      ) : null}
    </div>
  );
}

/* ── deliverables tab ──────────────────────────────────────────────────────── */
function DeliverablesTab({ j }: { j: Journey }) {
  const d = j.deliverables;
  return (
    <div>
      {j.contract.signed ? (
        <a
          href={j.contract.viewUrl || undefined}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...card, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', cursor: j.contract.viewUrl ? 'pointer' : 'default' }}
        >
          <FileText size={16} style={{ color: '#4ade80', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: cream }}>Signed contract{j.contract.tier ? ` · ${contractTierLabel(j.contract.tier)}` : ''}</div>
            <div style={{ fontSize: 11.5, color: faint }}>
              {j.contract.signerName ? `Signed by ${j.contract.signerName}` : 'Signed'}{j.contract.signedAt ? ` · ${fmtDate(j.contract.signedAt)}` : ''}
            </div>
          </div>
          {j.contract.viewUrl && <span style={{ fontSize: 11.5, color: G, flexShrink: 0 }}>View PDF →</span>}
        </a>
      ) : j.onboarding.contractTier ? (
        <div style={{ ...card, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileText size={16} style={{ color: faint, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: cream }}>Contract selected · {contractTierLabel(j.onboarding.contractTier)}</div>
            <div style={{ fontSize: 11.5, color: faint }}>Not signed yet.</div>
          </div>
        </div>
      ) : null}
      <div style={card}>
        <div style={sectionLabel}>Uploaded documents</div>
        {d.length === 0 ? (
          <div style={{ fontSize: 12.5, color: faint }}>No documents uploaded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.12)', textDecoration: 'none' }}>
                <FileText size={15} style={{ color: G, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: faint }}>{f.stepTitle}</div>
                </div>
                <span style={{ fontSize: 11, color: faint, flexShrink: 0 }}>{fmtDate(f.createdAt)}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
