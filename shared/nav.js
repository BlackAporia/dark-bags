import { CFG } from './config.js';
import { circleHitsRect, hasLOS } from './geom.js';
import { solids } from './map.js';

// Coarse grid A* for bots. Built once per map.
export class NavGrid {
  constructor(map, cell = 40) {
    this.map = map;
    this.cell = cell;
    this.cols = Math.ceil(map.w / cell);
    this.rows = Math.ceil(map.h / cell);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    const r = CFG.PLAYER_R + 4;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const x = (col + 0.5) * cell;
        const y = (row + 0.5) * cell;
        let b = x < r || y < r || x > map.w - r || y > map.h - r;
        if (!b) for (const w of solids(map)) if (circleHitsRect(x, y, r, w)) { b = true; break; }
        this.blocked[row * this.cols + col] = b ? 1 : 0;
      }
    }
    // walls inflated by the runner radius, for path smoothing
    this.fat = solids(map).map((w) => ({ x: w.x - r, y: w.y - r, w: w.w + 2 * r, h: w.h + 2 * r }));
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.gen = 0;
  }

  cellOf(x, y) {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell)));
    return r * this.cols + c;
  }

  center(i) {
    return { x: ((i % this.cols) + 0.5) * this.cell, y: (Math.floor(i / this.cols) + 0.5) * this.cell };
  }

  nearestOpen(i) {
    if (!this.blocked[i]) return i;
    const seen = new Set([i]);
    const q = [i];
    while (q.length) {
      const cur = q.shift();
      const c = cur % this.cols;
      const r = Math.floor(cur / this.cols);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = nr * this.cols + nc;
        if (seen.has(ni)) continue;
        if (!this.blocked[ni]) return ni;
        seen.add(ni);
        q.push(ni);
      }
    }
    return i;
  }

  clearLine(x1, y1, x2, y2) {
    return hasLOS(x1, y1, x2, y2, this.fat);
  }

  // Returns a list of waypoints (excluding the start), or [] if unreachable.
  findPath(sx, sy, tx, ty) {
    if (this.clearLine(sx, sy, tx, ty)) return [{ x: tx, y: ty }];
    const start = this.nearestOpen(this.cellOf(sx, sy));
    const goal = this.nearestOpen(this.cellOf(tx, ty));
    const gen = ++this.gen;
    const cols = this.cols;
    const gc = goal % cols;
    const gr = Math.floor(goal / cols);
    const h = (i) => {
      const dx = Math.abs((i % cols) - gc);
      const dy = Math.abs(Math.floor(i / cols) - gr);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    const heap = [];
    const push = (i) => {
      heap.push(i);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (this.f[heap[p]] <= this.f[heap[k]]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && this.f[heap[l]] < this.f[heap[m]]) m = l;
          if (r < heap.length && this.f[heap[r]] < this.f[heap[m]]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    this.stamp[start] = gen;
    this.g[start] = 0;
    this.f[start] = h(start);
    this.from[start] = -1;
    push(start);
    let found = false;
    let expansions = 0;
    while (heap.length && expansions < 5000) {
      const cur = pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      expansions++;
      if (cur === goal) {
        found = true;
        break;
      }
      const c = cur % cols;
      const r = Math.floor(cur / cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
          const ni = nr * cols + nc;
          if (this.blocked[ni] || this.closed[ni] === gen) continue;
          if (dr && dc && (this.blocked[r * cols + nc] || this.blocked[nr * cols + c])) continue;
          const ng = this.g[cur] + (dr && dc ? 1.414 : 1);
          if (this.stamp[ni] !== gen || ng < this.g[ni]) {
            this.stamp[ni] = gen;
            this.g[ni] = ng;
            this.f[ni] = ng + h(ni);
            this.from[ni] = cur;
            push(ni);
          }
        }
      }
    }
    if (!found) return [];
    const cells = [];
    for (let i = goal; i !== -1; i = this.from[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => this.center(i));
    if (!this.blocked[this.cellOf(tx, ty)]) pts[pts.length - 1] = { x: tx, y: ty };
    // string-pull: skip waypoints we can walk to in a straight line
    const out = [];
    let cx = sx;
    let cy = sy;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.clearLine(cx, cy, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      cx = pts[j].x;
      cy = pts[j].y;
      i = j + 1;
    }
    return out;
  }
}
