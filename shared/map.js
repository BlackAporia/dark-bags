import { CFG, EXTRACT_NAMES } from './config.js';
import { mulberry32, shuffle, rectsOverlap, circleHitsRect } from './geom.js';

const WALL_T = 22;
const DOOR = 140; // vault doorways: wide enough to find and to run through, even on a phone

function vaultWalls(v, rnd) {
  const sides = shuffle(['n', 's', 'e', 'w'], rnd).slice(0, 2);
  const out = [];
  v.doors = [];
  const hWall = (y, door) => {
    if (!door) return out.push({ x: v.x, y, w: v.w, h: WALL_T });
    const gx = v.x + 60 + Math.floor(rnd() * (v.w - 120 - DOOR));
    v.doors.push({ x: gx, y, w: DOOR, h: WALL_T, out: y === v.y ? 'n' : 's' });
    out.push({ x: v.x, y, w: gx - v.x, h: WALL_T });
    out.push({ x: gx + DOOR, y, w: v.x + v.w - gx - DOOR, h: WALL_T });
  };
  const vWall = (x, door) => {
    const y0 = v.y + WALL_T;
    const h = v.h - 2 * WALL_T;
    if (!door) return out.push({ x, y: y0, w: WALL_T, h });
    const gy = y0 + 40 + Math.floor(rnd() * (h - 80 - DOOR));
    v.doors.push({ x, y: gy, w: WALL_T, h: DOOR, out: x === v.x ? 'w' : 'e' });
    out.push({ x, y: y0, w: WALL_T, h: gy - y0 });
    out.push({ x, y: gy + DOOR, w: WALL_T, h: y0 + h - gy - DOOR });
  };
  hWall(v.y, sides.includes('n'));
  hWall(v.y + v.h - WALL_T, sides.includes('s'));
  vWall(v.x, sides.includes('w'));
  vWall(v.x + v.w - WALL_T, sides.includes('e'));
  return out.filter((w) => w.w > 0 && w.h > 0);
}

// The raid maps: one generator per theme, all seeded, so the same seed and theme give the
// same map on every machine. Every theme keeps the raid's bones (two vaults with doors, three
// exits) and lays its own cover around them. `pits` (lava, water, chasms, quicksand) stop your
// feet but not your bullets or your eyes; walls stop all three.
export const MAP_THEMES = ['docks', 'chain', 'lego', 'dunes', 'snow', 'lava', 'city', 'neon', 'blackout', 'fantasy', 'toon', 'gravity'];

// what stops a runner: walls and pits (kept off the wire: the client rebuilds it)
export function solids(map) {
  if (!map.pits?.length) return map.walls;
  if (!map._solid) Object.defineProperty(map, '_solid', { value: map.walls.concat(map.pits), enumerable: false });
  return map._solid;
}

// the map for a match: the votes in the ready room (null: no preference), or a random theme
export function pickTheme(votes, rnd = Math.random) {
  const n = new Map();
  for (const v of votes) if (MAP_THEMES.includes(v)) n.set(v, (n.get(v) ?? 0) + 1);
  if (!n.size) return MAP_THEMES[Math.floor(rnd() * MAP_THEMES.length)];
  const top = Math.max(...n.values());
  const best = [...n].filter(([, k]) => k === top).map(([v]) => v);
  return best[Math.floor(rnd() * best.length)];
}

