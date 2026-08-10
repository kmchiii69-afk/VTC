'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';
import { Markdown } from '@/components/ui/markdown';
import { getRoadmapGuide } from '@/lib/roadmap-guides';

// Native, in-app render of a roadmap guide (converted from the source PDFs).
// Linked from roadmap steps as `/guides/<slug>`.
export default function GuidePage() {
  const router = useRouter();
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug as string | undefined);
  const guide = slug ? getRoadmapGuide(slug) : null;
  const [visible, setVisible] = useState(false);

  useEffect(() => { setTimeout(() => setVisible(true), 60); }, []);

  return (
    <main style={{ position: 'relative', width: '100vw', minHeight: '100vh', overflowX: 'hidden', background: '#050403' }}>
      <MeshBg speed={0.2} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 65% at 50% 50%, rgba(5,4,3,0.5) 0%, transparent 100%)',
      }} />

      <button
        onClick={() => router.back()}
        style={{
          position: 'fixed', top: 28, left: 32, zIndex: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(201,164,85,0.5)', fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase',
          fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a455')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.5)')}
      >← Back</button>

      <div style={{
        position: 'relative', zIndex: 2, maxWidth: 720, margin: '0 auto',
        padding: '96px 24px 96px',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        {guide ? (
          <>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', letterSpacing: '0.4em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.45)', margin: '0 0 0.6rem' }}>
              VTC
            </p>
            <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 300, color: '#f0e8d4', lineHeight: 1.1, margin: '0 0 0.5rem' }}>
              {guide.title}
            </h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(240,232,212,0.55)', lineHeight: 1.6, margin: '0 0 2rem', maxWidth: 560 }}>
              {guide.blurb}
            </p>
            <div style={{
              background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(201,164,85,0.18)', borderRadius: 18, padding: 'clamp(1.25rem, 4vw, 2.25rem)',
            }}>
              <Markdown content={guide.body} />
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: 'rgba(240,232,212,0.6)', fontFamily: "'DM Sans', sans-serif", fontSize: 15, paddingTop: 80 }}>
            This guide doesn’t exist.
          </div>
        )}
      </div>
    </main>
  );
}
