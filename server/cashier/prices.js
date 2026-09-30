// Live dollar prices for the table tokens, from on-chain swap quotes (Starkzap's
// Ekubo provider, no API key): "how much USDC do I get for N tokens". A price older
// than STALE_MS is dropped, which disables staking with that token until the feed
// recovers; nobody stakes at a dead rate.

const STALE_MS = 10 * 60 * 1000;
// probe sizes: big enough for a clean quote, small enough to ignore price impact
const PROBE = { STRK: '200', ETH: '0.01', USDT: '25', WBTC: '0.0005' };
const STABLE = new Set(['USDC', 'USDT', 'DAI', 'USDC.E']);

export class PriceFeed {
  constructor({ tokens, prices, quoter, usd, fixed = {}, now = () => Date.now(), log = console }) {
    this.tokens = tokens; // Starkzap Token objects with id/color/btc
    this.prices = prices; // shared PriceBook
    this.quoter = quoter; // async ({ tokenIn, tokenOut, amountIn: bigint }) → amountOut bigint
    this.usdToken = usd; // the token quotes are measured in (USDC)
    this.fixed = fixed; // SYMBOL → $ per token
    this.now = now;
    this.log = log;
    this.last = new Map(); // id → { at, usd }
    this.btcUsd = 0; // WBTC's price, the reference for the other BTC wrappers
    for (const t of tokens) this.publish(t, this.fixed[t.symbol.toUpperCase()] ?? (this.stable(t) ? 1 : 0));
  }

  stable(t) {
    return STABLE.has(t.symbol.toUpperCase());
  }

  publish(t, usd) {
    this.prices.set({ id: t.id, symbol: t.symbol, decimals: t.decimals, color: t.color, usd, stable: this.stable(t) });
  }

  probeUnits(t) {
    const human = PROBE[t.symbol.toUpperCase()] ?? '1';
    const [w, f = ''] = human.split('.');
    return BigInt(w + f.padEnd(t.decimals, '0').slice(0, t.decimals)) || 1n;
  }

  async quoteOne(t) {
    const sym = t.symbol.toUpperCase();
    if (this.fixed[sym]) return this.fixed[sym];
    if (t.id === this.usdToken?.id) return 1;
    const peg = this.stable(t) ? 1 : t.btc && sym !== 'WBTC' ? this.btcUsd : 0;
    if (!this.usdToken) return peg;
    try {
      const amountIn = this.probeUnits(t);
      const out = await this.quoter({ tokenIn: t, tokenOut: this.usdToken, amountIn });
      if (out <= 0n) throw new Error('empty quote');
      const usd = Number(out) / 10 ** this.usdToken.decimals / (Number(amountIn) / 10 ** t.decimals);
      // pegged tokens should sit near their peg; a quote far off is a thin pool, not a price
      const band = this.stable(t) ? 0.05 : 0.1;
      if (peg && Math.abs(usd / peg - 1) > band) return peg;
      return usd;
    } catch (e) {
      if (peg) return peg; // fall back to the peg rather than switching the token off
      throw e;
    }
  }

  async refresh() {
    // WBTC first: the other BTC wrappers are checked against it
    const order = [...this.tokens].sort((a, b) => (b.symbol.toUpperCase() === 'WBTC') - (a.symbol.toUpperCase() === 'WBTC'));
    for (const t of order) {
      try {
        const usd = await this.quoteOne(t);
        if (usd > 0) {
          if (t.symbol.toUpperCase() === 'WBTC') this.btcUsd = usd;
          this.last.set(t.id, { at: this.now(), usd });
          this.publish(t, usd);
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
