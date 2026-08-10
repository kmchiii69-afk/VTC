'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, FileText, Upload, Pencil, X, Send, Plus, Trash2 } from 'lucide-react';
import { RecordingEmbed } from '@/components/ui/recording-embed';
import { Dots } from '@/components/ui/loaders';
import type { Breakdown } from '@/lib/breakdowns';

const G = '#c9a455';
interface ChatMsg { role: 'user' | 'assistant'; content: string; }

// The "$100k Client Breakdowns" section in /hub: two fixed pill containers
// (profile icon + title). Tapping one opens a glass player with the admin's
// embed, a summary doc, and an AI chat — the same building blocks as recordings.
export function BreakdownsSection({ isAdmin = false }: { isAdmin?: boolean }) {
  const [items, setItems] = useState<Breakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/breakdowns').then((r) => (r.ok ? r.json() : [])).then((d) => setItems(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const open = items.find((b) => b.slug === openSlug) || null;

  return (
    <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Dots /></div>
      ) : (
        items.map((b) => (
          <button
            key={b.slug}
            onClick={() => setOpenSlug(b.slug)}
            style={{
              display: 'flex', alignItems: 'center', gap: 16, width: '100%', textAlign: 'left',
              padding: '14px 18px', borderRadius: 999, cursor: 'pointer',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.2)',
              fontFamily: "'DM Sans', sans-serif", transition: 'all 0.18s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,164,85,0.07)'; e.currentTarget.style.borderColor = 'rgba(201,164,85,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(201,164,85,0.2)'; }}
          >
            {b.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={b.image} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${G}55`, background: 'rgba(201,164,85,0.08)' }} />
            ) : (
              <span style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, border: `1px solid ${G}55`, background: 'rgba(201,164,85,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: G, fontWeight: 700, fontSize: 16 }}>{(b.title[0] || '?').toUpperCase()}</span>
            )}
            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: '#f0e8d4', lineHeight: 1.3 }}>{b.title}</span>
            <ChevronRight size={18} style={{ color: 'rgba(201,164,85,0.6)', flexShrink: 0 }} />
          </button>
        ))
      )}

      {isAdmin && !loading && (
        <button
          onClick={() => setCreating(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
            padding: '14px 18px', borderRadius: 999, cursor: 'pointer',
            background: 'rgba(201,164,85,0.06)', border: '1px dashed rgba(201,164,85,0.35)',
            color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 600, transition: 'all 0.18s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,164,85,0.12)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(201,164,85,0.06)'; }}
        >
          <Plus size={16} /> Add guest mastermind
        </button>
      )}

      {open && <BreakdownModal breakdown={open} isAdmin={isAdmin} onChanged={load} onClose={() => setOpenSlug(null)} />}
      {creating && <CreateModal onCreated={() => { setCreating(false); load(); }} onClose={() => setCreating(false)} />}
    </div>
  );
}

// Admin: create a new guest-mastermind tile (title + image + embed + summary).
function CreateModal({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState('');
  const [embed, setEmbed] = useState('');
  const [summary, setSummary] = useState('');
  const [transcript, setTranscript] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const imgRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setMounted(true); }, []);

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr('Images only'); return; }
    setImage(f); setErr('');
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const save = async () => {
    if (!title.trim()) { setErr('Title is required'); return; }
    setSaving(true); setErr('');
    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('embed_code', embed.trim());
    fd.append('summary_url', summary.trim());
    fd.append('transcript', transcript.trim());
    if (image) fd.append('image', image);
    const res = await fetch('/api/admin/breakdowns', { method: 'POST', body: fd }).catch(() => null);
    setSaving(false);
    if (res && res.ok) onCreated();
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Failed to create'); }
  };

  const overlay = (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 360, background: 'rgba(6,5,4,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 32px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.025)', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(201,164,85,0.14)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid rgba(201,164,85,0.14)' }}>
          <span className="font-serif" style={{ flex: 1, color: '#f0e8d4', fontSize: '1.05rem' }}>New guest mastermind</span>
          <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a89e8a', display: 'flex' }}><X size={20} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="button" onClick={() => imgRef.current?.click()} style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', overflow: 'hidden', border: `1px solid ${G}55`, background: 'rgba(201,164,85,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Upload size={18} color={G} />}
            </button>
            <div style={{ fontSize: 12, color: '#857a67', fontFamily: "'DM Sans', sans-serif" }}>Guest photo (optional)</div>
            <input ref={imgRef} type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. “Wyatt's $7k → $100k/mo breakdown”)" style={{ ...inputStyle, width: '100%' }} />
          <textarea value={embed} onChange={(e) => setEmbed(e.target.value)} rows={3} placeholder="Paste embed code (e.g. <iframe …></iframe>)" style={{ ...inputStyle, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }} />
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary document link (optional)" style={{ ...inputStyle, width: '100%' }} />
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={3} placeholder="Transcript (optional) — auto-generates the 2-line summary in the Discord notification" style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Adding…' : 'Add guest mastermind'}</button>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
          </div>
        </div>
      </div>
    </div>
  );
  return mounted ? createPortal(overlay, document.body) : null;
}

function BreakdownModal({ breakdown, isAdmin, onChanged, onClose }: { breakdown: Breakdown; isAdmin: boolean; onChanged: () => void; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const overlay = (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 350, background: 'rgba(6,5,4,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 3vw, 32px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 1000, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.025)', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(201,164,85,0.14)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(201,164,85,0.14)' }}>
          {breakdown.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={breakdown.image} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${G}55` }} />
          ) : (
            <span style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, border: `1px solid ${G}55`, background: 'rgba(201,164,85,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: G, fontWeight: 700, fontSize: 14 }}>{(breakdown.title[0] || '?').toUpperCase()}</span>
          )}
          <span className="font-serif" style={{ flex: 1, minWidth: 0, color: '#f0e8d4', fontSize: '1.05rem', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{breakdown.title}</span>
          {isAdmin && (
            <button onClick={() => setEditing((e) => !e)} style={{ ...linkBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Pencil size={12} /> {editing ? 'Close' : 'Edit'}
            </button>
          )}
          <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a89e8a', display: 'flex' }}><X size={20} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isAdmin && editing && <EditPanel breakdown={breakdown} onChanged={onChanged} onDone={() => setEditing(false)} onDeleted={() => { onChanged(); onClose(); }} />}

          <div style={{ flexShrink: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(201,164,85,0.12)', background: 'rgba(0,0,0,0.3)' }}>
            {breakdown.embed_code
              ? <RecordingEmbed html={breakdown.embed_code} />
              : <div style={{ padding: 18, fontSize: 12.5, color: '#857a67', fontFamily: "'DM Sans', sans-serif" }}>{isAdmin ? 'No video yet — hit Edit to paste the embed code.' : 'Coming soon.'}</div>}
          </div>

          <SummaryRow breakdown={breakdown} isAdmin={isAdmin} />
          <AskBox title={breakdown.title} />
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(overlay, document.body) : null;
}

// Admin: edit embed code + summary (paste link).
function EditPanel({ breakdown, onChanged, onDone, onDeleted }: { breakdown: Breakdown; onChanged: () => void; onDone: () => void; onDeleted: () => void }) {
  const [embed, setEmbed] = useState(breakdown.embed_code || '');
  const [summary, setSummary] = useState(breakdown.summary_url || '');
  const [pdf, setPdf] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const pdfRef = useRef<HTMLInputElement>(null);

  const remove = async () => {
    if (!confirm(`Delete “${breakdown.title}”? This can't be undone.`)) return;
    setDeleting(true); setErr('');
    const res = await fetch(`/api/admin/breakdowns/${breakdown.slug}`, { method: 'DELETE' }).catch(() => null);
    setDeleting(false);
    if (res && res.ok) onDeleted();
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Failed to delete'); }
  };

  const save = async () => {
    setSaving(true); setErr('');
    const res = await fetch(`/api/admin/breakdowns/${breakdown.slug}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embed_code: embed.trim() || null, ...(pdf ? {} : { summary_url: summary.trim() || null }) }),
    }).catch(() => null);
    if (res && res.ok && pdf) {
      const fd = new FormData(); fd.append('file', pdf);
      const up = await fetch(`/api/admin/breakdowns/${breakdown.slug}`, { method: 'POST', body: fd }).catch(() => null);
      if (!up || !up.ok) { setSaving(false); const d = up ? await up.json().catch(() => ({})) : {}; setErr(d.error || 'PDF upload failed'); return; }
    }
    setSaving(false);
    if (res && res.ok) { onChanged(); onDone(); }
    else { const d = res ? await res.json().catch(() => ({})) : {}; setErr(d.error || 'Failed to save'); }
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,164,85,0.16)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600 }}>Edit breakdown</div>
      <textarea value={embed} onChange={(e) => setEmbed(e.target.value)} rows={3} placeholder="Paste embed code (e.g. <iframe …></iframe>)" style={{ ...inputStyle, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }} />
      <input ref={pdfRef} type="file" accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; setPdf(f || null); if (f) setErr(''); }} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => pdfRef.current?.click()} style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Upload size={13} /> {pdf ? 'Change PDF' : 'Summary PDF'}</button>
        {pdf && <span style={{ fontSize: 12, color: '#d9cfba', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{pdf.name}</span>}
        <span style={{ fontSize: 12, color: '#857a67' }}>or link:</span>
      </div>
      <input value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!!pdf} placeholder="Summary document link" style={{ ...inputStyle, width: '100%', opacity: pdf ? 0.5 : 1 }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={onDone} style={btnGhost}>Cancel</button>
        {err && <span style={{ fontSize: 12, color: '#ef4444' }}>{err}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={remove} disabled={deleting} title="Delete this guest mastermind" style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(239,68,68,0.8)', borderColor: 'rgba(239,68,68,0.25)' }}>
          <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ breakdown, isAdmin }: { breakdown: Breakdown; isAdmin: boolean }) {
  return (
    <div style={{ borderTop: '1px solid rgba(201,164,85,0.1)', paddingTop: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600, marginBottom: 8 }}>Summary document</div>
      {breakdown.summary_url ? (
        <a href={breakdown.summary_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, background: 'rgba(201,164,85,0.1)', border: '1px solid rgba(201,164,85,0.25)', color: G, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", fontSize: 12.5 }}>
          <FileText size={14} /> Open summary document ↗
        </a>
      ) : (
        <div style={{ fontSize: 12.5, color: '#857a67', fontFamily: "'DM Sans', sans-serif" }}>{isAdmin ? 'No summary yet — add one via Edit.' : 'No summary attached yet.'}</div>
      )}
    </div>
  );
}

function AskBox({ title }: { title: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((p) => [...p, { role: 'user', content: text }]); setInput(''); setLoading(true);
    try {
      const res = await fetch('/api/recordings/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history, context: '', title }) });
      const data = await res.json().catch(() => ({}));
      const answer = res.ok ? (data.answer || 'No response.') : (data.error === 'API key not configured' ? "The assistant isn't configured yet — let the team know." : 'Something went wrong, try again.');
      setMsgs((p) => [...p, { role: 'assistant', content: answer }]);
    } catch { setMsgs((p) => [...p, { role: 'assistant', content: 'Network error, try again.' }]); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ borderTop: '1px solid rgba(201,164,85,0.1)', paddingTop: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.55)', fontWeight: 600, marginBottom: 8 }}>Ask about this breakdown</div>
      {msgs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <div style={{ padding: '9px 13px', borderRadius: 12, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: m.role === 'user' ? 'rgba(201,164,85,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${m.role === 'user' ? 'rgba(201,164,85,0.22)' : 'rgba(255,255,255,0.07)'}`, color: m.role === 'user' ? '#f0e8d4' : '#d9cfba', fontFamily: "'DM Sans', sans-serif" }}>{m.content}</div>
            </div>
          ))}
          {loading && <div style={{ alignSelf: 'flex-start', padding: '6px 2px' }}><Dots /></div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask anything about this breakdown…" style={{ ...inputStyle, flex: 1, resize: 'none', fontSize: 13 }} />
        <button onClick={send} disabled={loading || !input.trim()} title="Send" style={{ ...btnPrimary, padding: '10px 12px', opacity: loading || !input.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={15} /></button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: '10px 12px', boxSizing: 'border-box', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,164,85,0.15)', borderRadius: 8, color: '#f0e8d4', fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none' };
const btnPrimary: React.CSSProperties = { padding: '10px 16px', background: 'rgba(201,164,85,0.14)', border: '1px solid rgba(201,164,85,0.32)', borderRadius: 8, color: G, fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer', flexShrink: 0 };
const btnGhost: React.CSSProperties = { padding: '9px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#a89e8a', fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: 'pointer' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(201,164,85,0.7)', fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, padding: 0 };
