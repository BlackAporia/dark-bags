// Static map layer: floor, vault plating, decals, exit pads, fence and walls,
// rendered once into cached chunks at the current zoom. Per frame we only blit
// the visible chunks, which is what keeps the textured map cheap.
import { mulberry32, rectsOverlap } from '../shared/geom.js';
import { textures, pattern, shade, canvas, TEX_SCALE } from './textures.js';

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
  return map.walls.map((w) => {
    const inVault = map.vaults.some((v) => rectsOverlap(v, w, 1) && (w.w <= 24 || w.h <= 24));
    if (inVault) return { kind: 'steel' };
    const long = Math.max(w.w, w.h) / Math.min(w.w, w.h) > 2.5;
    if (long) return rnd() < 0.55 ? { kind: 'container', c: Math.floor(rnd() * 4) } : { kind: rnd() < 0.5 ? 'brick' : 'cinder' };
    return rnd() < 0.6 ? { kind: 'crate' } : { kind: 'cinder' };
  });
}

// A few painted "roads" crossing the map, fixed per map.
function planRoads(map) {
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
    x.fillStyle = pattern(x, tex.concrete);
    x.fillRect(0, 0, map.w, map.h);

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
      x.strokeStyle = hazardPattern(x);
      x.lineWidth = 22;
      x.strokeRect(v.x + 11, v.y + 11, v.w - 22, v.h - 22);
      x.fillStyle = 'rgba(247, 147, 26, 0.08)';
      x.font = '900 64px "Big Shoulders Stencil Display", Impact, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('VAULT', v.x + v.w / 2, v.y + v.h / 2);
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
    const walls = map.walls.map((w, i) => [w, this.kinds[i]]).filter(([w]) => near(w, 30));
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
    for (const [w, k] of walls) this.drawWall(x, w, k, tex);
    return c;
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
      x.fillStyle = '#10141c';
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

  drawWall(x, w, k, tex) {
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
