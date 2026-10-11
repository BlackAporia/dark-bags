// Live dollar prices for the table tokens, from on-chain swap quotes (Starkzap's
// Ekubo provider, no API key): "how much USDC do I get for N tokens". A price older
// than STALE_MS is dropped, which disables staking with that token until the feed
// recovers; nobody stakes at a dead rate.

const STALE_MS = 10 * 60 * 1000;
// probe sizes: big enough for a clean quote, small enough to ignore price impact
const PROBE = { STRK: '200', ETH: '0.01', USDT: '25', WBTC: '0.0005', STACHE: '40000' };
const STABLE = new Set(['USDC', 'USDT', 'DAI', 'USDC.E']);

const sameAddr = (a, b) => {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
};
// a human amount of a token in its base units (big or tiny amounts stay exact enough)
const toUnits = (human, decimals) => {
  const d = Math.min(decimals, 15);
  return (BigInt(Math.max(1, Math.floor(human * 10 ** d))) * 10n ** BigInt(decimals - d)) || 1n;
};
// the median of the prices, after dropping any more than 25% from the first median
export function robustMedian(list) {
  const med = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
  };
  const vals = list.filter((v) => v > 0 && Number.isFinite(v));
  const m0 = med(vals);
  if (!m0) return 0;
  const kept = vals.filter((v) => Math.abs(v / m0 - 1) <= 0.25);
  return med(kept.length ? kept : vals);
}

export class PriceFeed {
  constructor({ tokens, prices, quoter, usd, fixed = {}, now = () => Date.now(), log = console, fetchImpl = globalThis.fetch }) {
    this.tokens = tokens; // Starkzap Token objects with id/color/btc
    this.prices = prices; // shared PriceBook
    this.quoter = quoter; // async ({ tokenIn, tokenOut, amountIn: bigint }) → amountOut bigint
    this.usdToken = usd; // the token quotes are measured in (USDC)
    this.fixed = fixed; // SYMBOL → $ per token
    this.now = now;
    this.log = log;
    this.last = new Map(); // id → { at, usd }
    this.btcUsd = 0; // WBTC's price, the reference for the other BTC wrappers
    this.fetch = fetchImpl;
    this.sources = new Map(); // id → [[source, $], …] behind a many-source price (the partner coin)
    for (const t of tokens) this.publish(t, t.custom ? 0 : this.fixed[t.symbol.toUpperCase()] ?? (this.stable(t) ? 1 : 0));
  }

  // a coin added by address is priced only by its pool, never by the peg its name suggests
  stable(t) {
    return !t.custom && STABLE.has(t.symbol.toUpperCase());
  }

