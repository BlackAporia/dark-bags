import { CFG, GL } from './config.js';
import { mulberry32, hasLOS, segWalls, segCircle } from './geom.js';
import { generateMap, findSpawn, randomLootPoint } from './map.js';
import { stepMovement, sanitizeInput } from './movement.js';
import { BotBrain, botName } from './bot.js';
import { botRank } from './ranks.js';
import { botLook, OUTFIT } from './cosmetics.js';
import { planZone, staticZone, zoneAt, exitState, outsideZone } from './zone.js';
import { WEAPONS, XP, XP_PER_LEVEL } from './weapons.js';
import { MODE } from './modes.js';

const DT = 1 / CFG.TICK_RATE;
// weapon families, for the mastery achievements
const WEAPON_CLASS = { knife: 'knife', pistol: 'handgun', deagle: 'handgun', shotgun: 'shotgun', autoshotgun: 'shotgun', smg: 'smg', pdw: 'smg', rifle: 'rifle', carbine: 'rifle', lmg: 'rifle', scout: 'sniper', magnum: 'sniper', sniper: 'sniper' };
const AUTO_RELOAD_IDLE = 1.2; // seconds without shooting before a half-empty magazine tops up
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * One raid. Authoritative simulation shared by the server and the offline mode.
 *
 * Economy (integer mills, $1 = 1,000, conserved):
 *   each entry pays `stake` → rake to house, BAG_SHARE of the rest into the runner's
 *   own bag, the remainder into the loot pool that gets scattered on the map.
 *   Extract → you keep your bag. Die → your bag drops for anyone to take.
 *   Raid ends → everything still inside (bags of runners who didn't make it,
 *   loot on the floor, unspawned pool) rolls into the next raid.
 */
// bots hit humans for this share of their weapon damage: bots react and aim like
// machines, so a straight trade would be unfair; practice is softer still
const BOT_DAMAGE = 0.75;
const PRACTICE_BOT_DAMAGE = { easy: 0.5, normal: 0.75, hard: 1 };
const PRACTICE_SPAWN_SHIELD = 5; // seconds; firing still drops it early

export class World {
  constructor({
    stake,
    seed = (Math.random() * 2 ** 32) >>> 0,
    roundNo = 1,
    rolloverIn = 0,
    bonus = 0,
    bots = true,
    botRoster = null,
    roundSeconds = CFG.ROUND_SECONDS,
    practice = false,
    difficulty = null, // practice: 'easy' | 'normal' | 'hard'
    botFill = CFG.BOT_FILL,
    mode = 'raid',
  }) {
    // the mode's rules (modes.js): raid = extraction; br/team = one prize pot, last side standing
    this.mode = MODE[mode] ? mode : 'raid';
    const m = MODE[this.mode];
    this.potMode = m.kind !== 'raid';
    this.teamSize = m.kind === 'team' ? m.teamSize : 0;
    this.fixedWeapon = m.weapon ? WEAPONS.findIndex((w) => w.id === m.weapon) : -1;
    this.dm = m.kind === 'dm'; // deathmatch: respawns, most kills wins, no storm
    this.hardcore = !!m.hardcore; // one hit and you're down
    this.shop = !!m.shop; // guns + lasers: credits buy medkits, turrets and tripmines
    this.maxHp = this.hardcore ? 1 : CFG.HP;
    this.turrets = new Map();
    this.mines = new Map();
    this.leaderId = null;
    this.pot = 0; // pot modes: every net stake, paid to the winners at the end
    this.sides = 0; // how many sides (players, or teams) entered
    this.difficulty = practice ? difficulty ?? 'easy' : 'normal';
    this.botFill = botFill;
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
    this.golden = bonus > 0; // a golden raid: the room's jackpot adds `bonus` to the loot
    this.duration = roundSeconds;
    this.zonePlan = this.dm ? staticZone(this.map, roundSeconds) : planZone(this.map, this.rnd, roundSeconds);
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
    if (bonus > 0) this.ledger.sponsorIn += bonus;
    // raid: rollover and jackpot become loot on the map; pot modes: they grow the prize
    if (this.potMode) this.pot += rolloverIn + bonus;
    else this.lootPool += rolloverIn + bonus;
  }

  get timeLeft() {
    return Math.max(0, this.duration - this.time);
  }

