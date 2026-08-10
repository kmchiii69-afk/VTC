'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { MeshBg } from '@/components/ui/mesh-bg';
import { Spinner } from '@/components/ui/loaders';
import { type OnboardingFormDef, type FormField, formGroups, MIN_LONG_CHARS } from '@/lib/onboarding-forms';

// A phone number is valid if it has at least 7 digits and only phone characters.
function isPhoneValid(v: string): boolean {
  const s = v.trim();
  return /^[+\d\s().-]+$/.test(s) && (s.match(/\d/g) || []).length >= 7;
}

// Whether a field's current answer satisfies its requirements (used to gate the
// Continue button). Empty = incomplete; long answers need MIN_LONG_CHARS; phone
// must be a real number.
function fieldComplete(f: FormField, val: string): boolean {
  const v = String(val ?? '').trim();
  if (v === '') return false;
  if (f.type === 'long' && !f.noMin) return v.length >= MIN_LONG_CHARS;
  if (f.type === 'phone') return isPhoneValid(v);
  return true;
}

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';
const faint = '#857a67';

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '11px 14px', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(201,164,85,0.18)', borderRadius: 10, color: cream,
  fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none',
};
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 18px', background: 'transparent',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: sub, fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, cursor: 'pointer',
};
const ctaBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '13px 24px',
  background: G, border: 'none', borderRadius: 12, color: '#0a0806', fontFamily: "'DM Sans', sans-serif",
  fontSize: 13.5, fontWeight: 700, letterSpacing: '0.02em',
};

function Field({ field, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 14, color: cream, fontWeight: 500, marginBottom: field.help ? 4 : 8, lineHeight: 1.4 }}>
        {field.label}{field.required && <span style={{ color: G, marginLeft: 4 }}>*</span>}
      </label>
      {field.help && <div style={{ fontSize: 12, color: faint, marginBottom: 8, lineHeight: 1.5 }}>{field.help}</div>}
      {field.type === 'long' ? (
        <>
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 84, lineHeight: 1.6 }} />
          {!field.noMin && (
            <div style={{ fontSize: 11, marginTop: 5, textAlign: 'right', color: value.trim().length >= MIN_LONG_CHARS ? '#4ade80' : faint }}>
              {value.trim().length}/{MIN_LONG_CHARS} characters minimum
            </div>
          )}
        </>
      ) : field.type === 'select' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(field.options || []).map((opt) => {
            const on = value === opt;
            return (
              <button key={opt} type="button" onClick={() => onChange(opt)} style={{
                padding: '8px 15px', borderRadius: 20, cursor: 'pointer',
                background: on ? 'rgba(201,164,85,0.16)' : 'transparent',
                border: `1px solid ${on ? G : 'rgba(255,255,255,0.14)'}`,
                color: on ? G : sub, fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              }}>{opt}</button>
            );
          })}
        </div>
      ) : (
        <>
          <input
            type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
            inputMode={field.type === 'number' ? 'numeric' : field.type === 'phone' ? 'tel' : undefined}
            value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} style={inputStyle}
          />
          {field.type === 'phone' && value.trim() !== '' && !isPhoneValid(value) && (
            <div style={{ fontSize: 11, marginTop: 5, color: '#ef4444' }}>Enter a valid phone number (include country code).</div>
          )}
        </>
      )}
    </div>
  );
}

