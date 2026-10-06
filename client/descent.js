// The Descent on the client: the lobby panel (difficulty, tickets, the reward track, the deepest
// runners), the class pick in the ready room, and inside the run the floor HUD, the camp (shop,
// go deeper or get out), the bosses' cues and the story: an animated scene before every floor,
// chapter openers every tenth, and a reveal for every boss.
import { t } from './i18n.js';
import { store } from './store.js';
import { WEAPONS } from '../shared/weapons.js';
import { DIFFS, DIFF_IDS, CLASSES, CLASS_IDS, PISTOLS, GEAR, FLOORS, MILESTONE, CHAPTERS, BOSSES, bossOf, objectiveOf, chapterOf, milestoneItems, runItems, priceFor, TICKET_PACKS, CAMP_SECONDS } from '../shared/descent.js';
import { OUTFIT, WSKIN, RARITIES } from '../shared/cosmetics.js';
import { STYLE } from '../shared/style.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const hhmm = (ms) => {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

export const DX_MODE = { easy: 'dx-easy', hard: 'dx-hard', hardcore: 'dx-hc' };
export const diffOfMode = (id) => DIFF_IDS.find((d) => DX_MODE[d] === id) ?? null;
export const isDx = (id) => !!diffOfMode(id);
const OBJ_ICON = { clear: '☠', nests: '✺', hold: '⛨', survive: '⏳', boss: '♛' };
const DIFF_ICON = { easy: '◆', hard: '◆◆', hardcore: '◆◆◆' };
const DIFF_COLOR = { easy: '#34d399', hard: '#f97316', hardcore: '#a855f7' };
// the gear bar inside the run, in hotkey order: what everyone has, then the class's own
const GEAR_ICON = { gun: '⬆', armor: '⛨', medkit: '✚', stim: '⚡', turret: '◈', mine: '⌁', aid: '✚✚', revive: '✟', ap: '➶' };
export const gearList = (cls) => ['medkit', 'gun', 'armor', ...Object.keys(GEAR).filter((id) => GEAR[id].cls === cls)];

const itemOf = (it) => (it.k === 'outfit' ? OUTFIT[it.id] : it.k === 'wskin' ? WSKIN[it.id] : STYLE[it.id]);
const itemKind = (it) => (it.k === 'outfit' ? t('dx.kOutfit') : it.k === 'wskin' ? t('dx.kSkin') : t(`dx.k.${STYLE[it.id]?.kind ?? 'frame'}`));

// --------------------------------------------------------------- lobby

