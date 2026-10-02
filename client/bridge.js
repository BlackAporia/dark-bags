// The Bridge tab: bring coins in from ~35 chains (or send them out) through NEAR Intents, with a
// deposit address on the chain you send from; plus links to the other Starknet bridges. Coins
// bridged in land in the player's own Starknet wallet; from there Deposit moves them into the game.
import { parseUnits } from '../shared/assets.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const CHAINS = {
  btc: 'Bitcoin', eth: 'Ethereum', sol: 'Solana', bsc: 'BNB Chain', base: 'Base', arb: 'Arbitrum', op: 'Optimism', pol: 'Polygon', avax: 'Avalanche',
  tron: 'Tron', ton: 'TON', xrp: 'XRP', doge: 'Dogecoin', ltc: 'Litecoin', bch: 'Bitcoin Cash', dash: 'Dash', zec: 'Zcash', cardano: 'Cardano',
  near: 'NEAR', sui: 'Sui', aptos: 'Aptos', stellar: 'Stellar', gnosis: 'Gnosis', bera: 'Berachain', scroll: 'Scroll', monad: 'Monad',
  xlayer: 'X Layer', plasma: 'Plasma', movement: 'Movement', hypercore: 'Hyperliquid', hlevm: 'HyperEVM', aleo: 'Aleo', fogo: 'Fogo', hood: 'Robinhood Chain', adi: 'ADI', starknet: 'Starknet',
};
const chainName = (c) => CHAINS[c] ?? c.toUpperCase();
const FINAL = new Set(['SUCCESS', 'REFUNDED', 'FAILED']);

