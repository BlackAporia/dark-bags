import { TEST_ASSETS } from './assets.js';

/**
 * Test-mode wallet: fake balances in several tokens, kept in memory.
 * A real deployment swaps this for an adapter with the same methods
 * (see server/strk20/cashier.js): balances are per player, per asset, in
 * BigInt base units.
 */
export class MemoryWallet {
  constructor({ faucet = TEST_ASSETS, data = {}, onChange = null } = {}) {
    this.faucetBasket = Object.fromEntries(faucet.filter((a) => a.faucet).map((a) => [a.id, BigInt(a.faucet)]));
    this.accounts = new Map();
    for (const [token, bal] of Object.entries(data)) {
      const m = typeof bal === 'object' && bal ? { ...bal } : { SATS: String(bal) };
      // saves from before the game went all-dollar held play "sats" (1,000 = $1): now test USDC
      if (m.SATS !== undefined) {
        m.USDC = (BigInt(m.USDC ?? 0) + BigInt(m.SATS) * 1000n).toString();
        delete m.SATS;
      }
      this.accounts.set(token, new Map(Object.entries(m).map(([k, v]) => [k, BigInt(v)])));
    }
    this.onChange = onChange;
  }

  changed() {
    if (this.onChange) this.onChange(this);
  }

  ensure(token) {
    if (!this.accounts.has(token)) {
      this.accounts.set(token, new Map(Object.entries(this.faucetBasket)));
      this.changed();
      return;
    }
    // accounts from before a token existed get that token's starting amount once
    const acct = this.accounts.get(token);
    let added = false;
    for (const [k, v] of Object.entries(this.faucetBasket)) {
      if (!acct.has(k)) {
        acct.set(k, v);
        added = true;
      }
    }
    if (added) this.changed();
  }

  balance(token, asset) {
    return this.accounts.get(token)?.get(asset) ?? 0n;
  }

  // { asset: "units" } for the wire
  balances(token) {
    const out = {};
    for (const [k, v] of this.accounts.get(token) ?? []) if (v > 0n) out[k] = v.toString();
    return out;
  }

  debit(token, asset, units) {
    units = BigInt(units);
    const acct = this.accounts.get(token);
    const b = acct?.get(asset) ?? 0n;
    if (units <= 0n || b < units) return false;
    acct.set(asset, b - units);
    this.changed();
    return true;
  }

  credit(token, asset, units) {
    units = BigInt(units);
    if (units < 0n) return;
    if (!this.accounts.has(token)) this.accounts.set(token, new Map());
    const acct = this.accounts.get(token);
    acct.set(asset, (acct.get(asset) ?? 0n) + units);
    this.changed();
  }

  // test faucet: top every test token back up
  faucet(token) {
    const acct = this.accounts.get(token) ?? new Map();
    for (const [k, v] of Object.entries(this.faucetBasket)) if ((acct.get(k) ?? 0n) < v) acct.set(k, v);
    this.accounts.set(token, acct);
    this.changed();
    return true;
  }

  toJSON() {
    const out = {};
    for (const [token, m] of this.accounts) out[token] = Object.fromEntries([...m].map(([k, v]) => [k, v.toString()]));
    return out;
  }
}

export function cleanName(s) {
  const n = String(s ?? '')
    .replace(/[^\p{L}\p{N}_\-. ]/gu, '')
    .trim()
    .slice(0, 16);
  return n || 'runner';
}
