// Procedural textures, generated once at startup. No image files: everything is
// drawn with seeded noise so the whole game still ships as one small file.
import { mulberry32 } from '../shared/geom.js';

const TEX_SCALE = 2; // textures are drawn at 2 px per world unit for crispness

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Smooth value noise: random grid upscaled with smoothing, several octaves.
function noiseLayer(ctx, w, h, rnd, { cells, alpha, light = true }) {
  const g = canvas(cells, cells);
  const gx = g.getContext('2d');
  const img = gx.createImageData(cells, cells);
  for (let i = 0; i < cells * cells; i++) {
    const v = rnd();
    const c = light ? 255 : 0;
    img.data[i * 4] = c;
    img.data[i * 4 + 1] = c;
    img.data[i * 4 + 2] = c;
    img.data[i * 4 + 3] = Math.floor(v * 255);
  }
  gx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // draw 3x3 so the tile wraps without seams at the edges
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) ctx.drawImage(g, ox * w, oy * h, w, h);
  ctx.restore();
}

function speckle(ctx, w, h, rnd, n, color, size = 1) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(rnd() * w, rnd() * h, size * (0.5 + rnd()), size * (0.5 + rnd()));
}

function crack(ctx, x, y, rnd, len, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rnd() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (rnd() - 0.5) * 1.1;
    x += Math.cos(a) * (6 + rnd() * 10);
    y += Math.sin(a) * (6 + rnd() * 10);
    ctx.lineTo(x, y);
    if (rnd() < 0.15) crack(ctx, x, y, rnd, Math.floor(len / 3), width * 0.6, color);
  }
  ctx.stroke();
}

function pattern(ctx, tex) {
  const p = ctx.createPattern(tex, 'repeat');
  p.setTransform(new DOMMatrix().scaleSelf(1 / TEX_SCALE, 1 / TEX_SCALE));
  return p;
}

// ----------------------------------------------------------------- floors

function concrete(seed) {
  const S = 256 * TEX_SCALE;
  const c = canvas(S, S);
  const x = c.getContext('2d');
  const rnd = mulberry32(seed);
  x.fillStyle = '#161b25';
  x.fillRect(0, 0, S, S);
  noiseLayer(x, S, S, rnd, { cells: 8, alpha: 0.05 });
  noiseLayer(x, S, S, rnd, { cells: 24, alpha: 0.05, light: false });
  noiseLayer(x, S, S, rnd, { cells: 64, alpha: 0.035 });
  speckle(x, S, S, rnd, 900, 'rgba(255,255,255,0.05)', 2);
  speckle(x, S, S, rnd, 700, 'rgba(0,0,0,0.25)', 2);
  // slab seams every 128 world px
  x.strokeStyle = 'rgba(0,0,0,0.45)';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(0, 1);
  x.lineTo(S, 1);
  x.moveTo(1, 0);
  x.lineTo(1, S);
  x.moveTo(0, S / 2);
  x.lineTo(S, S / 2);
  x.moveTo(S / 2, 0);
  x.lineTo(S / 2, S);
  x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.035)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(0, 4);
  x.lineTo(S, 4);
  x.moveTo(4, 0);
  x.lineTo(4, S);
  x.moveTo(0, S / 2 + 3);
  x.lineTo(S, S / 2 + 3);
  x.moveTo(S / 2 + 3, 0);
  x.lineTo(S / 2 + 3, S);
  x.stroke();
  for (let i = 0; i < 3; i++) crack(x, rnd() * S, rnd() * S, rnd, 7, 1.6, 'rgba(0,0,0,0.4)');
  return c;
}

