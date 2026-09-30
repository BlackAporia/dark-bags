// The intro: the logo lands, a field of runners drifts in the dark behind it, and a
// real loading bar tracks what the game waits for (fonts, the map textures, the
// connection, your profile). At 100% the menu fades in; a tap skips the wait.
import { t } from './i18n.js';
import { settings } from './settings.js';
import { drawPreview } from './stickman.js';
import { OUTFITS } from '../shared/cosmetics.js';

const $ = (id) => document.getElementById(id);

export function createIntro({ onDone }) {
  const el = $('intro');
  const steps = new Map(); // name → done
  let shown = 0; // the bar eases towards the real progress
  let done = false;
  let raf = 0;
  const started = performance.now();
  const MIN_MS = settings.motion ? (sessionStorage.getItem('darkbags.seen') ? 900 : 2400) : 300;
  const figures = Array.from({ length: 14 }, (_, i) => ({
    x: Math.random(),
    y: 0.78 + Math.random() * 0.2,
    s: 0.6 + Math.random() * 0.9,
    v: (Math.random() < 0.5 ? -1 : 1) * (0.01 + Math.random() * 0.02),
    o: OUTFITS[Math.floor(Math.random() * OUTFITS.length)].id,
    b: i % 2 ? 'f' : 'm',
    w: i % 6,
    ph: Math.random() * 10,
  }));

  function need(name) {
    steps.set(name, false);
  }
  function mark(name) {
    if (steps.has(name)) steps.set(name, true);
    const s = $('intro-step');
    if (s) s.textContent = t(`intro.${name}`);
  }
  const progress = () => (steps.size ? [...steps.values()].filter(Boolean).length / steps.size : 1);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const target = Math.min(progress(), (now - started) / MIN_MS);
    shown += (target - shown) * 0.08;
    $('intro-fill').style.width = `${Math.round(shown * 100)}%`;
    el.querySelector('.intro-bar').setAttribute('aria-valuenow', String(Math.round(shown * 100)));
    const cv = $('intro-canvas');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // runners walking through the dark, lit by a slow searchlight
    const sweep = ((now / 5000) % 1.4) - 0.2;
    for (const f of figures) {
      if (settings.motion) f.x = (f.x + f.v / 60 + 1.2) % 1.2;
      const x = (f.x - 0.1) * w;
      const y = f.y * h;
      const lit = Math.max(0.12, 1 - Math.abs(f.x - sweep) * 3);
      ctx.globalAlpha = lit * 0.55;
      drawPreview(ctx, { outfit: f.o, body: f.b }, { x, y, scale: f.s * Math.min(1.8, Math.min(w, h) / 380), t: now + f.ph * 1000, w: f.w, aim: f.v > 0 ? 0 : Math.PI, moveK: 1, phase: now / 90 + f.ph });
    }
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(sweep * w, h * 0.2, 0, sweep * w, h * 0.7, h * 0.9);
    g.addColorStop(0, 'rgba(247,147,26,0.10)');
    g.addColorStop(1, 'rgba(247,147,26,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (shown > 0.995 && !done) ready();
  }

  function ready() {
    done = true;
    $('intro-step').textContent = t('intro.ready');
    const go = $('intro-go');
    go.hidden = false;
    go.focus({ preventScroll: true });
    // returning players go straight in; first-timers get one tap (it also unlocks audio)
    if (sessionStorage.getItem('darkbags.seen')) finish();
  }

  function finish() {
    if (el.classList.contains('out')) return;
    sessionStorage.setItem('darkbags.seen', '1');
    el.classList.add('out');
    onDone();
    setTimeout(() => {
      el.hidden = true;
      cancelAnimationFrame(raf);
    }, settings.motion ? 700 : 0);
  }

  $('intro-go').addEventListener('click', finish);
  el.addEventListener('click', (e) => {
    if (done && e.target === el) finish();
  });
  raf = requestAnimationFrame(frame);
  // never hang on a slow or missing server: the menu works offline too
  setTimeout(() => {
    for (const k of steps.keys()) steps.set(k, true);
  }, 7000);
  return { need, mark, finish };
}
