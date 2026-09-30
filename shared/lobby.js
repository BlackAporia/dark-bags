import { CFG } from './config.js';
import { RoomCore } from './room.js';
import { cleanName } from './wallet.js';
import { PriceBook, isStable } from './assets.js';
import { RankBook } from './ranks.js';
import { MODES, MODE } from './modes.js';
import { Inventory, OUTFITS, BOXES, RARITIES, PITY, PACKS, FINISHES, MAX_OPEN } from './cosmetics.js';

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
const PAUSABLE = new Set(['ready', 'box', 'topup', 'swap']);

export class Lobby {
  constructor({ wallet, send, newToken, cashier = null, prices = new PriceBook(), ranks = new RankBook(), inventory = new Inventory(), practice = false, bots = true, roundSeconds = CFG.ROUND_SECONDS, prepSeconds = CFG.PREP_SECONDS, tiers = CFG.TIERS, swap = !cashier, now = () => Date.now(), waitForStart = false }) {
    // in-game swaps between the coins you hold, at the feed price minus SWAP_FEE. With real
    // tokens this only runs when the operator turns it on (the house must rebalance on chain).
    this.swapOn = swap;
    this.now = now;
    this.chat = []; // the last CHAT_KEEP lobby messages
    this.cashier = cashier;
    if (cashier) {
      wallet = cashier.ledger;
      prices = cashier.prices;
      cashier.onCredit = (account) => this.pushBalance(account);
    }
    this.wallet = wallet;
    this.prices = prices;
    this.ranks = ranks;
    this.inventory = inventory;
    this.practice = practice;
    this.send = send;
    this.newToken = newToken;
    this.sessions = new Map();
    // one table per mode and stake
    this.rooms = new Map();
    for (const m of MODES) for (const stake of tiers) this.rooms.set(`${m.id}:${stake}`, new RoomCore({ stake, mode: m.id, wallet, send, prices, ranks, inventory, practice, bots, roundSeconds, prepSeconds, waitForStart }));
    this.tiers = tiers;
    this.roundSeconds = roundSeconds;
  }

  tables() {
    return [...this.rooms.values()].map((r) => r.info());
  }

  // people connected right now (every signed session, in a raid or browsing)
  online() {
    let n = 0;
    for (const s of this.sessions.values()) if (s.token) n++;
    return n;
  }

  // Ping: every couple of seconds the server stamps a probe with its own clock and the
  // client echoes it straight back. Only the latest stamp counts, so a client can make its
  // ping look worse (by waiting) but never better. The value is shown to everyone in a raid.
  probe() {
    const now = this.now();
    for (const [cid, s] of this.sessions) {
      if (!s.token) continue;
      s.probeAt = now;
      this.send(cid, { t: 'probe', s: now });
    }
  }

  connect(cid) {
    this.sessions.set(cid, { token: null, account: null, name: 'runner', room: null, busy: false });
  }

