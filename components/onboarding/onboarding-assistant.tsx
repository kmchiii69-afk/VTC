'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X, HelpCircle } from 'lucide-react';
import { Dots } from '@/components/ui/loaders';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';

interface Msg { role: 'user' | 'assistant'; content: string; }

const SUGGESTIONS = [
  'What do I do first?',
  'Why do I need to fill out the forms?',
  'What happens after I sign my contract?',
  'How do I get to the onboarding call?',
];

// Floating onboarding-help assistant. A small launcher sits bottom-left of the
// wizard; clicking it opens a glass chat popover backed by
// /api/me/onboarding/assistant (FAQ about the onboarding steps).
export function OnboardingAssistant({ hidden = false }: { hidden?: boolean }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs, loading, open]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((p) => [...p, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/me/onboarding/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = res.ok
        ? (data.reply || 'No response.')
        : (data.error === 'API key not configured' ? "The assistant isn't set up yet — ask your CSM on the call." : 'Something went wrong, try again.');
      setMsgs((p) => [...p, { role: 'assistant', content: reply }]);
    } catch {
      setMsgs((p) => [...p, { role: 'assistant', content: 'Network error, try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  if (hidden) return null;

  return (
    <>
      {/* Launcher — bottom-left */}
      <button
        data-tour="help"
        onClick={() => setOpen((o) => !o)}
        title="Onboarding help"
        aria-label="Open onboarding help"
        style={{
          position: 'fixed', left: 'clamp(14px, 3vw, 26px)', bottom: 'clamp(14px, 3vw, 26px)', zIndex: 350,
          display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 16px 11px 13px',
          borderRadius: 999, cursor: 'pointer',
          background: 'rgba(201,164,85,0.14)', border: '1px solid rgba(201,164,85,0.4)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
          boxShadow: open ? 'none' : '0 6px 26px rgba(201,164,85,0.22)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; }}
      >
        {open ? <X size={17} /> : <HelpCircle size={17} />}
        <span>{open ? 'Close' : 'Need help?'}</span>
      </button>

      {/* Chat popover */}
      {open && (
        <div
          className="oa-pop"
          style={{
            position: 'fixed', left: 'clamp(14px, 3vw, 26px)', bottom: 'clamp(66px, 9vw, 86px)', zIndex: 349,
            width: 'min(390px, calc(100vw - 28px))', height: 'min(72vh, 560px)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            background: 'rgba(12,10,8,0.74)', border: '1px solid rgba(201,164,85,0.26)',
            borderRadius: 18, backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(201,164,85,0.14)' }}>
            <span style={{ display: 'inline-flex', width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', background: 'rgba(201,164,85,0.14)', border: '1px solid rgba(201,164,85,0.3)', color: G }}>
              <Sparkles size={15} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="font-serif" style={{ color: cream, fontSize: '1rem', fontWeight: 400, lineHeight: 1 }}>Onboarding Help</div>
              <div style={{ color: faintColor, fontSize: 11, marginTop: 3 }}>Ask about any step</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: sub, display: 'flex', padding: 4 }}><X size={18} /></button>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="oa-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {msgs.length === 0 && (
              <div style={{ margin: 'auto 0', textAlign: 'center' }}>
                <p style={{ fontSize: 13.5, color: sub, lineHeight: 1.6, margin: '0 0 14px' }}>
                  I&apos;m here to help you through onboarding — what a step means, why it matters, and what&apos;s next.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} style={{
                      padding: '10px 13px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      background: 'rgba(201,164,85,0.06)', border: '1px solid rgba(201,164,85,0.18)',
                      color: '#d9cfba', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5,
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 13, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? 'rgba(201,164,85,0.13)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${m.role === 'user' ? 'rgba(201,164,85,0.24)' : 'rgba(255,255,255,0.08)'}`,
                  color: m.role === 'user' ? cream : '#d9cfba', fontFamily: "'DM Sans', sans-serif",
                }}>{m.content}</div>
              </div>
            ))}
            {loading && <div style={{ alignSelf: 'flex-start', padding: '4px 2px' }}><Dots /></div>}
          </div>

          {/* input */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: 12, borderTop: '1px solid rgba(201,164,85,0.12)' }}>
            <textarea
              value={input} onChange={(e) => setInput(e.target.value)} rows={1}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ask about onboarding…"
              style={{ flex: 1, resize: 'none', padding: '10px 13px', maxHeight: 90, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.15)', borderRadius: 10, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none' }}
            />
            <button onClick={() => send(input)} disabled={loading || !input.trim()} aria-label="Send" style={{
              padding: '10px 12px', background: 'rgba(201,164,85,0.16)', border: '1px solid rgba(201,164,85,0.4)', borderRadius: 10,
              color: G, cursor: loading || !input.trim() ? 'default' : 'pointer', opacity: loading || !input.trim() ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Send size={15} /></button>
          </div>

          <style>{`
            .oa-pop { animation: oaPop 0.26s cubic-bezier(0.22, 1, 0.36, 1); transform-origin: bottom left; }
            @keyframes oaPop { from { opacity: 0; transform: translateY(14px) scale(0.96); } to { opacity: 1; transform: none; } }
            .oa-scroll::-webkit-scrollbar { width: 5px; }
            .oa-scroll::-webkit-scrollbar-thumb { background: rgba(201,164,85,0.25); border-radius: 4px; }
          `}</style>
        </div>
      )}
    </>
  );
}

const faintColor = '#857a67';
