import { CFG, SKINS } from './config.js';
import { mulberry32, hasLOS, segWalls, segCircle } from './geom.js';
import { generateMap, findSpawn, randomLootPoint } from './map.js';
import { stepMovement, sanitizeInput } from './movement.js';
import { BotBrain, botName } from './bot.js';

const DT = 1 / CFG.TICK_RATE;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * One raid. Authoritative simulation shared by the server and the offline mode.
 *
 * Economy (integer sats, conserved):
 *   each entry pays `stake` → rake to house, BAG_SHARE of the rest into the runner's
 *   own bag, the remainder into the loot pool that gets scattered on the map.
 *   Extract → you keep your bag. Die → your bag drops for anyone to take.
 *   Raid ends → everything still inside (bags of runners who didn't make it,
 *   loot on the floor, unspawned pool) rolls into the next raid.
 */
export class World {
  constructor({
    stake,
    seed = (Math.random() * 2 ** 32) >>> 0,
    roundNo = 1,
    rolloverIn = 0,
    golden = false,
    bots = true,
    roundSeconds = CFG.ROUND_SECONDS,
  }) {
    this.stake = stake;
    this.seed = seed;
    this.rnd = mulberry32(seed ^ 0x9e3779b9);
    this.map = generateMap(seed);
    this.nav = null; // built lazily by the first bot
    this.roundNo = roundNo;
    this.golden = golden;
    this.duration = roundSeconds;
    this.time = 0;
    this.tick = 0;
    this.phase = 'live';
    this.nextId = 1;
    this.players = new Map();
    this.orbs = new Map();
    this.drops = new Map();
    this.bullets = new Map();
    this.events = [];
    this.botsEnabled = bots;
    this.brains = new Map();
    this.lootPool = 0;
    this.spawnBudget = 0;
    this.botJoinT = 0;
    this.warned = {};
    this.ledger = {
      stakesIn: 0, botStakesIn: 0, sponsorIn: 0, rolloverIn: 0,
      rake: 0, paidOut: 0, botPaidOut: 0, rolloverOut: 0,
    };
    this.ledger.rolloverIn = rolloverIn;
    this.lootPool += rolloverIn;
    if (golden) {
      const bonus = stake * CFG.GOLDEN_BONUS;
      this.ledger.sponsorIn += bonus;
      this.lootPool += bonus;
    }
  }

  get timeLeft() {
    return Math.max(0, this.duration - this.time);
  }

  aliveCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.status === 'alive') n++;
    return n;
  }

  canJoin() {
    return this.phase === 'live' && this.timeLeft > CFG.JOIN_CUTOFF && this.aliveCount() < CFG.MAX_PLAYERS;
  }

  emit(ev) {
    this.events.push(ev);
  }

  // ---------------------------------------------------------------- entry

  addPlayer({ name, skin, isBot = false }) {
    if (!this.canJoin()) throw new Error('raid closed');
    const stake = this.stake;
    const rake = Math.floor(stake * CFG.RAKE);
    const net = stake - rake;
    const bag = Math.floor(net * CFG.BAG_SHARE);
    const loot = net - bag;
    if (isBot) this.ledger.botStakesIn += stake;
    else this.ledger.stakesIn += stake;
    this.ledger.rake += rake;
    this.lootPool += loot;

    const others = [...this.players.values()].filter((o) => o.status === 'alive');
    const pos = findSpawn(this.map, this.rnd, others);
    const p = {
      id: this.nextId++,
      name,
      skin,
      isBot,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      dashT: 0,
      dashCd: 0,
      dashDx: 0,
      dashDy: 0,
      aim: 0,
      hp: CFG.HP,
      shield: CFG.SPAWN_SHIELD,
      bag,
      startBag: bag,
      stake,
      fireCd: 0,
      lastHit: -99,
      ext: 0,
      extId: -1,
      status: 'alive',
      kills: 0,
      bluff: 1,
      ack: 0,
      queue: [],
      last: sanitizeInput({}),
      joinedAt: this.time,
      endedAt: null,
      killer: null,
      killerName: null,
      lostBag: 0,
      payout: 0,
    };
    this.players.set(p.id, p);
    if (isBot) this.brains.set(p.id, new BotBrain(this, p, this.rnd));
    return p;
  }

  queueInput(id, raw) {
    const p = this.players.get(id);
    if (!p || p.status !== 'alive' || p.isBot) return;
    const inp = sanitizeInput(raw);
    if (inp.s <= p.ack || (p.queue.length && inp.s <= p.queue[p.queue.length - 1].s)) return;
    p.queue.push(inp);
    // a client that bursts inputs doesn't get to bank movement
    if (p.queue.length > 8) p.queue.splice(0, p.queue.length - 3);
  }

  // Idle a runner whose owner disconnected. The body stays in the raid.
  freeze(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.queue.length = 0;
    p.last = sanitizeInput({ s: p.ack });
  }

  setBluff(id, v) {
    const p = this.players.get(id);
    if (p && Number.isInteger(v) && v >= 0 && v <= 2) p.bluff = v;
  }

  // ----------------------------------------------------------------- tick

  step() {
    if (this.phase !== 'live') return;
    if (this.tick === 0) {
      this.fillBots(true);
      this.openingBurst();
    }
    this.tick++;
    this.time += DT;

    for (const [id, brain] of this.brains) {
      const p = this.players.get(id);
      if (p.status === 'alive') brain.think(DT);
    }

    for (const p of this.players.values()) {
      if (p.status !== 'alive') continue;
      let inp;
      if (p.isBot) inp = p.botInput;
      else if (p.queue.length) {
        inp = p.queue.shift();
        p.ack = inp.s;
        p.last = inp;
      } else {
        inp = p.last.d ? { ...p.last, d: false } : p.last;
      }
      const ox = p.x;
      const oy = p.y;
      stepMovement(p, inp, DT, this.map);
      p.vx = (p.x - ox) / DT;
      p.vy = (p.y - oy) / DT;
      p.aim = inp.a;

      if (p.shield > 0) p.shield = Math.max(0, p.shield - DT);
      if (p.fireCd > 0) p.fireCd = Math.max(0, p.fireCd - DT);
      if (inp.f && p.fireCd <= 0) {
        p.shield = 0;
        this.fire(p);
      }

      if (p.hp < CFG.HP && this.time - p.lastHit > CFG.REGEN_DELAY) {
        p.hp = Math.min(CFG.HP, p.hp + CFG.REGEN_RATE * DT);
      }

      let zone = null;
      for (const e of this.map.extracts) {
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.r) zone = e;
      }
      if (zone) {
        if (p.extId !== zone.id) {
          p.ext = 0;
          p.extId = zone.id;
        }
        p.ext += DT / CFG.EXTRACT_TIME;
        if (p.ext >= 1 - 1e-9) this.extract(p);
      } else {
        p.ext = 0;
        p.extId = -1;
      }
    }

    this.stepBullets();
    this.pickups();
    this.spawnLoot();
    this.fillBots(false);
    this.announce();
    if (this.time >= this.duration - 1e-9) this.end();
  }

  fire(p) {
    p.fireCd = CFG.FIRE_CD;
    const c = Math.cos(p.aim);
    const s = Math.sin(p.aim);
    const sx = p.x + c * (CFG.PLAYER_R + 4);
    const sy = p.y + s * (CFG.PLAYER_R + 4);
    if (segWalls(p.x, p.y, sx, sy, this.map.walls) >= 0) return;
    const b = { id: this.nextId++, owner: p.id, x: sx, y: sy, vx: c * CFG.BULLET_SPEED, vy: s * CFG.BULLET_SPEED, dist: 0 };
    this.bullets.set(b.id, b);
  }

  stepBullets() {
    const walls = this.map.walls;
    for (const b of this.bullets.values()) {
      const nx = b.x + b.vx * DT;
      const ny = b.y + b.vy * DT;
      const tWall = segWalls(b.x, b.y, nx, ny, walls);
      let tMin = tWall >= 0 ? tWall : 1.0001;
      let victim = null;
      for (const p of this.players.values()) {
        if (p.status !== 'alive' || p.id === b.owner) continue;
        const t = segCircle(b.x, b.y, nx, ny, p.x, p.y, CFG.PLAYER_R + 3);
        if (t >= 0 && t < tMin) {
          tMin = t;
          victim = p;
        }
      }
      if (victim) {
        this.bullets.delete(b.id);
        this.damage(victim, this.players.get(b.owner));
        continue;
      }
      if (tWall >= 0) {
        this.bullets.delete(b.id);
        continue;
      }
      b.x = nx;
      b.y = ny;
      b.dist += CFG.BULLET_SPEED * DT;
      if (b.dist > CFG.BULLET_RANGE || nx < 0 || ny < 0 || nx > this.map.w || ny > this.map.h) this.bullets.delete(b.id);
    }
  }

  damage(v, shooter) {
    if (v.shield > 0) return;
    v.hp -= CFG.BULLET_DMG;
    v.lastHit = this.time;
    v.ext = 0;
    this.emit({ k: 'hit', to: shooter ? [v.id, shooter.id] : [v.id], vid: v.id, sid: shooter?.id ?? 0, x: r1(v.x), y: r1(v.y) });
    if (v.hp <= 0) this.kill(v, shooter);
  }

  kill(v, killer) {
    v.hp = 0;
    v.status = 'dead';
    v.endedAt = this.time;
    v.lostBag = v.bag;
    v.killer = killer?.id ?? null;
    v.killerName = killer?.name ?? null;
    if (v.bag > 0) {
      const d = { id: this.nextId++, x: v.x, y: v.y, v: v.bag };
      this.drops.set(d.id, d);
    }
    v.bag = 0;
    if (killer) killer.kills++;
    // public feed: names only, never amounts
    this.emit({ k: 'kill', killer: killer?.name ?? null, victim: v.name, kid: killer?.id ?? 0, vid: v.id });
  }

  extract(p) {
    p.status = 'extracted';
    p.endedAt = this.time;
    p.payout = p.bag;
    if (p.isBot) this.ledger.botPaidOut += p.bag;
    else this.ledger.paidOut += p.bag;
    p.bag = 0;
    this.emit({ k: 'payout', to: [p.id], pid: p.id, amount: p.payout });
    this.emit({ k: 'extract', name: p.name, pid: p.id });
  }

  pickups() {
    for (const p of this.players.values()) {
      if (p.status !== 'alive') continue;
      for (const o of this.orbs.values()) {
        const r = CFG.PLAYER_R + CFG.ORB_TIERS[o.t].r;
        if (Math.abs(o.x - p.x) > r || Math.abs(o.y - p.y) > r) continue;
        if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 < r * r) {
          p.bag += o.v;
          this.orbs.delete(o.id);
          this.emit({ k: 'pickup', to: [p.id], v: o.v, t: o.t, x: r1(o.x), y: r1(o.y) });
        }
      }
      for (const d of this.drops.values()) {
        if ((d.x - p.x) ** 2 + (d.y - p.y) ** 2 < (CFG.PLAYER_R + 14) ** 2) {
          p.bag += d.v;
          this.drops.delete(d.id);
          // only the looter learns what was inside
          this.emit({ k: 'loot', to: [p.id], v: d.v, x: r1(d.x), y: r1(d.y) });
        }
      }
    }
  }

  // ----------------------------------------------------------------- loot

  pickTier() {
    const tiers = CFG.ORB_TIERS;
    const weights = tiers.map((t, i) => (this.golden && i === tiers.length - 1 ? t.w * 3 : t.w));
    let roll = this.rnd() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < tiers.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return i;
    }
    return 0;
  }

  spawnOrb() {
    if (this.lootPool <= 0 || this.orbs.size >= CFG.MAX_ORBS) return 0;
    let t = this.pickTier();
    const nominal = Math.max(1, Math.round(this.stake * CFG.ORB_TIERS[t].pct));
    const v = Math.min(nominal, this.lootPool);
    while (t > 0 && v < Math.round(this.stake * CFG.ORB_TIERS[t].pct) * 0.5) t--;
    const pos = randomLootPoint(this.map, this.rnd, t === CFG.ORB_TIERS.length - 1);
    if (!pos) return 0;
    const o = { id: this.nextId++, x: pos.x, y: pos.y, v, t };
    this.orbs.set(o.id, o);
    this.lootPool -= v;
    return v;
  }

  openingBurst() {
    const target = Math.floor(this.lootPool * CFG.OPENING_BURST);
    let spent = 0;
    while (spent < target) {
      const v = this.spawnOrb();
      if (!v) break;
      spent += v;
    }
  }

  // spread the remaining pool over the rest of the raid
  spawnLoot() {
    if (this.lootPool <= 0) return;
    const horizon = Math.max(8, this.timeLeft - 20);
    this.spawnBudget += (this.lootPool / horizon) * DT;
    for (let guard = 0; guard < 6 && this.spawnBudget > 0 && this.lootPool > 0; guard++) {
      const v = this.spawnOrb();
      if (!v) break;
      this.spawnBudget -= v;
    }
  }

  fillBots(initial) {
    if (!this.botsEnabled || !this.canJoin()) return;
    const alive = this.aliveCount();
    if (initial) {
      for (let i = alive; i < CFG.BOT_FILL; i++) this.addBot();
      return;
    }
    this.botJoinT -= DT;
    if (this.botJoinT <= 0) {
      this.botJoinT = 5 + this.rnd() * 6;
      if (alive < CFG.BOT_FILL - 1) this.addBot();
    }
  }

  addBot() {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const skin = SKINS[Math.floor(this.rnd() * SKINS.length)];
    return this.addPlayer({ name: botName(this.rnd, taken), skin, isBot: true });
  }

  announce() {
    const tl = this.timeLeft;
    const say = (key, text) => {
      if (this.warned[key]) return;
      this.warned[key] = true;
      this.emit({ k: 'warn', text });
    };
    if (tl <= CFG.JOIN_CUTOFF) say('cutoff', `${CFG.JOIN_CUTOFF}s left · raid sealed`);
    if (tl <= 30) say('30', '30s · get to an exit');
    if (tl <= 10) say('10', '10s · extract or lose it all');
  }

  end() {
    this.phase = 'ended';
    for (const p of this.players.values()) {
      if (p.status !== 'alive') continue;
      p.status = 'mia';
      p.endedAt = this.time;
      p.lostBag = p.bag;
      this.ledger.rolloverOut += p.bag;
      p.bag = 0;
    }
    for (const o of this.orbs.values()) this.ledger.rolloverOut += o.v;
    for (const d of this.drops.values()) this.ledger.rolloverOut += d.v;
    this.ledger.rolloverOut += this.lootPool;
    this.orbs.clear();
    this.drops.clear();
    this.bullets.clear();
    this.lootPool = 0;
    this.emit({ k: 'end' });
  }

  // --------------------------------------------------------- accounting

  inWorld() {
    let s = this.lootPool;
    for (const p of this.players.values()) if (p.status === 'alive') s += p.bag;
    for (const o of this.orbs.values()) s += o.v;
    for (const d of this.drops.values()) s += d.v;
    return s;
  }

  audit() {
    const L = this.ledger;
    const inflow = L.stakesIn + L.botStakesIn + L.sponsorIn + L.rolloverIn;
    const accounted = L.rake + L.paidOut + L.botPaidOut + L.rolloverOut + this.inWorld();
    return { ok: inflow === accounted, inflow, accounted };
  }

  // ----------------------------------------------------------- perception

  canSee(eye, p) {
    const walls = this.map.walls;
    if (hasLOS(eye.x, eye.y, p.x, p.y, walls)) return true;
    // edges of the body, so a shoulder poking out of cover is visible
    const dx = p.x - eye.x;
    const dy = p.y - eye.y;
    const d = Math.hypot(dx, dy) || 1;
    const ox = (-dy / d) * CFG.PLAYER_R * 0.9;
    const oy = (dx / d) * CFG.PLAYER_R * 0.9;
    return hasLOS(eye.x, eye.y, p.x + ox, p.y + oy, walls) || hasLOS(eye.x, eye.y, p.x - ox, p.y - oy, walls);
  }

  visibleEnemies(me) {
    const out = [];
    const V2 = CFG.VISION * CFG.VISION;
    for (const p of this.players.values()) {
      if (p === me || p.status !== 'alive') continue;
      const d2 = (p.x - me.x) ** 2 + (p.y - me.y) ** 2;
      if (d2 > V2) continue;
      if (this.canSee(me, p)) out.push(p);
    }
    return out;
  }

  /**
   * What one runner is allowed to know. This is the privacy boundary:
   * other runners' bags are never serialised, only their own-chosen bluff size,
   * and runners out of sight (distance or walls) are not sent at all.
   */
  snapshotFor(id) {
    const me = this.players.get(id);
    if (!me) return null;
    let eye = me;
    if (me.status === 'dead' && me.killer) {
      const k = this.players.get(me.killer);
      if (k && k.status === 'alive') eye = k;
    }
    const V = CFG.VISION + 30;
    const V2 = V * V;
    const near = (x, y, pad = 0) => (x - eye.x) ** 2 + (y - eye.y) ** 2 < (V + pad) ** 2;

    const players = [];
    for (const p of this.players.values()) {
      if (p === me || p.status !== 'alive') continue;
      if ((p.x - eye.x) ** 2 + (p.y - eye.y) ** 2 > V2) continue;
      if (p !== eye && !this.canSee(eye, p)) continue;
      players.push({
        i: p.id,
        n: p.name,
        c: p.skin,
        x: r1(p.x),
        y: r1(p.y),
        a: r2(p.aim),
        h: Math.ceil(p.hp),
        b: p.bluff,
        e: p.ext > 0 ? r2(p.ext) : 0,
        d: p.dashT > 0 ? 1 : 0,
        s: p.shield > 0 ? 1 : 0,
      });
    }
    const orbs = [];
    for (const o of this.orbs.values()) if (near(o.x, o.y, 40)) orbs.push({ i: o.id, x: r1(o.x), y: r1(o.y), t: o.t });
    const drops = [];
    for (const d of this.drops.values()) if (near(d.x, d.y, 40)) drops.push({ i: d.id, x: r1(d.x), y: r1(d.y) });
    const bullets = [];
    for (const b of this.bullets.values()) {
      if (near(b.x, b.y, 120)) bullets.push({ i: b.id, x: r1(b.x), y: r1(b.y), vx: r1(b.vx), vy: r1(b.vy), o: b.owner === me.id ? 1 : 0 });
    }

    return {
      time: Math.round(this.time * 1000),
      tl: r2(this.timeLeft),
      alive: this.aliveCount(),
      golden: this.golden,
      you: {
        i: me.id,
        x: me.x,
        y: me.y,
        dashT: me.dashT,
        dashCd: me.dashCd,
        dashDx: me.dashDx,
        dashDy: me.dashDy,
        hp: Math.ceil(me.hp),
        shield: r2(me.shield),
        bag: me.bag,
        stake: me.stake,
        st: me.status,
        fireCd: r2(me.fireCd),
        ext: r2(me.ext),
        bluff: me.bluff,
        k: me.kills,
        ack: me.ack,
        ex: r1(eye.x),
        ey: r1(eye.y),
        spect: eye !== me ? eye.name : null,
      },
      players,
      orbs,
      drops,
      bullets,
    };
  }
}
