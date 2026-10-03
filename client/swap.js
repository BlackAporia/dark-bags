// Swap: trade coins in your game balance at the live price (minus a 0.3% spread), and, with a
// Starknet wallet signed in, swap in that wallet through AVNU's aggregator: any coin on AVNU's
// verified list (or Ekubo's), with its logo, what you hold of it, the rate, the price impact and
// the least you get.
import { formatUnits, parseUnits, usdText } from '../shared/assets.js';
import { CFG } from '../shared/config.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

export function createSwap({ app, send, toast, cashier, signIn }) {
  const st = {
    from: null, to: null, amount: '', busy: false,
    wFrom: null, wTo: null, wAmount: '', slip: 50, quote: null, qBusy: false,
    list: null, // the AVNU / Ekubo coins (from the server)
    bal: new Map(), // wallet balances by coin id (BigInt, or null when unreadable)
    pick: null, // 'wFrom' | 'wTo' | 'from' | 'to': the open coin picker
    q: '',
  };
  const info = (id) => app.prices.get(id) ?? app.assets.find((a) => a.id === id);
  const units = (id) => BigInt(app.balances?.[id] ?? '0');
  const listed = (id) => st.list?.find((c) => c.address === id);
  const logoOf = (id, sym = '?') => {
    const url = listed(id)?.logo;
    return url && /^https:\/\//.test(url) ? `<img class="tk-logo" alt="" src="${esc(url)}" loading="lazy" referrerpolicy="no-referrer">` : `<span class="tk-logo tk-dot">${esc(String(sym).slice(0, 1))}</span>`;
  };
  const usdOf = (id, u) => (app.prices.has?.(id) && u != null ? app.prices.value(id, u) : null);
  const w = cashier.avnu;

  // every coin the wallet card can use: the game's first, then the verified lists
  function walletCoins() {
    const game = w.tokens().map((x) => ({ id: x.id, symbol: x.symbol, name: x.name ?? x.symbol, decimals: x.decimals, game: true }));
    const have = new Set(game.map((x) => x.id));
    const more = (st.list ?? []).filter((c) => !have.has(c.address)).map((c) => ({ id: c.address, symbol: c.symbol, name: c.name, decimals: c.decimals }));
    return [...game, ...more];
  }
  const coin = (id) => walletCoins().find((x) => x.id === id) ?? null;

  // wallet balances: the coins in view, a few at a time
  const loading = new Set();
  async function loadBalances(ids) {
    if (!w.ready) return;
    const todo = ids.filter((id) => id && !st.bal.has(id) && !loading.has(id)).slice(0, 24);
    for (const id of todo) loading.add(id);
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const id = todo[i++];
        st.bal.set(id, await w.balance(id).catch(() => null));
        loading.delete(id);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (todo.length) {
      paintPicker();
      paint();
    }
  }
  const balText = (id, dec, sym) => {
    if (!st.bal.has(id)) return '…';
    const b = st.bal.get(id);
    return b == null ? '—' : `${formatUnits(b, dec, 6)} ${esc(sym)}`;
  };

  // ------------------------------------------------------------------ game balance

  function gameCalc() {
    const a = info(st.from);
    const b = info(st.to);
    const amt = a ? parseUnits(st.amount, a.decimals) : null;
    const mills = a && amt ? app.prices.value(st.from, amt) : 0;
    const fee = app.swap?.fee ?? 0.003;
    const out = b && mills ? app.prices.unitsFor(st.to, Math.floor(mills * (1 - fee))) : null;
    const shortOf = !!amt && amt > units(st.from);
    const tiny = !!amt && mills < CFG.SWAP_MIN;
    return {
      a, b, fee,
      outHtml: out && !tiny ? `≈ <b class="num">${esc(formatUnits(out, b.decimals, 6))} ${esc(b.symbol)}</b> <span class="fine">${usdText(Math.floor(mills * (1 - fee)))}</span>` : tiny ? `<span class="fine">${t('swap.min', { v: usdText(CFG.SWAP_MIN) })}</span>` : '&nbsp;',
      disabled: !out || shortOf || tiny || st.busy,
      label: shortOf ? t('swap.short') : t('swap.go'),
    };
  }

  // ------------------------------------------------------------------ wallet (AVNU)

  function walletCalc() {
    const a = coin(st.wFrom);
    const b = coin(st.wTo);
    const q = st.quote;
    const amt = a ? parseUnits(st.wAmount, a.decimals) : null;
    const have = st.bal.get(st.wFrom);
    const over = amt != null && have != null && amt > have;
    let rows = '';
    if (q && a && b && amt) {
      const rate = Number(q.out) / 10 ** b.decimals / (Number(amt) / 10 ** a.decimals);
      const min = (q.out * BigInt(10000 - st.slip)) / 10000n;
      const imp = q.impactBps !== null ? Number(q.impactBps) / 100 : null;
      const bad = imp !== null && Math.abs(imp) >= 3;
      rows = `<dl class="sw-facts">
        <dt>${t('swap.rate')}</dt><dd class="num">1 ${esc(a.symbol)} ≈ ${rate.toLocaleString('en-US', { maximumSignificantDigits: 6 })} ${esc(b.symbol)}</dd>
        ${imp !== null ? `<dt>${t('swap.impactK')}</dt><dd class="num ${bad ? 'bad' : Math.abs(imp) >= 1 ? 'warn' : 'ok'}">${imp.toFixed(2)}%</dd>` : ''}
        <dt>${t('swap.minGet', { p: st.slip / 100 })}</dt><dd class="num">${esc(formatUnits(min, b.decimals, 6))} ${esc(b.symbol)}</dd>
      </dl>${bad ? `<p class="sw-warn">⚠ ${t('swap.highImpact')}</p>` : ''}`;
    }
    const outUsd = q && b ? usdOf(b.id, q.out) : null;
    return {
      out: st.qBusy ? `<span class="fine">${t('swap.quoting')}</span>` : q && b ? `<b class="num">${esc(formatUnits(q.out, b.decimals, 6))}</b>${outUsd != null ? ` <span class="fine">≈ ${usdText(outUsd)}</span>` : ''}` : '<span class="fine">0.0</span>',
      rows,
      disabled: !q || st.qBusy || st.busy || over,
      label: over ? t('swap.short') : t('swap.goAvnu'),
      inUsd: a && amt ? usdOf(a.id, amt) : null,
    };
  }

  // what the form is built from: when this changes the page is rebuilt, otherwise repainted
  const shape = () => [w.ready, !!app.swap, app.mode, !!app.chain, app.assets.filter((a) => app.prices.has(a.id)).map((a) => a.id).join()].join('|');

  // refresh the numbers and buttons without rebuilding the form (keeps focus and clicks)
  function paint() {
    const root = $('swap-root');
    if (!root) return;
    const hold = root.querySelector('.sw-hold');
    if (hold) hold.innerHTML = holdings();
    const g = root.querySelector('[data-go="game"]');
    if (g) {
      const c = gameCalc();
      root.querySelector('.swap-card:not(.avnu) .swap-out').innerHTML = c.outHtml;
      g.disabled = c.disabled;
      g.textContent = c.label;
    }
    const btn = root.querySelector('[data-go="avnu"]');
    if (btn) {
      const c = walletCalc();
      root.querySelector('#sw-out').innerHTML = c.out;
      root.querySelector('#sw-rows').innerHTML = c.rows;
      root.querySelector('#sw-inusd').textContent = c.inUsd != null ? `≈ ${usdText(c.inUsd)}` : '';
      for (const k of ['wFrom', 'wTo']) {
        const x = coin(st[k]);
        const el = root.querySelector(`[data-bal="${k}"]`);
        if (el && x) el.innerHTML = `${t('swap.balance')}: ${balText(x.id, x.decimals, x.symbol)}`;
      }
      btn.disabled = c.disabled;
      btn.textContent = c.label;
    }
  }

  const coinBtn = (k, x) => `<button type="button" class="tk-btn" data-pick="${k}">${x ? `${logoOf(x.id, x.symbol)}<b>${esc(x.symbol)}</b>` : `<b>${t('swap.pick')}</b>`}<span class="tk-caret">▾</span></button>`;

  const holdings = () =>
    app.assets
      .filter((x) => app.prices.has(x.id) && units(x.id) > 0n)
      .map((x) => `<li>${logoOf(x.id, x.symbol)}<b>${esc(x.symbol)}</b><span class="num">${esc(formatUnits(units(x.id), x.decimals, 6))}</span><span class="fine">${usdText(app.prices.value(x.id, units(x.id)))}</span></li>`)
      .join('') || `<li class="fine">${t('swap.empty')}</li>`;

  function render() {
    const root = $('swap-root');
    if (!root) return;
    if (!st.list && app.mode === 'online' && app.chain) send({ t: 'coin_list' });
    const priced = app.assets.filter((a) => app.prices.has(a.id));
    st.from ??= priced.find((a) => units(a.id) > 0n)?.id ?? priced[0]?.id;
    st.to ??= priced.find((a) => a.id !== st.from)?.id;
    const { a, fee, outHtml, disabled, label } = gameCalc();
    const opt = (sel) => priced.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.symbol)} · ${usdText(app.prices.value(x.id, units(x.id)))}</option>`).join('');
    root.innerHTML = `
      <h2 class="sec-h">${t('nav.swap')}</h2>
      <div class="swap-grid">
      <section class="swap-card avnu">
        <header><p class="eyebrow">${t('swap.wallet')}</p><span class="avnu-mark">AVNU</span></header>
        ${w.ready ? walletSwap() : `<p class="fine">${t(app.mode === 'online' && app.chain ? 'swap.signIn' : 'swap.needChain')}</p>${app.mode === 'online' && app.chain ? `<button type="button" class="ghost" data-go="signin">${t('lobby.signIn')}</button>` : ''}`}
      </section>
      <section class="swap-card">
        <header><p class="eyebrow">${t('swap.game')}</p><span class="fine">${t('swap.gameNote', { f: (fee * 100).toFixed(1) })}</span></header>
        ${app.swap ? `
        <label class="swap-row"><span>${t('swap.from')}</span><select data-k="from">${opt(st.from)}</select></label>
        <div class="swap-amt"><input data-k="amount" inputmode="decimal" placeholder="0.0" value="${esc(st.amount)}"><div class="swap-pcts">${[25, 50, 100].map((p) => `<button type="button" data-pct="${p}">${p === 100 ? 'MAX' : `${p}%`}</button>`).join('')}</div></div>
        <p class="fine">${a ? `${t('swap.have')}: ${esc(formatUnits(units(st.from), a.decimals, 6))} ${esc(a.symbol)}` : ''}</p>
        <button type="button" class="swap-flip" aria-label="${t('swap.flip')}">⇅</button>
        <label class="swap-row"><span>${t('swap.to')}</span><select data-k="to">${opt(st.to)}</select></label>
        <p class="swap-out">${outHtml}</p>
        <button type="button" class="cta" data-go="game" ${disabled ? 'disabled' : ''}>${label}</button>` : `<p class="fine">${t('swap.gameOff')}</p>`}
        <ul class="sw-hold">${holdings()}</ul>
      </section>
      </div>
