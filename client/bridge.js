// The "Buy & bridge" tab: how coins get onto Starknet. Buy with a card through AVNU, or bridge
// them over from another chain on the bridge's own site. Everything lands in the player's own
// Starknet wallet; from there Deposit (privately through STRK20, or a plain transfer) moves it
// into the game. No widget of ours in between: the player deals with each service directly.
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createBridgeUi({ account, chain }) {
  function render() {
    const root = $('bridge-root');
    if (!root) return;
    const main = chain()?.network !== 'sepolia';
    const addr = account() ?? '';
    const L = [
      ...(main ? [['AVNU · ' + t('br.buy'), t('br.buySub'), 'https://app.avnu.fi/en/buy', 'buy']] : []),
      ['StarkGate', 'Ethereum ↔ Starknet', main ? 'https://starkgate.starknet.io' : 'https://sepolia.starkgate.starknet.io'],
      ['Layerswap', t('br.lsSub'), `https://layerswap.io/app/?to=${main ? 'STARKNET_MAINNET' : 'STARKNET_SEPOLIA'}${addr ? `&destAddress=${addr}` : ''}`],
      ...(main
        ? [
            ['Atomiq', 'Bitcoin, Lightning ↔ Starknet', 'https://app.atomiq.exchange'],
            ['Garden', 'Bitcoin ↔ Starknet', 'https://app.garden.finance'],
            ['Orbiter', 'EVM L2s ↔ Starknet', 'https://www.orbiter.finance'],
            ['rhino.fi', 'EVM, Solana, Tron ↔ Starknet', 'https://app.rhino.fi'],
            ['Owlto', 'EVM L2s ↔ Starknet', 'https://owlto.finance'],
            ['AVNU', t('br.avnuSub'), 'https://app.avnu.fi'],
          ]
        : []),
    ];
    root.innerHTML = `<p class="fine">${esc(t('br.intro'))}</p>${addr ? `<p class="fine">${esc(t('br.yourAddr'))} <b class="num">${esc(addr.slice(0, 8))}…${esc(addr.slice(-6))}</b></p>` : ''}
      <div class="br-links">${L.map(([n, sub, href, cls]) => `<a class="br-link${cls ? ` ${cls}` : ''}" href="${esc(href)}" target="_blank" rel="noopener"><b>${esc(n)}</b><span>${esc(sub)}</span></a>`).join('')}</div>
      <p class="fine">${esc(t('br.othersNote'))}</p>`;
  }
  return { render, onMessage: () => {} };
}
