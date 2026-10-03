// Style in motion (shared/style.js lists the items): names painted on the canvas over a runner's
// head, the kill effects that burst where a victim falls, small stills for the shop and the reel,
// and the HTML for frames, banners and names in the menus (their animations live in style.css).
import { STYLE } from '../shared/style.js';
import { RARITIES } from '../shared/cosmetics.js';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TAU = Math.PI * 2;
const cache = new Map();

// ------------------------------------------------------------ the menus (HTML)

const vars = (it) => `--c1:${it.c[0]};--c2:${it.c[1]}`;

// a name painted in its effect
export function nameHtml(name, nf) {
  const it = STYLE[nf];
  if (!it || it.kind !== 'namefx') return esc(name);
  return `<span class="nfx nfx-${it.fx}" style="${vars(it)}" data-text="${esc(name)}">${esc(name)}</span>`;
}

// the class and style for a frame around a portrait / a banner behind a card
export function frameAttrs(fr) {
  const it = STYLE[fr];
  return it && it.kind === 'frame' ? { cls: `frm frm-${it.fx}`, style: vars(it) } : { cls: '', style: '' };
}
export function bannerHtml(bn) {
  const it = STYLE[bn];
  return it && it.kind === 'banner' ? `<div class="bnr bnr-${it.fx}" style="${vars(it)}" aria-hidden="true"></div>` : '';
}

// a still of any style item (the shop, the reel, the locker): a frame ring, a banner swatch,
// a burst for a kill effect, "Aa" for a name
export function styleStill(id, w = 120, h = 70) {
  const k = `${id}|${w}|${h}`;
  if (cache.has(k)) return cache.get(k);
  const it = STYLE[id];
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const x = c.getContext('2d');
  x.scale(2, 2);
  if (!it) return '';
  const [c1, c2] = it.c;
  const cx = w / 2;
  const cy = h / 2;
  if (it.kind === 'frame') {
    const r = Math.min(w, h) * 0.36;
    const g = x.createConicGradient ? x.createConicGradient(0, cx, cy) : null;
    if (g) {
      const stops = it.fx === 'prism' ? ['#ff3cc8', '#ffd166', '#3ddc97', '#3ce6ff', '#a86bff', '#ff3cc8'] : [c1, c2, c1, c2, c1];
      stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    }
    x.fillStyle = '#0d1018';
    x.beginPath();
    x.roundRect(cx - r, cy - r, r * 2, r * 2, 10);
    x.fill();
    x.lineWidth = 6;
    x.strokeStyle = g ?? c1;
    x.shadowColor = c1;
    x.shadowBlur = 12;
    x.beginPath();
    x.roundRect(cx - r, cy - r, r * 2, r * 2, 10);
    x.stroke();
    x.shadowBlur = 0;
    // a little stick figure in the middle
    x.strokeStyle = '#ebe5d6';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(cx, cy - r * 0.35, r * 0.18, 0, TAU);
    x.moveTo(cx, cy - r * 0.17);
    x.lineTo(cx, cy + r * 0.3);
    x.moveTo(cx - r * 0.3, cy);
    x.lineTo(cx + r * 0.3, cy);
    x.moveTo(cx, cy + r * 0.3);
    x.lineTo(cx - r * 0.22, cy + r * 0.65);
    x.moveTo(cx, cy + r * 0.3);
    x.lineTo(cx + r * 0.22, cy + r * 0.65);
    x.stroke();
  } else if (it.kind === 'banner') {
    const g = x.createLinearGradient(0, 0, w, h);
    if (it.fx === 'genesis') ['#ff3cc8', '#ffd166', '#3ddc97', '#3ce6ff', '#a86bff'].forEach((s, i, a) => g.addColorStop(i / (a.length - 1), s));
    else {
      g.addColorStop(0, c2);
      g.addColorStop(1, c1);
    }
    x.fillStyle = g;
    x.beginPath();
    x.roundRect(6, h * 0.18, w - 12, h * 0.64, 8);
    x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.25)';
    x.lineWidth = 1;
    for (let i = 14; i < w - 10; i += 12) {
      x.beginPath();
      x.moveTo(i, h * 0.2);
      x.lineTo(i - 8, h * 0.8);
      x.stroke();
    }
  } else if (it.kind === 'killfx') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const d = Math.min(w, h) * (0.18 + (i % 3) * 0.08);
      x.fillStyle = i % 2 ? c1 : c2;
      x.beginPath();
      x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.5 + (i % 3), 0, TAU);
      x.fill();
    }
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.3);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, c1);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, Math.min(w, h) * 0.3, 0, TAU);
    x.fill();
    if (it.fx === 'rugged') {
      x.font = `900 ${Math.round(h * 0.24)}px Impact, sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = '#ff3d3d';
      x.fillText('RUGGED', cx, cy);
    }
  } else {
    x.font = `900 ${Math.round(h * 0.5)}px "Chakra Petch", system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const g = x.createLinearGradient(cx - 30, 0, cx + 30, 0);
    if (it.fx === 'rainbow' || it.fx === 'prism') ['#ff4d6d', '#ffd166', '#3ddc97', '#45c4ff', '#a86bff'].forEach((s, i, a) => g.addColorStop(i / (a.length - 1), s));
    else {
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
    }
    x.shadowColor = c2;
    x.shadowBlur = 10;
    x.fillStyle = g;
    x.fillText('Aa', cx, cy + 2);
  }
  // the rarity line under it
  x.shadowBlur = 0;
  x.fillStyle = RARITIES[it.rarity]?.color ?? '#fff';
  x.fillRect(w * 0.3, h - 3, w * 0.4, 2);
  const url = c.toDataURL();
  cache.set(k, url);
  return url;
}

