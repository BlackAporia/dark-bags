import { CFG, EXTRACT_NAMES } from './config.js';
import { mulberry32, shuffle, rectsOverlap, circleHitsRect } from './geom.js';

const WALL_T = 22;
const DOOR = 100;

function vaultWalls(v, rnd) {
  const sides = shuffle(['n', 's', 'e', 'w'], rnd).slice(0, 2);
  const out = [];
  const hWall = (y, door) => {
    if (!door) return out.push({ x: v.x, y, w: v.w, h: WALL_T });
    const gx = v.x + 60 + Math.floor(rnd() * (v.w - 120 - DOOR));
    out.push({ x: v.x, y, w: gx - v.x, h: WALL_T });
    out.push({ x: gx + DOOR, y, w: v.x + v.w - gx - DOOR, h: WALL_T });
  };
  const vWall = (x, door) => {
    const y0 = v.y + WALL_T;
    const h = v.h - 2 * WALL_T;
    if (!door) return out.push({ x, y: y0, w: WALL_T, h });
    const gy = y0 + 40 + Math.floor(rnd() * (h - 80 - DOOR));
    out.push({ x, y: y0, w: WALL_T, h: gy - y0 });
    out.push({ x, y: gy + DOOR, w: WALL_T, h: y0 + h - gy - DOOR });
  };
  hWall(v.y, sides.includes('n'));
  hWall(v.y + v.h - WALL_T, sides.includes('s'));
  vWall(v.x, sides.includes('w'));
  vWall(v.x + v.w - WALL_T, sides.includes('e'));
  return out.filter((w) => w.w > 0 && w.h > 0);
}

// Procedural raid map. Same seed → same map on every machine.
export function generateMap(seed) {
  const rnd = mulberry32(seed);
  const W = CFG.MAP_W;
  const H = CFG.MAP_H;

  const spots = [
    [170, 170], [W / 2, 130], [W - 170, 170], [W - 130, H / 2],
    [W - 170, H - 170], [W / 2, H - 130], [170, H - 170], [130, H / 2],
  ].map((p, i) => ({ x: p[0], y: p[1], name: EXTRACT_NAMES[i] }));
  const extracts = shuffle(spots, rnd)
    .slice(0, 3)
    .map((s, i) => ({ id: i, x: s.x, y: s.y, r: CFG.EXTRACT_R, name: s.name }));

  // Vaults: walled rooms where chests spawn. High value, few doors, easy to camp.
  const vaults = [];
  for (let tries = 0; vaults.length < 2 && tries < 200; tries++) {
    const wide = rnd() < 0.5;
    const vw = wide ? 360 : 280;
    const vh = wide ? 280 : 360;
    const v = {
      x: Math.floor(560 + rnd() * (W - 1120 - vw)),
      y: Math.floor(560 + rnd() * (H - 1120 - vh)),
      w: vw,
      h: vh,
    };
    if (vaults.some((o) => rectsOverlap(o, v, 320))) continue;
    vaults.push(v);
  }
  const walls = [];
  for (const v of vaults) walls.push(...vaultWalls(v, rnd));

  // Scattered cover.
  for (let tries = 0, placed = 0; placed < 30 && tries < 600; tries++) {
    const kind = rnd();
    let w;
    let h;
    if (kind < 0.4) {
      w = 60 + Math.floor(rnd() * 70);
      h = 60 + Math.floor(rnd() * 70);
    } else if (kind < 0.7) {
      w = 160 + Math.floor(rnd() * 150);
      h = 26 + Math.floor(rnd() * 14);
    } else {
      w = 26 + Math.floor(rnd() * 14);
      h = 160 + Math.floor(rnd() * 150);
    }
    const r = {
      x: Math.floor(110 + rnd() * (W - 220 - w)),
      y: Math.floor(110 + rnd() * (H - 220 - h)),
      w,
      h,
    };
    if (vaults.some((v) => rectsOverlap(v, r, 80))) continue;
    if (walls.some((o) => rectsOverlap(o, r, 70))) continue;
    if (extracts.some((e) => circleHitsRect(e.x, e.y, e.r + 170, r))) continue;
    walls.push(r);
    placed++;
  }

  return { seed, w: W, h: H, walls, vaults, extracts };
}

export function pointFree(map, x, y, r) {
  if (x < r || y < r || x > map.w - r || y > map.h - r) return false;
  for (const w of map.walls) if (circleHitsRect(x, y, r, w)) return false;
  return true;
}

export function inVault(map, x, y, pad = 0) {
  return map.vaults.some((v) => x > v.x - pad && x < v.x + v.w + pad && y > v.y - pad && y < v.y + v.h + pad);
}

// Pick a spawn away from exits, vaults and other runners.
export function findSpawn(map, rnd, others) {
  const r = CFG.PLAYER_R + 6;
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < 80; i++) {
    const x = 90 + rnd() * (map.w - 180);
    const y = 90 + rnd() * (map.h - 180);
    if (!pointFree(map, x, y, r) || inVault(map, x, y, 40)) continue;
    let dExit = Infinity;
    for (const e of map.extracts) dExit = Math.min(dExit, Math.hypot(e.x - x, e.y - y));
    if (dExit < 450) continue;
    let dOther = 2000;
    for (const o of others) dOther = Math.min(dOther, Math.hypot(o.x - x, o.y - y));
    if (dOther > 420) return { x, y };
    if (dOther > bestScore) {
      bestScore = dOther;
      best = { x, y };
    }
  }
  return best || { x: map.w / 2, y: map.h / 2 };
}

export function randomLootPoint(map, rnd, chest) {
  for (let i = 0; i < 60; i++) {
    let x;
    let y;
    if (chest && map.vaults.length) {
      const v = map.vaults[Math.floor(rnd() * map.vaults.length)];
      x = v.x + 50 + rnd() * (v.w - 100);
      y = v.y + 50 + rnd() * (v.h - 100);
    } else {
      x = 60 + rnd() * (map.w - 120);
      y = 60 + rnd() * (map.h - 120);
    }
    if (!pointFree(map, x, y, 16)) continue;
    if (!chest && map.extracts.some((e) => Math.hypot(e.x - x, e.y - y) < e.r + 40)) continue;
    return { x, y };
  }
  return null;
}
