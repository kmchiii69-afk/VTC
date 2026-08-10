'use client';
/* =====================================================================
   LIVING FUNNEL — VTC analytics hero
   Canvas-based multi-source Sankey: each gate's bar is stacked into
   colored segments per traffic channel (Instagram, YouTube, Paid Ads,
   Organic, Direct, Referral, Preview, Other), and each segment flows on
   as its own colored ribbon into the next stage — so you can actually
   see, e.g., the pink Instagram stream and the blue Paid Ads stream
   travel through Opt-ins → Applications → ... → Closed independently,
   instead of one undifferentiated gold ribbon.
   Click a gate to surface per-source breakdown via onStageClick.
===================================================================== */
import { useEffect, useRef } from 'react';

const G   = '#F5E6A3';
const CRM = 'rgba(240,232,212,0.85)';
const DIM = 'rgba(240,232,212,0.32)';

export interface FunnelChannelBreakdown {
  channel: string; count: number; color: string;
}

export interface FunnelStage {
  id: string; num: string; label: string; sub: string;
  count: number; xFrac: number; color?: string;
  /** Per-channel counts for this stage, in a fixed order — when present,
   *  the gate bar is drawn as stacked colored segments (one per channel)
   *  and ribbons connect same-channel segments across stages, instead of
   *  one solid bar/ribbon. */
  channels?: FunnelChannelBreakdown[];
}

interface Particle {
  edgeIdx: number; channel: string; color: string;
  t: number; speed: number; yFrac: number; alpha: number;
}

interface ChannelSpan { channel: string; color: string; count: number; top: number; bot: number; }

interface Gate extends FunnelStage {
  cx: number; cy: number; gh: number; top: number; bot: number;
  channelSpans: ChannelSpan[];
}

function bez(p0: number, p1: number, p2: number, p3: number, t: number) {
  const mt = 1 - t;
  return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
}

/** Filled rounded rect — used for gate segments instead of hard-edged
 *  fillRect, for a softer, sleeker look. Clamps radius to half the shorter
 *  side so thin/short segments don't distort into a lens shape. */
function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

interface Props {
  stages: FunnelStage[];
  selectedStage?: string;
  onStageClick?: (stageId: string | null) => void;
}

