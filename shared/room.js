import { CFG, SKINS } from './config.js';
import { World } from './world.js';
import { cleanName } from './wallet.js';
import { botName } from './bot.js';
import { PriceBook, unitsAtEntryRate } from './assets.js';
import { RankBook, botRank, raidXp } from './ranks.js';
import { raidStats } from './achievements.js';
import { MODE } from './modes.js';
import { Inventory, botLook, OUTFIT } from './cosmetics.js';

/**
 * A table at one stake level.
 *
 *   idle ──first visitor──▶ prep ──countdown hits 0──▶ live ──raid ends──▶ results ──▶ prep …
 *
 * prep is the MOBA-style ready room: pressing Ready escrows the stake and lights up
 * your icon; the first Ready starts the countdown; bots light up in the last seconds.
 * Everyone who is ready enters together, equal, at the same moment. No mid-raid joins.
 *
 * Transport-agnostic: the server plugs in WebSockets, offline mode a direct callback.
 */
export class RoomCore {
  constructor({ stake, mode = 'raid', wallet, send, prices = new PriceBook(), ranks = new RankBook(), inventory = new Inventory(), practice = false, bots = true, roundSeconds = CFG.ROUND_SECONDS, prepSeconds = CFG.PREP_SECONDS }) {
    this.stake = stake;
    this.mode = MODE[mode] ? mode : 'raid';
    const m = MODE[this.mode];
    if (m.seconds) roundSeconds = m.seconds;
    this.ranks = ranks;
    this.inventory = inventory;
    this.practice = practice;
    this.wallet = wallet;
    this.prices = prices;
    this.send = send;
    this.bots = bots;
    this.roundSeconds = roundSeconds;
    this.prepSeconds = prepSeconds;
    this.botFill = m.size; // runners per raid; bots fill the empty spots
    this.difficulty = null; // practice only
    this.clients = new Map();
    this.accounts = new Map(); // pid -> { token, asset, units, mills }: who paid what, at which rate
    this.world = null;
    this.state = 'idle';
    this.countT = null; // seconds left on the ready-room countdown; null = waiting for a first Ready
    this.resT = 0;
    this.roster = [];
    this.roundNo = 0;
    this.rollover = 0;
    this.jackpot = 0; // fed by part of the rake on players' stakes, paid out as golden raids
    this.tickN = 0;
    this.totals = { raids: 0, rake: 0, stakesIn: 0, paidOut: 0, sponsorIn: 0, byAsset: {} };
  }

  // --------------------------------------------------------------- clients

  addClient(cid, { token, name, skin }) {
    this.clients.set(cid, { cid, token, name: cleanName(name), skin: this.pickSkin(skin), pid: null, ready: false, escrow: null, reported: true });
    if (this.state === 'idle') this.openPrep();
    this.broadcastPrep();
  }

  removeClient(cid) {
    const c = this.clients.get(cid);
    if (!c) return;
    if (c.ready) this.refund(c);
    if (c.pid && this.world && this.state === 'live') this.world.freeze(c.pid); // the body stays in the raid
    this.clients.delete(cid);
    if (this.state === 'prep' && !this.readyList().length) this.countT = null;
    if (!this.clients.size && this.state === 'prep') this.state = 'idle';
    this.broadcastPrep();
  }

  pickSkin(s) {
    return SKINS.includes(s) ? s : SKINS[Math.floor(Math.random() * SKINS.length)];
  }

  readyList() {
    return [...this.clients.values()].filter((c) => c.ready);
  }

  inRaid(c) {
    const p = c.pid && this.world && this.state === 'live' ? this.world.players.get(c.pid) : null;
    return !!p && p.status === 'alive';
  }

  handle(cid, msg) {
    const c = this.clients.get(cid);
    if (!c || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'join':
        if (msg.name) c.name = cleanName(msg.name);
        if (msg.skin) c.skin = this.pickSkin(msg.skin);
        this.broadcastPrep();
        break;
      case 'ready':
        if (msg.name) c.name = cleanName(msg.name);
        if (msg.skin) c.skin = this.pickSkin(msg.skin);
        this.ready(c, typeof msg.asset === 'string' ? msg.asset : 'USDC');
        break;
      case 'unready':
        this.unready(c);
        break;
      case 'in':
        if (c.pid && this.world && this.state === 'live') this.world.queueInput(c.pid, msg);
        break;
      case 'watch':
        if (c.pid && this.world && this.state === 'live') this.world.watch(c.pid, Math.sign(Number(msg.d) || 0));
        break;
      case 'buy':
        if (c.pid && this.world && this.state === 'live') this.world.buy(c.pid, String(msg.item));
        break;
      case 'bluff':
        if (c.pid && this.world && this.state === 'live') this.world.setBluff(c.pid, msg.v);
        break;
      default:
    }
  }