  // pot modes: who is still in it (a player id, or a team)
  sideOf(p) {
    return this.teamSize ? `t${p.team}` : `p${p.id}`;
  }

  aliveSides() {
    const s = new Set();
    for (const p of this.players.values()) if (p.status === 'alive') s.add(this.sideOf(p));
    return s;
  }

  humansInside() {
    for (const p of this.players.values()) if (!p.isBot && p.status === 'alive') return true;
    return false;
  }

  // a human who went down and is still watching the raid (practice keeps it running for them)
  humansWatching() {
    if (!this.aliveCount()) return false;
    for (const p of this.players.values()) if (!p.isBot && p.status === 'dead' && !p.spectDone) return true;
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

  addPlayer({ name, skin, isBot = false, rank = 1, outfit = null, body = 'm', title = null, ws = null, ts = null, neon = null }) {
    if (!this.canJoin()) throw new Error('raid closed');
    const stake = this.stake;
    const rake = Math.floor(stake * CFG.RAKE);
    const net = stake - rake;
    const bag = this.potMode ? 0 : Math.floor(net * CFG.BAG_SHARE);
    const loot = net - bag;
    if (isBot) this.ledger.botStakesIn += stake;
    else this.ledger.stakesIn += stake;
    this.ledger.rake += rake;
    if (this.potMode) this.pot += loot;
    else this.lootPool += loot;
    // teams: fill the smaller side (humans enter first, bots top both sides up)
    let team = null;
    if (this.teamSize) {
      const n = [0, 0];
      for (const o of this.players.values()) n[o.team]++;
      team = n[1] < n[0] ? 1 : 0;
    }

    const others = [...this.players.values()].filter((o) => o.status === 'alive');
    const pos = findSpawn(this.map, this.rnd, others, this.zone);
    const p = {
      id: this.nextId++,
      name,
      skin,
      isBot,
      rank, // career rank, shown on the name tag
      title, // an achievement worn as a title (id), shown over the name
      outfit, // cosmetic outfit id and character (m/f): looks only
      body,
      ws: ws && Object.keys(ws).length ? ws : null, // weapon skins: { weaponId: finishId }
      ts: ts || null, // turret skin (guns + lasers)
      neon: neon || null, // a season title, worn in neon over the name
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      dashT: 0,
      dashCd: 0,
      dashDx: 0,
      dashDy: 0,
      aim: 0,
      hp: this.maxHp,
      shield: this.practice && !isBot ? PRACTICE_SPAWN_SHIELD : CFG.SPAWN_SHIELD,
      bag,
      startBag: bag,
      stake,
      fireCd: 0,
      w: this.fixedWeapon >= 0 ? this.fixedWeapon : 0, // weapon index: the knife, unless the mode fixes one
      ammo: 0, // rounds in the magazine (set by arm())
      reloadT: 0, // seconds left on a reload
      team,
      xp: 0,
      prestige: 0,
      fc: 0, // attack counter, lets clients animate and play other runners' shots
      lastHit: -99,
      ext: 0,
      extId: -1,
      status: 'alive',
      kills: 0,
      deaths: 0,
      cr: this.shop ? GL.START : 0, // guns + lasers credits
      respawnAt: null,
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
    this.arm(p);
    this.players.set(p.id, p);
    if (isBot) this.brains.set(p.id, new BotBrain(this, p, this.rnd));
    this.sides = this.teamSize ? new Set([...this.players.values()].map((o) => o.team)).size : this.players.size;
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

  // Spectating after death: step through the runners still alive (dir ±1), or stop watching.
  watch(id, dir) {
    const me = this.players.get(id);
    if (!me || me.status !== 'dead') return;
    if (dir === 0) {
      me.spectDone = true;
      return;
    }
    const alive = [...this.players.values()].filter((p) => p.status === 'alive').sort((a, b) => a.id - b.id);
    if (!alive.length) return;
    const cur = this.eyeOf(me);
    const i = alive.indexOf(cur);
    me.watchId = alive[(i + (dir > 0 ? 1 : -1) + alive.length) % alive.length].id;
  }

  // who a dead runner watches: their pick, else their killer, else anyone still alive
  eyeOf(me) {
    if (me.status !== 'dead') return me;
    for (const id of [me.watchId, me.killer]) {
      const p = id && this.players.get(id);
      if (p && p.status === 'alive') return p;
    }
    let best = null;
    for (const p of this.players.values()) if (p.status === 'alive' && (!best || p.kills > best.kills)) best = p;
    return best ?? me;
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
    if (this.dm) for (const p of this.players.values()) if (p.status === 'dead' && p.respawnAt !== null && this.time >= p.respawnAt) this.respawn(p);

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
      if (p.reloadT > 0) {
        p.reloadT -= DT;
        if (p.reloadT <= 0) {
          p.reloadT = 0;
          p.ammo = WEAPONS[p.w].mag;
        }
      }
      // reloading is automatic: an empty magazine reloads at once, a half-empty one as soon
      // as you stop shooting for a moment (bots may also ask for it)
      if (inp.f) p.idleT = 0;
      else p.idleT = (p.idleT ?? 0) + DT;
      if (inp.r || (p.idleT > AUTO_RELOAD_IDLE && p.ammo < (WEAPONS[p.w].mag ?? 0) * 0.5)) this.reload(p);
      if (inp.f && p.fireCd <= 0 && p.reloadT <= 0) {
        p.shield = 0;
        this.fire(p);
      }

      // the storm: damage outside the circle. Health never comes back by itself: lost hp
      // stays lost for the match (Guns + Lasers sells medkits; deathmatch respawns full)
      p.inStorm = outsideZone(this.zone, p.x, p.y);
      if (p.inStorm) {
        p.hp -= ((this.zone.dps * this.maxHp) / CFG.HP) * DT;
        p.lastHit = this.time;
        if (p.hp <= 0) {
          this.kill(p, null, 'storm');
          continue;
        }
      }

      let zone = null;
      if (this.potMode) continue; // no exits: last one standing
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

    if (this.shop) {
      this.stepTurrets();
      this.stepMines();
    }
    this.stepBullets();
    this.pickups();
    this.spawnLoot();
    this.announce();
    if (this.potMode && !this.dm && this.sides > 1 && this.aliveSides().size <= 1) this.end();
    else if (this.time >= this.duration - 1e-9) this.end();
    else if (this.practice && !this.dm && this.hadHumans && !this.humansInside() && !this.humansWatching()) this.end();
  }

  updateZone() {
    const before = this.zone;
    this.zone = zoneAt(this.zonePlan, this.time);
    const z = this.zone;
    if (this.dm) return; // no storm in deathmatch
    if (z.shrinking && !before.shrinking) this.emit({ k: 'storm', text: z.stage === this.zonePlan.times.length ? (this.potMode ? 'storm.finalPot' : 'storm.final') : 'storm.closing' });
    if (!z.shrinking && !z.final && z.until <= 5 && !this.warned[`storm${z.stage}`]) {
      this.warned[`storm${z.stage}`] = true;
      this.emit({ k: 'storm', text: 'storm.in5' });
    }
    for (const e of this.map.extracts) {
      const s = exitState(this.zonePlan, z, e);
      if (s === 'closed' && this.exitStates[e.id] !== 'closed') this.emit({ k: 'exitClosed', name: e.name, id: e.id });
      this.exitStates[e.id] = s;
    }
  }

  // a full magazine of whatever is in your hands (new weapon, spawn)
  arm(p) {
    p.ammo = WEAPONS[p.w].mag ?? 0;
    p.reloadT = 0;
  }

  // start reloading: on an empty magazine automatically, or when asked (R) with rounds missing
  reload(p) {
    const wp = WEAPONS[p.w];
    if (wp.melee || p.reloadT > 0 || p.ammo >= wp.mag) return;
    p.reloadT = wp.reload;
    p.rlc = (p.rlc ?? 0) + 1; // reload counter: clients play the sound
  }

  fire(p) {
    const wp = WEAPONS[p.w];
    if (!wp.melee && p.ammo <= 0) return this.reload(p);
    p.fireCd = wp.cd;
    p.fc = (p.fc + 1) % 1000;
    if (wp.melee) return this.slash(p, wp);
    p.ammo--;
    if (p.ammo <= 0) this.reload(p);
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
        skin: p.ws?.[wp.id] ?? null, // the shooter's weapon skin: clients draw its tracer
        cause: 'shot',
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
    if (best) return this.damage(best, p, wp.dmg);
    // nobody in reach: a knife still wrecks a turret or a tripmine
    if (!this.shop) return;
    for (const o of [...this.turrets.values(), ...this.mines.values()]) {
      if (!this.hostile(o, p) || Math.hypot(o.x - p.x, o.y - p.y) > wp.reach + CFG.PLAYER_R + 14) continue;
      let da = Math.atan2(o.y - p.y, o.x - p.x) - p.aim;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) <= wp.arc / 2) return this.hitGadget(o, p, wp.dmg);
    }
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
      // guns + lasers: turrets and tripmines stop bullets and can be shot to pieces
      let gadget = null;
      if (this.shop) {
        const owner = this.players.get(b.owner);
        for (const o of [...this.turrets.values(), ...this.mines.values()]) {
          if (!this.hostile(o, owner)) continue;
          const t = segCircle(b.x, b.y, nx, ny, o.x, o.y, o.kind === 'turret' ? 16 : 9);
          if (t >= 0 && t < tMin) {
            tMin = t;
            gadget = o;
            victim = null;
          }
        }
      }
      if (gadget) {
        this.bullets.delete(b.id);
        this.hitGadget(gadget, this.players.get(b.owner), b.dmg);
        continue;
      }
      if (victim) {
        this.bullets.delete(b.id);
        this.damage(victim, this.players.get(b.owner), b.dmg, b.cause);
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

  damage(v, shooter, amount, cause = 'shot') {
    if (v.shield > 0) return;
    if (shooter && shooter !== v && this.teamSize && shooter.team === v.team) return; // no friendly fire
    if (shooter?.isBot && !v.isBot) amount *= this.practice ? PRACTICE_BOT_DAMAGE[this.difficulty] ?? 0.5 : BOT_DAMAGE;
    if (this.hardcore) amount = Math.max(amount, v.hp); // one hit is enough
    if (shooter && shooter !== v) {
      shooter.dmgDealt += Math.min(amount, Math.max(0, v.hp));
      const k = shooter.isBot && v.isBot ? XP.botOnBotDamage : 1;
      this.addXp(shooter, Math.min(amount, Math.max(0, v.hp)) * XP.damage * k);
      v.lastAttacker = shooter.id;
    }
    const full = v.hp >= this.maxHp;
    v.hp -= amount;
    v.dmgTaken = (v.dmgTaken ?? 0) + amount; // for "untouchable"
    if (full && v.hp <= 0 && shooter && shooter !== v && !this.hardcore) shooter.oneShots = (shooter.oneShots ?? 0) + 1; // full health to nothing in one hit
    v.lastHit = this.time;
    v.ext = 0;
    this.emit({ k: 'hit', to: shooter ? [v.id, shooter.id] : [v.id], vid: v.id, sid: shooter?.id ?? 0, x: r1(v.x), y: r1(v.y) });
    if (v.hp <= 0) this.kill(v, shooter, cause);
  }

  kill(v, killer, cause = 'shot') {
    // kills by weapon class (achievements), and turret kills (Guns + Lasers)
    if (killer && killer !== v) {
      if (cause === 'turret') killer.turretKills = (killer.turretKills ?? 0) + 1;
      else {
        const cls = WEAPON_CLASS[WEAPONS[killer.w]?.id] ?? 'other';
        killer.wk ??= {};
        killer.wk[cls] = (killer.wk[cls] ?? 0) + 1;
      }
    }
    v.hp = 0;
    v.place ??= this.aliveCount(); // finishing place (before this death: the alive count)
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
    v.deaths++;
    if (this.dm && this.phase === 'live') v.respawnAt = this.time + CFG.RESPAWN;
    if (killer && killer !== v) {
      killer.kills++;
      if (this.shop) killer.cr = Math.min(GL.MAX, killer.cr + GL.KILL);
      this.addXp(killer, killer.isBot && v.isBot ? XP.botOnBot : XP.kill);
      this.streak(killer);
    }
    // public feed: names only, never amounts
    this.emit({ k: 'kill', killer: killer?.name ?? null, victim: v.name, kid: killer?.id ?? 0, vid: v.id, cause });
    if (this.dm && killer && killer !== v) this.checkLead();
  }

  // ------------------------------------------------------------ deathmatch

  // Back in: a fresh spawn away from everyone, full health, a moment of spawn shield.
  // You keep your kills, your place on the weapon ladder and your credits.
  respawn(p) {
    const others = [...this.players.values()].filter((o) => o.status === 'alive');
    const pos = findSpawn(this.map, this.rnd, others, this.zone);
    Object.assign(p, {
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      dashT: 0,
      hp: this.maxHp,
      shield: CFG.SPAWN_SHIELD,
      status: 'alive',
      respawnAt: null,
      endedAt: null,
      fireCd: 0,
      multi: 0,
      lastHit: -99,
      inStorm: false,
      watchId: null,
    });
    p.queue.length = 0;
    p.last = sanitizeInput({ s: p.ack });
    this.arm(p);
    this.brains.get(p.id)?.reset();
    this.emit({ k: 'respawn', to: [p.id], pid: p.id });
  }

  // kill order, most kills first (fewer deaths breaks a tie for the scoreboard only)
  standings() {
    return [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
  }

  // The announcer tells the new sole leader they took the lead, and the old one they lost it.
  checkLead() {
    const [a, b] = this.standings();
    const lead = a && a.kills > 0 && (!b || a.kills > b.kills) ? a : null;
    if (!lead || lead.id === this.leaderId) return;
    const old = this.leaderId ? this.players.get(this.leaderId) : null;
    this.leaderId = lead.id;
    this.emit({ k: 'lead', to: [lead.id], pid: lead.id });
    if (old) this.emit({ k: 'lostLead', to: [old.id], pid: old.id });
    this.emit({ k: 'leader', name: lead.name, pid: lead.id, kills: lead.kills });
  }

  // ------------------------------------------------------- guns + lasers

  // can this gadget hurt (or be hurt by) that runner? Never its owner or the owner's team.
  hostile(o, p) {
    if (!p || p.id === o.owner) return false;
    return !(this.teamSize && p.team === o.team);
  }

  buy(id, item) {
    const p = this.players.get(id);
    const it = Object.hasOwn(GL.ITEMS, item) ? GL.ITEMS[item] : null;
    if (!this.shop || !it || !p || p.status !== 'alive' || this.phase !== 'live') return false;
    const no = (why) => {
      this.emit({ k: 'buyFail', to: [p.id], item, why });
      return false;
    };
    if (p.cr < it.cost) return no('cash');
    if (item === 'medkit') {
      if (p.hp >= this.maxHp) return no('full');
      p.hp = Math.min(this.maxHp, p.hp + it.heal);
    } else if (item === 'turret') {
      if ([...this.turrets.values()].filter((o) => o.owner === p.id).length >= it.max) return no('limit');
      // set down a step in front of you, or at your feet if a wall is in the way
      const fx = p.x + Math.cos(p.aim) * 34;
      const fy = p.y + Math.sin(p.aim) * 34;
      const free = segWalls(p.x, p.y, fx, fy, this.map.walls) < 0;
      const o = { id: this.nextId++, kind: 'turret', sk: p.ts, owner: p.id, team: p.team, x: free ? fx : p.x, y: free ? fy : p.y, a: p.aim, hp: it.hp, cd: 0.6, until: this.time + it.life, fc: 0 };
      this.turrets.set(o.id, o);
    } else if (item === 'mine') {
      const mine = [...this.mines.values()].filter((o) => o.owner === p.id);
      if (mine.length >= it.max) return no('limit');
      // the beam runs from your feet the way you aim, to the first wall
      const ex = p.x + Math.cos(p.aim) * it.len;
      const ey = p.y + Math.sin(p.aim) * it.len;
      const t = segWalls(p.x, p.y, ex, ey, this.map.walls);
      const k = t >= 0 ? t : 1;
      if (k * it.len < 60) return no('wall');
      const o = { id: this.nextId++, kind: 'mine', owner: p.id, team: p.team, x: p.x, y: p.y, x2: p.x + (ex - p.x) * k, y2: p.y + (ey - p.y) * k, armAt: this.time + it.arm };
      this.mines.set(o.id, o);
    }
    p.cr -= it.cost;
    this.emit({ k: 'bought', to: [p.id], item, pid: p.id, x: r1(p.x), y: r1(p.y) });
    return true;
  }

  hitGadget(o, by, dmg) {
    if (o.kind === 'turret') {
      o.hp -= dmg;
      if (o.hp > 0) return;
      this.turrets.delete(o.id);
    } else this.mines.delete(o.id);
    if (by && this.shop) by.cr = Math.min(GL.MAX, by.cr + GL.WRECK);
    this.emit({ k: 'wreck', kind: o.kind, x: r1(o.x), y: r1(o.y), owner: o.owner, by: by?.id ?? 0 });
  }

  // Sentry turrets: turn toward the nearest enemy they can see and fire. Kills count for
  // the owner, even while the owner is waiting to respawn.
  stepTurrets() {
    const it = GL.ITEMS.turret;
    for (const o of this.turrets.values()) {
      if (this.time >= o.until) {
        this.turrets.delete(o.id);
        this.emit({ k: 'wreck', kind: 'turret', x: r1(o.x), y: r1(o.y), owner: o.owner, by: 0 });
        continue;
      }
      o.cd = Math.max(0, o.cd - DT);
      let best = null;
      let bd = it.range;
      for (const p of this.players.values()) {
        if (p.status !== 'alive' || p.shield > 0 || !this.hostile(o, p)) continue;
        const d = Math.hypot(p.x - o.x, p.y - o.y);
        if (d < bd && hasLOS(o.x, o.y, p.x, p.y, this.map.walls)) {
          bd = d;
          best = p;
        }
      }
      if (!best) continue;
      let da = Math.atan2(best.y - o.y, best.x - o.x) - o.a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const turn = it.turn * DT;
      o.a += Math.max(-turn, Math.min(turn, da));
      if (Math.abs(da) > 0.12 || o.cd > 0) continue;
      o.cd = it.cd;
      o.fc = (o.fc + 1) % 1000;
      const a = o.a + (this.rnd() - 0.5) * 0.06;
      const b = { id: this.nextId++, owner: o.owner, x: o.x + Math.cos(a) * 18, y: o.y + Math.sin(a) * 18, vx: Math.cos(a) * 1000, vy: Math.sin(a) * 1000, speed: 1000, range: it.range + 40, dmg: it.dmg, dist: 0, skin: null, cause: 'turret' };
      this.bullets.set(b.id, b);
    }
  }

  // Laser tripmines: armed after a moment; an enemy crossing the beam sets it off.
  stepMines() {
    const it = GL.ITEMS.mine;
    for (const o of this.mines.values()) {
      if (this.time < o.armAt) continue;
      let trip = null;
      for (const p of this.players.values()) {
        if (p.status !== 'alive' || p.shield > 0 || !this.hostile(o, p)) continue;
        if (segCircle(o.x, o.y, o.x2, o.y2, p.x, p.y, CFG.PLAYER_R) >= 0) {
          trip = p;
          break;
        }
      }
      if (!trip) continue;
      this.mines.delete(o.id);
      const bx = trip.x;
      const by = trip.y;
      this.emit({ k: 'boom', x: r1(bx), y: r1(by), mid: o.id });
      const owner = this.players.get(o.owner);
      for (const p of this.players.values()) {
        if (p.status !== 'alive' || !this.hostile(o, p)) continue;
        const d = Math.hypot(p.x - bx, p.y - by);
        if (d > it.r) continue;
        this.damage(p, owner, it.dmg * (1 - (0.6 * d) / it.r), 'mine');
      }
    }
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
    if (this.fixedWeapon >= 0) {
      p.xp %= XP_PER_LEVEL; // one weapon for the whole raid: no arms race
      return;
    }
    while (p.xp >= XP_PER_LEVEL) {
      p.xp -= XP_PER_LEVEL;
      p.w = (p.w + 1) % WEAPONS.length;
      p.fireCd = Math.min(p.fireCd, 0.15);
      this.arm(p);
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
    for (let i = this.aliveCount(); i < this.botFill; i++) this.addBot();
  }

  addBot() {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const pre = this.botRoster?.find((b) => !taken.has(b.name));
    if (pre) {
      this.botRoster.splice(this.botRoster.indexOf(pre), 1);
      return this.addPlayer({ name: pre.name, skin: pre.skin, isBot: true, rank: pre.rank ?? botRank(this.rnd), outfit: pre.outfit ?? null, body: pre.body ?? 'm', ws: pre.ws ?? null });
    }
    const look = botLook(this.rnd);
    return this.addPlayer({ name: botName(this.rnd, taken), skin: OUTFIT[look.outfit].color, isBot: true, rank: botRank(this.rnd), ...look });
  }

  announce() {
    const tl = this.timeLeft;
    const say = (key, text) => {
      if (this.warned[key]) return;
      this.warned[key] = true;
      this.emit({ k: 'warn', text });
    };
    // keys the client translates
    if (tl <= 30) say('30', this.potMode ? 'warn.pot30' : 'warn.exit30');
    if (tl <= 10) say('10', this.potMode ? 'warn.pot10' : 'warn.exit10');
  }

  // Pot modes: the last side standing takes the pot. If the clock runs out first, the side
  // with the most runners alive wins (then most kills); a dead heat splits it among them.
  settlePot() {
    if (this.dm) return this.settleKills();
    const alive = [...this.players.values()].filter((p) => p.status === 'alive');
    const score = new Map();
    for (const p of this.players.values()) {
      const s = this.sideOf(p);
      const cur = score.get(s) ?? { alive: 0, kills: 0 };
      if (p.status === 'alive') cur.alive++;
      cur.kills += p.kills;
      score.set(s, cur);
    }
    let best = [];
    let top = null;
    for (const [s, v] of score) {
      if (!v.alive) continue;
      const cmp = top === null ? 1 : v.alive - top.alive || v.kills - top.kills;
      if (cmp > 0) {
        best = [s];
        top = v;
      } else if (cmp === 0) best.push(s);
    }
    const winSides = new Set(best);
    // the team shares its win, fallen teammates included; solo modes pay the survivors
    const winners = this.teamSize ? [...this.players.values()].filter((p) => winSides.has(this.sideOf(p))) : alive.filter((p) => winSides.has(this.sideOf(p)));
    this.winners = winners.map((p) => p.id);
    if (!winners.length || this.pot <= 0) return;
    this.payPot(winners);
  }

  // Deathmatch: the most kills takes the pot; a tie splits it. Nobody scored: it rolls over.
  settleKills() {
    const all = [...this.players.values()];
    const top = Math.max(0, ...all.map((p) => p.kills));
    const winners = top > 0 ? all.filter((p) => p.kills === top) : [];
    this.winners = winners.map((p) => p.id);
    if (!winners.length || this.pot <= 0) return;
    this.payPot(winners);
  }

  payPot(winners) {
    const share = Math.floor(this.pot / winners.length);
    let rest = this.pot - share * winners.length;
    for (const p of winners) {
      const amount = share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      p.payout = amount;
      p.won = true;
      p.place = 1;
      if (p.isBot) this.ledger.botPaidOut += amount;
      else this.ledger.paidOut += amount;
      this.emit({ k: 'payout', to: [p.id], pid: p.id, amount });
    }
    this.pot = 0;
    this.emit({ k: 'winners', names: winners.map((p) => p.name), team: this.teamSize ? winners[0].team : null });
  }

  end() {
    if (this.dm) {
      // everyone is still in it at the whistle, the fallen included
      for (const p of this.players.values()) {
        if (p.status !== 'dead') continue;
        p.status = 'alive';
        p.respawnAt = null;
      }
    }
    if (this.potMode) {
      this.settlePot();
      for (const p of this.players.values()) {
        if (p.status !== 'alive') continue;
        p.status = p.won ? 'won' : 'mia';
        p.endedAt = this.time;
      }
      this.ledger.rolloverOut += this.pot; // nobody alive to take it: it waits for the next raid
      this.pot = 0;
    }
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
    this.turrets.clear();
    this.mines.clear();
    this.lootPool = 0;
    this.emit({ k: 'end' });
  }

  // --------------------------------------------------------- accounting

  inWorld() {
    let s = this.lootPool + this.pot;
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
      if (this.teamSize && p.team === me.team) continue;
      const d2 = (p.x - me.x) ** 2 + (p.y - me.y) ** 2;
      if (d2 > V2) continue;
      if (this.canSee(me, p)) out.push(p);
    }
    return out;
  }

  // deathmatch HUD: your place, deaths, respawn countdown and the top three
  dmView(me) {
    const order = this.standings();
    return {
      dth: me.deaths,
      pl: order.indexOf(me) + 1,
      rs: me.status === 'dead' && me.respawnAt !== null ? r2(Math.max(0, me.respawnAt - this.time)) : 0,
      top: order.slice(0, 3).map((p) => [p.name, p.kills, p.id === me.id ? 1 : 0]),
    };
  }

  // turrets and tripmines in sight range (tripmines by either end of the beam)
  gadgetsNear(me, near) {
    const pct = (o) => Math.ceil((o.hp / GL.ITEMS.turret.hp) * 100);
    const mine = (o) => (o.owner === me.id ? 1 : this.teamSize && o.team === me.team ? 2 : 0);
    const turrets = [];
    for (const o of this.turrets.values()) if (near(o.x, o.y, 40)) turrets.push({ i: o.id, x: r1(o.x), y: r1(o.y), a: r2(o.a), h: pct(o), fc: o.fc, o: mine(o), tl: Math.ceil(o.until - this.time), ...(o.sk ? { sk: o.sk } : {}) });
    const mines = [];
    for (const o of this.mines.values()) if (near(o.x, o.y, 40) || near(o.x2, o.y2, 40) || near((o.x + o.x2) / 2, (o.y + o.y2) / 2, 40)) mines.push({ i: o.id, x: r1(o.x), y: r1(o.y), x2: r1(o.x2), y2: r1(o.y2), o: mine(o), arm: this.time >= o.armAt ? 1 : 0 });
    return { turrets, mines };
  }

  /**
   * What one runner is allowed to know. This is the privacy boundary:
   * other runners' bags are never serialised, only their own-chosen bluff size,
   * and runners out of sight (distance or walls) are not sent at all.
   */
  // [x, y, ally] for every other runner alive, in tens of units (ally: 1 for your team)
  radarFor(me) {
    const out = [];
    for (const p of this.players.values()) {
      if (p === me || p.status !== 'alive') continue;
      out.push([Math.round(p.x / 10), Math.round(p.y / 10), this.teamSize && p.team === me.team ? 1 : 0]);
    }
    return out;
  }

  snapshotFor(id) {
    const me = this.players.get(id);
    if (!me) return null;
    const eye = this.eyeOf(me);
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
        h: Math.ceil((p.hp * CFG.HP) / this.maxHp), // health in % (hardcore runs on 1 hp)
        b: p.bluff,
        e: p.ext > 0 ? r2(p.ext) : 0,
        d: p.dashT > 0 ? 1 : 0,
        s: p.shield > 0 ? 1 : 0,
        w: p.w,
        fc: p.fc,
        ...(p.reloadT > 0 ? { rl: 1 } : {}),
        pr: p.prestige,
        rk: p.rank,
        ...(p.title ? { tt: p.title } : {}),
        ...(p.neon ? { nt: p.neon } : {}),
        ...(this.teamSize ? { tm: p.team } : {}),
        ...(p.ws ? { ws: p.ws } : {}),
        ...(p.ping != null ? { pg: p.ping } : {}),
        o: p.outfit,
        g: p.body,
      });
    }
    const orbs = [];
    for (const o of this.orbs.values()) if (near(o.x, o.y, 40)) orbs.push({ i: o.id, x: r1(o.x), y: r1(o.y), t: o.t });
    const drops = [];
    for (const d of this.drops.values()) if (near(d.x, d.y, 40)) drops.push({ i: d.id, x: r1(d.x), y: r1(d.y) });
    const bullets = [];
    for (const b of this.bullets.values()) {
      if (near(b.x, b.y, 120)) bullets.push({ i: b.id, x: r1(b.x), y: r1(b.y), vx: r1(b.vx), vy: r1(b.vy), o: b.owner === me.id ? 1 : 0, ...(b.skin ? { s: b.skin } : {}) });
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
        hp: Math.ceil((me.hp * CFG.HP) / this.maxHp),
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
        am: me.ammo,
        rl: me.reloadT > 0 ? r2(me.reloadT) : 0,
        ext: r2(me.ext),
        bluff: me.bluff,
        k: me.kills,
        ack: me.ack,
        ex: r1(eye.x),
        ey: r1(eye.y),
        spect: eye !== me ? eye.name : null,
        ...(this.potMode ? { pot: this.pot, sides: this.aliveSides().size } : {}),
        ...(this.teamSize ? { tm: me.team } : {}),
        ...(this.dm ? this.dmView(me) : {}),
        ...(this.shop ? { cr: me.cr } : {}),
      },
      players,
      // the minimap radar: every runner still standing, coarse, a few times a second
      ...(this.tick % 3 === 0 ? { radar: this.radarFor(me) } : {}),
      ...(this.shop ? this.gadgetsNear(me, near) : {}),
      orbs,
      drops,
      bullets,
    };
  }
}
