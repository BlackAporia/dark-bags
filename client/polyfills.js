// Older phone browsers (Safari before 16, Chrome before 99, older Samsung Internet) lack a
// few APIs the game draws and thinks with. One missing call used to stop the whole frame
// loop, which looked like a black screen with a frozen HUD. Load this first.

const def = (proto, name, fn) => {
  if (proto && !(name in proto)) Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true });
};

// canvas: rounded rectangles (radius as a number or [r] / {x,y}-less arrays: corners share one radius)
function roundRect(x, y, w, h, r = 0) {
  let rad = Array.isArray(r) ? r[0] ?? 0 : r;
  if (typeof rad === 'object' && rad) rad = rad.x ?? 0;
  rad = Math.max(0, Math.min(Number(rad) || 0, Math.abs(w) / 2, Math.abs(h) / 2));
  this.moveTo(x + rad, y);
  this.lineTo(x + w - rad, y);
  this.arcTo(x + w, y, x + w, y + rad, rad);
  this.lineTo(x + w, y + h - rad);
  this.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  this.lineTo(x + rad, y + h);
  this.arcTo(x, y + h, x, y + h - rad, rad);
  this.lineTo(x, y + rad);
  this.arcTo(x, y, x + rad, y, rad);
  this.closePath();
}
if (typeof CanvasRenderingContext2D !== 'undefined') def(CanvasRenderingContext2D.prototype, 'roundRect', roundRect);
if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') def(OffscreenCanvasRenderingContext2D.prototype, 'roundRect', roundRect);
if (typeof Path2D !== 'undefined') def(Path2D.prototype, 'roundRect', roundRect);

// language
if (!Object.hasOwn) Object.hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function at(i) {
  const n = Math.trunc(i) || 0;
  return this[n < 0 ? this.length + n : n];
}
def(Array.prototype, 'at', at);
def(String.prototype, 'at', at);
def(Array.prototype, 'findLast', function (f, t) {
  for (let i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return this[i];
  return undefined;
});
def(Array.prototype, 'findLastIndex', function (f, t) {
  for (let i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return i;
  return -1;
});
def(String.prototype, 'replaceAll', function (a, b) {
  return a instanceof RegExp ? this.replace(a, b) : this.split(a).join(b);
});
if (typeof globalThis.structuredClone !== 'function') globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));
