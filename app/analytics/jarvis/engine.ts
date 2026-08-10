/* eslint-disable */
// @ts-nocheck
/* ============================================================
   LIVING FUNNEL v2 — "the machine" · Sankey-ribbon particle engine
   Ported verbatim from the Claude Design v4 handoff (funnel-engine-v2.js).
   Framework-free. Volume is physical: gate height ∝ √count, ribbon
   thickness carries real share, leaks spill as embers. Budget ~600.
============================================================ */
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

export class FunnelEngineV2 {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.topo = opts.topology;
    this.C = opts.data.C;
    this.intensity = opts.intensity ?? 0.78;
    this.reduced = opts.reduced ?? false;
    this.onHover = opts.onHover || (() => {});
    this.filter = null;
    this.particles = [];
    this.bursts = [];
    this.pulses = {};
    this.spawnAcc = {};
    this.leakAcc = {};
    this.hoverNode = null;
    this.bootT0 = performance.now();
    this.lastSweep = performance.now() + 6000;
    this.raf = null; this.lastT = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this._col = (name) => this.C[name] || name;
    this._bind();
    this.resize();
  }

  _bind() {
    this._onMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let hit = null;
      for (const id in this.G) {
        const g = this.G[id];
        if (mx > g.sx - 22 && mx < g.sx + 22 && my > g.top - 18 && my < g.bot + 18) { hit = id; break; }
      }
      if (hit !== this.hoverNode) {
        this.hoverNode = hit;
        this.canvas.style.cursor = hit ? "pointer" : "default";
        const n = hit ? this.topo.nodes[hit] : null;
        this.onHover(hit ? { id: hit, label: n.label, sub: n.sub, count: n.count,
          color: this._col(n.color), sx: this.G[hit].sx, sy: this.G[hit].top } : null);
      }
    };
    this._onLeave = () => { if (this.hoverNode) { this.hoverNode = null; this.onHover(null); } };
    this.canvas.addEventListener("mousemove", this._onMove);
    this.canvas.addEventListener("mouseleave", this._onLeave);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(480, r.width), h = Math.max(360, r.height);
    this.W = w; this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._layout();
    this._first = true;
  }

  _layout() {
    const padX = 14, padT = 44, padB = 30;
    const dw = this.W - padX * 2, dh = this.H - padT - padB;
    const hScale = clamp(dh / 560, 0.7, 1.35) * 4.6;
    this.G = {};
    for (const id in this.topo.nodes) {
      const n = this.topo.nodes[id];
      const gh = clamp(Math.sqrt(n.count) * hScale, 12, dh * 0.30);
      const sx = padX + n.x * dw, sy = padT + n.y * dh;
      this.G[id] = { sx, sy, h: gh, top: sy - gh / 2, bot: sy + gh / 2, inR: [], outR: [] };
    }
    this.R = this.topo.edges.map((e, i) => ({ ...e, i }));
    for (const rb of this.R) { this.G[rb.from].outR.push(rb); this.G[rb.to].inR.push(rb); }
    const GW = 7;
    for (const id in this.G) {
      const g = this.G[id], n = this.topo.nodes[id];
      g.outR.sort((a, b) => this.G[a.to].sy - this.G[b.to].sy);
      g.inR.sort((a, b) => this.G[a.from].sy - this.G[b.from].sy);
      const totalOut = g.outR.reduce((s, r2) => s + r2.count, 0);
      const denom = Math.max(n.count, totalOut) || 1;
      let off = 0;
      for (const rb of g.outR) {
        const th = g.h * (rb.count / denom);
        rb.a0 = g.top + off; rb.a1 = g.top + off + th; off += th;
      }
      g.leakTh = g.h - off;
      g.leakCount = Math.max(0, n.count - g.outR.reduce((s, r2) => s + r2.count, 0));
      if (n.kind === "terminal" || id === "traffic") { g.leakTh = 0; g.leakCount = 0; }
      const inSum = g.inR.reduce((s, r2) => s + r2.count, 0) || 1;
      let offIn = 0;
      for (const rb of g.inR) {
        const th = g.h * (rb.count / inSum);
        rb.b0 = g.top + offIn; rb.b1 = g.top + offIn + th; offIn += th;
      }
    }
    const S = 30;
    for (const rb of this.R) {
      const A = this.G[rb.from], B = this.G[rb.to];
      const xa = A.sx + GW, xb = B.sx - GW, dx = xb - xa;
      const mk = (ya, yb) => {
        const pts = [];
        for (let s = 0; s <= S; s++) {
          const t = s / S, mt = 1 - t;
          const c1x = xa + dx * 0.44, c2x = xb - dx * 0.44;
          const x = mt*mt*mt*xa + 3*mt*mt*t*c1x + 3*mt*t*t*c2x + t*t*t*xb;
          const y = mt*mt*mt*ya + 3*mt*mt*t*ya + 3*mt*t*t*yb + t*t*t*yb;
          pts.push({ x, y });
        }
        return pts;
      };
      rb.topPts = mk(rb.a0, rb.b0);
      rb.botPts = mk(rb.a1, rb.b1);
      let len = 0;
      for (let s = 1; s <= S; s++) len += Math.hypot(rb.topPts[s].x - rb.topPts[s-1].x, rb.topPts[s].y - rb.topPts[s-1].y);
      rb.len = len;
      rb.colorHex = this._col(this.topo.nodes[rb.to].color === "bone" ? this.topo.nodes[rb.from].color : this.topo.nodes[rb.to].color);
      if (rb.cross) rb.colorHex = this.C.acid;
    }
    this.spills = [];
    for (const id in this.G) {
      const g = this.G[id];
      if (g.leakCount <= 0 || g.leakTh < 1.2) continue;
      const x0 = g.sx + GW, y0 = g.bot - Math.min(g.leakTh, 26);
      const x1 = g.sx + 36, y1 = g.bot + 64 + Math.min(g.leakTh, 26);
      const pts = [];
      for (let s = 0; s <= 16; s++) {
        const t = s / 16;
        pts.push({ x: lerp(x0, x1, t * t * 0.9 + t * 0.1), y: lerp(g.bot, y1, t * t) });
      }
      this.spills.push({ id, pts, th: Math.min(g.leakTh, 26), count: g.leakCount, tag: this.topo.leakTags[id] || null, y0 });
    }
    this.maxC = this.topo.nodes.traffic ? this.topo.nodes.traffic.count : 1240;
    this.padT = padT;
  }

  _ribbonPoint(rb, t, u) {
    const f = clamp(t, 0, 1) * (rb.topPts.length - 1);
    const i = Math.floor(f), fr = f - i;
    const j = Math.min(i + 1, rb.topPts.length - 1);
    const tx = lerp(rb.topPts[i].x, rb.topPts[j].x, fr), ty = lerp(rb.topPts[i].y, rb.topPts[j].y, fr);
    const bx = lerp(rb.botPts[i].x, rb.botPts[j].x, fr), by = lerp(rb.botPts[i].y, rb.botPts[j].y, fr);
    return { x: lerp(tx, bx, u), y: lerp(ty, by, u) };
  }

  _dimNode(id) {
    if (!this.filter) return false;
    const ht = ["traffic","ht_visit","ht_optin","ht_app","ht_qualified","call_book","call_booked","call_showed","call_closed"];
    const lm = ["traffic","lm_visit","lm_optin","lm_content"];
    return this.filter === "ht" ? !ht.includes(id) : !lm.includes(id);
  }
  _dimR(rb) { return this._dimNode(rb.from) || this._dimNode(rb.to); }

  setFilter(f) { this.filter = f; }
  setIntensity(v) { this.intensity = clamp(v, 0, 1); }

  fireEvent(stageId) {
    const id = stageId;
    if (!this.G[id]) return;
    this.pulses[id] = 1;
    const rb = this.G[id].inR[0] || this.G[id].outR[0];
    if (rb) this.particles.push(this._mkP(rb, true));
  }
  flareClose() {
    const g = this.G.call_closed;
    if (!g) return;
    this.pulses.call_closed = 1.4;
    this.bursts.push({ x: g.sx, y: g.sy, t: 0, life: 1.0 });
  }

  _bootProg(x) {
    if (this.reduced) return 1;
    const T = (performance.now() - this.bootT0) / 1000;
    const sweepX = (T / 2.1) * (this.W + 200) - 100;
    return clamp((sweepX - x) / 140 + 1, 0, 1);
  }

  _mkP(rb, bright) {
    const [r, g, b] = rgb(rb.colorHex);
    const px = lerp(80, 135, Math.random());
    return { rb, t: 0, u: Math.random() * 0.84 + 0.08, v: px / rb.len,
      r, g, b, size: bright ? 2.6 : lerp(1.0, 2.0, Math.random()),
      a: bright ? 1 : lerp(0.5, 0.95, Math.random()), bright: !!bright };
  }

  _update(dt) {
    for (const k in this.pulses) this.pulses[k] = Math.max(0, this.pulses[k] - dt * 1.5);
    const glob = this.intensity;
    for (const rb of this.R) {
      if (this._dimR(rb) || this._bootProg(this.G[rb.from].sx) < 1) continue;
      const rate = Math.pow(rb.count / this.maxC, 0.62) * 26 * glob;
      this.spawnAcc[rb.i] = (this.spawnAcc[rb.i] || 0) + rate * dt;
      while (this.spawnAcc[rb.i] >= 1) {
        this.spawnAcc[rb.i] -= 1;
        if (this.particles.length < 600) this.particles.push(this._mkP(rb));
      }
    }
    for (const sp of this.spills) {
      if (this._dimNode(sp.id) || this._bootProg(this.G[sp.id].sx) < 1) continue;
      const rate = Math.pow(sp.count / this.maxC, 0.58) * 9 * glob;
      this.leakAcc[sp.id] = (this.leakAcc[sp.id] || 0) + rate * dt;
      while (this.leakAcc[sp.id] >= 1) {
        this.leakAcc[sp.id] -= 1;
        this.particles.push({ spill: sp, t: 0, v: lerp(0.5, 0.9, Math.random()),
          u: Math.random(), size: lerp(0.9, 1.7, Math.random()), a: 0.85, ember: true });
      }
    }
    const next = [];
    for (const p of this.particles) {
      if (p.ember) { p.t += p.v * dt; if (p.t < 1) next.push(p); continue; }
      p.t += p.v * dt;
      if (p.t >= 1) {
        const tgt = p.rb.to;
        this.pulses[tgt] = Math.max(this.pulses[tgt] || 0, p.bright ? 0.7 : 0.14);
        if (tgt === "call_closed") this.bursts.push({ x: this.G.call_closed.sx, y: this.G.call_closed.sy, t: 0, life: 0.85 });
        continue;
      }
      next.push(p);
    }
    this.particles = next;
    this.bursts = this.bursts.filter(b => (b.t += dt) < b.life);
  }

  _draw() {
    const ctx = this.ctx, C = this.C, now = performance.now();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = this._first ? "rgba(6,5,4,1)" : "rgba(6,5,4,0.27)";
    ctx.fillRect(0, 0, this.W, this.H);
    this._first = false;

    ctx.font = "500 8.5px 'JetBrains Mono', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    for (const st of this.topo.stages) {
      const x = 14 + st.x * (this.W - 28);
      const bp = this._bootProg(x);
      if (bp <= 0) continue;
      ctx.strokeStyle = `rgba(255,255,255,${0.028 * bp})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 26); ctx.lineTo(x, this.H - 12); ctx.stroke();
      ctx.fillStyle = `rgba(85,85,96,${0.9 * bp})`;
      ctx.fillText(st.t, x, 18);
    }

    for (const rb of this.R) {
      const bp = this._bootProg(this.G[rb.from].sx);
      if (bp <= 0) continue;
      const dim = this._dimR(rb);
      const [r, g, b] = rgb(rb.colorHex);
      const N = rb.topPts.length;
      const reveal = Math.floor(bp * (N - 1));
      if (reveal < 2) continue;
      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      ctx.moveTo(rb.topPts[0].x, rb.topPts[0].y);
      for (let s = 1; s <= reveal; s++) ctx.lineTo(rb.topPts[s].x, rb.topPts[s].y);
      for (let s = reveal; s >= 0; s--) ctx.lineTo(rb.botPts[s].x, rb.botPts[s].y);
      ctx.closePath();
      const grad = ctx.createLinearGradient(rb.topPts[0].x, 0, rb.topPts[N-1].x, 0);
      const aBase = dim ? 0.015 : 0.075;
      grad.addColorStop(0, `rgba(${r},${g},${b},${aBase})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},${aBase * 1.7})`);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = `rgba(${r},${g},${b},${dim ? 0.04 : 0.16})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(rb.topPts[0].x, rb.topPts[0].y);
      for (let s = 1; s <= reveal; s++) ctx.lineTo(rb.topPts[s].x, rb.topPts[s].y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rb.botPts[0].x, rb.botPts[0].y);
      for (let s = 1; s <= reveal; s++) ctx.lineTo(rb.botPts[s].x, rb.botPts[s].y);
      ctx.stroke();
      if (!dim && rb.count > 40 && !this.reduced) {
        const cyc = ((now / 1700) + rb.i * 0.37) % 1;
        const t0 = cyc, t1 = Math.min(1, cyc + 0.13);
        if (t1 * (N-1) <= reveal) {
          ctx.strokeStyle = `rgba(${r},${g},${b},0.4)`;
          ctx.lineWidth = Math.max(1, Math.min(5, rb.count / 90));
          ctx.beginPath();
          let first = true;
          for (let s = Math.floor(t0 * (N-1)); s <= Math.floor(t1 * (N-1)); s++) {
            const mx = (rb.topPts[s].x + rb.botPts[s].x) / 2, my = (rb.topPts[s].y + rb.botPts[s].y) / 2;
            if (first) { ctx.moveTo(mx, my); first = false; } else ctx.lineTo(mx, my);
          }
          ctx.stroke();
        }
      }
      if (rb.conv && !dim && bp >= 1) {
        const m = this._ribbonPoint(rb, 0.5, 0.5);
        ctx.globalCompositeOperation = "source-over";
        ctx.font = "600 9px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(139,139,149,0.85)";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(rb.conv, m.x, m.y);
        ctx.globalCompositeOperation = "lighter";
      }
      if (rb.tag && !dim && bp >= 1) {
        const m = this._ribbonPoint(rb, 0.55, 0.5);
        this._chip(m.x, m.y - 16, rb.tag.text, C.amber, 0.9);
      }
    }

    ctx.globalCompositeOperation = "lighter";
    for (const sp of this.spills) {
      if (this._dimNode(sp.id)) continue;
      const bp = this._bootProg(this.G[sp.id].sx);
      if (bp < 1) continue;
      const hot = !!sp.tag;
      const [r, g, b] = rgb(C.drop);
      ctx.beginPath();
      ctx.moveTo(sp.pts[0].x - sp.th, sp.pts[0].y - 1);
      for (let s = 0; s < sp.pts.length; s++) {
        const w = sp.th * (1 - s / sp.pts.length) * 0.85;
        ctx.lineTo(sp.pts[s].x - w, sp.pts[s].y);
      }
      for (let s = sp.pts.length - 1; s >= 0; s--) ctx.lineTo(sp.pts[s].x, sp.pts[s].y);
      ctx.closePath();
      const aa = hot ? 0.10 + 0.05 * Math.sin(now / 360) : 0.045;
      ctx.fillStyle = `rgba(${r},${g},${b},${aa})`;
      ctx.fill();
    }

    for (const p of this.particles) {
      let x, y, a = p.a, sz = p.size, r2, g2, b2;
      if (p.ember) {
        const f = clamp(p.t, 0, 1) * (p.spill.pts.length - 1);
        const i = Math.floor(f), fr = f - i;
        const j = Math.min(i + 1, p.spill.pts.length - 1);
        const w = p.spill.th * (1 - p.t) * 0.8;
        x = lerp(p.spill.pts[i].x, p.spill.pts[j].x, fr) - w * p.u;
        y = lerp(p.spill.pts[i].y, p.spill.pts[j].y, fr);
        a = p.a * (1 - p.t);
        [r2, g2, b2] = rgb(C.drop);
      } else {
        const pt = this._ribbonPoint(p.rb, p.t, p.u);
        x = pt.x; y = pt.y; r2 = p.r; g2 = p.g; b2 = p.b;
      }
      if (p.bright) {
        ctx.shadowBlur = 13;
        ctx.shadowColor = `rgba(${r2},${g2},${b2},0.9)`;
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(${r2},${g2},${b2},${a * 0.18})`;
        ctx.beginPath(); ctx.arc(x, y, sz * 2.6, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = `rgba(${r2},${g2},${b2},${a})`;
      ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      if (p.bright) {
        ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`;
        ctx.beginPath(); ctx.arc(x, y, sz * 0.45, 0, TAU); ctx.fill();
      }
    }
    ctx.shadowBlur = 0;

    for (const bst of this.bursts) {
      const k = bst.t / bst.life;
      const [r, g, b] = rgb(C.acid);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - k) * 0.9})`;
      ctx.lineWidth = 2 * (1 - k) + 0.4;
      ctx.beginPath(); ctx.arc(bst.x, bst.y, 8 + k * 52, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(${r},${g},${b},${1 - k})`;
      for (let s = 0; s < 9; s++) {
        const ang = (s / 9) * TAU + k * 1.8, rad = k * 46;
        ctx.beginPath();
        ctx.arc(bst.x + Math.cos(ang) * rad, bst.y + Math.sin(ang) * rad, 1.8 * (1 - k) + 0.4, 0, TAU);
        ctx.fill();
      }
    }

    if (!this.reduced && now - this.lastSweep > 9000) {
      if (now - this.lastSweep > 10600) this.lastSweep = now;
      const k = (now - this.lastSweep - 9000) / 1600;
      if (k >= 0 && k <= 1) {
        const x = k * this.W;
        const gr = ctx.createLinearGradient(x - 70, 0, x, 0);
        gr.addColorStop(0, "rgba(201,164,85,0)");
        gr.addColorStop(1, "rgba(201,164,85,0.05)");
        ctx.fillStyle = gr;
        ctx.fillRect(x - 70, 0, 70, this.H);
      }
    }

    ctx.globalCompositeOperation = "source-over";
    for (const id in this.G) this._gate(id, now);

    for (const sp of this.spills) {
      if (!sp.tag || this._dimNode(sp.id) || this._bootProg(this.G[sp.id].sx) < 1) continue;
      const end = sp.pts[sp.pts.length - 1];
      const pulse = 0.65 + 0.35 * Math.sin(now / 380);
      this._chip(end.x + 6, end.y + 10, sp.tag.text, this.C.drop, pulse, true);
    }
  }

  _chip(cx, cy, text, color, alpha, leftAlign) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "600 9.5px 'JetBrains Mono', monospace";
    const tw = ctx.measureText(text).width;
    const bx = leftAlign ? cx : cx - tw / 2 - 6, by = cy - 8;
    const [r, g, b] = rgb(color);
    ctx.fillStyle = "rgba(6,5,4,0.85)";
    ctx.fillRect(bx, by, tw + 12, 16);
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, tw + 12, 16);
    ctx.fillStyle = color;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 6, by + 8.5);
    ctx.globalCompositeOperation = "lighter";
  }

  _gate(id, now) {
    const ctx = this.ctx, g = this.G[id], n = this.topo.nodes[id];
    const bp = this._bootProg(g.sx);
    if (bp <= 0) return;
    const pop = easeOut(bp);
    const dim = this._dimNode(id);
    const aM = (dim ? 0.22 : 1) * pop;
    const col = this._col(n.color);
    const [r, gg, b] = rgb(col);
    const pulse = (this.pulses[id] || 0) + (this.hoverNode === id ? 0.55 : 0);
    const h = g.h * pop, top = g.sy - h / 2, bot = g.sy + h / 2;
    const W2 = 6;

    if (pulse > 0.04 && !this.reduced) {
      const grad = ctx.createRadialGradient(g.sx, g.sy, 0, g.sx, g.sy, h * 0.9 + 30);
      grad.addColorStop(0, `rgba(${r},${gg},${b},${0.20 * pulse * aM})`);
      grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(g.sx - h, top - 40, h * 2, h + 80);
    }

    ctx.strokeStyle = `rgba(${r},${gg},${b},${(0.55 + pulse * 0.4) * aM})`;
    ctx.lineWidth = 1.1;
    ctx.strokeRect(g.sx - W2, top, W2 * 2, h);
    const core = ctx.createLinearGradient(0, top, 0, bot);
    core.addColorStop(0, `rgba(${r},${gg},${b},${0.16 * aM})`);
    core.addColorStop(0.5, `rgba(${r},${gg},${b},${(0.55 + pulse * 0.4) * aM})`);
    core.addColorStop(1, `rgba(${r},${gg},${b},${0.16 * aM})`);
    ctx.fillStyle = core;
    ctx.fillRect(g.sx - 2.2, top + 1.5, 4.4, h - 3);
    ctx.fillStyle = `rgba(${r},${gg},${b},${0.8 * aM})`;
    ctx.fillRect(g.sx - W2 - 2.5, top - 1, 2.5 + W2 * 2 + 2.5, 1);
    ctx.fillRect(g.sx - W2 - 2.5, bot, 2.5 + W2 * 2 + 2.5, 1);

    if (n.kind === "terminal" && !dim) {
      ctx.strokeStyle = `rgba(${r},${gg},${b},${0.35 * aM})`;
      ctx.setLineDash([3, 4]);
      ctx.strokeRect(g.sx - W2 - 5, top - 5, W2 * 2 + 10, h + 10);
      ctx.setLineDash([]);
    }

    const shown = Math.round(n.count * easeOut(bp));
    ctx.textAlign = "center";
    ctx.font = `700 ${id === "traffic" ? 16 : 13.5}px 'JetBrains Mono', monospace`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = `rgba(${r},${gg},${b},${0.95 * aM})`;
    ctx.fillText(shown.toLocaleString(), g.sx, top - 10);
    ctx.font = "500 8.5px 'JetBrains Mono', monospace";
    ctx.textBaseline = "hanging";
    ctx.fillStyle = `rgba(242,240,230,${0.55 * aM})`;
    ctx.fillText(n.label, g.sx, bot + 8);
    if (n.kind === "terminal" || id === "traffic") {
      ctx.font = "500 8px 'JetBrains Mono', monospace";
      ctx.fillStyle = n.money ? `rgba(${r},${gg},${b},${0.85 * aM})` : `rgba(85,85,96,${0.9 * aM})`;
      ctx.fillText(n.sub, g.sx, bot + 20);
    }
  }

  start() {
    if (this.raf) return;
    if (this.reduced) {
      this.bootT0 = -1e9;
      this._update(0.001);
      for (let i = 0; i < 120; i++) this._update(0.05);
      this._first = true;
      this._draw();
      return;
    }
    const loop = (t) => {
      if (!this.lastT) this.lastT = t;
      let dt = Math.min((t - this.lastT) / 1000, 0.05);
      this.lastT = t;
      this._update(dt);
      this._draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; this.lastT = 0; }
  destroy() {
    this.stop();
    this.canvas.removeEventListener("mousemove", this._onMove);
    this.canvas.removeEventListener("mouseleave", this._onLeave);
  }
}
