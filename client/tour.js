// The first-run tour: Nyx, the raid handler, walks a new player (and every newly signed-in
// wallet) through the menu. A spotlight follows what she is talking about; the words are
// in the game's language, her voice is English.
import { createNyx } from './nyx.js';
import { settings } from './settings.js';
import { store } from './store.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

// target: what to light up (the first one on screen); when: skip the step otherwise
const STEPS = [
  { key: 1 },
  { key: 2, target: ['#name'] },
  { key: 3, target: ['#modes'] },
  { key: 4, target: ['#lobby .mode[role="tablist"]'] },
  { key: 5, target: ['#play'] },
  { key: 6, art: 'keys' },
  { key: 7, art: 'exit' },
  { key: 8, target: ['.nav-btn[data-page="shop"]'] },
  { key: 9, target: ['.nav-btn[data-page="friends"]', '.nav-btn[data-page="guilds"]'] },
  { key: 10, target: ['#connect'], when: (app) => app.mode === 'online' },
  { key: 11, end: true },
];

const SEEN = 'darkbags.tour.seen'; // who has had the tour on this device: 'device', wallet addresses

export function createTour({ app, go, practice, touch = () => false }) {
  let el = null;
  let nyx = null;
  let i = 0;
  let steps = [];
  let audio = null;
  let ctx = null;
  let analyser = null;
  let raf = 0;
  let typeT = 0;

  const visible = (sel) => {
    for (const s of sel ?? []) {
      const n = document.querySelector(s);
      if (!n) continue;
      const r = n.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden') return n;
    }
    return null;
  };

  function build() {
    el = document.createElement('div');
    el.id = 'tour';
    el.className = 'tour';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'tour-name');
    el.innerHTML = `
      <div class="tour-spot" id="tour-spot"></div>
      <div class="tour-card" id="tour-card">
        <div class="tour-nyx" id="tour-nyx"></div>
        <div class="tour-body">
          <p class="tour-who"><b id="tour-name">NYX</b> <span>${t('tour.who')}</span><button type="button" class="tour-voice" id="tour-voice" aria-pressed="true" title="${t('tour.voice')}">🔊</button></p>
          <p class="tour-text" id="tour-text" aria-live="polite"></p>
          <div class="tour-art" id="tour-art" hidden></div>
          <div class="tour-dots" id="tour-dots" aria-hidden="true"></div>
          <div class="tour-actions">
            <button type="button" class="link tour-skip" id="tour-skip">${t('tour.skip')}</button>
            <span class="tour-grow"></span>
            <button type="button" class="ghost" id="tour-back">${t('tour.back')}</button>
            <button type="button" class="cta" id="tour-next">${t('tour.next')}</button>
          </div>
        </div>
      </div>`;
    document.body.append(el);
    nyx = createNyx($('tour-nyx'));
    $('tour-skip').addEventListener('click', () => close());
    $('tour-back').addEventListener('click', () => show(i - 1));
    $('tour-next').addEventListener('click', () => (steps[i].end ? finish() : show(i + 1)));
    $('tour-voice').addEventListener('click', () => {
      const on = !store.get('darkbags.tour.mute', false);
      store.set('darkbags.tour.mute', on);
      $('tour-voice').setAttribute('aria-pressed', String(!on));
      $('tour-voice').textContent = on ? '🔇' : '🔊';
      if (on) audio?.pause();
      else speak(steps[i].key);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') $('tour-next').click();
      else if (e.key === 'ArrowLeft' && i > 0) show(i - 1);
    });
    addEventListener('resize', place);
    const mute = store.get('darkbags.tour.mute', false);
    $('tour-voice').setAttribute('aria-pressed', String(!mute));
    $('tour-voice').textContent = mute ? '🔇' : '🔊';
  }

  // the spotlight around the step's target, and the card out of its way
  function place() {
    if (!el || !steps[i]) return;
    const spot = $('tour-spot');
    const card = $('tour-card');
    const n = visible(steps[i].target);
    card.classList.remove('top');
    if (!n) {
      spot.className = 'tour-spot none';
      return;
    }
    n.scrollIntoView?.({ block: 'nearest', behavior: settings.motion ? 'smooth' : 'auto' });
    const r = n.getBoundingClientRect();
    const pad = 8;
    spot.className = 'tour-spot';
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // the card sits at the bottom; if the target is down there too, it moves up
    const cr = card.getBoundingClientRect();
    if (r.bottom > innerHeight - cr.height - 24) card.classList.add('top');
  }

  function art(kind) {
    const box = $('tour-art');
    box.hidden = !kind;
    if (kind === 'keys') {
      box.innerHTML = touch()
        ? `<span class="ta-stick">◎</span><span>${t('tour.artMove')}</span><span class="ta-fire">FIRE</span>`
        : `<span class="ta-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>🖱 ${t('tour.artAim')}</span><kbd>Space</kbd><span>${t('tour.artDash')}</span>`;
    } else if (kind === 'exit') {
      box.innerHTML = `<span class="ta-exit"></span><span>${t('tour.artExit')}</span>`;
    } else box.innerHTML = '';
  }

  function type(text) {
    const p = $('tour-text');
    clearInterval(typeT);
    if (!settings.motion) {
      p.textContent = text;
      return;
    }
    let k = 0;
    p.textContent = '';
    typeT = setInterval(() => {
      k += 2;
      p.textContent = text.slice(0, k);
      if (k >= text.length) clearInterval(typeT);
    }, 18);
  }

  // her voice (English), with the lips following it
  function speak(key) {
    audio?.pause();
    cancelAnimationFrame(raf);
    nyx?.talk(0);
    if (!settings.voice || store.get('darkbags.tour.mute', false)) return;
    audio = new Audio(new URL(`voice/nyx/${String(key).padStart(2, '0')}.mp3`, document.baseURI).href);
    audio.volume = Math.max(0, Math.min(1, settings.sound ?? 0.9));
    try {
      ctx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      ctx.resume?.();
      const src = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyser.connect(ctx.destination);
    } catch {
      analyser = null; // no WebAudio: she still speaks, the lips just follow a guess
    }
    const buf = new Uint8Array(256);
    const tick = () => {
      if (!audio || audio.paused) {
        nyx?.talk(0);
        return;
      }
      let level = 0;
      if (analyser) {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += (v - 128) ** 2;
        level = Math.min(1, Math.sqrt(sum / buf.length) / 28);
      } else level = 0.4 + Math.sin(performance.now() / 70) * 0.4;
      nyx?.talk(level);
      raf = requestAnimationFrame(tick);
    };
    audio.addEventListener('playing', () => (raf = requestAnimationFrame(tick)));
    audio.play().catch(() => {});
  }

  function show(n) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    const s = steps[i];
    type(t(`tour.${s.key}`));
    art(s.art);
    $('tour-back').hidden = i === 0;
    $('tour-next').textContent = s.end ? t('tour.done') : t('tour.next');
    $('tour-dots').innerHTML = steps.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'past' : ''}"></i>`).join('');
    const extra = $('tour-practice');
    extra?.remove();
    if (s.end && app.mode === 'practice') {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'tour-practice';
      b.className = 'ghost';
      b.textContent = t('tour.practiceNow');
      b.addEventListener('click', () => {
        finish();
        practice?.();
      });
      $('tour-next').before(b);
    }
    requestAnimationFrame(place);
    speak(s.key);
    $('tour-next').focus({ preventScroll: true });
  }

  function start() {
    if (el) return;
    if (app.screen !== 'lobby') return;
    go('play');
    steps = STEPS.filter((s) => !s.when || s.when(app));
    build();
    document.body.classList.add('touring');
    requestAnimationFrame(() => el.classList.add('in'));
    show(0);
  }

  function close() {
    if (!el) return;
    audio?.pause();
    audio = null;
    cancelAnimationFrame(raf);
    clearInterval(typeT);
    nyx?.destroy();
    removeEventListener('resize', place);
    el.remove();
    el = null;
    document.body.classList.remove('touring');
  }

  function finish() {
    close();
  }

  // first launch on this device, and the first time a wallet signs in here
  function maybeStart(who = 'device') {
    const seen = store.get(SEEN, []);
    if (seen.includes(who)) return;
    store.set(SEEN, [...seen, who].slice(-50));
    setTimeout(start, who === 'device' ? 600 : 300);
  }

  return { start, close, maybeStart, get open() {
    return !!el;
  } };
}
