'use client';

import { SLA_COLOR, SLA_LABEL, type SlaStatus } from '@/lib/vtc-sla';

// Small SLA pill: coloured dot + human due text (On track / Due in Xh / Overdue Xh).
export function SlaBadge({ sla, size = 'sm' }: { sla?: { status: string; hoursLeft: number | null } | null; size?: 'sm' | 'xs' }) {
  if (!sla || sla.status === 'none') return null;
  const status = sla.status as SlaStatus;
  const c = SLA_COLOR[status];
  const h = sla.hoursLeft;
  let text = SLA_LABEL[status];
  if (h != null) {
    const abs = Math.abs(Math.round(h));
    const t = abs >= 48 ? `${Math.round(abs / 24)}d` : `${abs}h`;
    text = sla.status === 'overdue' ? `Overdue ${t}` : sla.status === 'at_risk' ? `Due in ${t}` : 'On track';
  }
  const fs = size === 'xs' ? 10 : 11;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: fs, fontWeight: 600, color: c, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
      {text}
    </span>
  );
}
