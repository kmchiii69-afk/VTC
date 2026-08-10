'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Upload, Check, ArrowLeft } from 'lucide-react';
import { MeshBg } from '@/components/ui/mesh-bg';
import { CenterLoader } from '@/components/ui/loaders';

const G = '#c9a455';
const cream = '#f0e8d4';
const sub = '#a89e8a';
const faint = '#857a67';

interface KnownTier { tier: string; label: string; }
interface Template { tier: string; label: string; version: number; viewUrl: string | null; }

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(201,164,85,0.18)',
  borderRadius: 16,
  backdropFilter: 'blur(22px)',
  WebkitBackdropFilter: 'blur(22px)',
  padding: 22,
};

export default function AdminContractsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [known, setKnown] = useState<KnownTier[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const load = () => {
    fetch('/api/admin/contracts', { cache: 'no-store' })
      .then((r) => { if (r.status === 403) { setAllowed(false); return null; } return r.ok ? r.json() : null; })
      .then((d) => { if (d) { setAllowed(true); setKnown(d.knownTiers || []); setTemplates(d.templates || []); } })
      .catch(() => setAllowed(false));
  };

  useEffect(() => {
    fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).then((u) => {
      if (!u || u.role !== 'admin') { setAllowed(false); return; }
      load();
    }).catch(() => setAllowed(false));
  }, []);

  if (allowed === null) return <CenterLoader label="Loading…" />;
  if (!allowed) return (
    <div style={{ minHeight: '100vh', background: '#050403', display: 'flex', alignItems: 'center', justifyContent: 'center', color: faint }}>
      Admins only.
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#050403', position: 'relative' }}>
      <MeshBg speed={0.2} />
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 760, margin: '0 auto', padding: '40px 24px 80px' }}>
        <button onClick={() => router.push('/admin')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: sub, cursor: 'pointer', fontSize: 13, marginBottom: 20, padding: 0 }}>
          <ArrowLeft size={15} /> Back to admin
        </button>

        <h1 style={{ color: cream, fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>Contract templates</h1>
        <p style={{ color: sub, fontSize: 14, margin: '0 0 26px' }}>
          Upload the PDF clients sign during onboarding. Clients read it in-app, consent to e-sign, and sign — the signed copy + audit trail is stored automatically.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {known.map((kt) => (
            <TierUploader key={kt.tier} known={kt} current={templates.find((t) => t.tier === kt.tier)} onUploaded={load} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TierUploader({ known, current, onUploaded }: { known: KnownTier; current?: Template; onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tier', known.tier);
      fd.append('label', known.label);
      const res = await fetch('/api/admin/contracts', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok) onUploaded();
      else setErr(data.error || 'Upload failed');
    } catch { setErr('Upload failed'); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: cream, fontWeight: 600, fontSize: 16 }}>{known.label}</div>
          {current ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#4ade80', fontSize: 13, marginTop: 4 }}>
              <Check size={14} /> Uploaded (v{current.version})
              {current.viewUrl && <a href={current.viewUrl} target="_blank" rel="noopener noreferrer" style={{ color: G, marginLeft: 8, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileText size={13} /> Preview</a>}
            </div>
          ) : (
            <div style={{ color: faint, fontSize: 13, marginTop: 4 }}>No template uploaded yet.</div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="application/pdf" onChange={onPick} style={{ display: 'none' }} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(201,164,85,0.1)', color: cream, border: `1px solid rgba(201,164,85,0.35)`, fontSize: 13.5, padding: '10px 16px', borderRadius: 10, cursor: uploading ? 'default' : 'pointer' }}
        >
          <Upload size={15} /> {uploading ? 'Uploading…' : current ? 'Replace PDF' : 'Upload PDF'}
        </button>
      </div>
      {err && <div style={{ color: '#ef4444', fontSize: 12.5, marginTop: 10 }}>{err}</div>}
    </div>
  );
}
