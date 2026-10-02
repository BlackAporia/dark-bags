// Event-loop stall watch: the game runs on one thread, so anything that holds it (a big save, a
// pool scan, a slow message) freezes every raid on the server at once. A 100 ms timer notices
// when it fires late; each stall is logged with the work that was running, and the last ones are
// kept for the analytics page.
const busy = new Map(); // label -> how many are running
export const stalls = []; // newest first: { at, ms, during }

export function track(label, run) {
  busy.set(label, (busy.get(label) ?? 0) + 1);
  const done = () => {
    const n = (busy.get(label) ?? 1) - 1;
    if (n > 0) busy.set(label, n);
    else busy.delete(label);
  };
  let r;
  try {
    r = run();
  } catch (e) {
    done();
    throw e;
  }
  if (r && typeof r.then === 'function') return r.finally(done);
  done();
  return r;
}

// slow synchronous work that already finished (a tick, a message): noted directly
export function note(label, ms) {
  remember({ at: Date.now(), ms: Math.round(ms), during: [label] });
}

function remember(s) {
  stalls.unshift(s);
  if (stalls.length > 50) stalls.length = 50;
  console.warn(`stall ${s.ms} ms${s.during.length ? ` during ${s.during.join(', ')}` : ''}`);
}

export function watchStalls({ every = 100, over = 150 } = {}) {
  let last = performance.now();
  const t = setInterval(() => {
    const now = performance.now();
    const late = now - last - every;
    last = now;
    if (late > over) remember({ at: Date.now(), ms: Math.round(late), during: [...busy.keys()] });
  }, every);
  t.unref?.();
  return () => clearInterval(t);
}
