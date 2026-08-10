'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MeshBg } from '@/components/ui/mesh-bg';
import { ProfileButton } from '@/components/ui/profile-button';

const CALLS = [
  { id: 1, title: 'Friday · Scripting Mastermind — Apr 27, 2026', url: 'https://fathom.video/share/UQMdeZXygxe4aNk1e-6Je8NHzsiv_z_y' },
  { id: 2, title: 'Friday · Scripting Mastermind — May 5, 2026',  url: 'https://fathom.video/share/zVJL3xiFB3BWjSWkyWXoYTyVrTqEwUSc' },
  { id: 3, title: 'Friday · Scripting Mastermind — May 9, 2026',  url: 'https://fathom.video/share/P5tKWxdaEz5DeZ7nYvzB1tZ6xKAHKJdT' },
  { id: 4, title: 'Friday · Scripting Mastermind — May 20, 2026', url: 'https://fathom.video/share/4sTKH7YqjQqqTZWozxFLTU5BSidCDKq1' },
];

function CallItem({ title, url }: { title: string; url: string }) {
  const [hov, setHov] = useState(false);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 16,
        padding: '8px 20px', textDecoration: 'none',
        opacity: hov ? 1 : 0.6, transition: 'opacity 0.2s',
      }}>
      <span style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontSize: 'clamp(1.5rem, 3.5vw, 2.4rem)', fontWeight: 300,
        color: hov ? '#f0e8d4' : 'rgba(240,232,212,0.85)',
        letterSpacing: '-0.01em', lineHeight: 1.15, transition: 'color 0.2s',
      }}>{title}</span>
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '11px',
        color: hov ? 'rgba(201,164,85,0.7)' : 'rgba(201,164,85,0.3)',
        transition: 'color 0.2s', paddingBottom: 4, flexShrink: 0 }}>↗</span>
    </a>
  );
}

export default function ContentCallsPage() {
  const router = useRouter();

  return (
    <main style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#050403' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <MeshBg speed={0.2} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 65% at 50% 50%, rgba(5,4,3,0.5) 0%, transparent 100%)' }} />

      <ProfileButton />

      <button onClick={() => router.push('/select')} style={{
        position: 'fixed', top: 28, left: 32, zIndex: 10,
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'rgba(201,164,85,0.5)', fontFamily: "'DM Sans', sans-serif",
        fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 8, transition: 'color 0.2s', padding: 0,
      }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a455')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(201,164,85,0.5)')}
      >← Back</button>

      <div style={{
        position: 'relative', zIndex: 2, height: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeUp 0.55s ease forwards',
      }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', letterSpacing: '0.3em',
          textTransform: 'uppercase', fontWeight: 700, color: 'rgba(201,164,85,0.4)',
          marginBottom: 32 }}>Content Calls</p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%', maxWidth: 560, padding: '0 24px' }}>
          {CALLS.map((c) => <CallItem key={c.id} title={c.title} url={c.url} />)}
        </div>
      </div>
    </main>
  );
}
