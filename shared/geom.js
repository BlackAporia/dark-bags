// Small deterministic geometry helpers. The client uses the exact same code for
// movement prediction, so anything here must stay pure and deterministic.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function rectsOverlap(a, b, pad = 0) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

export function circleHitsRect(x, y, r, w) {
  const cx = clamp(x, w.x, w.x + w.w);
  const cy = clamp(y, w.y, w.y + w.h);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

// Push a circle out of a rectangle. Mutates p. Returns true if it collided.
export function resolveCircleRect(p, r, w) {
  const cx = clamp(p.x, w.x, w.x + w.w);
  const cy = clamp(p.y, w.y, w.y + w.h);
  const dx = p.x - cx;
  const dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const push = r - d;
    p.x += (dx / d) * push;
    p.y += (dy / d) * push;
  } else {
    const left = p.x - w.x;
    const right = w.x + w.w - p.x;
    const top = p.y - w.y;
    const bottom = w.y + w.h - p.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) p.x = w.x - r;
    else if (m === right) p.x = w.x + w.w + r;
    else if (m === top) p.y = w.y - r;
    else p.y = w.y + w.h + r;
  }
  return true;
}

export function moveCircle(p, dx, dy, r, walls, W, H) {
  p.x += dx;
  p.y += dy;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < walls.length; i++) resolveCircleRect(p, r, walls[i]);
  }
  p.x = clamp(p.x, r, W - r);
  p.y = clamp(p.y, r, H - r);
}

// Liang–Barsky: returns entry parameter t in [0,1] where segment enters rect, or -1.
export function segRect(x1, y1, x2, y2, w) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, x1 - w.x)) return -1;
  if (!clip(dx, w.x + w.w - x1)) return -1;
  if (!clip(-dy, y1 - w.y)) return -1;
  if (!clip(dy, w.y + w.h - y1)) return -1;
  return t0;
}

// First wall hit along a segment. Returns t in [0,1] or -1.
export function segWalls(x1, y1, x2, y2, walls) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  let best = -1;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.x > maxX || w.x + w.w < minX || w.y > maxY || w.y + w.h < minY) continue;
    const t = segRect(x1, y1, x2, y2, w);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

export function hasLOS(x1, y1, x2, y2, walls) {
  return segWalls(x1, y1, x2, y2, walls) < 0;
}

// Segment vs circle: returns hit parameter t in [0,1] or -1.
export function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return -1;
  const b = 2 * (fx * dx + fy * dy);
  let disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  disc = Math.sqrt(disc);
  const t = (-b - disc) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}
