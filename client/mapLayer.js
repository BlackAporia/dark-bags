// Static map layer: floor, vault plating, decals, exit pads, fence and walls,
// rendered once into cached chunks at the current zoom. Per frame we only blit
// the visible chunks, which is what keeps the textured map cheap.
import { mulberry32, rectsOverlap } from '../shared/geom.js';
import { textures, pattern, shade, canvas, TEX_SCALE } from './textures.js';
import { THEME, floorTex, drawThemeWall, drawPit, drawUnder, drawGroundBits } from './themes.js';

const ARENA_THEMES = new Set(['graveyard', 'mine']);
const ROUND = new Set(['tree', 'pine', 'cactus', 'shroom', 'tyres', 'oak', 'log', 'candy', 'gift', 'mesa', 'ice', 'car', 'hay', 'brick', 'link']);

export const CHUNK = 400;
const PAD = 2; // chunks overlap slightly so no seams show between them

function hazardPattern(ctx) {
  const S = 32 * TEX_SCALE;
  const c = canvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#1a1712';
  x.fillRect(0, 0, S, S);
  x.fillStyle = '#c9a227';
  for (let i = -S; i < S * 2; i += S / 2) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + S / 4, 0);
    x.lineTo(i + S / 4 - S, S);
    x.lineTo(i - S, S);
    x.closePath();
    x.fill();
  }
  return pattern(ctx, c);
}

// Decide what each wall looks like. Shape drives the kind, so a crate always
// reads as a crate and a long bar as a container or a wall.
function classifyWalls(map) {
  const rnd = mulberry32(map.seed ^ 0x51ed);
  // the arenas: a graveyard of headstones, crypts and low walls; a quarry of rock and timber
  if (map.theme === 'graveyard')
    return map.walls.map((w) => {
      if (Math.max(w.w, w.h) <= 50) return { kind: 'grave', c: Math.floor(rnd() * 3) };
      if (Math.min(w.w, w.h) <= 26) return { kind: 'lowwall' };
      return { kind: 'crypt' };
    });
  if (map.theme === 'mine')
    return map.walls.map((w) => {
      const long = Math.max(w.w, w.h) / Math.min(w.w, w.h) > 2.5;
      return long ? { kind: rnd() < 0.5 ? 'timber' : 'crate' } : { kind: 'rock', c: Math.floor(rnd() * 3) };
    });
  return map.walls.map((w) => {
    if (w.k) return { kind: w.k, themed: true };
    const inVault = map.vaults.some((v) => rectsOverlap(v, w, 1) && (w.w <= 24 || w.h <= 24));
    if (inVault) return { kind: 'steel' };
    const long = Math.max(w.w, w.h) / Math.min(w.w, w.h) > 2.5;
    if (long) return rnd() < 0.55 ? { kind: 'container', c: Math.floor(rnd() * 4) } : { kind: rnd() < 0.5 ? 'brick' : 'cinder' };
    return rnd() < 0.6 ? { kind: 'crate' } : { kind: 'cinder' };
  });
}

// A few painted "roads" crossing the map, fixed per map.
function planRoads(map) {
  if (map.theme && map.theme !== 'docks') return []; // the other maps have streets (or none) of their own
  const rnd = mulberry32(map.seed ^ 0x70ad);
  const roads = [];
  for (let i = 0; i < 2; i++) roads.push({ vertical: true, at: 300 + rnd() * (map.w - 600), w: 110 });
  for (let i = 0; i < 2; i++) roads.push({ vertical: false, at: 300 + rnd() * (map.h - 600), w: 110 });
  return roads;
}

export class MapLayer {
  constructor() {
    this.map = null;
    this.cache = new Map();
    this.res = 1;
    this.hq = true;
  }

  setMap(map) {
    if (this.map === map) return;
    this.map = map;
    this.cache.clear();
    this.kinds = classifyWalls(map);
    this.roads = planRoads(map);
  }

  setRes(res, hq) {
    if (res !== this.res || hq !== this.hq) {
      this.res = res;
      this.hq = hq;
      this.cache.clear();
    }
  }

