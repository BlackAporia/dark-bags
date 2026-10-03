import { CFG } from '../shared/config.js';
import { rankImage } from './rankbadge.js';
import { segWalls } from '../shared/geom.js';
import { WEAPONS } from '../shared/weapons.js';
import { MapLayer } from './mapLayer.js';
import { pose, drawFigure, FEET, hpColor } from './stickman.js';
import { textures, canvas } from './textures.js';
import { FINISH, RARITY_ORDER, TURRET_SKIN } from '../shared/cosmetics.js';
import { neonText, neonColor } from './ranked.js';
import { drawZombie, drawZombieTag, drawGoldBag, drawMedkit } from './zombie.js';
import { THEME, glowPoints, Weather } from './themes.js';
import { KillFx, paintName, resetPaint } from './flair.js';

const C = {
  void: '#07090f',
  loot: '#f7931a',
  gold: '#ffd166',
  exit: '#3ddc97',
  amber: '#f5a524',
  blood: '#ff4d5e',
  paper: '#ebe5d6',
  dust: '#8d93a6',
  dark: 'rgba(3, 4, 8, 0.94)',
};
const F_UI = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';
const F_NUM = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const TAU = Math.PI * 2;
const GUN_Z = 18; // bullets and lasers fly at gun height above the ground plane