export function generateMap(seed, theme = 'docks') {
  if (!MAP_THEMES.includes(theme)) theme = 'docks';
  const rnd = mulberry32(seed ^ (theme === 'docks' ? 0 : hashStr(theme)));
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
  // unlucky draws: the two vaults go to opposite corners of the middle
  if (vaults.length < 2) {
    vaults.length = 0;
    const flip = rnd() < 0.5;
    vaults.push({ x: 560, y: flip ? H - 560 - 280 : 560, w: 360, h: 280 }, { x: W - 560 - 280, y: flip ? 560 : H - 560 - 360, w: 280, h: 360 });
  }
  const walls = [];
  for (const v of vaults) walls.push(...vaultWalls(v, rnd));
  const fixed = walls.length; // the vault walls: never moved by the clean-up below

  const map = { seed, w: W, h: H, walls, vaults, extracts, theme, pits: [] };
  const L = layout(map, rnd);
  (BUILD[theme] ?? BUILD.docks)(L, rnd);
  connect(map, fixed);
  if (!map.pits.length) delete map.pits;
  return map;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// placing cover: inside the fence, off the vaults and exits, with room to run between pieces
function layout(map, rnd) {
  const { w: W, h: H } = map;
  const clear = (r, pad, skip = null) => {
    if (r.x < 100 || r.y < 100 || r.x + r.w > W - 100 || r.y + r.h > H - 100) return false;
    if (map.vaults.some((v) => rectsOverlap(v, r, 80))) return false;
    if (map.extracts.some((e) => circleHitsRect(e.x, e.y, e.r + 150, r))) return false;
    for (const o of map.walls) if (o !== skip && !skip?.includes?.(o) && rectsOverlap(o, r, pad)) return false;
    for (const o of map.pits) if (o !== skip && !skip?.includes?.(o) && rectsOverlap(o, r, pad)) return false;
    return true;
  };
  const wall = (r, pad = 70, kind = null, skip = null) => {
    r = { x: Math.floor(r.x), y: Math.floor(r.y), w: Math.floor(r.w), h: Math.floor(r.h) };
    if (r.w < 8 || r.h < 8 || !clear(r, pad, skip)) return null;
    if (kind) r.k = kind;
    map.walls.push(r);
    return r;
  };
  const pit = (r, pad = 60, kind = null) => {
    r = { x: Math.floor(r.x), y: Math.floor(r.y), w: Math.floor(r.w), h: Math.floor(r.h) };
    if (r.w < 8 || r.h < 8 || !clear(r, pad)) return null;
    if (kind) r.k = kind;
    map.pits.push(r);
    return r;
  };
  const rx = (w) => 110 + rnd() * (W - 220 - w);
  const ry = (h) => 110 + rnd() * (H - 220 - h);
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  // n pieces of make() placed anywhere they fit
  const scatter = (n, make, pad = 70, tries = n * 25) => {
    let k = 0;
    for (let t = 0; k < n && t < tries; t++) {
      const [w, h, kind] = make();
      if (wall({ x: rx(w), y: ry(h), w, h }, pad, kind)) k++;
    }
    return k;
  };
  // a clump: pieces around a centre that may touch each other but keep clear of everything else
  const clump = (cx, cy, parts, pad, kind) => {
    const out = [];
    for (const [ox, oy, w, h] of parts) {
      const r = { x: Math.floor(cx + ox - w / 2), y: Math.floor(cy + oy - h / 2), w: Math.floor(w), h: Math.floor(h) };
      if (!clear(r, pad, out)) continue;
      if (kind) r.k = kind;
      map.walls.push(r);
      out.push(r);
    }
    return out;
  };
  // a river of pits across the map with crossings: vertical or not, wandering a little
  const river = (vertical, kind, width = 70, gaps = 3) => {
    const len = vertical ? H : W;
    const seg = 160;
    let at = (vertical ? W : H) * (0.3 + rnd() * 0.4);
    const n = Math.ceil(len / seg);
    const skip = new Set();
    while (skip.size < gaps) skip.add(1 + Math.floor(rnd() * (n - 2)));
    for (let i = 0; i < n; i++) {
      const next = Math.max(300, Math.min((vertical ? W : H) - 300, at + (rnd() - 0.5) * 120));
      if (!skip.has(i)) {
        const a = vertical ? { x: at - width / 2, y: i * seg, w: width, h: seg } : { x: i * seg, y: at - width / 2, w: seg, h: width };
        // the bend into the next segment
        const lo = Math.min(at, next) - width / 2;
        const b = vertical ? { x: lo, y: (i + 1) * seg - width / 2, w: Math.abs(next - at) + width, h: width } : { x: (i + 1) * seg - width / 2, y: lo, w: width, h: Math.abs(next - at) + width };
        for (const r of [a, b]) {
          const c = { x: Math.max(0, r.x), y: Math.max(0, r.y), w: r.w, h: r.h };
          c.w = Math.min(c.w, W - c.x);
          c.h = Math.min(c.h, H - c.y);
          if (map.vaults.some((v) => rectsOverlap(v, c, 90)) || map.extracts.some((e) => circleHitsRect(e.x, e.y, e.r + 90, c))) continue;
          if (map.walls.some((o) => rectsOverlap(o, c, 40))) continue;
          c.x = Math.floor(c.x);
          c.y = Math.floor(c.y);
          c.w = Math.floor(c.w);
          c.h = Math.floor(c.h);
          c.k = kind;
          map.pits.push(c);
        }
      }
      at = next;
    }
  };
  // four-way (or two-way) mirrored cover, for the arena-style maps
  const mirror = (n, make, pad, ways = 4) => {
    let k = 0;
    for (let t = 0; k < n && t < n * 30; t++) {
      const [w, h, kind] = make();
      const x = 120 + rnd() * (W / 2 - 160 - w);
      const y = 120 + rnd() * ((ways === 4 ? H / 2 : H) - 160 - h);
      const set = [{ x, y }, { x: W - x - w, y }];
      if (ways === 4) set.push({ x, y: H - y - h }, { x: W - x - w, y: H - y - h });
      const rs = set.map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y), w, h, ...(kind ? { k: kind } : {}) }));
      if (!rs.every((r) => clear(r, pad))) continue;
      map.walls.push(...rs);
      k++;
    }
  };
  return { map, W, H, wall, pit, scatter, clump, river, mirror, rx, ry, int, clear };
}

