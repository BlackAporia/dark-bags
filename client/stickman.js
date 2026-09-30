// Line-drawn runners in the spirit of Gravity Defied: one stroke weight, joints,
// a walk cycle, weapons held at the aim. Figures stand upright on the map
// (billboards), with their feet on the runner's position.
import { WEAPONS } from '../shared/weapons.js';
import { OUTFIT } from '../shared/cosmetics.js';

export const FEET = 16; // world units from the runner's centre down to the feet
const THIGH = 10;
const SHIN = 10;
const TORSO = 18;
const HEAD_R = 6.5;
const OUTLINE = 'rgba(4, 6, 10, 0.75)';

// Weapon line art in a local frame: x along the barrel, y down. [x1, y1, x2, y2, width]
const ART = {
  knife: { lines: [[-6, 0, 2, 0, 3.6], [2, -3.6, 2, 3.6, 2.2], [2, -0.6, 19, -0.6, 3.2], [19, -0.6, 15, -3, 2.2], [4, 1, 17, 1, 1.2]], length: 19, support: 0, kick: 0 },
  pistol: { lines: [[0, 0, -2, 5.5, 2.6], [-2, -1.6, 10, -1.6, 2.6]], length: 10, support: 0, kick: 3 },
  shotgun: { lines: [[-8, 1.5, 0, 0, 2.8], [0, -1, 24, -1, 2.4], [8, 1.4, 15, 1.4, 2.8]], length: 24, support: 11, kick: 7 },
  smg: { lines: [[-5, 0.5, 0, 0, 2.4], [0, -1, 14, -1, 3], [5, 0, 6, 7, 2.2], [14, -1, 18, -1, 1.8]], length: 18, support: 9, kick: 2 },
  rifle: { lines: [[-9, 1.5, 0, 0, 2.8], [0, -1, 20, -1, 3], [8, 0, 10.5, 7, 2.4], [20, -1, 28, -1, 1.8]], length: 28, support: 13, kick: 3 },
  sniper: { lines: [[-10, 1.8, 0, 0, 2.8], [0, -1, 34, -1, 2.6], [6, -4.5, 16, -4.5, 2.4], [6, -4.5, 6, -1, 1.4], [16, -4.5, 16, -1, 1.4], [26, 0, 28, 4.5, 1.4]], length: 34, support: 18, kick: 9 },
};
export const weaponArt = (w) => ART[WEAPONS[w]?.id ?? 'knife'];

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Joint positions for a runner. a: animation state kept by the client
 * { x, y, aim, facing, phase, moveK, wounds, attackT, attackAim, w, crawl }
 */