export function LivingFunnel({ stages, selectedStage, onStageClick }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const dataRef     = useRef({ stages, selectedStage, onStageClick });
  const gatesRef    = useRef<Gate[]>([]);
  dataRef.current = { stages, selectedStage, onStageClick };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const el = canvas;
    let raf = 0;
    const particles: Particle[] = [];
    let W = 0, H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const r = el.getBoundingClientRect();
      W = r.width; H = r.height;
      el.width  = Math.round(W * dpr);
      el.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function layout(): Gate[] {
      const { stages } = dataRef.current;
      const padT = 58, padB = 44;
      const usableH = H - padT - padB;
      const maxCount = Math.max(...stages.map(s => s.count), 1);
      const GAP = 1.5;
      return stages.map(s => {
        const cx = s.xFrac * W;
        const gh = Math.max(Math.sqrt(s.count / maxCount) * usableH * 0.55, s.count > 0 ? 16 : 8);
        const cy = padT + usableH * 0.48;
        const top = cy - gh / 2, bot = cy + gh / 2;

        const channelSpans: ChannelSpan[] = [];
        if (s.channels && s.channels.length > 0 && s.count > 0) {
          const visibleCount = s.channels.filter(c => c.count > 0).length;
          const usableGh = Math.max(gh - GAP * Math.max(visibleCount - 1, 0), 1);
          let cursor = top;
          for (const c of s.channels) {
            const h = c.count > 0 ? (c.count / s.count) * usableGh : 0;
            channelSpans.push({ channel: c.channel, color: c.color, count: c.count, top: cursor, bot: cursor + h });
            if (c.count > 0) cursor += h + GAP;
          }
        }
        return { ...s, cx, cy, gh, top, bot, channelSpans };
      });
    }

    function drawFrame() {
      ctx.clearRect(0, 0, W, H);
      const { selectedStage } = dataRef.current;
      const gates = layout();
      gatesRef.current = gates;

      /* ── Ribbons — one per channel where either side has volume, else one aggregate ribbon ── */
      for (let i = 0; i < gates.length - 1; i++) {
        const from = gates[i], to = gates[i + 1];
        const isSelected = selectedStage === from.id || selectedStage === to.id;
        const alpha = isSelected ? 0.4 : 0.2;

        const hasChannels = from.channelSpans.length > 0 && to.channelSpans.length > 0;

        if (hasChannels) {
          const toByChannel = new Map(to.channelSpans.map(c => [c.channel, c]));
          for (const fs of from.channelSpans) {
            const ts = toByChannel.get(fs.channel);
            if (!ts) continue;
            if (fs.count === 0 && ts.count === 0) continue;

            const x1 = from.cx + 5, y1t = fs.top, y1b = fs.bot;
            const x2 = to.cx   - 5, y2t = ts.top, y2b = ts.bot;
            const cx1 = x1 + (x2 - x1) * 0.45, cx2 = x2 - (x2 - x1) * 0.45;

            const grd = ctx.createLinearGradient(x1, 0, x2, 0);
            grd.addColorStop(0,   fs.color + Math.round((alpha + 0.08) * 255).toString(16).padStart(2, '0'));
            grd.addColorStop(0.5, fs.color + Math.round((alpha - 0.02) * 255).toString(16).padStart(2, '0'));
            grd.addColorStop(1,   ts.color + Math.round((alpha + 0.08) * 255).toString(16).padStart(2, '0'));
            ctx.beginPath();
            ctx.moveTo(x1, y1t);
            ctx.bezierCurveTo(cx1, y1t, cx2, y2t, x2, y2t);
            ctx.lineTo(x2, y2b);
            ctx.bezierCurveTo(cx2, y2b, cx1, y1b, x1, y1b);
            ctx.closePath();
            ctx.fillStyle = grd;
            ctx.fill();

            if (fs.count > ts.count && fs.count > 0) {
              const dropped = fs.count - ts.count;
              const totalH = fs.bot - fs.top;
              const dh = totalH * (dropped / Math.max(fs.count, 1));
              const ly = fs.bot;
              ctx.beginPath();
              ctx.moveTo(x1 - 3, ly);
              ctx.bezierCurveTo(x1 - 3, ly + dh * 1.5, from.cx - 20, ly + dh * 2, from.cx - 20, ly + dh * 2.6);
              ctx.strokeStyle = fs.color + '55';
              ctx.lineWidth = Math.max(dh * 0.5, 1);
              ctx.stroke();
            }
          }
        } else {
          if (from.count === 0 && to.count === 0) continue;
          const flow = Math.min(from.count, to.count);
          const fromShare = from.count > 0 ? flow / from.count : 0;
          const fromH = from.gh * fromShare;
          const toH   = to.gh;

          const x1 = from.cx + 5, y1t = from.cy - fromH / 2, y1b = from.cy + fromH / 2;
          const x2 = to.cx   - 5, y2t = to.cy   - toH   / 2, y2b = to.cy   + toH   / 2;
          const cx1 = x1 + (x2 - x1) * 0.45, cx2 = x2 - (x2 - x1) * 0.45;

          const grd = ctx.createLinearGradient(x1, 0, x2, 0);
          grd.addColorStop(0,   `rgba(245,230,163,${alpha + 0.05})`);
          grd.addColorStop(0.5, `rgba(201,164,64,${alpha - 0.06})`);
          grd.addColorStop(1,   `rgba(245,230,163,${alpha})`);
          ctx.beginPath();
          ctx.moveTo(x1, y1t);
          ctx.bezierCurveTo(cx1, y1t, cx2, y2t, x2, y2t);
          ctx.lineTo(x2, y2b);
          ctx.bezierCurveTo(cx2, y2b, cx1, y1b, x1, y1b);
          ctx.closePath();
          ctx.fillStyle = grd;
          ctx.fill();

          if (from.count > flow && from.count > 0) {
            const dropped = from.count - flow;
            const dh = from.gh * (dropped / from.count);
            const ly = from.cy + fromH / 2;
            ctx.beginPath();
            ctx.moveTo(x1 - 3, ly);
            ctx.bezierCurveTo(x1 - 3, ly + dh * 2, from.cx - 24, ly + dh * 3, from.cx - 24, ly + dh * 4);
            ctx.strokeStyle = `rgba(224,96,64,0.4)`;
            ctx.lineWidth = Math.max(dh * 0.4, 1.5);
            ctx.stroke();
          }
        }
      }

      /* ── Gates ── */
      for (const g of gates) {
        const isSelected = selectedStage === g.id;
        const col = g.color || G;

        if (g.count === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          fillRoundRect(ctx, g.cx - 4, g.cy - 10, 8, 20, 4);
        } else if (g.channelSpans.length > 0) {
          const barW = isSelected ? 12 : 8;
          for (const span of g.channelSpans) {
            if (span.count === 0) continue;
            const grd = ctx.createLinearGradient(0, span.top, 0, span.bot);
            grd.addColorStop(0,   span.color + 'CC');
            grd.addColorStop(0.5, span.color + 'FF');
            grd.addColorStop(1,   span.color + 'CC');
            ctx.fillStyle = grd;
            ctx.shadowColor = span.color;
            ctx.shadowBlur = isSelected ? 14 : 6;
            fillRoundRect(ctx, g.cx - barW / 2, span.top, barW, Math.max(span.bot - span.top, 1), 2.5);
          }
          ctx.shadowBlur = 0;
          if (isSelected) {
            ctx.strokeStyle = col + 'AA';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(g.cx - 9, g.top - 3, 18, g.gh + 6, 6);
            ctx.stroke();
          }
        } else {
          const barW = isSelected ? 12 : 8;
          const grd = ctx.createLinearGradient(0, g.top, 0, g.bot);
          grd.addColorStop(0,   col + 'CC');
          grd.addColorStop(0.5, col + 'FF');
          grd.addColorStop(1,   col + 'CC');
          ctx.fillStyle = grd;
          ctx.shadowColor = col;
          ctx.shadowBlur  = isSelected ? 18 : 8;
          fillRoundRect(ctx, g.cx - barW / 2, g.top, barW, g.gh, 4);
          ctx.shadowBlur = 0;

          if (isSelected) {
            ctx.strokeStyle = col + 'AA';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(g.cx - 9, g.top - 3, 18, g.gh + 6, 6);
            ctx.stroke();
          }
        }

        /* Stage number */
        ctx.fillStyle = selectedStage === g.id ? (g.color || G) : DIM;
        ctx.font = '600 10px "DM Sans","Geist",system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(g.num, g.cx, g.top - 30);

        /* Count — serif, matching the rest of the app's number treatment */
        ctx.fillStyle = g.count > 0 ? (g.color || G) : 'rgba(255,255,255,0.2)';
        ctx.font = `400 ${g.count >= 1000 ? 24 : 28}px "Cormorant Garamond","Source Serif Pro",Georgia,serif`;
        ctx.fillText(g.count.toString(), g.cx, g.top - 10);

        /* Label */
        ctx.fillStyle = isSelected ? CRM : 'rgba(240,232,212,0.65)';
        ctx.font = `${isSelected ? '700' : '600'} 13px "DM Sans","Geist",system-ui,sans-serif`;
        ctx.fillText(g.label, g.cx, g.bot + 18);

        /* Sub */
        ctx.fillStyle = DIM;
        ctx.font = '12px "DM Sans","Geist",system-ui,sans-serif';
        ctx.fillText(g.sub, g.cx, g.bot + 34);

        /* Click hint */
        if (!selectedStage || selectedStage !== g.id) {
          ctx.fillStyle = 'rgba(245,230,163,0.22)';
          ctx.font = '10px "DM Sans",system-ui,sans-serif';
          ctx.fillText('▼ tap', g.cx, g.bot + 50);
        }
      }

      /* ── CVR labels on ribbons ── */
      for (let i = 0; i < gates.length - 1; i++) {
        const from = gates[i], to = gates[i + 1];
        if (from.count === 0) continue;
        const pct = Math.round((to.count / from.count) * 100);
        // A later stage (e.g. Booked) can outnumber an earlier one (e.g.
        // Qualified) when it's sourced from a different, larger population
        // (calls synced independently of the tracked qualification flow) —
        // "5000%" isn't a real conversion rate, it's a data-source mismatch,
        // so skip the label rather than show something nonsensical.
        if (pct > 100) continue;
        const midX = (from.cx + to.cx) / 2;
        const midY = Math.min(from.cy, to.cy) - 14;
        ctx.fillStyle = pct >= 50 ? 'rgba(191,250,70,0.8)' : pct >= 25 ? 'rgba(245,230,163,0.7)' : 'rgba(240,130,109,0.8)';
        ctx.font = '600 11px "DM Sans",system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${pct}%`, midX, midY);
      }

      /* ── Drop-off callouts ── */
      for (let i = 0; i < gates.length - 1; i++) {
        const from = gates[i], to = gates[i + 1];
        const dropped = from.count - to.count;
        if (dropped <= 0 || from.count === 0) continue;
        const midX = (from.cx + to.cx) / 2;
        ctx.fillStyle = 'rgba(224,96,64,0.5)';
        ctx.font = '11px "DM Sans",system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`-${dropped}`, midX, from.bot + 56);
      }

      /* ── Particles — spawn per channel-ribbon so each stream sparkles its own color ── */
      for (let i = 0; i < gates.length - 1; i++) {
        const from = gates[i], to = gates[i + 1];
        const isEdgeActive = !selectedStage || selectedStage === from.id || selectedStage === to.id;

        if (from.channelSpans.length > 0 && to.channelSpans.length > 0) {
          const toByChannel = new Map(to.channelSpans.map(c => [c.channel, c]));
          for (const fs of from.channelSpans) {
            const ts = toByChannel.get(fs.channel);
            if (!ts) continue;
            const rate = Math.min(fs.count, ts.count);
            const spawnRate = isEdgeActive ? (rate * 0.0012 + 0.003) : (rate * 0.0003 + 0.0008);
            if (rate > 0 && Math.random() < spawnRate) {
              particles.push({ edgeIdx: i, channel: fs.channel, color: fs.color, t: 0, speed: 0.004 + Math.random() * 0.004, yFrac: Math.random(), alpha: 0.9 + Math.random() * 0.1 });
            }
          }
        } else {
          const rate = Math.min(to.count, from.count);
          const spawnRate = isEdgeActive ? (rate * 0.0008 + 0.012) : (rate * 0.0002 + 0.003);
          if (rate > 0 && Math.random() < spawnRate) {
            particles.push({ edgeIdx: i, channel: '', color: G, t: 0, speed: 0.004 + Math.random() * 0.004, yFrac: Math.random(), alpha: 0.9 + Math.random() * 0.1 });
          }
        }
      }

      for (let pi = particles.length - 1; pi >= 0; pi--) {
        const p = particles[pi];
        const from = gates[p.edgeIdx], to = gates[p.edgeIdx + 1];
        if (!from || !to) { particles.splice(pi, 1); continue; }

        let y1t: number, y1b: number, y2t: number, y2b: number;
        const x1 = from.cx + 5, x2 = to.cx - 5;

        if (p.channel && from.channelSpans.length > 0 && to.channelSpans.length > 0) {
          const fs = from.channelSpans.find(c => c.channel === p.channel);
          const ts = to.channelSpans.find(c => c.channel === p.channel);
          if (!fs || !ts) { particles.splice(pi, 1); continue; }
          y1t = fs.top; y1b = fs.bot; y2t = ts.top; y2b = ts.bot;
        } else {
          const flow = Math.min(from.count, to.count);
          const fromH = from.count > 0 ? from.gh * (flow / from.count) : 0;
          const toH = to.count > 0 ? to.gh * (flow / to.count) : 0;
          y1t = from.cy - fromH / 2; y1b = from.cy + fromH / 2;
          y2t = to.cy   - toH   / 2; y2b = to.cy   + toH   / 2;
        }
        const cx1 = x1 + (x2 - x1) * 0.45, cx2 = x2 - (x2 - x1) * 0.45;

        const topY = bez(y1t, y1t, y2t, y2t, p.t);
        const botY = bez(y1b, y1b, y2b, y2b, p.t);
        const px = bez(x1, cx1, cx2, x2, p.t);
        const py = topY + (botY - topY) * p.yFrac;

        const isActive = !selectedStage || selectedStage === from.id || selectedStage === to.id;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(p.alpha * (isActive ? 1 : 0.3) * (0.6 + p.t * 0.4) * 255).toString(16).padStart(2, '0');
        ctx.shadowColor = p.color;
        ctx.shadowBlur = isActive ? 4 : 0;
        ctx.fill();
        ctx.shadowBlur = 0;

        p.t += p.speed;
        if (p.t > 1) particles.splice(pi, 1);
      }

      if (particles.length > 400) particles.splice(0, particles.length - 400);
      raf = requestAnimationFrame(drawFrame);
    }

    /* ── Click handler — hit-test nearest gate ── */
    function handleClick(e: MouseEvent) {
      const { onStageClick, selectedStage } = dataRef.current;
      if (!onStageClick) return;
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const gates = gatesRef.current;
      let closest = -1, closestDist = Infinity;
      for (let i = 0; i < gates.length; i++) {
        const g = gates[i];
        const dist = Math.abs(g.cx - mouseX);
        /* Must be within 50px X and within gate height + padding Y */
        if (dist < closestDist && dist < 50 && mouseY >= g.top - 40 && mouseY <= g.bot + 50) {
          closestDist = dist;
          closest = i;
        }
      }
      if (closest >= 0) {
        const clickedId = gates[closest].id;
        onStageClick(clickedId === selectedStage ? null : clickedId);
      }
    }

    el.addEventListener('click', handleClick);
    el.style.cursor = 'pointer';

    resize();
    drawFrame();
    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '460px', cursor: 'pointer' }}
    />
  );
}
