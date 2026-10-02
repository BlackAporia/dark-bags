import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { MemoryWallet } from '../../shared/wallet.js';
import { MILLS } from '../../shared/assets.js';

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
const BG_SCAN_IDLE_MS = 60 * 1000;
const BG_SCAN_LIVE_MS = 5 * 60 * 1000;

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

// The pause switch is a file next to the journal: `npm run house -- pause` creates it,
// `resume` removes it. Checked at most once a second, so it works without a restart.
export function pauseFlag(file) {
  if (!file) return () => false;
  let at = 0;
  let on = false;
  return () => {
    const now = Date.now();
    if (now - at > 1000) {
      at = now;
      on = existsSync(file);
    }
    return on;
  };
}

export class CashierError extends Error {
  constructor(msg) {
    super(msg);
    this.user = true; // safe to show to the player
  }
}

export class Cashier {
  // Launch guards (all optional; see readConfig):
  //   allow          Set of addresses that may sign in and deposit (closed beta); null = anyone
  //   maxBalanceUsd  a deposit that would take a player's balance over this is held, not credited
  //   maxTotalUsd    same for everything the house owes all players together
  //   paused         () => bool: no new stakes, box buys, top-ups or swaps; cash-outs always work
  constructor({ chain, prices, data = {}, save = null, flush = null, privy = null, now = () => Date.now(), minWithdrawUsd = 1, allow = null, maxBalanceUsd = 0, maxTotalUsd = 0, paused = () => false }) {
    // a journal belongs to one network: Sepolia balances must never show up as mainnet money
    const net = chain.info().network;
    if (data.network && data.network !== net) throw new Error(`CASHIER_FILE holds a ${data.network} journal but CHAIN is ${net}. Use a separate file per network.`);
    this.allow = allow && allow.size ? allow : null;
    this.maxBalanceUsd = maxBalanceUsd;
    this.maxTotalUsd = maxTotalUsd;
    this.paused = paused;
    this.chain = chain;
    this.prices = prices;
    this.now = now;
    this.save = save; // debounced write of toJSON()
    this.flush = flush; // write now; awaited before any payout leaves
    this.privy = privy; // optional: sign-in with Privy (see ./privy.js)
    this.minWithdrawUsd = minWithdrawUsd;
    this.tokenIds = new Set(chain.tokens.map((t) => t.id));
    this.ledger = new MemoryWallet({ faucet: [], data: data.ledger ?? {}, onChange: () => this.persist() });
    this.seen = new Set(data.seen ?? []); // deposit ids already credited
    this.sessions = new Map(Object.entries(data.sessions ?? {})); // session token → { account, at }
    this.withdrawals = data.withdrawals ?? []; // journal, newest last
    this.privyWallets = data.privyWallets ?? {}; // Privy user id → { walletId, publicKey, account }
    this.deposits = data.deposits ?? []; // [{ id, account, token, amount, route, at }]
    this.imported = data.imported ?? []; // coins players brought from the AVNU / Ekubo lists
    this.logins = new Map(); // session token → { nonce, issued, at }
    this.pending = new Map(); // public deposit tx → { account, at }
    this.queue = Promise.resolve(); // withdrawals go out one at a time (house nonce)
    this.onCredit = null; // (account) => void, set by the lobby to push balances
    this.liveGame = null; // () => is a raid running? (set by the server: background scans wait)
    // a payout that was in flight when the process died needs a human, not a retry
    for (const w of this.withdrawals) if (w.status === 'sending') w.status = 'review';
  }

  info() {
    return { ...this.chain.info(), minWithdrawUsd: this.minWithdrawUsd, beta: !!this.allow, maxBalanceUsd: this.maxBalanceUsd || null, paused: this.paused() };
  }

  allowed(account) {
    return !this.allow || this.allow.has(account);
  }

  // $ value (mills) of a balance map { token: units }; null if any token has no price
  worth(bal) {
    let v = 0;
    for (const [k, u] of Object.entries(bal ?? {})) {
      if (BigInt(u) === 0n) continue;
      if (!this.prices.has(k)) return null;
      v += this.prices.value(k, BigInt(u));
    }
    return v;
  }

  // why a deposit may not be credited automatically (null = fine)
  holdReason(account, token, amount) {
    if (!this.allowed(account)) return 'not-allowed';
    if (!this.maxBalanceUsd && !this.maxTotalUsd) return null;
    if (!this.prices.has(token)) return 'no-price';
    const add = this.prices.value(token, amount);
    if (this.maxBalanceUsd) {
      const mine = this.worth(this.ledger.toJSON()[account]);
      if (mine === null || mine + add > this.maxBalanceUsd * MILLS) return 'over-limit';
    }
    if (this.maxTotalUsd) {
      const all = this.worth(this.liabilities());
      if (all === null || all + add > this.maxTotalUsd * MILLS) return 'house-limit';
    }
    return null;
  }

