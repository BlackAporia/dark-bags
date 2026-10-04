// The look of every raid map theme (shared/map.js lays them out): the floor tile, the ground
// decals, how each kind of wall and pit is drawn, how dark the night is, what glows through
// it, and the weather. Everything is drawn in code, seeded, so it ships as one small file.
import { mulberry32 } from '../shared/geom.js';
import { canvas, TEX_SCALE, noiseLayer, speckle, crack } from './textures.js';
// (canvas also draws the hazard stripe pattern used on machinery)

const TAU = Math.PI * 2;
const S = 256 * TEX_SCALE; // a floor tile: 256 world units

function rr(x, X, Y, W, H, r) {
  r = Math.min(r, W / 2, H / 2);
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + H, r);
  x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r);
  x.arcTo(X, Y, X + W, Y, r);
  x.closePath();
}

// light from the top-left, dark to the bottom-right
function bevel(x, w, hi = 0.16, lo = 0.4, k = 3) {
  x.fillStyle = `rgba(255,255,255,${hi})`;
  x.fillRect(w.x, w.y, w.w, k);
  x.fillRect(w.x, w.y, k, w.h);
  x.fillStyle = `rgba(0,0,0,${lo})`;
  x.fillRect(w.x, w.y + w.h - k - 1, w.w, k + 1);
  x.fillRect(w.x + w.w - k - 1, w.y, k + 1, w.h);
}

function outline(x, w, col = 'rgba(0,0,0,0.7)', lw = 1.5) {
  x.strokeStyle = col;
  x.lineWidth = lw;
  x.strokeRect(w.x + lw / 2, w.y + lw / 2, w.w - lw, w.h - lw);
}

function tile(base, paint, seed) {
  const c = canvas(S, S);
  const x = c.getContext('2d');
  const rnd = mulberry32(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  paint(x, rnd);
  return c;
}

// a top-down tree: layered blobs, a darker rim, light on the top-left
function tree(x, cx, cy, r, cols, rnd, snow = false) {
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.beginPath();
  x.arc(cx + r * 0.25, cy + r * 0.3, r, 0, TAU);
  x.fill();
  for (let i = 0; i < cols.length; i++) {
    const k = 1 - i * 0.22;
    x.fillStyle = cols[i];
    x.beginPath();
    const n = 7;
    for (let j = 0; j <= n; j++) {
      const a = (j / n) * TAU + i;
      const rr2 = r * k * (0.82 + rnd() * 0.18);
      const px = cx - i * r * 0.08 + Math.cos(a) * rr2;
      const py = cy - i * r * 0.1 + Math.sin(a) * rr2;
      if (j === 0) x.moveTo(px, py);
      else x.quadraticCurveTo(cx - i * r * 0.08 + Math.cos(a - 0.45) * rr2 * 1.15, cy - i * r * 0.1 + Math.sin(a - 0.45) * rr2 * 1.15, px, py);
    }
    x.closePath();
    x.fill();
  }
  if (snow) {
    x.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      x.arc(cx - r * 0.3 + rnd() * r * 0.5, cy - r * 0.35 + rnd() * r * 0.5, r * (0.12 + rnd() * 0.12), 0, TAU);
      x.fill();
    }
  }
}

// a pine from above: a star of needles in rings
function pine(x, cx, cy, r, rnd, snow) {
  x.fillStyle = 'rgba(0,0,0,0.3)';
  x.beginPath();
  x.arc(cx + 5, cy + 7, r, 0, TAU);
  x.fill();
  const rings = [['#1d3b2a', 1], ['#24503a', 0.74], ['#2f6648', 0.48]];
  for (const [col, k] of rings) {
    x.fillStyle = col;
    x.beginPath();
    const n = 9;
    for (let j = 0; j < n * 2; j++) {
      const a = (j / (n * 2)) * TAU + k;
      const d = (j % 2 ? 0.62 : 1) * r * k;
      if (j === 0) x.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      else x.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    }
    x.closePath();
    x.fill();
  }
  if (snow) {
    x.fillStyle = 'rgba(245,250,255,0.9)';
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU;
      const d = rnd() * r * 0.7;
      x.beginPath();
      x.arc(cx + Math.cos(a) * d - 2, cy + Math.sin(a) * d - 2, 2 + rnd() * 4, 0, TAU);
      x.fill();
    }
  }
}

// a motorbike drawn in black lines, for the track
function bike(x, cx, cy, a, s = 1) {
  x.save();
  x.translate(cx, cy);
  x.rotate(a);
  x.scale(s, s);
  x.strokeStyle = 'rgba(20,24,20,0.75)';
  x.lineWidth = 2.2;
  x.lineJoin = 'round';
  x.beginPath();
  x.arc(-18, 0, 9, 0, TAU);
  x.moveTo(27, 0);
  x.arc(18, 0, 9, 0, TAU);
  x.moveTo(-18, 0);
  x.lineTo(-4, -12);
  x.lineTo(10, -12);
  x.lineTo(18, 0);
  x.moveTo(-4, -12);
  x.lineTo(2, 0);
  x.lineTo(-18, 0);
  x.moveTo(10, -12);
  x.lineTo(14, -20);
  x.lineTo(20, -20);
  x.stroke();
  x.restore();
}

const FLOOR = {
  chain: () =>
    tile('#0a0f1f', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 10, alpha: 0.05 });
      x.strokeStyle = 'rgba(90,140,255,0.08)';
      x.lineWidth = 2;
      x.beginPath();
      for (let i = 0; i <= S; i += 64) {
        x.moveTo(i, 0);
        x.lineTo(i, S);
        x.moveTo(0, i);
        x.lineTo(S, i);
      }
      x.stroke();
      // circuit traces with pads
      for (let n = 0; n < 16; n++) {
        let px = Math.floor(rnd() * 8) * 64;
        let py = Math.floor(rnd() * 8) * 64;
        x.strokeStyle = rnd() < 0.5 ? 'rgba(70,200,255,0.2)' : 'rgba(170,110,255,0.18)';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(px, py);
        for (let k = 0; k < 4; k++) {
          if (rnd() < 0.5) px += (rnd() < 0.5 ? -1 : 1) * 64 * (1 + Math.floor(rnd() * 2));
          else py += (rnd() < 0.5 ? -1 : 1) * 64 * (1 + Math.floor(rnd() * 2));
          x.lineTo(px, py);
        }
        x.stroke();
        x.fillStyle = x.strokeStyle;
        x.beginPath();
        x.arc(px, py, 6, 0, TAU);
        x.fill();
      }
    }, 101),
  lego: () =>
    tile('#2e9e46', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 6, alpha: 0.04 });
      const g = 32; // a stud every 16 world units
      for (let i = g / 2; i < S; i += g)
        for (let j = g / 2; j < S; j += g) {
          x.fillStyle = 'rgba(0,0,0,0.22)';
          x.beginPath();
          x.arc(i + 2, j + 3, 10, 0, TAU);
          x.fill();
          x.fillStyle = '#3cb357';
          x.beginPath();
          x.arc(i, j, 10, 0, TAU);
          x.fill();
          x.fillStyle = 'rgba(255,255,255,0.22)';
          x.beginPath();
          x.arc(i - 3, j - 3, 4, 0, TAU);
          x.fill();
        }
    }, 102),
  dunes: () =>
    tile('#d4a462', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 6, alpha: 0.12 });
      noiseLayer(x, S, S, rnd, { cells: 30, alpha: 0.08, light: false });
      // wind ripples (periodic across the tile, so the tiles meet without a seam)
      for (let k = 0; k < 22; k++) {
        const y0 = rnd() * S;
        x.strokeStyle = `rgba(140, 90, 40, ${0.1 + rnd() * 0.1})`;
        x.lineWidth = 2 + rnd() * 2;
        for (const oy of [-S, 0, S]) {
          x.beginPath();
          for (let px = 0; px <= S; px += 8) {
            const py = oy + y0 + Math.sin((px / S) * TAU * 6 + k) * 8 + Math.sin((px / S) * TAU * 20) * 2;
            if (px === 0) x.moveTo(px, py);
            else x.lineTo(px, py);
          }
          x.stroke();
        }
      }
      speckle(x, S, S, rnd, 900, 'rgba(255,240,200,0.25)', 2);
      speckle(x, S, S, rnd, 500, 'rgba(110,70,30,0.25)', 2);
    }, 103),
  snow: () =>
    tile('#dfe8f2', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 6, alpha: 0.12, light: false });
      noiseLayer(x, S, S, rnd, { cells: 24, alpha: 0.12 });
      speckle(x, S, S, rnd, 1200, 'rgba(255,255,255,0.7)', 2);
      speckle(x, S, S, rnd, 400, 'rgba(120,150,190,0.18)', 2);
      // drifts, wrapped around the tile edges
      for (let k = 0; k < 8; k++) {
        const cx = rnd() * S;
        const cy = rnd() * S;
        for (const ox of [-S, 0, S])
          for (const oy of [-S, 0, S]) {
            const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, 120);
            g.addColorStop(0, 'rgba(150,175,210,0.12)');
            g.addColorStop(1, 'rgba(150,175,210,0)');
            x.fillStyle = g;
            x.fillRect(cx + ox - 120, cy + oy - 120, 240, 240);
          }
      }
    }, 104),
  lava: () =>
    tile('#2a1c17', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 8, alpha: 0.06 });
      noiseLayer(x, S, S, rnd, { cells: 40, alpha: 0.12, light: false });
      speckle(x, S, S, rnd, 700, 'rgba(0,0,0,0.35)', 3);
      for (let i = 0; i < 7; i++) {
        const px = rnd() * S;
        const py = rnd() * S;
        const seed = rnd() * 1e6;
        // the same crack at every wrap, so it continues into the next tile
        for (const ox of [-S, 0, S])
          for (const oy of [-S, 0, S]) {
            crack(x, px + ox, py + oy, mulberry32(seed), 9, 7, 'rgba(255,90,20,0.12)');
            crack(x, px + ox, py + oy, mulberry32(seed), 9, 2.2, 'rgba(255,150,50,0.55)');
          }
      }
    }, 105),
  city: () =>
    tile('#1c1e24', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 10, alpha: 0.05 });
      noiseLayer(x, S, S, rnd, { cells: 50, alpha: 0.07, light: false });
      speckle(x, S, S, rnd, 1600, 'rgba(255,255,255,0.05)', 2);
      speckle(x, S, S, rnd, 900, 'rgba(0,0,0,0.3)', 2);
    }, 106),
  neon: () =>
    tile('#140828', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 8, alpha: 0.05 });
      for (const [col, lw] of [['rgba(255,60,200,0.14)', 10], ['rgba(255,90,220,0.55)', 2.5]]) {
        x.strokeStyle = col;
        x.lineWidth = lw;
        x.beginPath();
        for (let i = 0; i <= S; i += 128) {
          x.moveTo(i, 0);
          x.lineTo(i, S);
          x.moveTo(0, i);
          x.lineTo(S, i);
        }
        x.stroke();
      }
      x.strokeStyle = 'rgba(80,220,255,0.2)';
      x.lineWidth = 1.5;
      x.beginPath();
      for (let i = 64; i < S; i += 128) {
        x.moveTo(i, 0);
        x.lineTo(i, S);
        x.moveTo(0, i);
        x.lineTo(S, i);
      }
      x.stroke();
    }, 107),
  blackout: () =>
    tile('#0d130e', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 8, alpha: 0.07 });
      noiseLayer(x, S, S, rnd, { cells: 36, alpha: 0.15, light: false });
      for (let i = 0; i < 260; i++) {
        x.fillStyle = `rgba(${60 + rnd() * 60}, ${40 + rnd() * 50}, 20, ${0.15 + rnd() * 0.2})`;
        x.beginPath();
        x.ellipse(rnd() * S, rnd() * S, 3 + rnd() * 5, 1.5 + rnd() * 2, rnd() * 3, 0, TAU);
        x.fill();
      }
    }, 108),
  fantasy: () =>
    tile('#4a7a34', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 6, alpha: 0.1 });
      noiseLayer(x, S, S, rnd, { cells: 30, alpha: 0.1, light: false });
      x.lineWidth = 2;
      for (let i = 0; i < 500; i++) {
        const px = rnd() * S;
        const py = rnd() * S;
        x.strokeStyle = `rgba(${100 + rnd() * 60}, ${150 + rnd() * 60}, 70, 0.35)`;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + (rnd() - 0.5) * 6, py - 6 - rnd() * 6);
        x.stroke();
      }
    }, 109),
  toon: () =>
    tile('#ffe4f1', (x) => {
      const g = 64;
      for (let i = 0; i < S; i += g)
        for (let j = 0; j < S; j += g) {
          x.fillStyle = (i / g + j / g) % 2 ? '#ffd3e8' : '#ffdcee';
          x.beginPath();
          x.arc(i + ((j / g) % 2 ? g / 2 : 0), j, 14, 0, TAU);
          x.fill();
        }
    }, 110),
  gravity: () =>
    tile('#eef2e3', (x) => {
      x.strokeStyle = 'rgba(70,110,70,0.1)';
      x.lineWidth = 1;
      x.beginPath();
      for (let i = 0; i <= S; i += 32) {
        x.moveTo(i, 0);
        x.lineTo(i, S);
        x.moveTo(0, i);
        x.lineTo(S, i);
      }
      x.stroke();
      x.strokeStyle = 'rgba(70,110,70,0.2)';
      x.lineWidth = 2;
      x.beginPath();
      for (let i = 0; i <= S; i += 128) {
        x.moveTo(i, 0);
        x.lineTo(i, S);
        x.moveTo(0, i);
        x.lineTo(S, i);
      }
      x.stroke();
    }, 111),
};

