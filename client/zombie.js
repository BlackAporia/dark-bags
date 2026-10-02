// Drawing the side modes' things: the dead (walkers, runners, brutes and the boss),
// bags of gold and the medkits zombies drop. The dead are stick figures like the
// runners, but hunched and lurching, arms out in front, eyes lit; each kind reads at a
// glance by its size, its stoop and its colour.
import { FEET } from './stickman.js';

const OUTLINE = 'rgba(4, 6, 10, 0.92)';
const TAU = Math.PI * 2;
// size, stoop (lean forward), skin, rags, eyes, line weight
const KIND = {
  walker: { s: 1, lean: 0.42, skin: '#86b35e', rag: '#5b4d3c', eye: '#ffef7a', w: 1 },
  runner: { s: 0.92, lean: 0.72, skin: '#a7d36f', rag: '#3d4a63', eye: '#ff6b3d', w: 0.9 },
  brute: { s: 1.45, lean: 0.3, skin: '#5e8846', rag: '#4a2f2a', eye: '#ffb02e', w: 1.5 },
  boss: { s: 2.15, lean: 0.24, skin: '#5a476e', rag: '#2a1c2e', eye: '#ff2d55', w: 1.8 },
};

export function drawZombie(ctx, z, t, gore) {
  const a = z.a;
  const k = KIND[z.type] ?? KIND.walker;
  const f = a.facing || 1;
  const gx = a.x;
  const gy = a.y + FEET;
  const S = k.s;
  // shadow, and a red pool of light under the boss
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(gx, gy, 13 * S, 5 * S, 0, 0, TAU);
  ctx.fill();
  if (z.type === 'boss') {
    const g = ctx.createRadialGradient(gx, gy, 4, gx, gy, 70);
    g.addColorStop(0, 'rgba(255, 45, 85, 0.35)');
    g.addColorStop(1, 'rgba(255, 45, 85, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(gx, gy, 70, 26, 0, 0, TAU);
    ctx.fill();
  }

  const moving = Math.max(0.35, a.moveK ?? 0); // the dead never stand quite still
  const ph = a.phase ?? t / 200;
  const since = t - (a.attackT ?? -1e9);
  const swipe = since < 260 ? Math.sin((since / 260) * Math.PI) : 0;
  const lurch = Math.sin(ph * 0.5 + a.id) * 0.12;
  const lean = k.lean + lurch + swipe * 0.25;
  // local frame: feet at 0, up is negative, facing +x
  const L = 10;
  const T = 16;
  const H = 6.5;
  const bob = Math.abs(Math.sin(ph)) * 1.6 * moving;
  const hip = { x: 0, y: -2 * L - bob + 1 };
  const sh = { x: hip.x + Math.sin(lean) * T, y: hip.y - Math.cos(lean) * T };
  const head = { x: sh.x + Math.sin(lean + 0.35) * (H + 2), y: sh.y - Math.cos(lean + 0.35) * (H + 2) + Math.sin(ph * 0.7) * 0.8 };
  // a shuffle: the front leg steps, the back one drags
  const legs = [0, 1].map((i) => {
    const p = ph + (i ? Math.PI : 0);
    const swing = Math.sin(p) * 0.5 * moving * (i ? 0.6 : 1);
    const knee = { x: hip.x + Math.sin(swing) * L, y: hip.y + Math.cos(swing) * L };
    const s2 = swing - (i ? 0.1 : 0.55 * Math.max(0, Math.cos(p)) * moving);
    return { knee, foot: { x: knee.x + Math.sin(s2) * L, y: knee.y + Math.cos(s2) * L } };
  });
  // arms out in front; a swipe brings them down hard
  const reach = 15 + swipe * 4;
  const arms = [0, 1].map((i) => {
    const sway = Math.sin(ph * 0.8 + i * 2) * 2;
    const drop = swipe * (i ? 10 : 14) - 1;
    const hand = { x: sh.x + reach - i * 2, y: sh.y + 2 + i * 3 + sway + drop };
    return { elbow: { x: (sh.x + hand.x) / 2, y: (sh.y + hand.y) / 2 + 2 }, hand };
  });

  ctx.save();
  ctx.translate(gx, gy);
  ctx.scale(f * S, S);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (z.type === 'boss') {
    ctx.shadowColor = 'rgba(255, 45, 85, 0.85)';
    ctx.shadowBlur = 16;
  }
  const flash = z.flash;
  const skin = flash ? '#ffffff' : k.skin;
  for (const [style, w] of [[OUTLINE, 5.2], [skin, 2.6]]) {
    ctx.strokeStyle = style;
    ctx.lineWidth = w * k.w;
    ctx.beginPath();
    for (const l of legs) {
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(l.knee.x, l.knee.y);
      ctx.lineTo(l.foot.x, l.foot.y);
    }
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(sh.x, sh.y);
    for (const ar of arms) {
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(ar.elbow.x, ar.elbow.y);
      ctx.lineTo(ar.hand.x, ar.hand.y);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // rags over the torso
  if (!flash) {
    ctx.strokeStyle = k.rag;
    ctx.lineWidth = 4.2 * k.w;
    ctx.beginPath();
    ctx.moveTo(hip.x + (sh.x - hip.x) * 0.1, hip.y + (sh.y - hip.y) * 0.1);
    ctx.lineTo(hip.x + (sh.x - hip.x) * 0.8, hip.y + (sh.y - hip.y) * 0.8);
    ctx.stroke();
  }
  // head
  ctx.fillStyle = skin;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(head.x, head.y, H, 0, TAU);
  ctx.fill();
  ctx.stroke();
  if (z.type === 'boss' || z.type === 'brute') {
    // horns (boss) or a cracked skull (brute)
    ctx.strokeStyle = z.type === 'boss' ? '#e8dcc8' : 'rgba(4,6,10,0.6)';
    ctx.lineWidth = z.type === 'boss' ? 2.2 : 1.2;
    ctx.beginPath();
    if (z.type === 'boss') {
      ctx.moveTo(head.x - 3, head.y - H + 1);
      ctx.quadraticCurveTo(head.x - 8, head.y - H - 4, head.x - 6, head.y - H - 9);
      ctx.moveTo(head.x + 3, head.y - H + 1);
      ctx.quadraticCurveTo(head.x + 8, head.y - H - 4, head.x + 9, head.y - H - 8);
    } else {
      ctx.moveTo(head.x - 1, head.y - H);
      ctx.lineTo(head.x + 1, head.y - 2);
      ctx.lineTo(head.x - 1, head.y + 1);
    }
    ctx.stroke();
  }
  // lit eyes: the thing you see first in the dark
  const blink = Math.sin(t / 900 + a.id * 3) > 0.97;
  if (!blink) {
    ctx.fillStyle = k.eye;
    ctx.shadowColor = k.eye;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(head.x + 2.2, head.y - 1, 1.3, 0, TAU);
    ctx.arc(head.x + 4.6, head.y - 0.6, 1.1, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // a jaw hanging open
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(head.x + 2, head.y + 3);
  ctx.lineTo(head.x + 5, head.y + 3.6 + swipe * 1.5);
  ctx.stroke();
  if (gore && z.hp < 50) {
    ctx.fillStyle = 'rgba(120, 10, 10, 0.75)';
    ctx.beginPath();
    ctx.arc(sh.x - 1, sh.y + 4, 2.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // where the tag goes (overhead)
  z.top = gy - (2 * L + T + 2 * H + 4) * S - 6;
}

// health over the dead: only once they're hurt, and always for the boss
export function drawZombieTag(ctx, z, font) {
  if (z.top == null) return;
  const boss = z.type === 'boss';
  if (!boss && z.hp >= 100) return;
  const w = boss ? 90 : z.type === 'brute' ? 40 : 28;
  const x = z.a.x - w / 2;
  const y = z.top;
  ctx.fillStyle = 'rgba(4, 6, 10, 0.8)';
  ctx.fillRect(x - 1, y - 1, w + 2, boss ? 8 : 5);
  ctx.fillStyle = boss ? '#ff2d55' : '#ff6b6b';
  ctx.fillRect(x, y, (w * Math.max(0, z.hp)) / 100, boss ? 6 : 3);
  if (boss) {
    ctx.font = `900 12px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff2d55';
    ctx.fillText('☠ BOSS ☠', z.a.x, y - 5);
  }
}

// a bag of gold: a fat sack with a $ stamped on it, glinting; spills and big bags are bigger
export function drawGoldBag(ctx, g, t, reduced) {
  const big = g.v > 1;
  const r = big ? 15 : 11;
  const k = reduced ? 0 : Math.sin(t / 240 + g.i);
  const y = g.y - 6 - (reduced ? 0 : Math.abs(Math.sin(t / 380 + g.i)) * 3);
  // halo on the ground
  const halo = ctx.createRadialGradient(g.x, g.y + 4, 2, g.x, g.y + 4, r * 2.4);
  halo.addColorStop(0, `rgba(255, 209, 102, ${0.45 + k * 0.15})`);
  halo.addColorStop(1, 'rgba(255, 209, 102, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(g.x, g.y + 4, r * 2.4, r, 0, 0, TAU);
  ctx.fill();
  // the sack
  ctx.fillStyle = big ? '#ffc23d' : '#e9a923';
  ctx.strokeStyle = 'rgba(4,6,10,0.85)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.ellipse(g.x, y, r * 0.95, r, 0, 0, TAU);
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = '#b07812';
  ctx.beginPath();
  ctx.moveTo(g.x - r * 0.45, y - r * 0.9);
  ctx.lineTo(g.x + r * 0.45, y - r * 0.9);
  ctx.lineTo(g.x + r * 0.25, y - r * 1.3);
  ctx.lineTo(g.x - r * 0.25, y - r * 1.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5a3a06';
  ctx.font = `900 ${big ? 15 : 12}px Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', g.x, y + 1);
  ctx.textBaseline = 'alphabetic';
  if (big) {
    ctx.fillStyle = '#fff';
    ctx.font = '900 10px Impact, sans-serif';
    ctx.fillText(`×${g.v}`, g.x + r + 4, y - r + 2);
  }
  // a glint
  if (!reduced && k > 0.6) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    const sx = g.x - r * 0.4;
    const sy = y - r * 0.4;
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy);
    ctx.lineTo(sx + 4, sy);
    ctx.moveTo(sx, sy - 4);
    ctx.lineTo(sx, sy + 4);
    ctx.stroke();
  }
}

// a medkit a zombie dropped: white box, red cross, a slow pulse
export function drawMedkit(ctx, m, t, reduced) {
  const k = reduced ? 0 : Math.sin(t / 300 + m.i);
  ctx.strokeStyle = `rgba(61, 220, 151, ${0.4 + k * 0.2})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(m.x, m.y + 4, 18 + k * 2, 7, 0, 0, TAU);
  ctx.stroke();
  const y = m.y - 8;
  ctx.fillStyle = '#f2f2f2';
  ctx.strokeStyle = 'rgba(4,6,10,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(m.x - 10, y - 8, 20, 16, 3);
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = '#ff4d5e';
  ctx.fillRect(m.x - 2, y - 5.5, 4, 11);
  ctx.fillRect(m.x - 5.5, y - 2, 11, 4);
}
