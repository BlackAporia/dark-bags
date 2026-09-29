import { CFG, SKINS } from './config.js';
import { World } from './world.js';
import { cleanName } from './wallet.js';

/**
 * A table at one stake level. Runs raids back to back, moves sats between the
 * wallet and the raid, and routes snapshots/events to connected clients.
 * Transport-agnostic: the server plugs in WebSockets, offline mode plugs in
 * a direct callback.
 */
export class RoomCore {
  constructor({ stake, wallet, send, bots = true, roundSeconds = CFG.ROUND_SECONDS }) {
    this.stake = stake;
    this.wallet = wallet;
    this.send = send;
    this.bots = bots;
    this.roundSeconds = roundSeconds;
    this.clients = new Map();
    this.pidToken = new Map();
    this.world = null;
    this.state = 'idle';
    this.roundNo = 0;
    this.rollover = 0;
    this.interT = 0;
    this.tickN = 0;
    this.totals = { raids: 0, rake: 0, stakesIn: 0, paidOut: 0, sponsorIn: 0 };
  }

  addClient(cid, { token, name, skin }) {
    this.clients.set(cid, { cid, token, name: cleanName(name), skin: this.pickSkin(skin), pid: null, queued: false, reported: true });
    this.sendRoom(this.clients.get(cid));
  }

  removeClient(cid) {
    const c = this.clients.get(cid);
    if (!c) return;
    if (c.pid && this.world) this.world.freeze(c.pid);
    this.clients.delete(cid);
  }

  pickSkin(s) {
    return SKINS.includes(s) ? s : SKINS[Math.floor(Math.random() * SKINS.length)];
  }

  info() {
    const w = this.world;
    let humans = 0;
    if (w && this.state === 'live') for (const p of w.players.values()) if (!p.isBot && p.status === 'alive') humans++;
    return {
      stake: this.stake,
      state: this.state,
      tl: w && this.state === 'live' ? Math.round(w.timeLeft) : 0,
      canJoin: this.state !== 'live' || w.canJoin(),
      humans,
      watching: this.clients.size,
      round: this.roundNo,
      golden: !!(w && this.state === 'live' && w.golden),
      nextGolden: CFG.GOLDEN_EVERY > 0 && (this.roundNo + 1) % CFG.GOLDEN_EVERY === 0,
    };
  }

  handle(cid, msg) {
    const c = this.clients.get(cid);
    if (!c || !msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'join':
        if (msg.name) c.name = cleanName(msg.name);
        if (msg.skin) c.skin = this.pickSkin(msg.skin);
        this.join(c);
        break;
      case 'in':
        if (c.pid && this.world) this.world.queueInput(c.pid, msg);
        break;
      case 'bluff':
        if (c.pid && this.world) this.world.setBluff(c.pid, msg.v);
        break;
      case 'unqueue':
        c.queued = false;
        this.sendRoom(c);
        break;
      default:
    }
  }

  inRaid(c) {
    const p = c.pid && this.world ? this.world.players.get(c.pid) : null;
    return !!p && p.status === 'alive';
  }

  join(c) {
    if (this.inRaid(c)) return;
    if (this.state === 'idle') this.startRound(false);
    if (this.state === 'live' && this.world.canJoin()) {
      this.enter(c);
      return;
    }
    if (this.wallet.balance(c.token) < this.stake) {
      this.send(c.cid, { t: 'err', msg: 'Not enough sats for this table.' });
      return;
    }
    c.queued = true;
    this.sendRoom(c);
  }

  enter(c) {
    if (!this.wallet.debit(c.token, this.stake)) {
      c.queued = false;
      this.send(c.cid, { t: 'err', msg: 'Not enough sats for this table.' });
      return false;
    }
    const w = this.world;
    const p = w.addPlayer({ name: c.name, skin: c.skin });
    this.pidToken.set(p.id, c.token);
    c.pid = p.id;
    c.queued = false;
    c.reported = false;
    this.totals.stakesIn += this.stake;
    this.send(c.cid, {
      t: 'start',
      pid: p.id,
      map: w.map,
      zone: w.zonePlan,
      stake: this.stake,
      round: this.roundNo,
      golden: w.golden,
      duration: w.duration,
      time: w.time,
      balance: this.wallet.balance(c.token),
    });
    return true;
  }

  startRound(joinQueued = true) {
    this.roundNo++;
    const golden = CFG.GOLDEN_EVERY > 0 && this.roundNo % CFG.GOLDEN_EVERY === 0;
    this.world = new World({
      stake: this.stake,
      roundNo: this.roundNo,
      rolloverIn: this.rollover,
      golden,
      bots: this.bots,
      roundSeconds: this.roundSeconds,
    });
    this.rollover = 0;
    this.pidToken.clear();
    this.state = 'live';
    for (const c of this.clients.values()) {
      c.pid = null;
      c.reported = true;
      if (joinQueued && c.queued) this.enter(c);
    }
  }

  tick() {
    this.tickN++;
    if (this.state === 'live') {
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
        this.state = 'intermission';
        this.interT = CFG.INTERMISSION;
        for (const c of this.clients.values()) this.sendRoom(c);
      }
    } else if (this.state === 'intermission') {
      this.interT -= 1 / CFG.TICK_RATE;
      if (this.interT <= 0) {
        const anyQueued = [...this.clients.values()].some((c) => c.queued);
        if (anyQueued) this.startRound(true);
        else this.state = 'idle';
      }
    }
    if (this.tickN % CFG.TICK_RATE === 0) {
      for (const c of this.clients.values()) if (!this.inRaid(c)) this.sendRoom(c);
    }
  }

  sendRoom(c) {
    const i = this.info();
    this.send(c.cid, {
      t: 'room',
      ...i,
      interT: this.state === 'intermission' ? Math.ceil(this.interT) : 0,
      queued: c.queued,
      balance: this.wallet.balance(c.token),
    });
  }

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
        const token = this.pidToken.get(ev.pid);
        if (token) this.wallet.credit(token, ev.amount);
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
      c.reported = true;
      this.send(c.cid, {
        t: 'result',
        status: p.status,
        payout: p.payout,
        lost: p.lostBag,
        stake: p.stake,
        kills: p.kills,
        secs: Math.round((p.endedAt ?? w.time) - p.joinedAt),
        killer: p.killerName,
        cause: p.cause,
        balance: this.wallet.balance(c.token),
        canRejoin: w.canJoin(),
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
