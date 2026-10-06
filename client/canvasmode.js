// Draw on the GPU or on the CPU? The game is thousands of small stroked paths a frame (stick
// figures, round caps and joins). Some browser + driver pairs (Chrome on Linux with NVIDIA
// through ANGLE/OpenGL, for one) tessellate every such path on the GPU and fall to 20 fps on a
// fast card, while the CPU rasterizer draws the same frame in a few milliseconds. So once, before
// any canvas exists, both are timed on a stand-in of a real frame and the faster one is kept:
// in CPU mode every 2D canvas is created with willReadFrequently (a CPU-backed bitmap).
// ?canvas=gpu|cpu in the address pins it (for testing); the choice is remembered for a week.

const KEY = 'darkbags.canvasMode';
const WEEK = 7 * 864e5;

function bench(opts) {
  const c = document.createElement('canvas');
  c.width = 720;
  c.height = 480;
  const x = c.getContext('2d', opts);
  const frame = (seed) => {
    x.fillStyle = '#10141c';
    x.fillRect(0, 0, 720, 480);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    for (let i = 0; i < 160; i++) {
      // a stick figure: two strokes (outline and colour), limbs as polylines, a head
      const px = (i * 97 + seed * 13) % 700;
      const py = (i * 53 + seed * 7) % 460;
      for (const [col, w] of [['#0b0d12', 5], ['#9ad14b', 2.6]]) {
        x.strokeStyle = col;
        x.lineWidth = w;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px - 6, py + 12);
        x.lineTo(px - 4, py + 24);
        x.moveTo(px, py);
        x.lineTo(px + 6, py + 12);
        x.lineTo(px + 5, py + 24);
        x.moveTo(px, py);
        x.lineTo(px + 1, py - 16);
        x.stroke();
      }
      x.fillStyle = '#c6ff3d';
      x.beginPath();
      x.arc(px + 1, py - 20, 4, 0, Math.PI * 2);
      x.fill();
    }
    x.getImageData(0, 0, 1, 1); // wait for the work to be done (a GPU canvas queues it)
  };
  frame(0); // warm-up: shader compiles and allocations are not what we time
  const t0 = performance.now();
  for (let k = 1; k <= 4; k++) frame(k);
  return performance.now() - t0;
}

function choose() {
  const pinned = new URLSearchParams(location.search).get('canvas');
  if (pinned === 'gpu' || pinned === 'cpu') return { mode: pinned, why: 'pinned' };
  try {
    const was = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (was && Date.now() - was.at < WEEK && was.ua === navigator.userAgent) return { mode: was.mode, why: 'cached', gpuMs: was.gpuMs, cpuMs: was.cpuMs };
  } catch {
    /* storage unavailable: measure again */
  }
  let gpuMs = Infinity;
  let cpuMs = Infinity;
  try {
    gpuMs = bench({});
    cpuMs = bench({ willReadFrequently: true });
  } catch {
    return { mode: 'gpu', why: 'error' };
  }
  // the CPU has to win clearly: on a phone the GPU is usually the better bet
  const mode = cpuMs < gpuMs * 0.7 ? 'cpu' : 'gpu';
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode, at: Date.now(), ua: navigator.userAgent, gpuMs: Math.round(gpuMs), cpuMs: Math.round(cpuMs) }));
  } catch {
    /* not remembered: measured again next time */
  }
  return { mode, why: 'measured', gpuMs: Math.round(gpuMs), cpuMs: Math.round(cpuMs) };
}

export const canvasMode = choose();

if (canvasMode.mode === 'cpu') {
  // every 2D context from here on is CPU-backed, unless its caller asks otherwise
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    if (type === '2d') return get.call(this, type, { willReadFrequently: true, ...(opts ?? {}) });
    return get.call(this, type, opts);
  };
}