function diamondPlate(seed) {
  const S = 64 * TEX_SCALE;
  const c = canvas(S, S);
  const x = c.getContext('2d');
  const rnd = mulberry32(seed);
  const g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#2b2f37');
  g.addColorStop(1, '#23262d');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  noiseLayer(x, S, S, rnd, { cells: 6, alpha: 0.05 });
  const step = S / 4;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const cx = col * step + (row % 2 ? step / 2 : 0) + step / 4;
      const cy = row * step + step / 2;
      const a = row % 2 ? -0.7 : 0.7;
      x.save();
      x.translate(cx % S, cy);
      x.rotate(a);
      x.fillStyle = 'rgba(0,0,0,0.45)';
      x.fillRect(-9 + 1.5, -2.5 + 1.5, 18, 5);
      x.fillStyle = '#4a505c';
      x.fillRect(-9, -2.5, 18, 5);
      x.fillStyle = 'rgba(255,255,255,0.18)';
      x.fillRect(-9, -2.5, 18, 1.5);
      x.restore();
    }
  }
  // rust bloom
  x.fillStyle = 'rgba(140, 70, 20, 0.08)';
  for (let i = 0; i < 4; i++) {
    x.beginPath();
    x.arc(rnd() * S, rnd() * S, 6 + rnd() * 14, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

// ------------------------------------------------------------------ walls

function blocks(seed, { base, mortar, w, h, jitter }) {
  const S = 128 * TEX_SCALE;
  const c = canvas(S, S);
  const x = c.getContext('2d');
  const rnd = mulberry32(seed);
  x.fillStyle = mortar;
  x.fillRect(0, 0, S, S);
  const bw = w * TEX_SCALE;
  const bh = h * TEX_SCALE;
  for (let row = 0; row * bh < S; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col * bw < S + bw; col++) {
      const bx = col * bw + off;
      const by = row * bh;
      const l = (rnd() - 0.5) * jitter;
      x.fillStyle = shade(base, l);
      x.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
      x.fillStyle = 'rgba(255,255,255,0.07)';
      x.fillRect(bx + 2, by + 2, bw - 4, 2);
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.fillRect(bx + 2, by + bh - 4, bw - 4, 2);
    }
  }
  noiseLayer(x, S, S, rnd, { cells: 16, alpha: 0.06, light: false });
  speckle(x, S, S, rnd, 400, 'rgba(0,0,0,0.25)', 2);
  return c;
}

function planks(seed) {
  const S = 64 * TEX_SCALE;
  const c = canvas(S, S);
  const x = c.getContext('2d');
  const rnd = mulberry32(seed);
  const ph = S / 4;
  for (let i = 0; i < 4; i++) {
    x.fillStyle = shade('#5a4128', (rnd() - 0.5) * 0.25);
    x.fillRect(0, i * ph, S, ph);
    x.strokeStyle = 'rgba(0,0,0,0.5)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, i * ph + 1);
    x.lineTo(S, i * ph + 1);
    x.stroke();
    // grain
    x.strokeStyle = 'rgba(0,0,0,0.18)';
    x.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      const y = i * ph + 4 + rnd() * (ph - 8);
      x.beginPath();
      x.moveTo(0, y);
      x.bezierCurveTo(S * 0.3, y + (rnd() - 0.5) * 6, S * 0.6, y + (rnd() - 0.5) * 6, S, y);
      x.stroke();
    }
    x.fillStyle = '#1b140c';
    x.beginPath();
    x.arc(6, i * ph + ph / 2, 2, 0, Math.PI * 2);
    x.arc(S - 6, i * ph + ph / 2, 2, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

function corrugated(seed, color) {
  const S = 64 * TEX_SCALE;
  const c = canvas(S, S);
  const x = c.getContext('2d');
  const rnd = mulberry32(seed);
  for (let i = 0; i < S; i += 8) {
    const g = x.createLinearGradient(i, 0, i + 8, 0);
    g.addColorStop(0, shade(color, -0.25));
    g.addColorStop(0.5, shade(color, 0.12));
    g.addColorStop(1, shade(color, -0.25));
    x.fillStyle = g;
    x.fillRect(i, 0, 8, S);
  }
  noiseLayer(x, S, S, rnd, { cells: 8, alpha: 0.08, light: false });
  x.fillStyle = 'rgba(120, 60, 20, 0.18)';
  for (let i = 0; i < 5; i++) x.fillRect(rnd() * S, rnd() * S, 3 + rnd() * 10, 2 + rnd() * 20);
  return c;
}

function steelPlate(seed) {
  const S = 64 * TEX_SCALE;
  const c = canvas(S, S);
  const x = c.getContext('2d');
  const rnd = mulberry32(seed);
  x.fillStyle = '#343a46';
  x.fillRect(0, 0, S, S);
  noiseLayer(x, S, S, rnd, { cells: 8, alpha: 0.08 });
  x.strokeStyle = 'rgba(0,0,0,0.5)';
  x.lineWidth = 3;
  x.strokeRect(1.5, 1.5, S - 3, S - 3);
  x.fillStyle = '#5a6272';
  for (const [px, py] of [[8, 8], [S - 8, 8], [8, S - 8], [S - 8, S - 8]]) {
    x.beginPath();
    x.arc(px, py, 3, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

function burlap() {
  const S = 32 * TEX_SCALE;
  const c = canvas(S, S);
  const x = c.getContext('2d');
  const rnd = mulberry32(99);
  x.fillStyle = '#b08a58';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 3) {
    x.fillStyle = `rgba(60,40,15,${0.15 + rnd() * 0.12})`;
    x.fillRect(i, 0, 1, S);
    x.fillRect(0, i, S, 1);
  }
  return c;
}

function stormNoise() {
  const S = 256;
  const c = canvas(S, S);
  const x = c.getContext('2d');
  const rnd = mulberry32(1337);
  x.fillStyle = 'rgba(0,0,0,0)';
  x.clearRect(0, 0, S, S);
  noiseLayer(x, S, S, rnd, { cells: 6, alpha: 0.5 });
  noiseLayer(x, S, S, rnd, { cells: 18, alpha: 0.35 });
  return c;
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  r = f(r);
  g = f(g);
  b = f(b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

let cache = null;
export function textures() {
  if (cache) return cache;
  cache = {
    concrete: concrete(11),
    plate: diamondPlate(12),
    brick: blocks(13, { base: '#3b2e2a', mortar: '#1a1512', w: 32, h: 14, jitter: 0.25 }),
    cinder: blocks(14, { base: '#394152', mortar: '#1a1f29', w: 40, h: 20, jitter: 0.18 }),
    planks: planks(15),
    containers: ['#7a2e2e', '#2f5d62', '#3d5a2a', '#6b5a2a'].map((col, i) => corrugated(20 + i, col)),
    steel: steelPlate(16),
    burlap: burlap(),
    storm: stormNoise(),
  };
  return cache;
}

export { pattern, TEX_SCALE, canvas };