// The panel under the mode card when a Descent difficulty is picked: tickets (today's free one,
// those bought, packs to buy), the reward track of the difficulty and the deepest runners.
export function renderDxPanel(el, { mode, view, online, practice, asset, assetLabel, onDiff, onBuy, onBoard }) {
  const diff = diffOfMode(mode);
  if (!el) return;
  el.hidden = !diff;
  if (!diff) return;
  const D = DIFFS[diff];
  const v = view ?? null;
  const have = v ? v.free + v.bought : 0;
  const tix = practice
    ? `<p class="dx-note">${esc(t('dx.practiceFree'))}</p>`
    : !online || !v
      ? `<p class="dx-note">${esc(t('dx.signIn'))}</p>`
      : `<div class="dx-tix">
        <div class="dx-tk ${v.free ? 'on' : ''}"><span class="dx-tk-ico">🎟</span><b>${v.free ? esc(t('dx.freeOn')) : esc(t('dx.freeOff'))}</b><small>${esc(v.free ? t('dx.freeGone', { t: hhmm(v.resetIn) }) : t('dx.freeNext', { t: hhmm(v.resetIn) }))}</small></div>
        <div class="dx-tk"><span class="dx-tk-ico">🎫</span><b>${esc(t('dx.bought', { n: v.bought }))}</b><small>${esc(t('dx.youHave', { n: have }))}</small></div>
      </div>
      <p class="eyebrow dx-buy-h">${esc(t('dx.buyH', { c: assetLabel }))}</p>
      <div class="dx-packs">${TICKET_PACKS.map((p) => `<button type="button" class="dx-pack" data-n="${p.n}"><b>${p.n} 🎫</b><small>$${(p.mills / 1000).toFixed(2)}</small>${p.n > 1 ? `<i>−${Math.round(100 - (p.mills / (p.n * 100)) * 100)}%</i>` : ''}</button>`).join('')}</div>`;
  const track = Array.from({ length: FLOORS / MILESTONE }, (_, i) => {
    const f = (i + 1) * MILESTONE;
    const items = milestoneItems(diff, f, store.get('darkbags.dxClass', 'assault'), store.get('darkbags.dxPistol', 'pistol'));
    const top = items[0];
    const r = itemOf(top)?.rarity ?? 'rare';
    const best = v?.best?.[diff] ?? 0;
    return `<li class="dx-ms ${best >= f ? 'got' : ''} ${f === FLOORS ? 'crown' : ''}" style="--rc:${RARITIES[r].color}" title="${esc(items.map((x) => `${itemOf(x)?.name ?? x.id} · ${t(`r.${itemOf(x)?.rarity ?? 'rare'}`)}`).join('\n'))}"><b>${f}</b><span>${f === FLOORS ? '♛' : top.k === 'outfit' ? '🛡' : top.k === 'wskin' ? '✦' : '◈'}</span></li>`;
  }).join('');
  el.style.setProperty('--dc', DIFF_COLOR[diff]);
  el.innerHTML = `<div class="dx-diffs" role="radiogroup" aria-label="${esc(t('dx.diffH'))}">${DIFF_IDS.map((d) => `<button type="button" class="dx-diff${d === diff ? ' on' : ''}" data-d="${d}" role="radio" aria-checked="${d === diff}" style="--dc:${DIFF_COLOR[d]}"><b>${DIFF_ICON[d]} ${esc(t(`dx.diff.${d}`))}</b><small>${esc(t('dx.cost', { n: DIFFS[d].tickets }))}</small><em>${esc(t(`dx.diff.${d}.d`))}</em>${v?.best?.[d] ? `<i class="dx-best">⬇ ${v.best[d]}/${FLOORS}${v.clears?.[d] ? ` · ♛×${v.clears[d]}` : ''}</i>` : ''}</button>`).join('')}</div>
    ${tix}
    <p class="eyebrow">${esc(t('dx.trackH'))}</p><ol class="dx-track">${track}</ol>
    <p class="dx-note">${esc(t(D.revive ? 'dx.rule' : 'dx.ruleHc'))}</p>
    <button type="button" class="ghost dx-board-btn">🏔 ${esc(t('dx.board'))}</button>
    <div class="dx-board" hidden></div>`;
  for (const b of el.querySelectorAll('.dx-diff')) b.addEventListener('click', () => onDiff(b.dataset.d));
  for (const b of el.querySelectorAll('.dx-pack')) b.addEventListener('click', () => onBuy(Number(b.dataset.n), asset));
  el.querySelector('.dx-board-btn').addEventListener('click', () => onBoard(diff));
}

export function renderDxBoard(el, m) {
  const box = el?.querySelector('.dx-board');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = m.rows.length
    ? `<ol>${m.rows.map((r) => `<li class="${r.me ? 'me' : ''}"><span>${r.pos}</span><b>${esc(r.n)}</b><em>⬇ ${r.best}/${FLOORS}</em>${r.clears ? `<i>♛×${r.clears}</i>` : ''}</li>`).join('')}</ol>`
    : `<p class="dx-note">${esc(t('dx.boardEmpty'))}</p>`;
}

// ---------------------------------------------------------- ready room

