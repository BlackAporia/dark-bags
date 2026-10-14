import { CFG } from './config.js';
import { RoomCore } from './room.js';
import { cleanName } from './wallet.js';
import { PriceBook, isStable } from './assets.js';
import { RankBook } from './ranks.js';
import { validStake, bandOf } from './stakes.js';
import { MODES, MODE } from './modes.js';
import { Inventory, OUTFITS, BOXES, BOX, RARITIES, PITY, PACKS, FINISHES, MAX_OPEN } from './cosmetics.js';
import { isStache, STACHE_GIFT_CASES, STACHE_CASE_ID, STACHE_TITLE, FOREVER_TITLES } from './stache.js';
import { PromoBook } from './promo.js';
import { COMMUNITY_IDS, COMMUNITY_TITLE, COMMUNITY_SPINS } from './community.js';
import { SocialBook, GUILD_RANK } from './social.js';
import { ReferralBook, cleanCode } from './referrals.js';
import { Guard, GUARD } from './guard.js';
import { MailBook } from './mail.js';
import { FortuneBook, FORTUNE } from './fortune.js';
import { DailyBook } from './daily.js';
import { DescentBook, TICKET_PACKS, packOf, DIFF_IDS } from './descent.js';

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
const PAUSABLE = new Set(['ready', 'stake_ticket', 'box', 'topup', 'swap', 'dx_buy']);
const SOCIAL = new Set(['players', 'profile', 'friend', 'unfriend', 'friends', 'dm', 'dms', 'inbox', 'guilds', 'guild', 'guild_create', 'guild_join', 'guild_leave', 'guild_say', 'guild_chat', 'guild_read', 'invite', 'guild_invite']);

export { STAKE_MIN as CUSTOM_MIN, STAKE_MAX as CUSTOM_MAX } from './stakes.js';

// the welcome bag for a player who came through an invite, and the inviter's bonus bag
export const REF_GIFT = 'vault';

export class Lobby {
  constructor({ promo = new PromoBook(), descent = new DescentBook(), pots = null, edge = false, stats = null, isAdmin = () => false, coins = null, fortune = new FortuneBook(), daily = new DailyBook(), mail = new MailBook(), guard = new Guard(), referrals = new ReferralBook(), wallet, send, newToken, cashier = null, prices = new PriceBook(), ranks = new RankBook(), inventory = new Inventory(), practice = false, bots = true, roundSeconds = CFG.ROUND_SECONDS, prepSeconds = CFG.PREP_SECONDS, tiers = CFG.TIERS, swap = !cashier, now = () => Date.now(), waitForStart = false, social = new SocialBook(), minPlayers = 1 }) {
    this.social = social; // players, friends, private messages, guilds
    this.stats = stats; // the team's analytics (server only)
    this.clientErrors = []; // errors players' devices reported, newest first
    this.edge = edge; // a regional match server (server/regions.js)
    this.regionOp = null; // main server: entry and stake tickets for regional tables
    this.regionList = null; // main server: () => [{ id, url }]
    this.isAdmin = isAdmin; // (account) => may open the analytics page
    this.referrals = referrals; // invite codes, who brought whom, the inviters' earnings
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
    this.guard = guard;
    this.mail = mail;
    this.promo = promo; // limited gifts (the first 100 STACHE stakers)
    this.fortune = fortune;
    this.daily = daily; // the login calendar, the daily and weekly tasks, achievement rewards
    this.coins = coins; // { list(), import(address) }: coins from the AVNU / Ekubo lists (real tokens only)
    this.descent = descent; // the Descent's tickets and depth records (shared/descent.js)
    this.roomArgs = { onRank: (k) => this.pushRank(k), descent, pots, edge, stats, wallet, send, prices, ranks, inventory, referrals, guard, daily, practice, bots, roundSeconds, prepSeconds, waitForStart, minPlayers };
    // every mode at every stake level; zombies and the gold rush at their one flat entry
    for (const m of MODES) for (const stake of m.fixed ? [m.fixed] : tiers) this.rooms.set(`${m.id}:${stake}`, new RoomCore({ stake, mode: m.id, ...this.roomArgs }));
    this.tiers = tiers;
    this.roundSeconds = roundSeconds;
  }

  tables() {
    return [...this.rooms.values()].map((r) => r.info());
  }

