import React from 'react';

// Cohesive loading set (brand gold, dark): a refined spinner for small inline
// waits, pulsing dots for AI "thinking", and skeleton shimmer for lists/pages.
// Animations live in app/globals.css (.goh-* classes); honors reduced-motion.

export function Spinner({ size = 18, style }: { size?: number; style?: React.CSSProperties }) {
  return <span className="goh-spinner" role="status" aria-label="Loading" style={{ width: size, height: size, ...style }} />;
}

export function Dots({ style }: { style?: React.CSSProperties }) {
  return (
    <span className="goh-dots" role="status" aria-label="Loading" style={style}>
      <span /><span /><span />
    </span>
  );
}

export function Skeleton({
  width = '100%', height = 14, radius = 8, style,
}: { width?: number | string; height?: number | string; radius?: number; style?: React.CSSProperties }) {
  return <div className="goh-skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

// Centered spinner + optional label for full sections / pages.
export function CenterLoader({ label, minHeight = '40vh' }: { label?: string; minHeight?: number | string }) {
  return (
    <div className="goh-fade" style={{
      minHeight, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 14, color: '#a89e8a', fontFamily: "'DM Sans', sans-serif", fontSize: 13,
    }}>
      <Spinner size={26} />
      {label && <span>{label}</span>}
    </div>
  );
}

// Stacked skeleton rows that mirror a list/card layout — gives instant structure
// so the wait feels fast.
export function SkeletonList({ rows = 5, style }: { rows?: number; style?: React.CSSProperties }) {
  return (
    <div className="goh-fade" style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
          border: '1px solid rgba(201,164,85,0.08)', borderRadius: 12,
        }}>
          <Skeleton width={30} height={30} radius={8} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width={`${55 + ((i * 7) % 30)}%`} height={12} />
            <Skeleton width={`${30 + ((i * 5) % 25)}%`} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}