function glowSprite(color, size = 64) {
  const c = canvas(size, size);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

// achievement title colours by tier (mythic cycles, mystery flickers)
const TITLE_COL = { common: 'rgba(214, 219, 230, 0.9)', rare: '#4cc9f0', epic: '#c08bff', legendary: '#ffd166' };

// team colours: your side green, the other side red
const TEAM_ALLY = { fill: 'rgba(61, 220, 151, 0.22)', line: '#3ddc97', glow: 'rgba(61, 220, 151, 0.9)' };
const TEAM_FOE = { fill: 'rgba(255, 77, 94, 0.24)', line: '#ff4d5e', glow: 'rgba(255, 77, 94, 0.95)' };

export class Renderer {
  constructor(canvasEl, mini) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.dark = document.createElement('canvas');
    this.dctx = this.dark.getContext('2d');
    this.mini = mini;
    this.mctx = mini ? mini.getContext('2d') : null;
    this.miniBase = null;
    this.map = null;
    this.layer = new MapLayer();
    this.killfx = new KillFx();
    this.cam = { x: 0, y: 0 };
    this.scale = 1;
    this.quality = 2;
    this.ema = 16;
    this.slowT = 0;
    this.fastT = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.glow = {
      loot: glowSprite('rgba(247,147,26,0.55)'),
      gold: glowSprite('rgba(255,209,102,0.6)'),
      laser: glowSprite('rgba(255,40,60,0.9)', 32),
    };
    textures(); // build procedural textures up front
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const cap = [1, 1.5, 2][this.quality];
    const dpr = Math.min(devicePixelRatio || 1, cap);
    this.dpr = dpr;
    this.w = innerWidth;
    this.h = innerHeight;
    for (const c of [this.canvas, this.dark]) {
      c.width = Math.round(this.w * dpr);
      c.height = Math.round(this.h * dpr);
    }
    this.scale = Math.max(0.5, Math.min(1.6, Math.sqrt((this.w * this.h) / 1.1e6)));
    const res = Math.max(0.5, Math.min(2, Math.round(this.scale * dpr * 4) / 4));
    this.layer.setRes(res, this.quality >= 1);
    this.miniBase = null;
  }

  // Adaptive quality: drop resolution and effects when frames get slow, restore when fast.
  // settings: 'auto' adapts, or pin low/medium/high (0/1/2)
  setQuality(q) {
    this.lockQuality = q;
    if (q !== null && q !== undefined && q !== this.quality) {
      this.quality = q;
      this.resize();
    }
  }

  measure(dtMs) {
    this.ema += (dtMs - this.ema) * 0.05;
    if (this.lockQuality !== null && this.lockQuality !== undefined) return; // the player picked a quality
    if (this.ema > 24) {
      this.slowT += dtMs;
      this.fastT = 0;
      if (this.slowT > 2000 && this.quality > 0) {
        this.quality--;
        this.slowT = 0;
        this.resize();
      }
    } else if (this.ema < 14) {
      this.fastT += dtMs;
      this.slowT = 0;
      if (this.fastT > 8000 && this.quality < 2) {
        this.quality++;
        this.fastT = 0;
        this.resize();
      }
    } else {
      this.slowT = 0;
      this.fastT = 0;
    }
  }

  setMap(map) {
    if (this.map === map) return;
    this.map = map;
    this.layer.setMap(map);
    this.miniBase = null;
    const th = THEME[map.theme];
    this.darkCol = th?.dark ?? C.dark;
    this.glows = th ? glowPoints(map) : [];
    this.weather = new Weather(th?.weather);
  }

  prewarm(x, y) {
    this.layer.prewarm(x, y, Math.max(this.w, this.h) / this.scale / 2 + 200);
  }

  toScreen(x, y) {
    return { x: (x - this.cam.x) * this.scale + this.w / 2, y: (y - this.cam.y) * this.scale + this.h / 2 };
  }

  /**
   * v: { cam, eye, figures, orbs, drops, bullets, fx, time, golden, zone, zonePlan,
   *      exitStates, shake, hurt, storm, showArrows, gore, meAlive }
   * figures: [{ a (anim state), color, name, hp, isMe, flash, shield, ext, pr, laser }]
   */
  draw(v) {
    const map = this.map;
    if (!map) return;
    const { ctx, dpr } = this;
    const s = this.scale;
    const t = v.time;
    this.cam.x = v.cam.x;
    this.cam.y = v.cam.y;
    let shx = 0;
    let shy = 0;
    if (v.shake > 0 && !this.reduced) {
      shx = (Math.random() - 0.5) * v.shake;
      shy = (Math.random() - 0.5) * v.shake;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, this.w, this.h);
    const worldTf = () =>
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.w / 2 - this.cam.x * s + shx), dpr * (this.h / 2 - this.cam.y * s + shy));
    worldTf();
    const hw = this.w / 2 / s + 80;
    const hh = this.h / 2 / s + 80;
    const vb = { x0: this.cam.x - hw, y0: this.cam.y - hh, x1: this.cam.x + hw, y1: this.cam.y + hh };
    const inView = (x, y, pad = 0) => x > vb.x0 - pad && x < vb.x1 + pad && y > vb.y0 - pad && y < vb.y1 + pad;

    // 1. static textured map (cached chunks)
    this.layer.draw(ctx, vb, this.quality >= 1 ? 2 : 1);

    // 2. exits: live state on top of the painted pads
    for (const e of this.noExits ? [] : map.extracts) {
      if (!inView(e.x, e.y, e.r + 20)) continue;
      const st = v.exitStates?.[e.id] ?? 'open';
      this.drawExit(e, st, t);
    }

    // 3. ground decals, then loot
    v.fx.drawGround(ctx, t, inView);
    for (const o of v.orbs) if (inView(o.x, o.y, 40)) this.drawOrb(o, t, v.golden);
    for (const d of v.drops) if (inView(d.x, d.y, 40)) this.drawDrop(d, t);
    for (const m of v.mines ?? []) this.drawMineBase(m, t);
    for (const g of v.gold ?? []) if (inView(g.x, g.y, 40)) drawGoldBag(ctx, g, t, this.reduced);
    for (const m of v.packs ?? []) if (inView(m.x, m.y, 40)) drawMedkit(ctx, m, t, this.reduced);

    // 4. runners and graves, sorted by depth
    const items = [];
    // touch auto-aim: a red ring under the runner the Fire button is locked on
    if (v.target != null) {
      const f = v.figures.find((x) => x.a.id === v.target);
      if (f) {
        const k = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(t / 90);
        ctx.strokeStyle = 'rgba(255, 77, 94, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(f.a.x, f.a.y + FEET, 26 * k, 11 * k, 0, 0, TAU);
        ctx.stroke();
      }
    }
    for (const f of v.figures) if (inView(f.a.x, f.a.y, 80)) items.push({ y: f.a.y + FEET, draw: () => this.drawRunner(f, t, v.gore) });
    for (const z of v.zombies ?? []) if (inView(z.a.x, z.a.y, 120)) items.push({ y: z.a.y + FEET, draw: () => drawZombie(ctx, z, t, v.gore) });
    for (const g of v.fx.graveItems(t, v.gore)) items.push(g);
    for (const o of v.turrets ?? []) if (inView(o.x, o.y, 60)) items.push({ y: o.y, draw: () => this.drawTurret(o, t) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw(ctx);

    // 5. lasers and bullets (at gun height), then particles
    ctx.globalCompositeOperation = 'lighter';
    for (const f of v.figures) if (f.laser && f.p) this.drawLaser(f);
    for (const m of v.mines ?? []) this.drawMineBeam(m, t);
    ctx.lineCap = 'round';
    for (const b of v.bullets) if (inView(b.x, b.y, 80)) this.drawTracer(b, t);
    ctx.globalCompositeOperation = 'source-over';
    v.fx.drawAir(ctx, t);
    this.killfx.draw(ctx, t, this.reduced);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 6. darkness with wall shadows and muzzle-flash light
    this.drawDarkness(v.eye, shx, shy, v.fx.lights, t);

    // 7. the storm glows through the dark, the weather drifts over it
    worldTf();
    if (v.zone) this.drawStorm(v.zone, t, vb);
    if (this.weather?.kind) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.weather.draw(ctx, this.w, this.h, this.cam, t, this.reduced, this.quality);
      worldTf();
    }

    // 8. crisp overlays: exit labels, names and health, floaters
    for (const e of this.noExits ? [] : map.extracts) {
      if (!inView(e.x, e.y, e.r + 60)) continue;
      const st = v.exitStates?.[e.id] ?? 'open';
      const label = st === 'last' ? `LAST EXIT · ${e.name.toUpperCase()}` : st === 'closed' ? `CLOSED · ${e.name.toUpperCase()}` : `EXIT · ${e.name.toUpperCase()}${st === 'closing' ? ' · CLOSING' : ''}`;
      ctx.fillStyle = st === 'last' ? C.gold : st === 'closed' ? C.blood : st === 'closing' ? C.amber : C.exit;
      ctx.font = `600 14px ${F_UI}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, e.x, e.y - e.r - 12);
    }
    for (const f of v.figures) if (inView(f.a.x, f.a.y, 60) && f.p) this.drawTag(f);
    for (const z of v.zombies ?? []) if (inView(z.a.x, z.a.y, 120)) drawZombieTag(ctx, z, F_UI);
    v.fx.drawFloaters(ctx);

    // 9. screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (v.showArrows) this.drawExitArrows(v.eye, v.exitStates);
    if (v.storm && v.zone) this.drawSafeArrow(v.eye, v.zone, t);
    this.drawVignette(v.hurt, v.storm, t);
    this.drawMini(v.eye, t, v.meAlive, v.zone, v.exitStates, v.radar);
  }

  // ------------------------------------------------------------- pieces

  drawExit(e, st, t) {
    const ctx = this.ctx;
    const col = st === 'last' ? C.gold : st === 'closed' ? C.blood : st === 'closing' ? C.amber : C.exit;
    ctx.save();
    ctx.globalAlpha = st === 'closed' ? 0.6 : 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.setLineDash(st === 'closed' ? [] : [14, 10]);
    ctx.lineDashOffset = this.reduced ? 0 : -t / 40;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    if (st === 'closed') {
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(e.x - 26, e.y - 26);
      ctx.lineTo(e.x + 26, e.y + 26);
      ctx.moveTo(e.x + 26, e.y - 26);
      ctx.lineTo(e.x - 26, e.y + 26);
      ctx.stroke();
    } else {
      const pulse = this.reduced ? 0.5 : (Math.sin(t / 260) + 1) / 2;
      ctx.globalAlpha = 0.08 + pulse * 0.08;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawOrb(o, t, golden) {
    const ctx = this.ctx;
    const col = golden ? C.gold : C.loot;
    const bob = this.reduced ? 0 : Math.sin(t / 300 + o.i) * 2;
    const g = golden ? this.glow.gold : this.glow.loot;
    const halo = [34, 46, 80][o.t];
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(g, o.x - halo / 2, o.y - halo / 2, halo, halo);
    ctx.globalCompositeOperation = 'source-over';
    // shadow on the floor
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(o.x, o.y + 4, [5, 8, 14][o.t], [2, 3, 5][o.t], 0, 0, TAU);
    ctx.fill();
    if (o.t === 2) {
      // chest
      const y = o.y - 8 + bob * 0.5;
      ctx.fillStyle = '#3a2811';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(o.x - 13, y - 6, 26, 16, 3);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(o.x - 13, y);
      ctx.lineTo(o.x + 13, y);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillRect(o.x - 3, y - 2, 6, 6);
      return;
    }
    const n = o.t === 1 ? 3 : 1;
    const r = o.t === 1 ? 7 : 5.5;
    for (let i = 0; i < n; i++) {
      const y = o.y - 6 - i * 3 + bob;
      const spin = o.t === 0 && !this.reduced ? Math.abs(Math.cos(t / 240 + o.i)) : 1;
      ctx.fillStyle = '#9c5a0c';
      ctx.beginPath();
      ctx.ellipse(o.x, y + 1.5, r * spin, r * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(o.x, y, r * spin, r * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(o.x - r * 0.3 * spin, y - 1, r * 0.3 * spin, r * 0.15, 0, 0, TAU);
      ctx.fill();
    }
  }

  drawDrop(d, t) {
    const ctx = this.ctx;
    const k = this.reduced ? 0 : Math.sin(t / 220 + d.i);
    ctx.strokeStyle = `rgba(247, 147, 26, ${0.45 + k * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + 4, 24 + k * 3, 10 + k, 0, 0, TAU);
    ctx.stroke();
    const y = d.y - 8;
    ctx.fillStyle = '#6f5534';
    ctx.strokeStyle = 'rgba(4,6,10,0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(d.x, y, 12, 13, 0, 0, TAU);
    ctx.stroke();
    ctx.fill();
    ctx.strokeStyle = '#b8925f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(d.x - 5, y - 12);
    ctx.lineTo(d.x + 5, y - 12);
    ctx.stroke();
    ctx.fillStyle = C.paper;
    ctx.font = `600 15px ${F_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', d.x, y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  // Tracers. Plain bullets are warm streaks; a weapon skin paints its own neon by rarity:
  // rare and up burn in the skin colour with a white-hot core, epic trails longer,
  // legendary sheds sparks, mythic leaves a pulsing plasma tail, exotic cycles the spectrum.
  drawTracer(b, t) {
    const ctx = this.ctx;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / sp;
    const uy = b.vy / sp;
    const y = b.y - GUN_Z;
    if (b.k === 'r') {
      // a turret rocket: smoke behind, a flame, a red-tipped body
      const tail = Math.min(40, b.tr ?? 40);
      const g = ctx.createLinearGradient(b.x - ux * tail, y - uy * tail, b.x, y);
      g.addColorStop(0, 'rgba(160,160,170,0)');
      g.addColorStop(1, 'rgba(200,200,210,0.55)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(b.x - ux * tail, y - uy * tail);
      ctx.lineTo(b.x - ux * 6, y - uy * 6);
      ctx.stroke();
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(b.x - ux * (12 + Math.random() * 6), y - uy * (12 + Math.random() * 6));
      ctx.lineTo(b.x - ux * 5, y - uy * 5);
      ctx.stroke();
      ctx.strokeStyle = '#d9dde6';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(b.x - ux * 6, y - uy * 6);
      ctx.lineTo(b.x + ux * 5, y + uy * 5);
      ctx.stroke();
      ctx.fillStyle = '#ff4d5e';
      ctx.beginPath();
      ctx.arc(b.x + ux * 5, y + uy * 5, 2.4, 0, TAU);
      ctx.fill();
      return;
    }
    if (b.k === 'c') {
      // a cannon shell: a fat, hot streak
      const len = Math.min(34, b.tr ?? 34);
      ctx.strokeStyle = '#ffb347';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(b.x - ux * len, y - uy * len);
      ctx.lineTo(b.x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff1c9';
      ctx.lineWidth = 3.2;
      ctx.stroke();
      return;
    }
    const f = b.s ? FINISH[b.s] : null;
    const tier = f ? RARITY_ORDER.indexOf(f.rarity) : -1;
    const base = Math.min(46, sp * 0.028, b.tr ?? 46); // never a tail behind the gun
    if (tier < 1) {
      const c = f ? f.color : b.o ? '#ffc478' : '#fff0d2';
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = c;
      ctx.lineWidth = sp > 1800 ? 3.2 : 2.2;
      ctx.beginPath();
      ctx.moveTo(b.x - ux * base, y - uy * base);
      ctx.lineTo(b.x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    const len = Math.min(base * [1, 1.5, 2.1, 2.5, 3.2, 3.8][tier], b.tr ?? 999);
    // the skin's own colour is the neon; mythic and up burn hotter in the accent at the core
    const neon = f.fx === 'rainbow' ? `hsl(${(t / 3 + b.i * 37) % 360}, 100%, 62%)` : f.color;
    const hot = f.fx === 'rainbow' ? `hsl(${(t / 3 + b.i * 37 + 60) % 360}, 100%, 70%)` : tier >= 4 && f.accent ? f.accent : f.color;
    const tx = b.x - ux * len;
    const ty = y - uy * len;
    const wob = tier >= 4 ? 1 + 0.25 * Math.sin(t / 40 + b.i) : 1;
    // glow, body, white-hot core; the tail fades out along its length
    const thick = [1, 1, 1.15, 1.3, 1.5, 1.7][tier];
    for (const [w, al, c] of [[14 * wob * thick, 0.14, neon], [6.5 * wob * thick, 0.42, hot], [2.4 * thick, 1, '#ffffff']]) {
      const g = ctx.createLinearGradient(tx, ty, b.x, y);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.35, c);
      g.addColorStop(1, c);
      ctx.globalAlpha = al;
      ctx.strokeStyle = g;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, y);
      ctx.stroke();
    }
    if (tier >= 3) {
      // sparks shed behind the round (seeded by the bullet, so they don't flicker)
      for (let i = 0; i < (tier >= 5 ? 10 : tier >= 4 ? 7 : 5); i++) {
        const k = ((b.i * 13 + i * 7) % 10) / 10;
        const off = (((b.i * 31 + i * 17) % 11) - 5) * 0.7;
        ctx.globalAlpha = 0.9 * (1 - k);
        ctx.fillStyle = tier >= 5 ? `hsl(${(t / 2 + i * 50) % 360}, 100%, 70%)` : tier === 3 ? '#ffe29a' : neon;
        ctx.beginPath();
        ctx.arc(b.x - ux * len * k - uy * off * 1.6, y - uy * len * k + ux * off * 1.6, 1.4 + 1.4 * (1 - k), 0, TAU);
        ctx.fill();
      }
    }
    if (tier >= 4) {
      // the round itself: a burning orb, a star flare on exotics
      const r = tier >= 5 ? 5.2 : 4.2;
      const g = ctx.createRadialGradient(b.x, y, 0, b.x, y, r * 3);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, hot);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, y, r * 3, 0, TAU);
      ctx.fill();
      if (tier >= 5) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(b.x - 14, y);
        ctx.lineTo(b.x + 14, y);
        ctx.moveTo(b.x, y - 14);
        ctx.lineTo(b.x, y + 14);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawRunner(f, t, gore) {
    const ctx = this.ctx;
    const a = f.a;
    const gx = a.x;
    const gy = a.y + FEET;
    // shadow and ground rings
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(gx, gy, 13, 5, 0, 0, TAU);
    ctx.fill();
    if (f.isMe) {
      ctx.strokeStyle = 'rgba(247, 147, 26, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 18, 7, 0, 0, TAU);
      ctx.stroke();
    }
    // team modes: a coloured disc under every runner, green for your side, red for theirs
    const side = f.ally === true ? TEAM_ALLY : f.ally === false ? TEAM_FOE : null;
    if (side) {
      ctx.fillStyle = side.fill;
      ctx.strokeStyle = side.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 19, 7.5, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    if (f.ext > 0) {
      ctx.strokeStyle = C.exit;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 24, 10, 0, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, f.ext));
      ctx.stroke();
    }
    if (a.dashT && t - a.dashT < 160) {
      // afterimages
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = 0.18 / i;
        const ghost = { ...a, x: a.x - a.vx * 0.02 * i, y: a.y - a.vy * 0.02 * i };
        drawFigure(ctx, ghost, pose(ghost, t, gore), { gore, color: f.color });
      }
      ctx.globalAlpha = 1;
    }
    const p = pose(a, t, gore);
    f.p = p;
    if (side && this.quality >= 1) {
      // and a glow around the figure itself, so you can tell sides apart mid-fight
      ctx.shadowColor = side.glow;
      ctx.shadowBlur = 12;
    }
    drawFigure(ctx, a, p, { gore, color: f.color, flash: f.flash });
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    if (f.shield) {
      ctx.strokeStyle = 'rgba(235, 229, 214, 0.55)';
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(gx, gy - 24, 20, 32, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawLaser(f) {
    const ctx = this.ctx;
    const p = f.p;
    const a = f.a;
    const ux = Math.cos(p.aim);
    const uy = Math.sin(p.aim);
    const range = WEAPONS[a.w].range;
    // the laser is traced on the ground plane from the runner, drawn at gun height
    const hit = segWalls(a.x, a.y, a.x + ux * range, a.y + uy * range, this.map.walls);
    const len = hit >= 0 ? hit * range : range;
    const ex = a.x + ux * len;
    const ey = a.y + uy * len - GUN_Z;
    // a skinned sniper paints its laser in the skin's neon, with a soft glow around it
    const fin = FINISH[a.ws?.[WEAPONS[a.w].id]];
    const tier = fin ? RARITY_ORDER.indexOf(fin.rarity) : -1;
    if (tier >= 1) {
      const c = fin.fx === 'rainbow' ? `hsl(${(performance.now() / 4) % 360}, 100%, 62%)` : fin.color;
      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(p.muzzle.x, p.muzzle.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.globalAlpha = 0.8;
    }
    ctx.strokeStyle = tier >= 1 ? (fin.fx === 'rainbow' ? '#ffffff' : fin.color) : 'rgba(255, 40, 60, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.muzzle.x, p.muzzle.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.drawImage(this.glow.laser, ex - 8, ey - 8, 16, 16);
  }

  // Guns + Lasers. Colours say whose it is: green yours, cyan a teammate's, red an enemy's.
  gadgetColor(o) {
    return o.o === 1 ? '#3ddc97' : o.o === 2 ? '#4cc9f0' : '#ff4d5e';
  }

  // sentry turret: a tripod, a turning head with a twin barrel, a health ring and a scan cone
  drawTurret(o, t) {
    const ctx = this.ctx;
    const col = this.gadgetColor(o);
    const sk = o.sk ? TURRET_SKIN[o.sk] : null; // a seasonal turret skin: body, trim, eye
    const z = 22;
    ctx.save();
    // shadow and legs
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(o.x, o.y + 2, 18, 7, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2b3242';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const dx of [-13, 0, 13]) {
      ctx.moveTo(o.x, o.y - z + 6);
      ctx.lineTo(o.x + dx, o.y + (dx ? 1 : 4));
    }
    ctx.stroke();
    // scan cone, faint
    if (!this.reduced) {
      const g = ctx.createRadialGradient(o.x, o.y - z, 0, o.x, o.y - z, 110);
      g.addColorStop(0, `${col}40`);
      g.addColorStop(1, `${col}00`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y - z);
      ctx.arc(o.x, o.y - z, 110, o.a - 0.35, o.a + 0.35);
      ctx.closePath();
      ctx.fill();
    }
    // head: level 1 twin light guns; level 2 a heavy cannon with armour plates and gold
    // trim; level 3 a rocket pod (two launch tubes with warheads showing)
    const lv = o.lv ?? 1;
    ctx.translate(o.x, o.y - z);
    ctx.rotate(o.a);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    if (lv === 1) {
      ctx.fillStyle = sk ? sk.trim : '#12161f';
      ctx.fillRect(4, -5, sk?.fx ? 24 : 20, 3.5);
      ctx.fillRect(4, 1.5, sk?.fx ? 24 : 20, 3.5);
    } else if (lv === 2) {
      ctx.fillStyle = '#2a2f3c';
      ctx.fillRect(4, -3.5, 27, 7);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(26, -4.5, 6, 9); // muzzle brake
      ctx.strokeRect(4, -3.5, 27, 7);
    } else {
      for (const yy of [-8, 2]) {
        ctx.fillStyle = '#3a4253';
        ctx.fillRect(2, yy, 22, 6);
        ctx.strokeRect(2, yy, 22, 6);
        ctx.fillStyle = '#ff4d5e';
        ctx.beginPath();
        ctx.moveTo(24, yy);
        ctx.lineTo(29, yy + 3);
        ctx.lineTo(24, yy + 6);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.fillStyle = sk ? sk.body : lv === 3 ? '#2a1418' : lv === 2 ? '#1b2130' : '#12161f';
    ctx.beginPath();
    ctx.roundRect(lv > 1 ? -12 : -10, lv > 1 ? -11 : -9, lv > 1 ? 22 : 18, lv > 1 ? 22 : 18, 5);
    ctx.fill();
    ctx.stroke();
    if (lv > 1) {
      // armour plates, gold for the cannon, red for the rocket pod
      ctx.strokeStyle = lv === 3 ? '#ff4d5e' : '#ffd166';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-9, -8, 16, 16);
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-16, -6);
      ctx.moveTo(-12, 0);
      ctx.lineTo(-16, 6);
      ctx.stroke();
    }
    if (sk) {
      // trim plates on the head, and a halo for the mythic ones
      ctx.strokeStyle = sk.trim;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-7, -6, 12, 12);
      if (sk.fx && !this.reduced) {
        ctx.strokeStyle = sk.eye;
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t / 180);
        ctx.beginPath();
        ctx.arc(1, 0, 13, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = sk ? sk.eye : col;
    ctx.shadowColor = sk ? sk.eye : col;
    ctx.shadowBlur = this.quality >= 1 ? 10 : 0;
    ctx.beginPath();
    ctx.arc(1, 0, 3 + (this.reduced ? 0 : Math.sin(t / 140) * 0.8), 0, TAU);
    ctx.fill();
    ctx.restore();
    // health arc
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(o.x, o.y - z, 15, -Math.PI / 2, -Math.PI / 2 + (TAU * Math.max(0, o.h)) / 100);
    ctx.stroke();
    ctx.globalAlpha = 1;
    this.levelPips(o.x, o.y - z - 22, o.lv ?? 1);
  }

  // ★ marks over a gadget: its level
  levelPips(x, y, lv) {
    if (lv <= 1) return;
    const ctx = this.ctx;
    ctx.font = `900 10px ${F_UI}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = lv === 3 ? '#ff4d5e' : '#ffd166';
    ctx.strokeStyle = 'rgba(4,6,10,0.85)';
    ctx.lineWidth = 3;
    const txt = `${'★'.repeat(lv)}`;
    ctx.strokeText(txt, x, y);
    ctx.fillText(txt, x, y);
  }

  // laser tripmine: a small charge on the floor, blinking until armed
  drawMineBase(m, t) {
    const ctx = this.ctx;
    const col = this.gadgetColor(m);
    ctx.fillStyle = '#161b26';
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(m.x - 7, m.y - 5, 14, 10, 3);
    ctx.fill();
    ctx.stroke();
    const on = m.arm || Math.floor(t / 180) % 2 === 0;
    if (on) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.2, 0, TAU);
      ctx.fill();
    }
    this.levelPips(m.x, m.y - 10, m.lv ?? 1);
  }

  // the beam itself, drawn additively: a soft glow, a hot core, a travelling shimmer
  drawMineBeam(m, t) {
    // an upgraded tripmine fans out two or three beams: each drawn like the first
    if (m.ls && !m._one) {
      for (const [x2, y2] of m.ls) this.drawMineBeam({ ...m, x2, y2, _one: true }, t);
      return;
    }
    const ctx = this.ctx;
    const col = this.gadgetColor(m);
    const y0 = m.y - 6;
    const y1 = m.y2 - 6;
    if (!m.arm) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(m.x, y0);
      ctx.lineTo(m.x2, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      return;
    }
    const k = this.reduced ? 1 : 0.75 + Math.sin(t / 90 + m.i) * 0.25;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.22 * k;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(m.x, y0);
    ctx.lineTo(m.x2, y1);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.6 * k;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    if (!this.reduced) {
      const u = ((t / 700 + m.i * 0.37) % 1 + 1) % 1;
      const sx = m.x + (m.x2 - m.x) * u;
      const sy = y0 + (y1 - y0) * u;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.glow.laser, m.x2 - 7, y1 - 7, 14, 14);
  }

  drawTag(f) {
    const ctx = this.ctx;
    const p = f.p;
    const top = p.head.y - p.head.r - 8;
    const frac = Math.max(0, Math.min(1, f.hp / 100));
    const side = f.ally === true ? TEAM_ALLY : f.ally === false ? TEAM_FOE : null;
    // everyone who is not on your side is an enemy: red name, red health bar, in every mode
    const foe = !f.isMe && f.ally !== true;
    const w = side ? 40 : 34;
    ctx.fillStyle = 'rgba(4, 6, 10, 0.8)';
    ctx.fillRect(p.head.x - w / 2 - 1, top - 1, w + 2, 6);
    // team modes: the bar in the side's colour (red for enemies, green for allies)
    ctx.fillStyle = side ? side.line : foe ? TEAM_FOE.line : hpColor(frac);
    ctx.fillRect(p.head.x - w / 2, top, w * frac, 4);
    if (side) {
      ctx.strokeStyle = side.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(p.head.x - w / 2 - 1.5, top - 1.5, w + 3, 7);
    }
    if (f.ping != null) {
      // their round trip to the server, right of the health bar
      ctx.font = `700 8px ${F_UI}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = f.ping < 80 ? '#3ddc97' : f.ping < 160 ? '#ffd166' : '#ff6b6b';
      ctx.fillText(`${f.ping}ms`, p.head.x + w / 2 + 3, top + 4);
    }
    if (f.isMe || !f.noName || side || foe) {
      // your own name too, in gold, so you can find yourself in a fight
      // team modes: allies green, enemies red
      ctx.fillStyle = f.isMe ? '#ffd166' : f.ally === true ? '#3ddc97' : '#ff6b6b';
      ctx.font = `600 11px ${F_UI}`;
      ctx.textAlign = 'center';
      const label = `${f.name}${f.pr ? ` ${'★'.repeat(Math.min(3, f.pr))}` : ''}`;
      const badge = f.rk ? rankImage(f.rk) : null;
      // a name effect (style), outside team colours
      const fxName = f.nf && (f.isMe || f.ally == null) && !this.reduced ? f.nf : null;
      if (fxName) ctx.font = `800 11px ${F_UI}`;
      const tw = ctx.measureText(label).width;
      if (badge) {
        // rank insignia to the left of the name, the pair centred over the head
        const x0 = p.head.x - (tw + 16) / 2;
        ctx.drawImage(badge, x0, top - 17, 14, 14);
        if (fxName) paintName(ctx, fxName, x0 + 16 + tw / 2, tw, top - 5, performance.now());
        ctx.textAlign = 'left';
        ctx.fillText(label, x0 + 16, top - 5);
        ctx.textAlign = 'center';
      } else {
        if (fxName) paintName(ctx, fxName, p.head.x, tw, top - 5, performance.now());
        ctx.fillText(label, p.head.x, top - 5);
      }
      if (fxName) resetPaint(ctx);
      if (f.title) {
        // a worn achievement title over the name, styled by its tier
        const tier = f.ttier ?? 'common';
        const now = performance.now();
        const col = tier === 'mythic' ? `hsl(${(now / 8) % 360}, 95%, 68%)` : tier === 'mystery' ? (Math.sin(now / 90) > 0.92 ? '#ffffff' : '#c084fc') : TITLE_COL[tier] ?? TITLE_COL.common;
        const mark = tier === 'mystery' ? '◈ ' : tier === 'mythic' ? '✦ ' : tier === 'legendary' ? '★ ' : '';
        ctx.save();
        ctx.font = `${tier === 'common' ? 700 : 900} ${tier === 'common' || tier === 'rare' ? 9 : 10}px ${F_UI}`;
        ctx.textAlign = 'center';
        if (tier !== 'common' && this.quality >= 1) {
          ctx.shadowColor = col;
          ctx.shadowBlur = tier === 'rare' ? 4 : 9;
        }
        ctx.fillStyle = col;
        ctx.fillText(`${mark}${f.title.toUpperCase()}`, p.head.x, top - 19);
        ctx.restore();
      }
      if (f.neon) {
        // a season title: neon, glowing and flickering, above everything else
        const c = neonColor(f.neon);
        const y = top - (f.title ? 31 : 19);
        ctx.save();
        ctx.font = `900 10px ${F_UI}`;
        ctx.textAlign = 'center';
        ctx.shadowColor = c;
        ctx.shadowBlur = this.quality >= 1 ? 10 : 0;
        ctx.globalAlpha = Math.sin(performance.now() / 70) > 0.97 ? 0.55 : 1;
        ctx.fillStyle = c;
        const txt = `◆ ${neonText(f.neon).toUpperCase()} ◆`;
        ctx.fillText(txt, p.head.x, y);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.globalAlpha *= 0.55;
        ctx.fillText(txt, p.head.x, y);
        ctx.restore();
      }
    }
  }

  drawDarkness(eye, shx, shy, lights, now) {
    const d = this.dctx;
    const { dpr, map } = this;
    const s = this.scale;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, this.dark.width, this.dark.height);
    d.fillStyle = this.darkCol ?? C.dark;
    d.fillRect(0, 0, this.dark.width, this.dark.height);
    const toS = (x, y) => [((x - this.cam.x) * s + this.w / 2 + shx) * dpr, ((y - this.cam.y) * s + this.h / 2 + shy) * dpr];
    const [ex, ey] = toS(eye.x, eye.y - 10);
    const R = CFG.VISION * s * dpr;
    d.globalCompositeOperation = 'destination-out';
    const g = d.createRadialGradient(ex, ey, R * 0.3, ex, ey, R);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.72, 'rgba(0,0,0,0.9)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.beginPath();
    d.arc(ex, ey, R, 0, TAU);
    d.fill();
    // the map's own lights: lava, street lamps, neon (only the ones on screen)
    for (const l of this.glows ?? []) {
      const [lx, ly] = toS(l.x, l.y);
      const lr = l.r * s * dpr;
      if (lx < -lr || ly < -lr || lx > this.dark.width + lr || ly > this.dark.height + lr) continue;
      const lg = d.createRadialGradient(lx, ly, 0, lx, ly, lr);
      lg.addColorStop(0, `rgba(0,0,0,${l.a})`);
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = lg;
      d.beginPath();
      d.arc(lx, ly, lr, 0, TAU);
      d.fill();
    }
    for (const l of lights) {
      const k = 1 - (now - l.t0) / l.life;
      if (k <= 0) continue;
      const [lx, ly] = toS(l.x, l.y - GUN_Z);
      const lr = l.r * s * dpr;
      const lg = d.createRadialGradient(lx, ly, 0, lx, ly, lr);
      lg.addColorStop(0, `rgba(0,0,0,${0.9 * k})`);
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = lg;
      d.beginPath();
      d.arc(lx, ly, lr, 0, TAU);
      d.fill();
    }
    d.globalCompositeOperation = 'source-over';
    d.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.w / 2 - this.cam.x * s + shx), dpr * (this.h / 2 - this.cam.y * s + shy));
    d.fillStyle = this.darkCol ?? C.dark;
    d.beginPath();
    const V = CFG.VISION + 60;
    for (const w of map.walls) {
      if (w.x > eye.x + V || w.x + w.w < eye.x - V || w.y > eye.y + V || w.y + w.h < eye.y - V) continue;
      if (eye.x > w.x && eye.x < w.x + w.w && eye.y > w.y && eye.y < w.y + w.h) continue;
      shadowPoly(d, eye, w);
    }
    d.fill();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.dark, 0, 0);
  }

  drawStorm(z, t, vb) {
    const ctx = this.ctx;
    ctx.save();
    // haze only over the map itself
    ctx.beginPath();
    ctx.rect(0, 0, this.map.w, this.map.h);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(vb.x0 - 100, vb.y0 - 100, vb.x1 - vb.x0 + 200, vb.y1 - vb.y0 + 200);
    ctx.arc(z.x, z.y, z.r, 0, TAU, true);
    ctx.fillStyle = 'rgba(110, 18, 70, 0.3)';
    ctx.fill('evenodd');
    if (this.quality >= 1) {
      const pat = ctx.createPattern(textures().storm, 'repeat');
      const drift = this.reduced ? 0 : t / 40;
      pat.setTransform(new DOMMatrix().translateSelf(drift, drift * 0.6).scaleSelf(2.2, 2.2));
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = pat;
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // edge
    ctx.save();
    if (this.quality >= 2) {
      ctx.shadowColor = 'rgba(255, 60, 140, 0.9)';
      ctx.shadowBlur = 18;
    }
    const flicker = this.reduced ? 1 : 0.75 + Math.random() * 0.25;
    ctx.strokeStyle = `rgba(255, 70, 150, ${0.85 * flicker})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, TAU);
    ctx.stroke();
    ctx.restore();
    if (z.next && (z.next.r < z.r - 1 || z.next.x !== z.x)) {
      ctx.strokeStyle = 'rgba(235, 229, 214, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.arc(z.next.x, z.next.y, z.next.r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawExitArrows(eye, states) {
    const ctx = this.ctx;
    // keep arrows inside a frame that clears the HUD corners and the clock
    const top = 120;
    const bottom = this.h - 150;
    const left = 40;
    const right = this.w - 40;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    for (const e of this.noExits ? [] : this.map.extracts) {
      const st = states?.[e.id] ?? 'open';
      if (st === 'closed') continue;
      const p = this.toScreen(e.x, e.y);
      if (p.x > 34 && p.x < this.w - 34 && p.y > 34 && p.y < this.h - 34) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const k = Math.min((right - cx) / Math.abs(dx || 1e-6), (bottom - cy) / Math.abs(dy || 1e-6));
      const x = cx + dx * k;
      const y = cy + dy * k;
      const a = Math.atan2(dy, dx);
      const col = st === 'last' ? C.gold : st === 'closing' ? C.amber : C.exit;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, -8);
      ctx.lineTo(-6, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = col;
      ctx.font = `600 11px ${F_NUM}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(Math.hypot(e.x - eye.x, e.y - eye.y) / 10)}m`, x - Math.cos(a) * 20, y - Math.sin(a) * 20 + 4);
    }
  }

  drawSafeArrow(eye, z, t) {
    const ctx = this.ctx;
    const a = Math.atan2(z.next.y - eye.y, z.next.x - eye.x);
    const r = Math.min(this.w, this.h) * 0.22;
    const pulse = this.reduced ? 1 : 0.7 + Math.sin(t / 120) * 0.3;
    ctx.save();
    ctx.translate(this.w / 2 + Math.cos(a) * r, this.h / 2 + Math.sin(a) * r);
    ctx.rotate(a);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = C.blood;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-10, -14);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawVignette(hurt, storm, t) {
    const ctx = this.ctx;
    const base = Math.max(this.w, this.h);
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, base * 0.75);
    const stormK = storm ? 0.25 + (this.reduced ? 0 : Math.sin(t / 150) * 0.1) : 0;
    const red = Math.min(0.6, hurt * 0.45 + stormK);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, red > 0.01 ? `rgba(255, 40, 70, ${red})` : 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  buildMini() {
    const mini = this.mini;
    const cw = mini.clientWidth;
    if (!cw) return false;
    const px = Math.round(cw * this.dpr);
    mini.width = px;
    mini.height = px;
    const base = canvas(px, px);
    const b = base.getContext('2d');
    const k = px / this.map.w;
    const mc = THEME[this.map.theme]?.mini;
    b.fillStyle = 'rgba(14, 18, 27, 0.92)';
    b.fillRect(0, 0, px, px);
    if (mc) {
      b.globalAlpha = 0.45;
      b.fillStyle = mc[0];
      b.fillRect(0, 0, px, px);
      b.globalAlpha = 1;
      b.fillStyle = mc[2];
      for (const r of this.map.pits ?? []) b.fillRect(r.x * k, r.y * k, Math.max(1, r.w * k), Math.max(1, r.h * k));
    }
    b.fillStyle = '#2a2116';
    for (const v of this.map.vaults) b.fillRect(v.x * k, v.y * k, v.w * k, v.h * k);
    b.fillStyle = mc?.[1] ?? '#3a4358';
    for (const w of this.map.walls) b.fillRect(w.x * k, w.y * k, Math.max(1, w.w * k), Math.max(1, w.h * k));
    this.miniBase = base;
    this.miniK = k;
    return true;
  }

  drawMini(eye, t, alive, zone, states, radar = null) {
    const m = this.mctx;
    if (!m || !this.map || this.mini.offsetParent === null) return;
    if (!this.miniBase && !this.buildMini()) return;
    const k = this.miniK;
    const W = this.mini.width;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, W, W);
    m.drawImage(this.miniBase, 0, 0);
    if (zone) {
      m.save();
      m.beginPath();
      m.rect(0, 0, W, W);
      m.arc(zone.x * k, zone.y * k, zone.r * k, 0, TAU, true);
      m.fillStyle = 'rgba(160, 20, 90, 0.35)';
      m.fill('evenodd');
      m.restore();
      m.strokeStyle = 'rgba(255, 70, 150, 0.9)';
      m.lineWidth = 1.5 * this.dpr;
      m.beginPath();
      m.arc(zone.x * k, zone.y * k, zone.r * k, 0, TAU);
      m.stroke();
      m.strokeStyle = 'rgba(235,229,214,0.6)';
      m.setLineDash([3 * this.dpr, 3 * this.dpr]);
      m.beginPath();
      m.arc(zone.next.x * k, zone.next.y * k, zone.next.r * k, 0, TAU);
      m.stroke();
      m.setLineDash([]);
    }
    const pulse = this.reduced ? 0 : Math.sin(t / 300) * 1.5;
    for (const e of this.noExits ? [] : this.map.extracts) {
      const st = states?.[e.id] ?? 'open';
      m.fillStyle = st === 'last' ? C.gold : st === 'closed' ? 'rgba(255,77,94,0.5)' : st === 'closing' ? C.amber : C.exit;
      m.beginPath();
      m.arc(e.x * k, e.y * k, 4 * this.dpr + (st === 'closed' ? 0 : pulse), 0, TAU);
      m.fill();
    }
    // every runner still standing: enemies red and pulsing, teammates green
    if (radar) {
      const glow = this.reduced ? 1 : 0.75 + 0.25 * Math.sin(t / 180);
      for (const [x, y, ally] of radar) {
        m.fillStyle = ally === 1 ? 'rgba(61, 220, 151, 0.95)' : `rgba(255, 77, 94, ${glow})`;
        m.beginPath();
        m.arc(x * 10 * k, y * 10 * k, (ally === 2 ? 5 : ally ? 2.6 : 2.8) * this.dpr, 0, TAU);
        m.fill();
        if (ally !== 1) {
          m.strokeStyle = `rgba(255, 77, 94, ${0.35 * glow})`;
          m.lineWidth = 1.2 * this.dpr;
          m.beginPath();
          m.arc(x * 10 * k, y * 10 * k, 5 * this.dpr, 0, TAU);
          m.stroke();
        }
      }
    }
    m.fillStyle = alive ? C.loot : C.dust;
    m.beginPath();
    m.arc(eye.x * k, eye.y * k, 3.5 * this.dpr, 0, TAU);
    m.fill();
  }
}

// Shadow cast by a rectangle, from its two silhouette corners out to "far away".
function shadowPoly(d, E, w) {
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
