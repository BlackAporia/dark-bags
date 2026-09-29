import crypto from 'node:crypto';
import { MemoryWallet } from '../../shared/wallet.js';

/**
 * The cashier for real tokens. Chain-agnostic: everything that touches Starknet
 * lives behind `chain` (see ./starknet.js), so this file can be tested with a fake.
 *
 * Money model (custodial, like a casino cage):
 *   - a player is a Starknet address, proven by signing a SNIP-12 login message
 *   - deposits: the player sends tokens to the house address, either privately
 *     inside the STRK20 pool (the house discovers the note and its sender) or as
 *     a plain public transfer (the house reads the Transfer event); each deposit
 *     is credited once, always to the address that sent it
 *   - the in-game balance is a ledger (MemoryWallet API) keyed by that address;
 *     rooms escrow stakes from it and pay extractions back into it
 *   - withdrawals debit the ledger first, then the house pays out; a payout that
 *     may have reached the chain is never refunded automatically (no double pay)
 *
 * chain = {
 *   info(): { network, chainId, house, pool, routes, paymaster, rpcUrl, explorer, tokens }
 *   tokens: [{ id, symbol, decimals, color }]            id = normalized token address
 *   verifySignature(address, typedData, signature) → Promise<boolean>
 *   readPublicDeposit(tx) → Promise<{ status: 'pending'|'ok'|'failed', transfers: [{ id, token, from, amount }] }>
 *   scanPrivateDeposits() → Promise<[{ id, token, from, amount }]>   (may repeat old notes)
 *   payPublic({ token, to, amount }) → Promise<{ tx }>
 *   payPrivate({ token, to, amount }) → Promise<{ tx }>
 * }
 * A payX error with `notSent: true` means nothing was submitted, so the debit is refunded.
 */

const MAX_FELT = 2n ** 251n;
const LOGIN_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;
const PENDING_PER_ACCOUNT = 5;
const PENDING_TOTAL = 1000;
const SCAN_EVERY_MS = 10 * 1000;

export function normAddr(x) {
  let v;
  try {
    v = BigInt(x);
  } catch {
    return null;
  }
  if (v <= 0n || v >= MAX_FELT) return null;
  return `0x${v.toString(16).padStart(64, '0')}`;
}

export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

export function loginTypedData({ chainId, nonce, issued }) {
  return {
    types: {
      StarknetDomain: [
        { name: 'name', type: 'shortstring' },
        { name: 'version', type: 'shortstring' },
        { name: 'chainId', type: 'shortstring' },
        { name: 'revision', type: 'shortstring' },
      ],
      Login: [
        { name: 'action', type: 'shortstring' },
        { name: 'nonce', type: 'felt' },
        { name: 'issued', type: 'timestamp' },
      ],
    },
    primaryType: 'Login',
    domain: { name: 'DARK BAGS', version: '1', chainId, revision: '1' },
    message: { action: 'Sign in to DARK BAGS', nonce, issued },
  };
}

export class CashierError extends Error {
  constructor(msg) {
    super(msg);
    this.user = true; // safe to show to the player
  }
}

export class Cashier {
  constructor({ chain, prices, data = {}, save = null, flush = null, privy = null, now = () => Date.now(), minWithdrawSats = 100 }) {
    this.chain = chain;
    this.prices = prices;
    this.now = now;
    this.save = save; // debounced write of toJSON()
    this.flush = flush; // write now; awaited before any payout leaves
    this.privy = privy; // optional: sign-in with Privy (see ./privy.js)
    this.minWithdrawSats = minWithdrawSats;
    this.tokenIds = new Set(chain.tokens.map((t) => t.id));
    this.ledger = new MemoryWallet({ faucet: [], data: data.ledger ?? {}, onChange: () => this.persist() });
    this.seen = new Set(data.seen ?? []); // deposit ids already credited
    this.sessions = new Map(Object.entries(data.sessions ?? {})); // session token → { account, at }
    this.withdrawals = data.withdrawals ?? []; // journal, newest last
    this.privyWallets = data.privyWallets ?? {}; // Privy user id → { walletId, publicKey, account }
    this.deposits = data.deposits ?? []; // [{ id, account, token, amount, route, at }]
    this.logins = new Map(); // session token → { nonce, issued, at }
    this.pending = new Map(); // public deposit tx → { account, at }
    this.queue = Promise.resolve(); // withdrawals go out one at a time (house nonce)
    this.onCredit = null; // (account) => void, set by the lobby to push balances
    // a payout that was in flight when the process died needs a human, not a retry
    for (const w of this.withdrawals) if (w.status === 'sending') w.status = 'review';
  }

