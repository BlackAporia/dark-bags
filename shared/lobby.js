import { CFG } from './config.js';
import { RoomCore } from './room.js';
import { cleanName } from './wallet.js';
import { PriceBook } from './assets.js';

/**
 * Session + table routing shared by the WebSocket server and offline mode.
 * Message protocol (client → lobby):
 *   hello {token?, name}  tables  faucet  join {stake, name, skin} (enter a table's ready room)
 *   ready {name, skin} (escrow the stake)  unready  leave
 *   in {s, mx, my, a, f, d}  bluff {v}  ping {c}
 * With a cashier (real tokens), the balance belongs to a Starknet address instead of the session:
 *   auth_start → auth_challenge {typedData}   auth {address, signature} → authed {account}
 *   auth_privy {token} → authed {account, privy: {walletId, publicKey}}
 *   logout   deposit {route, tx}   withdraw {asset, units, route}   history
 */
export class Lobby {
  constructor({ wallet, send, newToken, cashier = null, prices = new PriceBook(), bots = true, roundSeconds = CFG.ROUND_SECONDS, prepSeconds = CFG.PREP_SECONDS, tiers = CFG.TIERS }) {
    this.cashier = cashier;
    if (cashier) {
      wallet = cashier.ledger;
      prices = cashier.prices;
      cashier.onCredit = (account) => this.pushBalance(account);
    }
    this.wallet = wallet;
    this.prices = prices;
    this.send = send;
    this.newToken = newToken;
    this.sessions = new Map();
    this.rooms = new Map(tiers.map((stake) => [stake, new RoomCore({ stake, wallet, send, prices, bots, roundSeconds, prepSeconds })]));
    this.roundSeconds = roundSeconds;
  }

  tables() {
    return [...this.rooms.values()].map((r) => r.info());
  }

  connect(cid) {
    this.sessions.set(cid, { token: null, account: null, name: 'runner', room: null, busy: false });
  }

  // whose balance this session plays with: the session itself (test sats) or a signed-in address
  key(s) {
    return this.cashier ? s.account : s.token;
  }

  balances(s) {
    const k = this.key(s);
    return k ? this.wallet.balances(k) : {};
  }

  pushBalance(account) {
    for (const [cid, s] of this.sessions) if (s.account === account) this.send(cid, { t: 'balance', balances: this.balances(s) });
  }

  disconnect(cid) {
    const s = this.sessions.get(cid);
    if (s?.room) s.room.removeClient(cid);
    this.sessions.delete(cid);
  }

  handle(cid, msg) {
    const s = this.sessions.get(cid);
    if (!s || !msg || typeof msg.t !== 'string') return;

    if (msg.t === 'hello') {
      s.token = typeof msg.token === 'string' && /^[a-z0-9]{8,64}$/.test(msg.token) ? msg.token : this.newToken();
      s.name = cleanName(msg.name);
      if (this.cashier) s.account = this.cashier.accountFor(s.token);
      else this.wallet.ensure(s.token);
      this.send(cid, {
        t: 'welcome',
        token: s.token,
        balances: this.balances(s),
        tables: this.tables(),
        assets: this.prices.list(),
        chain: this.cashier ? this.cashier.info() : null,
        account: s.account,
        privy: this.cashier?.privyFor(s.token) ?? null,
        cfg: {
          ROUND_SECONDS: this.roundSeconds,
          RAKE: CFG.RAKE,
          BAG_SHARE: CFG.BAG_SHARE,
          TIERS: [...this.rooms.keys()],
        },
      });
      return;
    }
    if (!s.token) return;

    switch (msg.t) {
      case 'ping':
        this.send(cid, { t: 'pong', c: msg.c });
        return;
      case 'tables':
        this.send(cid, { t: 'tables', tables: this.tables(), balances: this.balances(s), assets: this.prices.list() });
        return;
      case 'faucet':
        if (this.cashier) return;
        this.wallet.faucet(s.token);
        this.send(cid, { t: 'balance', balances: this.balances(s) });
        return;
      case 'auth_start':
      case 'auth':
      case 'auth_privy':
      case 'logout':
      case 'deposit':
      case 'withdraw':
      case 'history':
        if (this.cashier) this.cashierOp(cid, s, msg);
        return;
      case 'join': {
        const room = this.rooms.get(Number(msg.stake));
        if (!room) return;
        if (!this.key(s)) {
          this.send(cid, { t: 'err', msg: 'Connect a wallet first.' });
          return;
        }
        if (s.room && s.room !== room) {
          s.room.removeClient(cid);
          s.room = null;
        }
        if (!s.room) {
          room.addClient(cid, { token: this.key(s), name: msg.name || s.name, skin: msg.skin });
          s.room = room;
        } else room.handle(cid, msg);
        return;
      }
      case 'leave':
        if (s.room) s.room.removeClient(cid);
        s.room = null;
        this.send(cid, { t: 'tables', tables: this.tables(), balances: this.balances(s) });
        return;
      default:
        if (s.room) s.room.handle(cid, msg);
    }
  }

