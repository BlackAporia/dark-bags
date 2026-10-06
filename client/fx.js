// Particles, ground decals, detached body parts and the grave death animation.
// Positions are on the ground plane (x, y); z is height above it, drawn as y - z.
import { mulberry32 } from '../shared/geom.js';
import { pose, drawFigure, FEET } from './stickman.js';

const G = 900; // gravity for things in the air
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (v) => 1 - (1 - v) ** 3;
const easeIn = (v) => v * v * v;
const rand = (a, b) => a + Math.random() * (b - a);

export class Fx {
  constructor() {
    this.parts = [];
    this.decals = [];
    this.graves = [];
    this.lights = [];
    this.floaters = [];
    this.max = 400;
  }

  setQuality(q) {
    this.max = [120, 240, 400][q] ?? 400;
  }

  clear() {
    this.parts.length = 0;
    this.decals.length = 0;
    this.graves.length = 0;
    this.lights.length = 0;
    this.floaters.length = 0;
  }

  add(p) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({ age: 0, rest: false, rot: 0, spin: 0, z: 0, vx: 0, vy: 0, vz: 0, ...p });
  }

  decal(d, now) {
    if (this.decals.length > 220) this.decals.shift();
    this.decals.push({ t0: now, life: 25000, ...d });
  }

  // ---------------------------------------------------------------- spawners

  blood(x, y, z, dx, dy, n = 12) {
    for (let i = 0; i < n; i++) {
      const sp = rand(60, 260);
      const a = Math.atan2(dy, dx) + rand(-0.9, 0.9);
      this.add({ kind: 'blood', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rand(40, 240), life: 2, size: rand(1.4, 3.2) });
    }
  }

  sparks(x, y, z, n = 8, color = '#ffd27a') {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(120, 380);
      this.add({ kind: 'spark', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rand(40, 200), life: rand(0.15, 0.35), color });
    }
  }

  chips(x, y, z, n = 5) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      this.add({ kind: 'chip', x, y, z, vx: Math.cos(a) * rand(40, 160), vy: Math.sin(a) * rand(30, 100), vz: rand(80, 220), life: 3, size: rand(1.5, 3), spin: rand(-12, 12) });
    }
  }

  dust(x, y, n = 4, color = 'rgba(160,150,130,0.35)') {
    for (let i = 0; i < n; i++) {
      this.add({ kind: 'dust', x: x + rand(-8, 8), y: y + rand(-3, 3), z: rand(0, 6), vx: rand(-30, 30), vy: rand(-10, 10), vz: rand(10, 30), life: rand(0.4, 0.8), size: rand(4, 9), color, float: true });
    }
  }

  dirt(x, y, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(40, 170);
      this.add({ kind: 'dirt', x, y, z: 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: rand(120, 320), life: 2.5, size: rand(1.5, 3.5) });
    }
  }

  casing(x, y, z, f) {
    this.add({ kind: 'casing', x, y, z, vx: -f * rand(40, 110), vy: rand(-20, 20), vz: rand(90, 170), life: 5, spin: rand(-20, 20) });
  }

  // color: a weapon skin tints its flash and swing (null = the plain warm flash)
  muzzle(x, y, z, aim, big, now, color = null) {
    this.add({ kind: 'flash', x, y, z, aim, life: 0.06, size: big ? 16 : 10, float: true, color });
    this.lights.push({ x, y, r: big ? 150 : 100, t0: now, life: 70 });
  }

  // a swing: an arc around the runner exactly as wide and as far as the blade hits (r, arc)
  slash(x, y, z, aim, f, color = null, big = false, r = 26, arc = 2) {
    this.add({ kind: 'slash', x, y, z, aim, f, life: big ? 0.28 : 0.22, float: true, color, big, r, arc });
  }

  // a tripmine going off: a fireball, a shock ring, a flash that lights the dark
  boom(x, y) {
    this.add({ kind: 'boom', x, y, z: 10, life: 0.55, float: true });
    this.add({ kind: 'ring', x, y, z: 4, life: 0.6, color: '#ff4d5e', float: true, big: true });
    this.lights.push({ x, y, r: 320, t0: performance.now(), life: 260 });
    for (let i = 0; i < 16; i++) this.add({ kind: 'spark', x, y, z: 12, vx: rand(-420, 420), vy: rand(-420, 420), vz: rand(80, 360), life: rand(0.3, 0.7), color: i % 2 ? '#ffb347' : '#ff4d5e' });
  }

  ring(x, y, color) {
    this.add({ kind: 'ring', x, y, z: 4, life: 0.5, color, float: true });
  }

  // pop: a damage number, that punches in big and settles (and drifts sideways a touch)
  floater(x, y, text, color, size, life = 1, pop = false) {
    this.floaters.push({ x, y, text, color, size, age: 0, life, pop, drift: pop ? (Math.random() - 0.5) * 30 : 0 });
  }

  // a detached leg: pts are relative to piece origin, in upright figure space
  limb(piece, color, dx) {
    this.add({ kind: 'limb', x: piece.x, y: piece.y, z: piece.z, pts: piece.pts, color, vx: dx * rand(60, 150), vy: rand(-40, 40), vz: rand(160, 300), spin: rand(-14, 14), life: 1e9, bounces: 0 });
  }

  // a head coming off: by default a random pop; a headshot sends it flying away from the
  // shooter (dx, dy), hard; clean: no blood where it lands (gore off)
  head(x, y, z, color, f, { dx = 0, dy = 0, clean = false } = {}) {
    const hard = dx || dy;
    this.add({ kind: 'head', x, y, z, color, f, clean, vx: hard ? dx * rand(260, 360) + rand(-30, 30) : rand(-80, 80), vy: hard ? dy * rand(260, 360) + rand(-30, 30) : rand(-50, 50), vz: hard ? rand(380, 480) : rand(260, 380), spin: rand(-22, 22), life: 1e9, bounces: 0 });
  }

  grave(anim, opts, now) {
    this.graves.push({ a: { ...anim, moveK: 0 }, t0: now, ...opts, seed: Math.floor(Math.random() * 1e9), dirt1: false, dirt2: false, done: false });
  }

  // ------------------------------------------------------------------ update

  update(dt, now) {
    for (const p of this.parts) {
      p.age += dt;
      if (p.rest) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.float) {
        p.z += p.vz * dt;
        continue;
      }
      p.vz -= G * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (p.z <= 0) {
        p.z = 0;
        if ((p.kind === 'limb' || p.kind === 'head' || p.kind === 'casing' || p.kind === 'chip') && p.vz < -120 && (p.bounces ?? 0) < 2) {
          p.vz = -p.vz * 0.35;
          p.vx *= 0.5;
          p.vy *= 0.5;
          p.spin *= 0.5;
          p.bounces = (p.bounces ?? 0) + 1;
          if (p.kind === 'limb' || (p.kind === 'head' && !p.clean)) this.splat(p.x, p.y, 6, now);
          continue;
        }
        p.rest = true;
        p.vx = p.vy = p.vz = 0;
        if (p.kind === 'blood') {
          this.splat(p.x, p.y, p.size * 1.6, now);
          p.age = p.life;
        } else if (p.kind === 'dirt') {
          this.decal({ kind: 'dirt', x: p.x, y: p.y, r: p.size, life: 9000 }, now);
          p.age = p.life;
        } else if (p.kind === 'limb' || p.kind === 'head') {
          this.decal({ kind: p.kind, x: p.x, y: p.y, rot: p.rot, pts: p.pts, color: p.color, f: p.f }, now);
          p.age = p.life = 0; // removed below
          p.dead = true;
        } else if (p.kind === 'casing') p.life = p.age + 4;
      }
    }
    this.parts = this.parts.filter((p) => !p.dead && p.age < p.life);
    this.decals = this.decals.filter((d) => now - d.t0 < d.life);
    this.lights = this.lights.filter((l) => now - l.t0 < l.life);
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < f.life);

    for (const g of this.graves) {
      const e = (now - g.t0) / 1000;
      if (!g.dirt1 && e > 0.2) {
        g.dirt1 = true;
        this.dirt(g.a.x, g.a.y + FEET, 16);
      }
      if (!g.dirt2 && e > 1.6) {
        g.dirt2 = true;
        this.dirt(g.a.x, g.a.y + FEET, 10);
        this.dust(g.a.x, g.a.y + FEET, 6, 'rgba(90,70,45,0.45)');
        this.decal({ kind: 'mound', x: g.a.x, y: g.a.y + FEET, seed: g.seed }, now);
      }
      if (e > 2.1) g.done = true;
    }
    this.graves = this.graves.filter((g) => !g.done);
  }

  splat(x, y, r, now) {
    this.decal({ kind: 'splat', x, y, r, seed: Math.floor(Math.random() * 1e6), life: 30000 }, now);
  }

  // -------------------------------------------------------------------- draw

  drawGround(ctx, now, inView) {
    for (const d of this.decals) {
      if (!inView(d.x, d.y, 40)) continue;
      const age = now - d.t0;
      const fade = clamp01((d.life - age) / 2500);
      ctx.globalAlpha = fade;
      switch (d.kind) {
        case 'splat': {
          const r = mulberry32(d.seed);
          ctx.fillStyle = 'rgba(120, 8, 16, 0.85)';
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, d.r, d.r * 0.55, 0, 0, TAU);
          for (let i = 0; i < 4; i++) {
            const a = r() * TAU;
            const dd = d.r * (0.6 + r() * 0.9);
            ctx.moveTo(d.x + Math.cos(a) * dd, d.y + Math.sin(a) * dd * 0.55);
            ctx.arc(d.x + Math.cos(a) * dd, d.y + Math.sin(a) * dd * 0.55, d.r * (0.2 + r() * 0.3), 0, TAU);
          }
          ctx.fill();
          break;
        }
        case 'dirt':
          ctx.fillStyle = 'rgba(74, 53, 32, 0.9)';
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, 0, 0, TAU);
          ctx.fill();
          break;
        case 'limb':
          drawLimb(ctx, d.x, d.y, 0, d.rot, d.pts, d.color, true);
          break;
        case 'head':
          drawHead(ctx, d.x, d.y, 0, d.rot, d.color, d.f);
          break;
        case 'mound':
          drawMound(ctx, d);
          break;
        default:
      }
    }
    ctx.globalAlpha = 1;
    drawCasings(ctx, this.parts.filter((p) => p.rest && p.kind === 'casing'), false);
  }

  // The small stuff (blood drops, sparks, chips, dirt, dust, casings) is drawn in batches: one
  // path per colour and fade step instead of one per particle. A fight has hundreds of them, and
  // every separate path is a separate draw on a GPU canvas.
  drawAir(ctx, now) {
    const blood = [];
    const dirt = [];
    const chips = [];
    const casings = [];
    const sparks = new Map(); // colour|alpha -> particles
    const dust = new Map();
    const step = (a) => Math.max(0, Math.ceil(a * 4) / 4); // four fade steps
    for (const p of this.parts) {
      if (p.rest && p.kind === 'casing') continue;
      const a = 1 - p.age / p.life;
      const sy = p.y - p.z;
      if (p.kind === 'blood') blood.push(p.x, sy, p.size);
      else if (p.kind === 'dirt') dirt.push(p.x, sy, p.size);
      else if (p.kind === 'chip') chips.push(p.x, sy, p.size, p.rot);
      else if (p.kind === 'casing') casings.push({ x: p.x, y: sy, rot: p.rot });
      else if (p.kind === 'spark') {
        const k = `${p.color}|${step(a)}`;
        if (!sparks.has(k)) sparks.set(k, []);
        sparks.get(k).push(p.x, sy, p.x - p.vx * 0.03, sy - (p.vy * 0.03 - p.vz * 0.03));
      } else if (p.kind === 'dust') {
        const k = `${p.color}|${step(a * 0.8)}`;
        if (!dust.has(k)) dust.set(k, []);
        dust.get(k).push(p.x, sy, p.size * (1 + p.age * 2));
      }
    }
    const discs = (list, color) => {
      if (!list.length) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 3) {
        ctx.moveTo(list[i] + list[i + 2], list[i + 1]);
        ctx.arc(list[i], list[i + 1], list[i + 2], 0, TAU);
      }
      ctx.fill();
    };
    discs(blood, '#b3121f');
    discs(dirt, '#4a3520');
    for (const [k, list] of dust) {
      ctx.globalAlpha = Number(k.split('|')[1]);
      discs(list, k.split('|')[0]);
    }
    ctx.globalAlpha = 1;
    if (chips.length) {
      ctx.fillStyle = '#9aa3b5';
      ctx.beginPath();
      for (let i = 0; i < chips.length; i += 4) {
        const [x, y, s, r] = [chips[i], chips[i + 1], chips[i + 2] / 2, chips[i + 3]];
        const c = Math.cos(r) * s;
        const n = Math.sin(r) * s;
        ctx.moveTo(x - c + n, y - n - c);
        ctx.lineTo(x + c + n, y + n - c);
        ctx.lineTo(x + c - n, y + n + c);
        ctx.lineTo(x - c - n, y - n + c);
        ctx.closePath();
      }
      ctx.fill();
    }
    if (sparks.size) {
      ctx.lineWidth = 1.6;
      for (const [k, list] of sparks) {
        const [color, al] = k.split('|');
        ctx.strokeStyle = color;
        ctx.globalAlpha = Number(al);
        ctx.beginPath();
        for (let i = 0; i < list.length; i += 4) {
          ctx.moveTo(list[i], list[i + 1]);
          ctx.lineTo(list[i + 2], list[i + 3]);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    drawCasings(ctx, casings, true);
    for (const p of this.parts) {
      if (p.rest && p.kind === 'casing') continue;
      if (p.kind === 'blood' || p.kind === 'dirt' || p.kind === 'chip' || p.kind === 'casing' || p.kind === 'spark' || p.kind === 'dust') continue;
      const a = 1 - p.age / p.life;
      const sy = p.y - p.z;
      switch (p.kind) {
        case 'boom': {
          const k = p.age / p.life;
          const r = 24 + k * 90;
          const g = ctx.createRadialGradient(p.x, sy, 0, p.x, sy, r);
          g.addColorStop(0, `rgba(255,245,210,${0.95 * (1 - k)})`);
          g.addColorStop(0.35, `rgba(255,150,60,${0.8 * (1 - k)})`);
          g.addColorStop(1, 'rgba(255,60,70,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, sy, r, 0, TAU);
          ctx.fill();
          break;
        }
        case 'flash': {
          ctx.save();
          ctx.translate(p.x, sy);
          ctx.rotate(p.aim);
          ctx.globalAlpha = Math.max(0, a);
          ctx.fillStyle = p.color ?? '#fff3c4';
          ctx.beginPath();
          const s = p.size;
          ctx.moveTo(0, -s * 0.3);
          ctx.lineTo(s * 1.6, 0);
          ctx.lineTo(0, s * 0.3);
          ctx.lineTo(s * 0.4, s * 0.9);
          ctx.lineTo(-s * 0.2, 0);
          ctx.lineTo(s * 0.4, -s * 0.9);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'slash': {
          const k = p.age / p.life;
          const r = p.r;
          // the sweep runs across the arc the blade covers, from one side to the other
          const start = p.aim - p.arc / 2;
          const end = start + p.arc * Math.min(1, k * 3);
          if (p.color) {
            // a skinned blade leaves a neon arc: glow, colour, white edge
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (const [w, al, c] of [[12, 0.2, p.color], [5, 0.55, p.color], [1.6, 0.95, '#ffffff']]) {
              ctx.globalAlpha = al * (1 - k);
              ctx.strokeStyle = c;
              ctx.lineWidth = w;
              ctx.beginPath();
              ctx.arc(p.x, sy, r, start, end);
              ctx.stroke();
            }
            ctx.restore();
            break;
          }
          ctx.globalAlpha = 1; // (the particle before may have left it faded)
          // the reach of the swing, faint, and the blade's trail sweeping across it
          ctx.fillStyle = `rgba(235, 240, 255, ${0.08 * (1 - k)})`;
          ctx.beginPath();
          ctx.moveTo(p.x, sy);
          ctx.arc(p.x, sy, r, start, start + p.arc);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = `rgba(235, 240, 255, ${0.95 * (1 - k)})`;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(p.x, sy, r, Math.max(start, end - 0.9), end);
          ctx.stroke();
          ctx.strokeStyle = `rgba(235, 240, 255, ${0.35 * (1 - k)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, sy, r * 0.82, start, end);
          ctx.stroke();
          break;
        }
        case 'ring':
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = Math.max(0, a);
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(p.x, sy, 8 + p.age * (p.big ? 260 : 90), (8 + p.age * (p.big ? 260 : 90)) * 0.5, 0, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'limb':
          drawLimb(ctx, p.x, p.y, p.z, p.rot, p.pts, p.color, false);
          break;
        case 'head':
          drawHead(ctx, p.x, p.y, p.z, p.rot, p.color, p.f);
          break;
        default:
      }
    }
  }

  drawFloaters(ctx) {
    for (const f of this.floaters) {
      const k = f.age / f.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = f.color;
      const size = f.pop ? f.size * (k < 0.18 ? 1.6 - (k / 0.18) * 0.6 : 1) : f.size;
      ctx.font = `${f.pop ? 800 : 600} ${size}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(4,6,10,0.8)';
      ctx.lineWidth = f.pop ? 4 : 3;
      const x = f.x + f.drift * k;
      ctx.strokeText(f.text, x, f.y - 46 - k * 40);
      ctx.fillText(f.text, x, f.y - 46 - k * 40);
    }
    ctx.globalAlpha = 1;
  }

  // Graves take part in the y-sort with the runners; this returns draw items.
  graveItems(now, gore) {
    return this.graves.map((g) => ({ y: g.a.y + FEET, draw: (ctx) => drawGrave(ctx, g, now, gore) }));
  }
}

// shell casings: short brass strokes, all of them in one path
function drawCasings(ctx, list) {
  if (!list.length) return;
  ctx.strokeStyle = '#d4a93c';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (const p of list) {
    const c = Math.cos(p.rot) * 2;
    const s = Math.sin(p.rot) * 2;
    ctx.moveTo(p.x - c, p.y - s);
    ctx.lineTo(p.x + c, p.y + s);
  }
  ctx.stroke();
}

function drawLimb(ctx, x, y, z, rot, pts, color, onGround) {
  ctx.save();
  ctx.translate(x, y - z);
  ctx.rotate(rot);
  if (onGround) ctx.scale(1, 0.9);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [style, w] of [['rgba(4,6,10,0.75)', 5.2], [color, 2.6]]) {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.fillStyle = '#b3121f';
  ctx.beginPath();
  ctx.arc(pts[0][0], pts[0][1], 2.8, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawHead(ctx, x, y, z, rot, color, f) {
  ctx.save();
  ctx.translate(x, y - z - 6);
  ctx.rotate(rot);
  for (const [style, w] of [['rgba(4,6,10,0.75)', 5.2], [color, 2.6]]) {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(235,229,214,0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo((f || 1) * 1.5, -1);
  ctx.lineTo((f || 1) * 5.5, -1);
  ctx.stroke();
  ctx.fillStyle = '#b3121f';
  ctx.beginPath();
  ctx.arc(0, 6.5, 2.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawMound(ctx, d) {
  const r = mulberry32(d.seed);
  ctx.fillStyle = '#3b2a18';
  ctx.beginPath();
  ctx.ellipse(d.x, d.y, 22, 8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#5a4128';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(d.x + (r() - 0.5) * 30, d.y + (r() - 0.5) * 8, 2 + r() * 2, 0, TAU);
    ctx.fill();
  }
  // headstone: a small upright slab, line-drawn
  const sx = d.x - 4;
  const sy = d.y - 4;
  ctx.fillStyle = '#2a2f3a';
  ctx.strokeStyle = 'rgba(4,6,10,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx - 6, sy);
  ctx.lineTo(sx - 6, sy - 12);
  ctx.arc(sx, sy - 12, 6, Math.PI, 0);
  ctx.lineTo(sx + 6, sy);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.strokeStyle = '#8d93a6';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 14);
  ctx.lineTo(sx, sy - 5);
  ctx.moveTo(sx - 3, sy - 11);
  ctx.lineTo(sx + 3, sy - 11);
  ctx.stroke();
}

// The ground cracks, a pit opens, bony hands reach up and drag the body down.
function drawGrave(ctx, g, now, gore) {
  const e = (now - g.t0) / 1000;
  const a = g.a;
  const gx = a.x;
  const gy = a.y + FEET;
  const rnd = mulberry32(g.seed);

  // cracks
  const crackK = clamp01(e / 0.35) * (1 - clamp01((e - 1.7) / 0.4));
  if (crackK > 0) {
    ctx.strokeStyle = `rgba(3, 3, 5, ${0.9 * crackK})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      let ang = (i / 7) * TAU + rnd() * 0.5;
      let x = gx;
      let y = gy;
      ctx.moveTo(x, y);
      const len = (14 + rnd() * 22) * crackK;
      for (let s = 0; s < 4; s++) {
        ang += (rnd() - 0.5) * 0.8;
        x += Math.cos(ang) * (len / 4);
        y += Math.sin(ang) * (len / 4) * 0.45;
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  // the pit
  const open = easeOut(clamp01((e - 0.15) / 0.35)) * (1 - easeOut(clamp01((e - 1.5) / 0.35)));
  const rx = 28 * open;
  const ry = 10 * open;
  if (open > 0.01) {
    const grd = ctx.createRadialGradient(gx, gy, 1, gx, gy, rx);
    grd.addColorStop(0, '#000');
    grd.addColorStop(0.75, '#0b0705');
    grd.addColorStop(1, '#2b1c0e');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(gx, gy, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4a3520';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // the body: staggers, then sinks below the ground line
  if (e < 1.55) {
    const sink = easeIn(clamp01((e - 0.45) / 1.0)) * 70;
    const struggle = e > 0.45 ? Math.sin(e * 38) * 1.6 : 0;
    const fig = { ...a, x: a.x + struggle, y: a.y + sink, hurtT: g.t0, phase: a.phase + e * 3 };
    const p = pose(fig, now, gore);
    ctx.save();
    if (e > 0.4) {
      ctx.beginPath();
      ctx.rect(gx - 200, gy - 300, 400, 300 + ry * 0.2);
      ctx.clip();
    }
    ctx.globalAlpha = 1 - clamp01((e - 1.2) / 0.35);
    drawFigure(ctx, fig, p, { gore, color: g.color, flash: e < 0.08, headless: g.headless });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // hands
  const up = easeOut(clamp01((e - 0.3) / 0.3)) * (1 - easeIn(clamp01((e - 1.25) / 0.35)));
  if (up > 0.01) {
    const grab = clamp01((e - 0.55) / 0.5);
    for (let i = 0; i < 3; i++) {
      const side = i - 1;
      const bx = gx + side * rx * 0.6;
      const by = gy + ry * 0.2;
      const reach = 18 * up;
      const tx = bx + side * 4 * (1 - grab) - side * 6 * grab;
      const ty = by - reach + grab * 10 + Math.sin(now / 90 + i) * 1.2;
      drawHand(ctx, bx, by, tx, ty, side, open);
    }
  }
}

function drawHand(ctx, bx, by, tx, ty, side, open) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const [style, w] of [['rgba(4,6,10,0.8)', 4.4], ['#d8d0b8', 2]]) {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    for (let k = -1.5; k <= 1.5; k += 1) {
      const fa = -Math.PI / 2 + k * 0.35 + side * 0.2;
      const fx = tx + Math.cos(fa) * 6;
      const fy = ty + Math.sin(fa) * 6;
      ctx.moveTo(tx, ty);
      ctx.lineTo(fx, fy);
      ctx.lineTo(fx + Math.cos(fa + 0.9) * 3 * open, fy + Math.sin(fa + 0.9) * 3 * open);
    }
    ctx.stroke();
  }
  ctx.restore();
}