// connected: flood the floor from the middle and knock out the cover that walls off a
// pocket of it, so nobody spawns, loots or gets stuck somewhere they can't leave
function connect(map, fixed) {
  const cell = 24;
  const cols = Math.ceil(map.w / cell);
  const rows = Math.ceil(map.h / cell);
  const r = CFG.PLAYER_R + 2;
  for (let pass = 0; pass < 40; pass++) {
    const solid = map.walls.concat(map.pits);
    const free = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = (i + 0.5) * cell;
        const y = (j + 0.5) * cell;
        if (x < r || y < r || x > map.w - r || y > map.h - r) continue;
        let ok = true;
        for (const w of solid) if (x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h && circleHitsRect(x, y, r, w)) { ok = false; break; }
        free[j * cols + i] = ok ? 1 : 0;
      }
    // components
    const comp = new Int32Array(cols * rows).fill(-1);
    const sizes = [];
    for (let s = 0; s < free.length; s++) {
      if (!free[s] || comp[s] >= 0) continue;
      const id = sizes.length;
      let n = 0;
      const q = [s];
      comp[s] = id;
      while (q.length) {
        const c = q.pop();
        n++;
        const ci = c % cols;
        const cj = (c - ci) / cols;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
          const k = nj * cols + ni;
          if (free[k] && comp[k] < 0) {
            comp[k] = id;
            q.push(k);
          }
        }
      }
      sizes.push(n);
    }
    if (sizes.length <= 1) return;
    const main = sizes.indexOf(Math.max(...sizes));
    // the biggest stray pocket: open it up by removing the movable piece nearest to it
    let worst = -1;
    for (let i = 0; i < sizes.length; i++) if (i !== main && (worst < 0 || sizes[i] > sizes[worst])) worst = i;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let k = 0; k < comp.length; k++)
      if (comp[k] === worst) {
        sx += (k % cols) + 0.5;
        sy += Math.floor(k / cols) + 0.5;
        n++;
      }
    const px = (sx / n) * cell;
    const py = (sy / n) * cell;
    const dist = (w) => Math.hypot(Math.max(w.x - px, 0, px - w.x - w.w), Math.max(w.y - py, 0, py - w.y - w.h));
    let best = null;
    let bd = Infinity;
    let inPits = false;
    for (let i = fixed; i < map.walls.length; i++) if (dist(map.walls[i]) < bd) (bd = dist(map.walls[i])), (best = i), (inPits = false);
    for (let i = 0; i < map.pits.length; i++) if (dist(map.pits[i]) < bd) (bd = dist(map.pits[i])), (best = i), (inPits = true);
    if (best === null) return;
    (inPits ? map.pits : map.walls).splice(best, 1);
  }
}

