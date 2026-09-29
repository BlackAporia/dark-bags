// Live sats prices for the table tokens, from on-chain swap quotes (Starkzap's
// Ekubo provider, no API key): "how many WBTC base units (= sats) do I get for
// N tokens". A price older than STALE_MS is dropped, which disables staking
// with that token until the feed recovers; nobody stakes at a dead rate.

const STALE_MS = 10 * 60 * 1000;
// probe sizes: big enough for a clean quote, small enough to ignore price impact
const PROBE = { STRK: '200', ETH: '0.01', USDC: '25', USDT: '25', WBTC: '0.0005' };

export class PriceFeed {
  constructor({ tokens, prices, quoter, btc, fixed = {}, now = () => Date.now(), log = console }) {
    this.tokens = tokens; // Starkzap Token objects with id/color/btc
    this.prices = prices; // shared PriceBook
    this.quoter = quoter; // async ({ tokenIn, tokenOut, amountIn: bigint }) → amountOut bigint
    this.btc = btc; // the token quotes are measured in (WBTC: 8 decimals, so base units are sats)
    this.fixed = fixed;
    this.now = now;
    this.log = log;
    this.last = new Map(); // id → { at, satsPerToken }
    for (const t of tokens) this.publish(t, this.fixed[t.symbol.toUpperCase()] ?? 0);
  }

  publish(t, satsPerToken) {
    this.prices.set({ id: t.id, symbol: t.symbol, decimals: t.decimals, color: t.color, satsPerToken });
  }

  probeUnits(t) {
    const human = PROBE[t.symbol.toUpperCase()] ?? '1';
    const [w, f = ''] = human.split('.');
    return BigInt(w + f.padEnd(t.decimals, '0').slice(0, t.decimals)) || 1n;
  }

  async quoteOne(t) {
    const sym = t.symbol.toUpperCase();
    if (this.fixed[sym]) return this.fixed[sym];
    if (t.id === this.btc?.id) return 1e8; // one whole BTC
    if (!this.btc) return t.btc ? 1e8 : 0;
    const amountIn = this.probeUnits(t);
    try {
      const out = await this.quoter({ tokenIn: t, tokenOut: this.btc, amountIn });
      if (out <= 0n) throw new Error('empty quote');
      // out is in btc base units; scale to sats (8 decimals) per whole token
      const sats = (Number(out) * 10 ** (8 - this.btc.decimals)) / (Number(amountIn) / 10 ** t.decimals);
      // BTC wrappers should sit near 1 BTC; a quote far off is a thin pool, not a price
      if (t.btc && (sats < 0.9e8 || sats > 1.1e8)) return 1e8;
      return sats;
    } catch (e) {
      if (t.btc) return 1e8; // pegged: fall back to par rather than switching the token off
      throw e;
    }
  }

  async refresh() {
    for (const t of this.tokens) {
      try {
        const sats = await this.quoteOne(t);
        if (sats > 0) {
          this.last.set(t.id, { at: this.now(), satsPerToken: sats });
          this.publish(t, sats);
          continue;
        }
      } catch (e) {
        this.log.warn?.(`price ${t.symbol}: ${e?.message ?? e}`);
      }
      const l = this.last.get(t.id);
      if (!l || this.now() - l.at > STALE_MS) this.publish(t, 0);
    }
  }

  start(seconds = 60) {
    const run = () => this.refresh().catch((e) => this.log.error?.('price feed', e));
    run();
    this.timer = setInterval(run, seconds * 1000);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }
}
