// The locker: your character, your outfits and weapon skins. Equip only: skins come
// from bags and crates in the shop (shop.js). Also draws the box art both use.
import { OUTFIT, OUTFITS, RARITIES, RARITY_ORDER, FINISH, WEAPON_SKINS, WSKIN, SEASON_OUTFITS, TURRET_SKIN } from '../shared/cosmetics.js';
import { WEAPONS } from '../shared/weapons.js';
import { drawPreview, figureStill, weaponArt, drawWeapon } from './stickman.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const rn = (k) => t(`r.${k}`);

// ------------------------------------------------------------- box art

// Box and crate art in SVG, one palette per tier: bags are soft sacks with a
// drawstring, crates are hard cases with latches. The dearer the tier, the richer.
const TIER_PAL = [
  { body: '#3a4150', lid: '#4b5466', strap: '#ff9f1c', trim: '#1f242e', glow: '#ff9f1c' },
  { body: '#1e2d4a', lid: '#2a3d63', strap: '#4cc9f0', trim: '#0e1628', glow: '#4cc9f0' },
  { body: '#b8860b', lid: '#e0a526', strap: '#fff1b8', trim: '#6b4b06', glow: '#ffd166' },
  { body: '#4c1d95', lid: '#6d28d9', strap: '#c4b5fd', trim: '#2e1065', glow: '#b37bff' },
  { body: '#0e7490', lid: '#22d3ee', strap: '#ecfeff', trim: '#083344', glow: '#9fe8ff' },
  { body: '#0b0b0f', lid: '#1f1f2a', strap: '#ff3d7f', trim: '#000000', glow: '#ff3d7f' },
  { body: '#7f1d1d', lid: '#b91c1c', strap: '#ffd166', trim: '#450a0a', glow: '#ffd166' },
  { body: '#111827', lid: '#e5e7eb', strap: '#00f0ff', trim: '#030712', glow: '#00f0ff' },
  { body: '#f7931a', lid: '#ffd166', strap: '#ffffff', trim: '#7c2d12', glow: '#ffffff' },
];
// a colour darkened (k < 0) or lightened (k > 0), for the themed cases' palettes
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};

