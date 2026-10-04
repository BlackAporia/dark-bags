// The Starknet page: what DARK BAGS does with Starknet, and the live numbers to back it.
// Privacy first, the way Starknet does it: deposits and cash-outs through the STRK20 shielded
// pool (zero-knowledge proofs, nobody on chain sees who or how much), private stakes (only the
// whole pool is ever shown), swaps that never touch the chain, and Bitcoin staked like any coin.
// Every card says what it does and takes you straight to it.
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const usd = (mills) => {
  const v = (mills ?? 0) / 1000;
  return v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toLocaleString('en-US', { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
};
const num = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : Number(n ?? 0).toLocaleString('en-US'));

// the Starknet mark: a stylised S over the orbit, in the network's colours
export const STARKNET_LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="sn-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ec796b"/><stop offset="1" stop-color="#b4423f"/></linearGradient></defs><circle cx="32" cy="32" r="30" fill="#0c0c4f"/><path d="M14 40c6 6 16 7 22 2 5-4 3-10-3-12l-8-3c-5-2-5-8 1-10 5-2 11 0 15 4" fill="none" stroke="url(#sn-g)" stroke-width="5" stroke-linecap="round"/><circle cx="47" cy="19" r="3.4" fill="#fafaff"/><path d="M45 44l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#fafaff"/></svg>`;

export function createStarknetPage({ app, base, cashier, go, signIn, pickAsset, toast }) {
  let impact = null;
  let loadedAt = 0;

  async function load() {
    if (Date.now() - loadedAt < 60_000) return;
    loadedAt = Date.now();
    try {
      const res = await fetch(new URL('/api/impact', base).href);
      if (res.ok) impact = await res.json();
    } catch {
      /* the numbers are a bonus: the page works without them */
    }
    render(false);
  }

  const btcAsset = () => app.assets?.find((a) => /btc/i.test(a.symbol ?? a.id))?.id ?? null;

  function render(fetch = true) {
    const root = $('starknet-root');
    if (!root) return;
    const online = app.mode === 'online';
    const signed = online && cashier.signedIn;
    const privDep = signed && cashier.privateOk('deposit');
    const privWd = signed && cashier.privateOk('withdraw');
    const btc = btcAsset();
    const status = (on, onTxt, offTxt) => `<span class="sk-st ${on ? 'on' : ''}">${on ? '● ' : '○ '}${esc(on ? onTxt : offTxt)}</span>`;
    const card = (id, ico, title, body, st, act) => `<article class="sk-card" data-k="${id}"><div class="sk-ico">${ico}</div><div class="sk-txt"><h3>${esc(title)}</h3><p>${esc(body)}</p>${st}</div><button type="button" class="cta sk-go" data-go="${id}">${esc(act)}</button></article>`;
    const I = impact;
    const C = I?.chain;
    const stat = (v, k) => `<div class="sk-stat"><b class="num">${v}</b><span>${esc(k)}</span></div>`;
    root.innerHTML = `
      <header class="sk-hero">
        <div class="sk-logo">${STARKNET_LOGO}</div>
        <div><p class="eyebrow">${esc(t('sk.kicker'))}</p><h2>${esc(t('sk.title'))}</h2><p class="sk-lede">${esc(t('sk.lede'))}</p></div>
      </header>
      <div class="sk-grid">
        ${card('dep', '🛡️', t('sk.dep.t'), t('sk.dep.b'), status(privDep, t('sk.ready'), t(signed ? 'sk.needWallet' : 'sk.signIn')), t('sk.dep.a'))}
        ${card('stake', '🎲', t('sk.stake.t'), t('sk.stake.b'), status(true, t('sk.always'), ''), t('sk.stake.a'))}
        ${card('swap', '🔁', t('sk.swap.t'), t('sk.swap.b'), status(true, t('sk.always'), ''), t('sk.swap.a'))}
        ${card('wd', '🏦', t('sk.wd.t'), t('sk.wd.b'), status(privWd, t('sk.ready'), t(signed ? 'sk.needWallet' : 'sk.signIn')), t('sk.wd.a'))}
      </div>
      <article class="sk-btc"><div class="sk-ico">₿</div><div class="sk-txt"><h3>${esc(t('sk.btc.t'))}</h3><p>${esc(t('sk.btc.b'))}</p></div><button type="button" class="cta sk-go" data-go="btc" ${btc ? '' : 'disabled'}>${esc(t('sk.btc.a'))}</button></article>
      <section class="sk-live">
        <p class="eyebrow">${esc(t('sk.live'))}${I ? ` · ${esc(I.network === 'mainnet' ? 'Starknet Mainnet' : I.network === 'sepolia' ? 'Starknet Sepolia' : t('sk.test'))}` : ''}</p>
        ${
          I
            ? `<div class="sk-stats">
          ${stat(num(I.players.total), t('sk.s.players'))}
          ${stat(num(I.players.d7), t('sk.s.d7'))}
          ${stat(num(I.matches.total), t('sk.s.matches'))}
          ${stat(usd(I.matches.staked), t('sk.s.staked'))}
          ${stat(num(I.privacy.stakesPrivate), t('sk.s.privStakes'))}
          ${C ? stat(num(C.deposits.private + C.cashouts.private), t('sk.s.privTx')) : ''}
          ${C ? stat(usd(C.deposits.usd), t('sk.s.deposits')) : ''}
          ${C ? stat(usd(C.tvl), t('sk.s.tvl')) : ''}
        </div>`
            : `<p class="fine">${esc(t('sk.loading'))}</p>`
        }
        <p class="fine">${esc(t('sk.note'))}</p>
      </section>`;
    for (const b of root.querySelectorAll('[data-go]'))
      b.addEventListener('click', () => {
        const k = b.dataset.go;
        if (k === 'stake') return go('play');
        if (k === 'swap') return go('swap');
        if (k === 'btc') {
          pickAsset(btc);
          toast?.(t('sk.btc.picked'));
          return go('play');
        }
        if (!signed) return signIn();
        if (!cashier.openCashier(k === 'wd' ? 'withdraw' : 'deposit', 'private')) signIn();
      });
    if (fetch) load();
  }

  return { render };
}
