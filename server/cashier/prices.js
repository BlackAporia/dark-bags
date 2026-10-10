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
    for (const t of tokens) this.publish(t, t.custom ? 0 : this.fixed[t.symbol.toUpperCase()] ?? (this.stable(t) ? 1 : 0));
  }

  // a coin added by address is priced only by its pool, never by the peg its name suggests
  stable(t) {
    return !t.custom && STABLE.has(t.symbol.toUpperCase());
  }

  publish(t, usd) {
    this.prices.set({ id: t.id, symbol: t.symbol, decimals: t.decimals, color: t.color, usd, stable: this.stable(t), ...(t.custom ? { custom: true, maxStake: t.maxStake ?? null } : {}) });
  }

  // Is there a real market behind this price? Selling `depthUsd` worth into USDC must get at least
  // `keep` of the small-probe price: a thin pool someone propped up fails, a liquid one passes.
  async depth(t, depthUsd, keep = 0.9) {
    if (!this.usdToken) return { ok: false, why: 'no USDC to quote against' };
    const small = await this.quoteOne(t).catch(() => 0);
    if (!(small > 0)) return { ok: false, why: 'no pool with USDC' };
    const human = depthUsd / small;
    const amountIn = BigInt(Math.floor(human * 10 ** Math.min(t.decimals, 15))) * 10n ** BigInt(Math.max(0, t.decimals - 15));
    const out = await this.quoter({ tokenIn: t, tokenOut: this.usdToken, amountIn }).catch(() => 0n);
    const got = Number(out) / 10 ** this.usdToken.decimals;
    return got >= depthUsd * keep ? { ok: true, usd: small } : { ok: false, why: `selling $${depthUsd} of it returns $${got.toFixed(2)}`, usd: small };
  }

  probeUnits(t) {
    const human = PROBE[t.symbol.toUpperCase()] ?? '1';
    const [w, f = ''] = human.split('.');
    return BigInt(w + f.padEnd(t.decimals, '0').slice(0, t.decimals)) || 1n;
  }

  async quoteOne(t) {
    const sym = t.symbol.toUpperCase();
    if (this.fixed[sym] && !t.custom) return this.fixed[sym];
    if (t.id === this.usdToken?.id) return 1;
    const peg = this.stable(t) ? 1 : t.btc && !t.custom && sym !== 'WBTC' ? this.btcUsd : 0;
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

  // price one token now (a freshly imported coin should not wait for the next round)
  async refreshOne(t) {
    try {
      const usd = await this.quoteOne(t);
      if (usd > 0) {
        this.last.set(t.id, { at: this.now(), usd });
        this.publish(t, usd);
        return usd;
      }
    } catch (e) {
      this.log.warn?.(`price ${t.symbol}: ${e?.message ?? e}`);
    }
    this.publish(t, 0);
    return 0;
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
