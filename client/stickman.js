// Line-drawn runners in the spirit of Gravity Defied: one stroke weight, joints,
// a walk cycle, weapons held at the aim. Figures stand upright on the map
// (billboards), with their feet on the runner's position.
import { WEAPONS } from '../shared/weapons.js';
import { OUTFIT, FINISH, modelFor } from '../shared/cosmetics.js';

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
  deagle: { lines: [[0, 0, -2.5, 6, 3.2], [-2, -1.8, 13, -1.8, 3.8], [8, -3.8, 12, -3.8, 1.2]], length: 13, support: 0, kick: 5 },
  autoshotgun: { lines: [[-8, 1.5, 0, 0, 3], [0, -1, 22, -1, 3], [6, 1.6, 6, 6, 3.4], [10, 1.6, 17, 1.6, 2.6], [22, -1, 24, -1, 2]], length: 24, support: 12, kick: 6 },
  pdw: { lines: [[-6, 1, 0, 0, 3.2], [-6, -1.2, 16, -1.2, 4.2], [-2, 0, 0, 6, 2.4], [2, -4.6, 13, -4.6, 2], [16, -1.2, 19, -1.2, 1.6]], length: 19, support: 9, kick: 2 },
  carbine: { lines: [[-9, 1.5, -3, 1.5, 2.6], [-9, -1, -3, -1, 1.4], [-3, -1, 18, -1, 3], [6, 0, 8, 6.5, 2.4], [3, -4, 9, -4, 2.2], [18, -1, 27, -1, 1.6], [24, -1, 24, -3.5, 1.2]], length: 27, support: 13, kick: 3 },
  scout: { lines: [[-10, 1.8, 0, 0, 2.4], [0, -1, 33, -1, 2], [7, -4.2, 15, -4.2, 2.2], [7, -4.2, 7, -1, 1.2], [15, -4.2, 15, -1, 1.2]], length: 33, support: 17, kick: 7 },
  lmg: { lines: [[-10, 2, 0, 0, 3.2], [0, -1, 26, -1, 3.6], [6, 1, 12, 1, 7], [26, -1, 33, -1, 2.2], [26, 1, 26, 6, 1.2], [22, 1, 30, 6, 1.2]], length: 33, support: 16, kick: 3 },
  magnum: { lines: [[-12, 2.2, 0, 0, 3.6], [0, -1, 38, -1, 3.2], [5, -5.5, 19, -5.5, 3.6], [5, -5.5, 5, -1, 1.6], [19, -5.5, 19, -1, 1.6], [36, -1, 40, -1, 4.4], [28, 0, 31, 5, 1.4]], length: 40, support: 19, kick: 11 },
};
// Skin models (cosmetic): same hands and timing as the base weapon, a different silhouette.
// energy: the barrel or blade glows in the skin colour; blade: the lines that glow.
const MODEL_ART = {
  dagger: { lines: [[-5, 0, 2, 0, 3.4], [2, -3, 2, 3, 2], [2, 0, 15, 0, 2.6], [15, 0, 18, 0, 1.4]], length: 18 },
  machete: { lines: [[-6, 0, 2, 0, 3.6], [2, -3, 2, 3, 2], [2, 0, 24, -1, 3.6], [24, -1, 27, -3.5, 2.2]], length: 27 },
  tanto: { lines: [[-6, 0, 2, 0, 3.6], [2, -3.2, 2, 3.2, 2.2], [2, -0.5, 16, -0.5, 3], [16, -0.5, 19.5, -3, 2.4]], length: 19 },
  cleaver: { lines: [[-6, 0, 2, 0, 3.6], [3, 1.8, 16, 1.8, 6.5], [3, 5, 16, 5, 1]], length: 16 },
  axe: { lines: [[-8, 0, 17, 0, 2.8], [13, -1, 13, -8, 3], [13, -8, 20, -10.5, 2.2], [20, -10.5, 20, -2.5, 2.6], [20, -2.5, 13, -1, 2]], length: 20 },
  katana: { lines: [[-10, 0, 1, 0, 3.2], [1, -3.8, 1, 3.8, 2.8], [1, -0.4, 18, -1.6, 2.6], [18, -1.6, 32, -4.5, 2.2], [-8, -1.3, -2, -1.3, 0.8]], length: 32 },
  dual: { lines: [[-5, 0, 2, 0, 3.2], [2, -3, 2, 3, 2], [2, 0, 22, 0, 2.6], [-5, 6, 2, 6, 3.2], [2, 3, 2, 9, 2], [2, 6, 20, 9, 2.6]], length: 22 },
  scythe: { lines: [[-12, 0, 22, 0, 2.6], [22, 0, 24, -4, 2.6], [24, -4, 15, -15, 3], [15, -15, 4, -13, 2]], length: 24 },
  esword: { lines: [[-6, 0, 3, 0, 3.8], [3, -2.8, 3, 2.8, 2.2], [3, 0, 29, 0, 3.2]], length: 29, energy: [2] },
  hammer: { lines: [[-9, 0, 18, 0, 2.8], [18, -7, 18, 7, 8], [15, -7, 15, 7, 1.4]], length: 22 },
  revolver: { lines: [[0, 0, -2, 5.5, 2.8], [-2, -1.6, 12, -1.6, 2.4], [1, -1.4, 5, -1.4, 5.4]], length: 12, support: 0, kick: 4 },
  deagle: { lines: [[0, 0, -2.5, 6, 3.2], [-2, -1.8, 13, -1.8, 3.8], [8, -3.8, 12, -3.8, 1.2]], length: 13, support: 0, kick: 5 },
  blaster: { lines: [[0, 0, -2, 5.5, 2.6], [-2, -1.6, 8, -1.6, 4.4], [8, -1.6, 14, -1.6, 2], [3, -4.6, 9, -4.6, 1.6]], length: 14, support: 0, kick: 3, energy: [2, 3] },
  double: { lines: [[-9, 2, 0, 0, 3], [0, -2.2, 23, -2.2, 2], [0, 0.6, 23, 0.6, 2], [6, 1.8, 12, 1.8, 2.8]], length: 23, support: 11, kick: 8 },
  drum: { lines: [[-7, 1.5, 0, 0, 2.8], [0, -1, 21, -1, 3.2], [7, 3, 7, 3, 7], [21, -1, 23, -1, 2]], length: 23, support: 12, kick: 7 },
  uzi: { lines: [[0, 0, 1, 8, 2.6], [-3, -1, 11, -1, 3.4], [11, -1, 14, -1, 1.6], [-3, -1, -6, 2, 1.4]], length: 14, support: 0, kick: 2 },
  vector: { lines: [[-5, 0.5, 0, 0, 2.4], [0, -1, 14, -1, 3.8], [4, 0, 8, 7, 2.4], [9, 1.5, 12, 4.5, 2.2], [14, -1, 17, -1, 1.6]], length: 17, support: 9, kick: 2 },
  ak: { lines: [[-9, 1.5, 0, 0, 3], [0, -1, 19, -1, 3.2], [7, 0, 9, 4, 2.6], [9, 4, 7.5, 8.5, 2.6], [19, -1, 28, -1, 1.8], [12, -3.4, 18, -3.4, 1.4]], length: 28, support: 14, kick: 4 },
  bullpup: { lines: [[-6, 2, 0, 0, 3.4], [-6, -1, 21, -1, 3.6], [-3, 0, -1, 6.5, 2.6], [4, -4.4, 12, -4.4, 2.2], [21, -1, 25, -1, 1.8]], length: 25, support: 12, kick: 3 },
  plasma: { lines: [[-8, 1.5, 0, 0, 2.8], [0, -1, 25, -1, 3.8], [4, -3.8, 20, -3.8, 1.4], [25, -1, 29, -1, 2.2], [6, 1, 9, 6, 2.2]], length: 29, support: 13, kick: 3, energy: [2, 3] },
  bolt: { lines: [[-11, 2, 0, 0, 3], [0, -1, 37, -1, 2.4], [6, -5, 18, -5, 2.8], [6, -5, 6, -1, 1.4], [18, -5, 18, -1, 1.4], [10, -2, 13, -6, 1.4]], length: 37, support: 18, kick: 9 },
  minigun: { lines: [[-8, 2, 0, 0, 3.4], [0, -2.6, 30, -2.6, 1.8], [0, -0.4, 30, -0.4, 1.8], [0, 1.8, 30, 1.8, 1.8], [-2, -0.4, 5, -0.4, 7], [10, 3, 10, 9, 5]], length: 30, support: 15, kick: 2 },
  rail: { lines: [[-10, 1.8, 0, 0, 2.8], [0, -2.6, 35, -2.6, 1.6], [0, 0.6, 35, 0.6, 1.6], [6, -5.2, 16, -5.2, 2.4], [8, -1, 31, -1, 1], [35, -1, 38, -1, 3]], length: 38, support: 18, kick: 10, energy: [4, 5] },
};
// the art for weapon index w, in the model of the skin the runner wears on it
export const weaponArt = (w, ws = null) => {
  const id = WEAPONS[w]?.id ?? 'knife';
  const base = ART[id];
  const finish = ws?.[id];
  const m = finish ? MODEL_ART[modelFor(id, finish)] : null;
  return m ? { support: base.support, kick: base.kick, ...m } : base;
};

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
  const art = weaponArt(a.w, a.ws);
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
  if (outfit.fx === 'gold') return `hsl(${44 + 6 * Math.sin(t / 300)}, 100%, ${62 + 14 * Math.sin(t / 170)}%)`;
  if (outfit.fx === 'holo') return `hsl(${185 + 25 * Math.sin(t / 400)}, 100%, 72%)`;
  if (outfit.fx === 'glitch' && Math.sin(t / 37) > 0.93) return outfit.accent ?? '#ff2d55';
  return outfit.color;
}