const LEGO = ['#d0312d', '#1f63c6', '#f2c12e', '#f4f4f0', '#f57c1f', '#7a3fb5'];
const BLD = [['#3a3f4b', '#2b2f38'], ['#4a4236', '#383128'], ['#33414a', '#263139'], ['#45393f', '#33292e']];
const CARS = ['#c8302f', '#e8b02a', '#2d6fd0', '#e6e6e6', '#25292f'];

// ------------------------------------------------------------ walls

const WALL = {
  // blockchain
  block(x, w, k, rnd) {
    const g = x.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
    g.addColorStop(0, '#26335e');
    g.addColorStop(1, '#141b36');
    x.fillStyle = g;
    x.fillRect(w.x, w.y, w.w, w.h);
    x.strokeStyle = 'rgba(80,200,255,0.9)';
    x.lineWidth = 2.5;
    x.strokeRect(w.x + 4, w.y + 4, w.w - 8, w.h - 8);
    x.strokeStyle = 'rgba(80,200,255,0.18)';
    x.lineWidth = 8;
    x.strokeRect(w.x + 4, w.y + 4, w.w - 8, w.h - 8);
    // the block's header: number and hash
    x.fillStyle = 'rgba(160,220,255,0.85)';
    x.font = '700 14px "IBM Plex Mono", monospace';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(`#${(Math.floor(rnd() * 900000) + 100000).toString()}`, w.x + w.w / 2, w.y + w.h / 2 - 9);
    x.fillStyle = 'rgba(170,120,255,0.75)';
    x.font = '600 10px "IBM Plex Mono", monospace';
    x.fillText(`0x${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0')}…`, w.x + w.w / 2, w.y + w.h / 2 + 9);
    // transactions packed inside
    x.fillStyle = 'rgba(80,200,255,0.25)';
    for (let i = 0; i < 6; i++) x.fillRect(w.x + 12 + i * ((w.w - 24) / 6), w.y + w.h - 18, (w.w - 24) / 6 - 3, 6);
  },
  link(x, w) {
    x.fillStyle = 'rgba(10,14,28,0.9)';
    x.fillRect(w.x, w.y, w.w, w.h);
    const vert = w.h > w.w;
    const len = vert ? w.h : w.w;
    x.strokeStyle = '#c9a227';
    x.lineWidth = 3;
    for (let i = 0; i < len; i += 22) {
      x.beginPath();
      if (vert) x.ellipse(w.x + w.w / 2, w.y + i + 11, i % 44 ? 4 : 7, 10, 0, 0, TAU);
      else x.ellipse(w.x + i + 11, w.y + w.h / 2, 10, i % 44 ? 4 : 7, 0, 0, TAU);
      x.stroke();
    }
    return true;
  },
  // lego bricks with studs
  brick(x, w, k) {
    const col = LEGO[Number(k.kind.slice(5)) % LEGO.length];
    rr(x, w.x, w.y, w.w, w.h, 4);
    x.fillStyle = col;
    x.fill();
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(w.x + 2, w.y + w.h - 6, w.w - 4, 5);
    x.fillRect(w.x + w.w - 6, w.y + 2, 5, w.h - 4);
    x.fillStyle = 'rgba(255,255,255,0.25)';
    x.fillRect(w.x + 2, w.y + 2, w.w - 4, 3);
    for (let i = 20; i < w.w; i += 40)
      for (let j = 20; j < w.h; j += 40) {
        x.fillStyle = 'rgba(0,0,0,0.28)';
        x.beginPath();
        x.arc(w.x + i + 2, w.y + j + 3, 11, 0, TAU);
        x.fill();
        x.fillStyle = col;
        x.beginPath();
        x.arc(w.x + i, w.y + j, 11, 0, TAU);
        x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.25)';
        x.lineWidth = 1.5;
        x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.35)';
        x.beginPath();
        x.arc(w.x + i - 3, w.y + j - 3, 4, 0, TAU);
        x.fill();
      }
    x.strokeStyle = 'rgba(0,0,0,0.45)';
    x.lineWidth = 1.5;
    rr(x, w.x + 0.75, w.y + 0.75, w.w - 1.5, w.h - 1.5, 4);
    x.stroke();
    return true;
  },
  // desert
  mesa(x, w, k, rnd) {
    const g = x.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
    g.addColorStop(0, '#c4673a');
    g.addColorStop(1, '#8d3f22');
    rr(x, w.x, w.y, w.w, w.h, 10);
    x.fillStyle = g;
    x.fill();
    x.save();
    x.clip();
    // strata
    for (let i = 0; i < 5; i++) {
      x.strokeStyle = `rgba(${90 + rnd() * 60}, 40, 20, 0.35)`;
      x.lineWidth = 3 + rnd() * 4;
      x.beginPath();
      const y0 = w.y + rnd() * w.h;
      x.moveTo(w.x - 5, y0);
      x.bezierCurveTo(w.x + w.w * 0.3, y0 + (rnd() - 0.5) * 20, w.x + w.w * 0.7, y0 + (rnd() - 0.5) * 20, w.x + w.w + 5, y0);
      x.stroke();
    }
    x.fillStyle = 'rgba(255,220,170,0.18)';
    x.fillRect(w.x, w.y, w.w, 6);
    x.restore();
    x.strokeStyle = 'rgba(60,20,10,0.6)';
    x.lineWidth = 2;
    rr(x, w.x + 1, w.y + 1, w.w - 2, w.h - 2, 10);
    x.stroke();
    return true;
  },
  cactus(x, w) {
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    const r = Math.min(w.w, w.h) / 2;
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.beginPath();
    x.arc(cx + 4, cy + 5, r, 0, TAU);
    x.fill();
    x.fillStyle = '#2f7d45';
    x.beginPath();
    x.arc(cx, cy, r, 0, TAU);
    x.fill();
    x.strokeStyle = '#1f5a30';
    x.lineWidth = 1.5;
    for (let a = 0; a < TAU; a += TAU / 8) {
      x.beginPath();
      x.moveTo(cx, cy);
      x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      x.stroke();
    }
    x.fillStyle = '#ff7aa8';
    x.beginPath();
    x.arc(cx - 2, cy - 2, 3, 0, TAU);
    x.fill();
    return true;
  },
  // snow
  pine(x, w, k, rnd) {
    pine(x, w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h) * 0.75, rnd, true);
    return true;
  },
  cabin(x, w, k, rnd) {
    x.fillStyle = '#5a3a22';
    x.fillRect(w.x, w.y, w.w, w.h);
    const vert = w.h > w.w;
    x.strokeStyle = 'rgba(30,18,10,0.6)';
    x.lineWidth = 2;
    for (let i = 8; i < (vert ? w.w : w.h); i += 10) {
      x.beginPath();
      if (vert) {
        x.moveTo(w.x + i, w.y);
        x.lineTo(w.x + i, w.y + w.h);
      } else {
        x.moveTo(w.x, w.y + i);
        x.lineTo(w.x + w.w, w.y + i);
      }
      x.stroke();
    }
    // snow on the roof, a chimney
    x.fillStyle = 'rgba(245,250,255,0.92)';
    rr(x, w.x + 4, w.y + 4, w.w - 8, w.h - 8, 12);
    x.fill();
    x.strokeStyle = 'rgba(140,160,190,0.5)';
    x.lineWidth = 2;
    x.beginPath();
    if (vert) {
      x.moveTo(w.x + w.w / 2, w.y + 6);
      x.lineTo(w.x + w.w / 2, w.y + w.h - 6);
    } else {
      x.moveTo(w.x + 6, w.y + w.h / 2);
      x.lineTo(w.x + w.w - 6, w.y + w.h / 2);
    }
    x.stroke();
    x.fillStyle = '#6b4a3a';
    x.fillRect(w.x + w.w * 0.68, w.y + w.h * 0.2, 14, 14);
    x.fillStyle = 'rgba(200,200,200,0.4)';
    x.beginPath();
    x.arc(w.x + w.w * 0.68 + 18, w.y + w.h * 0.2 - 8, 8 + rnd() * 4, 0, TAU);
    x.fill();
    outline(x, w, 'rgba(40,25,15,0.7)', 2);
    return true;
  },
  ice(x, w, k, rnd) {
    const g = x.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
    g.addColorStop(0, 'rgba(200,240,255,0.95)');
    g.addColorStop(1, 'rgba(110,180,230,0.95)');
    x.fillStyle = g;
    rr(x, w.x, w.y, w.w, w.h, 6);
    x.fill();
    x.save();
    x.clip();
    crack(x, w.x + rnd() * w.w, w.y + rnd() * w.h, rnd, 4, 1.2, 'rgba(255,255,255,0.8)');
    x.restore();
    x.fillStyle = 'rgba(255,255,255,0.6)';
    x.fillRect(w.x + 5, w.y + 5, w.w * 0.4, 3);
    x.strokeStyle = 'rgba(60,120,170,0.6)';
    x.lineWidth = 2;
    rr(x, w.x + 1, w.y + 1, w.w - 2, w.h - 2, 6);
    x.stroke();
    return true;
  },
  // lava fields
  obsidian(x, w, k, rnd) {
    const g = x.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
    g.addColorStop(0, '#2b2238');
    g.addColorStop(0.5, '#120d18');
    g.addColorStop(1, '#07050a');
    x.fillStyle = g;
    x.beginPath();
    // a faceted rock
    const pts = 9;
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * TAU;
      const px = w.x + w.w / 2 + Math.cos(a) * (w.w / 2) * (0.88 + rnd() * 0.12);
      const py = w.y + w.h / 2 + Math.sin(a) * (w.h / 2) * (0.88 + rnd() * 0.12);
      const cx = Math.max(w.x, Math.min(w.x + w.w, px));
      const cy = Math.max(w.y, Math.min(w.y + w.h, py));
      if (i === 0) x.moveTo(cx, cy);
      else x.lineTo(cx, cy);
    }
    x.closePath();
    x.fill();
    // fill the corners too: the rock is the whole rect (that is what stops you)
    x.globalCompositeOperation = 'destination-over';
    x.fillStyle = '#100b12';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = 'rgba(190,140,255,0.45)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(w.x + w.w * 0.2, w.y + w.h * 0.25);
    x.lineTo(w.x + w.w * 0.5, w.y + w.h * 0.15);
    x.lineTo(w.x + w.w * 0.62, w.y + w.h * 0.4);
    x.stroke();
    x.strokeStyle = 'rgba(255,110,30,0.6)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(w.x, w.y + w.h - 3);
    x.lineTo(w.x + w.w, w.y + w.h - 3);
    x.stroke();
    return true;
  },
  // city
  bld(x, w, k, rnd) {
    const [roof, edge] = BLD[Number(k.kind.slice(3)) % BLD.length];
    // sidewalk around the building
    x.fillStyle = '#3b3d44';
    x.fillRect(w.x - 10, w.y - 10, w.w + 20, w.h + 20);
    x.strokeStyle = 'rgba(0,0,0,0.4)';
    x.lineWidth = 1;
    for (let i = w.x - 10; i < w.x + w.w + 10; i += 20) {
      x.beginPath();
      x.moveTo(i, w.y - 10);
      x.lineTo(i, w.y);
      x.moveTo(i, w.y + w.h);
      x.lineTo(i, w.y + w.h + 10);
      x.stroke();
    }
    x.fillStyle = edge;
    x.fillRect(w.x, w.y, w.w, w.h);
    x.fillStyle = roof;
    x.fillRect(w.x + 8, w.y + 8, w.w - 16, w.h - 16);
    noiseRect(x, w, rnd);
    // rooftop kit: AC units, a water tank, vents, sometimes a helipad
    if (w.w > 150 && w.h > 150 && rnd() < 0.3) {
      const cx = w.x + w.w / 2;
      const cy = w.y + w.h / 2;
      x.strokeStyle = 'rgba(230,200,60,0.7)';
      x.lineWidth = 4;
      x.beginPath();
      x.arc(cx, cy, 40, 0, TAU);
      x.stroke();
      x.fillStyle = 'rgba(230,200,60,0.7)';
      x.font = '900 40px "Big Shoulders Stencil Display", Impact, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('H', cx, cy + 2);
    } else {
      for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) {
        const ax = w.x + 16 + rnd() * (w.w - 60);
        const ay = w.y + 16 + rnd() * (w.h - 50);
        x.fillStyle = '#8a8f99';
        x.fillRect(ax, ay, 30, 22);
        x.fillStyle = '#5b606a';
        x.beginPath();
        x.arc(ax + 15, ay + 11, 8, 0, TAU);
        x.fill();
      }
      if (rnd() < 0.6) {
        const tx = w.x + 20 + rnd() * (w.w - 60);
        const ty = w.y + 20 + rnd() * (w.h - 60);
        x.fillStyle = '#6b4c32';
        x.beginPath();
        x.arc(tx + 16, ty + 16, 16, 0, TAU);
        x.fill();
        x.strokeStyle = '#3c2a1b';
        x.lineWidth = 2;
        x.stroke();
      }
    }
    // a strip of lit windows along one edge (the floor below glows a little)
    x.fillStyle = 'rgba(255,210,120,0.35)';
    for (let i = w.x + 12; i < w.x + w.w - 12; i += 16) if (rnd() < 0.5) x.fillRect(i, w.y + w.h - 6, 8, 3);
    bevel(x, w, 0.1, 0.45, 4);
    outline(x, w);
    return true;
  },
  car(x, w, k) {
    const col = CARS[Number(k.kind.slice(3)) % CARS.length];
    const vert = w.h > w.w;
    rr(x, w.x, w.y, w.w, w.h, 9);
    x.fillStyle = col;
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.6)';
    x.lineWidth = 1.5;
    x.stroke();
    x.fillStyle = 'rgba(20,30,45,0.85)';
    if (vert) {
      x.fillRect(w.x + 5, w.y + 14, w.w - 10, 12);
      x.fillRect(w.x + 5, w.y + w.h - 22, w.w - 10, 9);
    } else {
      x.fillRect(w.x + 14, w.y + 5, 12, w.h - 10);
      x.fillRect(w.x + w.w - 22, w.y + 5, 9, w.h - 10);
    }
    x.fillStyle = 'rgba(255,255,255,0.25)';
    x.fillRect(w.x + 4, w.y + 3, w.w - 8, 2);
    return true;
  },
  // neon arcade
  pillar(x, w, k, rnd) {
    const hue = rnd() < 0.5 ? '255,60,200' : '60,230,255';
    x.fillStyle = '#1a0b30';
    x.fillRect(w.x, w.y, w.w, w.h);
    const g = x.createRadialGradient(w.x + w.w / 2, w.y + w.h / 2, 2, w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h) * 0.7);
    g.addColorStop(0, `rgba(${hue},0.35)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(w.x, w.y, w.w, w.h);
    for (const [lw, a] of [[10, 0.18], [4, 0.5], [2, 1]]) {
      x.strokeStyle = `rgba(${hue},${a})`;
      x.lineWidth = lw;
      x.strokeRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6);
    }
    return true;
  },
  bar(x, w, k, rnd) {
    const hue = rnd() < 0.5 ? '255,60,200' : '60,230,255';
    x.fillStyle = '#12061f';
    x.fillRect(w.x, w.y, w.w, w.h);
    for (const [lw, a] of [[12, 0.15], [5, 0.45], [2, 1]]) {
      x.strokeStyle = `rgba(${hue},${a})`;
      x.lineWidth = lw;
      x.beginPath();
      if (w.w > w.h) {
        x.moveTo(w.x + 6, w.y + w.h / 2);
        x.lineTo(w.x + w.w - 6, w.y + w.h / 2);
      } else {
        x.moveTo(w.x + w.w / 2, w.y + 6);
        x.lineTo(w.x + w.w / 2, w.y + w.h - 6);
      }
      x.stroke();
    }
    x.strokeStyle = `rgba(${hue},0.5)`;
    x.lineWidth = 1.5;
    x.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    return true;
  },
  // blackout forest
  tree(x, w, k, rnd) {
    tree(x, w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h) * 0.8, ['#0f2015', '#16301d', '#1f4127'], rnd);
    x.fillStyle = '#2a1c12';
    x.fillRect(w.x + w.w / 2 - 3, w.y + w.h / 2 - 3, 6, 6);
    return true;
  },
  log(x, w, k, rnd) {
    const vert = w.h > w.w;
    rr(x, w.x, w.y, w.w, w.h, Math.min(w.w, w.h) / 2);
    const g = vert ? x.createLinearGradient(w.x, 0, w.x + w.w, 0) : x.createLinearGradient(0, w.y, 0, w.y + w.h);
    g.addColorStop(0, '#5a3d24');
    g.addColorStop(0.5, '#3d2816');
    g.addColorStop(1, '#22160c');
    x.fillStyle = g;
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.5)';
    x.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      if (vert) {
        const px = w.x + 4 + rnd() * (w.w - 8);
        x.moveTo(px, w.y + 6);
        x.lineTo(px, w.y + w.h - 6);
      } else {
        const py = w.y + 4 + rnd() * (w.h - 8);
        x.moveTo(w.x + 6, py);
        x.lineTo(w.x + w.w - 6, py);
      }
      x.stroke();
    }
    x.fillStyle = 'rgba(70,110,50,0.5)';
    x.fillRect(w.x + w.w * 0.3, w.y + w.h * 0.3, Math.min(20, w.w * 0.3), Math.min(20, w.h * 0.3));
    return true;
  },
  ruin(x, w, k, rnd) {
    x.fillStyle = '#2b2e2c';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.fillStyle = '#383c39';
    for (let i = 0; i < 10; i++) x.fillRect(w.x + rnd() * (w.w - 20), w.y + rnd() * (w.h - 14), 18 + rnd() * 10, 10 + rnd() * 6);
    x.save();
    x.beginPath();
    x.rect(w.x, w.y, w.w, w.h);
    x.clip();
    crack(x, w.x + w.w / 2, w.y + w.h / 2, rnd, 6, 2, 'rgba(0,0,0,0.6)');
    x.restore();
    x.fillStyle = 'rgba(50,90,40,0.45)';
    x.fillRect(w.x, w.y + w.h - 8, w.w, 8);
    bevel(x, w, 0.08, 0.5);
    outline(x, w);
    return true;
  },
  // fantasy
  tower(x, w, k, rnd) {
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    const r = w.w / 2;
    x.fillStyle = '#6c6a66';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.fillStyle = '#86837d';
    x.beginPath();
    x.arc(cx, cy, r - 2, 0, TAU);
    x.fill();
    // crenellations
    x.fillStyle = '#5b5955';
    for (let a = 0; a < TAU; a += TAU / 12) x.fillRect(cx + Math.cos(a) * (r - 8) - 5, cy + Math.sin(a) * (r - 8) - 5, 10, 10);
    // a cone roof
    const roof = rnd() < 0.5 ? ['#9c2f2f', '#6b1d1d'] : ['#2f4f9c', '#1d306b'];
    const g = x.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, r * 0.7);
    g.addColorStop(0, roof[0]);
    g.addColorStop(1, roof[1]);
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r * 0.62, 0, TAU);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.3)';
    x.lineWidth = 1.5;
    for (let a = 0; a < TAU; a += TAU / 8) {
      x.beginPath();
      x.moveTo(cx, cy);
      x.lineTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
      x.stroke();
    }
    x.fillStyle = '#f2c12e';
    x.beginPath();
    x.arc(cx, cy, 4, 0, TAU);
    x.fill();
    outline(x, w, 'rgba(0,0,0,0.6)', 2);
    return true;
  },
  cwall(x, w, k, rnd) {
    x.fillStyle = '#77746e';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.strokeStyle = 'rgba(40,38,35,0.6)';
    x.lineWidth = 1.5;
    const vert = w.h > w.w;
    const len = vert ? w.h : w.w;
    for (let i = 0; i < len; i += 18) {
      x.beginPath();
      if (vert) {
        x.moveTo(w.x, w.y + i);
        x.lineTo(w.x + w.w, w.y + i);
      } else {
        x.moveTo(w.x + i, w.y);
        x.lineTo(w.x + i, w.y + w.h);
      }
      x.stroke();
    }
    // merlons along the top
    x.fillStyle = '#918d86';
    for (let i = 4; i < len - 8; i += 18) {
      if (vert) x.fillRect(w.x + 3, w.y + i, w.w - 6, 9);
      else x.fillRect(w.x + i, w.y + 3, 9, w.h - 6);
    }
    if (rnd() < 0.5) {
      x.fillStyle = 'rgba(60,110,50,0.5)';
      x.fillRect(w.x, w.y + w.h - 5, w.w, 5);
    }
    bevel(x, w, 0.12, 0.4, 2);
    outline(x, w);
    return true;
  },
  oak(x, w, k, rnd) {
    tree(x, w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h) * 0.85, ['#2d5a26', '#3d7a31', '#58a043'], rnd);
    if (rnd() < 0.3) {
      x.fillStyle = '#e8414b';
      for (let i = 0; i < 4; i++) {
        x.beginPath();
        x.arc(w.x + rnd() * w.w, w.y + rnd() * w.h, 2.5, 0, TAU);
        x.fill();
      }
    }
    return true;
  },
  // cartoon
  shroom(x, w, k, rnd) {
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    const r = Math.min(w.w, w.h) / 2 + 4;
    x.fillStyle = 'rgba(80,30,80,0.25)';
    x.beginPath();
    x.arc(cx + 5, cy + 6, r, 0, TAU);
    x.fill();
    x.fillStyle = rnd() < 0.5 ? '#ff4d6d' : '#8a5cff';
    x.beginPath();
    x.arc(cx, cy, r, 0, TAU);
    x.fill();
    x.lineWidth = 4;
    x.strokeStyle = '#1b1020';
    x.stroke();
    x.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) {
      const a = rnd() * TAU;
      const d = rnd() * r * 0.6;
      x.beginPath();
      x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3 + rnd() * 4, 0, TAU);
      x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,0.5)';
    x.beginPath();
    x.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.3, r * 0.15, -0.6, 0, TAU);
    x.fill();
    return true;
  },
  gift(x, w, k, rnd) {
    const cols = [['#45c4ff', '#ffd23f'], ['#ff7ac6', '#7cf29c'], ['#ffd23f', '#ff4d6d'], ['#7cf29c', '#8a5cff']][Math.floor(rnd() * 4)];
    rr(x, w.x, w.y, w.w, w.h, 8);
    x.fillStyle = cols[0];
    x.fill();
    x.fillStyle = cols[1];
    x.fillRect(w.x + w.w / 2 - 6, w.y, 12, w.h);
    x.fillRect(w.x, w.y + w.h / 2 - 6, w.w, 12);
    x.lineWidth = 4;
    x.strokeStyle = '#1b1020';
    rr(x, w.x + 2, w.y + 2, w.w - 4, w.h - 4, 8);
    x.stroke();
    // the bow
    x.fillStyle = cols[1];
    for (const s of [-1, 1]) {
      x.beginPath();
      x.ellipse(w.x + w.w / 2 + s * 10, w.y + w.h / 2, 10, 6, s * 0.5, 0, TAU);
      x.fill();
      x.lineWidth = 2.5;
      x.stroke();
    }
    x.fillStyle = 'rgba(255,255,255,0.45)';
    x.fillRect(w.x + 8, w.y + 6, w.w * 0.3, 4);
    return true;
  },
  candy(x, w) {
    rr(x, w.x, w.y, w.w, w.h, Math.min(w.w, w.h) / 2);
    x.fillStyle = '#fff';
    x.fill();
    x.save();
    x.clip();
    x.strokeStyle = '#ff3b5c';
    x.lineWidth = 10;
    const len = w.w + w.h;
    for (let i = -len; i < len; i += 26) {
      x.beginPath();
      x.moveTo(w.x + i, w.y);
      x.lineTo(w.x + i + len, w.y + len);
      x.stroke();
    }
    x.restore();
    x.lineWidth = 4;
    x.strokeStyle = '#1b1020';
    rr(x, w.x + 2, w.y + 2, w.w - 4, w.h - 4, Math.min(w.w, w.h) / 2);
    x.stroke();
    return true;
  },
  // the track
  ramp(x, w) {
    const vert = w.h > w.w;
    x.fillStyle = '#d9c9a3';
    x.fillRect(w.x, w.y, w.w, w.h);
    // planks across the slope, and the direction of travel
    x.strokeStyle = 'rgba(20,24,20,0.35)';
    x.lineWidth = 1.5;
    for (let i = 8; i < (vert ? w.h : w.w); i += 10) {
      x.beginPath();
      if (vert) {
        x.moveTo(w.x, w.y + i);
        x.lineTo(w.x + w.w, w.y + i);
      } else {
        x.moveTo(w.x + i, w.y);
        x.lineTo(w.x + i, w.y + w.h);
      }
      x.stroke();
    }
    const g = vert ? x.createLinearGradient(0, w.y, 0, w.y + w.h) : x.createLinearGradient(w.x, 0, w.x + w.w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0.2)');
    x.fillStyle = g;
    x.fillRect(w.x, w.y, w.w, w.h);
    x.strokeStyle = '#141814';
    x.lineWidth = 3;
    x.strokeRect(w.x + 1.5, w.y + 1.5, w.w - 3, w.h - 3);
    x.fillStyle = '#e8412c';
    x.beginPath();
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    if (vert) {
      x.moveTo(cx - 9, cy + 6);
      x.lineTo(cx, cy - 8);
      x.lineTo(cx + 9, cy + 6);
    } else {
      x.moveTo(cx - 6, cy - 9);
      x.lineTo(cx + 8, cy);
      x.lineTo(cx - 6, cy + 9);
    }
    x.closePath();
    x.fill();
    return true;
  },
  tyres(x, w) {
    for (const [ox, oy] of [[0.3, 0.3], [0.7, 0.32], [0.5, 0.68]]) {
      const cx = w.x + w.w * ox;
      const cy = w.y + w.h * oy;
      x.fillStyle = '#1b1d1b';
      x.beginPath();
      x.arc(cx, cy, w.w * 0.3, 0, TAU);
      x.fill();
      x.fillStyle = '#eef2e3';
      x.beginPath();
      x.arc(cx, cy, w.w * 0.12, 0, TAU);
      x.fill();
    }
    return true;
  },
  hay(x, w, k, rnd) {
    rr(x, w.x, w.y, w.w, w.h, 5);
    x.fillStyle = '#e5c25a';
    x.fill();
    x.strokeStyle = 'rgba(150,110,30,0.6)';
    x.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const px = w.x + rnd() * w.w;
      const py = w.y + rnd() * w.h;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (rnd() - 0.5) * 10, py + (rnd() - 0.5) * 4);
      x.stroke();
    }
    x.strokeStyle = '#8a3b1c';
    x.lineWidth = 2;
    x.beginPath();
    if (w.w > w.h) {
      x.moveTo(w.x + w.w * 0.3, w.y);
      x.lineTo(w.x + w.w * 0.3, w.y + w.h);
      x.moveTo(w.x + w.w * 0.7, w.y);
      x.lineTo(w.x + w.w * 0.7, w.y + w.h);
    } else {
      x.moveTo(w.x, w.y + w.h * 0.3);
      x.lineTo(w.x + w.w, w.y + w.h * 0.3);
      x.moveTo(w.x, w.y + w.h * 0.7);
      x.lineTo(w.x + w.w, w.y + w.h * 0.7);
    }
    x.stroke();
    x.strokeStyle = '#141814';
    x.lineWidth = 2;
    rr(x, w.x + 1, w.y + 1, w.w - 2, w.h - 2, 5);
    x.stroke();
    return true;
  },
};

function noiseRect(x, w, rnd) {
  x.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < (w.w * w.h) / 300; i++) x.fillRect(w.x + rnd() * w.w, w.y + rnd() * w.h, 2, 2);
}

// ------------------------------------------------------------ pits

function pitShape(x, r, rad = 18) {
  rr(x, r.x, r.y, r.w, r.h, rad);
}

const PIT = {
  lava(x, r, rnd) {
    const g = x.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, '#ff9a1f');
    g.addColorStop(0.5, '#ff5a14');
    g.addColorStop(1, '#ffb43a');
    x.fillStyle = '#3a0d05';
    x.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    x.fillStyle = g;
    x.fillRect(r.x, r.y, r.w, r.h);
    // crust drifting on top, bright cracks
    for (let i = 0; i < (r.w * r.h) / 1400; i++) {
      x.fillStyle = `rgba(60,15,5,${0.35 + rnd() * 0.3})`;
      x.beginPath();
      x.ellipse(r.x + rnd() * r.w, r.y + rnd() * r.h, 6 + rnd() * 12, 4 + rnd() * 6, rnd() * 3, 0, TAU);
      x.fill();
    }
    x.fillStyle = 'rgba(255,240,150,0.6)';
    for (let i = 0; i < (r.w * r.h) / 900; i++) x.fillRect(r.x + rnd() * r.w, r.y + rnd() * r.h, 2 + rnd() * 3, 2);
    return 'rgba(255,120,30,0.9)';
  },
  moat(x, r, rnd) {
    x.fillStyle = '#6c6a66';
    x.fillRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10);
    const g = x.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, '#2a6fa8');
    g.addColorStop(1, '#174a78');
    x.fillStyle = g;
    x.fillRect(r.x, r.y, r.w, r.h);
    x.strokeStyle = 'rgba(200,235,255,0.35)';
    x.lineWidth = 2;
    for (let i = 0; i < (r.w * r.h) / 2500; i++) {
      const px = r.x + 8 + rnd() * (r.w - 16);
      const py = r.y + 8 + rnd() * (r.h - 16);
      x.beginPath();
      x.arc(px, py, 6 + rnd() * 6, 3.6, 5.6);
      x.stroke();
    }
    return null;
  },
  water(x, r, rnd) {
    pitShape(x, r, 30);
    x.fillStyle = '#f4f8ff';
    x.lineWidth = 10;
    x.strokeStyle = 'rgba(255,255,255,0.95)';
    x.stroke();
    const g = x.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 4, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.6);
    g.addColorStop(0, '#0d2a4a');
    g.addColorStop(1, '#2b6a9a');
    x.fillStyle = g;
    x.fill();
    x.fillStyle = 'rgba(220,240,255,0.7)';
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.ellipse(r.x + 15 + rnd() * (r.w - 30), r.y + 15 + rnd() * (r.h - 30), 8 + rnd() * 10, 4 + rnd() * 5, rnd() * 3, 0, TAU);
      x.fill();
    }
    return null;
  },
  sand(x, r) {
    pitShape(x, r, 40);
    const g = x.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 4, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.6);
    g.addColorStop(0, '#6e4520');
    g.addColorStop(1, '#b07a3c');
    x.fillStyle = g;
    x.fill();
    x.strokeStyle = 'rgba(60,35,15,0.4)';
    x.lineWidth = 2;
    for (let k = 1; k < 5; k++) {
      x.beginPath();
      x.ellipse(r.x + r.w / 2, r.y + r.h / 2, (r.w / 2) * (k / 5), (r.h / 2) * (k / 5), k * 0.4, 0, TAU * 0.8);
      x.stroke();
    }
    return null;
  },
  mempool(x, r, rnd) {
    x.fillStyle = '#05030c';
    x.fillRect(r.x, r.y, r.w, r.h);
    const g = x.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 2, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.6);
    g.addColorStop(0, 'rgba(170,90,255,0.6)');
    g.addColorStop(1, 'rgba(20,10,40,0)');
    x.fillStyle = g;
    x.fillRect(r.x, r.y, r.w, r.h);
    // pending transactions falling in
    x.fillStyle = 'rgba(120,200,255,0.55)';
    for (let i = 0; i < 18; i++) {
      const a = rnd() * TAU;
      const d = rnd() * r.w * 0.45;
      x.fillRect(r.x + r.w / 2 + Math.cos(a) * d, r.y + r.h / 2 + Math.sin(a) * d, 8, 3);
    }
    x.strokeStyle = 'rgba(170,90,255,0.9)';
    x.lineWidth = 3;
    x.setLineDash([10, 6]);
    x.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    x.setLineDash([]);
    x.fillStyle = 'rgba(200,170,255,0.7)';
    x.font = '700 12px "IBM Plex Mono", monospace';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('MEMPOOL', r.x + r.w / 2, r.y + 14);
    return 'rgba(170,90,255,0.8)';
  },
  jelly(x, r, rnd) {
    pitShape(x, r, 36);
    x.fillStyle = '#5ee07a';
    x.fill();
    x.lineWidth = 4;
    x.strokeStyle = '#1b1020';
    x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.beginPath();
    x.ellipse(r.x + r.w * 0.3, r.y + r.h * 0.3, r.w * 0.14, r.h * 0.08, -0.4, 0, TAU);
    x.fill();
    for (let i = 0; i < 5; i++) {
      x.fillStyle = 'rgba(255,255,255,0.4)';
      x.beginPath();
      x.arc(r.x + 15 + rnd() * (r.w - 30), r.y + 15 + rnd() * (r.h - 30), 3 + rnd() * 4, 0, TAU);
      x.fill();
    }
    return null;
  },
  mud(x, r, rnd) {
    pitShape(x, r, 40);
    x.fillStyle = '#6b4a2b';
    x.fill();
    x.lineWidth = 3;
    x.strokeStyle = '#141814';
    x.stroke();
    x.fillStyle = 'rgba(40,25,10,0.5)';
    for (let i = 0; i < 12; i++) {
      x.beginPath();
      x.ellipse(r.x + 20 + rnd() * (r.w - 40), r.y + 15 + rnd() * (r.h - 30), 8 + rnd() * 14, 4 + rnd() * 6, rnd() * 3, 0, TAU);
      x.fill();
    }
    x.strokeStyle = 'rgba(20,24,20,0.5)';
    x.lineWidth = 2;
    x.setLineDash([6, 5]);
    x.beginPath();
    x.moveTo(r.x + 10, r.y + r.h * 0.45);
    x.bezierCurveTo(r.x + r.w * 0.4, r.y + r.h * 0.2, r.x + r.w * 0.6, r.y + r.h * 0.8, r.x + r.w - 10, r.y + r.h * 0.5);
    x.stroke();
    x.setLineDash([]);
    return null;
  },
};

// ------------------------------------------------------------ ground decals per chunk

const GROUND = {
  chain(x, px, py, rnd) {
    const k = rnd();
    if (k < 0.5) {
      x.fillStyle = 'rgba(90,170,255,0.12)';
      x.font = '600 12px "IBM Plex Mono", monospace';
      x.textAlign = 'left';
      x.fillText(`0x${Math.floor(rnd() * 0xffffffff).toString(16)}`, px, py);
    } else {
      const g = x.createRadialGradient(px, py, 0, px, py, 26);
      g.addColorStop(0, 'rgba(80,200,255,0.2)');
      g.addColorStop(1, 'rgba(80,200,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(px, py, 26, 0, TAU);
      x.fill();
    }
  },
  lego(x, px, py, rnd) {
    // a stray 1x1 piece lying flat
    const col = LEGO[Math.floor(rnd() * LEGO.length)];
    x.fillStyle = 'rgba(0,0,0,0.2)';
    x.fillRect(px + 2, py + 3, 16, 16);
    x.fillStyle = col;
    x.fillRect(px, py, 16, 16);
    x.fillStyle = 'rgba(255,255,255,0.3)';
    x.beginPath();
    x.arc(px + 8, py + 8, 5, 0, TAU);
    x.fill();
  },
  dunes(x, px, py, rnd) {
    if (rnd() < 0.5) {
      // a bleached skull or a stone
      x.fillStyle = 'rgba(240,230,210,0.7)';
      x.beginPath();
      x.ellipse(px, py, 6, 4.5, rnd(), 0, TAU);
      x.fill();
    } else {
      x.fillStyle = 'rgba(90,60,30,0.35)';
      x.beginPath();
      x.ellipse(px, py, 10 + rnd() * 12, 5 + rnd() * 6, rnd() * 3, 0, TAU);
      x.fill();
    }
  },
  snow(x, px, py, rnd) {
    // footprints across the snow
    const a = rnd() * TAU;
    x.fillStyle = 'rgba(120,150,190,0.22)';
    for (let i = 0; i < 6; i++) {
      const s = i % 2 ? 5 : -5;
      x.beginPath();
      x.ellipse(px + Math.cos(a) * i * 16 - Math.sin(a) * s, py + Math.sin(a) * i * 16 + Math.cos(a) * s, 4, 2.5, a, 0, TAU);
      x.fill();
    }
  },
  lava(x, px, py, rnd) {
    const g = x.createRadialGradient(px, py, 0, px, py, 30);
    g.addColorStop(0, 'rgba(255,100,20,0.18)');
    g.addColorStop(1, 'rgba(255,100,20,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, 30, 0, TAU);
    x.fill();
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.beginPath();
    x.ellipse(px, py, 5 + rnd() * 6, 4 + rnd() * 4, rnd() * 3, 0, TAU);
    x.fill();
  },
  city(x, px, py, rnd) {
    const k = rnd();
    if (k < 0.4) {
      // a manhole
      x.fillStyle = '#121418';
      x.beginPath();
      x.arc(px, py, 16, 0, TAU);
      x.fill();
      x.strokeStyle = '#30343c';
      x.lineWidth = 3;
      x.stroke();
    } else if (k < 0.7) {
      // a puddle
      x.fillStyle = 'rgba(15,20,35,0.7)';
      x.beginPath();
      x.ellipse(px, py, 24, 12, rnd() * 3, 0, TAU);
      x.fill();
      x.strokeStyle = 'rgba(120,170,255,0.15)';
      x.lineWidth = 2;
      x.stroke();
    } else {
      // graffiti tag
      x.strokeStyle = ['rgba(255,80,160,0.35)', 'rgba(80,220,255,0.35)', 'rgba(255,210,60,0.35)'][Math.floor(rnd() * 3)];
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(px, py);
      for (let i = 0; i < 6; i++) x.lineTo(px + i * 8, py + (rnd() - 0.5) * 18);
      x.stroke();
    }
  },
  neon(x, px, py, rnd) {
    const hue = rnd() < 0.5 ? '255,60,200' : '60,230,255';
    x.strokeStyle = `rgba(${hue},0.35)`;
    x.lineWidth = 2;
    x.beginPath();
    const s = 8 + rnd() * 10;
    if (rnd() < 0.5) x.arc(px, py, s, 0, TAU);
    else {
      x.moveTo(px - s, py + s);
      x.lineTo(px, py - s);
      x.lineTo(px + s, py + s);
      x.closePath();
    }
    x.stroke();
  },
  blackout(x, px, py, rnd) {
    if (rnd() < 0.6) {
      x.strokeStyle = 'rgba(90,70,45,0.45)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (rnd() - 0.5) * 30, py + (rnd() - 0.5) * 30);
      x.stroke();
    } else {
      // a mushroom ring that glows faintly
      x.fillStyle = 'rgba(140,255,170,0.25)';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        x.beginPath();
        x.arc(px + Math.cos(a) * 12, py + Math.sin(a) * 12, 2.5, 0, TAU);
        x.fill();
      }
    }
  },
  fantasy(x, px, py, rnd) {
    if (rnd() < 0.6) {
      // flowers
      const col = ['#ffd6f2', '#fff27a', '#a8d8ff', '#ff8a8a'][Math.floor(rnd() * 4)];
      for (let i = 0; i < 5; i++) {
        x.fillStyle = col;
        x.beginPath();
        x.arc(px + (rnd() - 0.5) * 30, py + (rnd() - 0.5) * 30, 2.5, 0, TAU);
        x.fill();
      }
    } else {
      // a worn cobble path stone
      x.fillStyle = 'rgba(150,145,130,0.4)';
      rr(x, px, py, 22, 16, 5);
      x.fill();
    }
  },
  toon(x, px, py, rnd) {
    // sprinkles
    const col = ['#ff4d6d', '#45c4ff', '#ffd23f', '#7cf29c', '#8a5cff'][Math.floor(rnd() * 5)];
    x.strokeStyle = col;
    x.lineWidth = 4;
    x.lineCap = 'round';
    const a = rnd() * TAU;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * 9, py + Math.sin(a) * 9);
    x.stroke();
    x.lineCap = 'butt';
  },
  gravity(x, px, py, rnd) {
    if (rnd() < 0.25) bike(x, px, py, rnd() * TAU, 0.9);
    else {
      // tyre marks
      x.strokeStyle = 'rgba(20,24,20,0.15)';
      x.lineWidth = 3;
      x.beginPath();
      const a = rnd() * TAU;
      x.moveTo(px, py);
      x.quadraticCurveTo(px + Math.cos(a) * 40, py + Math.sin(a) * 40, px + Math.cos(a + 0.6) * 70, py + Math.sin(a + 0.6) * 70);
      x.stroke();
    }
  },
};

// big shapes painted under everything else: the city's streets, the bike track
const UNDER = {
  city(x, map, near) {
    for (const r of map.roads ?? []) {
      const rect = r.vertical ? { x: r.at - r.w / 2, y: 0, w: r.w, h: map.h } : { x: 0, y: r.at - r.w / 2, w: map.w, h: r.w };
      if (!near(rect)) continue;
      x.fillStyle = '#16171b';
      x.fillRect(rect.x, rect.y, rect.w, rect.h);
      x.strokeStyle = 'rgba(240,240,240,0.5)';
      x.lineWidth = 3;
      x.setLineDash([30, 26]);
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
      x.strokeStyle = 'rgba(230,190,60,0.6)';
      x.lineWidth = 2;
      x.beginPath();
      if (r.vertical) {
        x.moveTo(rect.x + 4, 0);
        x.lineTo(rect.x + 4, map.h);
        x.moveTo(rect.x + rect.w - 4, 0);
        x.lineTo(rect.x + rect.w - 4, map.h);
      } else {
        x.moveTo(0, rect.y + 4);
        x.lineTo(map.w, rect.y + 4);
        x.moveTo(0, rect.y + rect.h - 4);
        x.lineTo(map.w, rect.y + rect.h - 4);
      }
      x.stroke();
    }
    // zebra crossings where the streets meet
    const v = (map.roads ?? []).filter((r) => r.vertical);
    const h = (map.roads ?? []).filter((r) => !r.vertical);
    x.fillStyle = 'rgba(235,235,235,0.55)';
    for (const a of v)
      for (const b of h) {
        if (!near({ x: a.at - 100, y: b.at - 100, w: 200, h: 200 })) continue;
        for (let i = -a.w / 2 + 8; i < a.w / 2 - 8; i += 16) {
          x.fillRect(a.at + i, b.at - b.w / 2 - 22, 9, 18);
          x.fillRect(a.at + i, b.at + b.w / 2 + 4, 9, 18);
        }
        for (let i = -b.w / 2 + 8; i < b.w / 2 - 8; i += 16) {
          x.fillRect(a.at - a.w / 2 - 22, b.at + i, 18, 9);
          x.fillRect(a.at + a.w / 2 + 4, b.at + i, 18, 9);
        }
      }
  },
  gravity(x, map, near) {
    const t = map.track;
    if (!t) return;
    if (!near({ x: t.cx - t.rx - t.w, y: t.cy - t.ry - t.w, w: (t.rx + t.w) * 2, h: (t.ry + t.w) * 2 })) return;
    x.strokeStyle = '#c9a77a';
    x.lineWidth = t.w;
    x.beginPath();
    x.ellipse(t.cx, t.cy, t.rx, t.ry, 0, 0, TAU);
    x.stroke();
    // the lane's inked edges, like the old line-drawn bike games
    x.strokeStyle = '#141814';
    x.lineWidth = 3;
    for (const d of [-t.w / 2, t.w / 2]) {
      x.beginPath();
      x.ellipse(t.cx, t.cy, t.rx + d, t.ry + d, 0, 0, TAU);
      x.stroke();
    }
    x.strokeStyle = 'rgba(20,24,20,0.25)';
    x.lineWidth = 2;
    x.setLineDash([18, 14]);
    x.beginPath();
    x.ellipse(t.cx, t.cy, t.rx, t.ry, 0, 0, TAU);
    x.stroke();
    x.setLineDash([]);
    // the start / finish line, chequered
    const sx = t.cx + t.rx;
    const sz = 12;
    for (let i = -t.w / 2; i < t.w / 2; i += sz)
      for (let j = 0; j < 3; j++) {
        x.fillStyle = (Math.floor(i / sz) + j) % 2 ? '#141814' : '#ffffff';
        x.fillRect(sx + i, t.cy - 18 + j * sz, sz, sz);
      }
    x.fillStyle = '#141814';
    x.font = '900 28px "Big Shoulders Stencil Display", Impact, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('START', sx, t.cy - 40);
  },
};

// ------------------------------------------------------------ the themes

// dark: the night outside your sight (alpha is how much it hides); fence: the perimeter;
// mini: minimap colours; weather: the particles drifting over the screen; glow: what lights
// up the dark (pits that glow, street lamps)
export const THEME = {
  chain: { dark: 'rgba(3, 5, 16, 0.9)', fence: '#141a33', mini: ['#0b1124', '#3b4c86', '#8a5cff'], weather: 'bits', vault: 'rgba(80,200,255,0.12)' },
  lego: { dark: 'rgba(16, 18, 30, 0.6)', fence: '#d0312d', mini: ['#2e9e46', '#f2c12e', '#1f63c6'], weather: null, vault: 'rgba(255,255,255,0.06)', bright: true },
  dunes: { dark: 'rgba(40, 20, 8, 0.58)', fence: '#8d5a2b', mini: ['#d4a462', '#9a4a28', '#6e4520'], weather: 'sand', vault: 'rgba(255,200,120,0.1)', bright: true },
  snow: { dark: 'rgba(10, 22, 44, 0.62)', fence: '#8aa0b8', mini: ['#dfe8f2', '#2f6648', '#2b6a9a'], weather: 'snow', vault: 'rgba(160,200,255,0.12)', bright: true },
  lava: { dark: 'rgba(14, 3, 0, 0.82)', fence: '#2a0f08', mini: ['#1b1311', '#4a3a55', '#ff6a1a'], weather: 'embers', vault: 'rgba(255,90,20,0.12)' },
  city: { dark: 'rgba(4, 6, 14, 0.88)', fence: '#22252c', mini: ['#1c1e24', '#4a4f5c', '#2b6a9a'], weather: 'rain', vault: 'rgba(255,210,120,0.08)' },
  neon: { dark: 'rgba(22, 0, 40, 0.5)', fence: '#ff3cc8', mini: ['#140828', '#ff3cc8', '#3ce6ff'], weather: 'sparkle', vault: 'rgba(255,60,200,0.12)', bright: true },
  blackout: { dark: 'rgba(0, 0, 0, 0.975)', fence: '#0b0f0b', mini: ['#0d130e', '#1f4127', '#3a3f3a'], weather: 'fireflies', vault: 'rgba(0,0,0,0.25)' },
  fantasy: { dark: 'rgba(12, 10, 30, 0.62)', fence: '#5b5955', mini: ['#4a7a34', '#86837d', '#2a6fa8'], weather: 'petals', vault: 'rgba(255,230,150,0.1)', bright: true },
  toon: { dark: 'rgba(50, 20, 70, 0.42)', fence: '#1b1020', mini: ['#ffe4f1', '#ff4d6d', '#5ee07a'], weather: 'confetti', vault: 'rgba(255,255,255,0.08)', bright: true },
  gravity: { dark: 'rgba(16, 24, 16, 0.45)', fence: '#141814', mini: ['#eef2e3', '#141814', '#6b4a2b'], weather: null, vault: 'rgba(255,255,255,0.06)', bright: true },
};

const floors = new Map();
export function floorTex(theme) {
  if (!FLOOR[theme]) return null;
  if (!floors.has(theme)) floors.set(theme, FLOOR[theme]());
  return floors.get(theme);
}

export function drawThemeWall(x, w, k, seed) {
  const rnd = mulberry32((seed ^ (w.x * 73856093) ^ (w.y * 19349663)) >>> 0);
  const name = k.kind.replace(/\d+$/, '');
  const f = WALL[name];
  if (!f) return false;
  return f(x, w, k, rnd) !== false;
}

export function drawPit(x, r, seed) {
  const rnd = mulberry32((seed ^ (r.x * 83492791) ^ (r.y * 2971215073)) >>> 0);
  return (PIT[r.k] ?? PIT.lava)(x, r, rnd);
}

export function drawUnder(theme, x, map, near) {
  UNDER[theme]?.(x, map, near);
}

export function drawGroundBits(theme, x, n, at, rnd) {
  const f = GROUND[theme];
  if (!f) return;
  for (let i = 0; i < n; i++) {
    const [px, py] = at();
    if (px != null) f(x, px, py, rnd);
  }
}

// the points that light up the dark: glowing pits, street lamps, neon, torches
export function glowPoints(map) {
  const out = [];
  for (const r of map.pits ?? []) {
    if (r.k !== 'lava' && r.k !== 'mempool') continue;
    const step = 70;
    for (let i = r.x + step / 2; i < r.x + r.w; i += step) for (let j = r.y + step / 2; j < r.y + r.h; j += step) out.push({ x: i, y: j, r: 120, a: 0.75 });
  }
  if (map.theme === 'city')
    for (const rd of map.roads ?? [])
      for (let k = 150; k < (rd.vertical ? map.h : map.w); k += 320) out.push(rd.vertical ? { x: rd.at - rd.w / 2 + 6, y: k, r: 150, a: 0.7 } : { x: k, y: rd.at - rd.w / 2 + 6, r: 150, a: 0.7 });
  if (map.theme === 'neon' || map.theme === 'chain') for (const w of map.walls) if (w.k === 'pillar' || w.k === 'block') out.push({ x: w.x + w.w / 2, y: w.y + w.h / 2, r: 110, a: 0.55 });
  if (map.theme === 'fantasy') for (const w of map.walls) if (w.k === 'tower') out.push({ x: w.x + w.w / 2, y: w.y + w.h / 2, r: 140, a: 0.6 });
  return out;
}

// ------------------------------------------------------------ weather

const WEATHER = {
  snow: { n: 90, col: () => 'rgba(255,255,255,0.85)', size: [1.5, 3.5], vx: [-12, 12], vy: [30, 70], shape: 'dot' },
  embers: { n: 50, col: (r) => `rgba(255,${120 + Math.floor(r() * 100)},40,0.9)`, size: [1.2, 2.6], vx: [-10, 10], vy: [-60, -25], shape: 'dot', glow: true },
  sand: { n: 70, col: () => 'rgba(230,190,130,0.4)', size: [1, 2], vx: [160, 260], vy: [-10, 20], shape: 'streak' },
  rain: { n: 110, col: () => 'rgba(160,190,230,0.35)', size: [1, 1.5], vx: [-40, -20], vy: [520, 700], shape: 'rain' },
  bits: { n: 40, col: (r) => (r() < 0.5 ? 'rgba(80,200,255,0.55)' : 'rgba(170,120,255,0.55)'), size: [9, 12], vx: [-4, 4], vy: [-30, -14], shape: 'bit' },
  sparkle: { n: 50, col: (r) => (r() < 0.5 ? 'rgba(255,90,220,0.9)' : 'rgba(90,230,255,0.9)'), size: [1, 2.5], vx: [-8, 8], vy: [-14, 14], shape: 'twinkle', glow: true },
  fireflies: { n: 26, col: () => 'rgba(190,255,140,0.95)', size: [1.5, 2.5], vx: [-14, 14], vy: [-14, 14], shape: 'twinkle', glow: true, wander: true },
  petals: { n: 40, col: (r) => (r() < 0.5 ? 'rgba(255,190,220,0.85)' : 'rgba(255,240,170,0.8)'), size: [2.5, 4], vx: [20, 50], vy: [15, 40], shape: 'petal' },
  confetti: { n: 46, col: (r) => ['#ff4d6d', '#45c4ff', '#ffd23f', '#7cf29c', '#8a5cff'][Math.floor(r() * 5)], size: [3, 5], vx: [-20, 20], vy: [30, 60], shape: 'petal' },
};

export class Weather {
  constructor(kind) {
    this.kind = WEATHER[kind] ? kind : null;
    this.ps = [];
    this.last = 0;
  }

  // screen space, after the darkness; parallax with the camera so it sits in the world
  draw(ctx, w, h, cam, now, reduced, quality) {
    const W = WEATHER[this.kind];
    if (!W || reduced) return;
    const n = Math.round(W.n * (quality >= 2 ? 1 : quality === 1 ? 0.6 : 0.3));
    const rnd = Math.random;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    while (this.ps.length < n)
      this.ps.push({
        x: rnd() * w,
        y: rnd() * h,
        vx: W.vx[0] + rnd() * (W.vx[1] - W.vx[0]),
        vy: W.vy[0] + rnd() * (W.vy[1] - W.vy[0]),
        s: W.size[0] + rnd() * (W.size[1] - W.size[0]),
        c: W.col(rnd),
        ph: rnd() * TAU,
        g: rnd() < 0.5 ? '0' : '1',
      });
    this.ps.length = n;
    const dx = this.cam ? cam.x - this.cam.x : 0;
    const dy = this.cam ? cam.y - this.cam.y : 0;
    this.cam = { x: cam.x, y: cam.y };
    ctx.save();
    if (W.glow) ctx.globalCompositeOperation = 'lighter';
    for (const p of this.ps) {
      if (W.wander) {
        p.vx += (rnd() - 0.5) * 30 * dt;
        p.vy += (rnd() - 0.5) * 30 * dt;
        p.vx = Math.max(-20, Math.min(20, p.vx));
        p.vy = Math.max(-20, Math.min(20, p.vy));
      }
      p.x += p.vx * dt - dx * 1.1;
      p.y += p.vy * dt - dy * 1.1;
      if (p.x < -20) p.x += w + 40;
      if (p.x > w + 20) p.x -= w + 40;
      if (p.y < -20) p.y += h + 40;
      if (p.y > h + 20) p.y -= h + 40;
      ctx.fillStyle = p.c;
      ctx.strokeStyle = p.c;
      switch (W.shape) {
        case 'streak':
          ctx.fillRect(p.x, p.y, p.s * 9, p.s * 0.7);
          break;
        case 'rain':
          ctx.lineWidth = p.s;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 0.03, p.y + p.vy * 0.03);
          ctx.stroke();
          break;
        case 'bit':
          ctx.font = `600 ${p.s}px "IBM Plex Mono", monospace`;
          ctx.fillText(p.g, p.x, p.y);
          break;
        case 'twinkle': {
          const a = 0.35 + 0.65 * Math.abs(Math.sin(now / 400 + p.ph));
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s * 2.2, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'petal':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(now / 600 + p.ph);
          ctx.fillRect(-p.s, -p.s / 2, p.s * 2, p.s);
          ctx.restore();
          break;
        default:
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s, 0, TAU);
          ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------ the night maps (2nd wave)
// Eight more maps, all drawn for the night from the start (like the docks): dark floors, lit
// things that glow through the dark, colour only where a light falls on it.

Object.assign(FLOOR, {
  speedway: () =>
    tile('#0f1510', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 10, alpha: 0.08 });
      speckle(x, S, S, rnd, 900, 'rgba(60,90,50,0.25)', 2);
      speckle(x, S, S, rnd, 300, 'rgba(0,0,0,0.35)', 2);
    }, 201),
  skate: () =>
    tile('#16181d', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 12, alpha: 0.07 });
      x.strokeStyle = 'rgba(0,0,0,0.5)';
      x.lineWidth = 2;
      x.beginPath();
      for (let i = 0; i <= S; i += 128) {
        x.moveTo(i, 0);
        x.lineTo(i, S);
        x.moveTo(0, i);
        x.lineTo(S, i);
      }
      x.stroke();
      speckle(x, S, S, rnd, 400, 'rgba(255,255,255,0.04)', 1);
    }, 202),
  metro: () =>
    tile('#14161a', (x, rnd) => {
      const g = 32;
      for (let i = 0; i < S; i += g)
        for (let j = 0; j < S; j += g) {
          x.fillStyle = (i / g + j / g) % 2 ? '#181b20' : '#121418';
          x.fillRect(i + 1, j + 1, g - 2, g - 2);
        }
      noiseLayer(x, S, S, rnd, { cells: 8, alpha: 0.06 });
    }, 203),
  factory: () =>
    tile('#15171a', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 10, alpha: 0.06 });
      x.strokeStyle = 'rgba(0,0,0,0.6)';
      x.lineWidth = 2;
      for (let i = 0; i <= S; i += 64) {
        x.beginPath();
        x.moveTo(i, 0);
        x.lineTo(i, S);
        x.moveTo(0, i);
        x.lineTo(S, i);
        x.stroke();
      }
      x.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 8; i < S; i += 64) for (let j = 8; j < S; j += 64) for (const [a, b] of [[0, 0], [48, 0], [0, 48], [48, 48]]) x.fillRect(i + a, j + b, 3, 3);
      speckle(x, S, S, rnd, 120, 'rgba(120,80,30,0.2)', 3);
    }, 204),
  jungle: () =>
    tile('#0c140c', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 8, alpha: 0.08 });
      for (let i = 0; i < 160; i++) {
        x.fillStyle = `rgba(${20 + rnd() * 30}, ${50 + rnd() * 40}, 20, ${0.25 + rnd() * 0.25})`;
        x.beginPath();
        x.ellipse(rnd() * S, rnd() * S, 4 + rnd() * 8, 2 + rnd() * 3, rnd() * 3, 0, TAU);
        x.fill();
      }
    }, 205),
  junkyard: () =>
    tile('#17130f', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 9, alpha: 0.09 });
      speckle(x, S, S, rnd, 500, 'rgba(90,70,50,0.3)', 2);
      speckle(x, S, S, rnd, 200, 'rgba(0,0,0,0.4)', 3);
    }, 206),
  moon: () =>
    tile('#1a1b1f', (x, rnd) => {
      noiseLayer(x, S, S, rnd, { cells: 7, alpha: 0.1 });
      for (let i = 0; i < 14; i++) {
        const r = 4 + rnd() * 16;
        const cx = rnd() * S;
        const cy = rnd() * S;
        x.strokeStyle = 'rgba(0,0,0,0.35)';
        x.lineWidth = 2;
        x.beginPath();
        x.arc(cx, cy, r, 0, TAU);
        x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.05)';
        x.beginPath();
        x.arc(cx - 1, cy - 1, r, Math.PI, TAU * 0.85);
        x.stroke();
      }
    }, 207),
  casino: () =>
    tile('#1e0a10', (x) => {
      x.strokeStyle = 'rgba(200,150,60,0.12)';
      x.lineWidth = 2;
      for (let i = -S; i < S * 2; i += 48) {
        x.beginPath();
        x.moveTo(i, 0);
        x.lineTo(i + S, S);
        x.moveTo(i + S, 0);
        x.lineTo(i, S);
        x.stroke();
      }
      x.fillStyle = 'rgba(200,150,60,0.16)';
      for (let i = 24; i < S; i += 48) for (let j = 0; j < S; j += 48) {
        x.beginPath();
        x.arc(i, j, 3, 0, TAU);
        x.fill();
      }
    }, 208),
});

// a soft lamp pool painted on the floor (the dark makes it read as light)
function lampPool(x, cx, cy, r, col) {
  const g = x.createRadialGradient(cx, cy, 2, cx, cy, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
}

Object.assign(WALL, {
  barrier(x, w) {
    x.fillStyle = '#6d7177';
    x.fillRect(w.x, w.y, w.w, w.h);
    // red and white chevrons along the barrier
    const long = w.w > w.h;
    const n = Math.floor((long ? w.w : w.h) / 20);
    for (let i = 0; i < n; i++) {
      x.fillStyle = i % 2 ? '#d33a2c' : '#e9e9e9';
      if (long) x.fillRect(w.x + i * 20, w.y + 3, 20, w.h - 6);
      else x.fillRect(w.x + 3, w.y + i * 20, w.w - 6, 20);
    }
    bevel(x, w, 0.18, 0.45, 3);
    outline(x, w);
    return true;
  },
  garage(x, w) {
    x.fillStyle = '#25282e';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.fillStyle = '#3a3f48';
    for (let i = w.y + 6; i < w.y + w.h - 6; i += 8) x.fillRect(w.x + 8, i, w.w - 16, 4);
    x.fillStyle = '#ffd34d';
    x.fillRect(w.x, w.y, w.w, 5);
    bevel(x, w);
    outline(x, w);
    return true;
  },
  qpipe(x, w) {
    const long = w.w > w.h;
    const g = long ? x.createLinearGradient(0, w.y, 0, w.y + w.h) : x.createLinearGradient(w.x, 0, w.x + w.w, 0);
    g.addColorStop(0, '#5a5f6a');
    g.addColorStop(1, '#1d2026');
    x.fillStyle = g;
    rr(x, w.x, w.y, w.w, w.h, 8);
    x.fill();
    x.strokeStyle = '#c9ccd2';
    x.lineWidth = 3;
    x.beginPath();
    if (long) {
      x.moveTo(w.x + 4, w.y + 3);
      x.lineTo(w.x + w.w - 4, w.y + 3);
    } else {
      x.moveTo(w.x + 3, w.y + 4);
      x.lineTo(w.x + 3, w.y + w.h - 4);
    }
    x.stroke();
    // a tag sprayed on it
    x.strokeStyle = ['#ff3cc8', '#3ce6ff', '#a3e635'][Math.floor((w.x + w.y) % 3)];
    x.lineWidth = 2.5;
    x.beginPath();
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    x.moveTo(cx - 18, cy + 4);
    x.quadraticCurveTo(cx - 8, cy - 12, cx, cy + 2);
    x.quadraticCurveTo(cx + 8, cy + 14, cx + 18, cy - 6);
    x.stroke();
    return true;
  },
  funbox(x, w) {
    x.fillStyle = '#2b2f37';
    rr(x, w.x, w.y, w.w, w.h, 6);
    x.fill();
    x.fillStyle = '#3a3f49';
    rr(x, w.x + 12, w.y + 12, w.w - 24, w.h - 24, 4);
    x.fill();
    x.strokeStyle = '#a7adb8';
    x.lineWidth = 2;
    rr(x, w.x + 1, w.y + 1, w.w - 2, w.h - 2, 6);
    x.stroke();
    return true;
  },
  rail(x, w) {
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.fillRect(w.x + 3, w.y + 3, w.w, w.h);
    x.fillStyle = '#c9ccd2';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.fillStyle = '#ffffff';
    if (w.w > w.h) x.fillRect(w.x, w.y + 2, w.w, 2);
    else x.fillRect(w.x + 2, w.y, 2, w.h);
    return true;
  },
  platform(x, w) {
    x.fillStyle = '#3a3d44';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.fillStyle = '#ffd34d';
    if (w.w > w.h) x.fillRect(w.x, w.y + w.h / 2 - 3, w.w, 6);
    else x.fillRect(w.x + w.w / 2 - 3, w.y, 6, w.h);
    outline(x, w);
    return true;
  },
  column(x, w) {
    x.fillStyle = '#2d3038';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.fillStyle = '#3ce6ff';
    x.fillRect(w.x + 4, w.y + 4, w.w - 8, 4);
    bevel(x, w, 0.12, 0.5, 4);
    outline(x, w);
    return true;
  },
  bench(x, w) {
    x.fillStyle = '#4a3324';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.fillStyle = 'rgba(0,0,0,0.3)';
    if (w.w > w.h) for (let i = w.x + 10; i < w.x + w.w; i += 14) x.fillRect(i, w.y, 2, w.h);
    else for (let i = w.y + 10; i < w.y + w.h; i += 14) x.fillRect(w.x, i, w.w, 2);
    outline(x, w);
    return true;
  },
  machine(x, w, k, rnd) {
    x.fillStyle = '#2f343c';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.fillStyle = '#20242a';
    x.fillRect(w.x + 8, w.y + 8, w.w - 16, w.h - 16);
    // pipes and a status light
    x.strokeStyle = '#5b6370';
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(w.x + 14, w.y + w.h - 14);
    x.lineTo(w.x + w.w * 0.5, w.y + w.h - 14);
    x.lineTo(w.x + w.w * 0.5, w.y + 18);
    x.stroke();
    x.fillStyle = rnd() < 0.5 ? '#3ddc97' : '#ff4d5e';
    x.beginPath();
    x.arc(w.x + w.w - 16, w.y + 16, 5, 0, TAU);
    x.fill();
    x.strokeStyle = hazardLine(x);
    x.lineWidth = 6;
    x.strokeRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6);
    bevel(x, w);
    return true;
  },
  conveyor(x, w) {
    x.fillStyle = '#1b1e23';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.fillStyle = '#3a3f48';
    const long = w.w > w.h;
    for (let i = 4; i < (long ? w.w : w.h) - 4; i += 12) {
      if (long) x.fillRect(w.x + i, w.y + 4, 6, w.h - 8);
      else x.fillRect(w.x + 4, w.y + i, w.w - 8, 6);
    }
    x.fillStyle = '#ffb347';
    if (long) {
      x.fillRect(w.x, w.y, w.w, 3);
      x.fillRect(w.x, w.y + w.h - 3, w.w, 3);
    } else {
      x.fillRect(w.x, w.y, 3, w.h);
      x.fillRect(w.x + w.w - 3, w.y, 3, w.h);
    }
    return true;
  },
  barrel(x, w, k, rnd) {
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    const r = w.w / 2;
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.beginPath();
    x.arc(cx + 4, cy + 5, r, 0, TAU);
    x.fill();
    x.fillStyle = ['#7a2b20', '#24506a', '#5b5f2a'][Math.floor(rnd() * 3)];
    x.beginPath();
    x.arc(cx, cy, r, 0, TAU);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.5)';
    x.lineWidth = 2;
    for (const k2 of [0.55, 0.85]) {
      x.beginPath();
      x.arc(cx, cy, r * k2, 0, TAU);
      x.stroke();
    }
    x.fillStyle = '#ffd34d';
    x.font = `900 ${Math.floor(r)}px sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('☢', cx, cy + 1);
    return true;
  },
  temple(x, w, k, rnd) {
    x.fillStyle = '#3a3b30';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.strokeStyle = 'rgba(0,0,0,0.45)';
    x.lineWidth = 2;
    for (let j = w.y + 14; j < w.y + w.h; j += 14) {
      x.beginPath();
      x.moveTo(w.x, j);
      x.lineTo(w.x + w.w, j);
      x.stroke();
      for (let i = w.x + ((j / 14) % 2 ? 0 : 14); i < w.x + w.w; i += 28) {
        x.beginPath();
        x.moveTo(i, j - 14);
        x.lineTo(i, j);
        x.stroke();
      }
    }
    // moss and a carved glyph that glows
    x.fillStyle = 'rgba(40,90,40,0.45)';
    for (let i = 0; i < 8; i++) {
      x.beginPath();
      x.ellipse(w.x + rnd() * w.w, w.y + rnd() * w.h, 6 + rnd() * 10, 4 + rnd() * 6, 0, 0, TAU);
      x.fill();
    }
    if (w.w > 60 && w.h > 60) {
      x.strokeStyle = 'rgba(120,255,200,0.55)';
      x.lineWidth = 2;
      const cx = w.x + w.w / 2;
      const cy = w.y + w.h / 2;
      x.beginPath();
      x.arc(cx, cy, 12, 0, TAU);
      x.moveTo(cx, cy - 18);
      x.lineTo(cx, cy + 18);
      x.moveTo(cx - 18, cy);
      x.lineTo(cx + 18, cy);
      x.stroke();
    }
    bevel(x, w);
    outline(x, w);
    return true;
  },
  palm(x, w, k, rnd) {
    tree(x, w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h) * 0.85, ['#0d2412', '#14361b', '#1d4a25'], rnd);
    return true;
  },
  wreck(x, w, k, rnd) {
    const cols = ['#5a2a20', '#2a3a4a', '#4a4a2a', '#3a2a40'];
    x.fillStyle = cols[Math.floor(rnd() * cols.length)];
    rr(x, w.x, w.y, w.w, w.h, 10);
    x.fill();
    // rust, a smashed windscreen, dents
    x.fillStyle = 'rgba(140,70,30,0.45)';
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      x.ellipse(w.x + rnd() * w.w, w.y + rnd() * w.h, 5 + rnd() * 9, 3 + rnd() * 5, rnd() * 3, 0, TAU);
      x.fill();
    }
    x.fillStyle = 'rgba(120,160,190,0.25)';
    const long = w.w > w.h;
    if (long) x.fillRect(w.x + w.w * 0.3, w.y + 8, w.w * 0.18, w.h - 16);
    else x.fillRect(w.x + 8, w.y + w.h * 0.3, w.w - 16, w.h * 0.18);
    x.strokeStyle = 'rgba(0,0,0,0.6)';
    x.lineWidth = 2;
    rr(x, w.x + 1, w.y + 1, w.w - 2, w.h - 2, 10);
    x.stroke();
    return true;
  },
  scrap(x, w, k, rnd) {
    for (let i = 0; i < 14; i++) {
      x.fillStyle = ['#4a4f57', '#5a3a2a', '#3a4048', '#6a6f77'][Math.floor(rnd() * 4)];
      x.save();
      x.translate(w.x + 10 + rnd() * (w.w - 20), w.y + 10 + rnd() * (w.h - 20));
      x.rotate(rnd() * TAU);
      x.fillRect(-12 - rnd() * 10, -5 - rnd() * 4, 24 + rnd() * 18, 10 + rnd() * 6);
      x.restore();
    }
    return true;
  },
  dome(x, w) {
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    const r = w.w / 2;
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.beginPath();
    x.arc(cx + 6, cy + 8, r, 0, TAU);
    x.fill();
    const g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 2, cx, cy, r);
    g.addColorStop(0, '#9aa3b5');
    g.addColorStop(1, '#2b3039');
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r, 0, TAU);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.4)';
    x.lineWidth = 1.5;
    for (let a = 0; a < Math.PI; a += Math.PI / 4) {
      x.beginPath();
      x.ellipse(cx, cy, r, r * Math.abs(Math.cos(a)), 0, 0, TAU);
      x.stroke();
    }
    x.fillStyle = '#3ce6ff';
    x.beginPath();
    x.arc(cx, cy, 4, 0, TAU);
    x.fill();
    return true;
  },
  solar(x, w) {
    x.fillStyle = '#0d1a33';
    x.fillRect(w.x, w.y, w.w, w.h);
    x.strokeStyle = 'rgba(90,150,255,0.35)';
    x.lineWidth = 1;
    for (let i = w.x; i <= w.x + w.w; i += 16) {
      x.beginPath();
      x.moveTo(i, w.y);
      x.lineTo(i, w.y + w.h);
      x.stroke();
    }
    for (let j = w.y; j <= w.y + w.h; j += 16) {
      x.beginPath();
      x.moveTo(w.x, j);
      x.lineTo(w.x + w.w, j);
      x.stroke();
    }
    outline(x, w, '#9aa3b5', 2);
    return true;
  },
  rover(x, w) {
    x.fillStyle = '#2a2d33';
    for (const [ox, oy] of [[0.18, 0.1], [0.82, 0.1], [0.18, 0.9], [0.82, 0.9]]) {
      x.beginPath();
      x.arc(w.x + w.w * ox, w.y + w.h * oy, 10, 0, TAU);
      x.fill();
    }
    x.fillStyle = '#d9dde6';
    rr(x, w.x + 10, w.y + 8, w.w - 20, w.h - 16, 6);
    x.fill();
    x.fillStyle = '#ffb347';
    x.fillRect(w.x + w.w / 2 - 10, w.y + w.h / 2 - 6, 20, 12);
    return true;
  },
  ctable(x, w) {
    x.fillStyle = '#3a2416';
    rr(x, w.x, w.y, w.w, w.h, w.h / 2);
    x.fill();
    x.fillStyle = '#0f4d2c';
    rr(x, w.x + 7, w.y + 7, w.w - 14, w.h - 14, (w.h - 14) / 2);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 3; i++) x.fillRect(w.x + w.w / 2 - 20 + i * 14, w.y + w.h / 2 - 8, 10, 15);
    x.fillStyle = '#ffd34d';
    x.beginPath();
    x.arc(w.x + w.w * 0.25, w.y + w.h / 2, 5, 0, TAU);
    x.fill();
    return true;
  },
  roulette(x, w) {
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    const r = w.w / 2;
    x.fillStyle = '#3a2416';
    x.beginPath();
    x.arc(cx, cy, r, 0, TAU);
    x.fill();
    for (let i = 0; i < 18; i++) {
      x.fillStyle = i === 0 ? '#1e8a3c' : i % 2 ? '#b31d2c' : '#111';
      x.beginPath();
      x.moveTo(cx, cy);
      x.arc(cx, cy, r - 6, (i / 18) * TAU, ((i + 1) / 18) * TAU);
      x.closePath();
      x.fill();
    }
    x.fillStyle = '#c9a227';
    x.beginPath();
    x.arc(cx, cy, r * 0.28, 0, TAU);
    x.fill();
    return true;
  },
  slots(x, w, k, rnd) {
    x.fillStyle = '#1a0f1f';
    x.fillRect(w.x, w.y, w.w, w.h);
    const long = w.w > w.h;
    const n = Math.floor((long ? w.w : w.h) / 40);
    for (let i = 0; i < n; i++) {
      const bx = long ? w.x + i * 40 + 4 : w.x + 4;
      const by = long ? w.y + 4 : w.y + i * 40 + 4;
      const bw = long ? 32 : w.w - 8;
      const bh = long ? w.h - 8 : 32;
      x.fillStyle = ['#ff3cc8', '#3ce6ff', '#ffd34d'][Math.floor(rnd() * 3)];
      x.globalAlpha = 0.75;
      x.fillRect(bx, by, bw, bh);
      x.globalAlpha = 1;
      x.fillStyle = '#0b0610';
      x.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
    }
    outline(x, w, '#c9a227', 2);
    return true;
  },
});