  // ------------------------------------------------------------ ready room

  // Ready: quote the $ stake in the chosen token and escrow it at that rate.
  ready(c, asset) {
    if (c.ready || this.inRaid(c)) return;
    const units = this.prices.quote(asset, this.stake);
    if (units === null) {
      this.send(c.cid, { t: 'err', msg: 'That token has no price right now, so it cannot be staked.' });
      return;
    }
    if (!this.wallet.debit(c.token, asset, units)) {
      const sym = this.prices.get(asset)?.symbol ?? asset;
      this.send(c.cid, { t: 'err', msg: `Not enough ${sym} for this table.` });
      return;
    }
    c.ready = true;
    c.escrow = { asset, units, mills: this.stake };
    if (this.state === 'idle') this.openPrep();
    if (this.state === 'prep' && this.countT === null) this.countT = this.prepSeconds;
    this.hurry();
    this.broadcastPrep();
  }

  unready(c) {
    if (!c.ready) return;
    this.refund(c);
    if (this.state === 'prep' && !this.readyList().length) this.countT = null;
    this.broadcastPrep();
  }

  refund(c) {
    if (c.escrow) this.wallet.credit(c.token, c.escrow.asset, c.escrow.units);
    c.escrow = null;
    c.ready = false;
  }

  book(asset, key, units) {
    const t = (this.totals.byAsset[asset] ??= { in: 0n, out: 0n });
    t[key] += BigInt(units);
  }

  // everyone in the room is ready (and there are at least two humans): don't make them wait
  hurry() {
    if (this.state !== 'prep' || this.countT === null) return;
    const all = [...this.clients.values()];
    const ready = all.filter((c) => c.ready);
    if (ready.length >= 2 && ready.length === all.length) this.countT = Math.min(this.countT, CFG.PREP_ALL_READY);
  }

  openPrep() {
    this.state = 'prep';
    this.countT = this.readyList().length ? this.prepSeconds : null;
    // bots for the next raid are rolled now so their icons can light up by name
    const taken = new Set();
    this.roster = [];
    for (let i = 0; i < this.botFill; i++) {
      const n = botName(Math.random, taken);
      taken.add(n);
      const look = botLook(Math.random);
      this.roster.push({ name: n, skin: OUTFIT[look.outfit].color, rank: botRank(Math.random), ...look });
    }
    this.hurry();
  }

  // Golden raids are paid by the room's jackpot, never by the house: every Nth raid, if the
  // jackpot holds at least one stake. Practice is play money, so it is always sponsored.
  goldenBonus(round) {
    if (!(CFG.GOLDEN_EVERY > 0 && round % CFG.GOLDEN_EVERY === 0)) return 0;
    const full = this.stake * CFG.GOLDEN_BONUS;
    if (this.practice) return full;
    return this.jackpot >= this.stake ? Math.min(full, this.jackpot) : 0;
  }

  botsNeeded() {
    return this.bots ? Math.max(0, this.botFill - this.readyList().length) : 0;
  }

  botsShown() {
    if (this.state !== 'prep' || this.countT === null) return 0;
    const k = Math.min(1, Math.max(0, (CFG.BOT_REVEAL - this.countT) / CFG.BOT_REVEAL));
    return Math.floor(this.botsNeeded() * k);
  }