`;
    // the picker lives on <body>: a page's transform would pin a fixed overlay to the page
    if (!$('sw-pop')) {
      document.body.insertAdjacentHTML('beforeend', '<div id="sw-pop" class="tk-pop" hidden></div>');
      const close = () => {
        st.pick = null;
        paintPicker();
      };
      $('sw-pop').addEventListener('click', (e) => e.target === e.currentTarget && close());
      document.addEventListener('keydown', (e) => e.key === 'Escape' && st.pick && close());
    }
    st.shape = shape();
    wire(root, a);
    loadBalances([st.wFrom, st.wTo, ...w.tokens().map((x) => x.id)]);
    paintPicker();
  }

  function walletSwap() {
    const coins = walletCoins();
    st.wFrom ??= coins.find((x) => /^STRK$/i.test(x.symbol))?.id ?? coins[0]?.id;
    st.wTo ??= coins.find((x) => /^USDC$/i.test(x.symbol) && x.id !== st.wFrom)?.id ?? coins.find((x) => x.id !== st.wFrom)?.id;
    const a = coin(st.wFrom);
    const b = coin(st.wTo);
    const c = walletCalc();
    return `
      <p class="fine sw-acct">${esc(short(app.chain && cashier.account ? cashier.account : ''))}</p>
      <div class="sw-box">
        <div class="sw-top"><span class="eyebrow">${t('swap.youPay')}</span><span class="fine" data-bal="wFrom">${a ? `${t('swap.balance')}: ${balText(a.id, a.decimals, a.symbol)}` : ''}</span></div>
        <div class="sw-mid">${coinBtn('wFrom', a)}<input data-k="wAmount" inputmode="decimal" placeholder="0.0" value="${esc(st.wAmount)}" aria-label="${t('swap.youPay')}"></div>
        <div class="sw-bot"><span class="swap-pcts">${[25, 50, 100].map((p) => `<button type="button" data-wpct="${p}">${p === 100 ? 'MAX' : `${p}%`}</button>`).join('')}</span><span class="fine" id="sw-inusd">${c.inUsd != null ? `≈ ${usdText(c.inUsd)}` : ''}</span></div>
      </div>
      <button type="button" class="swap-flip sw-flip" data-wflip aria-label="${t('swap.flip')}">⇅</button>
      <div class="sw-box">
        <div class="sw-top"><span class="eyebrow">${t('swap.youGet')}</span><span class="fine" data-bal="wTo">${b ? `${t('swap.balance')}: ${balText(b.id, b.decimals, b.symbol)}` : ''}</span></div>
        <div class="sw-mid">${coinBtn('wTo', b)}<div class="sw-out" id="sw-out">${c.out}</div></div>
      </div>
      <div class="swap-pcts slip"><span class="fine">${t('swap.slippage')}</span>${[50, 100, 200].map((bp) => `<button type="button" data-slip="${bp}" aria-pressed="${st.slip === bp}">${bp / 100}%</button>`).join('')}</div>
      <div id="sw-rows">${c.rows}</div>
      <button type="button" class="cta" data-go="avnu" ${c.disabled ? 'disabled' : ''}>${c.label}</button>
      <p class="fine">${t('swap.walletNote')}</p>`;
  }

  // the coin picker: search by symbol, name or address; logos and wallet balances
  function paintPicker() {
    const pop = $('sw-pop');
    if (!pop) return;
    pop.hidden = !st.pick;
    if (!st.pick) return;
    const q = st.q.trim().toLowerCase();
    const all = st.pick.startsWith('w') ? walletCoins() : app.assets.filter((a) => app.prices.has(a.id)).map((a) => ({ id: a.id, symbol: a.symbol, name: a.name ?? a.symbol, decimals: a.decimals, game: true }));
    const rows = all
      .filter((c) => !q || c.symbol.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .sort((x, y) => Number((st.bal.get(y.id) ?? 0n) > 0n) - Number((st.bal.get(x.id) ?? 0n) > 0n))
      .slice(0, 60);
    pop.innerHTML = `<div class="tk-sheet" role="dialog" aria-label="${t('swap.pick')}">
      <div class="tk-head"><b>${t('swap.pick')}</b><button type="button" class="ghost" data-close>✕</button></div>
      <input id="tk-q" placeholder="${esc(t('coin.search'))}" value="${esc(st.q)}" autocomplete="off" spellcheck="false">
      <div class="tk-rows">${rows
        .map((c) => {
          const b = st.pick.startsWith('w') ? (st.bal.has(c.id) ? (st.bal.get(c.id) == null ? '—' : formatUnits(st.bal.get(c.id), c.decimals, 4)) : '…') : formatUnits(units(c.id), c.decimals, 4);
          return `<button type="button" class="tk-row" data-coin="${esc(c.id)}">${logoOf(c.id, c.symbol)}<span class="tk-name"><b>${esc(c.symbol)}</b><small>${esc(c.name ?? '')}${c.game ? ` · ${t('swap.inGame')}` : ''}</small></span><span class="num tk-bal">${b}</span></button>`;
        })
        .join('') || `<p class="fine">${t('coin.none')}</p>`}</div>
      <p class="fine">${t('swap.listNote')}</p></div>`;
    pop.querySelector('[data-close]').addEventListener('click', () => {
      st.pick = null;
      paintPicker();
    });
    const inp = $('tk-q');
    inp.addEventListener('input', () => {
      st.q = inp.value;
      const pos = inp.selectionStart;
      paintPicker();
      const again = $('tk-q');
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    for (const b of pop.querySelectorAll('[data-coin]'))
      b.addEventListener('click', () => {
        const k = st.pick;
        const other = { wFrom: 'wTo', wTo: 'wFrom', from: 'to', to: 'from' }[k];
        if (st[other] === b.dataset.coin) st[other] = st[k]; // picking the other side's coin swaps them
        st[k] = b.dataset.coin;
        st.pick = null;
        st.q = '';
        render();
        if (k.startsWith('w')) requote();
      });
    if (st.pick.startsWith('w')) loadBalances(rows.slice(0, 24).map((c) => c.id));
  }

  let qTimer = null;
  let qSeq = 0;
  function requote() {
    clearTimeout(qTimer);
    st.quote = null;
    const seq = ++qSeq;
    const tok = coin(st.wFrom);
    const amt = tok ? parseUnits(st.wAmount, tok.decimals) : null;
    st.qBusy = !!amt && !!st.wTo && st.wFrom !== st.wTo;
    paint();
    if (!st.qBusy) return;
    qTimer = setTimeout(async () => {
      try {
        const q = await w.quote(st.wFrom, st.wTo, amt);
        if (seq === qSeq) st.quote = q;
      } catch (e) {
        if (seq === qSeq) toast(`${t('swap.noQuote')} ${String(e?.message ?? '').slice(0, 100)}`);
      }
      if (seq !== qSeq) return;
      st.qBusy = false;
      paint();
    }, 450);
  }

  function wire(root, a) {
    for (const el of root.querySelectorAll('select[data-k]'))
      el.addEventListener('change', () => {
        st[el.dataset.k] = el.value;
        if (el.dataset.k === 'from' && st.to === st.from) st.to = null;
        render();
      });
    for (const el of root.querySelectorAll('input[data-k]'))
      el.addEventListener('input', () => {
        st[el.dataset.k] = el.value.replace(',', '.');
        if (el.dataset.k.startsWith('w')) requote();
        else paint();
      });
    for (const b of root.querySelectorAll('[data-pick]'))
      b.addEventListener('click', () => {
        st.pick = b.dataset.pick;
        st.q = '';
        paintPicker();
        setTimeout(() => $('tk-q')?.focus(), 0);
      });
    for (const b of root.querySelectorAll('[data-pct]'))
      b.addEventListener('click', () => {
        const u = (units(st.from) * BigInt(b.dataset.pct)) / 100n;
        st.amount = formatUnits(u, a.decimals, a.decimals).replace(/,/g, '');
        render();
      });
    for (const b of root.querySelectorAll('[data-wpct]'))
      b.addEventListener('click', () => {
        const x = coin(st.wFrom);
        const have = st.bal.get(st.wFrom);
        if (!x || have == null) return;
        let u = (have * BigInt(b.dataset.wpct)) / 100n;
        // keep a little STRK for the network fee
        if (/^STRK$/i.test(x.symbol) && b.dataset.wpct === '100') u = u > 10n ** 18n ? u - 10n ** 18n : 0n;
        st.wAmount = formatUnits(u, x.decimals, x.decimals).replace(/,/g, '');
        render();
        requote();
      });
    for (const b of root.querySelectorAll('[data-slip]'))
      b.addEventListener('click', () => {
        st.slip = Number(b.dataset.slip);
        render();
      });
    root.querySelector('.swap-flip:not([data-wflip])')?.addEventListener('click', () => {
      [st.from, st.to] = [st.to, st.from];
      st.amount = '';
      render();
    });
    root.querySelector('[data-wflip]')?.addEventListener('click', () => {
      [st.wFrom, st.wTo] = [st.wTo, st.wFrom];
      st.wAmount = '';
      st.quote = null;
      render();
    });
    root.querySelector('[data-go="game"]')?.addEventListener('click', () => {
      const u = parseUnits(st.amount, a.decimals);
      if (!u) return;
      st.busy = true;
      paint();
      send({ t: 'swap', from: st.from, to: st.to, units: u.toString() });
    });
    root.querySelector('[data-go="signin"]')?.addEventListener('click', () => signIn());
    root.querySelector('[data-go="avnu"]')?.addEventListener('click', async () => {
      const tok = coin(st.wFrom);
      if (!tok || !st.quote) return;
      st.busy = true;
      paint();
      try {
        const r = await w.swap(st.wFrom, st.wTo, parseUnits(st.wAmount, tok.decimals), BigInt(st.slip));
        toast(t('swap.sent', { tx: `${String(r.tx).slice(0, 10)}…` }));
        st.wAmount = '';
        st.quote = null;
        // balances move once the swap lands
        setTimeout(() => {
          st.bal.delete(st.wFrom);
          st.bal.delete(st.wTo);
          loadBalances([st.wFrom, st.wTo]);
        }, 6000);
      } catch (e) {
        toast(String(e?.message ?? e).slice(0, 160));
      }
      st.busy = false;
      render();
    });
  }

  function onMessage(m) {
    if (m.t === 'coins' && m.list) {
      st.list = m.list;
      w.register?.(m.list);
      if (!document.querySelector('.page[data-page="swap"]')?.hidden) render();
      return;
    }
    if (m.t === 'swapped') {
      st.busy = false;
      st.amount = '';
      const a = info(m.from);
      const b = info(m.to);
      toast(t('swap.done', { a: `${formatUnits(BigInt(m.units), a.decimals, 6)} ${a.symbol}`, b: `${formatUnits(BigInt(m.out), b.decimals, 6)} ${b.symbol}` }));
    }
    if (m.t === 'err') st.busy = false;
    if (m.t === 'authed') st.bal.clear();
    if (document.querySelector('.page[data-page="swap"]')?.hidden) return;
    // balances tick in every couple of seconds: rebuilding the form then would steal the focus
    // from the amount you are typing, so only a finished swap rebuilds it
    const typing = document.activeElement?.closest?.('#swap-root, #sw-pop') && document.activeElement.tagName === 'INPUT';
    if (st.pick) return; // the picker stays as it is while it is open
    // a full rebuild only when the form itself changes (sign in, coins, a finished swap); the
    // ticks just repaint the numbers, so the inputs stay put and clickable
    const key = shape();
    if (m.t === 'swapped' || (!typing && key !== st.shape)) render();
    else paint();
  }

  return { render, onMessage };
}
