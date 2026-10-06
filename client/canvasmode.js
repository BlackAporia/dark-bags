// Draw on the GPU (the default) or on the CPU. The GPU canvas was faster on every machine
// players compared, so it is always used; ?canvas=cpu in the address switches every 2D canvas to
// a CPU-backed bitmap (willReadFrequently), for testing a device where the GPU path is slow.

const KEY = 'darkbags.canvasMode';

function choose() {
  // a choice the old auto-pick remembered is dropped: players found the GPU faster every time
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  const pinned = new URLSearchParams(location.search).get('canvas');
  if (pinned === 'cpu') return { mode: 'cpu', why: 'pinned' };
  return { mode: 'gpu', why: pinned === 'gpu' ? 'pinned' : 'default' };
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