export function pose(a, t, gore) {
  const f = a.facing;
  const G = { x: a.x, y: a.y + FEET };
  const moving = a.moveK;
  const crawl = gore && a.wounds >= 2;
  const breathe = Math.sin(t / 520 + a.id) * 0.6 * (1 - moving);
  const bob = crawl ? 0 : Math.abs(Math.sin(a.phase)) * 1.8 * moving;
  const hip = crawl ? { x: G.x - f * 7, y: G.y - 5 } : { x: G.x, y: G.y - THIGH - SHIN - bob + breathe * 0.3 };
  const lean = crawl ? 1.2 + Math.sin(a.phase) * 0.08 : moving * 0.2 + (a.hurtT && t - a.hurtT < 140 ? -0.25 : 0);
  const shoulder = { x: hip.x + Math.sin(lean) * TORSO * f, y: hip.y - Math.cos(lean) * TORSO + breathe };
  const neck = { x: shoulder.x + Math.sin(lean) * 3 * f, y: shoulder.y - Math.cos(lean) * 3 };
  const head = { x: neck.x + Math.sin(lean) * HEAD_R * f, y: neck.y - Math.cos(lean) * HEAD_R, r: HEAD_R };

  // legs: [front, back]; angles measured from straight down, + toward the facing side
  const legs = [0, 1].map((i) => {
    const ph = a.phase + (i ? Math.PI : 0);
    const swing = moving > 0.05 ? Math.sin(ph) * 0.6 * moving : (i ? -0.14 : 0.14);
    const bend = moving > 0.05 ? 0.8 * Math.max(0, Math.cos(ph)) * moving : 0.05;
    const knee = { x: hip.x + Math.sin(swing) * THIGH * f, y: hip.y + Math.cos(swing) * THIGH };
    const s2 = swing - bend;
    const foot = { x: knee.x + Math.sin(s2) * SHIN * f, y: knee.y + Math.cos(s2) * SHIN };
    return { hip, knee, foot };
  });

  // arms and weapon
  const art = weaponArt(a.w);
  let aim = a.aim;
  let recoil = 0;
  const since = t - (a.attackT ?? -1e9);
  if (WEAPONS[a.w]?.melee) {
    if (since < 170) aim += (-1 + (2 * since) / 170) * 1.0 * (Math.cos(a.aim) >= 0 ? 1 : -1);
  } else if (since < 110) recoil = (1 - since / 110) * art.kick;
  const u = { x: Math.cos(aim), y: Math.sin(aim) };
  const grip = { x: shoulder.x + u.x * (11 - recoil), y: shoulder.y + 4 + u.y * (11 - recoil) };
  const support = { x: grip.x + u.x * art.support, y: grip.y + u.y * art.support };
  const elbow = (h, bendDir) => {
    const mx = (shoulder.x + h.x) / 2;
    const my = (shoulder.y + h.y) / 2;
    return { x: mx - u.y * 3 * bendDir, y: my + Math.abs(u.x) * 3 + 1 };
  };
  let arms;
  if (crawl) {
    // one arm drags the body, the other keeps the weapon up
    const reach = Math.sin(a.phase * 1.3) * 7;
    const hand = { x: shoulder.x + f * (9 + reach), y: G.y - 1 };
    arms = [
      { from: shoulder, elbow: { x: (shoulder.x + hand.x) / 2, y: (shoulder.y + hand.y) / 2 - 4 }, hand },
      { from: shoulder, elbow: elbow(grip, f), hand: grip },
    ];
  } else {
    arms = [
      { from: shoulder, elbow: elbow(grip, f), hand: grip },
      { from: shoulder, elbow: elbow(support, -f), hand: art.support ? support : grip },
    ];
  }
  const muzzle = { x: grip.x + u.x * art.length, y: grip.y + u.y * art.length };
  return { G, hip, shoulder, neck, head, legs, arms, grip, u, aim, art, muzzle, f, crawl, lean };
}