export function boxArt(box, size = 120) {
  const tier = (box?.tier ?? 1) - 1;
  const a = box?.art;
  // collection cases wear their theme: its colours and its emblem on the front
  const p = a ? { body: shade(a.c1, -0.55), lid: shade(a.c1, -0.15), strap: shade(a.c1, 0.55), trim: a.c2, glow: a.c1 } : TIER_PAL[tier] ?? TIER_PAL[0];
  const crate = box?.family === 'weapon';
  const uid = `bx${box?.id ?? 'x'}${Math.random().toString(36).slice(2, 7)}`;
  const rays = tier >= 5 || a ? `<g opacity=".5" stroke="${p.glow}" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<line x1="60" y1="64" x2="${60 + Math.cos((i / 12) * Math.PI * 2) * 60}" y2="${64 + Math.sin((i / 12) * Math.PI * 2) * 60}"/>`).join('')}</g>` : '';
  const gem = tier >= 3 ? `<path d="M60 58 l7 7 -7 10 -7 -10z" fill="${p.strap}" stroke="${p.trim}" stroke-width="1.5"/>` : `<circle cx="60" cy="68" r="6" fill="${p.trim}" stroke="${p.strap}" stroke-width="2"/>`;
  const shape = crate
    ? `<path d="M18 46 L60 30 L102 46 L60 62 Z" fill="url(#${uid}l)" stroke="${p.trim}" stroke-width="2"/>
  <path d="M18 46 L60 62 L60 104 L18 88 Z" fill="url(#${uid}f)" stroke="${p.trim}" stroke-width="2"/>
  <path d="M102 46 L60 62 L60 104 L102 88 Z" fill="${p.trim}" opacity=".9"/>
  <path d="M102 46 L60 62 L60 104 L102 88 Z" fill="url(#${uid}f)" opacity=".55" stroke="${p.trim}" stroke-width="2"/>
  <path d="M18 60 L60 76 L102 60" fill="none" stroke="${p.strap}" stroke-width="3" opacity=".8"/>
  <rect x="30" y="66" width="8" height="10" rx="1.5" fill="${p.strap}" transform="skewY(20.8) translate(0 -12)"/>
  <rect x="82" y="66" width="8" height="10" rx="1.5" fill="${p.strap}" transform="skewY(-20.8) translate(0 44)"/>`
    : `<path d="M30 52 Q24 100 60 104 Q96 100 90 52 Q60 42 30 52Z" fill="url(#${uid}f)" stroke="${p.trim}" stroke-width="2"/>
  <path d="M40 50 Q60 30 80 50" fill="none" stroke="${p.strap}" stroke-width="4" stroke-linecap="round"/>
  <path d="M30 52 Q60 62 90 52" fill="none" stroke="${p.trim}" stroke-width="3"/>
  <path d="M34 60 Q60 70 86 60" fill="none" stroke="${p.strap}" stroke-width="2" opacity=".6"/>`;
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true" class="box-svg t${tier + 1}">
  <defs>
    <linearGradient id="${uid}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.lid}"/><stop offset="1" stop-color="${p.body}"/></linearGradient>
    <linearGradient id="${uid}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.lid}"/><stop offset="1" stop-color="${p.body}"/></linearGradient>
    <radialGradient id="${uid}g" cx=".5" cy=".55" r=".55"><stop offset="0" stop-color="${p.glow}" stop-opacity=".45"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
  </defs>
  ${rays}
  <ellipse cx="60" cy="106" rx="44" ry="7" fill="#000" opacity=".5"/>
  <circle cx="60" cy="66" r="56" fill="url(#${uid}g)"/>
  ${shape}
  ${a ? `<circle cx="${crate ? 39 : 60}" cy="${crate ? 74 : 80}" r="13" fill="${a.c2}" stroke="${p.strap}" stroke-width="1.6"/><text x="${crate ? 39 : 60}" y="${crate ? 79 : 85}" text-anchor="middle" font-size="15" font-weight="900" fill="${p.strap}" font-family="system-ui, sans-serif">${a.icon}</text>` : gem}
</svg>`;
}

