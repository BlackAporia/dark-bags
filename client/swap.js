// Swap: trade coins in your game balance at the live price (minus a 0.3% spread), and,
// with a Starknet wallet signed in, swap in that wallet through AVNU's aggregator.
import { formatUnits, parseUnits, usdText } from '../shared/assets.js';
import { CFG } from '../shared/config.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createSwap({ app, send, toast, cashier, signIn }) {
  const st = { from: null, to: null, amount: '', wFrom: null, wTo: null, wAmount: '', slip: 50, quote: null, qBusy: false, busy: false };
  const info = (id) => app.prices.get(id) ?? app.assets.find((a) => a.id === id);
  const units = (id) => BigInt(app.balances?.[id] ?? '0');

  // what the typed amount turns into; kept apart from render() so typing can update the
  // result and the button in place (a re-render on blur used to swallow the button click)
  function gameCalc() {
    const a = info(st.from);
    const b = info(st.to);
    const amt = a ? parseUnits(st.amount, a.decimals) : null;
    const mills = a && amt ? app.prices.value(st.from, amt) : 0;
    const fee = app.swap?.fee ?? 0.003;
    const out = b && mills ? app.prices.unitsFor(st.to, Math.floor(mills * (1 - fee))) : null;
    const short = !!amt && amt > units(st.from);
    const tiny = !!amt && mills < CFG.SWAP_MIN;
    return {
      a, b, fee,
      outHtml: out && !tiny ? `≈ <b class="num">${esc(formatUnits(out, b.decimals, 6))} ${esc(b.symbol)}</b> <span class="fine">${usdText(Math.floor(mills * (1 - fee)))}</span>` : tiny ? `<span class="fine">${t('swap.min', { v: usdText(CFG.SWAP_MIN) })}</span>` : '&nbsp;',
      disabled: !out || short || tiny || st.busy,
      label: short ? t('swap.short') : t('swap.go'),
    };
  }

  function walletCalc() {
    const b = cashier.avnu.tokens().find((x) => x.id === st.wTo);
    const q = st.quote;
    return {
      outHtml: st.qBusy ? t('swap.quoting') : q && b ? `≈ <b class="num">${esc(formatUnits(q.out, b.decimals, 6))} ${esc(b.symbol)}</b>${q.impactBps !== null ? ` <span class="fine">${t('swap.impact', { p: (Number(q.impactBps) / 100).toFixed(2) })}</span>` : ''}` : '&nbsp;',
      disabled: !q || st.qBusy || st.busy,
    };
  }

  // refresh the result lines and buttons without rebuilding the form (keeps focus and clicks)
  function paint() {
    const root = $('swap-root');
    if (!root) return;
    const g = root.querySelector('[data-go="game"]');
    if (g) {
      const c = gameCalc();
      root.querySelector('.swap-card:not(.avnu) .swap-out').innerHTML = c.outHtml;
      g.disabled = c.disabled;
      g.textContent = c.label;
    }
    const w = root.querySelector('[data-go="avnu"]');
    if (w) {
      const c = walletCalc();
      root.querySelector('.swap-card.avnu .swap-out').innerHTML = c.outHtml;
      w.disabled = c.disabled;
    }
  }

  function render() {
    const root = $('swap-root');
    if (!root) return;
    const priced = app.assets.filter((a) => app.prices.has(a.id));
    st.from ??= priced.find((a) => units(a.id) > 0n)?.id ?? priced[0]?.id;
    st.to ??= priced.find((a) => a.id !== st.from)?.id;
    const { a, fee, outHtml, disabled, label } = gameCalc();
    const opt = (sel) => priced.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.symbol)} · ${usdText(app.prices.value(x.id, units(x.id)))}</option>`).join('');
    const w = cashier.avnu;
    root.innerHTML = `
      <h2 class="sec-h">${t('nav.swap')}</h2>
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
      </section>
      <section class="swap-card avnu">
        <header><p class="eyebrow">${t('swap.wallet')}</p><span class="avnu-mark">AVNU</span></header>
        ${w.ready ? walletSwap(w) : `<p class="fine">${t(app.mode === 'online' && app.chain ? 'swap.signIn' : 'swap.needChain')}</p>${app.mode === 'online' && app.chain ? `<button type="button" class="ghost" data-go="signin">${t('lobby.signIn')}</button>` : ''}`}
      </section>`;
    wire(root, a);
  }

  function walletSwap(w) {
    const toks = w.tokens();
    st.wFrom ??= toks.find((x) => /USDC/i.test(x.symbol))?.id ?? toks[0]?.id;
    st.wTo ??= toks.find((x) => x.id !== st.wFrom)?.id;
    const opt = (sel) => toks.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.symbol)}</option>`).join('');
    const c = walletCalc();
    return `
      <label class="swap-row"><span>${t('swap.from')}</span><select data-k="wFrom">${opt(st.wFrom)}</select></label>
      <div class="swap-amt"><input data-k="wAmount" inputmode="decimal" placeholder="0.0" value="${esc(st.wAmount)}"></div>
      <label class="swap-row"><span>${t('swap.to')}</span><select data-k="wTo">${opt(st.wTo)}</select></label>
      <div class="swap-pcts slip"><span class="fine">${t('swap.slippage')}</span>${[50, 100, 200].map((bp) => `<button type="button" data-slip="${bp}" aria-pressed="${st.slip === bp}">${bp / 100}%</button>`).join('')}</div>
      <p class="swap-out">${c.outHtml}</p>
      <button type="button" class="cta" data-go="avnu" ${c.disabled ? 'disabled' : ''}>${t('swap.goAvnu')}</button>
      <p class="fine">${t('swap.walletNote')}</p>`;
  }

  let qTimer = null;
  let qSeq = 0;
  function requote() {
    clearTimeout(qTimer);
    st.quote = null;
    const seq = ++qSeq;
    const tok = cashier.avnu.tokens().find((x) => x.id === st.wFrom);
    const amt = tok ? parseUnits(st.wAmount, tok.decimals) : null;
    st.qBusy = !!amt && st.wFrom !== st.wTo;
    paint();
    if (!st.qBusy) return;
    qTimer = setTimeout(async () => {
      try {
        const q = await cashier.avnu.quote(st.wFrom, st.wTo, amt);
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
    // selects rebuild the form; typing only repaints the result and the button
    for (const el of root.querySelectorAll('select[data-k]'))
      el.addEventListener('change', () => {
        st[el.dataset.k] = el.value;
        if (el.dataset.k === 'from' && st.to === st.from) st.to = null;
        if (el.dataset.k === 'wFrom' && st.wTo === st.wFrom) st.wTo = null;
        if (el.dataset.k.startsWith('w')) {
          render();
          requote();
        } else render();
      });
    for (const el of root.querySelectorAll('input[data-k]'))
      el.addEventListener('input', () => {
        st[el.dataset.k] = el.value.replace(',', '.');
        if (el.dataset.k.startsWith('w')) requote();
        else paint();
      });
    for (const b of root.querySelectorAll('[data-pct]'))
      b.addEventListener('click', () => {
        const u = (units(st.from) * BigInt(b.dataset.pct)) / 100n;
        st.amount = formatUnits(u, a.decimals, a.decimals).replace(/,/g, '');
        render();
      });
    for (const b of root.querySelectorAll('[data-slip]'))
      b.addEventListener('click', () => {
        st.slip = Number(b.dataset.slip);
        render();
      });
    root.querySelector('.swap-flip')?.addEventListener('click', () => {
      [st.from, st.to] = [st.to, st.from];
      st.amount = '';
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
      const tok = cashier.avnu.tokens().find((x) => x.id === st.wFrom);
      if (!tok || !st.quote) return;
      st.busy = true;
      paint();
      try {
        const r = await cashier.avnu.swap(st.wFrom, st.wTo, parseUnits(st.wAmount, tok.decimals), BigInt(st.slip));
        toast(t('swap.sent', { tx: `${String(r.tx).slice(0, 10)}…` }));
        st.wAmount = '';
        st.quote = null;
      } catch (e) {
        toast(String(e?.message ?? e).slice(0, 160));
      }
      st.busy = false;
      render();
    });
  }

  function onMessage(m) {
    if (m.t === 'swapped') {
      st.busy = false;
      st.amount = '';
      const a = info(m.from);
      const b = info(m.to);
      toast(t('swap.done', { a: `${formatUnits(BigInt(m.units), a.decimals, 6)} ${a.symbol}`, b: `${formatUnits(BigInt(m.out), b.decimals, 6)} ${b.symbol}` }));
    }
    if (m.t === 'err') st.busy = false;
    if (document.querySelector('.page[data-page="swap"]')?.hidden) return;
    // balances and tables tick in every couple of seconds: rebuilding the form then would
    // steal the focus from the amount you are typing, so only a finished swap rebuilds it
    const typing = document.activeElement?.closest?.('#swap-root') && document.activeElement.tagName === 'INPUT';
    if (m.t === 'swapped' || !typing) render();
    else paint();
  }

  return { render, onMessage };
}