  chunkRange(vb) {
    const maxX = Math.ceil(this.map.w / CHUNK);
    const maxY = Math.ceil(this.map.h / CHUNK);
    return {
      c0: Math.max(-1, Math.floor(vb.x0 / CHUNK)),
      c1: Math.min(maxX, Math.floor(vb.x1 / CHUNK)),
      r0: Math.max(-1, Math.floor(vb.y0 / CHUNK)),
      r1: Math.min(maxY, Math.floor(vb.y1 / CHUNK)),
    };
  }

  // ctx has the world transform applied. Builds at most `budget` missing chunks.
  draw(ctx, vb, budget = 2) {
    if (!this.map) return;
    const { c0, c1, r0, r1 } = this.chunkRange(vb);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const key = `${cx},${cy}`;
        let ch = this.cache.get(key);
        if (ch) {
          this.cache.delete(key);
          this.cache.set(key, ch); // LRU touch
        } else if (budget > 0) {
          ch = this.build(cx, cy);
          this.cache.set(key, ch);
          budget--;
        }
        if (ch) ctx.drawImage(ch, cx * CHUNK - PAD, cy * CHUNK - PAD, CHUNK + PAD * 2, CHUNK + PAD * 2);
        else {
          ctx.fillStyle = '#161b25';
          ctx.fillRect(cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
        }
      }
    }
    while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
  }

  prewarm(x, y, radius) {
    if (!this.map) return;
    const { c0, c1, r0, r1 } = this.chunkRange({ x0: x - radius, x1: x + radius, y0: y - radius, y1: y + radius });
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const key = `${cx},${cy}`;
        if (!this.cache.has(key)) this.cache.set(key, this.build(cx, cy));
      }
    }
  }

  build(cx, cy) {
    const map = this.map;
    const tex = textures();
    const res = this.res;
    const size = Math.ceil((CHUNK + PAD * 2) * res);
    const c = canvas(size, size);
    const x = c.getContext('2d');
    const x0 = cx * CHUNK - PAD;
    const y0 = cy * CHUNK - PAD;
    x.scale(res, res);
    x.translate(-x0, -y0);
    const view = { x: x0, y: y0, w: CHUNK + PAD * 2, h: CHUNK + PAD * 2 };
    const near = (r, pad = 0) => rectsOverlap(r, view, pad);

    // outside the fence
    x.fillStyle = '#07090f';
    x.fillRect(x0, y0, view.w, view.h);

    // floor
    const th = THEME[map.theme];
    x.fillStyle = pattern(x, floorTex(map.theme) ?? tex.concrete);
    x.fillRect(0, 0, map.w, map.h);
    if (th) drawUnder(map.theme, x, map, near);

    // roads: darker asphalt with worn dashed centre lines
    for (const r of this.roads) {
      const rect = r.vertical ? { x: r.at - r.w / 2, y: 0, w: r.w, h: map.h } : { x: 0, y: r.at - r.w / 2, w: map.w, h: r.w };
      if (!near(rect)) continue;
      x.fillStyle = 'rgba(5, 7, 11, 0.35)';
      x.fillRect(rect.x, rect.y, rect.w, rect.h);
      x.strokeStyle = 'rgba(201, 162, 39, 0.28)';
      x.lineWidth = 4;
      x.setLineDash([36, 28]);
      x.beginPath();
      if (r.vertical) {
        x.moveTo(r.at, 0);
        x.lineTo(r.at, map.h);
      } else {
        x.moveTo(0, r.at);
        x.lineTo(map.w, r.at);
      }
      x.stroke();
      x.setLineDash([]);
      x.strokeStyle = 'rgba(235, 229, 214, 0.06)';
      x.lineWidth = 3;
      x.strokeRect(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8);
    }

    // decals, seeded per chunk (flat paint and dirt only: nothing here looks solid)
    const rnd = mulberry32((map.seed * 131 + cx * 7919 + cy * 104729) >>> 0);
    const inMap = (px, py) => px > 20 && py > 20 && px < map.w - 20 && py < map.h - 20;
    if (ARENA_THEMES.has(map.theme)) this.arenaGround(x, map, cx, cy, rnd, inMap, near);
    else if (th) {
      const at = () => {
        const px = cx * CHUNK + rnd() * CHUNK;
        const py = cy * CHUNK + rnd() * CHUNK;
        return inMap(px, py) ? [px, py] : [null, null];
      };
      drawGroundBits(map.theme, x, 3 + Math.floor(rnd() * 4), at, rnd);
    } else this.cityDecals(x, map, cx, cy, rnd, inMap);
    // vault floors, exits, the fence and the walls
    this.buildRest(x, map, near, view, tex);
    return c;
  }

  // the graveyard: dark grass, a cobbled plaza in the middle, bones and wilted flowers, and the
  // broken gates the dead come through. The quarry: dust, ore glints and cart rails.
  arenaGround(x, map, cx, cy, rnd, inMap, near) {
    const grave = map.theme === 'graveyard';
    x.fillStyle = grave ? 'rgba(18, 38, 22, 0.62)' : 'rgba(118, 78, 34, 0.42)';
    x.fillRect(0, 0, map.w, map.h);
    const mx = map.w / 2;
    const my = map.h / 2;
    if (grave && near({ x: mx - 280, y: my - 280, w: 560, h: 560 })) {
      const g = x.createRadialGradient(mx, my, 40, mx, my, 270);
      g.addColorStop(0, 'rgba(150, 150, 140, 0.22)');
      g.addColorStop(0.85, 'rgba(120, 120, 110, 0.16)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(mx, my, 270, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(200, 200, 190, 0.08)';
      x.lineWidth = 2;
      for (let r = 60; r < 260; r += 40) {
        x.beginPath();
        x.arc(mx, my, r, 0, Math.PI * 2);
        x.stroke();
      }
    }
    if (!grave) {
      // rails between the sheds
      for (const [vert, at] of [[true, map.w * 0.3], [false, map.h * 0.62]]) {
        const rect = vert ? { x: at - 20, y: 0, w: 40, h: map.h } : { x: 0, y: at - 20, w: map.w, h: 40 };
        if (!near(rect)) continue;
        x.strokeStyle = 'rgba(70, 50, 30, 0.9)';
        x.lineWidth = 6;
        for (let k = -10; k < (vert ? map.h : map.w); k += 22) {
          x.beginPath();
          if (vert) {
            x.moveTo(at - 16, k);
            x.lineTo(at + 16, k);
          } else {
            x.moveTo(k, at - 16);
            x.lineTo(k, at + 16);
          }
          x.stroke();
        }
        x.strokeStyle = 'rgba(160, 165, 175, 0.55)';
        x.lineWidth = 3;
        x.beginPath();
        for (const o of [-10, 10]) {
          if (vert) {
            x.moveTo(at + o, 0);
            x.lineTo(at + o, map.h);
          } else {
            x.moveTo(0, at + o);
            x.lineTo(map.w, at + o);
          }
        }
        x.stroke();
      }
    }
    const n = 10 + Math.floor(rnd() * 8);
    for (let i = 0; i < n; i++) {
      const px = cx * CHUNK + rnd() * CHUNK;
      const py = cy * CHUNK + rnd() * CHUNK;
      if (!inMap(px, py)) continue;
      const kind = rnd();
      if (grave) {
        if (kind < 0.6) {
          // a tuft of dead grass
          x.strokeStyle = `rgba(${70 + rnd() * 40}, ${100 + rnd() * 40}, 60, 0.5)`;
          x.lineWidth = 1.5;
          x.beginPath();
          for (let b = 0; b < 5; b++) {
            x.moveTo(px + b * 2 - 4, py);
            x.lineTo(px + b * 2 - 4 + (rnd() - 0.5) * 6, py - 5 - rnd() * 6);
          }
          x.stroke();
        } else if (kind < 0.8) {
          // a bone
          x.strokeStyle = 'rgba(225, 220, 200, 0.45)';
          x.lineWidth = 3;
          const a = rnd() * Math.PI;
          x.beginPath();
          x.moveTo(px - Math.cos(a) * 7, py - Math.sin(a) * 7);
          x.lineTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7);
          x.stroke();
        } else {
          // a fresh mound of earth
          x.fillStyle = 'rgba(40, 28, 18, 0.55)';
          x.beginPath();
          x.ellipse(px, py, 22, 11, rnd() * 0.4, 0, Math.PI * 2);
          x.fill();
        }
      } else if (kind < 0.55) {
        // a fleck of ore
        x.fillStyle = `rgba(255, ${190 + rnd() * 50}, 80, ${0.35 + rnd() * 0.3})`;
        x.fillRect(px, py, 2 + rnd() * 3, 2 + rnd() * 2);
      } else {
        // pale dust
        const r = 20 + rnd() * 30;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(210, 170, 110, 0.18)');
        g.addColorStop(1, 'rgba(210, 170, 110, 0)');
        x.fillStyle = g;
        x.beginPath();
        x.arc(px, py, r, 0, Math.PI * 2);
        x.fill();
      }
    }
    // the gates: torn fence and a stain of light where the dead climb through
    for (const gt of map.gates ?? []) {
      if (!grave || !near({ x: gt.x - 70, y: gt.y - 70, w: 140, h: 140 })) continue;
      const g = x.createRadialGradient(gt.x, gt.y, 5, gt.x, gt.y, 90);
      g.addColorStop(0, 'rgba(120, 255, 120, 0.22)');
      g.addColorStop(1, 'rgba(120, 255, 120, 0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(gt.x, gt.y, 90, 0, Math.PI * 2);
      x.fill();
    }
  }

  cityDecals(x, map, cx, cy, rnd, inMap) {
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const px = cx * CHUNK + rnd() * CHUNK;
      const py = cy * CHUNK + rnd() * CHUNK;
      if (!inMap(px, py)) continue;
      const kind = rnd();
      if (kind < 0.45) {
        // oil stain
        const r = 18 + rnd() * 34;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(0,0,0,0.45)');
        g.addColorStop(0.7, 'rgba(0,0,0,0.2)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.beginPath();
        x.ellipse(px, py, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
        x.fill();
      } else if (kind < 0.65) {
        // puddle with a cold sheen
        const r = 20 + rnd() * 30;
        x.fillStyle = 'rgba(12, 18, 30, 0.7)';
        x.beginPath();
        x.ellipse(px, py, r, r * 0.55, rnd() * 3, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = 'rgba(120, 160, 220, 0.12)';
        x.lineWidth = 2;
        x.beginPath();
        x.ellipse(px - r * 0.2, py - r * 0.1, r * 0.5, r * 0.2, 0.3, 3.6, 5.2);
        x.stroke();
      } else if (kind < 0.8) {
        // manhole cover
        x.fillStyle = '#0f1218';
        x.beginPath();
        x.arc(px, py, 20, 0, Math.PI * 2);
        x.fill();
        x.strokeStyle = '#2c313c';
        x.lineWidth = 3;
        x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.06)';
        x.lineWidth = 1.5;
        for (let k = -12; k <= 12; k += 6) {
          x.beginPath();
          x.moveTo(px - 14, py + k);
          x.lineTo(px + 14, py + k);
          x.stroke();
        }
      } else {
        // painted arrow, faded
        x.save();
        x.translate(px, py);
        x.rotate(Math.floor(rnd() * 4) * (Math.PI / 2));
        x.fillStyle = 'rgba(235, 229, 214, 0.07)';
        x.beginPath();
        x.moveTo(-8, 22);
        x.lineTo(8, 22);
        x.lineTo(8, -2);
        x.lineTo(18, -2);
        x.lineTo(0, -24);
        x.lineTo(-18, -2);
        x.lineTo(-8, -2);
        x.closePath();
        x.fill();
        x.restore();
      }
    }
    // gravel
    x.fillStyle = 'rgba(160, 170, 190, 0.08)';
    for (let i = 0; i < 40; i++) x.fillRect(cx * CHUNK + rnd() * CHUNK, cy * CHUNK + rnd() * CHUNK, 2 + rnd() * 3, 2 + rnd() * 2);
  }

  buildRest(x, map, near, view, tex) {

    // vault floors + hazard striping that only shows in the doorways
    for (const v of map.vaults) {
      if (!near(v, 30)) continue;
      x.fillStyle = pattern(x, tex.plate);
      x.fillRect(v.x, v.y, v.w, v.h);
      const g = x.createRadialGradient(v.x + v.w / 2, v.y + v.h / 2, 20, v.x + v.w / 2, v.y + v.h / 2, Math.max(v.w, v.h) * 0.7);
      g.addColorStop(0, 'rgba(247,147,26,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      x.fillStyle = g;
      x.fillRect(v.x, v.y, v.w, v.h);
      if (THEME[map.theme]?.vault) {
        x.fillStyle = THEME[map.theme].vault;
        x.fillRect(v.x, v.y, v.w, v.h);
      }
      x.strokeStyle = hazardPattern(x);
      x.lineWidth = 22;
      x.strokeRect(v.x + 11, v.y + 11, v.w - 22, v.h - 22);
      x.fillStyle = 'rgba(247, 147, 26, 0.08)';
      x.font = '900 64px "Big Shoulders Stencil Display", Impact, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('VAULT', v.x + v.w / 2, v.y + v.h / 2);
      // the way out: a lit threshold and chevrons pointing outside in every doorway
      for (const d of v.doors ?? []) {
        const horiz = d.out === 'n' || d.out === 's';
        const cx = d.x + d.w / 2;
        const cy = d.y + d.h / 2;
        const lg = horiz ? x.createLinearGradient(d.x, cy, d.x + d.w, cy) : x.createLinearGradient(cx, d.y, cx, d.y + d.h);
        lg.addColorStop(0, 'rgba(61,220,151,0)');
        lg.addColorStop(0.5, 'rgba(61,220,151,0.35)');
        lg.addColorStop(1, 'rgba(61,220,151,0)');
        x.fillStyle = lg;
        x.fillRect(d.x - (horiz ? 0 : 6), d.y - (horiz ? 6 : 0), d.w + (horiz ? 0 : 12), d.h + (horiz ? 12 : 0));
        const dir = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[d.out];
        x.strokeStyle = 'rgba(61,220,151,0.75)';
        x.lineWidth = 4;
        x.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          const ox = cx - dir[0] * (26 - k * 14);
          const oy = cy - dir[1] * (26 - k * 14);
          x.beginPath();
          x.moveTo(ox - dir[0] * 7 + dir[1] * 12, oy - dir[1] * 7 + dir[0] * 12);
          x.lineTo(ox + dir[0] * 5, oy + dir[1] * 5);
          x.lineTo(ox - dir[0] * 7 - dir[1] * 12, oy - dir[1] * 7 - dir[0] * 12);
          x.stroke();
        }
      }
    }

    // pits: lava, water, mud… (under the walls, over the floor)
    for (const r of map.pits ?? []) {
      if (!near(r, 20)) continue;
      x.save();
      const edge = drawPit(x, r, map.seed);
      x.restore();
      if (edge) {
        x.strokeStyle = edge;
        x.lineWidth = 2;
        x.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
    }

    // exit pads (static paint; state colours are drawn live on top)
    for (const e of map.extracts) {
      if (!near({ x: e.x - e.r, y: e.y - e.r, w: e.r * 2, h: e.r * 2 }, 10)) continue;
      x.fillStyle = 'rgba(8, 12, 12, 0.6)';
      x.beginPath();
      x.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = hazardPattern(x);
      x.lineWidth = 8;
      x.beginPath();
      x.arc(e.x, e.y, e.r - 4, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = 'rgba(235, 229, 214, 0.1)';
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        x.save();
        x.translate(e.x + Math.cos(a) * e.r * 0.55, e.y + Math.sin(a) * e.r * 0.55);
        x.rotate(a + Math.PI);
        x.beginPath();
        x.moveTo(8, 0);
        x.lineTo(-6, -9);
        x.lineTo(-6, 9);
        x.closePath();
        x.fill();
        x.restore();
      }
      x.font = '900 26px "Big Shoulders Stencil Display", Impact, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('EXIT', e.x, e.y);
    }

    // perimeter fence (outside the playable edge, flush with where runners stop)
    this.drawFence(x, view);

    // walls: drop shadow first, then textured bodies with bevels
    const all = map.walls.map((w, i) => [w, this.kinds[i]]).filter(([w]) => near(w, 30));
    // round things (trees, mushrooms, tyres…) cast their own soft shadow: a square one would show
    const walls = all.filter(([, k]) => !(k.themed && ROUND.has(k.kind.replace(/\d+$/, ''))));
    if (this.hq) {
      x.save();
      x.shadowColor = 'rgba(0, 0, 0, 0.65)';
      x.shadowBlur = 16;
      x.shadowOffsetX = 8;
      x.shadowOffsetY = 11;
      x.fillStyle = '#000';
      for (const [w] of walls) x.fillRect(w.x, w.y, w.w, w.h);
      x.restore();
    } else {
      x.fillStyle = 'rgba(0,0,0,0.45)';
      for (const [w] of walls) x.fillRect(w.x + 7, w.y + 9, w.w, w.h);
    }
    for (const [w, k] of all) {
      if (k.themed) {
        x.save();
        const ok = drawThemeWall(x, w, k, map.seed);
        x.restore();
        if (ok) continue;
      }
      this.drawWall(x, w, k, tex);
    }
  }

  drawFence(x, view) {
    const map = this.map;
    const band = 14;
    const sides = [
      { x: -band, y: -band, w: map.w + band * 2, h: band },
      { x: -band, y: map.h, w: map.w + band * 2, h: band },
      { x: -band, y: 0, w: band, h: map.h },
      { x: map.w, y: 0, w: band, h: map.h },
    ];
    for (const s of sides) {
      if (!rectsOverlap(s, view, 4)) continue;
      x.fillStyle = THEME[map.theme]?.fence ?? '#10141c';
      x.fillRect(s.x, s.y, s.w, s.h);
      x.save();
      x.beginPath();
      x.rect(s.x, s.y, s.w, s.h);
      x.clip();
      x.strokeStyle = 'rgba(150, 160, 180, 0.35)';
      x.lineWidth = 1;
      x.beginPath();
      const span = s.w + s.h;
      for (let i = -span; i < span; i += 7) {
        x.moveTo(s.x + i, s.y);
        x.lineTo(s.x + i + span, s.y + span);
        x.moveTo(s.x + i, s.y + s.h);
        x.lineTo(s.x + i + span, s.y + s.h - span);
      }
      x.stroke();
      x.restore();
      x.fillStyle = '#4a5160';
      const horiz = s.w > s.h;
      const len = horiz ? s.w : s.h;
      for (let i = 0; i <= len; i += 80) {
        const px = horiz ? s.x + i : s.x + s.w / 2;
        const py = horiz ? s.y + s.h / 2 : s.y + i;
        x.beginPath();
        x.arc(px, py, 4, 0, Math.PI * 2);
        x.fill();
      }
    }
  }

  // headstones, crypts and low walls; rocks and timber
  drawArenaWall(x, w, k, tex) {
    if (k.kind === 'grave') {
      const stone = ['#7d828c', '#6c6f76', '#8f8a80'][k.c];
      const r = Math.min(w.w, w.h) / 2;
      x.fillStyle = stone;
      x.strokeStyle = 'rgba(0,0,0,0.75)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(w.x, w.y + w.h);
      x.lineTo(w.x, w.y + r);
      x.arc(w.x + w.w / 2, w.y + r, w.w / 2, Math.PI, 0);
      x.lineTo(w.x + w.w, w.y + w.h);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.14)';
      x.fillRect(w.x + 2, w.y + r, 3, w.h - r - 2);
      x.strokeStyle = 'rgba(20, 20, 24, 0.7)';
      x.lineWidth = 2.5;
      x.beginPath();
      x.moveTo(w.x + w.w / 2, w.y + r * 0.6);
      x.lineTo(w.x + w.w / 2, w.y + w.h * 0.72);
      x.moveTo(w.x + w.w * 0.3, w.y + r * 1.2);
      x.lineTo(w.x + w.w * 0.7, w.y + r * 1.2);
      x.stroke();
      // moss at the foot
      x.fillStyle = 'rgba(60, 110, 50, 0.55)';
      x.fillRect(w.x, w.y + w.h - 5, w.w, 5);
      return;
    }
    if (k.kind === 'rock') {
      x.fillStyle = pattern(x, tex.cinder);
      x.fillRect(w.x, w.y, w.w, w.h);
      x.fillStyle = ['rgba(120, 80, 40, 0.55)', 'rgba(90, 70, 50, 0.6)', 'rgba(140, 100, 60, 0.5)'][k.c];
      x.fillRect(w.x, w.y, w.w, w.h);
      x.strokeStyle = 'rgba(20, 12, 6, 0.55)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(w.x + w.w * 0.2, w.y);
      x.lineTo(w.x + w.w * 0.45, w.y + w.h * 0.5);
      x.lineTo(w.x + w.w * 0.3, w.y + w.h);
      x.moveTo(w.x + w.w * 0.45, w.y + w.h * 0.5);
      x.lineTo(w.x + w.w, w.y + w.h * 0.4);
      x.stroke();
      // a vein of gold
      x.strokeStyle = 'rgba(255, 200, 80, 0.55)';
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(w.x + w.w * 0.6, w.y + w.h * 0.15);
      x.lineTo(w.x + w.w * 0.75, w.y + w.h * 0.35);
      x.stroke();
    } else {
      x.fillStyle = pattern(x, k.kind === 'crypt' ? tex.brick : k.kind === 'lowwall' ? tex.cinder : tex.planks);
      x.fillRect(w.x, w.y, w.w, w.h);
      if (k.kind === 'crypt' || k.kind === 'lowwall') {
        x.fillStyle = 'rgba(40, 60, 45, 0.45)';
        x.fillRect(w.x, w.y, w.w, w.h);
      }
      if (k.kind === 'crypt') {
        x.fillStyle = 'rgba(10, 12, 14, 0.85)';
        const dw = Math.min(34, w.w * 0.3);
        x.fillRect(w.x + w.w / 2 - dw / 2, w.y + w.h - 26, dw, 26);
        x.fillStyle = 'rgba(220, 215, 200, 0.18)';
        x.font = '900 18px "Big Shoulders Stencil Display", Impact, sans-serif';
        x.textAlign = 'center';
        x.fillText('R.I.P.', w.x + w.w / 2, w.y + 24);
      }
    }
    x.fillStyle = 'rgba(255, 255, 255, 0.12)';
    x.fillRect(w.x, w.y, w.w, 3);
    x.fillStyle = 'rgba(0, 0, 0, 0.45)';
    x.fillRect(w.x, w.y + w.h - 4, w.w, 4);
    x.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    x.lineWidth = 1.5;
    x.strokeRect(w.x + 0.75, w.y + 0.75, w.w - 1.5, w.h - 1.5);
  }

  drawWall(x, w, k, tex) {
    if (['grave', 'crypt', 'lowwall', 'rock', 'timber'].includes(k.kind)) return this.drawArenaWall(x, w, k, tex);
    const vertical = w.h > w.w;
    const pick = () => {
      switch (k.kind) {
        case 'steel':
          return tex.steel;
        case 'crate':
          return tex.planks;
        case 'container':
          return tex.containers[k.c];
        case 'brick':
          return tex.brick;
        default:
          return tex.cinder;
      }
    };
    const p = pattern(x, pick());
    if (vertical && (k.kind === 'container' || k.kind === 'brick' || k.kind === 'cinder')) {
      p.setTransform(new DOMMatrix().rotateSelf(90).scaleSelf(1 / TEX_SCALE, 1 / TEX_SCALE));
    }
    x.fillStyle = p;
    x.fillRect(w.x, w.y, w.w, w.h);

    if (k.kind === 'crate') {
      x.strokeStyle = '#2a1d10';
      x.lineWidth = 5;
      x.strokeRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6);
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(w.x + 5, w.y + 5);
      x.lineTo(w.x + w.w - 5, w.y + w.h - 5);
      x.moveTo(w.x + w.w - 5, w.y + 5);
      x.lineTo(w.x + 5, w.y + w.h - 5);
      x.stroke();
    } else if (k.kind === 'container') {
      x.fillStyle = 'rgba(0,0,0,0.35)';
      if (vertical) {
        x.fillRect(w.x, w.y, w.w, 8);
        x.fillRect(w.x, w.y + w.h - 8, w.w, 8);
      } else {
        x.fillRect(w.x, w.y, 8, w.h);
        x.fillRect(w.x + w.w - 8, w.y, 8, w.h);
      }
    }
    // bevel: light from the top-left
    x.fillStyle = 'rgba(255, 255, 255, 0.13)';
    x.fillRect(w.x, w.y, w.w, 3);
    x.fillRect(w.x, w.y, 3, w.h);
    x.fillStyle = 'rgba(0, 0, 0, 0.45)';
    x.fillRect(w.x, w.y + w.h - 4, w.w, 4);
    x.fillRect(w.x + w.w - 4, w.y, 4, w.h);
    x.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    x.lineWidth = 1.5;
    x.strokeRect(w.x + 0.75, w.y + 0.75, w.w - 1.5, w.h - 1.5);
  }
}

export { shade };
