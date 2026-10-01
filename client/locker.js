// The locker: your character, your outfits and weapon skins. Equip only: skins come
// from bags and crates in the shop (shop.js). Also draws the box art both use.
import { OUTFIT, OUTFITS, RARITIES, FINISH, WEAPON_SKINS, WSKIN } from '../shared/cosmetics.js';
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
  const s = WSKIN[skinId];
  const wi = Math.max(0, WEAPONS.findIndex((x) => x.id === s?.weapon));
  const art = weaponArt(wi, s ? { [s.weapon]: s.finish } : null);
  const fin = s ? FINISH[s.finish] : null;
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

// ------------------------------------------------------------ the locker

export function createLocker({ app, send, sfx, toast, openShop }) {
  const st = { tab: 'outfits', selected: null, wsel: null, weapon: 'knife', filter: 'all', raf: 0 };
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
      const w = st.tab === 'weapons' ? WEAPONS.findIndex((x) => x.id === st.weapon) : undefined;
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

  function open(tab = st.tab) {
    st.selected = null;
    st.wsel = null;
    setTab(tab);
    $('dlg-locker').showModal();
    sfx.unlock?.();
  }

  function setTab(tab) {
    st.tab = tab;
    for (const b of document.querySelectorAll('#dlg-locker [data-lt]')) b.setAttribute('aria-selected', String(b.dataset.lt === tab));
    for (const p of document.querySelectorAll('#dlg-locker [data-lp]')) p.hidden = p.dataset.lp !== tab;
    render();
  }

  function render() {
    if (!L()) return;
    $('lk-marks').textContent = usdCents(L().credit);
    $('lk-bonus').textContent = '';
    for (const b of document.querySelectorAll('#lk-body [data-body]')) b.setAttribute('aria-checked', String(b.dataset.body === L().body));
    if (st.tab === 'outfits') {
      renderDetail();
      renderGrid(OUTFITS.filter((o) => st.filter === 'all' || (st.filter === 'owned' ? owns(o.id) : o.rarity === st.filter)));
      const have = OUTFITS.filter((o) => owns(o.id)).length;
      $('lk-count').textContent = t('lk.collected', { a: have, b: OUTFITS.length });
    } else renderWeapons();
  }

  function status(o) {
    const trial = !o.basic && !L().owned.includes(o.id) && trialLeft(o.id) > 0;
    if (L().outfit === o.id) return { text: trial ? `${t('lk.equipped')} · ${left(trialLeft(o.id))}` : t('lk.equipped'), cls: 'on' };
    if (trial) return { text: t('lk.trialLeft', { t: left(trialLeft(o.id)) }), cls: 'trial' };
    if (owns(o.id)) return { text: t('lk.owned'), cls: 'own' };
    if (o.limited) return { text: t('lk.limited', { n: o.limited }), cls: 'lim' };
    return { text: rn(o.rarity), cls: 'locked' };
  }

  function card(o, img, s, onClick, sel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `lk-item r-${o.rarity}${s.cls === 'locked' || s.cls === 'lim' ? ' locked' : ''}${sel ? ' sel' : ''}${o.limited ? ' limited' : ''}`;
    b.style.setProperty('--r', RARITIES[o.rarity].color);
    b.innerHTML = `<span class="lk-shine"></span><img alt=""${WSKIN[o.id] ? ' class="wimg"' : ''} src="${img}"><span class="lk-name">${esc(o.name)}</span><span class="lk-state ${s.cls}">${esc(s.text)}</span>`;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderGrid(list) {
    $('lk-grid').replaceChildren(
      ...list.map((o) =>
        card(o, figureStill(lookOf(o.id), 84, 112), status(o), () => {
          st.selected = o.id;
          sfx.play('beep', { f: 1320, dur: 0.03 });
          render();
        }, st.selected === o.id),
      ),
    );
  }

  function renderDetail() {
    const id = st.selected ?? L().outfit;
    const o = OUTFIT[id];
    const r = RARITIES[o.rarity];
    const d = $('lk-detail');
    d.style.setProperty('--r', r.color);
    const trial = !o.basic && !L().owned.includes(id) && trialLeft(id) > 0;
    let action = '';
    if (L().outfit === id) action = `<span class="lk-tag">${t('lk.equipped')}</span>`;
    else if (owns(id)) action = `<button type="button" class="cta" data-act="equip">${t('lk.equip')}</button>`;
    const how = trial ? t('lk.trialHow2', { t: left(trialLeft(id)) }) : owns(id) ? (o.basic ? t('lk.free') : t('lk.inCollection')) : t('lk.fromBags');
    const fx = [o.fx, o.fx2].filter(Boolean).map((x) => t(`fx.${x}`));
    if (o.cape) fx.push(t('fx.cape'));
    const sup = o.limited ? L().supply?.[o.id] : null;
    d.innerHTML = `<p class="lk-rar">${esc(rn(o.rarity))}${fx.length ? ` · <span>${esc(fx.join(' + '))}</span>` : ''}</p><h3>${esc(o.name)}${esc(serial(id))}</h3>${sup ? `<p class="lk-supply">${t('lk.minted', { a: sup.minted, b: sup.of })}</p>` : ''}<p class="fine">${esc(how)}${st.selected && !owns(id) ? ` ${t('lk.tryingOn')}` : ''}</p><div class="lk-actions">${action}</div>`;
    for (const b of d.querySelectorAll('[data-act]')) b.addEventListener('click', () => send({ t: 'equip', id }));
  }

  // weapon skins: pick a weapon, see every finish for it, equip the ones you own
  function renderWeapons() {
    $('lk-wtabs').replaceChildren(
      ...WEAPONS.map((w) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(w.id === st.weapon));
        b.textContent = t(`w.${w.name}`);
        b.addEventListener('click', () => {
          st.weapon = w.id;
          st.wsel = null;
          render();
        });
        return b;
      }),
    );
    const list = WEAPON_SKINS.filter((s) => s.weapon === st.weapon);
    const on = myWs()[st.weapon] ?? 'default';
    const plain = { id: `${st.weapon}.default`, name: t('lk.plain'), rarity: 'common' };
    const cards = [plain, ...list].map((s) => {
      const own = s.id.endsWith('.default') || L().wowned.includes(s.id);
      const eq = s.id === `${st.weapon}.${on}`;
      const stt = eq ? { text: t('lk.equipped'), cls: 'on' } : own ? { text: t('lk.owned'), cls: 'own' } : s.limited ? { text: t('lk.limited', { n: s.limited }), cls: 'lim' } : { text: rn(s.rarity), cls: 'locked' };
      return card(s, weaponStill(s.id), stt, () => {
        st.wsel = s.id.endsWith('.default') ? null : s.id;
        if (own && !eq) send({ t: 'wequip', id: s.id });
        else if (!own) toast(t('lk.fromCrates'));
        sfx.play('beep', { f: 1320, dur: 0.03 });
        render();
      }, st.wsel === s.id);
    });
    $('lk-wgrid').replaceChildren(...cards);
    const f = FINISH[on];
    $('lk-detail').innerHTML = `<p class="lk-rar">${esc(f ? rn(f.rarity) : '')}</p><h3>${esc(f ? `${f.name} ${t(`w.${WEAPONS.find((w) => w.id === st.weapon).name}`)}` : t('lk.plain'))}</h3><p class="fine">${esc(t('lk.weaponHow'))}</p>`;
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
    if (m.op === 'equip' || m.op === 'wequip') sfx.play('bag');
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
  for (const b of document.querySelectorAll('#lk-filter [data-f]'))
    b.addEventListener('click', () => {
      st.filter = b.dataset.f;
      for (const x of document.querySelectorAll('#lk-filter [data-f]')) x.setAttribute('aria-pressed', String(x === b));
      render();
    });
  st.raf = requestAnimationFrame(loop);

  return { onMessage, renderTile, open, lookOf, serial };
}
