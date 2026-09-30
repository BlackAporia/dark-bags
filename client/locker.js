// The locker: your character, outfits, the shop and luck boxes.
// Everything is decided on the server (prices, rolls, pity); this file renders it and
// stages the moments: try-ons on a lit stage, a roulette that slows onto your drop,
// and a reveal you can post.
import { OUTFIT, OUTFITS, BOX, BOXES, RARITIES, RARITY_ORDER, PITY, usd } from '../shared/cosmetics.js';
import { drawPreview, figureStill } from './stickman.js';
import { esc, fmt } from './game.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------- box art

// Crates drawn in SVG: steel street box, blue vault with a dial, gold box with ₿.
export function boxArt(id, size = 120) {
  const p = {
    street: { body: '#3a4150', lid: '#4b5466', strap: '#ff9f1c', trim: '#1f242e', mark: 'DB' },
    vault: { body: '#1e2d4a', lid: '#2a3d63', strap: '#4cc9f0', trim: '#0e1628', mark: 'dial' },
    golden: { body: '#b8860b', lid: '#e0a526', strap: '#fff1b8', trim: '#6b4b06', mark: '₿' },
  }[id];
  const uid = `bx${id}${Math.random().toString(36).slice(2, 7)}`;
  const emblem =
    p.mark === 'dial'
      ? `<circle cx="60" cy="74" r="11" fill="${p.trim}" stroke="${p.strap}" stroke-width="2.4"/><path d="M60 66 V74 L66 78" stroke="${p.strap}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
      : p.mark === '₿'
        ? `<circle cx="60" cy="74" r="12" fill="${p.trim}"/><text x="60" y="80.5" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="18" text-anchor="middle" fill="${p.strap}">₿</text>`
        : `<rect x="46" y="66" width="28" height="16" rx="2" fill="${p.trim}"/><text x="60" y="78.5" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="11" text-anchor="middle" fill="${p.strap}">DB</text>`;
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
  <defs>
    <linearGradient id="${uid}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.body}"/><stop offset="1" stop-color="${p.trim}"/></linearGradient>
    <linearGradient id="${uid}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.lid}"/><stop offset="1" stop-color="${p.body}"/></linearGradient>
    <radialGradient id="${uid}g" cx=".5" cy=".55" r=".55"><stop offset="0" stop-color="${p.strap}" stop-opacity=".35"/><stop offset="1" stop-color="${p.strap}" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="60" cy="104" rx="44" ry="8" fill="#000" opacity=".45"/>
  <circle cx="60" cy="64" r="56" fill="url(#${uid}g)"/>
  <path d="M18 46 L60 30 L102 46 L60 62 Z" fill="url(#${uid}l)" stroke="${p.trim}" stroke-width="2"/>
  <path d="M18 46 L60 62 L60 104 L18 88 Z" fill="url(#${uid}f)" stroke="${p.trim}" stroke-width="2"/>
  <path d="M102 46 L60 62 L60 104 L102 88 Z" fill="${p.trim}" opacity=".9"/>
  <path d="M102 46 L60 62 L60 104 L102 88 Z" fill="url(#${uid}f)" opacity=".55" stroke="${p.trim}" stroke-width="2"/>
  <path d="M39 38 L81 54 L81 96" fill="none" stroke="${p.strap}" stroke-width="5" opacity=".9"/>
  <path d="M18 60 L60 76 L102 60" fill="none" stroke="${p.strap}" stroke-width="3" opacity=".55"/>
  <g transform="translate(-21 -4) skewY(20.8) translate(0 -10)" opacity=".95">${emblem}</g>
  <path d="M60 30 L102 46" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
</svg>`;
}

// ------------------------------------------------------------ the locker

