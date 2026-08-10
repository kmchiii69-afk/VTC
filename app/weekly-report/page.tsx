'use client';

// The Creative Specialist weekly reports. Two per week, both reachable every day
// of the week via ?kind= (the Discord prompts and the /select tiles both link
// straight to one), with a toggle under the week title to switch:
//
//   Wednesday — this week's to-dos with an implementation each, plus the steps
//               they'll take to finish them
//   Friday    — Sales, Content (Instagram + YouTube) and Commitment
//
// The to-do sections aren't typed: they read off the member's actual to-do list.
// Drafts save automatically, so a half-filled report is never lost.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Send } from 'lucide-react';
import { MeshBg } from '@/components/ui/mesh-bg';
import { CenterLoader } from '@/components/ui/loaders';
import {
  ReportSectionCard, EscalationBanner, BAND_COLOR, cardStyle,
} from '@/components/weekly-report/report-fields';
import {
  sectionsFor, derive, prevWeek, currentReportWeek, isReportKind, DEFAULT_REPORT_KIND,
  REPORT_KINDS, KIND_META,
  type Derived, type Missing, type ReportAnswers, type ReportKind, type WeekActionItem,
} from '@/lib/creative-weekly-report';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';
const faint = '#857a67';

interface HistoryWeek { weekStart: string; weekLabel: string; submittedAt: string | null; sentAt: string | null }

interface ReportState {
  kind: ReportKind;
  kindLabel: string;
  weekStart: string;
  weekLabel: string;
  weekNumber: number;
  answers: ReportAnswers;
  actionItems: WeekActionItem[];
  submittedAt: string | null;
  sentAt: string | null;
  weekStatus: Record<ReportKind, boolean>;
  missing: Missing[];
  escalations: string[];
  history: HistoryWeek[];
}

const ctaBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
  padding: '13px 24px', background: G, border: 'none', borderRadius: 12, color: '#0a0806',
  fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 700, letterSpacing: '0.02em',
};

const weekNavBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'rgba(201,164,85,0.07)', border: '1px solid rgba(201,164,85,0.2)',
  borderRadius: 9, padding: '6px 12px', color: G, cursor: 'pointer',
  fontFamily: "'DM Sans', sans-serif", fontSize: 11.5,
};

// Reads the URL and mounts a fresh view per (report, week). Keying the remount
// is what clears the previous report's draft state — switching Wednesday ⇄ Friday
// or stepping back a week starts clean, with no stale answers bleeding across.
function WeeklyReport() {
  const params = useSearchParams();
  const weekParam = params.get('week') || '';
  const kindParam = params.get('kind') || '';
  // Which report the URL asks for; the server falls back the same way, so the
  // toggle can highlight the right pill before the fetch lands.
  const kind: ReportKind = isReportKind(kindParam) ? kindParam : DEFAULT_REPORT_KIND;
  return <ReportView key={`${kind}:${weekParam}`} weekParam={weekParam} kind={kind} />;
}