// your class and your pistol (each with what it does), and who is taking what in the squad
export function renderDxPick(box, { show, me, slots, send, sfx }) {
  if (!box) return;
  box.hidden = !show;
  if (!show) return;
  const cls = me?.cls ?? store.get('darkbags.dxClass', 'assault');
  const pistol = me?.pistol ?? store.get('darkbags.dxPistol', 'pistol');
  const squad = (slots ?? []).filter((s) => s.cls).map((s) => s.cls);
  const key = `${cls}|${pistol}|${squad.join()}|${t('dx.class.assault')}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const wname = (id) => t(`w.${WEAPONS.find((w) => w.id === id)?.name}`);
  box.innerHTML = `<p class="eyebrow">${esc(t('dx.classH'))}</p><div class="dx-classes">${CLASS_IDS.map((c) => {
    const C = CLASSES[c];
    const n = squad.filter((x) => x === c).length;
    return `<button type="button" class="dx-cls${c === cls ? ' on' : ''}" data-c="${c}" aria-pressed="${c === cls}" style="--cc:${C.color}"><span class="dx-cls-ico">${C.icon}</span><b>${esc(t(`dx.class.${c}`))}</b><small>${esc(wname(C.weapon))}</small><em>${esc(t(`dx.class.${c}.d`))}</em>${n ? `<i class="dx-taken">👥 ${n}</i>` : ''}</button>`;
  }).join('')}</div>
  <p class="eyebrow">${esc(t('dx.pistolH'))}</p><div class="dx-pistols">${PISTOLS.map((p) => `<button type="button" class="dx-pst${p === pistol ? ' on' : ''}" data-p="${p}" aria-pressed="${p === pistol}"><b>${esc(wname(p))}</b><small>${esc(t(`dx.pistol.${p}`))}</small></button>`).join('')}</div>
  <p class="dx-note">${esc(t('dx.swapHint'))}</p>`;
  const pick = (patch) => {
    const next = { cls, pistol, ...patch };
    store.set('darkbags.dxClass', next.cls);
    store.set('darkbags.dxPistol', next.pistol);
    send({ t: 'pick', cls: next.cls, pistol: next.pistol });
    sfx?.play('reload', { secs: 0.5 });
    box.dataset.key = '';
  };
  for (const b of box.querySelectorAll('.dx-cls')) b.addEventListener('click', () => pick({ cls: b.dataset.c }));
  for (const b of box.querySelectorAll('.dx-pst')) b.addEventListener('click', () => pick({ pistol: b.dataset.p }));
}

// ------------------------------------------------------------- results

// the result screen's lines for a run: how deep, banked or lost, and the new things it brought up
export function dxResult(m) {
  const d = m.descent;
  if (!d) return null;
  const won = d.full;
  const kicker = won ? t('dx.res.full') : d.banked ? t('dx.res.out', { n: d.floors }) : t('dx.res.lost', { n: d.floors + 1 });
  const amount = `⬇ ${d.floors}/${FLOORS}`;
  const lines = [];
  lines.push(d.practice ? t('dx.res.practice') : t(d.banked ? 'dx.res.banked' : 'dx.res.below', { d: t(`dx.diff.${d.diff}`) }));
  if (d.carried) lines.push(t('dx.res.carried'));
  if (d.flagged) lines.push(t('dx.res.flagged'));
  if (d.dupXp) lines.push(t('dx.res.dup', { xp: d.dupXp }));
  const items = (d.items ?? []).map((it) => {
    const x = itemOf(it);
    return `<li style="--rc:${RARITIES[it.rarity]?.color ?? '#fff'}"><b>${esc(x?.name ?? it.id)}</b><small>${esc(itemKind(it))} · ${esc(t(`r.${it.rarity}`))} · ${esc(t('dx.floorN', { n: it.floor, of: FLOORS }))}</small></li>`;
  });
  return { win: d.banked, kicker, amount, detail: lines.map(esc).join(' '), items: items.length ? `<p class="eyebrow">${esc(t('dx.res.items'))}</p><ul class="dx-items">${items.join('')}</ul>` : '' };
}

// ----------------------------------------------------------- inside the run

// A story scene: a dungeon in the chapter's colours, the squad going down the stairs, the floor
// and its mission typed in, the narrator's line; on a boss floor the boss rises out of the dark.
// It plays over the game while the server's intro runs (or the camp's stairs), and any key or
// click skips it.
export class Story {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'dx-story';
    this.el.hidden = true;
    this.el.innerHTML = `<canvas></canvas><div class="dx-st-text"><p class="dx-st-ch"></p><h2 class="dx-st-fl"></h2><p class="dx-st-obj"></p><p class="dx-st-line"></p></div><button type="button" class="dx-st-skip">${esc(t('dx.skip'))}</button>`;
    root.append(this.el);
    this.cv = this.el.querySelector('canvas');
    this.el.querySelector('.dx-st-skip').addEventListener('click', () => this.stop());
    this.el.addEventListener('pointerdown', (e) => e.target === this.cv && this.stop());
    this.onKey = (e) => {
      if (!this.el.hidden && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) this.stop();
    };
    addEventListener('keydown', this.onKey);
    this.raf = 0;
  }

  play(floor, { secs = 6, reduced = false } = {}) {
    const ch = chapterOf(floor);
    const C = CHAPTERS[ch];
    const boss = bossOf(floor);
    const obj = objectiveOf(floor);
    const opener = floor === 1 || (floor - 1) % 10 === 0;
    const q = (s) => this.el.querySelector(s);
    q('.dx-st-ch').textContent = `${t('dx.ch.n', { n: ch + 1 })} · ${t(`dx.ch.${ch}`)}`;
    q('.dx-st-fl').textContent = boss ? t(`dx.boss.${boss.id}`) : t('dx.floorN', { n: floor, of: FLOORS });
    q('.dx-st-obj').textContent = boss ? `${t('dx.floorN', { n: floor, of: FLOORS })} · ${t(`dx.bossd.${boss.id}`)}` : `${OBJ_ICON[obj]} ${t(`dx.obj.${obj}`)} · ${t(`dx.obj.${obj}.d`)}`;
    const line = q('.dx-st-line');
    const text = t(`dx.st.${floor}`);
    line.textContent = '';
    this.el.style.setProperty('--tint', boss ? boss.eye : C.tint);
    this.el.classList.toggle('boss', !!boss);
    this.el.classList.toggle('opener', opener);
    this.el.hidden = false;
    this.el.classList.remove('out');
    void this.el.offsetWidth;
    this.el.classList.add('in');
    const t0 = performance.now();
    this.t0 = t0;
    const dur = secs * 1000;
    // particles of the chapter: spores, embers, snow, motes of void, gold dust
    const P = Array.from({ length: reduced ? 0 : 90 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.6, v: 0.02 + Math.random() * 0.06, p: i }));
    const draw = (now) => {
      const k = (now - t0) / dur;
      if (k >= 1 || this.el.hidden) return this.stop();
      const c = this.cv;
      // resize only when the window did: setting a canvas size reallocates it every frame
      const w = Math.round(innerWidth * Math.min(2, devicePixelRatio || 1));
      const h = Math.round(innerHeight * Math.min(2, devicePixelRatio || 1));
      if (c.width !== w || c.height !== h) [c.width, c.height] = [w, h];
      const x = c.getContext('2d');
      drawScene(x, w, h, { ch, k, boss, P, now, floor });
      // the narrator types
      const n = Math.floor(Math.min(1, Math.max(0, (k - 0.18) / 0.5)) * text.length);
      if (line.textContent.length !== n) line.textContent = text.slice(0, n);
      this.raf = requestAnimationFrame(draw);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(draw);
  }

  // fully on screen (not fading in or out): the game under it need not be drawn
  get covering() {
    return !this.el.hidden && !this.el.classList.contains('out') && performance.now() - this.t0 > 400;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    if (this.el.hidden) return;
    this.el.classList.add('out');
    setTimeout(() => (this.el.hidden = true), 260);
  }

  destroy() {
    this.stop();
    removeEventListener('keydown', this.onKey);
    this.el.remove();
  }
}

// the chapters' palettes: sky, stone, glow
const PAL = [
  { sky: ['#020a05', '#0b2416'], stone: '#14261b', glow: '#4ade80', fog: 'rgba(74,222,128,0.10)' },
  { sky: ['#0d0302', '#3a0f04'], stone: '#2a120a', glow: '#fb923c', fog: 'rgba(251,146,60,0.12)' },
  { sky: ['#02070d', '#0c2335'], stone: '#13222f', glow: '#7dd3fc', fog: 'rgba(125,211,252,0.10)' },
  { sky: ['#05010b', '#1f0838'], stone: '#1a0d2a', glow: '#c084fc', fog: 'rgba(192,132,252,0.12)' },
  { sky: ['#0a0702', '#2f2106'], stone: '#2a1f0b', glow: '#fcd34d', fog: 'rgba(252,211,77,0.12)' },
];

function drawScene(x, w, h, { ch, k, boss, P, now, floor }) {
  const pal = PAL[ch];
  const s = Math.min(w, h) / 900;
  // the sky of the deep
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.sky[0]);
  g.addColorStop(1, pal.sky[1]);
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // receding arches (parallax: they slide as the camera goes down)
  const cam = k * 220 * s;
  for (let layer = 3; layer >= 1; layer--) {
    const sc = layer / 3;
    x.fillStyle = shadeHex(pal.stone, -0.15 * (3 - layer));
    const aw = 260 * s * sc;
    for (let i = -1; i < w / aw + 2; i++) {
      const ax = i * aw * 1.4 + ((floor * 37 * layer) % aw) - cam * (0.3 + 0.2 * layer) * 0.2;
      const top = h * (0.22 + 0.12 * (3 - layer)) - cam * 0.1 * layer;
      x.beginPath();
      x.moveTo(ax, h);
      x.lineTo(ax, top + aw * 0.5);
      x.arc(ax + aw / 2, top + aw * 0.5, aw / 2, Math.PI, 0);
      x.lineTo(ax + aw, h);
      x.lineTo(ax + aw - aw * 0.18, h);
      x.lineTo(ax + aw - aw * 0.18, top + aw * 0.55);
      x.arc(ax + aw / 2, top + aw * 0.55, aw / 2 - aw * 0.18, 0, Math.PI, true);
      x.lineTo(ax + aw * 0.18, h);
      x.closePath();
      x.fill();
    }
  }
  // the stairs going down into the light
  const sx = w / 2;
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const f = i / steps;
    const y = h * (0.55 + f * 0.45);
    const half = (60 + f * 360) * s;
    x.fillStyle = shadeHex(pal.stone, 0.1 - f * 0.25);
    x.fillRect(sx - half, y, half * 2, h * 0.034);
    x.fillStyle = 'rgba(255,255,255,0.05)';
    x.fillRect(sx - half, y, half * 2, 2 * s);
  }
  // the glow at the bottom of the stairs
  const gl = x.createRadialGradient(sx, h * 0.55, 10, sx, h * 0.55, 260 * s);
  gl.addColorStop(0, hexA(pal.glow, 0.55 + 0.15 * Math.sin(now / 300)));
  gl.addColorStop(1, hexA(pal.glow, 0));
  x.fillStyle = gl;
  x.fillRect(0, 0, w, h);
  // the squad: four silhouettes walking down
  for (let i = 0; i < 4; i++) {
    const d = Math.min(1, Math.max(0, k * 1.25 - i * 0.07));
    const y = h * (0.98 - d * 0.42);
    const xx = sx + (i - 1.5) * (70 - d * 50) * s;
    const sz = (1.25 - d * 0.75) * s;
    figure(x, xx, y, sz * 60, now / 120 + i * 1.7, pal.glow);
  }
  // the boss rises behind the light
  if (boss) {
    const r = Math.min(1, Math.max(0, (k - 0.25) / 0.45));
    const by = h * (0.6 - 0.18 * r);
    const bs = (2.2 + r * 1.2) * 60 * s;
    x.globalAlpha = r;
    figure(x, sx, by, bs, now / 260, '#000', true);
    // its eyes
    x.fillStyle = boss.eye;
    x.shadowColor = boss.eye;
    x.shadowBlur = 30 * s;
    for (const o of [-1, 1]) {
      x.beginPath();
      x.arc(sx + o * bs * 0.09, by - bs * 1.62, bs * 0.035 * (0.6 + 0.4 * Math.abs(Math.sin(now / 400))), 0, Math.PI * 2);
      x.fill();
    }
    x.shadowBlur = 0;
    x.globalAlpha = 1;
  }
  // spores, embers, snow, void motes, gold dust
  for (const p of P) {
    const yy = ((p.y + (ch === 2 ? 1 : -1) * p.v * (now / 1000)) % 1 + 1) % 1;
    const xx = (p.x + Math.sin(now / 1400 + p.p) * 0.02) % 1;
    x.fillStyle = hexA(ch === 2 ? '#e0f2fe' : pal.glow, 0.25 + 0.5 * Math.abs(Math.sin(now / 700 + p.p)));
    x.beginPath();
    x.arc(xx * w, yy * h, p.s * 2 * s, 0, Math.PI * 2);
    x.fill();
  }
  // fog and the vignette
  x.fillStyle = pal.fog;
  x.fillRect(0, h * 0.5, w, h * 0.5);
  const v = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.85)');
  x.fillStyle = v;
  x.fillRect(0, 0, w, h);
  // fade in and out
  const a = k < 0.08 ? 1 - k / 0.08 : k > 0.9 ? (k - 0.9) / 0.1 : 0;
  if (a > 0) {
    x.fillStyle = `rgba(0,0,0,${a})`;
    x.fillRect(0, 0, w, h);
  }
}

// a stick runner (or the boss, hunched and horned) seen from behind, walking
function figure(x, cx, cy, size, ph, glow, boss = false) {
  const L = size * 0.3;
  x.save();
  x.translate(cx, cy);
  x.strokeStyle = boss ? '#000' : 'rgba(5,5,8,0.95)';
  x.lineWidth = size * (boss ? 0.12 : 0.085);
  x.lineCap = 'round';
  const sw = Math.sin(ph) * 0.45;
  x.beginPath();
  x.moveTo(0, -L * 2);
  x.lineTo(Math.sin(sw) * L, -L + Math.cos(sw) * L - L);
  x.moveTo(0, -L * 2);
  x.lineTo(Math.sin(-sw) * L, -L + Math.cos(-sw) * L - L);
  x.moveTo(0, -L * 2);
  x.lineTo(0, -L * 3.6);
  x.moveTo(0, -L * 3.3);
  x.lineTo(-L * (boss ? 1.1 : 0.7), -L * (boss ? 2.4 : 2.5) + Math.sin(ph) * L * 0.2);
  x.moveTo(0, -L * 3.3);
  x.lineTo(L * (boss ? 1.1 : 0.7), -L * (boss ? 2.4 : 2.5) - Math.sin(ph) * L * 0.2);
  x.stroke();
  x.fillStyle = x.strokeStyle;
  x.beginPath();
  x.arc(0, -L * 4.05, L * (boss ? 0.62 : 0.48), 0, Math.PI * 2);
  x.fill();
  if (boss) {
    x.beginPath();
    x.moveTo(-L * 0.35, -L * 4.5);
    x.quadraticCurveTo(-L * 0.9, -L * 5, -L * 0.7, -L * 5.6);
    x.moveTo(L * 0.35, -L * 4.5);
    x.quadraticCurveTo(L * 0.9, -L * 5, L * 0.75, -L * 5.5);
    x.stroke();
  } else {
    // a rim of the light below on the outline
    x.strokeStyle = hexA(glow, 0.5);
    x.lineWidth = size * 0.02;
    x.beginPath();
    x.arc(0, -L * 4.05, L * 0.5, Math.PI * 0.15, Math.PI * 0.85);
    x.stroke();
  }
  x.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (k > 0 ? (255 - v) * k : v * k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * The run's own HUD over the game: the floor and its mission with its progress, the boss's name
 * and health, the gear bar (hotkeys 1–6, E to swap to the pistol), and the camp between floors.
 */
export class DescentHud {
  constructor(game) {
    this.g = game;
    const root = document.getElementById('hud') ?? document.body;
    this.root = document.createElement('div');
    this.root.className = 'dx-hud';
    this.root.innerHTML = `<div class="dx-top"><span class="dx-fl"></span><span class="dx-ob"></span><div class="dx-prog" hidden><i></i></div></div>
      <div class="dx-bossbar" hidden><b></b><div><i></i></div><small></small></div>
      <div class="dx-gear"><span class="dx-coins"><i>⛁</i><b>0</b></span><div class="dx-gear-row"></div><button type="button" class="dx-swap" title="E"><span></span><kbd>E</kbd></button></div>
      <div class="dx-camp" hidden><div class="dx-camp-in">
        <p class="eyebrow dx-camp-k"></p><h2 class="dx-camp-h"></h2><p class="dx-camp-next"></p><p class="dx-camp-ms" hidden></p><ul class="dx-camp-loot" hidden></ul>
        <div class="dx-camp-shop"></div>
        <div class="dx-camp-go"><button type="button" class="cta dx-go"></button><button type="button" class="ghost dx-out"></button></div>
        <p class="dx-camp-wait"></p></div></div>`;
    root.append(this.root);
    this.story = new Story(document.body);
    this.q = (s) => this.root.querySelector(s);
    this.q('.dx-go').addEventListener('click', () => this.choose('go'));
    this.q('.dx-out').addEventListener('click', () => this.choose('out'));
    this.q('.dx-swap').addEventListener('click', () => this.swap());
    this.cls = null;
    this.gearKey = '';
    this.lastState = null;
    this.floor = 1;
  }

  begin(start) {
    this.mode = start.mode;
    this.diff = diffOfMode(start.mode);
    this.floor = 1;
    this.root.hidden = false;
    this.story.play(1, { secs: 6.5, reduced: !this.g.motion });
  }

  stop() {
    this.root.hidden = true;
    this.story.stop();
  }

  destroy() {
    this.root.remove();
    this.story.destroy();
  }

  choose(v) {
    this.g.send({ t: 'descend', v });
    this.g.sfx.play(v === 'go' ? 'ready' : 'extract');
  }

  swap() {
    if (this.g.you?.st !== 'alive') return;
    this.g.send({ t: 'wswap' }); // not 'swap': that is the lobby's coin swap
  }

  // hotkeys: 1–6 for the gear bar in its order
  digit(n) {
    const id = gearList(this.cls ?? 'assault')[n - 1];
    if (!id) return false;
    this.g.send({ t: 'buy', item: id });
    return true;
  }

  // what the snapshot says, every HUD tick
  update(you) {
    if (!you?.dx) return;
    this.cls = you.cls ?? this.cls;
    this.floor = you.zw ?? this.floor;
    const camp = you.ds === 2;
    const intro = you.ds === 0;
    // top line: the floor, the mission, its progress
    this.q('.dx-fl').textContent = `${t('dx.ch.n', { n: chapterOf(you.zw ?? 1) + 1 })} · ${t(`dx.ch.${chapterOf(you.zw ?? 1)}`)}`;
    let ob = '';
    let pct = null;
    if (camp) ob = t('dx.campT', { s: you.dt });
    else if (intro) ob = `${OBJ_ICON[you.ob]} ${t(`dx.obj.${you.ob}`)}`;
    else if (you.ob === 'hold') {
      ob = `${OBJ_ICON.hold} ${t('dx.holdP', { p: you.hd ?? 0 })}`;
      pct = you.hd ?? 0;
    } else if (you.ob === 'nests') ob = `${OBJ_ICON.nests} ${t('dx.nestsN', { n: you.nn ?? 0 })}`;
    else if (you.ob === 'survive') {
      ob = `${OBJ_ICON.survive} ${t('dx.surviveS', { s: mmss(you.dt ?? 0) })}`;
      pct = 100 - ((you.dt ?? 0) / 60) * 100;
    } else if (you.ob === 'boss') ob = `${OBJ_ICON.boss} ${t('dx.obj.boss')}`;
    else ob = `${OBJ_ICON.clear} ${t('dx.leftN', { n: you.zl ?? 0 })}`;
    this.q('.dx-ob').textContent = ob;
    const prog = this.q('.dx-prog');
    prog.hidden = pct === null;
    if (pct !== null) prog.firstElementChild.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    // the boss
    const bb = this.q('.dx-bossbar');
    bb.hidden = you.zb == null || camp;
    if (!bb.hidden) {
      bb.querySelector('b').textContent = t(`dx.boss.${you.bk ?? 'gravekeeper'}`);
      bb.querySelector('i').style.width = `${you.zb}%`;
      bb.classList.toggle('stone', !!you.bst);
      bb.querySelector('small').textContent = you.bst ? t('dx.stone') : '';
      const B = BOSSES.find((b) => b.id === you.bk);
      if (B) bb.style.setProperty('--bc', B.eye);
    }
    // coins and gear
    this.q('.dx-coins b').textContent = String(you.cr ?? 0);
    const list = gearList(this.cls);
    const me = { dClass: this.cls, dGun: you.gg ?? 0, dArmor: you.ga ?? 0, dAp: you.gp ?? 0 };
    const key = `${this.cls}|${me.dGun}|${me.dArmor}|${me.dAp}|${Math.floor((you.cr ?? 0) / 50)}|${t('dx.gear.gun')}`;
    if (key !== this.gearKey) {
      this.gearKey = key;
      const html = list.map((id, i) => {
        const price = priceFor(me, id);
        const lv = id === 'gun' ? me.dGun : id === 'armor' ? me.dArmor : id === 'ap' ? me.dAp : null;
        const poor = price == null || (you.cr ?? 0) < price;
        return `<button type="button" class="dx-g${poor ? ' poor' : ''}${price == null ? ' max' : ''}" data-id="${id}" title="${esc(t(`dx.gear.${id}.d`))}"><span class="dx-g-ico">${GEAR_ICON[id]}</span><b>${esc(t(`dx.gear.${id}`))}${lv != null ? ` <small>${lv}/${GEAR[id].max}</small>` : ''}</b><em>${price == null ? esc(t('dx.max')) : price}</em><kbd>${i + 1}</kbd></button>`;
      }).join('');
      for (const sel of ['.dx-gear-row', '.dx-camp-shop']) {
        const row = this.q(sel);
        row.innerHTML = html;
        for (const b of row.querySelectorAll('.dx-g')) b.addEventListener('click', () => this.g.send({ t: 'buy', item: b.dataset.id }));
      }
    }
    const wNow = WEAPONS[you.w];
    const w2 = WEAPONS[you.w2];
    const sw = this.q('.dx-swap span');
    if (w2) sw.textContent = `${t(`w.${w2.name}`)} · ${you.a2 ?? 0}`;
    this.q('.dx-swap').hidden = !w2;
    this.root.classList.toggle('stim', (you.sm ?? 0) > 0);
    // the camp
    const cp = this.q('.dx-camp');
    if (camp !== (this.lastState === 2)) {
      cp.hidden = !camp;
      if (camp) this.g.sfx.music?.set({ mode: 'prep', intensity: 0, bpm: 96 });
      else this.g.sfx.music?.set({ mode: 'raid', intensity: 1, bpm: 140 });
    }
    if (camp) {
      const next = you.zw + 1;
      const boss = bossOf(next);
      this.q('.dx-camp-k').textContent = t('dx.campK', { n: you.zw, of: FLOORS });
      this.q('.dx-camp-h').textContent = t('dx.camp');
      this.q('.dx-camp-next').textContent = boss ? t('dx.nextBoss', { b: t(`dx.boss.${boss.id}`), n: next }) : t('dx.next', { o: t(`dx.obj.${objectiveOf(next)}`), n: next });
      const ms = this.q('.dx-camp-ms');
      const banked = Math.floor(you.zw / MILESTONE) * MILESTONE;
      ms.hidden = banked < MILESTONE;
      if (!ms.hidden) ms.textContent = t('dx.msHeld', { n: banked / MILESTONE });
      // what getting out now would bring up, item by item (they are only kept on the way out)
      const loot = this.q('.dx-camp-loot');
      const items = banked >= MILESTONE ? runItems(this.diff, banked, you.cls ?? 'assault', you.pz ?? 'pistol') : [];
      const lootKey = `${this.diff}|${banked}|${you.cls}|${you.pz}`;
      loot.hidden = !items.length;
      if (loot.dataset.key !== lootKey) {
        loot.dataset.key = lootKey;
        loot.innerHTML = items
          .map((it) => {
            const x = itemOf(it);
            const r = x?.rarity ?? 'rare';
            return `<li style="--rc:${RARITIES[r]?.color ?? '#fff'}"><b>${esc(x?.name ?? it.id)}</b><small>${esc(itemKind(it))} · ${esc(t(`r.${r}`))}</small></li>`;
          })
          .join('');
      }
      const go = this.q('.dx-go');
      const out = this.q('.dx-out');
      go.textContent = `${t('dx.go')} · ${you.dt}s`;
      out.textContent = items.length ? t('dx.outN', { n: items.length }) : t('dx.out');
      go.classList.toggle('on', you.ch === 'go');
      out.classList.toggle('on', you.ch === 'out');
      go.disabled = you.st !== 'alive';
      out.disabled = you.st !== 'alive';
      this.q('.dx-camp-wait').textContent = you.ch ? t('dx.waiting', { n: you.wait ?? 0 }) : t('dx.decide', { s: you.dt });
    }
    this.lastState = you.ds;
  }

  // the run's events (the rest go to the zombie mode's handlers in game.js)
  onEvent(ev, now) {
    const g = this.g;
    switch (ev.k) {
      case 'floor':
        g.banner(ev.boss ? t('dx.bossIn', { b: t(`dx.boss.${ev.boss}`) }) : `${t('dx.floorN', { n: ev.n, of: ev.of })} · ${t(`dx.obj.${ev.obj}`)}`, ev.boss ? 'warn' : 'gold', 2600);
        g.sfx.play('storm');
        if (ev.boss) {
          g.sfx.say?.('final', 'en');
          g.shake = Math.max(g.shake, 12);
        }
        return true;
      case 'camp':
        g.banner(t('dx.cleared', { n: ev.n }), 'money', 2400);
        g.sfx.play('level');
        if (ev.milestone) g.banner(t('dx.milestone', { n: ev.n }), 'gold', 3200);
        if (g.pred && ev.bonus) g.fx.floater(g.pred.x, g.pred.y - 46, `+${ev.bonus} ⛁`, '#ffd166', 18, 1.3);
        return true;
      case 'floorMap':
        // the stairs: a new arena (the server moved everyone into it), and the story card
        g.newMap(ev.map);
        this.floor = ev.n;
        this.story.play(ev.n, { secs: 5.5, reduced: !g.motion });
        return true;
      case 'bossIn':
        g.shake = Math.max(g.shake, 14);
        return true;
      case 'bossDown':
        g.banner(t('dx.bossDown', { b: t(`dx.boss.${ev.boss}`) }), 'gold', 3200);
        g.sfx.music?.sting(true);
        return true;
      case 'stone':
        g.fx.ring(ev.x, ev.y, '#cbd5e1');
        g.banner(t('dx.stone'), 'warn', 1500);
        return true;
      case 'charge':
        g.banner(t('dx.charge'), 'warn', 900);
        g.sfx.play('beep', { f: 160, dur: 0.25 });
        return true;
      case 'volley':
        g.fx.ring(ev.x, ev.y, '#a3e635');
        g.sfx.play('shotgun', { x: ev.x, y: ev.y, pitch: 0.5 });
        return true;
      case 'hatch':
        g.fx.dust(ev.x, ev.y, 6, 'rgba(163,230,53,0.35)');
        return true;
      case 'aid':
        g.fx.ring(ev.x, ev.y, '#4ade80');
        g.fx.sparks(ev.x, ev.y, 24, 18, '#4ade80');
        if (ev.by === g.pid) g.banner(t('dx.aided', { n: ev.n }), 'money', 1400);
        return true;
      case 'swapped':
        g.sfx.play('reload', { secs: 0.3 });
        return true;
      case 'chose':
        if (ev.pid !== g.pid) g.feed(t(ev.v === 'go' ? 'dx.choseGo' : 'dx.choseOut', { name: `<b>${esc(ev.name)}</b>` }), ev.v === 'go' ? 'me' : 'warnline');
        return true;
      case 'fullClear':
        g.banner(t('dx.fullClear'), 'gold', 5000);
        g.sfx.say?.('victory', 'en');
        return true;
      default:
        return false;
    }
  }
}

export { CAMP_SECONDS };