  toJSON() {
    return {
      network: this.chain.info().network,
      ledger: this.ledger.toJSON(),
      seen: [...this.seen],
      sessions: Object.fromEntries(this.sessions),
      withdrawals: this.withdrawals.slice(-5000),
      deposits: this.deposits.slice(-5000),
      privyWallets: this.privyWallets,
      imported: this.imported,
    };
  }

  // a token added to the chain after start (an imported coin)
  addToken(t) {
    this.tokenIds.add(t.id);
    if (!this.imported.some((x) => x.address === t.id)) this.imported.push({ address: t.id, symbol: t.symbol, name: t.name, decimals: t.decimals });
    this.persist();
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
    // plain Stark keys sign with 2-5 felts; passkey (WebAuthn) and multisig accounts with hundreds
    if (!Array.isArray(signature) || !signature.length) throw new CashierError('The wallet returned no signature.');
    if (signature.length > 2048) throw new CashierError('That signature is not one this game can check.');
    const td = loginTypedData({ chainId: this.chain.info().chainId, nonce: l.nonce, issued: l.issued });
    let ok = false;
    console.log(`login: checking ${account} (${signature.length} felts)`);
    try {
      // a stuck RPC must not leave the player waiting forever
      ok = await Promise.race([
        this.chain.verifySignature(account, td, signature.map(String)),
        new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('verify timeout'), { timeout: true })), 20000)),
      ]);
    } catch (e) {
      if (e?.timeout) throw new CashierError('Starknet did not answer in time. Try again in a minute.');
      // a fresh wallet has an address but no contract on chain yet: it can't prove a signature
      if (/contract not found|is not deployed|\b20\b.*not found|uninitialized/i.test(String(e?.message))) {
        throw new CashierError('This wallet is not activated on Starknet yet. Activate (deploy) it in the wallet, or send any transaction from it once, then sign in again.');
      }
      console.error('signature check failed', e?.message ?? e);
    }
    if (!ok) {
      console.warn(`login: signature did not verify for ${account} (${signature.length} felts)`);
      throw new CashierError('The signature did not check out. Make sure the wallet is on the right network and try again.');
    }
    if (!this.allowed(account)) throw new CashierError(`Closed beta: ${account} is not on the list yet. Send this address to the team.`);
    console.log(`login: ${account} signed in`);
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
    if (!this.allowed(w.account)) throw new CashierError(`Closed beta: ${w.account} is not on the list yet. Send this address to the team.`);
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
    const held = this.holdReason(from, token, amount);
    if (held) {
      // the money is on chain with the house but not in the game: the operator refunds it
      // (npm run house -- held), so nobody goes over the beta limits
      this.deposits.push({ id: dep.id, account: from, token, amount: amount.toString(), route, at: this.now(), held });
      this.persist();
      console.warn(`deposit ${dep.id} from ${from} held: ${held}`);
      return { account: from, token, amount, held };
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
    if (!this.chain.info().routes.includes('private')) return [];
    // A pool scan opens every note with the viewing key: seconds of CPU on one thread, and every
    // raid on the server stalls meanwhile. In the background it runs once a minute when nobody is
    // in a raid, at most every 5 minutes while one is live. A player asking for a private deposit
    // still gets a scan at once (scanPrivate from the lobby).
    const since = this.now() - (this.lastScan ?? -Infinity);
    if (since < BG_SCAN_IDLE_MS || (this.liveGame?.() && since < BG_SCAN_LIVE_MS)) return [];
    return this.scanPrivate().catch((e) => console.error('pool scan failed', e?.message ?? e));
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
    const mills = this.prices.value(token, amount);
    if (this.prices.has(token) && mills < this.minWithdrawUsd * MILLS) return Promise.reject(new CashierError(`Cash out at least $${this.minWithdrawUsd} worth.`));
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

  // has this address ever had a deposit credited? (the welcome bonus, also for the early ones)
  hasDeposited(account) {
    return !!account && this.deposits.some((d) => d.account === account && !d.unsupported && !d.held);
  }

  history(account, n = 20) {
    const pick = (l) => l.filter((x) => x.account === account).slice(-n).reverse();
    return {
      deposits: pick(this.deposits).map(({ id, token, amount, route, at, unsupported, held }) => ({ id, asset: token, units: amount, route, at, unsupported: !!unsupported, held: held ?? null })),
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