// Full-screen onboarding form in the wizard's two-pane card. Questions are
// grouped in their original sequence (1–4, 5–8, …). Relies on the .ob-* classes
// defined in app/onboarding/page.tsx (this is only mounted from there).
export function OnboardingForm({ form, defaults, onClose, onSubmitted, intro }: {
  form: OnboardingFormDef;
  defaults?: Record<string, string>;
  onClose: () => void;
  onSubmitted: () => void;
  intro?: { title: string; body: string };  // welcome screen shown before the questions
}) {
  const groups = useMemo(() => formGroups(form), [form]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [g, setG] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [stage, setStage] = useState<'intro' | 'form'>(intro ? 'intro' : 'form');

  useEffect(() => {
    let alive = true;
    fetch(`/api/me/forms/${form.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const saved = (d?.answers || {}) as Record<string, unknown>;
        const merged: Record<string, string> = { ...(defaults || {}) };
        for (const [k, v] of Object.entries(saved)) merged[k] = v == null ? '' : String(v);
        setAnswers(merged);
        setLoaded(true);
      })
      .catch(() => { if (alive) { setAnswers({ ...(defaults || {}) }); setLoaded(true); } });
    return () => { alive = false; };
  }, [form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }));
  const current = groups[g] || [];
  const isLast = g === groups.length - 1;
  // Gate: every question on the current card must be properly answered before
  // continuing — long answers need at least MIN_LONG_CHARS, phone must be valid.
  const groupComplete = current.every((f) => fieldComplete(f, answers[f.id] ?? ''));
  // Only mention the character minimum when this card actually has a long field that enforces it.
  const groupHasMin = current.some((f) => f.type === 'long' && !f.noMin);
  const totalFields = form.fields.length;
  const answeredCount = form.fields.filter((f) => String(answers[f.id] ?? '').trim() !== '').length;
  const estMin = Math.max(3, Math.round(totalFields * 0.5)); // ~30s per question
  // Position-based progress — rises as you advance, falls when you step back.
  const progressPct = Math.round(((g + 1) / groups.length) * 100);

  const submit = async () => {
    setSaving(true);
    try {
      await fetch(`/api/me/forms/${form.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }),
      });
      onSubmitted();
    } finally { setSaving(false); }
  };
  const next = () => { if (!groupComplete || saving) return; if (isLast) submit(); else setG(g + 1); };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#050403' }}>
      <MeshBg speed={0.16} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'radial-gradient(ellipse 75% 75% at 50% 40%, rgba(5,4,3,0.5) 0%, rgba(5,4,3,0.9) 100%)' }} />
      <div style={{ position: 'relative', zIndex: 2, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(14px, 3vw, 40px)' }}>
        <div style={{
          position: 'relative', width: '100%', maxWidth: 660, height: 'min(88vh, 740px)', display: 'flex', flexDirection: 'column',
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 20, overflow: 'hidden',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.45)', padding: 'clamp(22px, 3.2vw, 40px)',
        }}>
          {stage === 'intro' && intro ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: sub, fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0, marginBottom: 4 }}>
                <ArrowLeft size={15} /> Back to onboarding
              </button>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '8px 6px' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: faint, fontWeight: 600, marginBottom: 16 }}>{form.title}</div>
                <h1 className="font-serif" style={{ fontSize: 'clamp(1.6rem, 3.4vw, 2.3rem)', color: cream, fontWeight: 300, margin: '0 0 16px', lineHeight: 1.12, maxWidth: 480 }}>{intro.title}</h1>
                <p style={{ fontSize: 14.5, color: sub, lineHeight: 1.7, margin: '0 0 28px', maxWidth: 460 }}>{intro.body}</p>
                <button onClick={() => setStage('form')} style={ctaBtn}>Start the form <ArrowRight size={16} /></button>
              </div>
            </div>
          ) : (
          <>
          {/* top: back + title + dynamic progress + estimated time */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: sub, fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: 0 }}>
                <ArrowLeft size={15} /> Back to onboarding
              </button>
              <span style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: faint, fontWeight: 600 }}>{form.title}</span>
            </div>
            {loaded && (
              <>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progressPct}%`, background: `linear-gradient(90deg, ${G}, #4ade80)`, borderRadius: 3, transition: 'width 0.45s cubic-bezier(0.22,1,0.36,1)' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11.5, color: faint }}>
                  <span>≈ {estMin} min to complete</span>
                  <span>{answeredCount}/{totalFields} answered</span>
                </div>
              </>
            )}
          </div>

          {!loaded ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size={26} /></div>
          ) : (
            <>
              <div key={g} className="ob-pop ob-scroll" style={{ overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: 4 }}>
                <h1 className="font-serif" style={{ fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', color: cream, fontWeight: 300, margin: '0 0 6px', lineHeight: 1.15 }}>{form.title}</h1>
                <p style={{ fontSize: 13, color: sub, lineHeight: 1.55, margin: '0 0 22px' }}>{form.subtitle}</p>
                {current.map((f) => <Field key={f.id} field={f} value={answers[f.id] ?? ''} onChange={(v) => set(f.id, v)} />)}
              </div>
              <div style={{ paddingTop: 16 }}>
                {!groupComplete && <p style={{ fontSize: 12, color: faint, margin: '0 0 10px', textAlign: 'center' }}>Answer every question to continue{groupHasMin ? ` — written answers need at least ${MIN_LONG_CHARS} characters` : ''}.</p>}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {g > 0 && <button onClick={() => setG(g - 1)} style={ghostBtn}><ArrowLeft size={15} /> Back</button>}
                  <div style={{ flex: 1 }} />
                  <button onClick={next} disabled={!groupComplete || saving} style={{ ...ctaBtn, opacity: (!groupComplete || saving) ? 0.5 : 1, cursor: (!groupComplete || saving) ? 'default' : 'pointer' }}>
                    {saving ? 'Submitting…' : isLast ? <>Submit form <Check size={16} /></> : <>Continue <ArrowRight size={16} /></>}
                  </button>
                </div>
              </div>
            </>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
