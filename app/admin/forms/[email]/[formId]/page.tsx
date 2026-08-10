'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';
import { Spinner } from '@/components/ui/loaders';

interface Data { title: string; email: string; name: string | null; items: { label: string; value: string }[]; }

// Admin-only read view of a member's submitted onboarding form. Linked from the
// Discord submission ping. Requires an admin session (redirects otherwise).
export default function FormSubmissionPage() {
  const params = useParams<{ email: string; formId: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const email = String(params?.email || '');
    const formId = String(params?.formId || '');
    fetch(`/api/admin/forms/${email}/${formId}`)
      .then(async (r) => {
        if (r.status === 403) { router.replace('/'); return null; }
        if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not load'); return null; }
        return r.json();
      })
      .then((d) => { if (d) setData(d); })
      .catch(() => setErr('Could not load this submission.'));
  }, [params, router]);

  return (
    <main style={{ position: 'relative', minHeight: '100vh', background: '#050403' }}>
      <MeshBg speed={0.18} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'radial-gradient(ellipse 75% 75% at 50% 30%, rgba(5,4,3,0.5) 0%, rgba(5,4,3,0.9) 100%)' }} />
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 760, margin: '0 auto', padding: 'clamp(28px, 6vw, 72px) clamp(16px, 4vw, 28px)' }}>
        <button onClick={() => router.push('/admin')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(201,164,85,0.5)', fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, padding: 0, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 8 }}>← Admin</button>

        {err ? (
          <div style={{ color: '#ef4444', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>{err}</div>
        ) : !data ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={26} /></div>
        ) : (
          <div className="view-in">
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(201,164,85,0.5)', fontWeight: 700, margin: '0 0 6px' }}>Form submission</p>
            <h1 className="font-serif" style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', color: '#f0e8d4', fontWeight: 300, margin: '0 0 4px', lineHeight: 1.1 }}>{data.title}</h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, color: '#a89e8a', margin: '0 0 28px' }}>{data.name ? `${data.name} · ` : ''}{data.email}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.items.map((it, i) => (
                <div key={i} style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(201,164,85,0.14)', borderRadius: 14, padding: '14px 18px' }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: 'rgba(201,164,85,0.7)', marginBottom: 6, lineHeight: 1.4 }}>{it.label}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14.5, color: '#e9e0cc', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{it.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
