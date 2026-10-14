// The "Buy & bridge" tab: how coins get onto Starknet. Buy with a card in Braavos, or bridge
// them over from another chain on the bridge's own site. Everything lands in the player's own
// Starknet wallet; from there Deposit (privately through STRK20, or a plain transfer) moves it
// into the game. No widget of ours in between: the player deals with each service directly.
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createBridgeUi({ account, chain, shadow = () => false, wallet = () => null }) {
  function render() {
    const root = $('bridge-root');
    if (!root) return;
    const main = chain()?.network !== 'sepolia';
    // private mode: never the shadow account's address. Coins bridged straight to it would tie it
    // to where they came from; they go to the player's own wallet, are shielded there, and the
    // deposit pays from the shielded balance
    const priv = shadow();
    const addr = (priv ? wallet() : account()) ?? '';
    // checked against each service's own docs and starknet.io (Oct 2026); keep this list to routes
    // that really reach Starknet
    const L = [
      ...(main ? [['Braavos · ' + t('br.buy'), t('br.buySub'), 'https://braavos.app/deposit-crypto/', 'buy']] : []),
      ['StarkGate', main ? 'Ethereum, Bitcoin, Solana ↔ Starknet' : 'Ethereum Sepolia ↔ Starknet Sepolia', main ? 'https://starkgate.starknet.io' : 'https://sepolia.starkgate.starknet.io'],
      ['Layerswap', t('br.lsSub'), `https://layerswap.io/app/?to=${main ? 'STARKNET_MAINNET' : 'STARKNET_SEPOLIA'}${addr ? `&destAddress=${addr}` : ''}`],
      ...(main
        ? [
            ['strkBTC', 'Bitcoin → strkBTC · StarkWare', 'https://strkbtc.io'],
            ['Atomiq', 'Bitcoin, Lightning → strkBTC', 'https://app.atomiq.exchange'],
            ['Garden', 'Bitcoin, Ethereum, Arbitrum, Base ↔ Starknet', 'https://app.garden.finance'],
            ['Stargate', 'EVM chains ↔ Starknet', 'https://stargate.finance'],
            ['Orbiter', 'Ethereum, L2s ↔ Starknet', 'https://www.orbiter.finance'],
            ['rhino.fi', 'Ethereum, L2s ↔ Starknet · ETH, USDC, USDT, WBTC', 'https://app.rhino.fi/bridge'],
            ['Owlto', 'L2s ↔ Starknet', 'https://owlto.finance'],
            ['AVNU', t('br.avnuSub'), 'https://app.avnu.fi'],
          ]
        : []),
    ];
    root.innerHTML = `<p class="fine${priv ? ' br-priv' : ''}">${esc(t(priv ? 'br.introShadow' : 'br.intro'))}</p>${addr ? `<p class="fine">${esc(t(priv ? 'br.yourWallet' : 'br.yourAddr'))} <b class="num">${esc(addr.slice(0, 8))}…${esc(addr.slice(-6))}</b></p>` : ''}
      <div class="br-links">${L.map(([n, sub, href, cls]) => `<a class="br-link${cls ? ` ${cls}` : ''}" href="${esc(href)}" target="_blank" rel="noopener"><b>${esc(n)}</b><span>${esc(sub)}</span></a>`).join('')}</div>
      <p class="fine">${esc(t('br.othersNote'))}</p>`;
  }
  return { render, onMessage: () => {} };
}