// the hazard stripe used on machinery
let hz = null;
function hazardLine(x) {
  if (!hz) {
    hz = canvas(16, 16);
    const c = hz.getContext('2d');
    c.fillStyle = '#c9a227';
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = '#111';
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(8, 0);
    c.lineTo(0, 8);
    c.closePath();
    c.moveTo(16, 0);
    c.lineTo(16, 8);
    c.lineTo(8, 16);
    c.lineTo(0, 16);
    c.closePath();
    c.fill();
  }
  return x.createPattern(hz, 'repeat');
}

Object.assign(PIT, {
  oil(x, r, rnd) {
    pitShape(x, r, 40);
    const g = x.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 4, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) / 2);
    g.addColorStop(0, '#0a0a10');
    g.addColorStop(1, '#151520');
    x.fillStyle = g;
    x.fill();
    // a rainbow sheen
    for (const [c, k] of [['rgba(255,60,200,0.18)', 0.35], ['rgba(60,230,255,0.15)', 0.25], ['rgba(255,220,80,0.12)', 0.15]]) {
      x.strokeStyle = c;
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(r.x + r.w * (0.4 + rnd() * 0.2), r.y + r.h * (0.4 + rnd() * 0.2), r.w * k, r.h * k, rnd(), 0, TAU);
      x.stroke();
    }
    return 'rgba(0,0,0,0.6)';
  },
  bowl(x, r) {
    pitShape(x, r, r.w / 2.4);
    const g = x.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 4, r.x + r.w / 2, r.y + r.h / 2, r.w / 2);
    g.addColorStop(0, '#07080b');
    g.addColorStop(1, '#2a2e36');
    x.fillStyle = g;
    x.fill();
    x.strokeStyle = '#c9ccd2';
    x.lineWidth = 4;
    x.stroke();
    return null;
  },
  rails(x, r) {
    x.fillStyle = '#07080a';
    x.fillRect(r.x, r.y, r.w, r.h);
    const horiz = r.w > r.h;
    // sleepers and two rails
    x.fillStyle = '#2a2018';
    for (let i = 6; i < (horiz ? r.w : r.h); i += 22) {
      if (horiz) x.fillRect(r.x + i, r.y + 10, 10, r.h - 20);
      else x.fillRect(r.x + 10, r.y + i, r.w - 20, 10);
    }
    x.fillStyle = '#8a8f99';
    for (const k of [0.32, 0.68]) {
      if (horiz) x.fillRect(r.x, r.y + r.h * k - 2, r.w, 4);
      else x.fillRect(r.x + r.w * k - 2, r.y, 4, r.h);
    }
    return 'rgba(255,211,77,0.6)';
  },
  acid(x, r, rnd) {
    x.fillStyle = '#20262a';
    x.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
    const g = x.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, '#5ef03c');
    g.addColorStop(1, '#1f9a2a');
    x.fillStyle = g;
    x.fillRect(r.x, r.y, r.w, r.h);
    x.fillStyle = 'rgba(220,255,180,0.45)';
    for (let i = 0; i < 10; i++) {
      x.beginPath();
      x.arc(r.x + rnd() * r.w, r.y + rnd() * r.h, 2 + rnd() * 5, 0, TAU);
      x.fill();
    }
    return '#c9a227';
  },
  swamp(x, r, rnd) {
    x.fillStyle = '#0d1f1a';
    x.fillRect(r.x, r.y, r.w, r.h);
    x.fillStyle = 'rgba(60,140,90,0.25)';
    for (let i = 0; i < (r.w * r.h) / 1400; i++) {
      x.beginPath();
      x.ellipse(r.x + rnd() * r.w, r.y + rnd() * r.h, 5 + rnd() * 8, 3 + rnd() * 4, rnd() * 3, 0, TAU);
      x.fill();
    }
    return null;
  },
  crater(x, r) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const g = x.createRadialGradient(cx - r.w * 0.1, cy - r.h * 0.1, 4, cx, cy, r.w / 2);
    g.addColorStop(0, '#060608');
    g.addColorStop(0.8, '#121318');
    g.addColorStop(1, '#3a3c44');
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(cx, cy, r.w / 2, r.h / 2, 0, 0, TAU);
    x.fill();
    x.strokeStyle = 'rgba(200,200,210,0.25)';
    x.lineWidth = 3;
    x.beginPath();
    x.ellipse(cx, cy, r.w / 2 - 2, r.h / 2 - 2, 0, Math.PI * 1.05, Math.PI * 1.9);
    x.stroke();
    return null;
  },
});

