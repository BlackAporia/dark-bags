// Inventory: everything you have in one place. Coins with their $ value, shop $,
// unopened bags and crates, the collection (limited editions with their numbers),
// and your career numbers.
import { OUTFIT, OUTFITS, WSKIN, WEAPON_SKINS, BOX, RARITIES, usd } from '../shared/cosmetics.js';
import { formatUnits, usdText } from '../shared/assets.js';
import { figureStill } from './stickman.js';
import { boxArt, weaponStill } from './locker.js';
import { esc, fmt, mmss } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createInventory({ app, go, openLocker, openCashier, send }) {
  function render() {
    const root = $('inv-root');
    if (!root) return;
    const L = app.locker;
    const bal = app.balances ?? {};
    const ids = [...new Set([...app.assets.map((a) => a.id), ...Object.keys(bal)])];
    const coins = ids
      .map((id) => {
        const a = app.prices.get(id) ?? { id, symbol: id.slice(0, 8), decimals: 18, color: '#8d93a6' };
        const u = BigInt(bal[id] ?? '0');
        return { a, u, v: app.prices.value(id, u) };
      })
      .sort((x, y) => y.v - x.v);
    const total = coins.reduce((s, c) => s + c.v, 0);
    const held = Object.entries(L?.boxes ?? {}).filter(([, n]) => n > 0);
    const lim = [...(L?.owned ?? []), ...(L?.wowned ?? [])].filter((id) => (OUTFIT[id] ?? WSKIN[id])?.limited);
    const s = app.career?.stats ?? {};
    const stat = (k, v) => `<div class="inv-stat"><b class="num">${v}</b><span>${t(k)}</span></div>`;
    root.innerHTML = `
      <h2 class="sec-h">${t('nav.inventory')}</h2>
      <section class="inv-card">
        <header><p class="eyebrow">${t('inv.wallet')}</p><b class="inv-total num">${usdText(total)}</b></header>
        <ul class="inv-coins">${coins
          .map(({ a, u, v }) => `<li><span class="dot" style="background:${a.color}"></span><b>${esc(a.symbol)}</b><span class="num">${esc(formatUnits(u, a.decimals, 6))}</span><span class="num inv-usd">${app.prices.has(a.id) ? usdText(v) : '—'}</span></li>`)
          .join('')}</ul>
        <div class="inv-actions">
          ${app.chain ? `<button type="button" class="ghost" data-go="cashier">${t('inv.deposit')}</button>` : `<button type="button" class="ghost" data-go="faucet">${t('lobby.refill')}</button>`}
          <button type="button" class="ghost" data-go="swap">${t('nav.swap')}</button>
        </div>
        <p class="fine">${t(app.chain ? 'inv.walletNote' : 'inv.playNote')}</p>
      </section>
      <section class="inv-card">
        <header><p class="eyebrow">${t('lk.shopUsd')}</p><b class="inv-total num">${usd(L?.credit ?? 0)}</b></header>
        <p class="fine">${t('inv.shopNote')}</p>
        <div class="inv-actions"><button type="button" class="cta" data-go="shop">${t('shop.topup')}</button></div>
      </section>
      ${held.length ? `<section class="inv-card"><header><p class="eyebrow">${t('inv.unopened')}</p></header><div class="inv-boxes">${held.map(([id, n]) => `<button type="button" class="inv-box" data-go="shop" data-fam="${BOX[id]?.family}">${boxArt(BOX[id], 72)}<b>${esc(t(`box.${id}`))}</b><span>×${n}</span></button>`).join('')}</div></section>` : ''}
      <section class="inv-card">
        <header><p class="eyebrow">${t('inv.collection')}</p></header>
        <div class="inv-stats">
          ${stat('lk.outfits', `${(L?.owned ?? []).length}/${OUTFITS.filter((o) => !o.basic).length}`)}
          ${stat('lk.weapons', `${(L?.wowned ?? []).length}/${WEAPON_SKINS.length}`)}
          ${stat('inv.opened', fmt(L?.opened ?? 0))}
        </div>
        ${lim.length ? `<p class="eyebrow">${t('shop.limited')}</p><div class="lim-row">${lim.map((id) => { const o = OUTFIT[id] ?? WSKIN[id]; return `<div class="lim-card" style="--r:${RARITIES[o.rarity].color}"><img alt=""${OUTFIT[id] ? '' : ' class="wimg"'} src="${OUTFIT[id] ? figureStill({ outfit: id, body: L.body }, 84, 112) : weaponStill(id)}"><b>${esc(o.name)}</b><span class="num">#${L.serials?.[id] ?? '?'}/${o.limited}</span></div>`; }).join('')}</div>` : ''}
        <div class="inv-actions"><button type="button" class="ghost" data-go="locker">${t('lobby.locker')}</button></div>
      </section>
      <section class="inv-card">
        <header><p class="eyebrow">${t('inv.career')}</p></header>
        <div class="inv-stats">
          ${stat('inv.raids', fmt(s.raids ?? 0))}
          ${stat('inv.kills', fmt(s.kills ?? 0))}
          ${stat('inv.extracts', fmt(s.extracts ?? 0))}
          ${stat('inv.wins', fmt(s.wins ?? 0))}
          ${stat('inv.best', fmt(s.bestKills ?? 0))}
          ${stat('inv.time', s.secs ? (s.secs >= 3600 ? `${(s.secs / 3600).toFixed(1)} h` : mmss(s.secs)) : '0:00')}
        </div>
      </section>`;
    for (const b of root.querySelectorAll('[data-go]'))
      b.addEventListener('click', () => {
        const k = b.dataset.go;
        if (k === 'locker') openLocker();
        else if (k === 'cashier') openCashier();
        else if (k === 'faucet') send({ t: 'faucet' });
        else go(k, b.dataset.fam);
      });
  }
  return { render };
}