function seg(ctx, a, b) {
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

// The line colour for an outfit right now (rainbow cycles, everything else is fixed).
export function outfitColor(outfit, t, fallback) {
  if (!outfit) return fallback;
  if (outfit.fx === 'rainbow') return `hsl(${(t / 12) % 360}, 95%, 70%)`;
  return outfit.color;
}

// Soft light around the whole figure for glow/pulse/fire/ghost/rainbow outfits.
function drawAura(ctx, p, outfit, color, t, legsLeft) {
  const fx = outfit.fx;
  const k = fx === 'pulse' ? 0.5 + 0.5 * Math.sin(t / 260) : fx === 'fire' ? 0.75 + 0.25 * Math.sin(t / 45) * Math.sin(t / 71) : 0.8;
  const auraColor = fx === 'fire' ? '#ff7a1a' : outfit.accent && fx === 'pulse' ? color : color;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [w, alpha] of [
    [14, 0.1],
    [8, 0.18],
  ]) {
    ctx.strokeStyle = auraColor;
    ctx.globalAlpha = alpha * k * (fx === 'ghost' ? 0.8 : 1);
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i < legsLeft; i++) {
      const L = p.legs[i];
      seg(ctx, L.hip, L.knee);
      seg(ctx, L.knee, L.foot);
    }
    seg(ctx, p.hip, p.shoulder);
    for (const arm of p.arms) {
      seg(ctx, arm.from, arm.elbow);
      seg(ctx, arm.elbow, arm.hand);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.head.x, p.head.y, p.head.r + w / 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (fx === 'fire') {
    // flames licking off the shoulders and head
    for (let i = 0; i < 5; i++) {
      const ph = t / 90 + i * 1.7;
      const x = p.head.x + Math.sin(ph * 1.3 + i) * 7;
      const y = p.head.y - p.head.r - 2 - ((t / 6 + i * 13) % 14);
      const r = 2.6 - ((t / 6 + i * 13) % 14) / 7;
      if (r <= 0) continue;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = i % 2 ? '#ffd166' : '#ff5a1f';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Hair, hats and helmets. Drawn over the head circle, facing f.
function drawHead(ctx, p, a, outfit, color, t, flash) {
  const { head: h, f } = p;
  const r = h.r;
  const acc = flash ? '#fff' : outfit?.accent ?? shade(color, -0.45);
  const line = flash ? '#fff' : color;
  const fill = (c) => {
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  };
  // ponytail: swings with the stride
  if (a.body === 'f') {
    const sway = Math.sin(a.phase ?? 0) * 3 * (a.moveK ?? 0) + Math.sin(t / 700 + (a.id ?? 0)) * 0.6;
    const bx = h.x - f * r * 0.8;
    const by = h.y - r * 0.2;
    for (const [w, st] of [
      [6, OUTLINE],
      [3.6, line],
    ]) {
      ctx.strokeStyle = st;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - f * 8, by + 1 + sway * 0.3, bx - f * (8 + sway * 0.6), by + 13 + sway);
      ctx.stroke();
    }
    ctx.fillStyle = line;
    ctx.beginPath();
    ctx.arc(bx - f * 1, by, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = outfit?.head ?? 'none';
  ctx.save();
  ctx.lineJoin = 'round';
  switch (g) {
    case 'cap':
      ctx.beginPath();
      ctx.arc(h.x, h.y - 0.5, r + 0.6, Math.PI, 0);
      ctx.closePath();
      fill(acc);
      ctx.beginPath();
      ctx.moveTo(h.x + f * 2, h.y - 1.5);
      ctx.lineTo(h.x + f * (r + 6), h.y - 0.5);
      ctx.lineTo(h.x + f * 2, h.y + 0.5);
      ctx.closePath();
      fill(acc);
      break;
    case 'beanie':
      ctx.beginPath();
      ctx.ellipse(h.x, h.y - 1.5, r + 1.2, r + 0.6, 0, Math.PI, 0);
      ctx.closePath();
      fill(acc);
      ctx.fillStyle = line;
      ctx.fillRect(h.x - r - 1.2, h.y - 2.5, (r + 1.2) * 2, 2);
      ctx.beginPath();
      ctx.arc(h.x, h.y - r - 2.6, 2.2, 0, Math.PI * 2);
      fill(line);
      break;
    case 'bandana': {
      ctx.fillStyle = acc;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(h.x - r - 0.5, h.y - 4.5, (r + 0.5) * 2, 3.4);
      ctx.fill();
      ctx.stroke();
      const flap = Math.sin(t / 110 + (a.id ?? 0)) * 1.5;
      ctx.beginPath();
      ctx.moveTo(h.x - f * r, h.y - 3.5);
      ctx.lineTo(h.x - f * (r + 7), h.y - 5 + flap);
      ctx.lineTo(h.x - f * (r + 6), h.y - 1 + flap);
      ctx.closePath();
      fill(acc);
      break;
    }
    case 'helmet':
    case 'kabuto':
      ctx.beginPath();
      ctx.arc(h.x, h.y - 0.5, r + 1.6, Math.PI * 1.02, -0.02);
      ctx.lineTo(h.x + r + 2.6, h.y + 0.8);
      ctx.lineTo(h.x - r - 2.6, h.y + 0.8);
      ctx.closePath();
      fill(acc);
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(h.x - r - 2, h.y - 1.2);
      ctx.lineTo(h.x + r + 2, h.y - 1.2);
      ctx.stroke();
      if (g === 'kabuto') {
        // golden crescent crest
        ctx.strokeStyle = flash ? '#fff' : outfit.accent ?? '#ffd166';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(h.x, h.y - r - 7, 6, Math.PI * 0.15, Math.PI * 0.85, true);
        ctx.stroke();
      }
      break;
    case 'mask':
      ctx.beginPath();
      ctx.arc(h.x + f * 1.5, h.y + 2, r * 0.7, 0, Math.PI * 2);
      fill(acc);
      ctx.beginPath();
      ctx.arc(h.x + f * (r * 0.7 + 2.5), h.y + 3.5, 2.2, 0, Math.PI * 2);
      fill(line);
      break;
    case 'hood': {
      // over the crown and down the back of the head, open at the face, with a peak
      const a0 = f > 0 ? -Math.PI / 3 : (-2 * Math.PI) / 3;
      const a1 = f > 0 ? (2 * Math.PI) / 3 : Math.PI / 3;
      const hood = () => {
        ctx.beginPath();
        ctx.arc(h.x, h.y, r + 2.6, a0, a1, f > 0);
        ctx.moveTo(h.x - f * 1, h.y - r - 2.4);
        ctx.lineTo(h.x - f * 6.5, h.y - r - 1);
      };
      hood();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 6;
      ctx.stroke();
      hood();
      ctx.strokeStyle = flash ? '#fff' : shade(outfit.color, -0.3);
      ctx.lineWidth = 3.6;
      ctx.stroke();
      break;
    }
    case 'horns':
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(h.x + side * 2.5, h.y - r + 0.5);
        ctx.quadraticCurveTo(h.x + side * 8, h.y - r - 2, h.x + side * 7.5, h.y - r - 8);
        ctx.quadraticCurveTo(h.x + side * 5, h.y - r - 3, h.x + side * 5.5, h.y - r + 1.5);
        ctx.closePath();
        fill(outfit.accent ?? '#f1e3c8');
      }
      break;
    case 'tophat':
      ctx.beginPath();
      ctx.rect(h.x - 4.6, h.y - r - 10, 9.2, 10);
      fill(acc);
      ctx.fillStyle = '#b3121f';
      ctx.fillRect(h.x - 4.6, h.y - r - 2.4, 9.2, 1.8);
      ctx.beginPath();
      ctx.rect(h.x - 8, h.y - r - 1, 16, 2.2);
      fill(acc);
      break;
    case 'crown': {
      const y0 = h.y - r + 1;
      ctx.beginPath();
      ctx.moveTo(h.x - 6, y0);
      ctx.lineTo(h.x - 6.5, y0 - 7);
      ctx.lineTo(h.x - 3, y0 - 3.5);
      ctx.lineTo(h.x, y0 - 8.5);
      ctx.lineTo(h.x + 3, y0 - 3.5);
      ctx.lineTo(h.x + 6.5, y0 - 7);
      ctx.lineTo(h.x + 6, y0);
      ctx.closePath();
      fill(flash ? '#fff' : '#ffd166');
      ctx.fillStyle = '#ff3d7f';
      ctx.beginPath();
      ctx.arc(h.x, y0 - 3, 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'halo':
      ctx.globalCompositeOperation = 'lighter';
      for (const [w, al] of [
        [5, 0.25],
        [2, 0.95],
      ]) {
        ctx.strokeStyle = flash ? '#fff' : line;
        ctx.globalAlpha = al;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.ellipse(h.x, h.y - r - 5 + Math.sin(t / 400) * 0.8, 8, 2.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    default:
  }
  ctx.restore();
  if (outfit?.fx === 'laser') {
    // the meme, literally: two red beams from the eyes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const len = 16 + Math.sin(t / 60) * 3;
    for (const [w, al] of [
      [5, 0.25],
      [1.6, 1],
    ]) {
      ctx.strokeStyle = '#ff2d55';
      ctx.globalAlpha = al;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (const dy of [-2, 0.5]) {
        ctx.moveTo(h.x + f * 3, h.y + dy);
        ctx.lineTo(h.x + f * (3 + len), h.y + dy + 3);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// lighten (+) or darken (-) a #rrggbb colour
export function shade(hex, k) {
  if (typeof hex !== 'string' || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

// Stroke everything twice: a dark outline so figures read on any floor, then the colour line.
export function drawFigure(ctx, a, p, o) {
  const { gore, flash, headless } = o;
  const t = o.t ?? performance.now();
  const outfit = a.outfit ? OUTFIT[a.outfit] : null;
  const color = outfitColor(outfit, t, o.color);
  const legsLeft = gore ? Math.max(0, 2 - a.wounds) : 2;
  const passes = [
    { style: OUTLINE, w: 5.2 },
    { style: flash ? '#ffffff' : color, w: 2.6 },
  ];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ghostly = outfit?.fx === 'ghost';
  const prevAlpha = ctx.globalAlpha;
  if (outfit?.fx && outfit.fx !== 'laser') drawAura(ctx, p, outfit, color, t, legsLeft);
  if (ghostly) ctx.globalAlpha = prevAlpha * (0.62 + 0.12 * Math.sin(t / 300));

  // sack on the back, sized by the bluff the runner picked
  const bagR = [6, 9, 13][a.bluff ?? 1] ?? 9;
  const bag = { x: p.shoulder.x - p.f * (bagR * 0.6 + 3), y: lerp(p.shoulder.y, p.hip.y, 0.35) };
  ctx.fillStyle = '#6f5534';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(bag.x, bag.y, bagR * 0.85, bagR, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();
  ctx.strokeStyle = '#b8925f';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bag.x - 3, bag.y - bagR + 1);
  ctx.lineTo(bag.x + 3, bag.y - bagR + 1);
  ctx.stroke();

  for (const pass of passes) {
    ctx.strokeStyle = pass.style;
    ctx.lineWidth = pass.w;
    ctx.beginPath();
    // legs (the back leg goes first when wounded)
    for (let i = 0; i < 2; i++) {
      const L = p.legs[i];
      const lost = i === 1 ? legsLeft < 2 : legsLeft < 1;
      if (lost) {
        if (!p.crawl) seg(ctx, L.hip, { x: lerp(L.hip.x, L.knee.x, 0.45), y: lerp(L.hip.y, L.knee.y, 0.45) });
        continue;
      }
      seg(ctx, L.hip, L.knee);
      seg(ctx, L.knee, L.foot);
      ctx.moveTo(L.foot.x, L.foot.y);
      ctx.lineTo(L.foot.x + p.f * 3.5, L.foot.y);
    }
    seg(ctx, p.hip, p.shoulder);
    seg(ctx, p.shoulder, p.neck);
    // build: a shoulder line for him, a hip line for her
    if (a.body === 'f') {
      // waist to hips: a small A shape
      const wx = lerp(p.hip.x, p.shoulder.x, 0.3);
      const wy = lerp(p.hip.y, p.shoulder.y, 0.3);
      ctx.moveTo(p.hip.x - 4.5, p.hip.y + 1);
      ctx.lineTo(wx, wy);
      ctx.lineTo(p.hip.x + 4.5, p.hip.y + 1);
    } else if (a.body === 'm') {
      const sx = Math.cos(p.lean) * 5;
      ctx.moveTo(p.shoulder.x - sx, p.shoulder.y + 1);
      ctx.lineTo(p.shoulder.x + sx, p.shoulder.y + 1);
    }
    for (const arm of p.arms) {
      seg(ctx, arm.from, arm.elbow);
      seg(ctx, arm.elbow, arm.hand);
    }
    ctx.stroke();
    if (!headless) {
      ctx.beginPath();
      ctx.arc(p.head.x, p.head.y, p.head.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // visor, then hair and headgear
  if (!headless) {
    ctx.strokeStyle = flash ? '#fff' : 'rgba(235, 229, 214, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p.head.x + p.f * 1.5, p.head.y - 1);
    ctx.lineTo(p.head.x + p.f * 5.5, p.head.y - 1);
    ctx.stroke();
    drawHead(ctx, p, a, outfit, color, t, flash);
  }
  if (ghostly) ctx.globalAlpha = prevAlpha;
  // gore: stumps
  if (gore && a.wounds > 0) {
    ctx.fillStyle = '#b3121f';
    for (let i = 0; i < 2; i++) {
      const lost = i === 1 ? legsLeft < 2 : legsLeft < 1;
      if (!lost) continue;
      const L = p.legs[i];
      const s = p.crawl ? L.hip : { x: lerp(L.hip.x, L.knee.x, 0.45), y: lerp(L.hip.y, L.knee.y, 0.45) };
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (headless && gore) {
    ctx.fillStyle = '#b3121f';
    ctx.beginPath();
    ctx.arc(p.neck.x, p.neck.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  drawWeapon(ctx, p, flash);
}

export function drawWeapon(ctx, p, flash) {
  const { art, grip, aim } = p;
  const mirror = Math.cos(aim) < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(grip.x, grip.y);
  ctx.rotate(aim);
  ctx.scale(1, mirror);
  for (const pass of [0, 1]) {
    for (const [x1, y1, x2, y2, w] of art.lines) {
      ctx.strokeStyle = pass ? (flash ? '#fff' : '#cfd4de') : OUTLINE;
      ctx.lineWidth = pass ? w : w + 2.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Leg geometry at the moment it comes off, as a two-segment piece for the fx system.
export function legPiece(p, i) {
  const L = p.legs[i];
  return {
    x: L.hip.x,
    y: p.G.y,
    z: p.G.y - L.hip.y,
    pts: [
      [0, 0],
      [L.knee.x - L.hip.x, L.knee.y - L.hip.y],
      [L.foot.x - L.hip.x, L.foot.y - L.hip.y],
    ],
  };
}

export function hpColor(frac) {
  if (frac > 0.6) return '#4ade80';
  if (frac > 0.3) return '#facc15';
  return '#ff4d5e';
}

// A runner outside the raid (locker, lineup, share cards): same drawing code, posed.
// (x, y) is where the feet stand; one unit ≈ scale px. The figure is ~64 units tall.
export function drawPreview(ctx, look, { x, y, scale = 3, t = 0, w = 0, aim = -0.2, phase = 0, moveK = 0, attackT = -1e9 } = {}) {
  const a = { id: 7, x: 0, y: -FEET, aim, facing: Math.cos(aim) >= 0 ? 1 : -1, phase, moveK, wounds: 0, attackT, w, bluff: 0, outfit: look?.outfit ?? null, body: look?.body ?? 'm' };
  const p = pose(a, t, false);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawFigure(ctx, a, p, { gore: false, color: OUTFIT[a.outfit]?.color ?? '#ebe5d6', t });
  ctx.restore();
}

// Cached still images for DOM use (the ready-room lineup).
const stills = new Map();
export function figureStill(look, w = 80, h = 112) {
  const key = `${look?.outfit}|${look?.body}|${w}x${h}`;
  let url = stills.get(key);
  if (!url && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    drawPreview(ctx, look, { x: w / 2, y: h - 8, scale: (h - 16) / 66, t: 1000 });
    url = c.toDataURL('image/png');
    stills.set(key, url);
  }
  return url;
}