Object.assign(GROUND, {
  speedway(x, px, py, rnd) {
    x.strokeStyle = 'rgba(0,0,0,0.3)';
    x.lineWidth = 4;
    const a = rnd() * TAU;
    x.beginPath();
    x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(a) * 50, py + Math.sin(a) * 50, px + Math.cos(a + 0.5) * 90, py + Math.sin(a + 0.5) * 90);
    x.stroke();
  },
  skate(x, px, py, rnd) {
    if (rnd() < 0.5) lampPool(x, px, py, 110, 'rgba(255,220,150,0.14)');
    else {
      x.fillStyle = ['rgba(255,60,200,0.11)', 'rgba(60,230,255,0.11)', 'rgba(163,230,53,0.11)'][Math.floor(rnd() * 3)];
      x.font = '900 34px Impact, sans-serif';
      x.textAlign = 'center';
      x.fillText(['DROP', 'GM', 'WAGMI', 'HODL', 'NGMI'][Math.floor(rnd() * 5)], px, py);
    }
  },
  metro(x, px, py, rnd) {
    lampPool(x, px, py, 120, 'rgba(180,220,255,0.12)');
    if (rnd() < 0.3) {
      x.fillStyle = 'rgba(255,255,255,0.06)';
      x.fillRect(px - 30, py - 4, 60, 8);
    }
  },
  factory(x, px, py, rnd) {
    if (rnd() < 0.5) lampPool(x, px, py, 110, 'rgba(255,170,60,0.12)');
    else {
      x.fillStyle = 'rgba(40,30,15,0.35)';
      x.beginPath();
      x.ellipse(px, py, 14 + rnd() * 18, 8 + rnd() * 10, rnd() * 3, 0, TAU);
      x.fill();
    }
  },
  jungle(x, px, py, rnd) {
    x.strokeStyle = 'rgba(40,90,40,0.35)';
    x.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = rnd() * TAU;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + Math.cos(a) * 18, py + Math.sin(a) * 18);
      x.stroke();
    }
  },
  junkyard(x, px, py, rnd) {
    x.fillStyle = 'rgba(80,60,40,0.3)';
    x.save();
    x.translate(px, py);
    x.rotate(rnd() * TAU);
    x.fillRect(-10, -3, 20 + rnd() * 10, 6);
    x.restore();
  },
  moon(x, px, py, rnd) {
    x.fillStyle = 'rgba(255,255,255,0.05)';
    x.beginPath();
    x.ellipse(px, py, 3, 5, rnd(), 0, TAU);
    x.ellipse(px + 10, py + 14, 3, 5, rnd(), 0, TAU);
    x.fill();
  },
  casino(x, px, py, rnd) {
    lampPool(x, px, py, 120, rnd() < 0.5 ? 'rgba(255,60,200,0.1)' : 'rgba(255,200,80,0.1)');
  },
});

