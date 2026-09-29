// Assets you can enter a raid with. In STRK20 mode this list comes from the
// player's own shielded balances (any token in the privacy pool); prices turn a
// sats stake into token units. All token amounts are BigInt base units.

// Test-mode basket. Prices are fixed test values, not market data.
export const TEST_ASSETS = [
  { id: 'SATS', symbol: 'sats', decimals: 0, color: '#f7931a', satsPerToken: 1, faucet: '100000' },
  { id: 'STRK', symbol: 'STRK', decimals: 18, color: '#ec796b', satsPerToken: 150, faucet: '2000000000000000000000' },
  { id: 'ETH', symbol: 'ETH', decimals: 18, color: '#8c93ff', satsPerToken: 3500000, faucet: '30000000000000000' },
  { id: 'USDC', symbol: 'USDC', decimals: 6, color: '#2775ca', satsPerToken: 1000, faucet: '150000000' },
  { id: 'USDT', symbol: 'USDT', decimals: 6, color: '#26a17b', satsPerToken: 1000, faucet: '150000000' },
  { id: 'strkBTC', symbol: 'strkBTC', decimals: 8, color: '#f2a900', satsPerToken: 100000000, faucet: '120000' },
];

// Addresses we are sure of on Starknet mainnet. Anything else the player holds in
// the pool is resolved at runtime (symbol/decimals from the token contract).
export const KNOWN_MAINNET = {
  '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d': { symbol: 'STRK', decimals: 18 },
  '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7': { symbol: 'ETH', decimals: 18 },
  '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8': { symbol: 'USDT', decimals: 6 },
  '0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac': { symbol: 'WBTC', decimals: 8 },
};

const PRICE_SCALE = 1_000_000n; // prices kept with 6 decimal places of a sat

export class PriceBook {
  constructor(assets = TEST_ASSETS) {
    this.assets = new Map();
    for (const a of assets) this.set(a);
  }

  set(a) {
    this.assets.set(a.id, { ...a, priceMicro: BigInt(Math.round(a.satsPerToken * 1e6)) });
  }

  has(id) {
    return this.assets.has(id) && this.assets.get(id).priceMicro > 0n;
  }

  get(id) {
    return this.assets.get(id);
  }

  list() {
    return [...this.assets.values()].map(({ priceMicro, faucet, ...a }) => a);
  }

  // token base units needed to cover `sats` (rounded up, so the house is never short)
  quote(id, sats) {
    const a = this.assets.get(id);
    if (!a || a.priceMicro <= 0n) return null;
    const num = BigInt(sats) * 10n ** BigInt(a.decimals) * PRICE_SCALE;
    return (num + a.priceMicro - 1n) / a.priceMicro;
  }

  // sats value of `units` (rounded down)
  value(id, units) {
    const a = this.assets.get(id);
    if (!a || a.priceMicro <= 0n) return 0;
    return Number((BigInt(units) * a.priceMicro) / (10n ** BigInt(a.decimals) * PRICE_SCALE));
  }
}

// Pay out `sats` at the exact rate the runner entered with: units * sats / stakeSats.
export function unitsAtEntryRate(escrow, sats) {
  return (BigInt(escrow.units) * BigInt(sats)) / BigInt(escrow.sats);
}

export function formatUnits(units, decimals, maxFrac = 4) {
  const u = BigInt(units);
  const neg = u < 0n;
  const abs = neg ? -u : u;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  const w = whole.toLocaleString('en-US');
  return `${neg ? '−' : ''}${w}${frac ? `.${frac}` : ''}`;
}