export function createBridgeUi({ base, session, account, chain, facade, toast, onArrived = () => {} }) {
  const st = { info: undefined, tokens: null, dir: 'in', from: 'eth', quote: null, poll: 0, status: null };
  const api = async (path, body) => {
    const res = await fetch(new URL(path, base).href, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-darkbags-session': session() },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  // the other bridges and ramps into Starknet, for anything Intents does not cover
  function links() {
    const main = chain()?.network !== 'sepolia';
    const addr = account() ?? '';
    const L = [
      ['StarkGate', 'Ethereum ↔ Starknet', main ? 'https://starkgate.starknet.io' : 'https://sepolia.starkgate.starknet.io'],
      ['Layerswap', t('br.lsSub'), `https://layerswap.io/app/?to=${main ? 'STARKNET_MAINNET' : 'STARKNET_SEPOLIA'}${addr ? `&destAddress=${addr}` : ''}`],
      ...(main
        ? [
            ['Orbiter', 'EVM L2s ↔ Starknet', 'https://www.orbiter.finance'],
            ['rhino.fi', 'EVM, Solana, Tron ↔ Starknet', 'https://app.rhino.fi'],
            ['Owlto', 'EVM L2s ↔ Starknet', 'https://owlto.finance'],
            ['Atomiq', 'Bitcoin, Lightning ↔ Starknet', 'https://app.atomiq.exchange'],
            ['Garden', 'Bitcoin ↔ Starknet', 'https://app.garden.finance'],
            ['AVNU', t('br.avnuSub'), 'https://app.avnu.fi'],
          ]
        : []),
    ];
    return `<p class="eyebrow br-h">${t('br.others')}</p><div class="br-links">${L.map(([n, sub, href]) => `<a class="br-link" href="${esc(href)}" target="_blank" rel="noopener"><b>${esc(n)}</b><span>${esc(sub)}</span></a>`).join('')}</div><p class="fine">${t('br.othersNote')}</p>`;
  }

  async function load() {
    if (st.info === undefined) st.info = await api('/api/bridge/info').catch(() => null);
    if (st.info && !st.tokens) st.tokens = (await api('/api/bridge/tokens')).tokens;
  }

  async function render() {
    const root = $('bridge-root');
    if (!root) return;
    root.innerHTML = `<p class="fine">…</p>`;
    try {
      await load();
    } catch (e) {
      root.innerHTML = `<p class="fine bad">${esc(e.message)}</p>${links()}`;
      return;
    }
    if (!st.info) {
      root.innerHTML = `<p class="fine">${t('br.mainnetOnly')}</p>${links()}`;
      return;
    }
    if (st.quote?.depositAddress) return renderDeposit(root);
    const stark = st.tokens.filter((x) => x.blockchain === 'starknet');
    const chains = [...new Set(st.tokens.map((x) => x.blockchain))].filter((c) => c !== 'starknet').sort((a, b) => Object.keys(CHAINS).indexOf(a) - Object.keys(CHAINS).indexOf(b));
    if (!chains.includes(st.from)) st.from = chains[0];
    const other = st.tokens.filter((x) => x.blockchain === st.from);
    const opt = (list, sel) => list.map((x) => `<option value="${esc(x.assetId)}"${x.assetId === sel ? ' selected' : ''}>${esc(x.symbol)}</option>`).join('');
    const chainOpts = chains.map((c) => `<option value="${c}"${c === st.from ? ' selected' : ''}>${esc(chainName(c))}</option>`).join('');
    const inbound = st.dir === 'in';
    root.innerHTML = `
      <div class="mode br-dir" role="tablist">
        <button type="button" class="seg" role="tab" data-dir="in" aria-selected="${inbound}">${t('br.in')}</button>
        <button type="button" class="seg" role="tab" data-dir="out" aria-selected="${!inbound}">${t('br.out')}</button>
      </div>
      <div class="br-grid">
        <label>${inbound ? t('br.fromNet') : t('br.toNet')}<select id="br-chain">${chainOpts}</select></label>
        <label>${inbound ? t('br.youSend') : t('br.youGet')}<select id="br-other">${opt(other, st.otherSel)}</select></label>
        <label>${inbound ? t('br.youGet') : t('br.youSend')} · Starknet<select id="br-stark">${opt(stark, st.starkSel ?? stark.find((x) => x.symbol === 'USDC')?.assetId)}</select></label>
        <label>${t('br.amount')}<input id="br-amt" inputmode="decimal" placeholder="0.0" value="${esc(st.amt ?? '')}"></label>
      </div>
      <label class="br-wide">${inbound ? t('br.refund', { c: chainName(st.from) }) : t('br.recipient', { c: chainName(st.from) })}<input id="br-addr" autocomplete="off" spellcheck="false" value="${esc(st.addr ?? '')}" placeholder="${inbound ? t('br.refundPh') : t('br.recipientPh')}"></label>
      <p class="fine">${inbound ? t('br.landsIn', { a: esc(short(account())) }) : t('br.fromWallet', { a: esc(short(account())) })}${st.info.feeBps ? ` ${t('br.fee', { p: st.info.feeBps / 100 })}` : ''}</p>
      <p id="br-est" class="br-est"></p>
      <button type="button" class="cta" id="br-go">${inbound ? t('br.getAddr') : t('br.send')}</button>
      ${links()}`;
    const keep = () => {
      st.otherSel = $('br-other').value;
      st.starkSel = $('br-stark').value;
      st.amt = $('br-amt').value;
      st.addr = $('br-addr').value;
    };
    for (const b of root.querySelectorAll('[data-dir]'))
      b.addEventListener('click', () => {
        keep();
        st.dir = b.dataset.dir;
        st.addr = '';
        render();
      });
    $('br-chain').addEventListener('change', (e) => {
      keep();
      st.from = e.target.value;
      st.otherSel = null;
      st.addr = '';
      render();
    });
    let timer = 0;
    const estimate = () => {
      keep();
      clearTimeout(timer);
      timer = setTimeout(() => ask(true), 600);
    };
    for (const id of ['br-other', 'br-stark']) $(id).addEventListener('change', estimate);
    $('br-amt').addEventListener('input', estimate);
    $('br-addr').addEventListener('change', keep);
    $('br-go').addEventListener('click', () => (keep(), ask(false)));
  }

  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
  const tok = (id) => st.tokens.find((x) => x.assetId === id);

  async function ask(dry) {
    const inbound = st.dir === 'in';
    const from = tok(inbound ? st.otherSel : st.starkSel);
    const to = tok(inbound ? st.starkSel : st.otherSel);
    const units = from && parseUnits(st.amt ?? '', from.decimals);
    const est = $('br-est');
    if (!from || !to || !units) return dry ? (est.textContent = '') : toast(t('br.needAmount'));
    if (!dry && !st.addr?.trim()) return toast(inbound ? t('br.needRefund') : t('br.needRecipient'));
    try {
      if (!dry) $('br-go').disabled = true;
      est.textContent = '…';
      const q = await api('/api/bridge/quote', { dir: st.dir, originAsset: from.assetId, destinationAsset: to.assetId, amount: units.toString(), refundTo: st.addr || account(), recipient: st.addr || account(), dry });
      est.innerHTML = t('br.estimate', { a: `<b>${esc(q.amountOutFormatted)} ${esc(q.to.symbol)}</b>`, u: q.amountOutUsd ? `$${Number(q.amountOutUsd).toFixed(2)}` : '—', s: q.timeEstimate ?? '?' });
      if (dry) return;
      st.quote = q;
      st.status = 'PENDING_DEPOSIT';
      if (!inbound) await sendOut(q);
      render();
      watch();
    } catch (e) {
      est.textContent = e.message;
      est.classList.add('bad');
    } finally {
      if ($('br-go')) $('br-go').disabled = false;
    }
  }

  // out of Starknet: our own wallet pays the deposit address straight away
  async function sendOut(q) {
    const from = tok(q.from.assetId);
    const units = BigInt(q.amountIn);
    const f = await facade();
    const call = { contractAddress: from.contractAddress, entrypoint: 'transfer', calldata: [q.depositAddress, (units & ((1n << 128n) - 1n)).toString(), (units >> 128n).toString()] };
    const tx = await f.execute([call]);
    st.tx = tx;
    api('/api/bridge/submit', { txHash: tx, depositAddress: q.depositAddress }).catch(() => {});
    toast(t('br.sent'));
  }

  function renderDeposit(root) {
    const q = st.quote;
    const inbound = q.dir === 'in';
    const label = { PENDING_DEPOSIT: t('br.s.wait'), KNOWN_DEPOSIT_TX: t('br.s.seen'), INCOMPLETE_DEPOSIT: t('br.s.partial'), PROCESSING: t('br.s.proc'), SUCCESS: t('br.s.ok'), REFUNDED: t('br.s.refund'), FAILED: t('br.s.fail') }[st.status] ?? st.status;
    root.innerHTML = `
      <div class="br-dep">
        ${inbound ? `<p>${t('br.sendExactly', { a: `<b>${esc(q.amountInFormatted)} ${esc(q.from.symbol)}</b>`, c: esc(chainName(q.from.chain)) })}</p>
        <p class="ap-addr num br-addr">${esc(q.depositAddress)}</p>
        ${q.depositMemo ? `<p class="fine bad">${t('br.memo')}: <b class="num">${esc(q.depositMemo)}</b></p>` : ''}
        <div class="ap-row"><button type="button" class="ghost" data-c="addr">${t('acct.copy')}</button>${q.depositMemo ? `<button type="button" class="ghost" data-c="memo">${t('br.copyMemo')}</button>` : ''}</div>` : `<p>${t('br.outSent', { a: `<b>${esc(q.amountInFormatted)} ${esc(q.from.symbol)}</b>`, c: esc(chainName(q.to.chain)) })}</p>`}
        <p>${t('br.youGetAbout', { a: `<b>${esc(q.amountOutFormatted)} ${esc(q.to.symbol)}</b>`, c: esc(chainName(q.to.chain)) })}</p>
        ${q.deadline ? `<p class="fine">${t('br.deadline', { t: new Date(q.deadline).toLocaleString() })}</p>` : ''}
        <p class="br-status s-${esc(st.status ?? '')}">● ${esc(label ?? '')}</p>
        ${st.status === 'SUCCESS' && inbound ? `<button type="button" class="cta" data-c="deposit">${t('br.toGame')}</button>` : ''}
        <button type="button" class="link" data-c="new">${t('br.new')}</button>
      </div>`;
    const on = (k, f) => root.querySelector(`[data-c="${k}"]`)?.addEventListener('click', f);
    const copy = async (s) => {
      await navigator.clipboard?.writeText(s).catch(() => {});
      toast(t('acct.copied'));
    };
    on('addr', () => copy(q.depositAddress));
    on('memo', () => copy(q.depositMemo));
    on('deposit', () => onArrived(q.to));
    on('new', () => {
      clearInterval(st.poll);
      st.quote = null;
      st.status = null;
      render();
    });
  }

  function watch() {
    clearInterval(st.poll);
    st.poll = setInterval(async () => {
      if (!st.quote) return clearInterval(st.poll);
      const q = st.quote;
      try {
        const r = await api(`/api/bridge/status?depositAddress=${encodeURIComponent(q.depositAddress)}${q.depositMemo ? `&depositMemo=${encodeURIComponent(q.depositMemo)}` : ''}`);
        if (r.status !== st.status) {
          st.status = r.status;
          if (r.status === 'SUCCESS') toast(t('br.s.ok'));
          if ($('bridge-root') && !$('bridge-root').closest('[hidden]')) render();
        }
        if (FINAL.has(r.status)) clearInterval(st.poll);
      } catch {}
    }, 8000);
  }

  return { render };
}
