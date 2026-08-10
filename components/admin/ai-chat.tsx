'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Dots } from '@/components/ui/loaders';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';

interface Msg { role: 'user' | 'assistant'; content: string; }

// Self-contained admin chat panel that talks to a tool-using bot endpoint
// (/api/csm/chat or /api/advisor). Both return { reply }.
export function AiChat({ endpoint, intro, suggestions = [] }: {
  endpoint: string;
  intro: string;
  suggestions?: string[];
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const convId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs, loading]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((p) => [...p, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history, conversationId: convId.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.conversationId) convId.current = data.conversationId;
      const reply = res.ok
        ? (data.reply || 'No response.')
        : (data.error === 'API key not configured' ? "The assistant isn't configured yet — add the API key." : 'Something went wrong, try again.');
      setMsgs((p) => [...p, { role: 'assistant', content: reply }]);
    } catch {
      setMsgs((p) => [...p, { role: 'assistant', content: 'Network error, try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'min(70vh, 620px)', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 16, overflow: 'hidden' }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {msgs.length === 0 && (
          <div style={{ margin: 'auto 0', textAlign: 'center', maxWidth: 460, alignSelf: 'center' }}>
            <div style={{ display: 'inline-flex', width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', background: 'rgba(201,164,85,0.12)', border: '1px solid rgba(201,164,85,0.3)', color: G, marginBottom: 14 }}>
              <Sparkles size={20} />
            </div>
            <p style={{ fontSize: 14, color: sub, lineHeight: 1.6, margin: '0 0 16px' }}>{intro}</p>
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} style={{
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(201,164,85,0.06)', border: '1px solid rgba(201,164,85,0.18)',
                    color: '#d9cfba', fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                  }}>{s}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{
              padding: '11px 15px', borderRadius: 13, fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? 'rgba(201,164,85,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${m.role === 'user' ? 'rgba(201,164,85,0.22)' : 'rgba(255,255,255,0.07)'}`,
              color: m.role === 'user' ? cream : '#d9cfba', fontFamily: "'DM Sans', sans-serif",
            }}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={{ alignSelf: 'flex-start', padding: '6px 2px' }}><Dots /></div>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: 14, borderTop: '1px solid rgba(201,164,85,0.12)' }}>
        <textarea
          value={input} onChange={(e) => setInput(e.target.value)} rows={1}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask anything…"
          style={{ flex: 1, resize: 'none', padding: '11px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.15)', borderRadius: 10, color: cream, fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, outline: 'none' }}
        />
        <button onClick={() => send(input)} disabled={loading || !input.trim()} title="Send" style={{
          padding: '11px 13px', background: 'rgba(201,164,85,0.16)', border: '1px solid rgba(201,164,85,0.4)', borderRadius: 10,
          color: G, cursor: loading || !input.trim() ? 'default' : 'pointer', opacity: loading || !input.trim() ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Send size={16} /></button>
      </div>
    </div>
  );
}