  info() {
    return { ...this.chain.info(), minWithdrawSats: this.minWithdrawSats };
  }

  toJSON() {
    return {
      ledger: this.ledger.toJSON(),
      seen: [...this.seen],
      sessions: Object.fromEntries(this.sessions),
      withdrawals: this.withdrawals.slice(-5000),
      deposits: this.deposits.slice(-5000),
      privyWallets: this.privyWallets,
    };
  }

  persist() {
    if (this.save) this.save(this);
  }

  // ---------------------------------------------------------------- login

  accountFor(session) {
    const s = session && this.sessions.get(session);
    if (!s) return null;
    if (this.now() - s.at > SESSION_TTL_MS) {
      this.sessions.delete(session);
      return null;
    }
    return s.account;
  }

  challenge(session) {
    const nonce = `0x${crypto.randomBytes(30).toString('hex')}`;
    const issued = Math.floor(this.now() / 1000);
    this.logins.set(session, { nonce, issued, at: this.now() });
    return loginTypedData({ chainId: this.chain.info().chainId, nonce, issued });
  }

  async login(session, address, signature) {
    const l = this.logins.get(session);
    this.logins.delete(session); // one attempt per challenge
    if (!l || this.now() - l.at > LOGIN_TTL_MS) throw new CashierError('The sign-in request expired. Try again.');
    const account = normAddr(address);
    if (!account) throw new CashierError('That is not a Starknet address.');
    if (!Array.isArray(signature) || !signature.length || signature.length > 64) throw new CashierError('The wallet returned no signature.');
    const td = loginTypedData({ chainId: this.chain.info().chainId, nonce: l.nonce, issued: l.issued });
    let ok = false;
    try {
      ok = await this.chain.verifySignature(account, td, signature.map(String));
    } catch (e) {
      console.error('signature check failed', e?.message ?? e);
    }
    if (!ok) throw new CashierError('The signature did not check out. Is the account deployed?');
    this.sessions.set(session, { account, at: this.now() });
    this.ledger.ensure(account);
    this.persist();
    return account;
  }

  // Privy: the access token proves the user; the house holds their Starknet signer
  // in Privy, so the address is derived, not signed for.
  async loginPrivy(session, accessToken) {
    if (!this.privy) throw new CashierError('Privy sign-in is off on this server.');
    const userId = await this.privy.verify(accessToken).catch(() => null);
    if (!userId) throw new CashierError('Privy session expired. Sign in again.');
    let w = this.privyWallets[userId];
    if (!w) {
      w = await this.privy.createWallet(userId);
      this.privyWallets[userId] = w;
    }
    this.sessions.set(session, { account: w.account, at: this.now(), privy: userId });
    this.ledger.ensure(w.account);
    this.persist();
    return { account: w.account, wallet: { walletId: w.walletId, publicKey: w.publicKey } };
  }

  // the Privy wallet behind a session, so the browser can drive it again after a reload
  privyFor(session) {
    const s = session && this.sessions.get(session);
    const w = s?.privy ? this.privyWallets[s.privy] : null;
    return w ? { walletId: w.walletId, publicKey: w.publicKey } : null;
  }

  privyWalletOf(userId) {
    return this.privyWallets[userId] ?? null;
  }

  logout(session) {
    this.sessions.delete(session);
    this.persist();
  }

  // ------------------------------------------------------------- deposits

  credit(dep, route) {
    if (this.seen.has(dep.id)) return null;
    const from = normAddr(dep.from);
    const token = normAddr(dep.token);
    const amount = BigInt(dep.amount);
    if (!from || !token || amount <= 0n) return null;
    this.seen.add(dep.id);
    if (!this.tokenIds.has(token)) {
      // not a token we price; keep a record so the operator can send it back
      this.deposits.push({ id: dep.id, account: from, token, amount: amount.toString(), route, at: this.now(), unsupported: true });
      this.persist();
      return { account: from, token, amount, unsupported: true };
    }
    this.ledger.credit(from, token, amount);
    this.deposits.push({ id: dep.id, account: from, token, amount: amount.toString(), route, at: this.now() });
    this.persist();
    this.onCredit?.(from);
    return { account: from, token, amount };
  }