function ReportView({ weekParam, kind }: { weekParam: string; kind: ReportKind }) {
  const router = useRouter();

  const [state, setState] = useState<ReportState | null>(null);
  const [answers, setAnswers] = useState<ReportAnswers>({});
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState<Missing[]>([]);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const weekRef = useRef('');
  const kindRef = useRef<ReportKind>(kind);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ kind, ...(weekParam ? { week: weekParam } : {}) });
    fetch(`/api/me/weekly-report?${qs}`, { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) { router.replace('/'); return null; }
        if (r.status === 403) { setForbidden(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d: ReportState | null) => {
        if (!d) return;
        weekRef.current = d.weekStart;
        kindRef.current = d.kind;
        setState(d);
        setAnswers(d.answers ?? {});
        setMissing(d.missing ?? []);
      })
      .catch(() => setError('Could not load your report — refresh to try again.'));
  }, [router, kind, weekParam]);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback(async (payload: ReportAnswers) => {
    if (!weekRef.current) return;
    setSaving('saving');
    try {
      const res = await fetch('/api/me/weekly-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart: weekRef.current, kind: kindRef.current, answers: payload }),
      });
      setSaving(res.ok ? 'saved' : 'idle');
      // Don't let a failing autosave stay silent — the member would keep typing
      // into a draft that isn't being kept.
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Your draft isn't saving — check your connection.");
      }
    } catch { setSaving('idle'); setError("Your draft isn't saving — check your connection."); }
  }, []);

  // Debounced autosave.
  const change = (key: string, value: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(next), 900);
      return next;
    });
    setError('');
  };

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // The engagement week number needs the member's start date, which only the
  // server has — take it from the payload rather than letting derive() fall back
  // to the ISO week number. Everything else recomputes locally as they type.
  const derived: Derived = useMemo(
    () => ({
      ...derive(answers, state?.weekStart ?? currentReportWeek(), { actionItems: state?.actionItems }),
      ...(state ? { weekNumber: state.weekNumber } : {}),
    }),
    [answers, state],
  );

  const submit = async () => {
    if (!state || submitting) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/me/weekly-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart: state.weekStart, kind: state.kind, answers, submit: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setMissing([]);
        setJustSubmitted(true);
        setState((s) => (s ? {
          ...s,
          submittedAt: d.submittedAt ?? new Date().toISOString(),
          weekStatus: { ...s.weekStatus, [s.kind]: true },
        } : s));
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setMissing(Array.isArray(d.missing) ? d.missing : []);
      setError(d.error || 'Could not submit — try again.');
    } catch {
      setError('Connection error — try again.');
    } finally { setSubmitting(false); }
  };

  if (forbidden) {
    return (
      <Shell>
        <div style={{ ...cardStyle, maxWidth: 520, margin: '18vh auto 0', textAlign: 'center' }}>
          <h1 className="font-serif" style={{ fontSize: '1.6rem', color: cream, fontWeight: 300, margin: '0 0 10px' }}>
            Not your report
          </h1>
          <p style={{ fontSize: 13.5, color: sub, lineHeight: 1.65, margin: '0 0 20px' }}>
            The weekly report is for Creative Specialists. If you should have access, ask your Client Success Manager.
          </p>
          <button onClick={() => router.push('/select')} style={ctaBtn}>Back to your dashboard</button>
        </div>
      </Shell>
    );
  }

  if (!state) return <Shell><CenterLoader label="Loading your weekly report…" minHeight="100vh" /></Shell>;

  const isSubmitted = !!state.submittedAt;
  const go = (week: string, which: ReportKind = state.kind) =>
    router.push(`/weekly-report?kind=${which}&week=${week}`);
  const goWeek = (week: string) => go(week);
  const nextWeekStart = new Date(new Date(`${state.weekStart}T00:00:00Z`).getTime() + 7 * 86400000)
    .toISOString().slice(0, 10);
  const canGoForward = nextWeekStart <= currentReportWeek();

  return (
    <Shell>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '64px 20px 90px' }}>
        <button
          onClick={() => router.push('/select')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none',
            cursor: 'pointer', color: 'rgba(201,164,85,0.55)', fontFamily: "'DM Sans', sans-serif",
            fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600,
            padding: 0, marginBottom: 22,
          }}
        ><ArrowLeft size={14} /> Menu</button>

        {/* Which report — the first choice on the page, one card each so neither is
            possible to miss. A tick means that one is already in for this week. */}
        <div style={{
          display: 'grid', gap: 10, marginBottom: 22,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
        }}>
          {REPORT_KINDS.map((k) => {
            const active = state.kind === k;
            const done = state.weekStatus?.[k];
            return (
              <button
                key={k}
                onClick={() => { if (!active) go(state.weekStart, k); }}
                style={{
                  textAlign: 'left', padding: '14px 16px', borderRadius: 14,
                  cursor: active ? 'default' : 'pointer', transition: 'all 0.18s',
                  fontFamily: "'DM Sans', sans-serif",
                  background: active ? 'rgba(201,164,85,0.1)' : 'rgba(0,0,0,0.28)',
                  border: `1px solid ${active ? 'rgba(201,164,85,0.45)' : 'rgba(201,164,85,0.14)'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: active ? G : cream }}>
                    {KIND_META[k].label}
                  </span>
                  {done && <CheckCircle2 size={14} style={{ color: '#4ade80' }} />}
                </div>
                <div style={{ fontSize: 12, color: sub, lineHeight: 1.5 }}>{KIND_META[k].intro}</div>
              </button>
            );
          })}
        </div>

        {/* The week being reported on */}
        <div style={{ marginBottom: 22 }}>
          <h1 className="font-serif" style={{ fontSize: 'clamp(1.7rem, 3.6vw, 2.4rem)', color: cream, fontWeight: 300, margin: '0 0 16px', lineHeight: 1.1 }}>
            Week {state.weekNumber} · {state.weekLabel}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => goWeek(prevWeek(state.weekStart))} style={weekNavBtn}>
              <ArrowLeft size={13} /> Previous week
            </button>
            {canGoForward && (
              <button onClick={() => goWeek(nextWeekStart)} style={weekNavBtn}>
                Next week <ArrowRight size={13} />
              </button>
            )}
            <span style={{ fontSize: 11.5, color: faint }}>
              {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Draft saved' : ''}
            </span>
          </div>
        </div>

        {justSubmitted && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16,
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.35)',
          }}>
            <CheckCircle2 size={17} style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13, color: '#bbf7d0', lineHeight: 1.6 }}>
              Report is in for {state.weekLabel}. You can still edit anything above — just hit update again.
            </div>
          </div>
        )}

        <EscalationBanner items={state.escalations} />

        {sectionsFor(state.kind).map((s) => (
          <ReportSectionCard
            key={s.id}
            section={s}
            answers={answers}
            actionItems={state.actionItems ?? []}
            derived={derived}
            onChange={change}
          />
        ))}

        {/* Submit */}
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          {missing.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginBottom: 7 }}>
                Still to fill in ({missing.length}):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {missing.slice(0, 14).map((m, i) => (
                  <span key={`${m.sectionId}-${m.label}-${i}`} style={{
                    fontSize: 11.5, color: sub, background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(201,164,85,0.14)', padding: '4px 10px', borderRadius: 20,
                  }}>{m.label}</span>
                ))}
                {missing.length > 14 && <span style={{ fontSize: 11.5, color: faint }}>+{missing.length - 14} more</span>}
              </div>
            </div>
          )}
          {error && <div style={{ fontSize: 12.5, color: '#ef4444', marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={submit}
              disabled={submitting}
              style={{ ...ctaBtn, opacity: submitting ? 0.55 : 1, cursor: submitting ? 'default' : 'pointer' }}
            >
              {submitting ? 'Submitting…' : isSubmitted ? <>Update my report <Check size={16} /></> : <>Submit my report <Send size={15} /></>}
            </button>
            {isSubmitted && (
              <span style={{ fontSize: 12, color: '#4ade80', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} /> Submitted
              </span>
            )}
            {state.sentAt && <span style={{ fontSize: 12, color: faint }}>Report sent to the founder</span>}
          </div>
        </div>

        {/* Past weeks */}
        {state.history.length > 1 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.6)', fontWeight: 700, marginBottom: 12 }}>
              Past weeks
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {state.history.filter((h) => h.weekStart !== state.weekStart).map((h) => (
                <button key={h.weekStart} onClick={() => goWeek(h.weekStart)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(201,164,85,0.1)',
                  borderRadius: 10, padding: '10px 13px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: h.sentAt ? BAND_COLOR.green : h.submittedAt ? BAND_COLOR.amber : BAND_COLOR.none,
                  }} />
                  <span style={{ fontSize: 13, color: cream, flex: 1 }}>{h.weekLabel}</span>
                  <span style={{ fontSize: 11.5, color: faint }}>
                    {h.sentAt ? 'Sent' : h.submittedAt ? 'Submitted' : 'Draft'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ position: 'relative', minHeight: '100vh', background: '#050403' }}>
      <MeshBg speed={0.18} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 70% at 50% 40%, rgba(5,4,3,0.5) 0%, rgba(5,4,3,0.88) 100%)',
      }} />
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
    </main>
  );
}

export default function WeeklyReportPage() {
  return (
    <Suspense fallback={<Shell><CenterLoader label="Loading your weekly report…" minHeight="100vh" /></Shell>}>
      <WeeklyReport />
    </Suspense>
  );
}