  // Real-token operations are async (signature checks, RPC, proving). One at a time per session.
  async cashierOp(cid, s, msg) {
    const c = this.cashier;
    const alive = () => this.sessions.get(cid) === s;
    const reply = (m) => alive() && this.send(cid, m);
    if (msg.t === 'auth_start') {
      if (s.room) return reply({ t: 'err', msg: 'Leave the table to switch wallets.' });
      return reply({ t: 'auth_challenge', typedData: c.challenge(s.token) });
    }
    if (msg.t === 'logout') {
      if (s.room) return reply({ t: 'err', msg: 'Leave the table to sign out.' });
      c.logout(s.token);
      s.account = null;
      return reply({ t: 'authed', account: null, balances: {} });
    }
    if (msg.t !== 'auth' && msg.t !== 'auth_privy' && !s.account) return reply({ t: 'err', msg: 'Connect a wallet first.' });
    if (msg.t === 'history') return reply({ t: 'history', ...c.history(s.account) });
    if (s.busy) return reply({ t: 'err', msg: 'One moment, the cashier is still on your last request.' });
    s.busy = true;
    try {
      if (msg.t === 'auth') {
        if (s.room) throw Object.assign(new Error('Leave the table to switch wallets.'), { user: true });
        const account = await c.login(s.token, msg.address, msg.signature);
        if (!alive()) return;
        s.account = account;
        reply({ t: 'authed', account, balances: this.balances(s) });
      } else if (msg.t === 'auth_privy') {
        if (s.room) throw Object.assign(new Error('Leave the table to switch wallets.'), { user: true });
        const r = await c.loginPrivy(s.token, String(msg.token ?? ''));
        if (!alive()) return;
        s.account = r.account;
        reply({ t: 'authed', account: r.account, privy: r.wallet, balances: this.balances(s) });
      } else if (msg.t === 'deposit') {
        reply({ t: 'cashier', op: 'deposit', status: 'checking' });
        let r;
        if (msg.route === 'private') r = { status: 'ok', credited: (await c.scanPrivate()).filter((x) => x.account === s.account) };
        else r = await c.depositPublic(s.account, msg.tx);
        reply({ t: 'cashier', op: 'deposit', route: msg.route, status: r.status, credited: r.credited.map((x) => ({ asset: x.token, units: x.amount.toString(), unsupported: !!x.unsupported })) });
        reply({ t: 'balance', balances: this.balances(s) });
      } else if (msg.t === 'withdraw') {
        const route = msg.route === 'private' ? 'private' : 'public';
        reply({ t: 'cashier', op: 'withdraw', status: 'sending' });
        reply({ t: 'balance', balances: this.balances(s) });
        const w = await c.withdraw(s.account, { asset: msg.asset, units: msg.units, route });
        reply({ t: 'cashier', op: 'withdraw', route, status: w.status, tx: w.tx ?? null, asset: w.token, units: w.amount });
        reply({ t: 'balance', balances: this.balances(s) });
      }
    } catch (e) {
      if (!e?.user) console.error(`cashier ${msg.t} failed`, e);
      reply({ t: 'err', msg: e?.user ? e.message : 'The cashier hit an error. Nothing was lost; try again in a minute.' });
      reply({ t: 'balance', balances: this.balances(s) });
    } finally {
      s.busy = false;
    }
  }

  tick() {
    for (const r of this.rooms.values()) r.tick();
  }

  // periodic refresh for people browsing tables
  broadcastTables() {
    const t = this.tables();
    for (const [cid, s] of this.sessions) {
      if (s.token && !s.room) this.send(cid, { t: 'tables', tables: t, balances: this.balances(s), assets: this.cashier ? this.prices.list() : undefined });
    }
  }
}