  // A public transfer to the house: the client tells us the tx hash right after sending.
  async depositPublic(account, tx) {
    const hash = normAddr(tx);
    if (!hash) throw new CashierError('That is not a transaction hash.');
    const r = await this.chain.readPublicDeposit(hash);
    if (r.status === 'pending') {
      if (!this.pending.has(hash)) {
        // bounded: every pending hash costs an RPC call per poll
        const mine = [...this.pending.values()].filter((p) => p.account === account).length;
        if (mine >= PENDING_PER_ACCOUNT || this.pending.size >= PENDING_TOTAL) throw new CashierError('Too many deposits waiting for Starknet. Try again in a few minutes.');
        this.pending.set(hash, { account, at: this.now() });
      }
      return { status: 'pending', credited: [] };
    }
    this.pending.delete(hash);
    if (r.status === 'failed') return { status: 'failed', credited: [] };
    const credited = [];
    for (const t of r.transfers) {
      const c = this.credit(t, 'public');
      if (c) credited.push(c);
    }
    return { status: 'ok', credited };
  }

  // Private transfers into the house's STRK20 notes, attributed by note sender.
  // Concurrent callers share one scan, and scans run at most every SCAN_EVERY_MS.
  scanPrivate() {
    if (this.scanning) return this.scanning;
    const wait = Math.max(0, (this.lastScan ?? -Infinity) + SCAN_EVERY_MS - this.now());
    this.scanning = new Promise((r) => (wait ? setTimeout(r, wait) : r()))
      .then(() => this.scanOnce())
      .finally(() => {
        this.lastScan = this.now();
        this.scanning = null;
      });
    return this.scanning;
  }

  async scanOnce() {
    const found = await this.chain.scanPrivateDeposits();
    const credited = [];
    for (const n of found) {
      const c = this.credit(n, 'private');
      if (c) credited.push(c);
    }
    return credited;
  }

  // Background: re-check public deposits still pending, scan the pool.
  async poll() {
    for (const [tx, p] of [...this.pending]) {
      if (this.now() - p.at > PENDING_TTL_MS) {
        this.pending.delete(tx);
        continue;
      }
      await this.depositPublic(p.account, tx).catch(() => {});
    }
    if (this.chain.info().routes.includes('private')) return this.scanPrivate().catch((e) => console.error('pool scan failed', e?.message ?? e));
    return [];
  }

  // ------------------------------------------------------------ withdrawals

  withdraw(account, { asset, units, route }) {
    const token = normAddr(asset);
    if (!token || !this.tokenIds.has(token)) return Promise.reject(new CashierError('Unknown token.'));
    if (!this.chain.info().routes.includes(route)) return Promise.reject(new CashierError('That cash-out route is off on this server.'));
    let amount;
    try {
      amount = BigInt(units);
    } catch {
      return Promise.reject(new CashierError('Bad amount.'));
    }
    if (amount <= 0n) return Promise.reject(new CashierError('Bad amount.'));
    const sats = this.prices.value(token, amount);
    if (this.prices.has(token) && sats < this.minWithdrawSats) return Promise.reject(new CashierError(`Cash out at least ${this.minWithdrawSats} sats worth.`));
    if (!this.ledger.debit(account, token, amount)) return Promise.reject(new CashierError('Not enough balance.'));

    const w = { id: crypto.randomUUID(), account, token, amount: amount.toString(), route, to: account, status: 'sending', at: this.now() };
    this.withdrawals.push(w);
    this.persist();
    const run = async () => {
      try {
        await this.flush?.(); // the 'sending' entry is on disk before anything is signed
        const pay = route === 'private' ? this.chain.payPrivate : this.chain.payPublic;
        const r = await pay.call(this.chain, { token, to: account, amount });
        w.status = 'sent';
        w.tx = r.tx;
      } catch (e) {
        w.err = String(e?.message ?? e).slice(0, 300);
        if (e?.notSent) {
          w.status = 'failed';
          this.ledger.credit(account, token, amount);
        } else w.status = 'review';
        console.error(`withdrawal ${w.id} ${w.status}:`, w.err);
      }
      this.persist();
      return w;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  history(account, n = 20) {
    const pick = (l) => l.filter((x) => x.account === account).slice(-n).reverse();
    return {
      deposits: pick(this.deposits).map(({ id, token, amount, route, at, unsupported }) => ({ id, asset: token, units: amount, route, at, unsupported: !!unsupported })),
      withdrawals: pick(this.withdrawals).map(({ id, token, amount, route, status, tx, at }) => ({ id, asset: token, units: amount, route, status, tx, at })),
    };
  }

  // What the house owes players right now (ledger only; stakes in live raids are on top).
  liabilities() {
    const out = {};
    for (const bal of Object.values(this.ledger.toJSON())) for (const [k, v] of Object.entries(bal)) out[k] = (BigInt(out[k] ?? 0) + BigInt(v)).toString();
    return out;
  }
}
