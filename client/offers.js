// The offers at the top of the shop (shared/store.js): the starter pack (once), today's
// featured store (six skins bought outright, a new set every day) and the Insider card
// (30 days: shop $ and a wheel spin every day, +25% pass XP, its own frame). Every buy asks
// for a second tap to confirm; the server charges (shop $ first, then USDC/USDT) and gives.
import { OUTFIT, WSKIN, BOX, RARITIES, usd } from '../shared/cosmetics.js';
import { STYLE } from '../shared/style.js';
import { CARD, STARTER } from '../shared/store.js';
import { figureStill } from './stickman.js';
import { weaponStill } from './locker.js';
import { styleStill } from './flair.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const hms = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function createOffers({ app, send, sfx, toast }) {
  const st = { armed: null, timer: null, synced: false };
  const L = () => app.locker ?? {};

  const itemOf = (x) => (x.kind === 'outfit' ? OUTFIT[x.id] : x.kind === 'wskin' ? WSKIN[x.id] : STYLE[x.id]);
  const imgOf = (x) => (x.kind === 'outfit' ? figureStill({ outfit: x.id, body: L().body ?? 'm' }, 70, 98) : x.kind === 'wskin' ? weaponStill(x.id, 150, 90) : styleStill(x.id, 150, 90));

  // what is inside, at shop prices: the outfit and frame at their rarity's value, the boxes at
  // their price, the spins at $0.05
  const starterWorth = () => RARITIES[STARTER.outfit].value + (RARITIES[STYLE[STARTER.style]?.rarity]?.value ?? 0) + STARTER.boxes.reduce((n, [id, k]) => n + (BOX[id]?.price ?? 0) * k, 0) + STARTER.spins * 5;

  function mount(root) {
    if (app.mode !== 'online' || !app.token || !L().store) return;
    const sec = document.createElement('section');
    sec.className = 'offers';
    sec.id = 'offers-root';
    root.prepend(sec);
    st.synced = false;
    paint();
    clearInterval(st.timer);
    st.timer = setInterval(() => {
      const el = $('of-left');
      if (!el) return clearInterval(st.timer);
      const left = (L().store?.ends ?? 0) - Date.now();
      el.textContent = hms(left);
      if (left <= 0 && !st.synced) {
        st.synced = true;
        setTimeout(() => send({ t: 'locker_sync' }), 1500);
      }
    }, 1000);
  }

  // a buy button: the first tap arms it, the second buys
  const btn = (key, label, price, cls = 'cta') => `<button type="button" class="${cls} of-buy${st.armed === key ? ' armed' : ''}" data-buy="${esc(key)}">${st.armed === key ? t('of.confirm', { v: usd(price) }) : label}</button>`;

  function paint() {
    const sec = $('offers-root');
    if (!sec) return;
    const s = L().store;
    const card = L().card;
    const starter = !L().starter
      ? `<div class="of-starter">
          <div class="of-st-txt"><p class="eyebrow">${t('of.once')}</p><h3>${t('of.starter')}</h3>
            <ul class="of-perks"><li>👕 ${t('of.st.outfit')}</li><li>🎁 ${t('of.st.boxes')}</li><li>🎡 ${t('of.st.spins', { n: STARTER.spins })}</li><li>✦ ${esc(STYLE[STARTER.style]?.name ?? '')}</li></ul></div>
          <div class="of-st-buy"><s class="fine">${usd(starterWorth())}</s><b>${usd(STARTER.price)}</b>${btn('starter', t('of.buy', { v: usd(STARTER.price) }), STARTER.price)}</div>
        </div>`
      : '';
    const items = (s?.items ?? [])
      .map((x) => {
        const o = itemOf(x);
        if (!o) return '';
        const r = RARITIES[x.rarity];
        return `<article class="of-item r-${x.rarity}" style="--r:${r.color}"><span class="of-kind">${t(`of.k.${x.kind}`)}</span><img alt="" src="${imgOf(x)}"><b>${esc(o.name)}</b><span class="of-rar">${t(`r.${x.rarity}`)}</span>
          ${x.owned ? `<span class="of-owned">✓ ${t('of.owned')}</span>` : btn(`store:${x.id}`, usd(x.price), x.price)}</article>`;
      })
      .join('');
    const insider = card
      ? `<div class="of-card on"><div><p class="eyebrow">${t('of.card')}</p><h3>✦ ${t('of.cardOn', { n: card.left })}</h3><p class="fine">${t('of.cardDaily', { v: usd(CARD.daily), n: CARD.spins })}</p></div>
          <div class="of-card-buy">${card.claimed ? `<span class="of-owned">✓ ${t('of.claimed')}</span>` : `<button type="button" class="cta" data-claim>${t('of.claim')}</button>`}${btn('card', t('of.extend', { v: usd(CARD.price) }), CARD.price, 'ghost')}</div></div>`
      : `<div class="of-card"><div><p class="eyebrow">${t('of.card')}</p><h3>${t('of.cardTitle', { d: CARD.days })}</h3>
          <ul class="of-perks"><li>💵 ${t('of.c.now', { v: usd(CARD.now) })}</li><li>📅 ${t('of.cardDaily', { v: usd(CARD.daily), n: CARD.spins })}</li><li>★ ${t('of.c.pass', { n: Math.round(CARD.passBoost * 100) })}</li><li>👑 ${t('of.c.frame', { n: esc(STYLE[CARD.frame]?.name ?? '') })}</li></ul>
          <p class="fine">${t('of.c.value', { v: usd(CARD.now + CARD.daily * CARD.days), s: CARD.spins * CARD.days })}</p></div>
          <div class="of-card-buy"><img alt="" src="${styleStill(CARD.frame, 120, 80)}">${btn('card', t('of.buy', { v: usd(CARD.price) }), CARD.price)}</div></div>`;
    sec.innerHTML = `${starter}
      <div class="of-head"><div><p class="eyebrow">${t('of.kicker')}</p><h3 class="of-title">${t('of.store')}</h3></div><span class="of-left">${t('of.newIn')} <b id="of-left">${hms((s?.ends ?? 0) - Date.now())}</b></span></div>
      <div class="of-grid">${items}</div>
      <p class="fine">${t('of.storeNote')}</p>
      ${insider}`;
    for (const b of sec.querySelectorAll('[data-buy]'))
      b.addEventListener('click', () => {
        const k = b.dataset.buy;
        if (st.armed !== k) {
          st.armed = k;
          paint();
          setTimeout(() => {
            if (st.armed === k) {
              st.armed = null;
              paint();
            }
          }, 4000);
          return;
        }
        st.armed = null;
        sfx?.play('ready');
        if (k === 'starter') send({ t: 'starter_buy' });
        else if (k === 'card') send({ t: 'card_buy' });
        else send({ t: 'store_buy', id: k.slice(6) });
        paint();
      });
    sec.querySelector('[data-claim]')?.addEventListener('click', () => send({ t: 'card_claim' }));
  }

  function onMessage(m) {
    if (m.t !== 'locker' || !m.result?.ok) return;
    const r = m.result;
    if (m.op === 'store_buy') {
      sfx?.play('bag');
      toast(t('of.got', { x: itemOf(r.item)?.name ?? '' }));
    } else if (m.op === 'card_buy') {
      sfx?.play('bag');
      toast(t('of.cardGot', { n: r.card?.left ?? CARD.days }));
    } else if (m.op === 'card_claim') {
      sfx?.play('coin');
      toast(t('of.claimGot', { v: usd(r.credit), n: r.spins }));
    } else if (m.op === 'starter_buy') {
      sfx?.play('bag');
      toast(t('of.starterGot'));
    }
  }

  return { mount, onMessage, paint };
}
