// Line-drawn runners in the spirit of Gravity Defied: one stroke weight, joints,
// a walk cycle, weapons held at the aim. Figures stand upright on the map
// (billboards), with their feet on the runner's position.
import { WEAPONS } from '../shared/weapons.js';

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

// Stroke everything twice: a dark outline so figures read on any floor, then the colour line.
export function drawFigure(ctx, a, p, o) {
  const { gore, color, flash, headless } = o;
  const legsLeft = gore ? Math.max(0, 2 - a.wounds) : 2;
  const passes = [
    { style: OUTLINE, w: 5.2 },
    { style: flash ? '#ffffff' : color, w: 2.6 },
  ];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

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
  // visor
  if (!headless) {
    ctx.strokeStyle = flash ? '#fff' : 'rgba(235, 229, 214, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(p.head.x + p.f * 1.5, p.head.y - 1);
    ctx.lineTo(p.head.x + p.f * 5.5, p.head.y - 1);
    ctx.stroke();
  }
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