// ------------------------------------------------------------------ the themes

const BUILD = {
  // the docks: crates, containers and brick runs (the original raid map)
  docks(L, rnd) {
    L.scatter(30, () => {
      const k = rnd();
      if (k < 0.4) return [60 + Math.floor(rnd() * 70), 60 + Math.floor(rnd() * 70)];
      if (k < 0.7) return [160 + Math.floor(rnd() * 150), 26 + Math.floor(rnd() * 14)];
      return [26 + Math.floor(rnd() * 14), 160 + Math.floor(rnd() * 150)];
    });
  },
  // the blockchain: blocks on a lattice, some chained together, and a few mempool pits
  chain(L, rnd) {
    const step = 260;
    const nodes = [];
    for (let y = 230; y < L.H - 200; y += step)
      for (let x = 230; x < L.W - 200; x += step) {
        if (rnd() < 0.42) continue;
        const s = 90 + Math.floor(rnd() * 50);
        const b = L.wall({ x: x - s / 2 + (rnd() - 0.5) * 30, y: y - s / 2 + (rnd() - 0.5) * 30, w: s, h: s }, 90, 'block');
        if (b) nodes.push({ x, y, b });
      }
    // chain links between neighbours on the same row or column
    for (const a of nodes)
      for (const c of nodes) {
        if (rnd() > 0.28) continue;
        if (c.x === a.x + step && c.y === a.y) {
          const y = Math.max(a.b.y, c.b.y) + 20;
          L.wall({ x: a.b.x + a.b.w, y, w: c.b.x - a.b.x - a.b.w, h: 16 }, 50, 'link', [a.b, c.b]);
        } else if (c.y === a.y + step && c.x === a.x) {
          const x = Math.max(a.b.x, c.b.x) + 20;
          L.wall({ x, y: a.b.y + a.b.h, w: 16, h: c.b.y - a.b.y - a.b.h }, 50, 'link', [a.b, c.b]);
        }
      }
    for (let i = 0, t = 0; i < 3 && t < 80; t++) {
      const s = 110 + Math.floor(rnd() * 60);
      if (L.pit({ x: L.rx(s), y: L.ry(s), w: s, h: s }, 90, 'mempool')) i++;
    }
  },
  // the toy box: studded bricks snapped to a grid, some in L shapes
  lego(L, rnd) {
    const G = 40;
    const sizes = [[2, 4], [4, 2], [2, 2], [1, 6], [6, 1], [2, 6], [6, 2], [3, 3], [1, 4], [4, 1]];
    const colors = 6;
    for (let k = 0, t = 0; k < 38 && t < 1200; t++) {
      const [a, b] = sizes[Math.floor(rnd() * sizes.length)];
      const w = a * G;
      const h = b * G;
      const x = Math.round(L.rx(w) / G) * G;
      const y = Math.round(L.ry(h) / G) * G;
      const c = Math.floor(rnd() * colors);
      const r = L.wall({ x, y, w, h }, 80, `brick${c}`);
      if (!r) continue;
      k++;
      // sometimes a second brick on its side, making an L
      if (rnd() < 0.35) {
        const vert = w > h;
        const r2 = vert ? { x: rnd() < 0.5 ? x : x + w - G, y: y + h, w: G, h: 2 * G } : { x: x + w, y: rnd() < 0.5 ? y : y + h - G, w: 2 * G, h: G };
        L.wall(r2, 80, `brick${(c + 2) % colors}`, [r]);
      }
    }
  },
  // the desert: mesas of red rock, cacti and quicksand
  dunes(L, rnd) {
    for (let k = 0, t = 0; k < 9 && t < 300; t++) {
      const cx = L.rx(0) + 60;
      const cy = L.ry(0) + 60;
      const parts = [];
      const n = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) parts.push([(rnd() - 0.5) * 140, (rnd() - 0.5) * 140, 70 + rnd() * 110, 60 + rnd() * 100]);
      if (L.clump(cx, cy, parts, 90, 'mesa').length) k++;
    }
    L.scatter(16, () => [20 + Math.floor(rnd() * 8), 20 + Math.floor(rnd() * 8), 'cactus'], 60);
    for (let i = 0, t = 0; i < 2 && t < 60; t++) if (L.pit({ x: L.rx(180), y: L.ry(130), w: 140 + rnd() * 60, h: 100 + rnd() * 40 }, 90, 'sand')) i++;
  },
  // the tundra: groves of pines, log cabins, ice blocks and holes in the ice
  snow(L, rnd) {
    for (let k = 0, t = 0; k < 10 && t < 300; t++) {
      const parts = [];
      const n = 3 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) {
        const s = 34 + rnd() * 14;
        parts.push([(rnd() - 0.5) * 220, (rnd() - 0.5) * 220, s, s]);
      }
      // pines keep a gap between them a runner can slip through
      const before = L.map.walls.length;
      const cx = L.rx(0) + 60;
      const cy = L.ry(0) + 60;
      for (const [ox, oy, w, h] of parts) L.wall({ x: cx + ox - w / 2, y: cy + oy - h / 2, w, h }, 48, 'pine');
      if (L.map.walls.length > before) k++;
    }
    L.scatter(4, () => (rnd() < 0.5 ? [150, 100, 'cabin'] : [100, 150, 'cabin']), 90);
    L.scatter(8, () => [50 + Math.floor(rnd() * 40), 50 + Math.floor(rnd() * 40), 'ice'], 70);
    for (let i = 0, t = 0; i < 3 && t < 80; t++) if (L.pit({ x: L.rx(160), y: L.ry(160), w: 110 + rnd() * 70, h: 90 + rnd() * 70 }, 80, 'water')) i++;
  },
  // the forge: rivers of lava with rock bridges, obsidian boulders
  lava(L, rnd) {
    L.river(rnd() < 0.5, 'lava', 72, 2);
    if (rnd() < 0.6) L.river(rnd() < 0.5, 'lava', 60, 2);
    L.scatter(26, () => {
      const k = rnd();
      if (k < 0.6) return [60 + Math.floor(rnd() * 80), 60 + Math.floor(rnd() * 80), 'obsidian'];
      return k < 0.8 ? [150 + Math.floor(rnd() * 120), 34, 'obsidian'] : [34, 150 + Math.floor(rnd() * 120), 'obsidian'];
    }, 75);
  },
  // downtown: city blocks on a street grid, alleys, parked cars
  city(L, rnd) {
    const cellW = 400;
    const street = 140;
    const roads = [];
    for (let x = 100 + cellW; x < L.W - 200; x += cellW) roads.push({ vertical: true, at: x - street / 2 + 70, w: street });
    for (let y = 100 + cellW; y < L.H - 200; y += cellW) roads.push({ vertical: false, at: y - street / 2 + 70, w: street });
    L.map.roads = roads;
    for (let y = 100; y < L.H - 200; y += cellW)
      for (let x = 100; x < L.W - 200; x += cellW) {
        if (rnd() < 0.18) continue; // a square or a car park
        const bw = cellW - street - Math.floor(rnd() * 60);
        const bh = cellW - street - Math.floor(rnd() * 60);
        const ox = x + 20 + rnd() * (cellW - street - bw);
        const oy = y + 20 + rnd() * (cellW - street - bh);
        if (rnd() < 0.45) {
          // two buildings with an alley between
          const vert = rnd() < 0.5;
          const gap = 70;
          const a = vert ? { x: ox, y: oy, w: (bw - gap) / 2, h: bh } : { x: ox, y: oy, w: bw, h: (bh - gap) / 2 };
          const b = vert ? { x: ox + (bw + gap) / 2, y: oy, w: (bw - gap) / 2, h: bh } : { x: ox, y: oy + (bh + gap) / 2, w: bw, h: (bh - gap) / 2 };
          L.wall(a, 60, `bld${Math.floor(rnd() * 4)}`);
          L.wall(b, 60, `bld${Math.floor(rnd() * 4)}`);
        } else L.wall({ x: ox, y: oy, w: bw, h: bh }, 60, `bld${Math.floor(rnd() * 4)}`);
      }
    // cars parked along the streets
    for (let i = 0, t = 0; i < 12 && t < 200; t++) {
      const r = roads[Math.floor(rnd() * roads.length)];
      const along = 200 + rnd() * ((r.vertical ? L.H : L.W) - 400);
      const side = (rnd() < 0.5 ? -1 : 1) * 36;
      const c = r.vertical ? { x: r.at + side - 17, y: along, w: 34, h: 70 } : { x: along, y: r.at + side - 17, w: 70, h: 34 };
      if (L.wall(c, 50, `car${Math.floor(rnd() * 5)}`)) i++;
    }
  },
  // the arcade: a mirrored neon arena, glowing pillars and light bars
  neon(L, rnd) {
    L.mirror(9, () => {
      const k = rnd();
      if (k < 0.45) return [50 + Math.floor(rnd() * 50), 50 + Math.floor(rnd() * 50), 'pillar'];
      return k < 0.75 ? [140 + Math.floor(rnd() * 120), 24, 'bar'] : [24, 140 + Math.floor(rnd() * 120), 'bar'];
    }, 80);
  },
  // the blackout: a dead forest at night, fallen logs and ruins
  blackout(L, rnd) {
    L.scatter(60, () => {
      const s = 26 + Math.floor(rnd() * 26);
      return [s, s, 'tree'];
    }, 52);
    L.scatter(8, () => (rnd() < 0.5 ? [150 + Math.floor(rnd() * 80), 26, 'log'] : [26, 150 + Math.floor(rnd() * 80), 'log']), 70);
    L.scatter(5, () => [90 + Math.floor(rnd() * 60), 90 + Math.floor(rnd() * 60), 'ruin'], 90);
  },
  // the realm: towers and castle walls with gates, a moat, and old trees
  fantasy(L, rnd) {
    // a castle around each vault: four corner towers, curtain walls, a gate in every side
    for (const v of L.map.vaults) {
      const m = 190 + Math.floor(rnd() * 40);
      const ring = { x: v.x - m, y: v.y - m, w: v.w + 2 * m, h: v.h + 2 * m };
      const T = 96;
      const towers = [];
      for (const [px, py] of [[ring.x, ring.y], [ring.x + ring.w, ring.y], [ring.x, ring.y + ring.h], [ring.x + ring.w, ring.y + ring.h]]) {
        const r = L.wall({ x: px - T / 2, y: py - T / 2, w: T, h: T }, 40, 'tower');
        if (r) towers.push(r);
      }
      const gate = 170;
      const side = (x0, y0, len, horiz) => {
        const g0 = T / 2 + 30 + rnd() * (len - T - 60 - gate);
        const parts = horiz
          ? [{ x: x0 + T / 2, y: y0 - 12, w: g0 - T / 2, h: 24 }, { x: x0 + g0 + gate, y: y0 - 12, w: len - T / 2 - g0 - gate, h: 24 }]
          : [{ x: x0 - 12, y: y0 + T / 2, w: 24, h: g0 - T / 2 }, { x: x0 - 12, y: y0 + g0 + gate, w: 24, h: len - T / 2 - g0 - gate }];
        for (const r of parts) L.wall(r, 40, 'cwall', towers);
      };
      side(ring.x, ring.y, ring.w, true);
      side(ring.x, ring.y + ring.h, ring.w, true);
      side(ring.x, ring.y, ring.h, false);
      side(ring.x + ring.w, ring.y, ring.h, false);
    }
    L.river(rnd() < 0.5, 'moat', 64, 3);
    L.scatter(10, () => (rnd() < 0.5 ? [220 + Math.floor(rnd() * 120), 24, 'cwall'] : [24, 220 + Math.floor(rnd() * 120), 'cwall']), 90);
    L.scatter(26, () => {
      const s = 34 + Math.floor(rnd() * 20);
      return [s, s, 'oak'];
    }, 60);
  },
  // the cartoon: candy-coloured blobs, mushrooms and gift boxes, mirrored left to right
  toon(L, rnd) {
    L.mirror(14, () => {
      const k = rnd();
      if (k < 0.35) return [44 + Math.floor(rnd() * 30), 44 + Math.floor(rnd() * 30), 'shroom'];
      if (k < 0.65) return [70 + Math.floor(rnd() * 60), 60 + Math.floor(rnd() * 50), 'gift'];
      return rnd() < 0.5 ? [150 + Math.floor(rnd() * 90), 40, 'candy'] : [40, 150 + Math.floor(rnd() * 90), 'candy'];
    }, 80, 2);
    for (let i = 0, t = 0; i < 2 && t < 60; t++) if (L.pit({ x: L.rx(150), y: L.ry(120), w: 120 + rnd() * 50, h: 90 + rnd() * 40 }, 90, 'jelly')) i++;
  },
  // the track: a motocross loop with ramps, tyre stacks and hay bales, and a mud pit in the
  // infield (in the line-drawn style of the old phone bike games)
  gravity(L, rnd) {
    const cx = L.W / 2;
    const cy = L.H / 2;
    L.map.track = { cx, cy, rx: L.W * 0.34, ry: L.H * 0.3, w: 150 };
    const tr = L.map.track;
    // ramps across the lane, every so often around the loop
    for (let a = rnd() * 0.5; a < Math.PI * 2; a += 0.55 + rnd() * 0.3) {
      const x = cx + Math.cos(a) * tr.rx;
      const y = cy + Math.sin(a) * tr.ry;
      const along = Math.abs(Math.sin(a)) > 0.7; // on the sides the lane runs up and down
      const r = along ? { x: x - 55, y: y - 22, w: 110, h: 44 } : { x: x - 22, y: y - 55, w: 44, h: 110 };
      L.wall(r, 70, 'ramp');
    }
    L.scatter(18, () => [34, 34, 'tyres'], 60);
    L.scatter(10, () => (rnd() < 0.5 ? [90, 44, 'hay'] : [44, 90, 'hay']), 70);
    for (let t = 0; t < 40 && !L.pit({ x: cx - 120 + (rnd() - 0.5) * 700, y: cy - 70 + (rnd() - 0.5) * 600, w: 200 + rnd() * 60, h: 120 + rnd() * 40 }, 80, 'mud'); t++);
  },
};