// the circuit: an asphalt loop with red and white kerbs and a chequered line
UNDER.speedway = (x, map, near) => {
  const t = map.track;
  if (!t) return;
  if (!near({ x: t.cx - t.rx - t.w, y: t.cy - t.ry - t.w, w: (t.rx + t.w) * 2, h: (t.ry + t.w) * 2 })) return;
  x.strokeStyle = '#1a1c20';
  x.lineWidth = t.w;
  x.beginPath();
  x.ellipse(t.cx, t.cy, t.rx, t.ry, 0, 0, TAU);
  x.stroke();
  for (const d of [-t.w / 2, t.w / 2]) {
    x.lineWidth = 8;
    x.setLineDash([22, 22]);
    for (const [col, off] of [['#d33a2c', 0], ['#e9e9e9', 22]]) {
      x.strokeStyle = col;
      x.lineDashOffset = off;
      x.beginPath();
      x.ellipse(t.cx, t.cy, t.rx + d, t.ry + d, 0, 0, TAU);
      x.stroke();
    }
  }
  x.setLineDash([24, 30]);
  x.lineDashOffset = 0;
  x.strokeStyle = 'rgba(255,255,255,0.18)';
  x.lineWidth = 3;
  x.beginPath();
  x.ellipse(t.cx, t.cy, t.rx, t.ry, 0, 0, TAU);
  x.stroke();
  x.setLineDash([]);
  const sx = t.cx + t.rx;
  const sz = 14;
  for (let i = -t.w / 2; i < t.w / 2; i += sz)
    for (let j = 0; j < 3; j++) {
      x.fillStyle = (Math.floor(i / sz) + j) % 2 ? '#111' : '#e9e9e9';
      x.fillRect(sx + i, t.cy - 21 + j * sz, sz, sz);
    }
};

