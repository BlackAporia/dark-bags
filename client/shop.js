// The shop: shop $ top-ups, outfit bags and weapon crates in nine tiers each, the
// limited editions, and the opening show. The server decides every roll; this page
// only stages it: the box charges up in the colour of the best drop, bursts, and the
// cards flip one by one.
import { OUTFIT, OUTFITS, RARITIES, RARITY_ORDER, BOXES, BOX, PITY, PACKS, WSKIN, WEAPON_SKINS, MAX_OPEN, usd } from '../shared/cosmetics.js';
import { isStable } from '../shared/assets.js';
import { figureStill, drawPreview } from './stickman.js';
import { boxArt, weaponStill } from './locker.js';
import { esc } from './game.js';
import { t } from './i18n.js';
import { settings } from './settings.js';

const $ = (id) => document.getElementById(id);
const rn = (k) => t(`r.${k}`);
const rankOf = (r) => RARITY_ORDER.indexOf(r);
const QTY = [1, 5, 10, 25, 100];

export function createShop({ app, send, sfx, toast, share, equip }) {
  const st = { family: 'outfit', qty: {}, busy: false, last: null };
  const L = () => app.locker;
  // USDC/USDT the player can top shop $ up from, in cents
  const stableCents = () => {
    let c = 0n;
    for (const a of app.assets ?? []) {
      if (!isStable(a) || a.decimals < 2) continue;
      c += BigInt(app.balances?.[a.id] ?? '0') / 10n ** BigInt(a.decimals - 2);
    }
    return Number(c);
  };
  const reach = () => (L()?.credit ?? 0) + stableCents();
  const itemOf = (res) => (res.kind === 'weapon' ? WSKIN[res.item] : OUTFIT[res.item]);
  const imgOf = (res, w = 84, h = 112) => (res.kind === 'weapon' ? weaponStill(res.item, Math.max(150, w), Math.round(Math.max(150, w) * 0.66)) : figureStill({ outfit: res.item, body: L()?.body ?? 'm' }, w, h));

  // ------------------------------------------------------------- the page

  function render() {
    const root = $('shop-root');
    if (!root || !L()) return;
    const boxes = BOXES.filter((b) => b.family === st.family);
    const limited = [...OUTFITS, ...WEAPON_SKINS].filter((o) => o.limited && (st.family === 'outfit' ? OUTFIT[o.id] : WSKIN[o.id]));
    root.innerHTML = `
      <header class="shop-head">
        <h2 class="sec-h">${t('nav.shop')}</h2>
        <p class="shop-bal"><span>${t('lk.shopUsd')}</span> <b class="num">${usd(L().credit)}</b> <small>${t('lk.topupFrom', { v: usd(stableCents()) })}</small></p>
      </header>
      <section class="packs-wrap">
        <p class="eyebrow">${t('shop.topup')}</p>
        <div class="lk-packs">${PACKS.map((p) => `<button type="button" class="lk-pack${p.bonus ? ' bonus' : ''}" data-pack="${p.id}" ${stableCents() < p.price ? 'disabled' : ''}><b>${usd(p.price + p.bonus)}</b><span>${p.bonus ? t('lk.bonus', { n: Math.round((p.bonus / p.price) * 100) }) : t('lk.shopUsd')}</span><small>${t('lk.pay', { v: usd(p.price) })}</small></button>`).join('')}</div>
        <p class="fine">${t('lk.shopNote')}</p>
      </section>
      <div class="mode shop-tabs" role="tablist">
        <button type="button" class="seg" role="tab" data-fam="outfit" aria-selected="${st.family === 'outfit'}">${t('shop.bags')}</button>
        <button type="button" class="seg" role="tab" data-fam="weapon" aria-selected="${st.family === 'weapon'}">${t('shop.crates')}</button>
      </div>
      <p class="fine">${t(st.family === 'outfit' ? 'shop.bagsNote' : 'shop.cratesNote')} ${t('shop.fair', { e: PITY.epic, l: PITY.legendary })}</p>
      <div class="box-grid">${boxes.map(boxCard).join('')}</div>
      ${limited.length ? `<section class="limited"><p class="eyebrow">${t('shop.limited')}</p><div class="lim-row">${limited.map(limCard).join('')}</div></section>` : ''}`;
    for (const b of root.querySelectorAll('[data-pack]')) b.addEventListener('click', () => send({ t: 'topup', id: b.dataset.pack }));
    for (const b of root.querySelectorAll('[data-fam]'))
      b.addEventListener('click', () => {
        st.family = b.dataset.fam;
        render();
      });
    for (const el of root.querySelectorAll('.box-card')) wireBox(el);
  }

  function qty(id) {
    return st.qty[id] ?? 1;
  }

  function boxCard(bx) {
    const held = L().boxes?.[bx.id] ?? 0;
    const n = qty(bx.id);
    const paid = Math.max(0, n - held);
    const pity = L().pity?.[bx.id] ?? { sinceEpic: 0, sinceLegendary: 0 };
    const odds = RARITY_ORDER.filter((k) => bx.odds[k] > 0);
    const bar = odds.map((k) => `<i style="flex:${Math.max(bx.odds[k], 0.8)};background:${RARITIES[k].color}" title="${rn(k)} ${bx.odds[k]}%"></i>`).join('');
    const legend = odds.map((k) => `<li style="--r:${RARITIES[k].color}"><span>${rn(k)}</span><b>${bx.odds[k]}%</b></li>`).join('');
    const meter = (label, have, max) => `<div class="pity"><span>${label}</span><div class="pity-bar"><i style="width:${(have / max) * 100}%"></i></div><b>${max - have}</b></div>`;
    const cta = paid === 0 ? `${t('lk.openFree')} ×${n}` : `${t('shop.open', { n })} · ${usd(paid * bx.price)}`;
    return `<article class="box-card t${bx.tier}" data-box="${bx.id}" style="--r:${RARITIES[bx.jackpot].color}">
      ${held ? `<span class="held-badge">×${held}</span>` : ''}
      <div class="box-art">${boxArt(bx, 128)}</div>
      <h4>${esc(t(`box.${bx.id}`))}</h4>
      <p class="box-price num">${usd(bx.price)}</p>
      <p class="fine">${t('lk.jackpot')}: <b style="color:${RARITIES[bx.jackpot].color}">${rn(bx.jackpot)}</b></p>
      <div class="odds-bar">${bar}</div>
      <details class="odds-more"><summary>${t('shop.odds')}</summary><ul class="odds">${legend}</ul>
        ${bx.exoticPity ? meter(t('shop.exoticIn'), pity.sinceExotic ?? 0, bx.exoticPity) : ''}${meter(t('lk.epicIn'), pity.sinceEpic, PITY.epic)}${meter(t('lk.legIn'), pity.sinceLegendary, PITY.legendary)}</details>
      ${bx.exoticPity ? `<p class="box-guar">${t('shop.guarantee', { n: bx.exoticPity })}</p>` : ''}
      <div class="qty" role="group" aria-label="${t('shop.qty')}">
        <button type="button" data-q="-" aria-label="−">−</button>
        <input type="number" inputmode="numeric" min="1" max="${MAX_OPEN}" value="${n}" aria-label="${t('shop.qty')}">
        <button type="button" data-q="+" aria-label="+">+</button>
      </div>
      <div class="qty-chips">${QTY.map((q) => `<button type="button" data-qq="${q}" aria-pressed="${q === n}">×${q}</button>`).join('')}</div>
      <button type="button" class="cta box-go" ${paid * bx.price > reach() ? 'disabled' : ''}>${cta}</button>
    </article>`;
  }

  function limCard(o) {
    const sup = L().supply?.[o.id] ?? { of: o.limited, minted: 0 };
    const img = WSKIN[o.id] ? weaponStill(o.id) : figureStill({ outfit: o.id, body: 'm' }, 84, 112);
    const out = sup.minted >= sup.of;
    return `<div class="lim-card${out ? ' out' : ''}" style="--r:${RARITIES[o.rarity].color}"><img alt=""${WSKIN[o.id] ? ' class="wimg"' : ''} src="${img}"><b>${esc(o.name)}</b><span class="num">${out ? t('shop.soldOut') : t('lk.minted', { a: sup.minted, b: sup.of })}</span><div class="lim-bar"><i style="width:${(sup.minted / sup.of) * 100}%"></i></div></div>`;
  }

  function wireBox(el) {
    const id = el.dataset.box;
    const set = (n) => {
      st.qty[id] = Math.max(1, Math.min(MAX_OPEN, Math.floor(Number(n) || 1)));
      const fresh = document.createElement('div');
      fresh.innerHTML = boxCard(BOX[id]);
      const card = fresh.firstElementChild;
      el.replaceWith(card);
      wireBox(card);
    };
    el.querySelector('[data-q="-"]').addEventListener('click', () => set(qty(id) - 1));
    el.querySelector('[data-q="+"]').addEventListener('click', () => set(qty(id) + 1));
    el.querySelector('input').addEventListener('change', (e) => set(e.target.value));
    for (const c of el.querySelectorAll('[data-qq]')) c.addEventListener('click', () => set(c.dataset.qq));
    el.querySelector('.box-go').addEventListener('click', () => buy(id, qty(id)));
  }

  function buy(id, n) {
    if (st.busy) return;
    st.busy = true;
    st.last = { id, n };
    sfx.unlock?.();
    sfx.play('ready');
    charge(BOX[id]);
    send({ t: 'box', id, n });
  }

  // --------------------------------------------------------- the opening show
  // A particle layer on a canvas behind the cards, driven while the overlay is open.
  const fx = { parts: [], rays: 0, rayColor: '#fff', flash: 0, raf: 0, shake: 0 };

  function fxLoop(now) {
    const cv = $('op-fx');
    if ($('opening').hidden) {
      fx.raf = 0;
      return;
    }
    fx.raf = requestAnimationFrame(fxLoop);
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
    const cx = w / 2;
    const cy = h * 0.42;
    if (fx.rays > 0) {
      // slow-turning god rays in the colour of the best drop
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(now / 4000);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        ctx.rotate((Math.PI * 2) / 16);
        const g = ctx.createLinearGradient(0, 0, 0, -Math.max(w, h));
        g.addColorStop(0, `${fx.rayColor}${Math.round(fx.rays * 90).toString(16).padStart(2, '0')}`);
        g.addColorStop(1, `${fx.rayColor}00`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(18, 0);
        ctx.lineTo(70, -Math.max(w, h));
        ctx.lineTo(-70, -Math.max(w, h));
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    fx.parts = fx.parts.filter((p) => (p.life -= 1 / 60) > 0);
    for (const p of fx.parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.vx *= 0.985;
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s * (0.5 + p.life / 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${fx.flash})`;
      ctx.fillRect(0, 0, w, h);
      fx.flash = Math.max(0, fx.flash - 0.04);
    }
  }

  function burst(color, n = 90, power = 9) {
    const cv = $('op-fx');
    const cx = cv.clientWidth / 2;
    const cy = cv.clientHeight * 0.42;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.3 + Math.random()) * power;
      fx.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, g: 0.12, life: 0.8 + Math.random() * 0.9, s: 1.5 + Math.random() * 3, c: Math.random() < 0.3 ? '#ffffff' : color });
    }
  }

  // phase 1: the box appears and charges while the server rolls
  function charge(box) {
    const ov = $('opening');
    ov.hidden = false;
    ov.className = 'opening charging';
    fx.parts = [];
    fx.rays = 0;
    $('op-actions').innerHTML = '';
    $('op-stage').innerHTML = `<div class="op-box">${boxArt(box, 220)}</div><p class="op-kicker">${esc(t(`box.${box.id}`))}</p>`;
    if (!fx.raf) fx.raf = requestAnimationFrame(fxLoop);
  }

  // phase 2+3: tint towards the best rarity, burst, then the cards
  function reveal(result) {
    st.busy = false;
    const box = BOX[result.box];
    const results = result.results ?? [result];
    const best = results.reduce((a, b) => (rankOf(b.rarity) > rankOf(a.rarity) ? b : a));
    const bestColor = RARITIES[best.rarity].color;
    const ov = $('opening');
    const boxEl = $('op-stage').querySelector('.op-box');
    // suspense: the glow climbs through the rarities up to the best one
    const steps = RARITY_ORDER.slice(0, rankOf(best.rarity) + 1);
    const stepMs = settings.motion ? 260 : 0;
    steps.forEach((k, i) =>
      setTimeout(() => {
        boxEl?.style.setProperty('--glow', RARITIES[k].color);
        ov.style.setProperty('--glow', RARITIES[k].color);
        sfx.play('beep', { f: 440 + i * 180, dur: 0.08 });
      }, i * stepMs),
    );
    setTimeout(() => {
      ov.className = `opening open r-${best.rarity}`;
      fx.flash = rankOf(best.rarity) >= 4 ? 0.9 : 0.5;
      fx.rayColor = bestColor;
      fx.rays = rankOf(best.rarity) >= 3 ? 1 : 0.5;
      burst(bestColor, rankOf(best.rarity) >= 4 ? 220 : 110, rankOf(best.rarity) >= 4 ? 13 : 9);
      sfx.play(rankOf(best.rarity) >= 3 ? 'bag' : 'coin');
      if (rankOf(best.rarity) >= 4) sfx.sting?.(rankOf(best.rarity) >= 5 ? 5 : 4);
      cards(results, box);
    }, steps.length * stepMs + (settings.motion ? 350 : 0));
  }

  function cardHtml(res, big) {
    const o = itemOf(res);
    const r = RARITIES[res.rarity];
    const lim = o.limited && res.serial ? `<span class="op-serial">#${res.serial}/${o.limited}</span>` : '';
    const tag = res.dup ? `<span class="op-dup">${t('shop.dup', { v: usd(res.refund) })}</span>` : `<span class="op-new">${t('shop.new')}</span>`;
    return `<div class="op-card r-${res.rarity}${big ? ' big' : ''}" style="--r:${r.color}">
      <div class="op-face op-back">${boxArt(BOX[st.last?.id] ?? BOXES[0], 64)}</div>
      <div class="op-face op-front">
        ${big && res.kind === 'outfit' ? '<canvas class="op-live"></canvas>' : `<img alt=""${res.kind === 'weapon' ? ' class="wimg"' : ''} src="${imgOf(res, big ? 160 : 84, big ? 214 : 112)}">`}
        <p class="op-rar">${esc(rn(res.rarity))}${res.pity ? ` · ${t('lk.pityDrop')}` : ''}</p>
        <p class="op-name">${esc(o.name)}</p>${lim}${tag}
      </div>
    </div>`;
  }

  function cards(results, box) {
    const big = results.length === 1;
    const stage = $('op-stage');
    stage.innerHTML = `<div class="op-grid${big ? ' single' : ''}${results.length > 25 ? ' dense' : ''}">${results.map((r) => cardHtml(r, big)).join('')}</div>`;
    const els = [...stage.querySelectorAll('.op-card')];
    const gap = settings.motion ? Math.max(35, Math.min(160, 1800 / results.length)) : 0;
    els.forEach((el, i) =>
      setTimeout(() => {
        el.classList.add('flip');
        const k = rankOf(results[i].rarity);
        sfx.play('beep', { f: 700 + k * 160, dur: 0.05 });
        if (k >= 4 && !big) {
          const r = el.getBoundingClientRect();
          const cv = $('op-fx').getBoundingClientRect();
          for (let j = 0; j < 40; j++) {
            const a = Math.random() * Math.PI * 2;
            fx.parts.push({ x: r.left - cv.left + r.width / 2, y: r.top - cv.top + r.height / 2, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, g: 0.1, life: 1, s: 2, c: RARITIES[results[i].rarity].color });
          }
        }
      }, 120 + i * gap),
    );
    if (big && results[0].kind === 'outfit') liveCard(stage.querySelector('.op-live'), results[0].item);
    setTimeout(() => summary(results, box), 200 + els.length * gap);
  }

  // the single-drop card shows the runner alive, turning and shouldering weapons
  function liveCard(cv, id) {
    if (!cv) return;
    const draw = (now) => {
      if (!cv.isConnected || $('opening').hidden) return;
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
      const cyc = Math.floor(now / 2400);
      drawPreview(ctx, { outfit: id, body: L()?.body ?? 'm', ws: L()?.wequip }, { x: w / 2, y: h * 0.88, scale: (h * 0.8) / 70, t: now, w: cyc % 6, aim: Math.sin(now / 1700) * 0.4 - 0.1 + (cyc % 3 === 2 ? Math.PI : 0) });
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  function summary(results, box) {
    const best = results.reduce((a, b) => (rankOf(b.rarity) > rankOf(a.rarity) ? b : a));
    const counts = {};
    let back = 0;
    for (const r of results) {
      counts[r.rarity] = (counts[r.rarity] ?? 0) + 1;
      back += r.refund;
    }
    const o = itemOf(best);
    const again = st.last;
    const held = L().boxes?.[box.id] ?? 0;
    const cost = Math.max(0, again.n - held) * box.price;
    const tally = RARITY_ORDER.filter((k) => counts[k]).map((k) => `<span style="color:${RARITIES[k].color}">${counts[k]}× ${rn(k)}</span>`).join(' · ');
    $('op-actions').innerHTML = `
      ${results.length > 1 ? `<p class="op-tally">${tally}${back ? ` · ${t('shop.back', { v: usd(back) })}` : ''}</p>` : ''}
      <div class="op-btns">
        ${!best.dup ? `<button type="button" class="cta" data-op="equip">${t('shop.equipBest', { n: o.name })}</button>` : ''}
        <button type="button" class="ghost share" data-op="share">${best.jackpot ? t('lk.showOff') : t('lk.postMiss')}</button>
        <button type="button" class="ghost" data-op="again" ${cost > reach() ? 'disabled' : ''}>${t('lk.another')} ×${again.n} · ${cost ? usd(cost) : t('lk.free1')}</button>
        <button type="button" class="link" data-op="close">${t('share.close')}</button>
      </div>`;
    const act = (k, f) => $('op-actions').querySelector(`[data-op="${k}"]`)?.addEventListener('click', f);
    act('equip', () => {
      equip(best);
      close();
    });
    act('share', () => share(best.jackpot ? 'boxHit' : 'boxMiss', { result: best, outfit: { name: o.name, rarity: best.rarity }, box: { ...box, name: t(`box.${box.id}`) }, look: best.kind === 'outfit' ? { outfit: best.item, body: L()?.body ?? 'm' } : { outfit: L()?.outfit ?? 'basic-0', body: L()?.body ?? 'm' } }));
    act('again', () => buy(again.id, again.n));
    act('close', close);
  }

  function close() {
    $('opening').hidden = true;
    $('opening').className = 'opening';
    render();
  }

  // --------------------------------------------------------------- messages
  function onMessage(m) {
    if (m.t === 'err' && st.busy) {
      st.busy = false;
      close();
      return;
    }
    if (m.t === 'locker') {
      if (m.op === 'box') reveal(m.result);
      if (m.op === 'topup') {
        sfx.play('coin');
        toast(`+${usd(m.result.added)} ${t('lk.shopUsd')}`);
        const chip = $('tb-credit');
        chip.classList.remove('pop');
        void chip.offsetWidth;
        chip.classList.add('pop');
      }
    }
    if (!$('lobby').hidden && !document.querySelector('.page[data-page="shop"]').hidden && !st.busy && $('opening').hidden) render();
  }

  $('opening').addEventListener('click', (e) => {
    // tap anywhere to skip to the end of the flips
    if (e.target.closest('button')) return;
    for (const c of $('op-stage').querySelectorAll('.op-card:not(.flip)')) c.classList.add('flip');
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('opening').hidden && !st.busy) close();
  });

  return {
    render,
    onMessage,
    family(f) {
      if (f === 'outfit' || f === 'weapon') st.family = f;
    },
  };
}