// Soft light around the whole figure for glow/pulse/fire/ghost/rainbow outfits.
function drawAura(ctx, p, outfit, color, t, legsLeft) {
  const fx = outfit.fx;
  const k = fx === 'pulse' ? 0.5 + 0.5 * Math.sin(t / 260) : fx === 'fire' ? 0.75 + 0.25 * Math.sin(t / 45) * Math.sin(t / 71) : 0.8;
  const auraColor = fx === 'fire' ? '#ff7a1a' : fx === 'gold' ? '#ffd166' : color;
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

// Premium particle effects around the figure (outfit.fx2). Cheap: a handful of dots
// and strokes per runner, all derived from time, no state.
function drawParticles(ctx, p, outfit, t, color) {
  const fx = outfit.fx2;
  const cx = p.shoulder.x;
  const cy = (p.head.y + p.hip.y) / 2;
  const seed = (outfit.id?.length ?? 3) * 7.3;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (fx === 'lightning') {
    // crackling arcs that jump between random points around the body
    if (Math.sin(t / 53 + seed) > 0.2) {
      ctx.strokeStyle = '#bfe9ff';
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.9;
      for (let k = 0; k < 2; k++) {
        const a0 = t / 90 + k * 2.4 + seed;
        let x = cx + Math.cos(a0) * 14;
        let y = cy + Math.sin(a0) * 18;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let i = 0; i < 4; i++) {
          x += Math.sin(t / 17 + i * 3 + k) * 6;
          y += 5 + Math.cos(t / 23 + i) * 3;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  } else if (fx === 'galaxy' || fx === 'sparks' || fx === 'frost') {
    // orbiting stars / sparks / ice flakes
    const n = fx === 'galaxy' ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const a0 = t / (fx === 'frost' ? 1400 : 900) + (i / n) * Math.PI * 2 + seed;
      const rr = 15 + 5 * Math.sin(t / 500 + i);
      const x = cx + Math.cos(a0) * rr;
      const y = cy + Math.sin(a0) * rr * 1.3;
      const tw = 0.5 + 0.5 * Math.sin(t / 120 + i * 1.7);
      ctx.globalAlpha = 0.35 + 0.65 * tw;
      ctx.fillStyle = fx === 'galaxy' ? `hsl(${(i * 47 + t / 20) % 360}, 90%, 75%)` : fx === 'frost' ? '#d8f3ff' : '#ffd166';
      ctx.beginPath();
      ctx.arc(x, y, fx === 'galaxy' ? 1.2 + tw : 1 + tw * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (fx === 'money' || fx === 'matrix') {
    // falling $ bills or green code around the runner
    ctx.font = `700 ${fx === 'money' ? 7 : 6}px monospace`;
    ctx.textAlign = 'center';
    for (let i = 0; i < 6; i++) {
      const fall = (t / (fx === 'money' ? 18 : 12) + i * 17 + seed) % 44;
      const x = cx + ((i * 9 + seed) % 28) - 14;
      const y = p.head.y - 16 + fall;
      ctx.globalAlpha = 1 - fall / 44;
      ctx.fillStyle = fx === 'money' ? '#7dff9b' : '#39ff14';
      ctx.fillText(fx === 'money' ? '$' : String.fromCharCode(0x30a0 + ((i * 13 + Math.floor(t / 150)) % 90)), x, y);
    }
  } else if (fx === 'shadow') {
    // dark smoke rising off the shoulders
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) {
      const life = (t / 30 + i * 11) % 30;
      ctx.globalAlpha = 0.35 * (1 - life / 30);
      ctx.fillStyle = outfit.accent ?? '#1a0026';
      ctx.beginPath();
      ctx.arc(cx + Math.sin(t / 300 + i) * 8, p.shoulder.y - life, 3 + life / 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// A cape from the shoulders, trailing behind the runner and rippling with the stride.
function drawCape(ctx, p, a, outfit, t) {
  const f = p.f;
  const wave = Math.sin(t / 160 + (a.id ?? 0)) * 2 + (a.moveK ?? 0) * 4;
  const sx = p.shoulder.x;
  const sy = p.shoulder.y + 1;
  ctx.save();
  ctx.fillStyle = outfit.cape;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx - 3, sy);
  ctx.lineTo(sx + 3, sy);
  ctx.quadraticCurveTo(sx - f * (6 + wave), p.hip.y, sx - f * (10 + wave * 1.6), p.hip.y + 9);
  ctx.lineTo(sx - f * (3 + wave * 0.5), p.hip.y + 8);
  ctx.quadraticCurveTo(sx - f * 2, p.hip.y - 2, sx - 3, sy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
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
    case 'visor':
      // wraparound cyber visor
      ctx.beginPath();
      ctx.rect(h.x - r - 0.5, h.y - 3, (r + 0.5) * 2 + 1.5, 3.6);
      fill(acc);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = flash ? '#fff' : outfit.accent2 ?? '#00f5ff';
      ctx.fillRect(h.x + f * 1 - (f < 0 ? r + 1.5 : 0), h.y - 2.2, r + 1.5, 1.6);
      break;
    case 'catears':
    case 'dogears':
    case 'bunny':
      for (const side of [-1, 1]) {
        ctx.beginPath();
        if (g === 'bunny') {
          ctx.ellipse(h.x + side * 3, h.y - r - 6, 1.8, 6, side * 0.15, 0, Math.PI * 2);
        } else {
          const tall = g === 'dogears' ? 6 : 5;
          ctx.moveTo(h.x + side * 1.5, h.y - r + 1);
          ctx.lineTo(h.x + side * 6, h.y - r - tall);
          ctx.lineTo(h.x + side * 6.5, h.y - r + 2.5);
          ctx.closePath();
        }
        fill(acc);
      }
      break;
    case 'wizard':
      ctx.beginPath();
      ctx.moveTo(h.x - 7.5, h.y - r + 1.5);
      ctx.quadraticCurveTo(h.x - 1, h.y - r - 8, h.x - f * 4, h.y - r - 16 + Math.sin(t / 500) * 1.2);
      ctx.quadraticCurveTo(h.x + 2, h.y - r - 6, h.x + 7.5, h.y - r + 1.5);
      ctx.closePath();
      fill(acc);
      ctx.fillStyle = flash ? '#fff' : '#ffd166';
      ctx.beginPath();
      ctx.arc(h.x - 1, h.y - r - 6, 1.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'viking':
      ctx.beginPath();
      ctx.arc(h.x, h.y - 0.5, r + 1.4, Math.PI, 0);
      ctx.closePath();
      fill(acc);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(h.x + side * (r - 0.5), h.y - 3);
        ctx.quadraticCurveTo(h.x + side * (r + 7), h.y - 4, h.x + side * (r + 5), h.y - r - 7);
        ctx.quadraticCurveTo(h.x + side * (r + 3.5), h.y - 5, h.x + side * (r - 1.5), h.y - 5.5);
        ctx.closePath();
        fill('#f1e3c8');
      }
      break;
    case 'astro':
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160, 220, 255, 0.25)';
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = flash ? '#fff' : acc;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + 2, -2.4, -1.6);
      ctx.stroke();
      break;
    case 'mohawk':
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(h.x + i * 2.4 - 1.2, h.y - r + 1);
        ctx.lineTo(h.x + i * 2.4 - f * 1.5, h.y - r - 6 + Math.abs(i) * 1.2);
        ctx.lineTo(h.x + i * 2.4 + 1.2, h.y - r + 1);
        ctx.closePath();
        fill(acc);
      }
      break;
    case 'antenna':
      ctx.strokeStyle = flash ? '#fff' : acc;
      ctx.lineWidth = 1.4;
      for (const side of [-1, 1]) {
        const tipX = h.x + side * 5 + Math.sin(t / 200 + side) * 1.2;
        const tipY = h.y - r - 8;
        ctx.beginPath();
        ctx.moveTo(h.x + side * 2, h.y - r + 0.5);
        ctx.quadraticCurveTo(h.x + side * 2, tipY + 3, tipX, tipY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tipX, tipY, 1.8, 0, Math.PI * 2);
        fill(outfit.accent2 ?? '#9ef01a');
      }
      break;
    case 'cowboy':
      ctx.beginPath();
      ctx.ellipse(h.x, h.y - r + 0.5, 10, 2.2, 0, 0, Math.PI * 2);
      fill(acc);
      ctx.beginPath();
      ctx.moveTo(h.x - 5, h.y - r + 0.5);
      ctx.lineTo(h.x - 4.5, h.y - r - 6);
      ctx.quadraticCurveTo(h.x, h.y - r - 4, h.x + 4.5, h.y - r - 6);
      ctx.lineTo(h.x + 5, h.y - r + 0.5);
      ctx.closePath();
      fill(acc);
      break;
    case 'pumpkin':
    case 'skull': {
      // a full-face mask over the head circle
      ctx.beginPath();
      ctx.arc(h.x, h.y, r + 0.8, 0, Math.PI * 2);
      fill(flash ? '#fff' : g === 'pumpkin' ? '#ff8c1a' : '#efe8d8');
      ctx.fillStyle = g === 'pumpkin' ? '#ffd166' : '#111';
      if (g === 'pumpkin') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t / 90);
      }
      for (const dx of [-2.4, 2.4]) {
        ctx.beginPath();
        ctx.arc(h.x + f * 1 + dx, h.y - 1, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(h.x + f * 1 - 2.5, h.y + 2.2, 5, 1.2);
      if (g === 'pumpkin') {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#3a7d1a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y - r - 0.5);
        ctx.lineTo(h.x + 1.5, h.y - r - 3.5);
        ctx.stroke();
      }
      break;
    }
    case 'frog':
      // big bulging eyes on top
      for (const dx of [-3.4, 3.4]) {
        ctx.beginPath();
        ctx.arc(h.x + dx, h.y - r + 0.5, 3, 0, Math.PI * 2);
        fill(flash ? '#fff' : acc);
        ctx.fillStyle = '#f7f7f7';
        ctx.beginPath();
        ctx.arc(h.x + dx + f * 0.6, h.y - r + 0.3, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(h.x + dx + f * 1.1, h.y - r + 0.3, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'domino':
      // a hero's eye mask with trailing ties
      ctx.beginPath();
      ctx.ellipse(h.x + f * 2, h.y - 1, r * 0.75, 2.2, 0, 0, Math.PI * 2);
      fill(acc);
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(h.x - f * (r - 1), h.y - 1);
      ctx.lineTo(h.x - f * (r + 5), h.y + 1 + Math.sin(t / 120) * 1.5);
      ctx.stroke();
      break;
    case 'party':
      ctx.beginPath();
      ctx.moveTo(h.x - 4.5, h.y - r + 1.5);
      ctx.lineTo(h.x + f * 1.5, h.y - r - 11);
      ctx.lineTo(h.x + 4.5, h.y - r + 1.5);
      ctx.closePath();
      fill(acc);
      ctx.fillStyle = `hsl(${(t / 8) % 360}, 90%, 65%)`;
      ctx.beginPath();
      ctx.arc(h.x + f * 1.5, h.y - r - 11.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'headphones':
      ctx.strokeStyle = flash ? '#fff' : acc;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(h.x, h.y - 0.5, r + 1.5, Math.PI * 1.05, -0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(h.x - f * 0.5, h.y + 0.5, 2.2, 3.2, 0, 0, Math.PI * 2);
      fill(outfit.accent2 ?? acc);
      break;
    case 'diamond': {
      // a floating diamond over the head, catching light
      const dy = h.y - r - 9 + Math.sin(t / 380) * 1.6;
      ctx.beginPath();
      ctx.moveTo(h.x, dy - 4.5);
      ctx.lineTo(h.x + 4, dy - 1);
      ctx.lineTo(h.x, dy + 5);
      ctx.lineTo(h.x - 4, dy - 1);
      ctx.closePath();
      fill(flash ? '#fff' : '#9fe8ff');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 150);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(h.x - 1, dy - 2.5, 1.2, 1.2);
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
  const ghostly = outfit?.fx === 'ghost' || outfit?.fx === 'holo';
  const prevAlpha = ctx.globalAlpha;
  if (outfit?.fx && outfit.fx !== 'laser') drawAura(ctx, p, outfit, color, t, legsLeft);
  if (outfit?.cape) drawCape(ctx, p, a, outfit, t);
  if (ghostly) ctx.globalAlpha = prevAlpha * (outfit.fx === 'holo' ? 0.7 + 0.2 * Math.sin(t / 45) : 0.62 + 0.12 * Math.sin(t / 300));

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
  if (outfit?.fx2) drawParticles(ctx, p, outfit, t, color);
  if (outfit?.fx === 'glitch' && Math.sin(t / 61) > 0.6) {
    // RGB split: a cyan and a magenta ghost of the head, a few pixels off
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    for (const [dx, c] of [[-2, '#00f5ff'], [2, '#ff2dd4']]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.head.x + dx, p.head.y, p.head.r, 0, Math.PI * 2);
      ctx.moveTo(p.shoulder.x + dx, p.shoulder.y);
      ctx.lineTo(p.hip.x + dx, p.hip.y);
      ctx.stroke();
    }
    ctx.restore();
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
  drawWeapon(ctx, p, flash, FINISH[a.ws?.[WEAPONS[a.w]?.id]], t);
}

// the body colour of a weapon finish at time t (animated finishes shift over time)
function finishColor(f, t) {
  if (!f) return '#cfd4de';
  if (f.fx === 'rainbow') return `hsl(${(t / 10) % 360}, 95%, 68%)`;
  if (f.fx === 'shimmer' && Math.sin(t / 240) > 0.85) return f.accent ?? f.color; // a flash of light off the metal
  if (f.fx === 'plasma') return Math.sin(t / 140) > 0 ? f.color : f.accent ?? f.color;
  return f.color;
}

// A weapon in the runner's hands, in its skin: finish colour, a pattern over the body,
// and for the premium finishes a glow or particles.
export function drawWeapon(ctx, p, flash, finish = null, t = performance.now()) {
  const { art, grip, aim } = p;
  const mirror = Math.cos(aim) < 0 ? -1 : 1;
  const body = flash ? '#fff' : finishColor(finish, t);
  ctx.save();
  ctx.translate(grip.x, grip.y);
  ctx.rotate(aim);
  ctx.scale(1, mirror);
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  // premium glow under the weapon
  if (finish?.fx && !flash) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = finish.fx === 'glow' || finish.fx === 'plasma' ? 0.35 + 0.15 * Math.sin(t / 200) : 0.22;
    ctx.strokeStyle = finish.fx === 'fire' ? '#ff7a1a' : finish.fx === 'ice' ? '#bfe9ff' : finish.accent ?? body;
    for (const [x1, y1, x2, y2, w] of art.lines) {
      ctx.lineWidth = w + 5;
      line(x1, y1, x2, y2);
    }
    ctx.restore();
  }
  for (const pass of [0, 1]) {
    for (const [x1, y1, x2, y2, w] of art.lines) {
      ctx.strokeStyle = pass ? body : OUTLINE;
      ctx.lineWidth = pass ? w : w + 2.4;
      line(x1, y1, x2, y2);
    }
  }
  if (art.energy && !flash) {
    // energy models: the blade or coils burn neon in the skin's accent, with a white core
    const neon = finish?.fx === 'rainbow' ? `hsl(${(t / 6) % 360}, 100%, 65%)` : finish?.accent ?? finish?.color ?? '#00f5ff';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.75 + 0.25 * Math.sin(t / 90);
    for (const i of art.energy) {
      const [x1, y1, x2, y2, w] = art.lines[i];
      for (const [k, al, c] of [[4.5, 0.18, neon], [2.4, 0.45, neon], [0.9, 0.95, '#ffffff']]) {
        ctx.globalAlpha = al * pulse;
        ctx.strokeStyle = c;
        ctx.lineWidth = w * k;
        line(x1, y1, x2, y2);
      }
    }
    ctx.restore();
  }
  if (finish && !flash) {
    // the pattern and sparkle ride on the longest line (the barrel or blade)
    const [x1, y1, x2, y2, w] = art.lines.reduce((a, b) => (Math.hypot(b[2] - b[0], b[3] - b[1]) > Math.hypot(a[2] - a[0], a[3] - a[1]) ? b : a));
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    ctx.strokeStyle = finish.accent ?? '#111';
    ctx.lineWidth = Math.max(0.8, w * 0.45);
    if (finish.pattern === 'tiger' || finish.pattern === 'camo') {
      for (let d = 3; d < len - 2; d += finish.pattern === 'tiger' ? 4 : 6) {
        const cx = x1 + ux * d;
        const cy = y1 + uy * d;
        line(cx - uy * w * 0.5, cy + ux * w * 0.5, cx + ux * 1.6 + uy * w * 0.5, cy + uy * 1.6 - ux * w * 0.5);
      }
    } else if (finish.pattern === 'carbon' || finish.pattern === 'digital') {
      ctx.setLineDash(finish.pattern === 'carbon' ? [1, 1] : [2, 2.5]);
      line(x1, y1, x2, y2);
      ctx.setLineDash([]);
    } else if (finish.pattern === 'dots') {
      ctx.fillStyle = finish.accent ?? '#111';
      for (let d = 2.5; d < len - 1; d += 3.2) {
        ctx.beginPath();
        ctx.arc(x1 + ux * d - uy * ((d * 7) % 3 - 1.5) * w * 0.18, y1 + uy * d + ux * ((d * 7) % 3 - 1.5) * w * 0.18, Math.max(0.5, w * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (finish.pattern === 'wave') {
      ctx.beginPath();
      for (let d = 0; d <= len; d += 1) {
        const o = Math.sin(d / 2.2 + t / 300) * w * 0.28;
        const px = x1 + ux * d - uy * o;
        const py = y1 + uy * d + ux * o;
        if (d === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.lineWidth = Math.max(0.6, w * 0.3);
      ctx.stroke();
    } else if (finish.pattern === 'stripe') {
      ctx.lineWidth = Math.max(0.8, w * 0.7);
      for (let d = 2; d < len - 1; d += 5) line(x1 + ux * d, y1 + uy * d, x1 + ux * (d + 2), y1 + uy * (d + 2));
    } else if (finish.pattern === 'fade') {
      // the colour melts into the accent toward the muzzle
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, `${finish.accent ?? '#111'}00`);
      g.addColorStop(1, finish.accent ?? '#111');
      ctx.strokeStyle = g;
      ctx.lineWidth = w * 0.9;
      line(x1 + ux * len * 0.25, y1 + uy * len * 0.25, x2, y2);
    }
    if (finish.fx === 'shimmer' || finish.fx === 'rainbow' || finish.fx === 'galaxy' || finish.fx === 'ice') {
      // a glint sliding along the barrel, and stars for galaxy
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ((t / 700) % 1.6) * len;
      if (g < len) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(x1 + ux * g, y1 + uy * g, w * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (finish.fx === 'galaxy') {
        for (let i = 0; i < 4; i++) {
          const d = ((i * 7 + t / 90) % len);
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t / 110 + i);
          ctx.fillStyle = i % 2 ? '#f0abfc' : '#ffffff';
          ctx.fillRect(x1 + ux * d, y1 + uy * d - 0.5, 1, 1);
        }
      }
      ctx.restore();
    }
    if (finish.fx === 'fire') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const life = (t / 5 + i * 9) % 10;
        ctx.globalAlpha = 0.7 * (1 - life / 10);
        ctx.fillStyle = i % 2 ? '#ffd166' : '#ff5a1f';
        ctx.beginPath();
        ctx.arc(x2 - ux * (i * 3), y2 - life - 1, 1.6 - life / 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
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
  const a = { id: 7, x: 0, y: -FEET, aim, facing: Math.cos(aim) >= 0 ? 1 : -1, phase, moveK, wounds: 0, attackT, w, bluff: 0, outfit: look?.outfit ?? null, body: look?.body ?? 'm', ws: look?.ws ?? null };
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