Object.assign(THEME, {
  speedway: { dark: 'rgba(3, 5, 8, 0.93)', fence: '#1a1c20', mini: ['#0f1510', '#6d7177', '#d33a2c'], weather: 'rain', vault: 'rgba(255,211,77,0.08)' },
  skate: { dark: 'rgba(4, 4, 10, 0.92)', fence: '#22252c', mini: ['#16181d', '#5a5f6a', '#ff3cc8'], weather: null, vault: 'rgba(60,230,255,0.08)' },
  metro: { dark: 'rgba(2, 4, 8, 0.94)', fence: '#1b1d22', mini: ['#14161a', '#3a3d44', '#ffd34d'], weather: null, vault: 'rgba(180,220,255,0.08)' },
  factory: { dark: 'rgba(5, 4, 2, 0.93)', fence: '#2a2a2a', mini: ['#15171a', '#2f343c', '#5ef03c'], weather: 'embers', vault: 'rgba(255,170,60,0.1)' },
  jungle: { dark: 'rgba(1, 6, 3, 0.95)', fence: '#0c140c', mini: ['#0c140c', '#3a3b30', '#1d4a25'], weather: 'fireflies', vault: 'rgba(120,255,200,0.08)' },
  junkyard: { dark: 'rgba(6, 4, 2, 0.93)', fence: '#2a1f16', mini: ['#17130f', '#4a4f57', '#5a2a20'], weather: 'rain', vault: 'rgba(255,190,120,0.08)' },
  moon: { dark: 'rgba(0, 1, 6, 0.92)', fence: '#2b3039', mini: ['#1a1b1f', '#9aa3b5', '#3ce6ff'], weather: 'sparkle', vault: 'rgba(60,230,255,0.08)' },
  casino: { dark: 'rgba(8, 0, 4, 0.92)', fence: '#3a2416', mini: ['#1e0a10', '#c9a227', '#ff3cc8'], weather: 'sparkle', vault: 'rgba(255,211,77,0.1)' },
});

// every older map at night too: a dark tint over its bright colours (the docks are the model)
const NIGHT = { lego: '#48506a', dunes: '#56484a', snow: '#36405a', neon: '#665a80', fantasy: '#444e66', toon: '#56486c', gravity: '#3a4256' };
for (const [id, tint] of Object.entries(NIGHT)) {
  THEME[id].night = tint;
  THEME[id].bright = false;
  THEME[id].dark = THEME[id].dark.replace(/[\d.]+\)$/, '0.93)');
}