  publish(t, usd) {
    this.prices.set({ id: t.id, symbol: t.symbol, decimals: t.decimals, color: t.color, usd, stable: this.stable(t), ...(t.logo ? { logo: t.logo } : {}), ...(t.custom ? { custom: true } : {}), ...(t.maxStake != null ? { maxStake: t.maxStake } : {}) });
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

  // A token's $ price. Fixed prices and USDC as they are; stablecoins and the BTC wrappers keep
  // their peg unless their own quote agrees with it; every other coin is the median of several
  // sources (multiQuote), so one thin pool or one stale site can't set it.
  async quoteOne(t) {
    const sym = t.symbol.toUpperCase();
    if (this.fixed[sym] && !t.custom) return this.fixed[sym];
    if (t.id === this.usdToken?.id) return 1;
    const peg = this.stable(t) ? 1 : t.btc && !t.custom && sym !== 'WBTC' ? this.btcUsd : 0;
    if (!peg && !this.plainOnly) return this.multiQuote(t);
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

  // A coin priced from several places at once (every coin that is not pegged): Ekubo straight to
  // USDC, Ekubo to STRK times STRK's price (STACHE's main pool is against STRK), DexScreener and
  // GeckoTerminal. The median of what answers, after dropping any source more than 25% away
  // from it; the probe is about $5 of the coin (by its last price), not one token.
  async multiQuote(t) {
    const got = [];
    const last = this.last.get(t.id)?.usd ?? t.hintUsd ?? 0;
    const human = last > 0 ? 5 / last : Number(PROBE[t.symbol.toUpperCase()] ?? 1);
    const amountIn = toUnits(human, t.decimals);
    const per = (out, outDec) => Number(out) / 10 ** outDec / (Number(amountIn) / 10 ** t.decimals);
    if (this.usdToken) {
      const out = await this.quoter({ tokenIn: t, tokenOut: this.usdToken, amountIn }).catch(() => 0n);
      if (out > 0n) got.push(['ekubo-usdc', per(out, this.usdToken.decimals)]);
    }
    const strk = this.tokens.find((x) => !x.custom && x.symbol.toUpperCase() === 'STRK' && x.id !== t.id);
    const strkUsd = strk ? this.last.get(strk.id)?.usd : 0;
    if (strk && strkUsd > 0) {
      const out = await this.quoter({ tokenIn: t, tokenOut: strk, amountIn }).catch(() => 0n);
      if (out > 0n) got.push(['ekubo-strk', per(out, strk.decimals) * strkUsd]);
    }
    // the sites: from this round's batch when there is one, else asked for this coin alone
    const ext = this.ext?.get(t.id) ?? { dex: await this.dexscreener([t]).then((m) => m.get(t.id)).catch(() => 0), gecko: await this.geckoterminal([t]).then((m) => m.get(t.id)).catch(() => 0) };
    if (ext.dex > 0) got.push(['dexscreener', ext.dex]);
    if (ext.gecko > 0) got.push(['geckoterminal', ext.gecko]);
    const usd = robustMedian(got.map(([, v]) => v));
    this.sources.set(t.id, got);
    if (usd > 0) this.log.log?.(`price ${t.symbol}: $${usd.toPrecision(4)} from ${got.map(([n, v]) => `${n} ${v.toPrecision(4)}`).join(', ')}`);
    else throw new Error('no source answered');
    return usd;
  }

  async getJson(url) {
    if (!this.fetch) return null;
    const res = await this.fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
    return res.ok ? res.json() : null;
  }

  // DexScreener, many coins in one call (up to 30): for each, its deepest Starknet pair as base
  async dexscreener(list) {
    const out = new Map();
    for (let i = 0; i < list.length; i += 30) {
      const part = list.slice(i, i + 30);
      const j = await this.getJson(`https://api.dexscreener.com/latest/dex/tokens/${part.map((t) => t.id).join(',')}`).catch(() => null);
      for (const t of part) {
        const pairs = (j?.pairs ?? []).filter((p) => p?.chainId === 'starknet' && sameAddr(p.baseToken?.address, t.id) && Number(p.priceUsd) > 0);
        pairs.sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0));
        if (pairs.length) out.set(t.id, Number(pairs[0].priceUsd));
      }
    }
    return out;
  }

  // GeckoTerminal, many coins in one call (up to 30): its token prices on Starknet
  async geckoterminal(list) {
    const out = new Map();
    for (let i = 0; i < list.length; i += 30) {
      const part = list.slice(i, i + 30);
      const j = await this.getJson(`https://api.geckoterminal.com/api/v2/simple/networks/starknet-alpha/token_price/${part.map((t) => t.id).join(',')}`).catch(() => null);
      const prices = j?.data?.attributes?.token_prices ?? {};
      for (const t of part) for (const [k, v] of Object.entries(prices)) if (sameAddr(k, t.id) && Number(v) > 0) out.set(t.id, Number(v));
    }
    return out;
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
    // one call per site for every coin priced by its market this round
    const market = this.tokens.filter((t) => !this.stable(t) && !(t.btc && !t.custom && t.symbol.toUpperCase() !== 'WBTC') && !(this.fixed[t.symbol.toUpperCase()] && !t.custom) && t.id !== this.usdToken?.id);
    if (market.length && this.fetch && !this.plainOnly) {
      const [dex, gecko] = await Promise.all([this.dexscreener(market).catch(() => new Map()), this.geckoterminal(market).catch(() => new Map())]);
      this.ext = new Map(market.map((t) => [t.id, { dex: dex.get(t.id) ?? 0, gecko: gecko.get(t.id) ?? 0 }]));
    }
    try {
      await this.refreshAll();
    } finally {
      this.ext = null;
    }
  }

  async refreshAll() {
    // WBTC first: the other BTC wrappers are checked against it
    const first = (t) => (t.symbol.toUpperCase() === 'WBTC' ? 2 : t.symbol.toUpperCase() === 'STRK' && !t.custom ? 1 : 0);
    const order = [...this.tokens].sort((a, b) => first(b) - first(a));
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