// A still of a weapon in a skin, for cards: just the weapon, tilted a little, fitted and
// centred in the frame (its own lines give the bounds), with a soft glow in its colour.
const wstills = new Map();
const TILT = -0.3;
export function weaponStill(skinId, w = 150, h = 100) {
  const key = `${skinId}:${w}x${h}`;
  if (wstills.has(key)) return wstills.get(key);
  // 'gun:<weapon id>' draws the plain weapon, with no skin on it
  const s = WSKIN[skinId] ?? (String(skinId).startsWith('gun:') ? { weapon: skinId.slice(4), finish: null } : null);
  const wi = Math.max(0, WEAPONS.findIndex((x) => x.id === s?.weapon));
  const art = weaponArt(wi, s?.finish ? { [s.weapon]: s.finish } : null);
  const fin = s?.finish ? FINISH[s.finish] : null;
  // bounds of the tilted weapon, line widths included
  const c = Math.cos(TILT);
  const sn = Math.sin(TILT);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [ax, ay, bx, by, lw] of art.lines) {
    for (const [x, y] of [[ax, ay], [bx, by]]) {
      const rx = x * c - y * sn;
      const ry = x * sn + y * c;
      const pad = lw / 2 + 1.5;
      x0 = Math.min(x0, rx - pad);
      x1 = Math.max(x1, rx + pad);
      y0 = Math.min(y0, ry - pad);
      y1 = Math.max(y1, ry + pad);
    }
  }
  const k = Math.min((w * 0.82) / (x1 - x0), (h * 0.72) / (y1 - y0), 6);
  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  if (fin?.color) {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.5);
    g.addColorStop(0, `${fin.color}55`);
    g.addColorStop(1, `${fin.color}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.translate(w / 2 - ((x0 + x1) / 2) * k, h / 2 - ((y0 + y1) / 2) * k);
  ctx.scale(k, k);
  ctx.lineCap = 'round';
  drawWeapon(ctx, { art, grip: { x: 0, y: 0 }, aim: TILT }, false, fin, 800);
  const url = cv.toDataURL();
  wstills.set(key, url);
  return url;
}

export const gunStill = (weaponId, w, h) => weaponStill(`gun:${weaponId}`, w, h);

// a turret skin as a small picture, for the locker grid
const tstills = new Map();
function turretStill(sk) {
  if (tstills.has(sk.id)) return tstills.get(sk.id);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="120" height="80"><g stroke="#05070b" stroke-width="1.2"><path d="M20 24 L9 36 M20 24 L20 37 M20 24 L31 36" stroke="#3a4253" stroke-width="2.4" stroke-linecap="round"/><rect x="20" y="13" width="15" height="3" fill="${sk.trim}"/><rect x="20" y="19" width="15" height="3" fill="${sk.trim}"/><rect x="9" y="9" width="16" height="16" rx="4" fill="${sk.body}" stroke="${sk.trim}"/><circle cx="17" cy="17" r="3.2" fill="${sk.eye}"/></g></svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  tstills.set(sk.id, url);
  return url;
}

// ------------------------------------------------------------ the locker

export function createLocker({ app, send, sfx, toast, openShop }) {
  const st = { tab: 'outfits', selected: null, wsel: null, tsel: null, weapon: 'knife', rar: 'all', wf: 'all', sort: 'desc', raf: 0 };
  const L = () => app.locker;
  const trialLeft = (id) => Math.max(0, (L()?.trials?.[id] ?? 0) - Date.now());
  const owns = (id) => OUTFIT[id]?.basic || L()?.owned.includes(id) || trialLeft(id) > 0;
  const bagsHeld = () => Object.values(L()?.boxes ?? {}).reduce((a, b) => a + b, 0);
  const left = (ms) => (ms > 86400000 ? `${Math.ceil(ms / 86400000)}d` : `${Math.ceil(ms / 3600000)}h`);
  const myWs = () => L()?.wequip ?? {};
  const lookOf = (id = null, extra = {}) => ({ outfit: id ?? L()?.outfit ?? 'basic-0', body: L()?.body ?? 'm', ws: myWs(), ...extra });
  const serial = (id) => {
    const o = OUTFIT[id] ?? WSKIN[id];
    const n = L()?.serials?.[id];
    return o?.limited && n ? ` #${n}/${o.limited}` : '';
  };

  // ------------------------------------------------------------ lobby tile

  function renderTile() {
    const tile = $('locker-tile');
    if (!tile) return;
    tile.hidden = !L();
    $('lt-marks').hidden = !L();
    if (!L()) return;
    const o = OUTFIT[L().outfit] ?? OUTFIT['basic-0'];
    const r = RARITIES[o.rarity];
    $('lt-name').textContent = o.name + serial(o.id);
    $('lt-name').style.color = r.color;
    $('lt-rarity').textContent = `${rn(o.rarity)} · ${L().body === 'f' ? t('lk.her') : t('lk.him')}`;
    const bags = bagsHeld();
    $('lt-marks').textContent = bags ? t('lk.toOpen', { n: bags }) : '';
    $('tb-credit-v').textContent = usdCents(L().credit);
    document.querySelector('.nav-btn[data-page="shop"] .nav-badge').hidden = !bags;
    document.querySelector('.nav-btn[data-page="shop"] .nav-badge').textContent = bags ? String(bags) : '';
    tile.style.setProperty('--r', r.color);
  }
  const usdCents = (c) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

  // one loop drives the lobby tile and the locker stage while they are on screen
  function loop(now) {
    st.raf = requestAnimationFrame(loop);
    const tileCv = $('lt-canvas');
    if (tileCv && !$('locker-tile').hidden && !$('lobby').hidden && !document.querySelector('.page-play').hidden) paint(tileCv, lookOf(), now, 0.95);
    const stage = $('lk-stage');
    if (stage && $('dlg-locker').open) {
      const ws = st.wsel ? { ...myWs(), [WSKIN[st.wsel].weapon]: WSKIN[st.wsel].finish } : myWs();
      const w = st.tab === 'weapons' && st.wsel ? WEAPONS.findIndex((x) => x.id === st.weapon) : undefined;
      paint(stage, lookOf(st.selected, { ws, w }), now, 1, true);
    }
  }

  function paint(cv, look, now, zoom = 1, big = false) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const o = OUTFIT[look.outfit];
    const rc = RARITIES[o?.rarity ?? 'common'].color;
    // spotlight and a glowing floor ring in the rarity colour
    const floorY = h * 0.86;
    const spot = ctx.createRadialGradient(w / 2, h * 0.1, 0, w / 2, h * 0.55, h * 0.75);
    spot.addColorStop(0, 'rgba(255,255,255,0.10)');
    spot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);
    const ring = ctx.createRadialGradient(w / 2, floorY, 2, w / 2, floorY, w * 0.42);
    ring.addColorStop(0, `${rc}55`);
    ring.addColorStop(1, `${rc}00`);
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.ellipse(w / 2, floorY, w * 0.42, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `${rc}aa`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(w / 2, floorY, w * 0.22, h * 0.035, 0, 0, Math.PI * 2);
    ctx.stroke();
    // idle: breathe, glance around, now and then shoulder the next weapon
    const cycle = Math.floor(now / 2600);
    const aim = big ? Math.sin(now / 1900) * 0.35 - 0.15 + (cycle % 4 === 3 ? Math.PI : 0) : -0.2;
    const scale = ((h * 0.78) / 70) * zoom;
    const wpn = look.w ?? (big ? cycle % 6 : 0);
    drawPreview(ctx, look, { x: w / 2, y: floorY, scale, t: now, w: wpn, aim, attackT: big && now % 2600 < 400 ? now - (now % 2600) + 100 : -1e9 });
  }

  // --------------------------------------------------------------- dialog
  // Your collection only: outfits, weapon skins and turret skins you own, filtered by
  // rarity and sorted (rarest first, or the other way). A tap previews on the stage, the
  // button equips. The grid is rebuilt only when the list changes; selecting just moves
  // the highlight, so even a big collection stays quick on a phone.
  const R = (r) => RARITY_ORDER.indexOf(r);
  const ownedOutfits = () => [...SEASON_OUTFITS, ...OUTFITS].filter((o) => owns(o.id));
  const ownedSkins = () => (L()?.wowned ?? []).map((id) => WSKIN[id]).filter(Boolean);
  const ownedTurrets = () => (L()?.towned ?? []).map((id) => TURRET_SKIN[id]).filter(Boolean);
  const wName = (id) => t(`w.${WEAPONS.find((w) => w.id === id)?.name ?? 'Knife'}`);

  function open(tab = 'outfits') {
    st.selected = null;
    st.wsel = null;
    st.tsel = null;
    setTab(tab);
    $('dlg-locker').showModal();
    sfx.unlock?.();
  }

  function setTab(tab) {
    st.tab = tab;
    st.rar = 'all';
    for (const b of document.querySelectorAll('#dlg-locker [data-lt]')) b.setAttribute('aria-selected', String(b.dataset.lt === tab));
    render();
  }

  // the items of the current tab, filtered and sorted
  function items() {
    const list = st.tab === 'outfits' ? ownedOutfits() : st.tab === 'weapons' ? ownedSkins().filter((x) => st.wf === 'all' || x.weapon === st.wf) : ownedTurrets();
    const dir = st.sort === 'asc' ? 1 : -1;
    return list.filter((o) => st.rar === 'all' || o.rarity === st.rar).sort((a, b) => dir * (R(a.rarity) - R(b.rarity)) || a.name.localeCompare(b.name));
  }

  function equippedId() {
    if (st.tab === 'outfits') return L().outfit;
    if (st.tab === 'turrets') return L().tequip ?? null;
    return null;
  }
  const isOn = (o) => (st.tab === 'weapons' ? myWs()[o.weapon] === o.finish : equippedId() === o.id);
  const thumb = (o) => (st.tab === 'outfits' ? figureStill({ outfit: o.id, body: L().body }, 84, 112) : st.tab === 'weapons' ? weaponStill(o.id) : turretStill(o));

  function render() {
    if (!L()) return;
    $('lk-marks').textContent = usdCents(L().credit);
    $('lk-bonus').textContent = '';
    for (const b of document.querySelectorAll('#lk-body [data-body]')) b.setAttribute('aria-checked', String(b.dataset.body === L().body));
    // filter chips: only the rarities you actually have, with counts
    const all = st.tab === 'outfits' ? ownedOutfits() : st.tab === 'weapons' ? ownedSkins() : ownedTurrets();
    const have = RARITY_ORDER.filter((r) => all.some((o) => o.rarity === r));
    $('lk-rar').innerHTML = [['all', t('lk.all'), all.length], ...have.map((r) => [r, rn(r), all.filter((o) => o.rarity === r).length])]
      .map(([k, label, n]) => `<button type="button" data-rar="${k}" aria-pressed="${st.rar === k}" style="${k !== 'all' ? `--r:${RARITIES[k].color}` : ''}">${esc(label)} <small>${n}</small></button>`)
      .join('');
    $('lk-sort').textContent = st.sort === 'asc' ? t('lk.sortAsc') : t('lk.sortDesc');
    // weapons: which gun
    const wt = $('lk-wtabs');
    wt.hidden = st.tab !== 'weapons';
    if (st.tab === 'weapons') {
      const guns = WEAPONS.filter((w) => all.some((x) => x.weapon === w.id));
      wt.innerHTML = [['all', t('lk.allGuns')], ...guns.map((w) => [w.id, t(`w.${w.name}`)])].map(([k, label]) => `<button type="button" data-wf="${k}" aria-pressed="${st.wf === k}">${esc(label)}</button>`).join('');
    }
    const list = items();
    const total = st.tab === 'outfits' ? OUTFITS.length : st.tab === 'weapons' ? WEAPON_SKINS.length : null;
    $('lk-count').textContent = total ? t('lk.collected', { a: all.length, b: total }) : String(all.length);
    $('lk-grid').innerHTML = list
      .map((o) => {
        const on = isOn(o);
        const sel = st.tab === 'outfits' ? st.selected === o.id : st.tab === 'weapons' ? st.wsel === o.id : st.tsel === o.id;
        const trial = st.tab === 'outfits' && !o.basic && !L().owned.includes(o.id) && trialLeft(o.id) > 0;
        const sub = st.tab === 'weapons' ? wName(o.weapon) : trial ? t('lk.trialLeft', { t: left(trialLeft(o.id)) }) : rn(o.rarity);
        return `<button type="button" class="lk-item r-${o.rarity}${on ? ' on' : ''}${sel ? ' sel' : ''}${o.limited || o.season ? ' limited' : ''}" data-id="${esc(o.id)}" style="--r:${RARITIES[o.rarity].color}"><span class="lk-shine"></span><img alt="" loading="lazy" decoding="async"${st.tab !== 'outfits' ? ' class="wimg"' : ''} src="${thumb(o)}"><span class="lk-name">${esc(o.name)}${esc(serial(o.id))}</span><span class="lk-state ${on ? 'on' : 'own'}">${on ? t('lk.equipped') : esc(sub)}</span></button>`;
      })
      .join('');
    $('lk-empty').hidden = list.length > 0;
    $('lk-empty').textContent = t(st.tab === 'turrets' ? 'lk.emptyTurrets' : 'lk.empty');
    renderDetail();
  }

  // the left panel: what is selected (or worn), and the button to wear it
  function renderDetail() {
    const d = $('lk-detail');
    let o = null;
    let on = false;
    let act = '';
    if (st.tab === 'outfits') {
      o = OUTFIT[st.selected ?? L().outfit];
      on = L().outfit === o.id;
      if (!on) act = `<button type="button" class="cta" data-act="equip">${t('lk.equip')}</button>`;
    } else if (st.tab === 'weapons') {
      o = st.wsel ? WSKIN[st.wsel] : null;
      if (o) {
        on = myWs()[o.weapon] === o.finish;
        act = on ? `<button type="button" class="ghost" data-act="plain">${t('lk.takeOff')}</button>` : `<button type="button" class="cta" data-act="equip">${t('lk.equip')}</button>`;
      }
    } else {
      o = st.tsel ? TURRET_SKIN[st.tsel] : L().tequip ? TURRET_SKIN[L().tequip] : null;
      if (o) {
        on = L().tequip === o.id;
        act = on ? `<button type="button" class="ghost" data-act="plain">${t('lk.takeOff')}</button>` : `<button type="button" class="cta" data-act="equip">${t('lk.equip')}</button>`;
      }
    }
    if (!o) {
      d.innerHTML = `<p class="fine">${esc(t(st.tab === 'weapons' ? 'lk.pickSkin' : 'lk.emptyTurrets'))}</p>`;
      return;
    }
    d.style.setProperty('--r', RARITIES[o.rarity].color);
    const sub = st.tab === 'weapons' ? ` · ${wName(o.weapon)}` : '';
    d.innerHTML = `<p class="lk-rar">${esc(rn(o.rarity))}${esc(sub)}${o.season ? ` · ${t('bp.limited')}` : ''}</p><h3>${esc(o.name)}${esc(serial(o.id))}</h3><div class="lk-actions">${on ? `<span class="lk-tag">${t('lk.equipped')}</span>` : ''}${act}</div>`;
    d.querySelector('[data-act="equip"]')?.addEventListener('click', () => {
      if (st.tab === 'outfits') send({ t: 'equip', id: o.id });
      else if (st.tab === 'weapons') send({ t: 'wequip', id: o.id });
      else send({ t: 'tequip', id: o.id });
    });
    d.querySelector('[data-act="plain"]')?.addEventListener('click', () => {
      if (st.tab === 'weapons') send({ t: 'wequip', id: `${o.weapon}.default` });
      else send({ t: 'tequip', id: null });
    });
  }

  // a tap selects (and previews) without rebuilding the grid
  function select(id) {
    if (st.tab === 'outfits') st.selected = id;
    else if (st.tab === 'weapons') {
      st.wsel = id;
      st.weapon = WSKIN[id].weapon;
    } else st.tsel = id;
    for (const b of $('lk-grid').children) b.classList.toggle('sel', b.dataset.id === id);
    sfx.play('beep', { f: 1320, dur: 0.03 });
    renderDetail();
  }

  // ------------------------------------------------------------- messages

  function onMessage(m) {
    if (m.t === 'welcome' || m.t === 'authed' || m.t === 'result') {
      if (m.locker !== undefined) app.locker = m.locker;
      renderTile();
      return;
    }
    if (m.t === 'balance' || m.t === 'tables') {
      renderTile();
      return;
    }
    if (m.t !== 'locker') return;
    app.locker = m.locker;
    if (m.balances) app.balances = m.balances;
    renderTile();
    if (m.op === 'equip' || m.op === 'wequip' || m.op === 'tequip') sfx.play('bag');
    if ($('dlg-locker').open) render();
  }

  // --------------------------------------------------------------- wiring
  $('open-locker').addEventListener('click', () => open('outfits'));
  $('lt-canvas').addEventListener('click', () => open('outfits'));
  $('lk-to-shop').addEventListener('click', () => {
    $('dlg-locker').close();
    openShop?.();
  });
  for (const b of document.querySelectorAll('#dlg-locker [data-lt]')) b.addEventListener('click', () => setTab(b.dataset.lt));
  for (const b of document.querySelectorAll('#lk-body [data-body]')) b.addEventListener('click', () => send({ t: 'body', id: b.dataset.body }));
  // one listener per container (the buttons inside are rebuilt)
  $('lk-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.lk-item');
    if (b) select(b.dataset.id);
  });
  $('lk-grid').addEventListener('dblclick', (e) => {
    // a double tap wears it at once
    const b = e.target.closest('.lk-item');
    if (!b) return;
    const id = b.dataset.id;
    if (st.tab === 'outfits') send({ t: 'equip', id });
    else if (st.tab === 'weapons') send({ t: 'wequip', id });
    else send({ t: 'tequip', id });
  });
  $('lk-rar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rar]');
    if (!b) return;
    st.rar = b.dataset.rar;
    render();
  });
  $('lk-wtabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wf]');
    if (!b) return;
    st.wf = b.dataset.wf;
    render();
  });
  $('lk-sort').addEventListener('click', () => {
    st.sort = st.sort === 'asc' ? 'desc' : 'asc';
    render();
  });
  st.raf = requestAnimationFrame(loop);

  return { onMessage, renderTile, open, lookOf, serial };
}