export function createLocker({ app, send, sfx, toast, share }) {
  const st = {
    tab: 'outfits',
    selected: null, // outfit id on the stage (try-on)
    filter: 'all',
    rolling: false,
    lastBox: null,
    raf: 0,
  };
  const L = () => app.locker;
  const trialLeft = (id) => Math.max(0, (L()?.trials?.[id] ?? 0) - Date.now());
  const owns = (id) => OUTFIT[id]?.basic || L()?.owned.includes(id) || trialLeft(id) > 0;
  // $: bonus credit plus what the player can spend: USDC/USDT with real tokens, the play balance otherwise
  const stableCents = () => {
    if (!app.chain) {
      const sats = BigInt(app.balances?.SATS ?? '0');
      const rate = app.assets?.find((a) => /^(USDC|USDT)$/i.test(a.symbol))?.satsPerToken ?? 1000;
      return Math.floor((Number(sats) * 100) / rate);
    }
    let c = 0n;
    for (const a of app.assets ?? []) {
      if (!/^(USDC|USDT)$/i.test(a.symbol) || a.decimals < 2) continue;
      c += BigInt(app.balances?.[a.id] ?? '0') / 10n ** BigInt(a.decimals - 2);
    }
    return Number(c);
  };
  const dollars = () => (L()?.credit ?? 0) + stableCents();
  const bagsHeld = () => Object.values(L()?.boxes ?? {}).reduce((a, b) => a + b, 0);
  const left = (ms) => (ms > 86400000 ? `${Math.ceil(ms / 86400000)}d` : `${Math.ceil(ms / 3600000)}h`);
  const lookOf = (id = null) => ({ outfit: id ?? L()?.outfit ?? 'basic-0', body: L()?.body ?? 'm' });

  // ------------------------------------------------------------ lobby tile

  function renderTile() {
    const tile = $('locker-tile');
    if (!tile) return;
    tile.hidden = !L();
    $('open-locker').hidden = !L();
    $('lt-marks').hidden = !L();
    if (!L()) return;
    const o = OUTFIT[L().outfit] ?? OUTFIT['basic-0'];
    const r = RARITIES[o.rarity];
    $('lt-name').textContent = o.name;
    $('lt-name').style.color = r.color;
    $('lt-rarity').textContent = `${r.name} · ${L().body === 'f' ? 'Her' : 'Him'}`;
    const bags = bagsHeld();
    $('lt-marks').textContent = ` · ${usd(dollars())}${bags ? ` · ${bags} ${bags === 1 ? 'bag' : 'bags'} to open` : ''}`;
    $('open-locker').classList.toggle('glow', bags > 0);
    tile.style.setProperty('--r', r.color);
  }

  // one loop drives the lobby tile and the locker stage while they are on screen
  function loop(now) {
    st.raf = requestAnimationFrame(loop);
    const tileCv = $('lt-canvas');
    if (tileCv && !$('locker-tile').hidden && !$('lobby').hidden) paint(tileCv, lookOf(), now, 0.95);
    const stage = $('lk-stage');
    if (stage && $('dlg-locker').open) paint(stage, lookOf(st.selected), now, 1, true);
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
    drawPreview(ctx, look, { x: w / 2, y: floorY, scale, t: now, w: big ? cycle % 6 : 0, aim, attackT: big && now % 2600 < 400 ? now - (now % 2600) + 100 : -1e9 });
  }

  // --------------------------------------------------------------- dialog

  function open(tab = st.tab) {
    st.selected = null;
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
    $('lk-marks').textContent = usd(dollars());
    $('lk-bonus').textContent = L().credit > 0 ? `incl. ${usd(L().credit)} bonus` : '';
    for (const b of document.querySelectorAll('#lk-body [data-body]')) b.setAttribute('aria-checked', String(b.dataset.body === L().body));
    renderDetail();
    if (st.tab === 'outfits') renderGrid('lk-grid', OUTFITS.filter((o) => st.filter === 'all' || (st.filter === 'owned' ? owns(o.id) : o.rarity === st.filter)));
    if (st.tab === 'shop') renderGrid('lk-shop', OUTFITS.filter((o) => o.price));
    if (st.tab === 'boxes') renderBoxes();
    const total = OUTFITS.length;
    const have = OUTFITS.filter((o) => owns(o.id)).length;
    $('lk-count').textContent = `${have} / ${total} collected`;
  }

  function status(o) {
    const trial = !o.basic && !L().owned.includes(o.id) && trialLeft(o.id) > 0;
    if (L().outfit === o.id) return { text: trial ? `Equipped · trial ${left(trialLeft(o.id))}` : 'Equipped', cls: 'on' };
    if (trial) return { text: `Trial · ${left(trialLeft(o.id))} left`, cls: 'trial' };
    if (owns(o.id)) return { text: 'Owned', cls: 'own' };
    if (o.price) return { text: usd(o.price), cls: 'price' };
    return { text: usd(o.price), cls: 'price' };
  }

  function renderGrid(id, list) {
    const grid = $(id);
    grid.replaceChildren(
      ...list.map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `lk-item r-${o.rarity}${owns(o.id) ? '' : ' locked'}${st.selected === o.id ? ' sel' : ''}`;
        b.style.setProperty('--r', RARITIES[o.rarity].color);
        const s = status(o);
        b.innerHTML = `<span class="lk-shine"></span><img alt="" src="${figureStill(lookOf(o.id), 84, 112)}"><span class="lk-name">${esc(o.name)}</span><span class="lk-state ${s.cls}">${esc(s.text)}</span>`;
        b.addEventListener('click', () => {
          st.selected = o.id;
          sfx.play('beep', { f: 1320, dur: 0.03 });
          render();
        });
        return b;
      }),
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
    if (L().outfit === id) action = `<span class="lk-tag">Equipped</span>`;
    else if (owns(id)) action = `<button type="button" class="cta" data-act="equip">Equip</button>`;
    if (!o.basic && !L().owned.includes(id)) action += `<button type="button" class="${owns(id) ? 'ghost' : 'cta'}" data-act="buy" ${dollars() < o.price ? 'disabled' : ''}>Buy · ${usd(o.price)}</button>`;
    const how = trial
      ? `A rank-up trial: yours for ${left(trialLeft(id))} more. Buy it to keep it.`
      : owns(id)
        ? o.basic
          ? 'Free for every runner.'
          : 'In your collection.'
        : 'Buy it here, or try your luck with a bag.';
    d.innerHTML = `<p class="lk-rar">${esc(r.name)}${o.fx ? ` · <span>${esc(fxName(o.fx))}</span>` : ''}</p><h3>${esc(o.name)}</h3><p class="fine">${esc(how)}${st.selected && !owns(id) ? ' Trying it on.' : ''}</p><div class="lk-actions">${action}</div>`;
    for (const b of d.querySelectorAll('[data-act]')) b.addEventListener('click', () => send({ t: b.dataset.act, id }));
  }

  function renderBoxes() {
    const wrap = $('lk-boxes');
    wrap.replaceChildren(
      ...BOXES.map((bx) => {
        const pity = L().pity[bx.id] ?? { sinceEpic: 0, sinceLegendary: 0 };
        const el = document.createElement('article');
        el.className = `lk-box b-${bx.id}`;
        const odds = RARITY_ORDER.filter((k) => bx.odds[k] > 0)
          .map((k) => `<li style="--r:${RARITIES[k].color}"><span>${RARITIES[k].name}</span><b>${bx.odds[k]}%</b></li>`)
          .join('');
        const meter = (label, n, max) => `<div class="pity"><span>${label}</span><div class="pity-bar"><i style="width:${(n / max) * 100}%"></i></div><b>${max - n}</b></div>`;
        el.innerHTML = `<div class="lk-box-art">${boxArt(bx.id, 132)}</div>
          <h4>${esc(bx.name)}</h4>
          <p class="fine">Jackpot: <b style="color:${RARITIES[bx.jackpot].color}">${RARITIES[bx.jackpot].name}</b></p>
          <ul class="odds">${odds}</ul>
          ${meter('Epic+ in', pity.sinceEpic, PITY.epic)}
          ${meter('Legendary+ in', pity.sinceLegendary, PITY.legendary)}
          ${(L().boxes?.[bx.id] ?? 0) > 0 ? `<button type="button" class="cta">Open · free <span class="held">×${L().boxes[bx.id]}</span></button>` : `<button type="button" class="cta" ${dollars() < bx.price ? 'disabled' : ''}>Buy &amp; open · ${usd(bx.price)}</button>`}`;
        el.querySelector('button').addEventListener('click', () => openBox(bx.id));
        return el;
      }),
    );
  }

  // ------------------------------------------------------------- the roll

  function openBox(id) {
    if (st.rolling) return;
    st.rolling = true;
    st.lastBox = id;
    sfx.play('ready');
    send({ t: 'box', id });
  }

  // strip of cards weighted like the box, with the real drop placed under the marker
  function roulette(result) {
    const box = BOX[result.box];
    const ov = $('lk-roll');
    const strip = $('lk-strip');
    const N = 46;
    const at = 38;
    const cards = [];
    for (let i = 0; i < N; i++) {
      let o;
      if (i === at) o = OUTFIT[result.item];
      else {
        let r = Math.random() * 100;
        let rar = 'common';
        for (const k of RARITY_ORDER) {
          if (r < (box.odds[k] ?? 0)) {
            rar = k;
            break;
          }
          r -= box.odds[k] ?? 0;
        }
        // tease: near the stop, put a jackpot or two just either side
        if ((i === at - 1 || i === at + 2) && Math.random() < 0.7) rar = box.jackpot;
        const pool = OUTFITS.filter((x) => x.rarity === rar && !x.basic);
        o = pool[Math.floor(Math.random() * pool.length)] ?? OUTFIT[result.item];
      }
      cards.push(`<div class="rl-card" style="--r:${RARITIES[o.rarity].color}"><img alt="" src="${figureStill(lookOf(o.id), 84, 112)}"><span>${esc(o.name)}</span></div>`);
    }
    strip.innerHTML = cards.join('');
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0)';
    $('lk-reveal').hidden = true;
    $('lk-roll-inner').hidden = false;
    ov.hidden = false;
    ov.style.setProperty('--r', RARITIES[result.rarity].color);
    ov.classList.remove('flash');
    const cardW = strip.children[0].getBoundingClientRect().width + 8;
    const view = $('lk-window').clientWidth;
    const jitter = (Math.random() - 0.5) * cardW * 0.6;
    const target = at * cardW - view / 2 + cardW / 2 + jitter;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        strip.style.transition = 'transform 6.2s cubic-bezier(0.08, 0.72, 0.12, 1)';
        strip.style.transform = `translateX(${-target}px)`;
      }),
    );
    // tick each time a card passes the marker
    let lastIdx = -1;
    const t0 = performance.now();
    const tick = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
      const idx = Math.floor((-m.m41 + view / 2) / cardW);
      if (idx !== lastIdx) {
        lastIdx = idx;
        sfx.play('beep', { f: 2400, dur: 0.018 });
      }
      if (performance.now() - t0 < 6300) requestAnimationFrame(tick);
      else reveal(result);
    };
    requestAnimationFrame(tick);
  }

  function reveal(result) {
    const o = OUTFIT[result.item];
    const r = RARITIES[o.rarity];
    const ov = $('lk-roll');
    ov.classList.add('flash');
    sfx.play(result.jackpot ? 'level' : 'coin');
    if (result.jackpot) setTimeout(() => sfx.play('level'), 180);
    const box = BOX[result.box];
    setTimeout(() => {
      $('lk-roll-inner').hidden = true;
      const rv = $('lk-reveal');
      rv.hidden = false;
      rv.style.setProperty('--r', r.color);
      rv.innerHTML = `<p class="rv-kicker">${esc(box.name)}${result.pity ? ' · pity drop' : ''}</p>
        <div class="rv-stage"><canvas id="rv-canvas"></canvas></div>
        <p class="rv-rar">${esc(r.name)}</p>
        <h3 class="rv-name">${esc(o.name)}</h3>
        <p class="rv-note">${result.dup ? `Already yours · <b>+${usd(result.refund)} back</b>` : '<b>New</b> in your collection'}${result.jackpot ? '' : ` · the jackpot is ${esc(RARITIES[box.jackpot].name)}`}</p>
        <div class="rv-actions">
          ${!result.dup && L().outfit !== o.id ? '<button type="button" class="cta" data-rv="equip">Equip</button>' : ''}
          <button type="button" class="ghost share" data-rv="share">${result.jackpot ? 'Show it off on X' : 'Post the miss on X'}</button>
          <button type="button" class="ghost" data-rv="again" ${(L().boxes?.[box.id] ?? 0) === 0 && dollars() < box.price ? 'disabled' : ''}>Open another · ${(L().boxes?.[box.id] ?? 0) > 0 ? `free ×${L().boxes[box.id]}` : usd(box.price)}</button>
          <button type="button" class="link" data-rv="close">Back to the locker</button>
        </div>`;
      const cv = $('rv-canvas');
      const spin = (now) => {
        if (rv.hidden || !cv.isConnected) return;
        paint(cv, lookOf(o.id), now, 1.05, true);
        requestAnimationFrame(spin);
      };
      requestAnimationFrame(spin);
      rv.querySelector('[data-rv="equip"]')?.addEventListener('click', (e) => {
        send({ t: 'equip', id: o.id });
        e.target.remove();
      });
      rv.querySelector('[data-rv="share"]').addEventListener('click', () => share(result.jackpot ? 'boxHit' : 'boxMiss', { result, outfit: o, box, look: lookOf(o.id) }));
      rv.querySelector('[data-rv="again"]').addEventListener('click', () => {
        ov.hidden = true;
        openBox(result.box);
      });
      rv.querySelector('[data-rv="close"]').addEventListener('click', () => {
        ov.hidden = true;
        render();
      });
      st.rolling = false;
    }, 380);
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
      if ($('dlg-locker').open && !st.rolling) render();
      return;
    }
    if (m.t === 'err' && st.rolling) {
      st.rolling = false;
      return;
    }
    if (m.t !== 'locker') return;
    app.locker = m.locker;
    if (m.balances) app.balances = m.balances;
    renderTile();
    const r = m.result;
    if (m.op === 'box') {
      roulette(r);
      return;
    }
    if (m.op === 'buy') {
      sfx.play('coin');
      toast(`${OUTFIT[r.item].name} is yours.`);
      st.selected = r.item;
    }
    if (m.op === 'equip') sfx.play('bag');
    if ($('dlg-locker').open) render();
  }

  // --------------------------------------------------------------- wiring
  $('open-locker').addEventListener('click', () => open('outfits'));
  $('lt-canvas').addEventListener('click', () => open('outfits'));
  for (const b of document.querySelectorAll('#dlg-locker [data-lt]')) b.addEventListener('click', () => setTab(b.dataset.lt));
  for (const b of document.querySelectorAll('#lk-body [data-body]')) b.addEventListener('click', () => send({ t: 'body', id: b.dataset.body }));
  for (const b of document.querySelectorAll('#lk-filter [data-f]'))
    b.addEventListener('click', () => {
      st.filter = b.dataset.f;
      for (const x of document.querySelectorAll('#lk-filter [data-f]')) x.setAttribute('aria-pressed', String(x === b));
      render();
    });
  $('dlg-locker').addEventListener('close', () => ($('lk-roll').hidden = true));
  st.raf = requestAnimationFrame(loop);

  return { onMessage, renderTile, open };
}

const fxName = (fx) => ({ glow: 'aura', pulse: 'pulsing aura', ghost: 'spectral', laser: 'laser eyes', rainbow: 'prismatic', fire: 'burning' })[fx] ?? fx;