export function pointFree(map, x, y, r) {
  if (x < r || y < r || x > map.w - r || y > map.h - r) return false;
  for (const w of solids(map)) if (circleHitsRect(x, y, r, w)) return false;
  return true;
}

export function inVault(map, x, y, pad = 0) {
  return map.vaults.some((v) => x > v.x - pad && x < v.x + v.w + pad && y > v.y - pad && y < v.y + v.h + pad);
}

// Pick a spawn away from exits, vaults and other runners, inside the safe circle.
export function findSpawn(map, rnd, others, circle = null) {
  const r = CFG.PLAYER_R + 6;
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < 120; i++) {
    let x;
    let y;
    if (circle) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * circle.r * 0.8;
      x = circle.x + Math.cos(a) * d;
      y = circle.y + Math.sin(a) * d;
    } else {
      x = 90 + rnd() * (map.w - 180);
      y = 90 + rnd() * (map.h - 180);
    }
    if (x < 90 || y < 90 || x > map.w - 90 || y > map.h - 90) continue;
    if (!pointFree(map, x, y, r) || inVault(map, x, y, 40)) continue;
    let dExit = Infinity;
    for (const e of map.extracts) dExit = Math.min(dExit, Math.hypot(e.x - x, e.y - y));
    if (dExit < 400) continue;
    let dOther = 2000;
    for (const o of others) dOther = Math.min(dOther, Math.hypot(o.x - x, o.y - y));
    if (dOther > 420) return { x, y };
    if (dOther > bestScore) {
      bestScore = dOther;
      best = { x, y };
    }
  }
  return best || { x: circle ? circle.x : map.w / 2, y: circle ? circle.y : map.h / 2 };
}

