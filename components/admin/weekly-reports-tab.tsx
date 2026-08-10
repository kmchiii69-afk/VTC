'use client';

// A Creative Specialist's weekly reports inside the CSM client profile. The
// report is entirely member-authored, so this is a read-only view of what they
// submitted plus one action: mark it sent to the founder.

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { CenterLoader } from '@/components/ui/loaders';
import {
  ReportSectionCard, DerivedSummary, EscalationBanner, BAND_COLOR,
} from '@/components/weekly-report/report-fields';
import {
  sectionsFor, healthBand, REPORT_KINDS, KIND_META,
  type Derived, type Missing, type ReportAnswers, type ReportKind, type WeekActionItem,
} from '@/lib/creative-weekly-report';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';
const faint = '#857a67';

interface AdminReport {
  id: string;
  kind: ReportKind;
  weekStart: string;
  weekLabel: string;
  answers: ReportAnswers;
  actionItems: WeekActionItem[];
  submittedAt: string | null;
  sentAt: string | null;
  derived: Derived;
  missing: Missing[];
}

interface Payload {
  onWeeklyReport: boolean;
  currentWeek: string;
  kind: ReportKind;
  counts: Record<ReportKind, number>;
  escalations: string[];
  reports: AdminReport[];
}

export function WeeklyReportsTab({ email, onChanged }: {
  email: string;
  // Fired after marking sent so the client profile's Overview digest refreshes too.
  onChanged?: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);
  const [kind, setKind] = useState<ReportKind>('friday');
  const [activeWeek, setActiveWeek] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Held in a ref so `load` stays stable — the parent passes an inline arrow, and
  // a changing dep here would refetch on every render.
  const notify = useRef(onChanged);
  useEffect(() => { notify.current = onChanged; }, [onChanged]);

  const load = useCallback((which: ReportKind, tellParent = false) => {
    fetch(`/api/admin/clients/${encodeURIComponent(email)}/weekly-reports?kind=${which}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Payload) => {
        setData(d);
        // Keep the selected week if this kind also has it, else jump to its newest.
        setActiveWeek((w) => (w && d.reports.some((r) => r.weekStart === w) ? w : d.reports[0]?.weekStart ?? null));
        if (tellParent) notify.current?.();
      })
      .catch(() => setErr(true));
  }, [email]);

  useEffect(() => { load(kind); }, [load, kind]);

  const report = data?.reports.find((r) => r.weekStart === activeWeek) ?? null;

  const toggleSent = async () => {
    if (!report || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/weekly-reports/${report.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sent: !report.sentAt }),
      });
      load(kind, true);
    } finally { setBusy(false); }
  };

  // Wednesday ⇄ Friday, with how many of each exist.
  const kindToggle = (
    <div style={{
      display: 'inline-flex', gap: 4, padding: 4, marginBottom: 16,
      borderRadius: 100, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,164,85,0.14)',
    }}>
      {REPORT_KINDS.map((k) => {
        const on = kind === k;
        return (
          <button key={k} onClick={() => { if (!on) { setData(null); setKind(k); } }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 15px', borderRadius: 100, cursor: on ? 'default' : 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em',
            background: on ? 'rgba(201,164,85,0.14)' : 'transparent',
            border: `1px solid ${on ? 'rgba(201,164,85,0.3)' : 'transparent'}`,
            color: on ? G : 'rgba(201,164,85,0.45)',
          }}>
            {KIND_META[k].short}
            {!!data?.counts?.[k] && (
              <span style={{ fontSize: 10, color: on ? 'rgba(201,164,85,0.7)' : faint }}>{data.counts[k]}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  if (err) return <div style={{ fontSize: 13, color: sub }}>Couldn&apos;t load this client&apos;s weekly reports.</div>;
  if (!data) return <CenterLoader label="Loading weekly reports…" minHeight="40vh" />;

  if (!data.onWeeklyReport) {
    return (
      <div style={{ fontSize: 13, color: sub, lineHeight: 1.7 }}>
        This client isn&apos;t tagged <strong style={{ color: cream }}>Creative Specialist</strong>, so they don&apos;t get the
        weekly report. Add the tag from the Clients tab to turn it on.
      </div>
    );
  }

  if (!data.reports.length) {
    return (
      <div>
        {kindToggle}
        <div style={{ fontSize: 13, color: sub, lineHeight: 1.7 }}>
          No {KIND_META[kind].short.toLowerCase()} reports yet. The {KIND_META[kind].short}-AM prompt asks them to submit
          at <span style={{ color: G }}>/weekly-report</span>; it appears here as soon as they start one.
        </div>
      </div>
    );
  }

  return (
    <div>
      <EscalationBanner items={data.escalations} />
      {kindToggle}

      {/* week picker — the dot is the week's commitment completion band */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 18 }}>
        {data.reports.map((r) => {
          const on = r.weekStart === activeWeek;
          const tint = BAND_COLOR[healthBand(r.derived.commitment.completionRate)];
          return (
            <button key={r.id} onClick={() => setActiveWeek(r.weekStart)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '7px 13px', borderRadius: 20, cursor: 'pointer',
              background: on ? 'rgba(201,164,85,0.14)' : 'transparent',
              border: `1px solid ${on ? G : 'rgba(255,255,255,0.12)'}`,
              color: on ? G : sub, fontFamily: "'DM Sans', sans-serif", fontSize: 12,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: tint }} />
              {r.weekLabel}
              {r.sentAt && <CheckCircle2 size={12} style={{ color: '#4ade80' }} />}
            </button>
          );
        })}
      </div>

      {report && (
        <>
          {/* status line + the one action */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
            flexWrap: 'wrap', marginBottom: 16, padding: '13px 15px', borderRadius: 12,
            background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(201,164,85,0.16)',
          }}>
            <div>
              <div style={{ fontSize: 14, color: cream, fontWeight: 600, marginBottom: 7 }}>
                Week {report.derived.weekNumber} · {report.weekLabel}
              </div>
              {/* The Wednesday plan has no numbers to summarise. */}
              {report.kind === 'friday'
                ? <DerivedSummary derived={report.derived} />
                : (
                  <span style={{ fontSize: 12, color: sub }}>
                    {report.actionItems.length} to-do{report.actionItems.length === 1 ? '' : 's'} planned for the week
                  </span>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11.5, color: faint, textAlign: 'right', lineHeight: 1.8 }}>
                <div>{report.submittedAt ? 'Submitted' : `Not submitted — ${report.missing.length} answer(s) outstanding`}</div>
                <div style={{ color: report.sentAt ? '#4ade80' : faint }}>{report.sentAt ? 'Sent to founder' : 'Not sent'}</div>
              </div>
              <button onClick={toggleSent} disabled={busy} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '11px 20px', borderRadius: 11, cursor: busy ? 'default' : 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                opacity: busy ? 0.55 : 1,
                background: report.sentAt ? 'rgba(74,222,128,0.12)' : 'transparent',
                border: `1px solid ${report.sentAt ? 'rgba(74,222,128,0.4)' : 'rgba(201,164,85,0.3)'}`,
                color: report.sentAt ? '#4ade80' : G,
              }}>
                {report.sentAt ? <><CheckCircle2 size={15} /> Sent — undo</> : <><Send size={15} /> Mark as sent</>}
              </button>
            </div>
          </div>

          {sectionsFor(report.kind).map((s) => (
            <ReportSectionCard
              key={s.id}
              section={s}
              answers={report.answers}
              actionItems={report.actionItems ?? []}
              derived={report.derived}
              onChange={() => {}}
              readOnly
              collapsible
              defaultOpen
            />
          ))}
        </>
      )}
    </div>
  );
}
