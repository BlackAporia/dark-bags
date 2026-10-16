// The story operations on the client: the lobby panel (operations, difficulty, tickets, what
// completing pays), the films between missions with their subtitles, the squad's radio, and the
// operation's own lines for the Descent's HUD (client/descent.js runs the run itself).
//
// A film is a script: timed subtitle lines (every language from client/strings) over a video
// when one is published under site/media/story/<id>.mp4 (and <id>-720.mp4 for phones), or over a
// scene the engine draws when there is none, it fails to load, or the player saves data. The
// same subtitles serve both, so a new language costs strings, not a re-render.
import { t, getLang } from './i18n.js';
import { store } from './store.js';
import { MODE } from '../shared/modes.js';
import { DIFFS, DIFF_IDS, TICKET_PACKS } from '../shared/descent.js';
import { OPS, OP_IDS, OP_SOON, OP_BOSSES, opItems, RETRIES } from '../shared/story.js';
import { OUTFIT, WSKIN, RARITIES } from '../shared/cosmetics.js';
import { STYLE } from '../shared/style.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TAU = Math.PI * 2;
const hhmm = (ms) => {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

// ---------------------------------------------------------------- modes

export const isOp = (id) => !!MODE[id]?.op;
export const opOf = (id) => MODE[id]?.op ?? null;
export const opMode = (op, diff) => Object.keys(MODE).find((id) => MODE[id].op === op && MODE[id].diff === diff) ?? null;
// the operation and difficulty last picked (its card stands for all of them)
export const opPicked = () => opMode(store.get('darkbags.opId', 'tunnels'), store.get('darkbags.opDiff', 'easy')) ?? 'op1-easy';
export const OP_CARD = 'op1-easy';
const DIFF_ICON = { easy: '◆', hard: '◆◆', hardcore: '◆◆◆' };
const DIFF_COLOR = { easy: '#34d399', hard: '#f97316', hardcore: '#a855f7' };
const OBJ_ICON = { reach: '➜', escort: '⛑', hold: '⛨', boss: '♛' };

const itemOf = (it) => (it.k === 'outfit' ? OUTFIT[it.id] : it.k === 'wskin' ? WSKIN[it.id] : STYLE[it.id]);
const itemKind = (it) => (it.k === 'outfit' ? t('dx.kOutfit') : it.k === 'wskin' ? t('dx.kSkin') : t(`dx.k.${STYLE[it.id]?.kind ?? 'frame'}`));

// who speaks on the radio: a colour and an initial for the portrait
export const VOICES = {
  n: { c: '#e5e7eb' },
  tower: { c: '#fb923c' },
  wedge: { c: '#f97316' },
  brace: { c: '#facc15' },
  myra: { c: '#4ade80' },
  hush: { c: '#60a5fa' },
};
// the radio lines of a stage and who says them
const RADIO = {
  tunnels: {
    's1.go': 'tower', 's1.mid': 'brace', 's1.done': 'tower',
    's2.go': 'myra', 's2.mid': 'tower', 's2.done': 'tower',
    's3.go': 'brace', 's3.mid': 'brace', 's3.done': 'brace',
    's4.go': 'tower', 's4.mid': 'wedge', 's4.done': 'tower',
  },
};

// ---------------------------------------------------------------- films

// [from, to, line, speaker] in seconds; the line is a key under op.<op>.v.<film>.
export const FILMS = {
  'op1-intro': {
    op: 'tunnels',
    key: 'intro',
    secs: 34,
    scene: 'stroke',
    lines: [
      [0.8, 4.6, 1, 'n'],
      [4.8, 8.2, 2, 'n'],
      [9.2, 13, 3, 'n'],
      [13.2, 17.8, 4, 'n'],
      [18, 22.6, 5, 'n'],
      [23, 28.4, 6, 'tower'],
      [28.8, 33.2, 7, 'tower'],
    ],
  },
  'op1-outro': {
    op: 'tunnels',
    key: 'outro',
    secs: 24,
    scene: 'train',
    lines: [
      [0.8, 5.2, 1, 'n'],
      [5.4, 9.6, 2, 'tower'],
      [9.8, 13.6, 3, 'n'],
      [13.8, 19, 4, 'tower'],
      [19.4, 23.4, 5, 'n'],
    ],
  },
};

// where the films live: next to the landing page (/site/ on the game server, the root on Pages)
function mediaBase() {
  try {
    const q = new URLSearchParams(location.search).get('media');
    if (q) return new URL(q, location.href).href;
    if (/\/play\//.test(location.pathname)) return new URL('../media/story/', location.href).href;
    return new URL('/site/media/story/', location.href).href;
  } catch {
    return null;
  }
}

/**
 * A film over everything: the video (or the engine's scene), letterboxed, its subtitles and who
 * speaks, a skip button. Any key or the button skips; onEnd runs once either way.
 */
export class Cinema {
  constructor(root = document.body) {
    this.el = document.createElement('div');
    this.el.className = 'op-cine';
    this.el.hidden = true;
    this.el.innerHTML = `<canvas></canvas><video playsinline preload="auto"></video><div class="op-bars"></div><div class="op-card" hidden><p class="eyebrow"></p><h2></h2><p class="op-card-obj"></p></div><div class="op-sub" aria-live="polite"><b></b><span></span></div><button type="button" class="op-skip"></button><button type="button" class="op-sound" hidden>🔇</button>`;
    root.append(this.el);
    this.cv = this.el.querySelector('canvas');
    this.video = this.el.querySelector('video');
    this.q = (s) => this.el.querySelector(s);
    this.q('.op-skip').addEventListener('click', () => this.stop());
    this.q('.op-sound').addEventListener('click', () => {
      this.video.muted = false;
      this.q('.op-sound').hidden = true;
    });
    this.onKey = (e) => {
      if (!this.el.hidden && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) {
        e.preventDefault();
        this.stop();
      }
    };
    addEventListener('keydown', this.onKey);
    this.raf = 0;
    this.onEnd = null;
    this.t0 = 0;
  }

  get covering() {
    return !this.el.hidden && performance.now() - this.t0 > 400;
  }

  // film: an id of FILMS, or an inline script { secs, scene, lines, card }; vars fill the lines
  play(film, { vars = {}, onEnd = null, reduced = false, video = true } = {}) {
    const F = typeof film === 'string' ? FILMS[film] : film;
    if (!F) return onEnd?.();
    this.stop(true);
    this.onEnd = onEnd;
    this.F = F;
    this.vars = vars;
    this.reduced = reduced;
    this.el.hidden = false;
    this.el.classList.remove('out', 'vid');
    this.el.classList.toggle('short', !!F.card);
    this.q('.op-skip').textContent = t('dx.skip');
    const card = this.q('.op-card');
    card.hidden = !F.card;
    if (F.card) {
      card.querySelector('.eyebrow').textContent = F.card.k;
      card.querySelector('h2').textContent = F.card.h;
      card.querySelector('.op-card-obj').textContent = F.card.o;
      card.style.setProperty('--tint', F.card.c ?? '#fb923c');
    }
    this.t0 = performance.now();
    this.useVideo = false;
    const saveData = !!navigator.connection?.saveData;
    const base = video && F.op && !saveData ? mediaBase() : null;
    if (base && typeof film === 'string') this.tryVideo(`${base}${film}${Math.min(innerWidth, innerHeight) < 600 ? '-720' : ''}.mp4`);
    this.P = Array.from({ length: reduced ? 0 : 120 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.8, v: 0.01 + Math.random() * 0.04, p: i }));
    const loop = (now) => {
      if (this.el.hidden) return;
      const secs = this.useVideo && this.video.duration ? this.video.currentTime : (now - this.t0) / 1000;
      const dur = this.useVideo && this.video.duration ? this.video.duration : F.secs;
      if (secs >= dur) return this.stop();
      if (!this.useVideo) this.draw(secs, now);
      this.subtitle(secs);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // the published film, if it starts within a moment; else the engine's scene carries on
  tryVideo(src) {
    const v = this.video;
    let ok = false;
    const giveUp = setTimeout(() => {
      if (!ok) v.removeAttribute('src');
    }, 2500);
    v.onplaying = () => {
      ok = true;
      clearTimeout(giveUp);
      this.useVideo = true;
      this.el.classList.add('vid');
    };
    v.onerror = () => clearTimeout(giveUp);
    v.onended = () => this.stop();
    v.muted = false;
    v.src = src;
    this.q('.op-sound').hidden = true;
    v.play().catch((e) => {
      // no sound without a tap on some phones: play muted, offer the sound (a missing film is
      // not that: the scene simply carries on)
      if (e?.name !== 'NotAllowedError') return;
      v.muted = true;
      v.play().then(() => (this.q('.op-sound').hidden = false)).catch(() => {});
    });
  }

  subtitle(secs) {
    const F = this.F;
    const line = F.lines.find(([a, b]) => secs >= a && secs < b);
    const sub = this.q('.op-sub');
    const key = line ? `${line[2]}|${line[3]}` : '';
    if (sub.dataset.key === key) return;
    sub.dataset.key = key;
    sub.classList.toggle('on', !!line);
    if (!line) return;
    const who = line[3];
    const name = sub.querySelector('b');
    name.textContent = who === 'n' ? '' : t(`op.who.${who}`);
    name.style.color = VOICES[who]?.c ?? '#fff';
    sub.querySelector('span').textContent = typeof line[2] === 'string' && line[2].includes('.') ? t(line[2], this.vars) : t(`op.${F.op}.v.${F.key}.${line[2]}`, this.vars);
  }

  draw(secs, now) {
    const c = this.cv;
    const w = Math.round(innerWidth * Math.min(2, devicePixelRatio || 1));
    const h = Math.round(innerHeight * Math.min(2, devicePixelRatio || 1));
    if (c.width !== w || c.height !== h) [c.width, c.height] = [w, h];
    const x = c.getContext('2d');
    const k = Math.min(1, secs / this.F.secs);
    const scene = SCENES[this.F.scene] ?? SCENES.metro;
    x.save();
    scene(x, w, h, { secs, k, now, P: this.P, reduced: this.reduced, vars: this.vars });
    x.restore();
  }

  stop(silent = false) {
    cancelAnimationFrame(this.raf);
    this.video.onplaying = this.video.onerror = this.video.onended = null;
    try {
      this.video.pause();
    } catch {}
    this.video.removeAttribute('src');
    if (!this.el.hidden) {
      this.el.classList.add('out');
      setTimeout(() => {
        if (this.el.classList.contains('out')) this.el.hidden = true;
      }, 260);
    }
    const f = this.onEnd;
    this.onEnd = null;
    if (!silent) f?.();
  }

  destroy() {
    this.stop(true);
    removeEventListener('keydown', this.onKey);
    this.el.remove();
  }
}

// ------------------------------------------------------------- the scenes

const S = (w, h) => Math.min(w, h) / 900;
const ease = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
const seg = (secs, a, b) => ease((secs - a) / (b - a));

// a runner in single lines, the game's own way of drawing people: head, body, arms, legs
function stick(x, cx, cy, s, { col = '#f8fafc', lw = 3, walk = 0, lie = 0, bag = false, scribble = 0, t = 0, face = 1 } = {}) {
  x.save();
  x.translate(cx, cy);
  x.rotate(lie * -Math.PI / 2 * face);
  x.strokeStyle = col;
  x.lineWidth = lw * s;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const L = 34 * s;
  const sw = Math.sin(walk) * 0.6;
  const j = (n) => (scribble ? (Math.sin(t * 0.02 + n * 7.3) * scribble * s) : 0);
  x.beginPath();
  // legs
  x.moveTo(j(1), -L * 1.2);
  x.lineTo(Math.sin(sw) * L * 0.7 + j(2), 0);
  x.moveTo(j(3), -L * 1.2);
  x.lineTo(-Math.sin(sw) * L * 0.7 + j(4), 0);
  // body
  x.moveTo(j(5), -L * 1.2);
  x.lineTo(j(6), -L * 2.3);
  // arms
  x.moveTo(j(7), -L * 2.1);
  x.lineTo(-Math.sin(sw) * L * 0.6 * face + j(8), -L * 1.4);
  x.moveTo(j(9), -L * 2.1);
  x.lineTo(Math.sin(sw) * L * 0.6 * face + j(10), -L * 1.4);
  x.stroke();
  // head: a circle, or a scribble for the lost ones
  x.beginPath();
  if (scribble) {
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4 + t * 0.004;
      const r = L * 0.32 * (0.6 + 0.4 * Math.sin(i * 1.7 + t * 0.01));
      x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, -L * 2.62 + Math.sin(a) * r);
    }
  } else x.arc(0, -L * 2.62, L * 0.3, 0, TAU);
  x.stroke();
  if (bag) {
    x.fillStyle = '#fb923c';
    x.strokeStyle = '#0b0f19';
    x.lineWidth = 2 * s;
    x.beginPath();
    x.ellipse(-L * 0.45 * face, -L * 1.75, L * 0.32, L * 0.38, 0, 0, TAU);
    x.fill();
    x.stroke();
  }
  x.restore();
}

function sky(x, w, h, top, bottom) {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
}

// the skyline: filled towers with lit windows (k=0) or only their outlines (k=1, after the flash)
function skyline(x, w, h, s, k, now, seed = 1) {
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const base = h * 0.78;
  let px = -20 * s;
  x.lineWidth = 2.2 * s;
  while (px < w + 40) {
    const bw = (60 + rnd() * 110) * s;
    const bh = (120 + rnd() * 330) * s;
    const jit = k > 0 ? Math.sin(now / 90 + px) * k * 1.5 * s : 0;
    if (k < 1) {
      x.fillStyle = `rgba(14, 18, 30, ${1 - k})`;
      x.fillRect(px, base - bh, bw, bh);
      x.fillStyle = `rgba(255, 210, 120, ${0.55 * (1 - k)})`;
      for (let wy = base - bh + 14 * s; wy < base - 10 * s; wy += 22 * s) for (let wx = px + 10 * s; wx < px + bw - 12 * s; wx += 18 * s) if (rnd() < 0.35) x.fillRect(wx, wy, 6 * s, 9 * s);
    }
    if (k > 0) {
      x.strokeStyle = `rgba(248, 250, 252, ${0.85 * k})`;
      x.beginPath();
      x.moveTo(px + jit, base);
      x.lineTo(px - jit, base - bh);
      x.lineTo(px + bw + jit, base - bh);
      x.lineTo(px + bw - jit, base);
      x.stroke();
    }
    px += bw + (4 + rnd() * 26) * s;
  }
  x.strokeStyle = k > 0 ? 'rgba(248,250,252,0.7)' : '#1e293b';
  x.beginPath();
  x.moveTo(0, base);
  x.lineTo(w, base);
  x.stroke();
  return base;
}

// the wipe: a wall of grey erasure with a scribbled edge, from the left up to ex
function wipeWall(x, h, ex, s, now) {
  const g = x.createLinearGradient(ex - 260 * s, 0, ex, 0);
  g.addColorStop(0, 'rgba(203, 213, 225, 0.95)');
  g.addColorStop(1, 'rgba(203, 213, 225, 0.15)');
  x.fillStyle = g;
  x.fillRect(0, 0, ex, h);
  x.strokeStyle = 'rgba(15, 23, 42, 0.55)';
  x.lineWidth = 2 * s;
  x.beginPath();
  for (let y = 0; y < h; y += 10 * s) x.lineTo(ex + Math.sin(y * 0.05 + now / 70) * 14 * s + Math.sin(y * 0.013 - now / 200) * 22 * s, y);
  x.stroke();
}

function dust(x, w, h, s, P, secs, a = 1) {
  for (const p of P) {
    const px = ((p.x + Math.sin(secs * 0.3 + p.p) * 0.02) % 1) * w;
    const py = ((p.y - secs * p.v + 10) % 1) * h;
    x.fillStyle = `rgba(251, 146, 60, ${(0.35 + 0.4 * Math.sin(secs * 2 + p.p)) * a})`;
    x.beginPath();
    x.arc(px, py, p.s * s * 2, 0, TAU);
    x.fill();
  }
}

const SCENES = {
  // day zero: the city, the satellites, the flash, the lines, the lost, a runner gets up and runs
  stroke(x, w, h, { secs, now, P, reduced }) {
    const s = S(w, h);
    const flash = Math.max(0, 1 - Math.abs(secs - 8.6) / 0.9);
    const drained = seg(secs, 8.6, 12);
    sky(x, w, h, drained ? '#05070c' : '#020617', drained ? '#111827' : '#1e1b4b');
    // the satellites cross the sky and light the world up
    for (let i = 0; i < 3; i++) {
      const sx = ((secs * 0.035 + i * 0.33) % 1.2) * w - 0.1 * w;
      const sy = h * (0.12 + i * 0.07);
      x.strokeStyle = drained ? 'rgba(248,250,252,0.8)' : '#cbd5e1';
      x.lineWidth = 2 * s;
      x.strokeRect(sx - 6 * s, sy - 4 * s, 12 * s, 8 * s);
      x.beginPath();
      x.moveTo(sx - 26 * s, sy);
      x.lineTo(sx - 6 * s, sy);
      x.moveTo(sx + 6 * s, sy);
      x.lineTo(sx + 26 * s, sy);
      x.stroke();
      const beam = seg(secs, 5.2, 8.4) * (1 - drained);
      if (beam > 0) {
        x.strokeStyle = `rgba(56, 189, 248, ${0.25 * beam})`;
        for (let b = -3; b <= 3; b++) {
          x.beginPath();
          x.moveTo(sx, sy);
          x.lineTo(sx + b * 120 * s, h * 0.78);
          x.stroke();
        }
      }
    }
    const base = skyline(x, w, h, s, drained, reduced ? 0 : now, 7);
    // the lost: scribbled outlines wandering the street
    const lost = seg(secs, 12, 15);
    if (lost > 0) {
      for (let i = 0; i < 9; i++) {
        const lx = ((i * 0.13 + secs * 0.012 * (i % 2 ? 1 : -1)) % 1 + 1) % 1;
        stick(x, lx * w, base, s * 0.9, { col: `rgba(148,163,184,${0.75 * lost})`, walk: secs * 3 + i, scribble: 3, t: now + i * 300 });
      }
    }
    // the colour that is left
    dust(x, w, h, s, P, secs, seg(secs, 17, 20));
    // a runner lies in the street, gets up with a bag, looks back at the wipe and runs
    const up = seg(secs, 21, 24.5);
    const run = seg(secs, 28.5, 33.5);
    if (secs > 18) {
      const hx = w * (0.45 + run * 0.6);
      stick(x, hx, base, s * 1.5, { col: '#f8fafc', lw: 3.4, lie: 1 - up, bag: up > 0.6, walk: run > 0 ? secs * 9 : 0, face: secs > 26 && run === 0 ? -1 : 1 });
    }
    const wipe = seg(secs, 25.5, 34);
    if (wipe > 0) wipeWall(x, h, wipe * w * 0.55, s, reduced ? 0 : now);
    if (flash > 0) {
      x.fillStyle = `rgba(255,255,255,${flash})`;
      x.fillRect(0, 0, w, h);
    }
  },
  // the last train: the tunnel, the train's lights pulling away, the city waiting above
  train(x, w, h, { secs, now, P, vars }) {
    const s = S(w, h);
    sky(x, w, h, '#020617', '#0b1120');
    const cx = w / 2;
    const cy = h * 0.48;
    x.strokeStyle = 'rgba(248,250,252,0.25)';
    x.lineWidth = 2 * s;
    for (let i = 0; i < 9; i++) {
      const z = ((i / 9 + secs * 0.08) % 1);
      const r = (1 - z) * Math.max(w, h) * 0.8 + 30 * s;
      x.beginPath();
      x.arc(cx, cy + r * 0.25, r, Math.PI * 1.05, Math.PI * 1.95);
      x.stroke();
    }
    // the rails
    x.strokeStyle = 'rgba(250, 204, 21, 0.45)';
    for (const d of [-1, 1]) {
      x.beginPath();
      x.moveTo(cx + d * 10 * s, cy);
      x.lineTo(cx + d * w * 0.4, h);
      x.stroke();
    }
    // the train's tail lights going away
    const away = seg(secs, 0, 12);
    const tr = (1 - away) * 60 * s + 6 * s;
    for (const d of [-1, 1]) {
      x.fillStyle = '#ef4444';
      x.shadowColor = '#ef4444';
      x.shadowBlur = 24 * s;
      x.beginPath();
      x.arc(cx + d * tr, cy + tr * 0.4, Math.max(2, tr * 0.12), 0, TAU);
      x.fill();
    }
    x.shadowBlur = 0;
    // faces in the windows: the people the squad brought out
    const n = Math.min(8, vars?.n ?? 0);
    for (let i = 0; i < n; i++) stick(x, cx - tr + (i + 0.5) * ((tr * 2) / Math.max(1, n)), cy + tr * 0.25, s * (tr / (66 * s)) * 0.5, { col: 'rgba(248,250,252,0.7)', lw: 2 });
    dust(x, w, h, s, P, secs, 0.6);
    // the surface: the wipe's grey on the horizon at the end
    const top = seg(secs, 14, 22);
    if (top > 0) {
      x.fillStyle = `rgba(203,213,225,${0.12 * top})`;
      x.fillRect(0, 0, w, h * 0.2 * top);
    }
  },
  // a street at night, the wipe coming from the west
  city(x, w, h, { secs, now, k }) {
    const s = S(w, h);
    sky(x, w, h, '#05070c', '#111827');
    const base = skyline(x, w, h, s, 1, now, 3);
    wipeWall(x, h, w * (0.08 + 0.12 * k), s, now);
    stick(x, w * (0.4 + 0.25 * k), base, s * 1.3, { bag: true, walk: secs * 9 });
  },
  // the platform: the tunnel mouth, the waiting people, the dark
  metro(x, w, h, { secs, now }) {
    const s = S(w, h);
    sky(x, w, h, '#020408', '#0b1120');
    const base = h * 0.74;
    x.fillStyle = '#111827';
    x.fillRect(0, base, w, h - base);
    x.strokeStyle = 'rgba(250,204,21,0.6)';
    x.lineWidth = 3 * s;
    x.beginPath();
    x.moveTo(0, base);
    x.lineTo(w, base);
    x.stroke();
    x.strokeStyle = 'rgba(248,250,252,0.35)';
    x.lineWidth = 2.5 * s;
    x.beginPath();
    x.arc(w * 0.78, base, h * 0.32, Math.PI, TAU);
    x.stroke();
    for (let i = 0; i < 5; i++) stick(x, w * (0.2 + i * 0.08), base, s * 1.1, { col: 'rgba(229,231,235,0.85)', walk: Math.sin(secs + i) * 0.3 });
    stick(x, w * 0.62, base, s * 1.3, { bag: true, walk: secs * 6 });
    for (let i = 0; i < 4; i++) stick(x, w * (0.86 + i * 0.03), base - 10 * s, s, { col: 'rgba(148,163,184,0.7)', scribble: 3, t: now + i * 400, walk: secs * 3 + i });
  },
  // the breaker room: a switch, sparks, cables
  breaker(x, w, h, { secs, now }) {
    const s = S(w, h);
    sky(x, w, h, '#05050a', '#1c1917');
    const cx = w / 2;
    const cy = h * 0.5;
    x.strokeStyle = '#facc15';
    x.lineWidth = 4 * s;
    x.strokeRect(cx - 70 * s, cy - 110 * s, 140 * s, 220 * s);
    const lever = Math.min(1, Math.max(0, Math.sin(secs * 0.9) * 0.5 + 0.5));
    x.beginPath();
    x.moveTo(cx, cy + 20 * s);
    x.lineTo(cx + Math.cos(-Math.PI / 2 - 0.8 + lever * 1.6) * 80 * s, cy + 20 * s + Math.sin(-Math.PI / 2 - 0.8 + lever * 1.6) * 80 * s);
    x.stroke();
    for (let i = 0; i < 14; i++) {
      const a = (now / 300 + i) % TAU;
      x.strokeStyle = `rgba(250,204,21,${0.5 + 0.5 * Math.sin(now / 50 + i)})`;
      x.lineWidth = 1.5 * s;
      x.beginPath();
      x.moveTo(cx + 60 * s, cy - 90 * s);
      x.lineTo(cx + 60 * s + Math.cos(a) * 40 * s, cy - 90 * s + Math.sin(a) * 40 * s);
      x.stroke();
    }
    stick(x, cx - 160 * s, h * 0.76, s * 1.3, { bag: true });
  },
  // the dispatcher: a huge scribble in the tunnel with two yellow eyes
  boss(x, w, h, { secs, now }) {
    const s = S(w, h);
    sky(x, w, h, '#000000', '#0b0f19');
    const cx = w / 2;
    const cy = h * 0.55;
    const r = Math.min(w, h) * 0.32 * (0.9 + 0.1 * Math.sin(secs * 2));
    x.strokeStyle = 'rgba(148,163,184,0.75)';
    x.lineWidth = 2.5 * s;
    x.beginPath();
    for (let i = 0; i < 90; i++) {
      const a = i * 2.39 + now / 900;
      const rr = r * (0.55 + 0.45 * Math.sin(i * 1.3 + now / 400));
      x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
    }
    x.stroke();
    for (const d of [-1, 1]) {
      x.fillStyle = '#facc15';
      x.shadowColor = '#facc15';
      x.shadowBlur = 30 * s;
      x.beginPath();
      x.arc(cx + d * r * 0.25, cy - r * 0.2, 12 * s, 0, TAU);
      x.fill();
    }
    x.shadowBlur = 0;
  },
};

// the card before a stage: the operation, the stage and what it asks, over its scene
export function stageFilm(op, n, { obj, boss } = {}) {
  const O = OPS[op];
  if (!O) return null;
  const st = O.stages[n - 1];
  const B = boss ? OP_BOSSES.find((b) => b.id === boss) : null;
  const scene = st.obj === 'reach' ? 'city' : st.obj === 'hold' ? 'breaker' : st.obj === 'boss' ? 'boss' : 'metro';
  return {
    op,
    secs: 6,
    scene,
    lines: [],
    card: {
      k: `${t(`op.${op}.name`)} · ${t('op.stageN', { n, of: O.stages.length })}`,
      h: t(`op.${op}.s${n}.name`),
      o: `${OBJ_ICON[obj ?? st.obj] ?? ''} ${t(`op.obj.${obj ?? st.obj}`)}`,
      c: B?.eye ?? '#fb923c',
    },
  };
}

// --------------------------------------------------------------- the radio

/** The squad's radio: who speaks and what, at the bottom of the screen, one line at a time. */
export class Radio {
  constructor(root = document.body) {
    this.el = document.createElement('div');
    this.el.className = 'op-radio';
    this.el.hidden = true;
    this.el.innerHTML = '<i class="op-radio-face"></i><div><b></b><span></span></div>';
    root.append(this.el);
    this.queue = [];
    this.timer = 0;
  }

  say(who, text, sfx) {
    this.queue.push({ who, text });
    if (this.queue.length > 3) this.queue.shift();
    if (!this.timer) this.next(sfx);
  }

  next(sfx) {
    const m = this.queue.shift();
    if (!m) {
      this.el.hidden = true;
      this.timer = 0;
      return;
    }
    const c = VOICES[m.who]?.c ?? '#e5e7eb';
    this.el.hidden = false;
    this.el.style.setProperty('--vc', c);
    const face = this.el.querySelector('.op-radio-face');
    face.textContent = (t(`op.who.${m.who}`) || '?').slice(0, 1);
    this.el.querySelector('b').textContent = t(`op.who.${m.who}`);
    const span = this.el.querySelector('span');
    span.textContent = m.text;
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
    sfx?.play('beep', { f: 1400, dur: 0.04 });
    this.timer = setTimeout(() => this.next(sfx), Math.max(3200, 900 + m.text.length * 55));
  }

  line(op, id, sfx) {
    const who = RADIO[op]?.[id] ?? 'tower';
    this.say(who, t(`op.${op}.r.${id}`), sfx);
  }

  clear() {
    clearTimeout(this.timer);
    this.timer = 0;
    this.queue.length = 0;
    this.el.hidden = true;
  }

  destroy() {
    this.clear();
    this.el.remove();
  }
}

// --------------------------------------------------------------- lobby

// The panel under the operations card: the operations in story order (the next ones locked),
// difficulty, tickets (the Descent's: one book), what completing pays and how far you got.
export function renderOpPanel(el, { mode, view, online, practice, asset, assetLabel, onPick, onBuy }) {
  if (!el) return;
  const op = opOf(mode);
  el.hidden = !op;
  if (!op) return;
  const diff = MODE[mode].diff;
  const v = view ?? null;
  const have = v ? v.free + v.bought : 0;
  const rec = v?.ops?.[op] ?? null;
  const ops = [...OP_IDS.map((id) => ({ id, n: OPS[id].n, open: true })), ...OP_SOON.map((id, i) => ({ id, n: OP_IDS.length + i + 1, open: false }))];
  const list = ops
    .map((o) => {
      const done = v?.ops?.[o.id]?.clears ?? {};
      const marks = DIFF_IDS.map((d) => (done[d] ? `<i style="--dc:${DIFF_COLOR[d]}" title="${esc(t(`dx.diff.${d}`))}">${DIFF_ICON[d].slice(0, 1)}</i>` : '')).join('');
      return `<li class="op-op${o.id === op ? ' on' : ''}${o.open ? '' : ' soon'}"><button type="button" data-op="${o.id}" ${o.open ? '' : 'disabled'}><span class="op-n">${o.n}</span><b>${esc(t(`op.${o.id}.name`))}</b><small>${o.open ? esc(t(`op.${o.id}.tag`)) : esc(t('op.soon'))}</small>${marks ? `<em>${marks}</em>` : ''}</button></li>`;
    })
    .join('');
  const tix = practice
    ? `<p class="dx-note">${esc(t('op.practiceFree'))}</p>`
    : !online || !v
      ? `<p class="dx-note">${esc(t('dx.signIn'))}</p>`
      : `<div class="dx-tix">
        <div class="dx-tk ${v.free ? 'on' : ''}"><span class="dx-tk-ico">🎟</span><b>${v.free ? esc(t('dx.freeOn')) : esc(t('dx.freeOff'))}</b><small>${esc(v.free ? t('dx.freeGone', { t: hhmm(v.resetIn) }) : t('dx.freeNext', { t: hhmm(v.resetIn) }))}</small></div>
        <div class="dx-tk"><span class="dx-tk-ico">🎫</span><b>${esc(t('dx.bought', { n: v.bought }))}</b><small>${esc(t('dx.youHave', { n: have }))}</small></div>
      </div>
      <p class="eyebrow dx-buy-h">${esc(t('dx.buyH', { c: assetLabel }))}</p>
      <div class="dx-packs">${TICKET_PACKS.map((p) => `<button type="button" class="dx-pack" data-n="${p.n}"><b>${p.n} 🎫</b><small>$${(p.mills / 1000).toFixed(2)}</small>${p.n > 1 ? `<i>−${Math.round(100 - (p.mills / (p.n * 100)) * 100)}%</i>` : ''}</button>`).join('')}</div>`;
  const cls = store.get('darkbags.dxClass', 'assault');
  const rewards = opItems(op, diff, cls)
    .map((it) => {
      const x = itemOf(it);
      const r = x?.rarity ?? 'rare';
      const got = !!rec?.clears?.[diff];
      return `<li class="${got ? 'got' : ''}" style="--rc:${RARITIES[r]?.color ?? '#fff'}"><b>${esc(x?.name ?? it.id)}</b><small>${esc(itemKind(it))} · ${esc(t(`r.${r}`))}${got ? ' · ✓' : ''}</small></li>`;
    })
    .join('');
  const stages = OPS[op].stages.map((s, i) => `<li class="${(rec?.best?.[diff] ?? 0) > i ? 'got' : ''}"><span>${OBJ_ICON[s.obj]}</span><b>${esc(t(`op.${op}.s${i + 1}.name`))}</b><small>${esc(t(`op.obj.${s.obj}`))}</small></li>`).join('');
  el.style.setProperty('--dc', DIFF_COLOR[diff]);
  el.innerHTML = `<p class="op-lede">${esc(t(`op.${op}.lede`))}</p>
    <ol class="op-ops">${list}</ol>
    <div class="dx-diffs" role="radiogroup" aria-label="${esc(t('dx.diffH'))}">${DIFF_IDS.map((d) => `<button type="button" class="dx-diff${d === diff ? ' on' : ''}" data-d="${d}" role="radio" aria-checked="${d === diff}" style="--dc:${DIFF_COLOR[d]}"><b>${DIFF_ICON[d]} ${esc(t(`dx.diff.${d}`))}</b><small>${esc(t('dx.cost', { n: DIFFS[d].tickets }))}</small><em>${esc(t('op.retries', { n: RETRIES[d] }))}</em>${rec?.clears?.[d] ? `<i class="dx-best">✓ ×${rec.clears[d]}</i>` : ''}</button>`).join('')}</div>
    <p class="eyebrow">${esc(t('op.stagesH'))}</p><ol class="op-stages">${stages}</ol>
    <p class="eyebrow">${esc(t('op.rewardsH'))}</p><ul class="dx-items op-rewards">${rewards}</ul>
    <p class="dx-note">${esc(t('op.rule'))}${rec?.saved ? ` ${esc(t('op.savedBest', { n: rec.saved }))}` : ''}</p>
    ${tix}`;
  for (const b of el.querySelectorAll('.op-op button[data-op]')) b.addEventListener('click', () => onPick(b.dataset.op, diff));
  for (const b of el.querySelectorAll('.dx-diff')) b.addEventListener('click', () => onPick(op, b.dataset.d));
  for (const b of el.querySelectorAll('.dx-pack')) b.addEventListener('click', () => onBuy(Number(b.dataset.n), asset));
}

// ------------------------------------------------------------- results

export function opResult(m) {
  const d = m.descent;
  if (!d?.op) return null;
  const won = d.full;
  const kicker = won ? t('op.res.done', { o: t(`op.${d.op}.name`) }) : t('op.res.failed', { n: Math.min(d.of || 4, (d.stages ?? 0) + 1) });
  const amount = won ? `✓ ${t(`dx.diff.${d.diff}`)}` : `${d.stages ?? 0}/${d.of || 4}`;
  const lines = [];
  if (d.practice) lines.push(t('op.res.practice'));
  else lines.push(t(won ? 'op.res.doneText' : 'op.res.failedText'));
  if (won && d.saved) lines.push(t('op.res.saved', { n: d.saved }));
  if (d.carried) lines.push(t('dx.res.carried'));
  if (d.flagged) lines.push(t('dx.res.flagged'));
  if (d.dupXp) lines.push(t('dx.res.dup', { xp: d.dupXp }));
  const items = (d.items ?? []).map((it) => {
    const x = itemOf(it);
    return `<li style="--rc:${RARITIES[it.rarity]?.color ?? '#fff'}"><b>${esc(x?.name ?? it.id)}</b><small>${esc(itemKind(it))} · ${esc(t(`r.${it.rarity}`))}</small></li>`;
  });
  return { win: won, kicker, amount, detail: lines.map(esc).join(' '), items: items.length ? `<p class="eyebrow">${esc(t('dx.res.items'))}</p><ul class="dx-items">${items.join('')}</ul>` : '' };
}

export const rtl = () => getLang() === 'ar';