  startRaid() {
    const ready = this.readyList();
    this.roundNo++;
    const bonus = this.goldenBonus(this.roundNo);
    this.jackpot -= bonus;
    const w = new World({
      stake: this.stake,
      roundNo: this.roundNo,
      rolloverIn: this.rollover,
      bonus,
      bots: this.bots,
      botRoster: this.roster,
      roundSeconds: this.roundSeconds,
      practice: this.practice,
      difficulty: this.difficulty,
      botFill: this.botFill,
      mode: this.mode,
    });
    this.world = w;
    this.rollover = 0;
    this.accounts.clear();
    this.state = 'live';
    this.countT = null;
    for (const c of this.clients.values()) {
      c.pid = null;
      c.reported = true;
    }
    for (const c of ready) {
      const look = this.inventory.look(c.token);
      const p = w.addPlayer({ name: c.name, skin: OUTFIT[look.outfit].color, rank: this.ranks.get(c.token).rank, title: this.ranks.title(c.token), ...look });
      this.accounts.set(p.id, { token: c.token, ...c.escrow });
      this.book(c.escrow.asset, 'in', c.escrow.units);
      c.pid = p.id;
      c.ready = false;
      c.escrow = null; // the stake is in the raid's ledger now
      c.reported = false;
      this.totals.stakesIn += this.stake;
      this.jackpot += Math.floor(this.stake * CFG.RAKE * CFG.JACKPOT_SHARE);
      this.send(c.cid, {
        t: 'start',
        pid: p.id,
        map: w.map,
        zone: w.zonePlan,
        stake: this.stake,
        mode: this.mode,
        teamSize: w.teamSize,
        round: this.roundNo,
        golden: w.golden,
        duration: w.duration,
        time: w.time,
        asset: this.accounts.get(p.id).asset,
        look,
        balances: this.wallet.balances(c.token),
      });
    }
    this.broadcastPrep();
  }

  // ------------------------------------------------------------------ tick

  tick() {
    this.tickN++;
    const dt = 1 / CFG.TICK_RATE;
    if (this.state === 'prep') {
      if (this.countT !== null) {
        this.countT -= dt;
        if (this.countT <= 0) {
          if (this.readyList().length) this.startRaid();
          else this.countT = null;
        }
      }
      if (this.tickN % 6 === 0) this.broadcastPrep();
    } else if (this.state === 'live') {
      const w = this.world;
      w.step();
      this.flushEvents();
      this.reportEnds();
      if (this.tickN % CFG.SNAP_EVERY === 0) this.sendSnaps();
      if (w.phase === 'ended') {
        this.rollover = w.ledger.rolloverOut;
        this.totals.raids++;
        this.totals.rake += w.ledger.rake;
        this.totals.paidOut += w.ledger.paidOut;
        this.totals.sponsorIn += w.ledger.sponsorIn;
        this.state = 'results';
        this.resT = CFG.INTERMISSION;
        this.broadcastPrep();
      } else if (this.tickN % CFG.TICK_RATE === 0) this.broadcastPrep(true);
    } else if (this.state === 'results') {
      this.resT -= dt;
      if (this.resT <= 0) {
        if (this.clients.size) this.openPrep();
        else this.state = 'idle';
        this.broadcastPrep();
      }
    }
  }

  info() {
    const w = this.world;
    let humans = 0;
    if (w && this.state === 'live') for (const p of w.players.values()) if (!p.isBot && p.status === 'alive') humans++;
    return {
      stake: this.stake,
      mode: this.mode,
      size: this.botFill,
      state: this.state,
      tl: w && this.state === 'live' ? Math.round(w.timeLeft) : 0,
      count: this.countT === null ? null : Math.max(0, Math.ceil(this.countT)),
      ready: this.readyList().length,
      humans,
      watching: this.clients.size,
      round: this.roundNo,
      golden: !!(w && this.state === 'live' && w.golden),
      nextGolden: this.goldenBonus(this.roundNo + 1) > 0,
      jackpot: this.practice ? 0 : this.jackpot,
    };
  }

  // The ready room view. onlyIdle: skip clients who are busy inside the raid.
  broadcastPrep(onlyIdle = false) {
    const ready = this.readyList();
    const shown = this.botsShown();
    const bots = this.roster.slice(0, shown).map((b) => ({ n: b.name, c: b.skin, rk: b.rank, o: b.outfit, g: b.body, bot: 1 }));
    const base = {
      t: 'prep',
      state: this.state,
      stake: this.stake,
      round: this.roundNo + (this.state === 'live' || this.state === 'results' ? 1 : 1),
      golden: this.goldenBonus(this.roundNo + 1) > 0,
      count: this.countT === null ? null : Math.max(0, Math.round(this.countT * 10) / 10),
      tl: this.world && this.state === 'live' ? Math.round(this.world.timeLeft) : 0,
      resT: this.state === 'results' ? Math.ceil(this.resT) : 0,
      slotsTotal: Math.max(this.botFill, ready.length),
      bots,
      pot: (ready.length + (this.state === 'prep' ? shown : 0)) * this.stake,
    };
    for (const c of this.clients.values()) {
      if (onlyIdle && this.inRaid(c)) continue;
      this.send(c.cid, {
        ...base,
        slots: ready.map((r) => {
          const look = this.inventory.look(r.token);
          return { n: r.name, c: OUTFIT[look.outfit].color, o: look.outfit, g: look.body, rk: this.ranks.get(r.token).rank, me: r === c ? 1 : 0 };
        }),
        me: { ready: c.ready, inRaid: this.inRaid(c), escrow: c.escrow && { asset: c.escrow.asset, units: c.escrow.units.toString() } },
        balances: this.wallet.balances(c.token),
      });
    }
  }