  // The table for a stake: one per mode and stake band (shared/stakes.js). Whatever you stake
  // inside the band is yours to know: the table only shows the whole pool.
  roomFor(mode, stake) {
    const m = MODE[mode] ? mode : 'raid';
    if (MODE[m].fixed) return this.rooms.get(`${m}:${MODE[m].fixed}`) ?? null;
    if (!validStake(stake)) return null;
    return this.rooms.get(`${m}:${bandOf(stake)}`) ?? null;
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

  // ip: where the socket comes from (the server knows, a local practice lobby doesn't)
  connect(cid, { ip = null } = {}) {
    this.sessions.set(cid, { token: null, account: null, name: 'runner', room: null, busy: false, net: this.guard.net(ip), dev: null });
  }

  seatOk(s, room) {
    const others = [];
    for (const x of this.sessions.values()) if (x !== s && x.room === room) others.push({ key: this.key(x), net: x.net, dev: x.dev });
    return this.guard.seatOk({ key: this.key(s), net: s.net, dev: s.dev }, others);
  }

  // A session gets its account's profile: the name saved on the server wins over whatever this
  // device remembers (a phone after a PC is the same runner). A key without a profile yet gets one
  // under the name the device typed. Returns true when the profile is new.
  adoptProfile(s) {
    const key = this.key(s);
    if (!key) return false;
    const had = this.social.get(key);
    if (had) {
      // a profile still on a default name takes the name this device knows
      if (/^runner\d*$/.test(had.name) && s.name !== 'runner') this.social.touch(key, s.name);
      else this.social.touch(key, null);
      s.name = had.name;
      return false;
    }
    s.name = this.social.touch(key, s.name).name; // a name someone else wears gets a free variant
    return true;
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
      s.dev = this.guard.dev(msg.dev);
      if (typeof msg.token === 'string' && /^[a-z0-9]{8,64}$/.test(msg.token)) s.token = msg.token;
      else if (this.cashier || this.guard.allow('new', s.net, GUARD.newPerIpDay)) s.token = this.newToken();
      else return this.send(cid, { t: 'err', code: 'guard_new', msg: 'Too many new accounts from your network today. Come back tomorrow.' });
      s.name = cleanName(msg.name);
      if (this.cashier) s.account = this.cashier.accountFor(s.token);
      else this.wallet.ensure(s.token);
      s.shadow = !!(s.account && this.cashier?.isShadow?.(s.token));
      this.guard.see(this.key(s), s.net, s.dev);
      // what this server lost of the account comes back from the browser's signed copy (server/backup.js)
      if (this.key(s) && Array.isArray(msg.backups)) this.backups?.restore(this.key(s), msg.backups);
      const fresh = this.adoptProfile(s);
      this.stats?.seen(this.key(s) ?? s.token, { wallet: !!s.account, device: s.token });
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
        descent: this.key(s) ? this.descent.view(this.key(s), this.dxGate(s)) : null,
        catalog: { outfits: OUTFITS, finishes: FINISHES, boxes: BOXES, rarities: RARITIES, pity: PITY, packs: PACKS, maxOpen: MAX_OPEN },
        practice: this.practice,
        swap: this.swapOn ? { fee: CFG.SWAP_FEE } : null,
        chat: this.chat,
        chain: this.cashier ? this.cashier.info() : null,
        social: this.socialSummary(s),
        // the account's own name: on a new device the profile comes back, not a new runner
        name: this.key(s) ? s.name : null,
        fresh: this.key(s) ? fresh : null,
        community: this.key(s) ? this.promo.communityOf(this.key(s)) : [],
        mail: this.key(s) ? this.mail.unread(this.key(s)) : 0,
        promo: this.practice ? null : { stacheLeft: this.promo.stacheLeft() },
        account: s.account,
        shadow: !!(s.account && this.cashier?.isShadow?.(s.token)),
        regions: this.regionList?.() ?? null,
        admin: !!s.account && this.isAdmin(s.account),
        privy: this.cashier?.privyFor(s.token) ?? null,
        cfg: {
          ROUND_SECONDS: this.roundSeconds,
          RAKE: CFG.RAKE,
          BAG_SHARE: CFG.BAG_SHARE,
          TIERS: this.tiers,
          MODES,
        },
      });
      this.catchUpWelcome(this.key(s));
      return;
    }
    if (!s.token) return;
    // the name on the server is the player's name: a device only names a brand-new runner
    if (typeof msg.name === 'string' && msg.t !== 'rename' && msg.t !== 'name_check' && this.key(s) && (s.fixedName || this.social.get(this.key(s)))) msg.name = s.name;
    if (SOCIAL.has(msg.t)) return this.socialOp(cid, s, msg);
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
      case 'edge_ticket':
      case 'stake_ticket':
        if (this.regionOp) this.regionOp(cid, s, msg);
        return;
      case 'cerr': {
        // a frame or script error on a player's device (see client reportError): kept for the team
        s.cerrs = (s.cerrs ?? 0) + 1;
        if (s.cerrs > 10) break;
        const e = { at: this.now(), key: this.key(s) ?? null, name: s.name, where: String(msg.where ?? '').slice(0, 20), m: String(msg.m ?? '').slice(0, 300), st: String(msg.st ?? '').slice(0, 900), ua: String(msg.ua ?? '').slice(0, 160), mode: s.room?.mode ?? null };
        this.clientErrors.unshift(e);
        if (this.clientErrors.length > 40) this.clientErrors.length = 40;
        if (!this.practice) console.warn(`client ${e.where} error (${e.name}, ${e.mode ?? 'lobby'}): ${e.m}`);
        break;
      }
      case 'ping':
        this.send(cid, { t: 'pong', c: msg.c });
        return;
      case 'netlog': {
        // how a match ran on the player's device and link, one line in the server log per match
        s.netlogs = (s.netlogs ?? 0) + 1;
        if (s.netlogs > 20 || this.practice) break;
        const n = (v, max = 1e6) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Math.round(Number(v)))) : '?');
        const mode = String(msg.mode ?? '?').replace(/[^a-z0-9-]/g, '').slice(0, 16);
        console.log(`net ${mode} ${String(s.name ?? 'runner').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 16)}: ${n(msg.secs)}s, ${n(msg.fps, 500)} fps, ${n(msg.slow)} slow frames, ${n(msg.hangs)} hangs >250ms (worst ${n(msg.worst, 1e7)} ms), snapshot gaps >250ms ${n(msg.gaps)} (worst ${n(msg.gapMax)} ms), ping avg ${n(msg.ping, 99999)} max ${n(msg.pingMax, 99999)} ms, ${msg.touch ? 'touch' : 'mouse'} ${n(msg.w, 10000)}x${n(msg.h, 10000)}@${Number(msg.dpr) > 0 ? Number(msg.dpr).toFixed(1) : '?'} q=${String(msg.q ?? '?').slice(0, 10)} canvas=${String(msg.canvas ?? '?').replace(/[^\w /]/g, '').slice(0, 40)} gpu=${String(msg.gpu ?? '?').replace(/[^\w .,()/+-]/g, '').slice(0, 80)}`);
        break;
      }
      case 'tables':
        this.send(cid, { t: 'tables', tables: this.tables(), balances: this.balances(s), assets: this.prices.list() });
        return;
      case 'neon': {
        // wear a season title (or null to take it off)
        const k = this.key(s);
        if (!k) return;
        if (!this.ranks.setNeon(k, msg.id === null ? null : String(msg.id ?? ''))) return this.send(cid, { t: 'err', msg: 'Win that title first.' });
        this.send(cid, { t: 'career', career: this.ranks.career(k) });
        return;
      }
      case 'leaderboard': {
        // the season's ranked table: top 100, and where you stand (online only)
        if (this.practice) return this.send(cid, { t: 'leaderboard', rows: [], me: null, total: 0, offline: true });
        const k = this.key(s);
        const all = this.ranks.leaderboard(Date.now(), 100000);
        const pid = (key) => this.social.get(key)?.id ?? null;
        const rows = all.slice(0, 100).map((r, i) => ({ pos: i + 1, id: pid(r.key), n: this.social.get(r.key)?.name ?? 'runner', rk: this.ranks.get(r.key).rank, nt: this.ranks.neon(r.key), rp: r.rp, div: r.div, games: r.games, wins: r.wins, top3: r.top3, kills: r.kills, deaths: r.deaths, kd: r.kd, me: r.key === k }));
        const pos = k ? all.findIndex((r) => r.key === k) + 1 : 0;
        // everyone who played PvP online, by K/D (or kills, or XP)
        const sort = ['kd', 'kills', 'xp'].includes(msg.sort) ? msg.sort : 'kd';
        const every = this.ranks.board(sort, Infinity);
        const allRows = every.slice(0, 100).map((r, i) => ({ pos: i + 1, id: pid(r.key), n: this.social.get(r.key)?.name ?? 'runner', rk: r.rank, nt: this.ranks.neon(r.key), kills: r.kills, deaths: r.deaths, kd: r.kd, games: r.games, wins: r.wins, xp: r.xp, me: r.key === k }));
        const mePos = k ? every.findIndex((r) => r.key === k) + 1 : 0;
        this.send(cid, { t: 'leaderboard', rows, me: k ? { pos, ...this.ranks.rankedView(k) } : null, total: all.length, all: { sort, rows: allRows, total: every.length, me: mePos ? { pos: mePos, ...every[mePos - 1], key: undefined } : null } });
        return;
      }
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
          if (MODE[r.mode].kind === 'team' || r.mode === 'duel' || r.noBots) continue; // fixed line-ups
          const n = Math.round(Number(msg.runners));
          if (n >= 2 && n <= 20) {
            r.botFill = n;
            if (r.state === 'prep') r.openPrep(); // re-roll the lineup
          }
          const secs = Math.round(Number(msg.seconds));
          if (secs >= 60 && secs <= 600 && !MODE[r.mode].fixed) r.roundSeconds = secs; // the side modes keep their clock
        }
        return;
      case 'faucet':
        if (this.cashier) return;
        if (!this.guard.allow('faucet', s.net, GUARD.faucetPerIpDay)) return this.send(cid, { t: 'err', code: 'guard_faucet', msg: 'Your network had its test tokens for today.' });
        this.wallet.faucet(s.token);
        this.send(cid, { t: 'balance', balances: this.balances(s) });
        return;
      case 'equip':
      case 'wequip':
      case 'body':
      case 'box':
      case 'topup':
      case 'tequip':
      case 'sequip':
      case 'pass_buy':
      case 'pass_claim':
      case 'pass_tiers':
      case 'store_buy':
      case 'card_buy':
      case 'card_claim':
      case 'vip_claim':
      case 'starter_buy':
      case 'box_all':
        // practice is free play money: buying (bags, shop $, offers) and the battle pass are online only
        if (this.practice && !['equip', 'wequip', 'body', 'tequip', 'sequip'].includes(msg.t)) return this.send(cid, { t: 'err', code: 'online_only', msg: 'This works in online play only.' });
        this.lockerOp(cid, s, msg);
        return;
      case 'mail_list':
      case 'mail_read':
      case 'mail_claim':
        this.mailOp(cid, s, msg);
        return;
      case 'spin': // older clients: a free spin turns the shop's fortune wheel
        this.fortuneSpin(cid, s, { free: 1 });
        return;
      case 'coin_list':
      case 'coin_import':
        this.coinOp(cid, s, msg);
        return;
      case 'locker_sync': {
        // the store turned over at midnight (UTC): the new set
        const key = this.key(s);
        if (key) this.send(cid, { t: 'locker', op: 'sync', locker: this.inventory.view(key) });
        return;
      }
      case 'fortune_info':
        return this.send(cid, { t: 'fortune', view: this.fortune.view() });
      case 'fortune_spin':
        this.fortuneSpin(cid, s, msg);
        return;
      case 'dx_info':
      case 'dx_buy':
      case 'dx_board':
        this.descentOp(cid, s, msg);
        return;
      case 'daily':
      case 'daily_claim':
        this.dailyMsg(cid, s, msg);
        return;
      case 'ref_info':
        // with real tokens the code belongs to the signed-in address
        if (!this.key(s)) return this.send(cid, { t: 'ref', signedOut: true });
        this.send(cid, { t: 'ref', ...this.referrals.view(this.key(s)) });
        return;
      case 'ref_claim': {
        // only before your first match; a welcome bag for coming in through an invite
        const key = this.key(s);
        if (!key) return this.send(cid, { t: 'ref', signedOut: true });
        const fresh = !(this.ranks.rec?.(key)?.stats?.raids > 0);
        // fair play: not from a network or device the inviter uses, and only so many a day each
        const by = this.referrals.codes.get(cleanCode(msg.code));
        let r;
        if (by && by !== key && this.guard.linked(key, by)) r = { ok: false, error: 'linked' };
        else if (by && this.referrals.view(key).canClaim && fresh && !this.guard.allow('ref', by, GUARD.refPerDay)) r = { ok: false, error: 'busy' };
        else r = this.referrals.claim(key, msg.code, { fresh });
        // the welcome bag comes after the first staked match (see RoomCore.reportEnds)
        this.send(cid, { t: 'ref', claimed: r.ok, error: r.error ?? null, gift: r.ok ? REF_GIFT : null, ...this.referrals.view(key) });
        return;
      }
      case 'auth_start':
      case 'auth':
      case 'auth_privy':
      case 'auth_shadow_start':
      case 'auth_shadow':
      case 'logout':
      case 'deposit':
      case 'deposit_ref':
      case 'withdraw':
      case 'history':
        if (this.cashier) this.cashierOp(cid, s, msg);
        return;
      case 'rename': {
        const key = this.key(s);
        const name = cleanName(msg.name);
        if (!key || !msg.name || name === 'runner') return this.send(cid, { t: 'err', code: 'rename', msg: 'Pick a name of 3–16 letters or digits.' });
        if (s.room) return this.send(cid, { t: 'err', code: 'rename', msg: 'Leave the table to change your name.' });
        if (this.social.nameTaken(name, key)) return this.send(cid, { t: 'err', code: 'name_taken', msg: 'That name is taken. Pick another one.' });
        s.name = this.social.touch(key, name).name;
        this.renameEverywhere(key, s.name);
        return;
      }
      case 'name_check': {
        const name = cleanName(msg.name);
        return this.send(cid, { t: 'name_check', name, free: name !== 'runner' && !this.social.nameTaken(name, this.key(s)) });
      }
      case 'community':
        return this.claimCommunity(cid, s, String(msg.id ?? ''));
      case 'join': {
        if (msg.name && !this.social.get(this.key(s))) {
          s.name = cleanName(msg.name);
          s.name = this.social.touch(this.key(s), s.name)?.name ?? s.name;
        }
        // ranked is online only
        if (this.practice && MODE[msg.mode]?.ranked) return this.send(cid, { t: 'err', code: 'online_only', msg: 'Ranked works in online play only.' });
        const room = this.roomFor(msg.mode, Number(msg.stake));
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
          // fair play: one person, one seat at a staked table (no feeding a second account)
          if (!room.practice && !this.seatOk(s, room)) return this.send(cid, { t: 'err', code: 'guard_seat', msg: 'Another account from your network or device is already at this table.' });
          room.addClient(cid, { token: this.key(s), name: msg.name || s.name, skin: msg.skin, stake: Number(msg.stake), gate: this.dxGate(s) });
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
        if (s.room) {
          s.room.handle(cid, msg);
          // staking STACHE online: the first 100 players get the gift
          if (msg.t === 'ready' && !s.room.practice && isStache(s.room.clients.get(cid)?.escrow?.asset)) this.stacheGift(this.key(s));
        }
    }
  }

  // The STACHE gift, once per player and for the first 100 only: a letter with the Moustache
  // Holder title (+5% XP for good) and two Stache Cases at full odds, claimed in the mailbox. Fair play: not for a flagged account,
  // nor for one linked (same network or device) to a player who already got it.
  stacheGift(key) {
    // regional match servers leave it to the main server (it hands the gift out with the stake ticket)
    if (this.practice || this.edge || !key || this.guard?.flagged(key)) return null;
    if (this.promo.stache.some((x) => x.key !== key && this.guard?.linked?.(key, x.key))) return null;
    const place = this.promo.claimStache(key);
    if (!place) return null;
    // the gift waits in the mailbox: one letter, claimed with one button (the title and the cases)
    const gift = { k: 'bundle', items: [{ k: 'ntitle', id: STACHE_TITLE }, { k: 'box', id: STACHE_CASE_ID, n: STACHE_GIFT_CASES }] };
    this.mail.send({ key, kind: 'gift', title: 'STACHE gift', body: `You are STACHE player #${place} of 100.`, i18n: 'stache', gift });
    this.promo.markMailed(key);
    for (const c of this.sessionsOf(key)) this.send(c, { t: 'mailbox', unread: this.mail.unread(key), news: { k: 'stache', place } });
    console.log(`stache gift #${place} to ${String(key).slice(0, 10)}…`);
    return place;
  }

  // where this session plays from, for today's free Descent ticket (counted per network and device)
  dxGate(s) {
    return { net: s.net ?? null, dev: s.dev ?? null, ok: !this.guard.flagged(this.key(s)) };
  }

  // The Descent's tickets: what you hold, buying a pack (in any coin you hold, at the feed price),
  // and the deepest runners per difficulty.
  descentOp(cid, s, msg) {
    const key = this.key(s);
    const view = () => ({ t: 'dx', view: this.descent.view(key, this.dxGate(s)), packs: TICKET_PACKS });
    if (msg.t === 'dx_board') {
      const diff = DIFF_IDS.includes(msg.diff) ? msg.diff : 'easy';
      const rows = this.descent.board(diff, 50).map((r, i) => ({ pos: i + 1, n: this.social.get(r.key)?.name ?? 'runner', rk: this.ranks.get(r.key).rank, best: r.best, clears: r.clears, me: r.key === key }));
      return this.send(cid, { t: 'dx_board', diff, rows });
    }
    if (!key) return this.send(cid, { t: 'err', msg: 'Sign in first.' });
    if (msg.t === 'dx_info') return this.send(cid, view());
    // buying: online only (practice is free play and needs no tickets)
    if (this.practice) return this.send(cid, { t: 'err', code: 'online_only', msg: 'Practice runs need no tickets: tickets are for online play.' });
    if (s.busy) return this.send(cid, { t: 'err', msg: 'One moment.' });
    const pack = packOf(Number(msg.n));
    if (!pack) return this.send(cid, { t: 'err', msg: 'That pack is not sold.' });
    if (!this.descent.canBuy(key, pack.n)) return this.send(cid, { t: 'err', code: 'dx_cap', msg: 'That is more tickets than one account may hold or buy in a day.' });
    const asset = String(msg.asset ?? '');
    if (this.prices.get(asset)?.custom) return this.send(cid, { t: 'err', code: 'custom_only_stake', msg: 'Coins added by address can only be staked.' });
    const units = this.prices.quote(asset, pack.mills);
    if (units === null) return this.send(cid, { t: 'err', msg: 'That coin has no price right now.' });
    if (!this.wallet.debit(key, asset, units)) return this.send(cid, { t: 'err', code: 'dx_funds', msg: `Not enough ${this.prices.get(asset)?.symbol ?? 'coins'} for ${pack.n === 1 ? 'a ticket' : `${pack.n} tickets`}.` });
    this.descent.add(key, pack.n);
    this.stats?.buy('descent', pack.mills / 10, String(pack.n));
    this.send(cid, { ...view(), bought: pack.n, balances: this.balances(s) });
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
    if (!this.prices.spendable(from) || !this.prices.spendable(to)) return err('Coins added by address can only be staked, not swapped.');
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
    const pid = key ? this.social.get(key)?.id : null; // so a later rename reaches this line too
    const m = { n: cleanName(msg.name || s.name), text, at: now, rk: key ? this.ranks.get(key).rank : 1, tt: key ? this.ranks.title(key) : null, ...(pid ? { id: pid } : {}) };
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
    const stable = this.stablePay(key);
    // a purchase paid in USDC/USDT counts toward founding a guild
    const pay = (cents) => {
      const ok = stable(cents);
      if (ok) this.social.markPurchase(key);
      return ok;
    };
    const rec = inv.rec(key);
    const was = { spent: rec.spent ?? 0, bought: rec.bought ?? 0, paid: rec.paid ?? 0 };
    const r =
      msg.t === 'equip' ? inv.equip(key, id)
      : msg.t === 'body' ? inv.setBody(key, id)
      : msg.t === 'wequip' ? inv.equipWeapon(key, id)
      : msg.t === 'topup' ? inv.topUp(key, id, pay)
      : msg.t === 'tequip' ? inv.equipTurret(key, msg.id ? id : null)
      : msg.t === 'sequip' ? inv.equipStyle(key, String(msg.kind ?? ''), msg.id ? id : null)
      : msg.t === 'pass_buy' ? inv.passBuy(key, pay)
      : msg.t === 'pass_claim' ? inv.passClaim(key, msg.track, msg.tier)
      : msg.t === 'pass_tiers' ? inv.passTiers(key, msg.n, pay)
      : msg.t === 'store_buy' ? inv.storeBuy(key, id, pay)
      : msg.t === 'card_buy' ? inv.cardBuy(key, pay)
      : msg.t === 'card_claim' ? inv.cardClaim(key)
      : msg.t === 'vip_claim' ? inv.vipClaim(key)
      : msg.t === 'starter_buy' ? inv.starterBuy(key, pay)
      : msg.t === 'box_all' ? inv.openAll(key)
      : inv.open(key, id, pay, msg.n, this.coinPay(key, BOX[id]?.coin));
    if (!r.ok) return this.send(cid, { t: 'err', msg: r.error });
    if (!this.practice && this.stats) {
      const now = inv.rec(key);
      if ((now.bought ?? 0) > was.bought) this.stats.buy('topup', now.bought - was.bought, id);
      const kind = { pass_buy: 'pass', pass_tiers: 'pass', store_buy: 'store', card_buy: 'card', starter_buy: 'starter' }[msg.t] ?? 'box';
      // what was paid with real money now (USDC/USDT or a coin) and what with shop $
      if ((now.spent ?? 0) > was.spent) this.stats.buy(kind, now.spent - was.spent, kind === 'box' ? id : msg.t, (now.paid ?? 0) - was.paid);
    }
    this.send(cid, { t: 'locker', op: msg.t, result: r, locker: inv.view(key), balances: this.balances(s) });
    if (msg.t === 'topup' && !this.practice) this.welcome(key); // the first top-up earns the welcome bonus (its toast comes last)
    if (s.room && (msg.t === 'equip' || msg.t === 'body' || msg.t === 'wequip' || msg.t === 'tequip' || msg.t === 'sequip')) s.room.broadcastPrep();
  }

  // ------------------------------------------------------------ coming back every day
  // The calendar, the tasks and the achievement rewards. Online only (practice is free, so it
  // must not farm), signed in, and not while the account is under a fair-play review.
  dailyView(key) {
    return this.daily.view(key, this.ranks.recs.get(key)?.done ?? {});
  }

  dailyMsg(cid, s, msg) {
    if (this.practice) return this.send(cid, { t: 'daily', offline: true });
    const key = this.key(s);
    if (!key) return this.send(cid, { t: 'daily', signedOut: true });
    if (msg.t === 'daily') return this.send(cid, { t: 'daily', view: this.dailyView(key) });
    if (this.guard?.flagged(key)) return this.send(cid, { t: 'err', msg: 'Rewards are on hold while the account is under a fair-play review.' });
    let r;
    let add = null; // career counters this claim moves (for the achievements about coming back)
    if (msg.what === 'day') {
      r = this.daily.claimDay(key);
      if (r.ok) add = { streak: r.streak, calDays: 1 };
    } else if (msg.what === 'task') {
      r = this.daily.claimTask(key, String(msg.id ?? ''));
      if (r.ok) add = { tasksDone: 1 };
    } else if (msg.what === 'ach') r = this.daily.claimAch(key, String(msg.id ?? ''), this.ranks.recs.get(key)?.done ?? {});
    else return;
    if (!r.ok) return this.send(cid, { t: 'err', msg: r.error });
    const got = this.grant(key, r.gifts);
    // coming back unlocks achievements of its own (their XP is paid at once, their reward waits)
    const fresh = add ? this.ranks.progress(key, add) : [];
    const xp = fresh.reduce((n, a) => n + (a.xp ?? 0), 0);
    if (xp) this.grant(key, [{ k: 'xp', v: xp }]);
    this.stats?.daily?.(msg.what);
    for (const c of this.sessionsOf(key)) {
      this.send(c, { t: 'daily', view: this.dailyView(key), career: this.ranks.career(key), ...(c === cid ? { claimed: { what: msg.what, id: r.id ?? null, day: r.day ?? null, gifts: r.gifts, sweep: !!r.sweep, rewards: got.rewards, achievements: fresh.map((a) => a.id) } } : {}) });
      this.send(c, { t: 'locker', op: 'sync', locker: this.inventory.view(key) });
    }
  }

  // hand out daily gifts: shop $, bags, spins (the inventory), pass XP, rank XP (with its
  // rank-up rewards), XP boosts. Returns the rank-up rewards it paid.
  grant(key, gifts) {
    const rewards = [];
    let xpGiven = false;
    for (const g of gifts ?? []) {
      // boxes from free rewards are gifts: they roll up to Epic (Legendary+ is for paid boxes, ranked and the pass)
      if (g.k === 'box') this.inventory.give(key, { ...g, cap: 1 });
      else if (g.k === 'credit' || g.k === 'spin' || g.k === 'style') this.inventory.give(key, g);
      else if (g.k === 'pass') this.inventory.passXp(key, g.v);
      else if (g.k === 'boost') this.daily.addBoost(key, g.n);
      else if (g.k === 'xp') {
        const { before, after } = this.ranks.add(key, g.v);
        this.inventory.passXp(key, g.v);
        if (after.rank > before.rank) {
          rewards.push(...this.inventory.rankUp(key, before.rank, after.rank));
          this.ranks.progress(key, { rank: after.rank });
        }
        xpGiven = true;
      }
    }
    if (xpGiven) this.pushRank(key);
    return { rewards };
  }

  // The welcome bonus, once per account: the premium Founder title (worn at once if no other title
  // is on) and a letter in the mailbox with a spin of the fortune wheel.
  welcome(key) {
    if (!key || !this.inventory.welcome(key)) return false;
    const done = this.ranks.progress(key, { deposits: 1 });
    if (done.some((a) => a.id === 'founder') && !this.ranks.title(key)) this.ranks.setTitle(key, 'founder');
    if (done.length) this.ranks.add(key, done.reduce((n, a) => n + (a.xp ?? 0), 0));
    this.pushRank(key);
    this.mail.send({ key, kind: 'gift', title: 'Welcome bonus', body: 'Thanks for your first top-up!', i18n: 'welcome', gift: { k: 'spin', n: 1 } });
    for (const cid of this.sessionsOf(key)) {
      this.send(cid, { t: 'mailbox', unread: this.mail.unread(key), news: { k: 'welcome' } });
      this.send(cid, { t: 'career', career: this.ranks.career(key) });
    }
    return true;
  }

  // players who topped up before the welcome bonus existed get it on their next visit
  catchUpWelcome(key) {
    if (!key || this.practice) return;
    if (!(this.cashier?.hasDeposited?.(key) || this.inventory.rec(key).bought > 0)) return;
    if (this.welcome(key)) return;
    // welcomed before, but the rank book is new (ranks are kept per network now): the Founder title stays theirs
    if (!this.ranks.rec(key).done?.founder) {
      const done = this.ranks.progress(key, { deposits: 1 });
      if (done.some((a) => a.id === 'founder') && !this.ranks.title(key)) this.ranks.setTitle(key, 'founder');
      if (done.length) {
        this.ranks.add(key, done.reduce((n, a) => n + (a.xp ?? 0), 0));
        this.pushRank(key);
      }
    }
  }

  mailOp(cid, s, msg) {
    const key = this.key(s);
    if (!key) return this.send(cid, { t: 'mailbox', signedOut: true, list: [], unread: 0 });
    let gift = null;
    if (msg.t === 'mail_read') this.mail.read(key, String(msg.id ?? ''));
    if (msg.t === 'mail_claim') {
      gift = this.mail.claim(key, String(msg.id ?? ''));
      if (gift) this.giveMailGift(key, gift);
      if (gift) this.send(cid, { t: 'career', career: this.ranks.career(key) });
    }
    this.send(cid, { t: 'mailbox', list: this.mail.inbox(key), unread: this.mail.unread(key), ...(gift ? { claimed: gift } : {}), locker: this.inventory.view(key) });
  }

  // The players who got the STACHE gift before it came as a letter (granted at once, with no
  // letter): each gets the letter now, once, with two more Stache Cases (and the title if it is
  // not theirs yet). Run at start by the main server.
  resendStacheGifts() {
    if (this.practice || this.edge) return 0;
    let n = 0;
    for (const key of this.promo.unmailed()) {
      // a letter with the gift already went out (since gifts came as letters): nothing to resend
      if (this.mail.inbox(key).some((m) => m.i18n === 'stache' && m.gift)) {
        this.promo.markMailed(key);
        continue;
      }
      const items = [{ k: 'box', id: STACHE_CASE_ID, n: STACHE_GIFT_CASES }];
      if (!this.ranks.stitleIds(key).includes(STACHE_TITLE)) items.unshift({ k: 'ntitle', id: STACHE_TITLE });
      const place = this.promo.stache.findIndex((x) => x.key === key) + 1;
      this.mail.send({ key, kind: 'gift', title: 'STACHE gift', body: `You are STACHE player #${place} of 100.`, i18n: 'stache', gift: { k: 'bundle', items } });
      this.promo.markMailed(key);
      n++;
    }
    if (n) console.log(`stache gift letters sent again to ${n} early player${n === 1 ? '' : 's'}`);
    return n;
  }

  // Following one of the game's channels (X, Telegram): a free wheel spin each, and the Community
  // Member title with the first. Once per account and channel; practice keeps nothing.
  claimCommunity(cid, s, id) {
    const key = this.key(s);
    if (this.practice || !key) return this.send(cid, { t: 'err', code: 'community', msg: 'Sign in to keep your rewards.' });
    if (!COMMUNITY_IDS.includes(id)) return;
    if (!this.promo.claimCommunity(key, id)) return this.send(cid, { t: 'community', claimed: this.promo.communityOf(key), got: null });
    this.inventory.give(key, { k: 'spin', n: COMMUNITY_SPINS });
    const title = !this.ranks.stitleIds(key).includes(COMMUNITY_TITLE);
    if (title) this.ranks.addForeverTitle(key, COMMUNITY_TITLE);
    for (const c of this.sessionsOf(key)) {
      this.send(c, { t: 'community', claimed: this.promo.communityOf(key), career: this.ranks.career(key), ...(c === cid ? { got: { id, spins: COMMUNITY_SPINS, title: title ? COMMUNITY_TITLE : null } } : {}) });
      this.send(c, { t: 'locker', op: 'sync', locker: this.inventory.view(key) });
    }
  }

  // what a letter's gift hands over: a bundle gives each of its items; a neon title (ntitle) only
  // if it is one of the forever titles (the STACHE gift); the rest goes to the locker
  giveMailGift(key, g) {
    if (g.k === 'bundle') for (const x of g.items ?? []) this.giveMailGift(key, x);
    else if (g.k === 'ntitle') {
      if (FOREVER_TITLES[g.id]) this.ranks.addForeverTitle(key, g.id);
    } else this.inventory.give(key, g);
  }

  // A paid turn of the shop's fortune wheel ($0.05 in any coin the player holds). The prize lands
  // at once; a jackpot is paid in real coins: sent on chain from the fortune wallet when the server
  // has one, otherwise credited to the game balance (withdrawable like any winnings).
  async fortuneSpin(cid, s, msg) {
    const key = this.key(s);
    if (!key) return this.send(cid, { t: 'err', msg: 'Sign in first.' });
    if (this.practice) return this.send(cid, { t: 'err', code: 'online_only', msg: 'This works in online play only.' });
    if (s.busy) return this.send(cid, { t: 'err', msg: 'One moment.' });
    // a free spin (tasks, the calendar, mail) turns the same wheel, without the bank
    // several at once (free: n, up to 50): one result each, the wheel shows the best
    if (msg.free) {
      const n = Math.max(1, Math.min(50, Math.floor(Number(msg.free) || 1)));
      const all = [];
      for (let i = 0; i < n && this.inventory.useSpin(key); i++) {
        const { slot } = this.fortune.free();
        all.push({ slot, prize: this.fortunePay(key, slot) });
      }
      if (!all.length) return this.send(cid, { t: 'err', msg: 'No free spins left.' });
      const best = all.reduce((a, b) => (FORTUNE.slots[b.slot].w < FORTUNE.slots[a.slot].w ? b : a));
      return this.send(cid, { t: 'fortune', spun: { ...best, free: true, ...(all.length > 1 ? { all } : {}) }, view: this.fortune.view(), locker: this.inventory.view(key) });
    }
    const asset = String(msg.asset ?? '');
    if (this.prices.get(asset)?.custom) return this.send(cid, { t: 'err', code: 'custom_only_stake', msg: 'Coins added by address can only be staked.' });
    const units = this.prices.quote(asset, FORTUNE.price);
    if (units === null) return this.send(cid, { t: 'err', msg: 'That coin has no price right now.' });
    if (!this.wallet.debit(key, asset, units)) return this.send(cid, { t: 'err', code: 'fortune_funds', msg: `Not enough ${this.prices.get(asset)?.symbol ?? 'coins'} for a spin.` });
    const { slot, jackpot } = this.fortune.spin();
    this.stats?.buy('fortune', FORTUNE.price / 10);
    const prize = this.fortunePay(key, slot);
    let win = null;
    if (jackpot) {
      s.busy = true;
      try {
        win = await this.payJackpot(key, jackpot);
        this.fortune.won(s.name, jackpot, win?.symbol ?? '');
        this.mail.send({ key, kind: 'gift', title: 'Fortune jackpot', body: `${(jackpot / 1000).toFixed(2)} $`, i18n: 'jackpot' });
      } finally {
        s.busy = false;
      }
    }
    this.send(cid, { t: 'fortune', spun: { slot, prize, paid: { asset, units: units.toString() }, ...(win ? { jackpot: win } : {}) }, view: this.fortune.view(), locker: this.inventory.view(key), balances: this.balances(s), mail: this.mail.unread(key) });
  }

  // what a wheel slot pays: skins, shop $, spins, style and gift boxes go to the inventory; pass XP
  // and XP boosts are handed out here
  fortunePay(key, slot) {
    const prize = this.inventory.fortunePrize(key, FORTUNE.slots[slot]);
    if (prize.k === 'pass' || prize.k === 'boost') this.grant(key, [prize]);
    return prize;
  }

  // Coins a player can bring to the table: the merged AVNU / Ekubo list, and importing one of them.
  // An import is for everyone: the new coin shows up in every player's stake and cashier lists.
  async coinOp(cid, s, msg) {
    if (!this.coins || !this.cashier) return this.send(cid, { t: 'coins', off: true, list: [] });
    try {
      if (msg.t === 'coin_list') {
        const have = new Set(this.cashier.chain.tokens.map((t) => t.id));
        const list = (await this.coins.list()).map((t) => ({ ...t, added: have.has(t.address) }));
        return this.send(cid, { t: 'coins', list });
      }
      if (!this.key(s)) return this.send(cid, { t: 'err', msg: 'Sign in first.' });
      if (!this.guard.allow('coin', this.key(s), 20)) return this.send(cid, { t: 'err', msg: 'Enough imports for today.' });
      const r = await this.coins.import(String(msg.address ?? ''));
      const info = { t: 'chain', chain: this.cashier.info(), assets: this.prices.list() };
      if (r.fresh) {
        for (const [c, x] of this.sessions) if (x.token) this.send(c, info);
      } else this.send(cid, info);
      this.send(cid, { t: 'coins', imported: { id: r.token.id, symbol: r.token.symbol, priced: this.prices.has(r.token.id), custom: !!r.token.custom, maxStake: r.token.maxStake ?? null } });
    } catch (e) {
      this.send(cid, { t: 'err', msg: e?.user ? e.message : 'Could not import that coin. Try again in a minute.' });
    }
  }

  // the bank in real coins: USDC if priced, else USDT, else STRK
  async payJackpot(key, mills) {
    const list = this.prices.list();
    const pick = ['USDC', 'USDT', 'STRK'].map((sym) => list.find((a) => a.symbol?.toUpperCase() === sym && this.prices.has(a.id))).find(Boolean) ?? list.find((a) => this.prices.spendable(a.id));
    if (!pick) return null;
    const units = this.prices.unitsFor(pick.id, mills);
    const out = { mills, asset: pick.id, symbol: pick.symbol, units: units.toString(), onchain: false, tx: null };
    const chain = this.cashier?.chain;
    if (chain?.payFortune && this.cashier) {
      try {
        const r = await chain.payFortune({ token: pick.id, to: key, amount: units });
        return { ...out, onchain: true, tx: r.tx };
      } catch (e) {
        console.error('fortune payout on chain failed, crediting the game balance instead', e?.message ?? e);
      }
    }
    this.wallet.credit(key, pick.id, units);
    return out;
  }

  // A case sold for a coin (the Stache Case: STACHE) is paid in that coin at its live price:
  // $0.99 is however many STACHE $0.99 buys right now. null when the case is not sold for a coin.
  coinPay(key, coin) {
    if (!coin) return null;
    return (cents) => {
      const a = this.prices.list().find((x) => (coin === 'STACHE' ? isStache(x.id) : x.symbol === coin) && !x.custom && this.prices.has(x.id));
      if (!a) return false;
      const units = this.prices.quote(a.id, cents * 10);
      return units !== null && this.wallet.debit(key, a.id, units);
    };
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
    if (msg.t === 'auth_shadow_start') {
      // private mode, step 1: which shadow account, and the challenge that proves it is yours
      if (s.room) return reply({ t: 'err', msg: 'Leave the table to switch wallets.' });
      try {
        return reply({ t: 'shadow_challenge', ...(await c.shadowStart(s.token, msg.partial)) });
      } catch (e) {
        return reply({ t: 'err', code: 'shadow', msg: e?.user ? e.message : 'Private sign-in failed. Try again.' });
      }
    }
    if (msg.t !== 'auth' && msg.t !== 'auth_privy' && msg.t !== 'auth_shadow' && !s.account) return reply({ t: 'err', msg: 'Connect a wallet first.' });
    if (msg.t === 'history') return reply({ t: 'history', ...c.history(s.account) });
    if (msg.t === 'deposit_ref') {
      try {
        return reply({ t: 'deposit_ref', ...c.depositRef(s.account) });
      } catch (e) {
        return reply({ t: 'err', msg: e?.user ? e.message : 'The cashier hit an error.' });
      }
    }
    if (s.busy) return reply({ t: 'err', msg: 'One moment, the cashier is still on your last request.' });
    s.busy = true;
    try {
      if (msg.t === 'auth') {
        if (s.room) throw Object.assign(new Error('Leave the table to switch wallets.'), { user: true });
        const account = await c.login(s.token, msg.address, msg.signature);
        if (!alive()) return;
        s.account = account;
        s.shadow = false;
        this.guard.see(account, s.net, s.dev);
        if (Array.isArray(msg.backups)) this.backups?.restore(account, msg.backups);
        const fresh = this.adoptProfile(s);
        reply({ t: 'social', ...this.socialSummary(s) });
        this.stats?.seen(account, { wallet: true, device: s.token });
        // the welcome catch-up may add XP (the Founder title): before the reply, so its rank is right
        this.catchUpWelcome(account);
        reply({ t: 'authed', account, name: s.name, fresh, community: this.promo.communityOf(account), admin: this.isAdmin(account), balances: this.balances(s), rank: this.ranks.get(account), career: this.ranks.career(account), locker: this.inventory.view(account) });
      } else if (msg.t === 'auth_shadow') {
        // private mode, step 2: the proof of control is on chain; the session plays as the shadow account
        if (s.room) throw Object.assign(new Error('Leave the table to switch wallets.'), { user: true });
        const r = await c.shadowFinish(s.token, msg.tx);
        if (!alive()) return;
        if (r.status === 'pending') return reply({ t: 'shadow_pending' });
        const account = r.account;
        const prev = s.account;
        const prevShadow = !!s.shadow;
        s.account = account;
        s.shadow = true;
        // the player chose to bring what their wallet's account built (the server then knows both
        // are them; on chain nothing links the two)
        const carried = msg.carry === true && prev && !prevShadow && prev !== account ? this.carryProgress(prev, account) : false;
        this.guard.see(account, s.net, s.dev);
        if (Array.isArray(msg.backups)) this.backups?.restore(account, msg.backups);
        const fresh = this.adoptProfile(s);
        reply({ t: 'social', ...this.socialSummary(s) });
        this.stats?.seen(account, { wallet: true, device: s.token });
        this.catchUpWelcome(account);
        reply({ t: 'authed', account, shadow: true, carried, name: s.name, fresh, community: this.promo.communityOf(account), admin: this.isAdmin(account), balances: this.balances(s), rank: this.ranks.get(account), career: this.ranks.career(account), locker: this.inventory.view(account) });
      } else if (msg.t === 'auth_privy') {
        if (s.room) throw Object.assign(new Error('Leave the table to switch wallets.'), { user: true });
        const r = await c.loginPrivy(s.token, String(msg.token ?? ''));
        if (!alive()) return;
        s.account = r.account;
        s.shadow = false;
        this.guard.see(r.account, s.net, s.dev);
        if (Array.isArray(msg.backups)) this.backups?.restore(r.account, msg.backups);
        const fresh = this.adoptProfile(s);
        reply({ t: 'social', ...this.socialSummary(s) });
        this.stats?.seen(r.account, { wallet: true, device: s.token });
        this.catchUpWelcome(r.account);
        reply({ t: 'authed', account: r.account, name: s.name, fresh, community: this.promo.communityOf(r.account), admin: this.isAdmin(r.account), privy: r.wallet, balances: this.balances(s), rank: this.ranks.get(r.account), career: this.ranks.career(r.account), locker: this.inventory.view(r.account) });
      } else if (msg.t === 'deposit') {
        reply({ t: 'cashier', op: 'deposit', status: 'checking' });
        let r;
        if (msg.route === 'private' && c.chain.info?.().vault) r = { status: 'ok', credited: (await c.scanVault()).filter((x) => x.account === s.account) };
        else if (msg.route === 'private') r = { status: 'ok', credited: (await c.scanPrivate()).filter((x) => x.account === s.account) };
        else r = await c.depositPublic(s.account, msg.tx);
        if (r.credited.some((x) => !x.held && !x.unsupported)) this.welcome(s.account); // the first deposit earns the welcome bonus
        reply({ t: 'cashier', op: 'deposit', route: msg.route, status: r.status, credited: r.credited.map((x) => ({ asset: x.token, units: x.amount.toString(), unsupported: !!x.unsupported, held: x.held ?? null })) });
        reply({ t: 'balance', balances: this.balances(s) });
      } else if (msg.t === 'withdraw') {
        // fair play: an account under aim review keeps its balance but cannot cash out until cleared
        if (this.guard.flagged(s.account)) throw Object.assign(new Error('Your account is under a fair-play review. Withdrawals open again once it is cleared; write to support.'), { user: true });
        // a shadow account's money only goes back to the shadow account (then into the shielded balance)
        const route = msg.route === 'private' && !c.isShadow?.(s.token) ? 'private' : 'public';
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

  // ------------------------------------------------------------- social

  // Private mode, by the player's choice: what their wallet's account built moves to their shadow
  // account (rank, achievements, stats, ranked, skins, shop $, cases, tickets, invites, daily
  // calendar, mail, the profile and its name). Only into a shadow account with nothing of its own
  // yet; coins stay where they are (cash out, then deposit privately). Returns whether it moved.
  carryProgress(from, to) {
    if (!from || !to || from === to) return false;
    const r = this.ranks.recs.get(to);
    if (r && (r.xp > 0 || Object.keys(r.stats ?? {}).length)) return false;
    const L = this.inventory.data.get(to);
    if (L && (L.owned?.length || L.wowned?.length || L.credit > 0 || L.bought > 0 || L.spent > 0)) return false;
    const mv = (map, book) => {
      if (!map?.has(from)) return;
      map.set(to, map.get(from));
      map.delete(from);
      book?.onChange?.(book);
    };
    mv(this.ranks.recs, this.ranks);
    mv(this.inventory.data, this.inventory);
    mv(this.descent?.users, this.descent);
    mv(this.daily?.users, this.daily);
    mv(this.mail?.users, this.mail);
    const ref = this.referrals.users.get(from);
    if (ref) {
      mv(this.referrals.users, null);
      if (ref.code) this.referrals.codes.set(ref.code, to);
      for (const u of this.referrals.users.values()) {
        if (u.by === from) u.by = to;
        if (u.refs?.includes(from)) u.refs = u.refs.map((k) => (k === from ? to : k));
      }
      this.referrals.changed?.();
    }
    this.social.moveKey?.(from, to);
    return true;
  }

  // A new name shows everywhere at once: every tab and device of the account, a table or a match
  // one of them sits at, the lobby chat's earlier lines, and everyone else's open lists and chats
  // (they get the public id and the new name). Leaderboards, profiles, friends and guild chats read
  // the name live, so their next view has it anyway.
  renameEverywhere(key, name) {
    const id = this.social.get(key)?.id ?? null;
    for (const c of this.sessionsOf(key)) {
      const x = this.sessions.get(c);
      if (!x) continue;
      x.name = name;
      this.send(c, { t: 'renamed', name });
      const rc = x.room?.clients.get(c);
      if (rc) {
        rc.name = name;
        const p = rc.pid && x.room.world ? x.room.world.players.get(rc.pid) : null;
        if (p) p.name = name;
        x.room.broadcastPrep(true);
      }
    }
    if (!id) return;
    for (const m of this.chat) if (m.id === id) m.n = name;
    for (const [c, x] of this.sessions) if (x.token && this.key(x) !== key) this.send(c, { t: 'player_renamed', id, n: name });
  }

  // rank XP given outside a match (daily gifts, achievements, the welcome bonus): every open tab
  // of the account gets its new rank, or the profile card shows the old one until a reload
  pushRank(key) {
    if (!key) return;
    const rank = this.ranks.get(key);
    for (const cid of this.sessionsOf(key)) this.send(cid, { t: 'rank', rank });
  }

  sessionsOf(key) {
    const out = [];
    for (const [cid, x] of this.sessions) if (x.token && this.key(x) === key) out.push(cid);
    return out;
  }

  // where a player is right now: off (not connected), lobby, waiting (ready in a room), raid
  status(key) {
    let best = 'off';
    const order = { off: 0, lobby: 1, waiting: 2, raid: 3 };
    for (const cid of this.sessionsOf(key)) {
      const x = this.sessions.get(cid);
      const c = x.room?.clients.get(cid);
      const st = x.room?.inRaid?.(c) ? 'raid' : c?.ready ? 'waiting' : 'lobby';
      if (order[st] > order[best]) best = st;
    }
    return best;
  }

  card(key, viewer = null) {
    const p = this.social.get(key);
    if (!p) return null;
    const g = p.guild ? this.social.guilds.get(p.guild) : null;
    return { id: p.id, n: p.name, rk: this.ranks.get(key).rank, tt: this.ranks.title(key), st: this.status(key), seen: p.seen, g: g ? g.tag : null, rel: viewer ? this.social.relation(viewer, p.id) : null };
  }

  socialSummary(s) {
    const key = this.key(s);
    const p = key && this.social.get(key);
    if (!p) return null;
    return { me: p.id, unread: this.social.unreadTotal(key), requests: p.in.length, guild: p.guild, gUnread: this.social.guildUnread(key) };
  }

  pushTo(key, msg) {
    for (const cid of this.sessionsOf(key)) this.send(cid, msg);
  }

  socialOp(cid, s, msg) {
    const key = this.key(s);
    const reply = (m) => this.send(cid, m);
    const err = (text) => reply({ t: 'err', msg: text });
    if (!key || !this.social.get(key)) return err('Sign in first.');
    const S = this.social;
    const me = S.get(key);
    switch (msg.t) {
      case 'players': {
        // everyone registered, online first; 40 at a time
        const page = Math.max(0, Math.floor(Number(msg.page) || 0));
        const all = S.search(msg.q, (k) => this.sessionsOf(k).length > 0).filter((x) => x.key !== key);
        return reply({ t: 'players', q: String(msg.q ?? ''), page, total: all.length, list: all.slice(page * 40, page * 40 + 40).map((x) => this.card(x.key, key)) });
      }
      case 'profile': {
        const k = S.keyOf(msg.id);
        if (!k) return err('No such player.');
        const c = this.ranks.career(k);
        const g = S.guildOf(k);
        return reply({ t: 'profile', card: this.card(k, key), stats: c.stats, done: c.achievements?.filter?.((a) => a.done).length ?? 0, look: this.inventory.look(k), coll: this.inventory.showcase(k), guild: g ? { id: g.id, name: g.name, tag: g.tag } : null, created: S.get(k).created });
      }
      case 'friend': {
        const r = S.addFriend(key, String(msg.id ?? ''));
        if (r.error) return err(r.error);
        reply({ t: 'rel', id: String(msg.id), rel: r.rel });
        if (r.otherKey) this.pushTo(r.otherKey, { t: 'friendReq', from: this.card(key, r.otherKey), rel: S.relation(r.otherKey, me.id) });
        return;
      }
      case 'unfriend': {
        const r = S.dropFriend(key, String(msg.id ?? ''));
        if (r.error) return err(r.error);
        reply({ t: 'rel', id: String(msg.id), rel: 'none' });
        if (r.otherKey) this.pushTo(r.otherKey, { t: 'rel', id: me.id, rel: 'none' });
        return;
      }
      case 'friends': {
        const cards = (ids) => ids.map((id) => S.keyOf(id)).filter(Boolean).map((k) => this.card(k, key));
        const order = { raid: 3, waiting: 2, lobby: 1, off: 0 };
        return reply({ t: 'friends', friends: cards(me.friends).sort((a, b) => order[b.st] - order[a.st]), incoming: cards(me.in), outgoing: cards(me.out) });
      }
      case 'dm': {
        const r = S.dm(key, String(msg.to ?? ''), msg.text);
        if (r.error) return err(r.error);
        const m = { ...r.m, to: String(msg.to) };
        for (const c of this.sessionsOf(key)) this.send(c, { t: 'dm', m });
        this.pushTo(r.toKey, { t: 'dm', m, from: this.card(key, r.toKey), unread: S.unreadTotal(r.toKey) });
        return;
      }
      case 'dms': {
        const k = S.keyOf(msg.with);
        if (!k) return err('No such player.');
        return reply({ t: 'dms', with: this.card(k, key), list: S.thread(key, String(msg.with)), unread: S.unreadTotal(key) });
      }
      case 'inbox':
        return reply({ t: 'inbox', list: S.inbox(key).map((c) => ({ ...c, card: this.card(S.keyOf(c.id), key) })), unread: S.unreadTotal(key) });
      case 'guilds': {
        const list = [...S.guilds.values()].map((g) => ({ id: g.id, name: g.name, tag: g.tag, desc: g.desc, n: g.members.length, on: g.members.filter((id) => this.sessionsOf(S.keyOf(id)).length).length }));
        list.sort((a, b) => b.on - a.on || b.n - a.n);
        return reply({ t: 'guilds', list, mine: me.guild, can: S.canCreateGuild(key, this.ranks.get(key).rank), need: { rank: GUILD_RANK, purchases: 1 }, rank: this.ranks.get(key).rank, purchases: me.purchases ?? 0 });
      }
      case 'guild': {
        const g = S.guilds.get(String(msg.id ?? ''));
        if (!g) return err('No such guild.');
        const order = { raid: 3, waiting: 2, lobby: 1, off: 0 };
        const members = g.members.map((id) => this.card(S.keyOf(id), key)).filter(Boolean).sort((a, b) => order[b.st] - order[a.st]);
        return reply({ t: 'guild', guild: { ...g, members: undefined, ownerId: g.owner }, members, mine: me.guild === g.id });
      }
      case 'guild_create': {
        const r = S.createGuild(key, { name: msg.name, tag: msg.tag, desc: msg.desc }, this.ranks.get(key).rank);
        if (r.error) return reply({ t: 'guildErr', why: r.error });
        return reply({ t: 'guildDone', id: r.guild.id });
      }
      case 'guild_invite': {
        // ask anyone who has ever played into your guild: a card if they are online, and a
        // message in their inbox either way
        const g = me.guild && S.guilds.get(me.guild);
        if (!g) return err('Join or found a guild first.');
        const k = S.keyOf(msg.id);
        const them = k && S.get(k);
        if (!them || k === key) return err('No such player.');
        if (them.guild === g.id) return err('Already in your guild.');
        if (them.guild) return err('That player is in another guild.');
        const now = this.now();
        s.ginv ??= new Map();
        if (now - (s.ginv.get(k) ?? 0) < 30000) return err('Invite sent already. Give them a moment.');
        s.ginv.set(k, now);
        const guild = { id: g.id, name: g.name, tag: g.tag, n: g.members.length };
        this.pushTo(k, { t: 'guildInvited', from: this.card(key, k), guild });
        S.dm(key, them.id, `[${g.tag}] ${g.name}: guild invite → Guilds`); // waits in their inbox if they are away
        return reply({ t: 'ginvSent', id: String(msg.id) });
      }
      case 'guild_join': {
        const r = S.joinGuild(key, msg.id);
        if (r.error) return err(r.error);
        return reply({ t: 'guildDone', id: r.guild.id });
      }
      case 'guild_leave': {
        const r = S.leaveGuild(key);
        if (r.error) return err(r.error);
        return reply({ t: 'guildDone', id: null });
      }
      case 'guild_say': {
        const r = S.guildSay(key, msg.text);
        if (r.error) return err(r.error);
        const m = { ...r.m, n: me.name, rk: this.ranks.get(key).rank };
        // every member online gets it; the unread count rides along for their badge
        for (const id of r.guild.members) {
          const k = S.keyOf(id);
          if (k) this.pushTo(k, { t: 'guild_msg', gid: r.guild.id, m, gUnread: k === key ? 0 : S.guildUnread(k) });
        }
        return;
      }
      case 'guild_chat': {
        const g = S.guildOf(key);
        if (!g) return err('You are not in a guild.');
        const list = S.guildChat(key).map((m) => {
          const k = S.keyOf(m.f);
          const p = k && S.get(k);
          return { ...m, n: p?.name ?? '?', rk: k ? this.ranks.get(k).rank : 1 };
        });
        return reply({ t: 'guild_chat', gid: g.id, list, gUnread: 0 });
      }
      case 'guild_read':
        // the chat is on screen: new messages are read as they land
        S.guildChat(key);
        return;
      case 'invite': {
        // bring someone into the room you are waiting in
        const room = s.room;
        const c = room?.clients.get(cid);
        if (!room || !c || room.state === 'live' || room.inRaid?.(c)) return err('Open a room first (press Play), then invite.');
        const k = S.keyOf(msg.id);
        if (!k || !this.sessionsOf(k).length) return err('That player is offline.');
        if (this.status(k) === 'raid') return err('That player is in a raid right now.');
        const now = this.now();
        s.invites ??= new Map();
        if (now - (s.invites.get(k) ?? 0) < 15000) return err('Invite sent already. Give them a moment.');
        s.invites.set(k, now);
        this.pushTo(k, { t: 'invited', from: this.card(key, k), mode: room.mode, stake: room.stake, waiting: room.readyList().length });
        return reply({ t: 'invSent', id: String(msg.id) });
      }
      default:
    }
  }

  tick() {
    for (const [id, r] of this.rooms) {
      r.tick();
      // custom-stake tables go once nobody is at them and no raid runs
      if (r.custom && !r.clients.size && r.state !== 'live') this.rooms.delete(id);
    }
  }

  // periodic refresh for people browsing tables
  // after a regional match settled on this server: the player's new balance, career and locker
  refreshPlayer(key) {
    for (const cid of this.sessionsOf(key)) {
      const s = this.sessions.get(cid);
      this.send(cid, { t: 'balance', balances: this.balances(s) });
      this.send(cid, { t: 'career', career: this.ranks.career(key) });
      this.send(cid, { t: 'rank', rank: this.ranks.get(key) });
      this.send(cid, { t: 'locker', op: 'sync', locker: this.inventory.view(key) });
    }
  }

  // A restart is coming: give back every stake still on a table and tell everyone.
  abortAll() {
    const refunds = [];
    for (const room of this.rooms.values()) refunds.push(...room.abort());
    for (const [cid, s] of this.sessions) {
      if (!s.token) continue;
      this.send(cid, { t: 'err', code: 'restart', msg: 'The server is restarting for an update. Any stake on a table is back in your balance. Join again in a minute.' });
      s.room = null;
    }
    return refunds;
  }

  broadcastTables() {
    const t = this.tables();
    const online = this.online();
    for (const [cid, s] of this.sessions) {
      if (s.token && !s.room) this.send(cid, { t: 'tables', tables: t, online, balances: this.balances(s), assets: this.cashier ? this.prices.list() : undefined });
    }
  }
}