// circle: loot only lands inside it (the storm's next circle)
export function randomLootPoint(map, rnd, chest, circle = null) {
  const vaults = circle ? map.vaults.filter((v) => Math.hypot(v.x + v.w / 2 - circle.x, v.y + v.h / 2 - circle.y) < circle.r - 60) : map.vaults;
  if (chest && !vaults.length) return null;
  for (let i = 0; i < 60; i++) {
    let x;
    let y;
    if (chest) {
      const v = vaults[Math.floor(rnd() * vaults.length)];
      x = v.x + 50 + rnd() * (v.w - 100);
      y = v.y + 50 + rnd() * (v.h - 100);
    } else if (circle) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * (circle.r - 30);
      x = circle.x + Math.cos(a) * d;
      y = circle.y + Math.sin(a) * d;
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

// Arenas for the side modes: smaller, no vaults and no exits.
//   graveyard (zombies): an open plaza in the middle to make a stand in, rows of
//     headstones and a few crypts around it, and eight broken gates in the fence
//     where the dead climb in.
//   mine (gold rush): a quarry of rock piles, ore carts and timber sheds, with open
//     ground between them for the gold to land on.
export const ARENA = 2000;
export function generateArena(seed, theme) {
  const rnd = mulberry32(seed ^ 0xa11e);
  const W = ARENA;
  const H = ARENA;
  const walls = [];
  const cx = W / 2;
  const cy = H / 2;
  const clearOf = (r, pad) => !walls.some((o) => rectsOverlap(o, r, pad));
  const add = (r, pad = 40, keepOut = 0) => {
    if (keepOut && circleHitsRect(cx, cy, keepOut, r)) return false;
    if (r.x < 90 || r.y < 90 || r.x + r.w > W - 90 || r.y + r.h > H - 90) return false;
    if (!clearOf(r, pad)) return false;
    walls.push(r);
    return true;
  };
  const gates = [
    [W / 2, 40], [W - 40, H / 2], [W / 2, H - 40], [40, H / 2],
    [180, 180], [W - 180, 180], [W - 180, H - 180], [180, H - 180],
  ].map(([x, y], id) => ({ id, x, y }));
  if (theme === 'graveyard') {
    // crypts: big blocks with room around them
    for (let i = 0, t = 0; i < 6 && t < 200; t++) {
      const w = 110 + Math.floor(rnd() * 70);
      const h = 80 + Math.floor(rnd() * 50);
      if (add({ x: Math.floor(160 + rnd() * (W - 320 - w)), y: Math.floor(160 + rnd() * (H - 320 - h)), w, h }, 120, 340)) i++;
    }
    // rows of headstones: thin and short, so the dead weave between them
    for (let i = 0, t = 0; i < 46 && t < 900; t++) {
      const w = 24 + Math.floor(rnd() * 12);
      const h = 34 + Math.floor(rnd() * 12);
      if (add({ x: Math.floor(140 + rnd() * (W - 280 - w)), y: Math.floor(140 + rnd() * (H - 280 - h)), w, h }, 70, 300)) i++;
    }
    // low cemetery walls around the plaza, broken in four places
    for (const [x, y, w, h] of [[cx - 260, cy - 300, 170, 24], [cx + 90, cy - 300, 170, 24], [cx - 260, cy + 276, 170, 24], [cx + 90, cy + 276, 170, 24]]) add({ x, y, w, h }, 10);
  } else {
    // rock piles, ore carts and sheds of every size
    for (let i = 0, t = 0; i < 34 && t < 900; t++) {
      const k = rnd();
      const w = k < 0.5 ? 60 + Math.floor(rnd() * 80) : k < 0.75 ? 150 + Math.floor(rnd() * 120) : 28 + Math.floor(rnd() * 10);
      const h = k < 0.5 ? 60 + Math.floor(rnd() * 80) : k < 0.75 ? 28 + Math.floor(rnd() * 10) : 150 + Math.floor(rnd() * 120);
      if (add({ x: Math.floor(120 + rnd() * (W - 240 - w)), y: Math.floor(120 + rnd() * (H - 240 - h)), w, h }, 90)) i++;
    }
  }
  return { seed, w: W, h: H, walls, vaults: [], extracts: [], gates, theme };
}
