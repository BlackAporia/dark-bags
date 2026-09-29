import { CFG } from '../shared/config.js';

const C = {
  void: '#07090f',
  floor: '#0e121b',
  grid: 'rgba(120, 135, 170, 0.07)',
  vault: '#16120c',
  vaultInk: 'rgba(247, 147, 26, 0.07)',
  wall: '#1c2230',
  wallEdge: '#323c54',
  sats: '#f7931a',
  gold: '#ffd166',
  exit: '#3ddc97',
  blood: '#ff4d5e',
  paper: '#ebe5d6',
  dust: '#8d93a6',
  sack: '#b8925f',
  sackDark: '#6f5534',
  barrel: '#aeb4c4',
  outline: '#07090f',
  dark: 'rgba(3, 4, 8, 0.94)',
};
const F_UI = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';
const F_NUM = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const F_DISPLAY = '"Big Shoulders Stencil Display", Impact, sans-serif';
const TAU = Math.PI * 2;
const BAG_SIZES = [8, 12, 17];

export class Renderer {
  constructor(canvas, mini) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dark = document.createElement('canvas');
    this.dctx = this.dark.getContext('2d');
    this.mini = mini;
    this.mctx = mini ? mini.getContext('2d') : null;
    this.miniBase = null;
    this.map = null;
    this.cam = { x: 0, y: 0 };
    this.scale = 1;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = innerWidth;
    this.h = innerHeight;
    for (const c of [this.canvas, this.dark]) {
      c.width = Math.round(this.w * dpr);
      c.height = Math.round(this.h * dpr);
    }
    // show roughly the same world area on every screen
    this.scale = Math.max(0.42, Math.min(1.5, Math.sqrt((this.w * this.h) / 1.25e6)));
    this.miniBase = null;
  }

  setMap(map) {
    this.map = map;
    this.miniBase = null;
  }

  toScreen(x, y) {
    return { x: (x - this.cam.x) * this.scale + this.w / 2, y: (y - this.cam.y) * this.scale + this.h / 2 };
  }

  // v: { cam, eye, me, players, orbs, drops, bullets, fx, time, golden, shake, hurt, showArrows }
  draw(v) {
    const map = this.map;
    if (!map) return;
    const { ctx, dpr } = this;
    const s = this.scale;
    this.cam.x = v.cam.x;
    this.cam.y = v.cam.y;
    let shx = 0;
    let shy = 0;
    if (v.shake > 0 && !this.reduced) {
      shx = (Math.random() - 0.5) * v.shake;
      shy = (Math.random() - 0.5) * v.shake;
    }
    const t = v.time;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, this.w, this.h);
    const worldTf = () =>
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.w / 2 - this.cam.x * s + shx), dpr * (this.h / 2 - this.cam.y * s + shy));
    worldTf();

    const hw = this.w / 2 / s + 60;
    const hh = this.h / 2 / s + 60;
    const vb = { x0: this.cam.x - hw, y0: this.cam.y - hh, x1: this.cam.x + hw, y1: this.cam.y + hh };
    const inView = (x, y, pad = 0) => x > vb.x0 - pad && x < vb.x1 + pad && y > vb.y0 - pad && y < vb.y1 + pad;

    // floor + grid
    ctx.fillStyle = C.floor;
    ctx.fillRect(0, 0, map.w, map.h);
    ctx.beginPath();
    const G = 80;
    const gx0 = Math.max(0, Math.floor(vb.x0 / G) * G);
    const gy0 = Math.max(0, Math.floor(vb.y0 / G) * G);
    for (let x = gx0; x <= Math.min(map.w, vb.x1); x += G) {
      ctx.moveTo(x, Math.max(0, vb.y0));
      ctx.lineTo(x, Math.min(map.h, vb.y1));
    }
    for (let y = gy0; y <= Math.min(map.h, vb.y1); y += G) {
      ctx.moveTo(Math.max(0, vb.x0), y);
      ctx.lineTo(Math.min(map.w, vb.x1), y);
    }
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1 / s;
    ctx.stroke();

    // vault floors
    for (const vt of map.vaults) {
      if (!inView(vt.x + vt.w / 2, vt.y + vt.h / 2, 400)) continue;
      ctx.fillStyle = C.vault;
      ctx.fillRect(vt.x, vt.y, vt.w, vt.h);
      ctx.save();
      ctx.fillStyle = C.vaultInk;
      ctx.font = `900 72px ${F_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('VAULT', vt.x + vt.w / 2, vt.y + vt.h / 2);
      ctx.restore();
    }

    // exits
    for (const e of map.extracts) {
      if (!inView(e.x, e.y, e.r)) continue;
      ctx.fillStyle = 'rgba(61, 220, 151, 0.08)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.fill();
      ctx.setLineDash([12, 9]);
      ctx.lineDashOffset = this.reduced ? 0 : -t / 45;
      ctx.strokeStyle = 'rgba(61, 220, 151, 0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // loot
    for (const o of v.orbs) if (inView(o.x, o.y, 40)) this.drawOrb(o, t, v.golden);
    for (const d of v.drops) if (inView(d.x, d.y, 40)) this.drawDrop(d, t);

    // bullets
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    for (const b of v.bullets) {
      ctx.strokeStyle = b.o ? '#ffcf8a' : '#fff4dc';
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // runners
    for (const p of v.players) this.drawRunner(p, false);
    if (v.me) this.drawRunner(v.me, true);

    // walls
    for (const w of map.walls) {
      if (w.x > vb.x1 || w.x + w.w < vb.x0 || w.y > vb.y1 || w.y + w.h < vb.y0) continue;
      ctx.fillStyle = C.wall;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = C.wallEdge;
      ctx.fillRect(w.x, w.y, w.w, 3);
    }
    ctx.strokeStyle = C.wallEdge;
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, map.w, map.h);

    // darkness with wall shadows
    this.drawDarkness(v.eye, shx, shy);

    // above the dark: exit landmarks, floating numbers, markers
    worldTf();
    for (const e of map.extracts) {
      if (!inView(e.x, e.y, e.r + 40)) continue;
      ctx.strokeStyle = 'rgba(61, 220, 151, 0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = C.exit;
      ctx.font = `600 14px ${F_UI}`;
      ctx.textAlign = 'center';
      ctx.fillText(`EXIT · ${e.name.toUpperCase()}`, e.x, e.y - e.r - 10);
    }
    for (const f of v.fx) this.drawFx(f, t);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (v.showArrows) this.drawExitArrows(v.eye);
    if (v.hurt > 0) {
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
      g.addColorStop(0, 'rgba(255, 77, 94, 0)');
      g.addColorStop(1, `rgba(255, 77, 94, ${0.45 * v.hurt})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    this.drawMini(v.eye, t, !!v.me);
  }

  drawOrb(o, t, golden) {
    const ctx = this.ctx;
    const col = golden ? C.gold : C.sats;
    const pulse = this.reduced ? 1 : 1 + Math.sin(t / 280 + o.i) * 0.12;
    const r = CFG.ORB_TIERS[o.t].r;
    if (o.t === 2) {
      ctx.fillStyle = golden ? 'rgba(255, 209, 102, 0.16)' : 'rgba(247, 147, 26, 0.16)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, 34 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3a2811';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(o.x - 14, o.y - 11, 28, 22, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = `600 14px ${F_NUM}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('₿', o.x, o.y + 1);
      ctx.textBaseline = 'alphabetic';
      return;
    }
    ctx.fillStyle = golden ? 'rgba(255, 209, 102, 0.15)' : 'rgba(247, 147, 26, 0.15)';
    ctx.beginPath();
    ctx.arc(o.x, o.y, r * 2.6 * pulse, 0, TAU);
    ctx.fill();
    if (o.t === 1) {
      ctx.fillStyle = '#9c5a0c';
      ctx.beginPath();
      ctx.arc(o.x, o.y + 4, r, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(o.x, o.y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(o.x - r * 0.3, o.y - r * 0.3, r * 0.3, 0, TAU);
    ctx.fill();
  }

  drawSack(x, y, s) {
    const ctx = this.ctx;
    ctx.fillStyle = C.sack;
    ctx.strokeStyle = C.sackDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.12, s, s * 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.sackDark;
    ctx.fillRect(x - s * 0.4, y - s * 0.95, s * 0.8, s * 0.3);
  }

  drawDrop(d, t) {
    const ctx = this.ctx;
    const k = this.reduced ? 0 : Math.sin(t / 220 + d.i);
    ctx.strokeStyle = `rgba(247, 147, 26, ${0.45 + k * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 26 + k * 3, 0, TAU);
    ctx.stroke();
    this.drawSack(d.x, d.y, 15);
    ctx.fillStyle = C.outline;
    ctx.font = `600 16px ${F_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', d.x, d.y + 3);
    ctx.textBaseline = 'alphabetic';
  }

  drawRunner(p, isMe) {
    const ctx = this.ctx;
    const r = CFG.PLAYER_R;
    const ca = Math.cos(p.a);
    const sa = Math.sin(p.a);
    const sz = BAG_SIZES[p.b ?? 1] ?? 12;
    if (p.d) {
      ctx.fillStyle = 'rgba(235, 229, 214, 0.12)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 10, 0, TAU);
      ctx.fill();
    }
    this.drawSack(p.x - ca * (r + sz * 0.3), p.y - sa * (r + sz * 0.3), sz);
    ctx.strokeStyle = C.barrel;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x + ca * r * 0.3, p.y + sa * r * 0.3);
    ctx.lineTo(p.x + ca * (r + 13), p.y + sa * (r + 13));
    ctx.stroke();
    ctx.fillStyle = p.c || C.paper;
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(7, 9, 15, 0.55)';
    ctx.beginPath();
    ctx.arc(p.x + ca * r * 0.45, p.y + sa * r * 0.45, r * 0.34, 0, TAU);
    ctx.fill();
    if (isMe) {
      ctx.strokeStyle = 'rgba(247, 147, 26, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, TAU);
      ctx.stroke();
    }
    if (p.s) {
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = 'rgba(235, 229, 214, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 12, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.e > 0) {
      ctx.strokeStyle = C.exit;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.e));
      ctx.stroke();
    }
    if (!isMe) {
      if (p.h < 100) {
        ctx.fillStyle = 'rgba(7, 9, 15, 0.8)';
        ctx.fillRect(p.x - 20, p.y - r - 14, 40, 5);
        ctx.fillStyle = p.h < 35 ? C.blood : C.paper;
        ctx.fillRect(p.x - 20, p.y - r - 14, (40 * Math.max(0, p.h)) / 100, 5);
      }
      ctx.fillStyle = 'rgba(235, 229, 214, 0.85)';
      ctx.font = `600 12px ${F_UI}`;
      ctx.textAlign = 'center';
      ctx.fillText(p.n, p.x, p.y + r + 18);
    }
  }

  drawFx(f, t) {
    const ctx = this.ctx;
    const age = (t - f.born) / f.life;
    if (age < 0 || age > 1) return;
    const a = 1 - age;
    if (f.kind === 'text') {
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = `600 ${f.size}px ${F_NUM}`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y - age * 46);
      ctx.globalAlpha = 1;
    } else if (f.kind === 'hitmark') {
      ctx.strokeStyle = `rgba(235, 229, 214, ${a})`;
      ctx.lineWidth = 3;
      const k = 7 + age * 4;
      ctx.beginPath();
      ctx.moveTo(f.x - k, f.y - k);
      ctx.lineTo(f.x - k / 2, f.y - k / 2);
      ctx.moveTo(f.x + k, f.y - k);
      ctx.lineTo(f.x + k / 2, f.y - k / 2);
      ctx.moveTo(f.x - k, f.y + k);
      ctx.lineTo(f.x - k / 2, f.y + k / 2);
      ctx.moveTo(f.x + k, f.y + k);
      ctx.lineTo(f.x + k / 2, f.y + k / 2);
      ctx.stroke();
    } else if (f.kind === 'flash') {
      ctx.fillStyle = `rgba(255, 214, 150, ${a * 0.9})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 9 + age * 6, 0, TAU);
      ctx.fill();
    } else if (f.kind === 'ring') {
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 10 + age * 60, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawDarkness(eye, shx, shy) {
    const d = this.dctx;
    const { dpr, map } = this;
    const s = this.scale;
    const W = this.dark.width;
    const H = this.dark.height;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W, H);
    d.fillStyle = C.dark;
    d.fillRect(0, 0, W, H);
    const ex = ((eye.x - this.cam.x) * s + this.w / 2 + shx) * dpr;
    const ey = ((eye.y - this.cam.y) * s + this.h / 2 + shy) * dpr;
    const R = CFG.VISION * s * dpr;
    d.globalCompositeOperation = 'destination-out';
    const g = d.createRadialGradient(ex, ey, R * 0.3, ex, ey, R);
    g.addColorStop(0, 'rgba(0, 0, 0, 1)');
    g.addColorStop(0.72, 'rgba(0, 0, 0, 0.88)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    d.fillStyle = g;
    d.beginPath();
    d.arc(ex, ey, R, 0, TAU);
    d.fill();

    d.globalCompositeOperation = 'source-over';
    d.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.w / 2 - this.cam.x * s + shx), dpr * (this.h / 2 - this.cam.y * s + shy));
    d.fillStyle = C.dark;
    d.beginPath();
    const V = CFG.VISION + 40;
    for (const w of map.walls) {
      if (w.x > eye.x + V || w.x + w.w < eye.x - V || w.y > eye.y + V || w.y + w.h < eye.y - V) continue;
      if (eye.x > w.x && eye.x < w.x + w.w && eye.y > w.y && eye.y < w.y + w.h) continue;
      this.shadowPoly(d, eye, w);
    }
    d.fill();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.dark, 0, 0);
  }

  // Shadow cast by a rectangle, from the two silhouette corners out to "far away".
  shadowPoly(d, E, w) {
    const cs = [
      [w.x, w.y],
      [w.x + w.w, w.y],
      [w.x + w.w, w.y + w.h],
      [w.x, w.y + w.h],
    ];
    const base = Math.atan2(w.y + w.h / 2 - E.y, w.x + w.w / 2 - E.x);
    let minA = Infinity;
    let maxA = -Infinity;
    let cMin = cs[0];
    let cMax = cs[0];
    for (const c of cs) {
      let a = Math.atan2(c[1] - E.y, c[0] - E.x) - base;
      while (a > Math.PI) a -= TAU;
      while (a < -Math.PI) a += TAU;
      if (a < minA) {
        minA = a;
        cMin = c;
      }
      if (a > maxA) {
        maxA = a;
        cMax = c;
      }
    }
    const FAR = 3000;
    d.moveTo(cMin[0], cMin[1]);
    d.lineTo(cMin[0] + Math.cos(base + minA) * FAR, cMin[1] + Math.sin(base + minA) * FAR);
    d.lineTo(E.x + Math.cos(base) * FAR * 2, E.y + Math.sin(base) * FAR * 2);
    d.lineTo(cMax[0] + Math.cos(base + maxA) * FAR, cMax[1] + Math.sin(base + maxA) * FAR);
    d.lineTo(cMax[0], cMax[1]);
    d.closePath();
  }

  drawExitArrows(eye) {
    const ctx = this.ctx;
    const m = 34;
    for (const e of this.map.extracts) {
      const p = this.toScreen(e.x, e.y);
      if (p.x > m && p.x < this.w - m && p.y > m && p.y < this.h - m) continue;
      const dx = p.x - this.w / 2;
      const dy = p.y - this.h / 2;
      const k = Math.min((this.w / 2 - m) / Math.abs(dx || 1e-6), (this.h / 2 - m) / Math.abs(dy || 1e-6));
      const x = this.w / 2 + dx * k;
      const y = this.h / 2 + dy * k;
      const a = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = C.exit;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, -8);
      ctx.lineTo(-6, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      const dist = Math.hypot(e.x - eye.x, e.y - eye.y) / 10; // 10 px ≈ 1 m
      ctx.fillStyle = C.exit;
      ctx.font = `600 11px ${F_NUM}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(dist)}m`, x - Math.cos(a) * 20, y - Math.sin(a) * 20 + 4);
    }
  }

  buildMini() {
    const mini = this.mini;
    const cw = mini.clientWidth;
    if (!cw) return false;
    const px = Math.round(cw * this.dpr);
    mini.width = px;
    mini.height = px;
    const base = document.createElement('canvas');
    base.width = px;
    base.height = px;
    const b = base.getContext('2d');
    const k = px / this.map.w;
    b.fillStyle = 'rgba(14, 18, 27, 0.9)';
    b.fillRect(0, 0, px, px);
    b.fillStyle = '#2a2116';
    for (const v of this.map.vaults) b.fillRect(v.x * k, v.y * k, v.w * k, v.h * k);
    b.fillStyle = '#3a4358';
    for (const w of this.map.walls) b.fillRect(w.x * k, w.y * k, Math.max(1, w.w * k), Math.max(1, w.h * k));
    this.miniBase = base;
    this.miniK = k;
    return true;
  }

  drawMini(eye, t, alive) {
    const m = this.mctx;
    if (!m || !this.map || this.mini.offsetParent === null) return;
    if (!this.miniBase && !this.buildMini()) return;
    const k = this.miniK;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, this.mini.width, this.mini.height);
    m.drawImage(this.miniBase, 0, 0);
    const pulse = this.reduced ? 0 : Math.sin(t / 300) * 1.5;
    m.fillStyle = C.exit;
    for (const e of this.map.extracts) {
      m.beginPath();
      m.arc(e.x * k, e.y * k, 4 * this.dpr + pulse, 0, TAU);
      m.fill();
    }
    m.strokeStyle = 'rgba(235, 229, 214, 0.25)';
    m.lineWidth = 1;
    m.beginPath();
    m.arc(eye.x * k, eye.y * k, CFG.VISION * k, 0, TAU);
    m.stroke();
    m.fillStyle = alive ? C.sats : C.dust;
    m.beginPath();
    m.arc(eye.x * k, eye.y * k, 3.5 * this.dpr, 0, TAU);
    m.fill();
  }
}
