'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';
import { CenterLoader } from '@/components/ui/loaders';

interface FullAnalysis {
  strengths: string[];
  objections: string[];
  budget_signals: string;
  authority_signals: string;
  need_signals: string;
  timeline_signals: string;
  reasoning: string;
  close_outcome?: string;
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  closed: { label: 'Closed', color: '#4ade80' },
  no_close: { label: 'No close', color: '#ef4444' },
  dq: { label: 'Disqualified', color: '#857a67' },
  no_show: { label: 'No show', color: '#857a67' },
};

interface Report {
  id: string;
  created_at: string;
  icp_score: number;
  pain_points: string[];
  call_summary: string;
  next_step: string;
  full_analysis: FullAnalysis;
  discord_sent: boolean;
  user_feedback: string | null;
  feedback_applied: boolean;
  calls: {
    fathom_call_id: string;
    raw_payload: Record<string, unknown>;
    status: string;
  } | null;
}

const gold = 'rgba(201,164,85,0.7)';
const goldFaint = 'rgba(201,164,85,0.2)';
const cream = 'rgba(240,232,212,0.85)';
const creamFaint = 'rgba(240,232,212,0.55)';
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 14,
};

function scoreColor(n: number) {
  if (n >= 80) return '#4ade80';
  if (n >= 60) return '#fbbf24';
  return '#ef4444';
}
function scoreLabel(n: number) {
  if (n >= 80) return 'Strong Fit';
  if (n >= 60) return 'Moderate Fit';
  return 'Weak Fit';
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

function BulletList({ items, color = cream }: { items: string[]; color?: string }) {
  if (!items?.length) return <span style={{ fontSize: 12, color: creamFaint }}>None</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ color: goldFaint, flexShrink: 0, marginTop: 1 }}>•</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color, lineHeight: 1.5 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

function BantRow({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: creamFaint, width: 70, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: cream, lineHeight: 1.4 }}>{value || '—'}</span>
    </div>
  );
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/reports/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: Report | null) => {
        if (data) {
          setReport(data);
          setFeedback(data.user_feedback || '');
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function saveFeedback() {
    if (!report || !feedback.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: report.id, feedback }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050403', color: cream, fontFamily: "'DM Sans', sans-serif", position: 'relative' }}>
      <MeshBg speed={0.2} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 65% at 50% 50%, rgba(5,4,3,0.5) 0%, transparent 100%)' }} />
      <style>{`
        textarea::placeholder { color: rgba(240,232,212,0.2); }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(201,164,85,0.2); border-radius: 4px; }
      `}</style>

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 780, margin: '0 auto', padding: '28px 24px' }}>

        {/* Topbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
          <button onClick={() => router.push('/admin')} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(201,164,85,0.5)', fontSize: 11, letterSpacing: '0.2em',
            textTransform: 'uppercase', fontWeight: 600, padding: 0,
          }}>← Admin</button>
          {report && (
            <span style={{ fontSize: 11, color: creamFaint }}>
              {new Date(report.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>

        {loading && (
          <CenterLoader label="Loading report…" minHeight="50vh" />
        )}

        {!loading && !report && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: creamFaint, fontSize: 13 }}>Report not found.</div>
        )}

        {report && (() => {
          const fa = report.full_analysis || {} as FullAnalysis;
          const sc = scoreColor(report.icp_score);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Score hero */}
              <div style={{ ...card, padding: '28px 28px', display: 'flex', gap: 28, alignItems: 'flex-start' }}>
                <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 80 }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 64, fontWeight: 300, color: sc, lineHeight: 1 }}>
                    {report.icp_score}
                  </div>
                  <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: sc, opacity: 0.7, marginTop: 4 }}>
                    {scoreLabel(report.icp_score)}
                  </div>
                  {fa.close_outcome && (() => {
                    const o = OUTCOME_LABELS[fa.close_outcome] ?? { label: fa.close_outcome, color: creamFaint };
                    return (
                      <div style={{ marginTop: 10, display: 'inline-block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: o.color, background: `${o.color}1a`, border: `1px solid ${o.color}40`, padding: '3px 9px', borderRadius: 20 }}>
                        {o.label}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, color: cream, marginBottom: 10, lineHeight: 1.4 }}>
                    {report.call_summary}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: gold, flexShrink: 0, marginTop: 2 }}>Next</span>
                    <span style={{ fontSize: 13, color: cream }}>{report.next_step}</span>
                  </div>
                  {fa.reasoning && (
                    <div style={{ marginTop: 10, fontSize: 11, color: creamFaint, fontStyle: 'italic', lineHeight: 1.5 }}>{fa.reasoning}</div>
                  )}
                  {report.discord_sent && (
                    <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(148,166,255,0.7)', background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.2)', padding: '3px 8px', borderRadius: 20 }}>
                      Sent to Discord
                    </div>
                  )}
                </div>
              </div>

              {/* Grid: pain points + objections */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ ...card, padding: '18px 20px' }}>
                  <SectionLabel>Pain Points</SectionLabel>
                  <BulletList items={report.pain_points} />
                </div>
                <div style={{ ...card, padding: '18px 20px' }}>
                  <SectionLabel>Objections</SectionLabel>
                  <BulletList items={fa.objections} color='rgba(239,68,68,0.8)' />
                </div>
                <div style={{ ...card, padding: '18px 20px' }}>
                  <SectionLabel>Strengths / Fit Signals</SectionLabel>
                  <BulletList items={fa.strengths} color='rgba(74,222,128,0.8)' />
                </div>
                <div style={{ ...card, padding: '18px 20px' }}>
                  <SectionLabel>BANT Signals</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <BantRow label="Budget" value={fa.budget_signals} />
                    <BantRow label="Authority" value={fa.authority_signals} />
                    <BantRow label="Need" value={fa.need_signals} />
                    <BantRow label="Timeline" value={fa.timeline_signals} />
                  </div>
                </div>
              </div>

              {/* Feedback */}
              <div style={{ ...card, padding: '24px 24px' }}>
                <SectionLabel>Your Feedback</SectionLabel>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: creamFaint, marginBottom: 14, lineHeight: 1.6 }}>
                  Note what was off, what data was missing, or what to look for next time — this improves future analyses.
                </p>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g. Score seems too high — they mentioned no budget until Q4. Also watch for team size signals next time…"
                  rows={4}
                  style={{
                    width: '100%', padding: '12px 14px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, color: cream,
                    fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                    resize: 'vertical' as const, outline: 'none',
                    boxSizing: 'border-box' as const, lineHeight: 1.6,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    onClick={saveFeedback}
                    disabled={saving || !feedback.trim()}
                    style={{
                      padding: '10px 24px', borderRadius: 10,
                      background: saved ? 'rgba(74,222,128,0.12)' : 'rgba(201,164,85,0.1)',
                      border: `1px solid ${saved ? 'rgba(74,222,128,0.3)' : 'rgba(201,164,85,0.25)'}`,
                      color: saved ? '#4ade80' : gold,
                      fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                      letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer',
                      opacity: saving || !feedback.trim() ? 0.5 : 1,
                    }}
                  >
                    {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Feedback'}
                  </button>
                </div>
              </div>

            </div>
          );
        })()}
      </div>
    </div>
  );
}
