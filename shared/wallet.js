import { CFG } from './config.js';

/**
 * Test-mode wallet: fake sats in memory. Real deployments swap this for an
 * adapter with the same four methods (Lightning, Starknet BTC, ...), see README.
 */
export class MemoryWallet {
  constructor({ start = CFG.START_BALANCE, data = {}, onChange = null } = {}) {
    this.start = start;
    this.accounts = new Map(Object.entries(data));
    this.onChange = onChange;
  }

  changed() {
    if (this.onChange) this.onChange(this);
  }

  ensure(token) {
    if (!this.accounts.has(token)) {
      this.accounts.set(token, this.start);
      this.changed();
    }
  }

  balance(token) {
    return this.accounts.get(token) ?? 0;
  }

  debit(token, amount) {
    const b = this.balance(token);
    if (!Number.isInteger(amount) || amount <= 0 || b < amount) return false;
    this.accounts.set(token, b - amount);
    this.changed();
    return true;
  }

  credit(token, amount) {
    if (!Number.isInteger(amount) || amount < 0) return;
    this.accounts.set(token, this.balance(token) + amount);
    this.changed();
  }

  // test faucet: top back up when you can't afford the smallest table
  faucet(token) {
    if (this.balance(token) >= Math.min(...CFG.TIERS)) return false;
    this.accounts.set(token, this.start);
    this.changed();
    return true;
  }

  toJSON() {
    return Object.fromEntries(this.accounts);
  }
}

export function cleanName(s) {
  const n = String(s ?? '')
    .replace(/[^\p{L}\p{N}_\-. ]/gu, '')
    .trim()
    .slice(0, 16);
  return n || 'runner';
}