// ------------------------------------------------------------ the raid (canvas)

// paint a name in its effect: sets fillStyle / shadow on ctx for text centred at x (width w)
export function paintName(ctx, nf, x, w, y, t) {
  const it = STYLE[nf];
  if (!it) return false;
  const [c1, c2] = it.c;
  const x0 = x - w / 2;
  ctx.shadowBlur = 0;
  switch (it.fx) {
    case 'mint':
    case 'sky':
      ctx.fillStyle = c1;
      break;
    case 'gold':
    case 'ice':
    case 'galaxy': {
      // a band of light sweeping across
      const s = ((t / 1400) % 1.6) - 0.3;
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      g.addColorStop(0, c2);
      g.addColorStop(Math.max(0, Math.min(1, s)), it.fx === 'galaxy' ? '#ffffff' : '#fffbe6');
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.shadowColor = c1;
      ctx.shadowBlur = 6;
      break;
    }
    case 'fire': {
      const g = ctx.createLinearGradient(0, y - 10, 0, y + 2);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.shadowColor = '#ff6a00';
      ctx.shadowBlur = 6 + Math.sin(t / 60) * 3 + Math.sin(t / 23) * 2;
      break;
    }
    case 'toxic':
      ctx.fillStyle = c1;
      ctx.shadowColor = c2;
      ctx.shadowBlur = 5 + Math.sin(t / 300) * 4;
      break;
    case 'neon': {
      const on = Math.sin(t / 90) > -0.85 || Math.sin(t / 37) > 0.3;
      ctx.fillStyle = on ? c1 : '#7a2a62';
      ctx.shadowColor = on ? c2 : 'transparent';
      ctx.shadowBlur = on ? 10 : 0;
      break;
    }
    case 'rainbow':
    case 'prism': {
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      const off = (t / 1200) % 1;
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60 + off * 360) % 360} 95% ${it.fx === 'prism' ? 80 : 65}%)`);
      ctx.fillStyle = g;
      if (it.fx === 'prism') {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
      }
      break;
    }
    case 'glitch':
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = Math.sin(t / 47) > 0 ? c1 : c2;
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = Math.sin(t / 31) > 0.6 ? 2 : -1;
      break;
    default:
      ctx.fillStyle = c1;
  }
  return true;
}

export function resetPaint(ctx) {
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowColor = 'transparent';
}

// The kill effects: short-lived bursts in world space, drawn over the ground under the darkness
export class KillFx {
  constructor() {
    this.list = [];
  }

  spawn(kf, x, y, t) {
    const it = STYLE[kf];
    if (!it || it.kind !== 'killfx') return;
    const n = { sparks: 18, smoke: 12, confetti: 40, coins: 22, pixel: 36, ghost: 1, lightning: 1, frost: 22, blackhole: 30, firework: 48, rugged: 26 }[it.fx] ?? 20;
    const ps = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = 40 + Math.random() * 160;
      ps.push({ a, s, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: Math.random(), c: i % 2 ? it.c[0] : it.c[1], rot: Math.random() * TAU });
    }
    this.list.push({ fx: it.fx, c: it.c, x, y, t0: t, life: { ghost: 1600, lightning: 700, blackhole: 1300, firework: 1500, rugged: 1600, smoke: 1400 }[it.fx] ?? 1000, ps });
    if (this.list.length > 24) this.list.shift();
  }

  draw(ctx, t, reduced) {
    this.list = this.list.filter((e) => t - e.t0 < e.life);
    for (const e of this.list) {
      const k = (t - e.t0) / e.life; // 0 → 1
      const s = (t - e.t0) / 1000;
      const fade = 1 - k;
      ctx.save();
      ctx.translate(e.x, e.y);
      switch (e.fx) {
        case 'lightning': {
          // a bolt from the sky and a flash on the ground
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = e.c[0];
          ctx.lineWidth = 4 * fade + 1;
          ctx.shadowColor = e.c[1];
          ctx.shadowBlur = 18;
          ctx.beginPath();
          let px = 0;
          ctx.moveTo(px, -260);
          for (let yy = -220; yy <= 0; yy += 40) {
            px = (Math.sin(e.t0 + yy) * 22) | 0;
            ctx.lineTo(px, yy);
          }
          ctx.stroke();
          ctx.fillStyle = `rgba(224,242,254,${0.5 * fade})`;
          ctx.beginPath();
          ctx.arc(0, 0, 40 + 60 * k, 0, TAU);
          ctx.fill();
          break;
        }
        case 'ghost': {
          // the soul floats up, wobbling, and fades
          ctx.globalAlpha = fade * 0.85;
          const gy = -s * 60;
          const gx = Math.sin(s * 6) * 6;
          ctx.fillStyle = e.c[0];
          ctx.beginPath();
          ctx.arc(gx, gy - 10, 12, Math.PI, 0);
          ctx.lineTo(gx + 12, gy + 8);
          for (let i = 0; i < 4; i++) ctx.lineTo(gx + 12 - (i + 0.5) * 6, gy + (i % 2 ? 8 : 3));
          ctx.lineTo(gx - 12, gy + 8);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#1b1020';
          ctx.fillRect(gx - 6, gy - 12, 3, 4);
          ctx.fillRect(gx + 3, gy - 12, 3, 4);
          break;
        }
        case 'blackhole': {
          // everything spirals in, then a pop
          const r = 70 * (1 - k);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(4, r));
          g.addColorStop(0, '#000');
          g.addColorStop(0.6, 'rgba(60,0,90,0.8)');
          g.addColorStop(1, 'rgba(168,85,247,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(4, r), 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          for (const p of e.ps) {
            const d = (1 - k) * (30 + p.r * 70);
            const a = p.a + s * (4 + p.r * 4);
            ctx.fillStyle = p.c;
            ctx.globalAlpha = fade;
            ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, 3, 3);
          }
          break;
        }
        case 'rugged': {
          // a rug yanked away and the word in red
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#7a2e2e';
          ctx.save();
          ctx.translate(s * 160, -s * 20);
          ctx.rotate(s * 2);
          ctx.fillRect(-26, -14, 52, 28);
          ctx.strokeStyle = '#ffd166';
          ctx.lineWidth = 2;
          ctx.strokeRect(-22, -10, 44, 20);
          ctx.restore();
          ctx.font = `900 ${22 + 10 * Math.min(1, k * 4)}px Impact, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ff3d3d';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 4;
          ctx.strokeText('RUGGED', 0, -40 - s * 20);
          ctx.fillText('RUGGED', 0, -40 - s * 20);
          for (const p of e.ps) {
            ctx.fillStyle = p.c;
            ctx.fillRect(p.vx * s * 0.6, p.vy * s * 0.6 + 60 * s * s, 3, 3);
          }
          break;
        }
        default: {
          // particles flying out (confetti flutters, coins fall, frost shards spin, smoke rises)
          const grav = { coins: 260, confetti: 60, frost: 120, sparks: 180, pixel: 0, smoke: -40, firework: 50 }[e.fx] ?? 100;
          const drag = e.fx === 'smoke' ? 0.35 : e.fx === 'firework' ? 1 : 0.7;
          if (e.fx === 'firework' && k < 0.25) {
            // the rocket goes up first
            ctx.fillStyle = e.c[1];
            ctx.fillRect(-2, -k * 4 * 120, 4, 10);
            break;
          }
          const ss = e.fx === 'firework' ? s - e.life * 0.25 / 1000 : s;
          const oy = e.fx === 'firework' ? -120 : 0;
          if (e.fx === 'sparks' || e.fx === 'firework' || e.fx === 'frost') ctx.globalCompositeOperation = 'lighter';
          for (const p of e.ps) {
            const px = p.vx * ss * drag;
            const py = oy + p.vy * ss * drag + grav * ss * ss * 0.5;
            ctx.globalAlpha = fade;
            ctx.fillStyle = p.c;
            if (e.fx === 'confetti') {
              ctx.save();
              ctx.translate(px, py);
              ctx.rotate(p.rot + ss * 8);
              ctx.fillRect(-3, -1.5, 6, 3);
              ctx.restore();
            } else if (e.fx === 'coins') {
              ctx.beginPath();
              ctx.ellipse(px, py, 4 * Math.abs(Math.cos(ss * 10 + p.rot)) + 0.5, 4, 0, 0, TAU);
              ctx.fill();
            } else if (e.fx === 'pixel') {
              const q = 4 + p.r * 4;
              ctx.fillRect(Math.round(px / 4) * 4, Math.round(py / 4) * 4 - ss * 30, q, q);
            } else if (e.fx === 'smoke') {
              ctx.globalAlpha = fade * 0.4;
              ctx.beginPath();
              ctx.arc(px * 0.5, py - ss * 30, 6 + ss * 18 * p.r, 0, TAU);
              ctx.fill();
            } else if (e.fx === 'frost') {
              ctx.save();
              ctx.translate(px, py);
              ctx.rotate(p.rot + ss * 5);
              ctx.beginPath();
              ctx.moveTo(0, -6);
              ctx.lineTo(2, 0);
              ctx.lineTo(0, 6);
              ctx.lineTo(-2, 0);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            } else {
              ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
            }
          }
          if (!reduced && (e.fx === 'firework' || e.fx === 'sparks')) {
            ctx.globalAlpha = fade * 0.5;
            ctx.fillStyle = e.c[0];
            ctx.beginPath();
            ctx.arc(0, oy, 20 * fade, 0, TAU);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
  }
}