  // ---------------------------------------------------------------- output

  flushEvents() {
    const w = this.world;
    if (!w.events.length) return;
    const per = new Map();
    const push = (cid, ev) => {
      if (!per.has(cid)) per.set(cid, []);
      per.get(cid).push(ev);
    };
    const byPid = new Map();
    for (const c of this.clients.values()) if (c.pid) byPid.set(c.pid, c);
    for (const ev of w.events) {
      if (ev.k === 'payout') {
        // pay out in the token they entered with, at their entry rate
        const acct = this.accounts.get(ev.pid);
        if (acct) {
          const units = unitsAtEntryRate(acct, ev.amount);
          acct.paidUnits = units;
          this.wallet.credit(acct.token, acct.asset, units);
          this.book(acct.asset, 'out', units);
        }
      }
      if (ev.to) {
        for (const pid of ev.to) {
          const c = byPid.get(pid);
          if (c) push(c.cid, ev);
        }
      } else {
        for (const c of byPid.values()) push(c.cid, ev);
      }
    }
    w.events.length = 0;
    for (const [cid, l] of per) this.send(cid, { t: 'ev', l });
  }

  reportEnds() {
    const w = this.world;
    for (const c of this.clients.values()) {
      if (!c.pid || c.reported) continue;
      const p = w.players.get(c.pid);
      if (!p || p.status === 'alive') continue;
      // pot modes: the fallen learn the outcome when the raid is settled (they watch meanwhile)
      if (w.potMode && p.status === 'dead' && w.phase !== 'ended') continue;
      c.reported = true;
      // career rank: every raid pays, win or lose
      const earned = raidXp(p, { practice: this.practice });
      // achievements: career counters, each completed one pays its XP once
      const stats = raidStats(p, { golden: w.golden, lastExit: p.status === 'extracted' && p.extId === w.zonePlan.finalExit });
      const done = this.ranks.progress(c.token, { ...stats, outfits: this.inventory.view(c.token).owned.length });
      for (const a of done) if (a.xp) earned.parts.push({ label: 'Achievement', ach: a.id, xp: a.xp });
      earned.total += done.reduce((s, a) => s + a.xp, 0);
      const { before, after } = this.ranks.add(c.token, earned.total);
      done.push(...this.ranks.progress(c.token, { rank: after.rank }));
      // every rank gained pays a luck bag, $ credit and a 72h trial outfit
      const rewards = this.inventory.rankUp(c.token, before.rank, after.rank);
      this.send(c.cid, {
        t: 'result',
        rewards,
        locker: this.inventory.view(c.token),
        rank: { gained: earned.total, parts: earned.parts, before, after },
        achievements: done.map((a) => a.id),
        career: this.ranks.career(c.token),
        status: p.status,
        mode: this.mode,
        won: !!p.won,
        payout: p.payout,
        lost: p.lostBag,
        stake: p.stake,
        kills: p.kills,
        ...(w.dm ? { deaths: p.deaths, place: w.standings().indexOf(p) + 1, top: w.standings()[0]?.kills ?? 0 } : {}),
        secs: Math.round((p.endedAt ?? w.time) - p.joinedAt),
        killer: p.killerName,
        cause: p.cause,
        asset: this.accounts.get(p.id)?.asset,
        stakeUnits: this.accounts.get(p.id)?.units?.toString(),
        payoutUnits: (this.accounts.get(p.id)?.paidUnits ?? 0n).toString(),
        balances: this.wallet.balances(c.token),
        round: this.roundNo,
      });
    }
  }

  sendSnaps() {
    const w = this.world;
    for (const c of this.clients.values()) {
      if (!c.pid) continue;
      const p = w.players.get(c.pid);
      if (!p || p.status === 'extracted' || p.status === 'mia') continue;
      const snap = w.snapshotFor(c.pid);
      if (snap) this.send(c.cid, { t: 'snap', ...snap });
    }
  }
}
