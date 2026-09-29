import { CFG, SKINS } from './config.js';
import { mulberry32, hasLOS, segWalls, segCircle } from './geom.js';
import { generateMap, findSpawn, randomLootPoint } from './map.js';
import { stepMovement, sanitizeInput } from './movement.js';
import { BotBrain, botName } from './bot.js';
import { botRank } from './ranks.js';
import { planZone, zoneAt, exitState, outsideZone } from './zone.js';
import { WEAPONS, XP, XP_PER_LEVEL } from './weapons.js';

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
// bots hit humans for this share of their weapon damage: bots react and aim like
// machines, so a straight trade would be unfair; practice is softer still
const BOT_DAMAGE = 0.75;
const PRACTICE_BOT_DAMAGE = 0.5;
const PRACTICE_SPAWN_SHIELD = 5; // seconds; firing still drops it early

export class World {
  constructor({
    stake,
    seed = (Math.random() * 2 ** 32) >>> 0,
    roundNo = 1,
    rolloverIn = 0,
    golden = false,
    bots = true,
    botRoster = null,
    roundSeconds = CFG.ROUND_SECONDS,
    practice = false,
  }) {
    // practice (offline, vs bots): every bot for itself, softer bots, and the raid
    // ends the moment the last human is out (dead or extracted)
    this.practice = practice;
    this.botRoster = botRoster ? botRoster.slice() : null;
    this.stake = stake;
    this.seed = seed;
    this.rnd = mulberry32(seed ^ 0x9e3779b9);
    this.map = generateMap(seed);
    this.nav = null; // built lazily by the first bot
    this.roundNo = roundNo;
    this.golden = golden;
    this.duration = roundSeconds;
    this.zonePlan = planZone(this.map, this.rnd, roundSeconds);
    this.zone = zoneAt(this.zonePlan, 0);
    this.exitStates = this.map.extracts.map((e) => exitState(this.zonePlan, this.zone, e));
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

  humansInside() {
    for (const p of this.players.values()) if (!p.isBot && p.status === 'alive') return true;
    return false;
  }

  aliveCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.status === 'alive') n++;
    return n;
  }

  // Everyone enters together, before the first tick. No mid-raid joins.
  canJoin() {
    return this.phase === 'live' && this.tick === 0 && this.aliveCount() < CFG.MAX_PLAYERS;
  }

  emit(ev) {
    this.events.push(ev);
  }

  // ---------------------------------------------------------------- entry

  addPlayer({ name, skin, isBot = false, rank = 1 }) {
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
    const pos = findSpawn(this.map, this.rnd, others, this.zone);
    const p = {
      id: this.nextId++,
      name,
      skin,
      isBot,
      rank, // career rank, shown on the name tag
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
      shield: this.practice && !isBot ? PRACTICE_SPAWN_SHIELD : CFG.SPAWN_SHIELD,
      bag,
      startBag: bag,
      stake,
      fireCd: 0,
      w: 0, // weapon index: everyone starts with the knife
      xp: 0,
      prestige: 0,
      fc: 0, // attack counter, lets clients animate and play other runners' shots
      lastHit: -99,
      ext: 0,
      extId: -1,
      status: 'alive',
      kills: 0,
      dmgDealt: 0,
      bestMulti: 0,
      firstBlood: false,
      bluff: 1,
      ack: 0,
      queue: [],
      last: sanitizeInput({}),
      joinedAt: this.time,
      endedAt: null,
      killer: null,
      killerName: null,
      cause: null,
      inStorm: false,
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
      this.hadHumans = [...this.players.values()].some((p) => !p.isBot);
      this.fillBots();
      this.openingBurst();
    }
    this.tick++;
    this.time += DT;
    this.updateZone();

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

      // the storm: damage outside the circle, and no regen while you're in it
      p.inStorm = outsideZone(this.zone, p.x, p.y);
      if (p.inStorm) {
        p.hp -= this.zone.dps * DT;
        p.lastHit = this.time;
        if (p.hp <= 0) {
          this.kill(p, null, 'storm');
          continue;
        }
      } else if (p.hp < CFG.HP && this.time - p.lastHit > CFG.REGEN_DELAY) {
        p.hp = Math.min(CFG.HP, p.hp + CFG.REGEN_RATE * DT);
      }

      let zone = null;
      for (const e of this.map.extracts) {
        if (this.exitStates[e.id] === 'closed') continue;
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
    this.announce();
    if (this.time >= this.duration - 1e-9) this.end();
    else if (this.practice && this.hadHumans && !this.humansInside()) this.end();
  }

  updateZone() {
    const before = this.zone;
    this.zone = zoneAt(this.zonePlan, this.time);
    const z = this.zone;
    if (z.shrinking && !before.shrinking) this.emit({ k: 'storm', text: z.stage === this.zonePlan.times.length ? 'Final collapse · last exit only' : 'The storm is closing in' });
    if (!z.shrinking && !z.final && z.until <= 5 && !this.warned[`storm${z.stage}`]) {
      this.warned[`storm${z.stage}`] = true;
      this.emit({ k: 'storm', text: 'Storm moves in 5s' });
    }
    for (const e of this.map.extracts) {
      const s = exitState(this.zonePlan, z, e);
      if (s === 'closed' && this.exitStates[e.id] !== 'closed') this.emit({ k: 'exitClosed', name: e.name, id: e.id });
      this.exitStates[e.id] = s;
    }
  }

  fire(p) {
    const wp = WEAPONS[p.w];
    p.fireCd = wp.cd;
    p.fc = (p.fc + 1) % 1000;
    if (wp.melee) return this.slash(p, wp);
    const muzzle = CFG.PLAYER_R + 10;
    const sx = p.x + Math.cos(p.aim) * muzzle;
    const sy = p.y + Math.sin(p.aim) * muzzle;
    if (segWalls(p.x, p.y, sx, sy, this.map.walls) >= 0) return;
    for (let i = 0; i < wp.pellets; i++) {
      const a = p.aim + (this.rnd() - 0.5) * wp.spread * (wp.pellets > 1 ? 1 : 2);
      const b = {
        id: this.nextId++,
        owner: p.id,
        x: sx,
        y: sy,
        vx: Math.cos(a) * wp.speed,
        vy: Math.sin(a) * wp.speed,
        speed: wp.speed,
        range: wp.range,
        dmg: wp.dmg,
        dist: 0,
      };
      this.bullets.set(b.id, b);
    }
  }

  // Knife: hits the closest runner in front of you, within reach and not through walls.
  slash(p, wp) {
    let best = null;
    let bd = Infinity;
    for (const q of this.players.values()) {
      if (q === p || q.status !== 'alive') continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > wp.reach + CFG.PLAYER_R * 2) continue;
      let da = Math.atan2(dy, dx) - p.aim;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > wp.arc / 2) continue;
      if (!hasLOS(p.x, p.y, q.x, q.y, this.map.walls)) continue;
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    if (best) this.damage(best, p, wp.dmg);
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
        this.damage(victim, this.players.get(b.owner), b.dmg);
        continue;
      }
      if (tWall >= 0) {
        this.bullets.delete(b.id);
        continue;
      }
      b.x = nx;
      b.y = ny;
      b.dist += b.speed * DT;
      if (b.dist > b.range || nx < 0 || ny < 0 || nx > this.map.w || ny > this.map.h) this.bullets.delete(b.id);
    }
  }

  damage(v, shooter, amount) {
    if (v.shield > 0) return;
    if (shooter?.isBot && !v.isBot) amount *= this.practice ? PRACTICE_BOT_DAMAGE : BOT_DAMAGE;
    if (shooter && shooter !== v) {
      shooter.dmgDealt += Math.min(amount, Math.max(0, v.hp));
      const k = shooter.isBot && v.isBot ? XP.botOnBotDamage : 1;
      this.addXp(shooter, Math.min(amount, Math.max(0, v.hp)) * XP.damage * k);
      v.lastAttacker = shooter.id;
    }
    v.hp -= amount;
    v.lastHit = this.time;
    v.ext = 0;
    this.emit({ k: 'hit', to: shooter ? [v.id, shooter.id] : [v.id], vid: v.id, sid: shooter?.id ?? 0, x: r1(v.x), y: r1(v.y) });
    if (v.hp <= 0) this.kill(v, shooter);
  }

  kill(v, killer, cause = 'shot') {
    v.hp = 0;
    v.status = 'dead';
    v.endedAt = this.time;
    v.lostBag = v.bag;
    v.cause = cause;
    v.killer = killer?.id ?? null;
    v.killerName = killer?.name ?? null;
    if (v.bag > 0) {
      const d = { id: this.nextId++, x: v.x, y: v.y, v: v.bag };
      this.drops.set(d.id, d);
    }
    v.bag = 0;
    if (killer) {
      killer.kills++;
      this.addXp(killer, killer.isBot && v.isBot ? XP.botOnBot : XP.kill);
      this.streak(killer);
    }
    // public feed: names only, never amounts
    this.emit({ k: 'kill', killer: killer?.name ?? null, victim: v.name, kid: killer?.id ?? 0, vid: v.id, cause });
  }

  // First blood for the whole raid; multi-kills (each within MULTI_WINDOW of the last) for the killer.
  streak(k) {
    if (!this.firstBlood) {
      this.firstBlood = true;
      k.firstBlood = true;
      this.emit({ k: 'streak', tier: 1, name: k.name, pid: k.id });
    }
    k.multi = this.time - (k.lastKillT ?? -99) <= CFG.MULTI_WINDOW ? (k.multi ?? 1) + 1 : 1;
    k.lastKillT = this.time;
    k.bestMulti = Math.max(k.bestMulti, k.multi);
    if (k.multi >= 2) {
      const tier = Math.min(5, k.multi);
      this.emit({ k: 'streak', tier, to: [k.id], name: k.name, pid: k.id });
      if (tier >= 3) this.emit({ k: 'streakFeed', tier, name: k.name, pid: k.id });
    }
  }

  addXp(p, amount) {
    if (p.status !== 'alive' || amount <= 0) return;
    p.xp += amount;
    while (p.xp >= XP_PER_LEVEL) {
      p.xp -= XP_PER_LEVEL;
      p.w = (p.w + 1) % WEAPONS.length;
      p.fireCd = Math.min(p.fireCd, 0.15);
      if (p.w === 0) {
        p.prestige++;
        this.emit({ k: 'arsenal', name: p.name, pid: p.id });
      }
      this.emit({ k: 'level', to: [p.id], w: p.w, prestige: p.prestige });
    }
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
          this.addXp(p, XP.loot[o.t] ?? 0);
          this.orbs.delete(o.id);
          this.emit({ k: 'pickup', to: [p.id], v: o.v, t: o.t, x: r1(o.x), y: r1(o.y) });
        }
      }
      for (const d of this.drops.values()) {
        if ((d.x - p.x) ** 2 + (d.y - p.y) ** 2 < (CFG.PLAYER_R + 14) ** 2) {
          p.bag += d.v;
          this.addXp(p, XP.bag);
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

  // circle: where new loot may land. Opening loot uses the current circle,
  // everything after lands inside the circle the storm is heading to.
  spawnOrb(circle = this.zone.next) {
    if (this.lootPool <= 0 || this.orbs.size >= CFG.MAX_ORBS) return 0;
    let t = this.pickTier();
    const nominal = Math.max(1, Math.round(this.stake * CFG.ORB_TIERS[t].pct));
    const v = Math.min(nominal, this.lootPool);
    while (t > 0 && v < Math.round(this.stake * CFG.ORB_TIERS[t].pct) * 0.5) t--;
    const chest = CFG.ORB_TIERS.length - 1;
    let pos = randomLootPoint(this.map, this.rnd, t === chest, circle);
    if (!pos && t === chest) {
      t = chest - 1; // no vault inside the circle: drop it as a stack instead
      pos = randomLootPoint(this.map, this.rnd, false, circle);
    }
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
      const v = this.spawnOrb(this.zone);
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

  // Bots only enter at the start, alongside the humans: everyone begins together.
  fillBots() {
    if (!this.botsEnabled || !this.canJoin()) return;
    for (let i = this.aliveCount(); i < CFG.BOT_FILL; i++) this.addBot();
  }

  addBot() {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const pre = this.botRoster?.find((b) => !taken.has(b.name));
    if (pre) {
      this.botRoster.splice(this.botRoster.indexOf(pre), 1);
      return this.addPlayer({ name: pre.name, skin: pre.skin, isBot: true, rank: pre.rank ?? botRank(this.rnd) });
    }
    const skin = SKINS[Math.floor(this.rnd() * SKINS.length)];
    return this.addPlayer({ name: botName(this.rnd, taken), skin, isBot: true, rank: botRank(this.rnd) });
  }

  announce() {
    const tl = this.timeLeft;
    const say = (key, text) => {
      if (this.warned[key]) return;
      this.warned[key] = true;
      this.emit({ k: 'warn', text });
    };
    if (tl <= 30) say('30', '30s · reach an open exit');
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
        w: p.w,
        fc: p.fc,
        pr: p.prestige,
        rk: p.rank,
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
        storm: me.inStorm && me.status === 'alive' ? 1 : 0,
        w: me.w,
        xp: Math.floor(me.xp),
        pr: me.prestige,
        fc: me.fc,
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