  // whose balance this session plays with: the session itself (play money) or a signed-in address
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
        online: this.online(),
        assets: this.prices.list(),
        rank: this.key(s) ? this.ranks.get(this.key(s)) : null,
        career: this.key(s) ? this.ranks.career(this.key(s)) : null,
        locker: this.key(s) ? this.inventory.view(this.key(s)) : null,
        catalog: { outfits: OUTFITS, finishes: FINISHES, boxes: BOXES, rarities: RARITIES, pity: PITY, packs: PACKS, maxOpen: MAX_OPEN },
        practice: this.practice,
        swap: this.swapOn ? { fee: CFG.SWAP_FEE } : null,
        chat: this.chat,
        chain: this.cashier ? this.cashier.info() : null,
        account: s.account,
        privy: this.cashier?.privyFor(s.token) ?? null,
        cfg: {
          ROUND_SECONDS: this.roundSeconds,
          RAKE: CFG.RAKE,
          BAG_SHARE: CFG.BAG_SHARE,
          TIERS: this.tiers,
          MODES,
        },
      });
      return;
    }
    if (!s.token) return;
    // the operator's pause switch (real money): nothing new goes in; cash-outs stay open
    if (this.cashier?.paused() && PAUSABLE.has(msg.t)) {
      this.send(cid, { t: 'err', msg: 'Paused for maintenance: new stakes and purchases are off for a moment. Your balance is safe and cash-outs work.' });
      return;
    }

    switch (msg.t) {
      case 'probe': {
        if (s.probeAt == null || msg.s !== s.probeAt) break;
        const rtt = Math.max(0, Math.min(9999, this.now() - s.probeAt));
        s.probeAt = null;
        s.ping = s.ping == null ? Math.round(rtt) : Math.round(s.ping * 0.6 + rtt * 0.4);
        s.room?.setPing?.(cid, s.ping);
        this.send(cid, { t: 'ping', ms: s.ping });
        break;
      }
      case 'ping':
        this.send(cid, { t: 'pong', c: msg.c });
        return;
      case 'tables':
        this.send(cid, { t: 'tables', tables: this.tables(), balances: this.balances(s), assets: this.prices.list() });
        return;
      case 'title': {
        const k = this.key(s);
        if (!k) return;
        if (!this.ranks.setTitle(k, msg.id === null ? null : String(msg.id ?? ''))) return this.send(cid, { t: 'err', msg: 'Unlock that achievement first.' });
        this.send(cid, { t: 'career', career: this.ranks.career(k) });
        return;
      }
      case 'swap':
        this.swap(cid, s, msg);
        return;
      case 'chat':
        this.say(cid, s, msg);
        return;
      case 'practice_cfg':
        // practice only: bot difficulty, how many runners, raid length. Applies from the next raid.
        if (!this.practice) return;
        for (const r of this.rooms.values()) {
          if (['easy', 'normal', 'hard'].includes(msg.difficulty)) r.difficulty = msg.difficulty;
          if (MODE[r.mode].kind === 'team' || r.mode === 'duel') continue; // fixed line-ups
          const n = Math.round(Number(msg.runners));
          if (n >= 2 && n <= 20) {
            r.botFill = n;
            if (r.state === 'prep') r.openPrep(); // re-roll the lineup
          }
          const secs = Math.round(Number(msg.seconds));
          if (secs >= 60 && secs <= 600) r.roundSeconds = secs;
        }
        return;
      case 'faucet':
        if (this.cashier) return;
        this.wallet.faucet(s.token);
        this.send(cid, { t: 'balance', balances: this.balances(s) });
        return;
      case 'equip':
      case 'wequip':
      case 'body':
      case 'box':
      case 'topup':
        this.lockerOp(cid, s, msg);
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
        const room = this.rooms.get(`${MODE[msg.mode] ? msg.mode : 'raid'}:${Number(msg.stake)}`);
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

  // Swap one coin you hold for another at the feed price, minus the fee (the house's spread).
  swap(cid, s, msg) {
    const key = this.key(s);
    const err = (m) => this.send(cid, { t: 'err', msg: m });
    if (!key) return err('Sign in first.');
    if (!this.swapOn) return err('In-game swaps are off here. Swap in your wallet with AVNU instead.');
    if (s.room && s.room.inRaid?.(s.room.clients.get(cid))) return err('Finish the raid first.');
    const from = String(msg.from ?? '');
    const to = String(msg.to ?? '');
    let units;
    try {
      units = BigInt(msg.units);
    } catch {
      return err('Bad amount.');
    }
    if (from === to || units <= 0n || !this.prices.has(from) || !this.prices.has(to)) return err('Pick two different coins with a price.');
    const mills = this.prices.value(from, units);
    const net = Math.floor(mills * (1 - CFG.SWAP_FEE));
    const out = this.prices.unitsFor(to, net);
    if (!out || out <= 0n || mills < CFG.SWAP_MIN) return err('That swap is too small.');
    if (!this.wallet.debit(key, from, units)) return err('Not enough balance.');
    this.wallet.credit(key, to, out);
    this.send(cid, { t: 'swapped', from, to, units: units.toString(), out: out.toString(), mills, fee: mills - net, balances: this.balances(s) });
  }

  // Lobby chat: short, plain text, rate limited; everyone in the lobby sees it.
  say(cid, s, msg) {
    const text = String(msg.text ?? '')
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, CFG.CHAT_MAX);
    if (!text) return;
    const now = this.now();
    if (now - (s.lastChat ?? 0) < CFG.CHAT_GAP_MS) return this.send(cid, { t: 'err', msg: 'Slow down a little.' });
    s.lastChat = now;
    const key = this.key(s);
    const m = { n: cleanName(msg.name || s.name), text, at: now, rk: key ? this.ranks.get(key).rank : 1, tt: key ? this.ranks.title(key) : null };
    this.chat.push(m);
    if (this.chat.length > CFG.CHAT_KEEP) this.chat.splice(0, this.chat.length - CFG.CHAT_KEEP);
    for (const [c, x] of this.sessions) if (x.token) this.send(c, { t: 'chat', m });
  }

  // Locker: cosmetics bought with shop $. The server rolls every box.
  lockerOp(cid, s, msg) {
    const key = this.key(s);
    if (!key) return this.send(cid, { t: 'err', msg: 'Sign in first.' });
    const inv = this.inventory;
    const id = String(msg.id ?? '');
    const pay = this.stablePay(key);
    const r =
      msg.t === 'equip' ? inv.equip(key, id)
      : msg.t === 'body' ? inv.setBody(key, id)
      : msg.t === 'wequip' ? inv.equipWeapon(key, id)
      : msg.t === 'topup' ? inv.topUp(key, id, pay)
      : inv.open(key, id, pay, msg.n);
    if (!r.ok) return this.send(cid, { t: 'err', msg: r.error });
    this.send(cid, { t: 'locker', op: msg.t, result: r, locker: inv.view(key), balances: this.balances(s) });
    if (s.room && (msg.t === 'equip' || msg.t === 'body' || msg.t === 'wequip')) s.room.broadcastPrep();
  }

  // Shop $ is bought 1:1 with USDC or USDT (play-money test tokens without a cashier)
  stablePay(key) {
    return (cents) => {
      for (const a of this.prices.list()) {
        if (!isStable(a) || a.decimals < 2) continue;
        const units = BigInt(cents) * 10n ** BigInt(a.decimals - 2);
        if (this.wallet.debit(key, a.id, units)) return true;
      }
      return false;
    };
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
        reply({ t: 'authed', account, balances: this.balances(s), rank: this.ranks.get(account), career: this.ranks.career(account), locker: this.inventory.view(account) });
      } else if (msg.t === 'auth_privy') {
        if (s.room) throw Object.assign(new Error('Leave the table to switch wallets.'), { user: true });
        const r = await c.loginPrivy(s.token, String(msg.token ?? ''));
        if (!alive()) return;
        s.account = r.account;
        reply({ t: 'authed', account: r.account, privy: r.wallet, balances: this.balances(s), rank: this.ranks.get(r.account), career: this.ranks.career(r.account), locker: this.inventory.view(r.account) });
      } else if (msg.t === 'deposit') {
        reply({ t: 'cashier', op: 'deposit', status: 'checking' });
        let r;
        if (msg.route === 'private') r = { status: 'ok', credited: (await c.scanPrivate()).filter((x) => x.account === s.account) };
        else r = await c.depositPublic(s.account, msg.tx);
        reply({ t: 'cashier', op: 'deposit', route: msg.route, status: r.status, credited: r.credited.map((x) => ({ asset: x.token, units: x.amount.toString(), unsupported: !!x.unsupported, held: x.held ?? null })) });
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
    const online = this.online();
    for (const [cid, s] of this.sessions) {
      if (s.token && !s.room) this.send(cid, { t: 'tables', tables: t, online, balances: this.balances(s), assets: this.cashier ? this.prices.list() : undefined });
    }
  }
}
