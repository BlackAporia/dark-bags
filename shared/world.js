import { CFG, GL } from './config.js';
import { mulberry32, hasLOS, segWalls, segCircle } from './geom.js';
import { generateMap, generateArena, findSpawn, randomLootPoint, pointFree } from './map.js';
import { stepMovement, sanitizeInput } from './movement.js';
import { BotBrain, botName } from './bot.js';
import { botRank } from './ranks.js';
import { botLook, OUTFIT, meleeOf } from './cosmetics.js';
import { planZone, staticZone, zoneAt, exitState, outsideZone } from './zone.js';
import { WEAPONS, XP, XP_PER_LEVEL } from './weapons.js';
import { MODE } from './modes.js';
import { Horde } from './horde.js';

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
const ROUND_BREAK = 4; // seconds between rounds
// gold rush: bags on the ground at once (plus some per runner), how often a new one lands,
// and the share of big bags (worth three)
const GOLD = { base: 6, perRunner: 2, every: 0.8, big: 0.1, r: CFG.PLAYER_R + 14 };
// the guns a gold-rush runner may be handed (anything but the knife)
const GUNS = WEAPONS.map((w, i) => (w.melee ? -1 : i)).filter((i) => i >= 0);

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
    // side modes on their own arenas: zombies (co-op waves, horde.js) and the gold rush
    this.zombie = m.kind === 'zombie';
    this.goldRush = m.kind === 'gold';
    this.respawns = this.dm || this.goldRush; // back in a few seconds after you drop
    this.noLadder = this.zombie || this.goldRush || !!m.pick; // you keep the weapon you came with
    this.pick = !!m.pick;
    // rounds on a clock (teams, ranked): wins needed, round length, the score per side
    this.rounds = m.rounds ?? 0;
    if (this.rounds) {
      this.roundLen = m.round;
      this.maxRounds = this.rounds * 2 - 1;
      this.roundNo = 1;
      this.roundEndsAt = this.roundLen;
      this.roundBreak = 0;
      this.score = new Map();
      roundSeconds = this.maxRounds * (this.roundLen + ROUND_BREAK);
    }
    this.feeOnly = this.zombie; // the entry is a fee: no pot, it pays XP and titles
    this.zombies = new Map();
    this.packs = new Map(); // medkits the dead leave behind (zombies)
    this.gold = new Map(); // gold bags on the ground (gold rush)
    this.goldT = 0;
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
    this.map = this.zombie ? generateArena(seed, 'graveyard') : this.goldRush ? generateArena(seed, 'mine') : generateMap(seed);
    this.nav = null; // built lazily by the first bot
    this.roundNo = roundNo;
    this.golden = bonus > 0; // a golden raid: the room's jackpot adds `bonus` to the loot
    this.duration = roundSeconds;
    this.zonePlan = this.dm || this.zombie || this.goldRush || this.rounds ? staticZone(this.map, roundSeconds) : planZone(this.map, this.rnd, roundSeconds);
    this.horde = this.zombie ? new Horde(this) : null;
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
    this.bulletEnds = [];
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
    if (this.rounds) return Math.max(0, (this.roundBreak > 0 ? this.roundEndsAt : Math.min(this.roundEndsAt, this.duration)) - this.time);
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

  addPlayer({ name, skin, isBot = false, rank = 1, outfit = null, body = 'm', title = null, ws = null, ts = null, neon = null, weapon = null }) {
    if (!this.canJoin()) throw new Error('raid closed');
    const stake = this.stake;
    const rake = this.feeOnly ? stake : Math.floor(stake * CFG.RAKE);
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
    // zombies: the squad starts together on the plaza in the middle
    const pos = this.zombie ? this.squadSpot(others) : findSpawn(this.map, this.rnd, others, this.zone);
    // the weapon: the mode's, your pick (zombies), a random gun (gold rush), else the knife
    const pick = WEAPONS.findIndex((w) => w.id === weapon);
    const w0 = this.fixedWeapon >= 0 ? this.fixedWeapon : this.zombie ? (pick >= 0 ? pick : 1) : this.pick ? (pick >= 0 && !isBot ? pick : isBot ? this.randomGun() : 1) : this.goldRush ? this.randomGun() : 0;
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
      w: w0, // weapon index
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
      zk: 0, // zombies killed
      gb: 0, // gold bags held (gold rush)
      gbAt: 0, // when that count was reached (the earlier one wins a tie)
    };
    this.arm(p);
    this.players.set(p.id, p);
    if (isBot) this.brains.set(p.id, new BotBrain(this, p, this.rnd));
    this.sides = this.teamSize ? new Set([...this.players.values()].map((o) => o.team)).size : this.players.size;
    return p;
  }

  randomGun() {
    return GUNS[Math.floor(this.rnd() * GUNS.length)];
  }

  // a free spot on the plaza next to the rest of the squad
  squadSpot(others) {
    const cx = this.map.w / 2;
    const cy = this.map.h / 2;
    const near = others[0] ?? { x: cx, y: cy };
    for (let i = 0; i < 40; i++) {
      const a = this.rnd() * Math.PI * 2;
      const d = 50 + this.rnd() * (others.length ? 90 : 160);
      const x = near.x + Math.cos(a) * d;
      const y = near.y + Math.sin(a) * d;
      if (pointFree(this.map, x, y, CFG.PLAYER_R + 4)) return { x, y };
    }
    return { x: cx, y: cy };
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
    if (this.respawns) for (const p of this.players.values()) if (p.status === 'dead' && p.respawnAt !== null && this.time >= p.respawnAt) this.respawn(p);
    if (this.horde && this.phase === 'live') this.horde.step(DT);
    if (this.goldRush) this.spawnGold();

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
    if (this.phase !== 'live') return; // the boss fell this tick
    this.stepBullets();
    if (this.phase !== 'live') return;
    this.pickups();
    this.spawnLoot();
    this.announce();
    if (this.rounds) this.stepRounds();
    else if (this.zombie && this.hadHumans && !this.aliveCount()) this.end(); // the whole squad is down
    else if (this.potMode && !this.dm && !this.zombie && !this.goldRush && this.sides > 1 && this.aliveSides().size <= 1) this.end();
    else if (this.time >= this.duration - 1e-9) this.end();
    else if (this.practice && !this.respawns && !this.rounds && this.hadHumans && !this.humansInside() && !this.humansWatching()) this.end();
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
  slash(p, base) {
    // the blade you hold sets the reach and the width of the swing (a katana reaches further)
    const wp = { ...base, ...meleeOf(p.ws?.[base.id]) };
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
    if (this.zombie) {
      for (const z of this.zombies.values()) {
        const d = Math.hypot(z.x - p.x, z.y - p.y);
        if (d > wp.reach + CFG.PLAYER_R + z.r) continue;
        let da = Math.atan2(z.y - p.y, z.x - p.x) - p.aim;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) <= wp.arc / 2) return this.horde.hit(z, p, wp.dmg);
      }
      return;
    }
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

  // where a round stopped (k: 'p' in a body, 'w' a wall or a gadget, 'r' out of range):
  // clients draw every tracer exactly to that point, so what you see is where it hit
  endBullet(b, t, nx, ny, k) {
    this.bullets.delete(b.id);
    const x = b.x + (nx - b.x) * Math.min(1, t);
    const y = b.y + (ny - b.y) * Math.min(1, t);
    this.bulletEnds.push({ i: b.id, x: r1(x), y: r1(y), k, t: this.tick });
    // a rocket bursts wherever it stops (the burst does the damage, not the hit)
    if (b.blast) {
      this.blast(x, y, { ...b, dmg: b.blastDmg });
      return true;
    }
    return false;
  }

  stepBullets() {
    const walls = this.map.walls;
    if (this.bulletEnds.length) this.bulletEnds = this.bulletEnds.filter((e) => e.t > this.tick - 6);
    for (const b of this.bullets.values()) {
      // never past the weapon's range: the last step is cut short where the range runs out
      const step = Math.min(1, Math.max(0, b.range - b.dist) / (b.speed * DT));
      const nx = b.x + b.vx * DT * step;
      const ny = b.y + b.vy * DT * step;
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
      // zombies: the squad's bullets fly through each other and stop in the dead
      let zed = null;
      if (this.zombie) {
        victim = null;
        tMin = tWall >= 0 ? tWall : 1.0001;
        for (const z of this.zombies.values()) {
          const t = segCircle(b.x, b.y, nx, ny, z.x, z.y, z.r + 3);
          if (t >= 0 && t < tMin) {
            tMin = t;
            zed = z;
          }
        }
      }
      if (zed) {
        if (this.endBullet(b, tMin, nx, ny, 'p')) {
          if (this.phase !== 'live') return;
          continue;
        }
        const hs = this.headshot(b, zed, zed.r / CFG.PLAYER_R);
        this.horde.hit(zed, this.players.get(b.owner), hs ? b.dmg * CFG.HEADSHOT : b.dmg, hs);
        if (this.phase !== 'live') return;
        continue;
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
        this.endBullet(b, tMin, nx, ny, 'w');
        this.hitGadget(gadget, this.players.get(b.owner), b.dmg);
        continue;
      }
      if (victim) {
        if (this.endBullet(b, tMin, nx, ny, 'p')) continue;
        const hs = this.headshot(b, victim);
        this.damage(victim, this.players.get(b.owner), hs ? b.dmg * CFG.HEADSHOT : b.dmg, b.cause, hs);
        continue;
      }
      if (tWall >= 0) {
        this.endBullet(b, tWall, nx, ny, 'w');
        continue;
      }
      b.x = nx;
      b.y = ny;
      b.dist += b.speed * DT * step;
      if (b.dist >= b.range - 1e-6 || nx < 0 || ny < 0 || nx > this.map.w || ny > this.map.h) this.endBullet(b, 1, nx, ny, 'r');
    }
  }

  // A gun round that passes close to the middle of the body is a headshot: a clean, centred
  // hit, whatever the direction it came from (turret rounds never count)
  headshot(b, v, scale = 1) {
    if (b.cause !== 'shot') return false;
    const d = Math.abs((v.x - b.x) * b.vy - (v.y - b.y) * b.vx) / (b.speed || 1);
    return d < CFG.HEAD_R * scale;
  }

  damage(v, shooter, amount, cause = 'shot', hs = false) {
    if (v.shield > 0) return;
    if (shooter && shooter !== v && this.teamSize && shooter.team === v.team) return; // no friendly fire
    if (shooter && this.zombie) return; // zombies: the squad never hurts itself
    if (shooter?.isBot && !v.isBot) amount *= this.practice ? PRACTICE_BOT_DAMAGE[this.difficulty] ?? 0.5 : BOT_DAMAGE;
    if (this.hardcore) amount = Math.max(amount, v.hp); // one hit is enough
    if (shooter && shooter !== v) {
      shooter.dmgDealt += Math.min(amount, Math.max(0, v.hp));
      const k = shooter.isBot && v.isBot ? XP.botOnBotDamage : 1;
      this.addXp(shooter, Math.min(amount, Math.max(0, v.hp)) * XP.damage * k);
      v.lastAttacker = shooter.id;
    }
    const full = v.hp >= this.maxHp;
    const dealt = Math.max(1, Math.round(Math.min(amount, Math.max(0, v.hp)) * (CFG.HP / this.maxHp))); // shown over the target
    v.hp -= amount;
    v.dmgTaken = (v.dmgTaken ?? 0) + amount; // for "untouchable"
    if (full && v.hp <= 0 && shooter && shooter !== v && !this.hardcore) shooter.oneShots = (shooter.oneShots ?? 0) + 1; // full health to nothing in one hit
    v.lastHit = this.time;
    v.ext = 0;
    if (hs && shooter && shooter !== v) shooter.headshots = (shooter.headshots ?? 0) + 1;
    this.emit({ k: 'hit', to: shooter ? [v.id, shooter.id] : [v.id], vid: v.id, sid: shooter?.id ?? 0, x: r1(v.x), y: r1(v.y), d: dealt, ...(hs ? { hs: 1 } : {}), ...(v.hp <= 0 ? { fatal: 1 } : {}) });
    if (v.hp <= 0) this.kill(v, shooter, cause, hs);
  }

  kill(v, killer, cause = 'shot', hs = false) {
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
    // gold rush: half of what you carried spills where you fell
    if (this.goldRush && v.gb > 1) {
      const n = Math.floor(v.gb / 2);
      v.gb -= n;
      const g = { id: this.nextId++, x: v.x, y: v.y, v: n, drop: 1 };
      this.gold.set(g.id, g);
    }
    if (this.respawns && this.phase === 'live') v.respawnAt = this.time + CFG.RESPAWN;
    if (killer && killer !== v) {
      killer.kills++;
      if (this.shop) killer.cr = Math.min(GL.MAX, killer.cr + GL.KILL);
      this.addXp(killer, killer.isBot && v.isBot ? XP.botOnBot : XP.kill);
      this.streak(killer);
    }
    // public feed: names only, never amounts
    this.emit({ k: 'kill', killer: killer?.name ?? null, victim: v.name, kid: killer?.id ?? 0, vid: v.id, cause, ...(hs ? { hs: 1 } : {}) });
    if (this.dm && killer && killer !== v) this.checkLead();
  }

  // ------------------------------------------------------------ deathmatch

  // Back in: a fresh spawn away from everyone, full health, a moment of spawn shield.
  // You keep your kills, your place on the weapon ladder and your credits.
  // revive (zombies): back up next to a teammate at the start of a wave, half health
  respawn(p, revive = false, quiet = false) {
    const others = [...this.players.values()].filter((o) => o.status === 'alive');
    const pos = this.zombie ? this.squadSpot(others) : findSpawn(this.map, this.rnd, others, this.zone);
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
    if (revive) p.hp = Math.ceil(this.maxHp / 2);
    if (this.goldRush) p.w = this.randomGun(); // a new gun every life
    else if (this.fixedWeapon < 0 && !this.noLadder) {
      // every death costs a step on the ladder, never below the pistol (no knife after the start)
      const was = p.w;
      p.w = Math.max(1, p.w - 1);
      p.xp = 0;
      if (p.w !== was) this.emit({ k: 'demote', to: [p.id], w: p.w });
    }
    p.queue.length = 0;
    p.last = sanitizeInput({ s: p.ack });
    this.arm(p);
    this.brains.get(p.id)?.reset();
    if (!quiet) this.emit({ k: 'respawn', to: [p.id], pid: p.id });
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
    if (!p || p.id === o.owner || this.zombie) return false; // zombies: gadgets are the squad's
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
      const own = [...this.turrets.values()].filter((o) => o.owner === p.id);
      if (own.length >= it.max + (this.zombie ? 1 : 0)) {
        // zombies: a new turret replaces your oldest one (a fresh one, full health and time)
        if (!this.zombie) return no('limit');
        this.turrets.delete(own[0].id);
      }
      // set down a step in front of you, or at your feet if a wall is in the way
      const fx = p.x + Math.cos(p.aim) * 34;
      const fy = p.y + Math.sin(p.aim) * 34;
      const free = segWalls(p.x, p.y, fx, fy, this.map.walls) < 0;
      const o = { id: this.nextId++, kind: 'turret', sk: p.ts, owner: p.id, team: p.team, x: free ? fx : p.x, y: free ? fy : p.y, a: p.aim, hp: it.hp, cd: 0.6, until: this.time + it.life, fc: 0, lv: 1 };
      this.turrets.set(o.id, o);
    } else if (item === 'mine') {
      const mine = [...this.mines.values()].filter((o) => o.owner === p.id);
      if (mine.length >= it.max) {
        if (!this.zombie) return no('limit');
        this.mines.delete(mine[0].id); // zombies: the oldest tripmine makes way for the new one
      }
      // the beam runs from your feet the way you aim, to the first wall
      const ex = p.x + Math.cos(p.aim) * it.len;
      const ey = p.y + Math.sin(p.aim) * it.len;
      const t = segWalls(p.x, p.y, ex, ey, this.map.walls);
      const k = t >= 0 ? t : 1;
      if (k * it.len < 60) return no('wall');
      const o = { id: this.nextId++, kind: 'mine', owner: p.id, team: p.team, x: p.x, y: p.y, a: p.aim, lv: 1, armAt: this.time + it.arm };
      this.mineBeams(o);
      this.mines.set(o.id, o);
    }
    p.cr -= it.cost;
    this.emit({ k: 'bought', to: [p.id], item, pid: p.id, x: r1(p.x), y: r1(p.y) });
    return true;
  }

  // the beams of a tripmine: one straight ahead, a fan of two or three once upgraded, each
  // stopped by the first wall (x2, y2 is the first; lines holds them all)
  mineBeams(o) {
    const it = GL.ITEMS.mine;
    const n = GL.MINE_LV[o.lv].beams;
    const spread = 0.32;
    o.lines = [];
    for (let i = 0; i < n; i++) {
      const a = o.a + (n === 1 ? 0 : (i - (n - 1) / 2) * spread);
      const ex = o.x + Math.cos(a) * it.len;
      const ey = o.y + Math.sin(a) * it.len;
      const t = segWalls(o.x, o.y, ex, ey, this.map.walls);
      const k = t >= 0 ? t : 1;
      o.lines.push([o.x + (ex - o.x) * k, o.y + (ey - o.y) * k]);
    }
    [o.x2, o.y2] = o.lines[n === 2 ? 0 : Math.floor(n / 2)];
  }

  // Space next to your own turret or tripmine: the next level, for credits. A turret comes
  // back to full health and a full clock; a tripmine gets another beam.
  upgrade(id) {
    const p = this.players.get(id);
    if (!this.shop || !p || p.status !== 'alive' || this.phase !== 'live') return false;
    const no = (why) => {
      this.emit({ k: 'buyFail', to: [p.id], item: 'upgrade', why });
      return false;
    };
    let best = null;
    let bd = GL.UP_REACH;
    for (const o of [...this.turrets.values(), ...this.mines.values()]) {
      if (o.owner !== p.id) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (!best) return no('near');
    const lv = best.lv ?? 1;
    if (lv >= 3) return no('max');
    const cost = GL.UP[lv + 1];
    if (p.cr < cost) return no('cash');
    p.cr -= cost;
    best.lv = lv + 1;
    if (best.kind === 'turret') {
      best.hp = GL.TURRET_LV[best.lv].hp;
      best.until = this.time + GL.ITEMS.turret.life;
    } else this.mineBeams(best);
    this.emit({ k: 'upgraded', to: [p.id], kind: best.kind, lv: best.lv, x: r1(best.x), y: r1(best.y) });
    return true;
  }

  // a rocket bursts: everything hostile in the blast takes damage, less towards the edge
  blast(x, y, b) {
    this.emit({ k: 'boom', x: r1(x), y: r1(y), small: 1 });
    const owner = this.players.get(b.owner);
    if (this.zombie) {
      for (const z of [...this.zombies.values()]) {
        const d = Math.hypot(z.x - x, z.y - y);
        if (d <= b.blast + z.r) this.horde.hit(z, owner, b.dmg * (1 - (0.5 * d) / (b.blast + z.r)));
        if (this.phase !== 'live') return;
      }
      return;
    }
    for (const p of this.players.values()) {
      if (p.status !== 'alive' || p.id === b.owner || (this.teamSize && owner && p.team === owner.team)) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= b.blast) this.damage(p, owner, b.dmg * (1 - (0.5 * d) / b.blast), 'turret');
    }
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
      // zombies: turrets shoot the dead; otherwise the nearest enemy runner
      const targets = this.zombie ? this.zombies.values() : [...this.players.values()].filter((p) => p.status === 'alive' && p.shield <= 0 && this.hostile(o, p));
      for (const p of targets) {
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
      const L = GL.TURRET_LV[o.lv ?? 1];
      o.cd = L.cd;
      o.fc = (o.fc + 1) % 1000;
      const a = o.a + (this.rnd() - 0.5) * (L.kind === 'r' ? 0.02 : 0.06);
      const b = { id: this.nextId++, owner: o.owner, x: o.x + Math.cos(a) * 18, y: o.y + Math.sin(a) * 18, vx: Math.cos(a) * L.speed, vy: Math.sin(a) * L.speed, speed: L.speed, range: it.range + 40, dmg: L.dmg, dist: 0, skin: null, cause: 'turret', ...(L.kind ? { kind: L.kind } : {}), ...(L.blast ? { blast: L.blast, blastDmg: L.blastDmg } : {}) };
      this.bullets.set(b.id, b);
    }
  }

  // Laser tripmines: armed after a moment; an enemy crossing the beam sets it off.
  stepMines() {
    const it = GL.ITEMS.mine;
    for (const o of this.mines.values()) {
      if (this.time < o.armAt) continue;
      let trip = null;
      const lines = o.lines ?? [[o.x2, o.y2]];
      const crosses = (x, y, r) => lines.some(([x2, y2]) => segCircle(o.x, o.y, x2, y2, x, y, r) >= 0);
      if (this.zombie) {
        for (const z of this.zombies.values()) if (crosses(z.x, z.y, z.r)) trip = z;
      } else
        for (const p of this.players.values()) {
          if (p.status !== 'alive' || p.shield > 0 || !this.hostile(o, p)) continue;
          if (crosses(p.x, p.y, CFG.PLAYER_R)) {
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
      const mdmg = GL.MINE_LV[o.lv ?? 1].dmg;
      if (this.zombie) {
        for (const z of [...this.zombies.values()]) {
          const d = Math.hypot(z.x - bx, z.y - by);
          if (d <= it.r + z.r) this.horde.hit(z, owner, mdmg * 1.5 * (1 - (0.5 * d) / (it.r + z.r)));
          if (this.phase !== 'live') return;
        }
        continue;
      }
      for (const p of this.players.values()) {
        if (p.status !== 'alive' || !this.hostile(o, p)) continue;
        const d = Math.hypot(p.x - bx, p.y - by);
        if (d > it.r) continue;
        this.damage(p, owner, mdmg * (1 - (0.6 * d) / it.r), 'mine');
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
    if (this.fixedWeapon >= 0 || this.noLadder) {
      p.xp %= XP_PER_LEVEL; // one weapon for the whole raid: no arms race
      return;
    }
    while (p.xp >= XP_PER_LEVEL) {
      p.xp -= XP_PER_LEVEL;
      // the knife is only for the start: after the last gun the ladder starts over at the pistol
      const wrap = p.w + 1 >= WEAPONS.length;
      p.w = wrap ? 1 : p.w + 1;
      p.fireCd = Math.min(p.fireCd, 0.15);
      this.arm(p);
      if (wrap) {
        p.prestige++;
        this.emit({ k: 'arsenal', name: p.name, pid: p.id });
      }
      this.emit({ k: 'level', to: [p.id], w: p.w, prestige: p.prestige, ...(wrap ? { wrap: 1 } : {}) });
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
      for (const m of this.packs.values()) {
        if ((m.x - p.x) ** 2 + (m.y - p.y) ** 2 > (CFG.PLAYER_R + 14) ** 2 || p.hp >= this.maxHp) continue;
        p.hp = Math.min(this.maxHp, p.hp + m.heal);
        this.packs.delete(m.id);
        this.emit({ k: 'medkit', to: [p.id], x: r1(m.x), y: r1(m.y) });
      }
      for (const g of this.gold.values()) {
        if ((g.x - p.x) ** 2 + (g.y - p.y) ** 2 > GOLD.r ** 2) continue;
        p.gb += g.v;
        p.gbAt = this.time;
        this.gold.delete(g.id);
        this.emit({ k: 'gold', to: [p.id], v: g.v, n: p.gb, x: r1(g.x), y: r1(g.y) });
        this.checkGoldLead();
      }
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

  // -------------------------------------------------------------- rounds

  sideName(side) {
    if (!side) return null;
    if (side[0] === 't') return null;
    return this.players.get(Number(side.slice(1)))?.name ?? null;
  }

  // the round is over when one side is left, or the clock runs out (most alive, then most
  // health wins it; a dead heat is nobody's round). First to `rounds` wins takes the match.
  stepRounds() {
    if (this.roundBreak > 0) {
      this.roundBreak -= DT;
      if (this.roundBreak <= 0) this.startRound();
      return;
    }
    const sides = this.aliveSides();
    const timeUp = this.time >= this.roundEndsAt - 1e-9;
    if (!(this.sides > 1 && sides.size <= 1) && !timeUp) return;
    let win = sides.size === 1 ? [...sides][0] : null;
    if (!win && sides.size > 1) {
      const sc = new Map();
      for (const p of this.players.values()) {
        if (p.status !== 'alive') continue;
        const s = sc.get(this.sideOf(p)) ?? { n: 0, hp: 0 };
        s.n++;
        s.hp += p.hp;
        sc.set(this.sideOf(p), s);
      }
      const best = [...sc.entries()].sort((a, b) => b[1].n - a[1].n || b[1].hp - a[1].hp);
      if (best[0] && (!best[1] || best[0][1].n !== best[1][1].n || best[0][1].hp !== best[1][1].hp)) win = best[0][0];
    }
    if (win) this.score.set(win, (this.score.get(win) ?? 0) + 1);
    const top = Math.max(0, ...this.score.values());
    this.emit({ k: 'roundEnd', n: this.roundNo, win, name: this.sideName(win), score: this.scoreList() });
    if (top >= this.rounds || this.roundNo >= this.maxRounds) return this.end();
    this.roundBreak = ROUND_BREAK;
    this.roundEndsAt = this.time + ROUND_BREAK;
    // nobody gets hurt between rounds
    for (const p of this.players.values()) if (p.status === 'alive') p.shield = ROUND_BREAK + 1;
  }

  startRound() {
    this.roundNo++;
    this.roundEndsAt = this.time + this.roundLen;
    this.bullets.clear();
    for (const p of this.players.values()) this.respawn(p, false, true);
    this.emit({ k: 'roundStart', n: this.roundNo, of: this.maxRounds });
  }

  // [side, wins] with names for solo modes, best first
  scoreList() {
    const all = this.teamSize ? ['t0', 't1'] : [...this.players.values()].map((p) => this.sideOf(p));
    return all.map((s) => [s, this.score.get(s) ?? 0, this.sideName(s)]).sort((a, b) => b[1] - a[1]);
  }

  roundView(me) {
    const mine = this.sideOf(me);
    const list = this.scoreList();
    return {
      rd: this.roundNo,
      rds: this.maxRounds,
      need: this.rounds,
      rb: this.roundBreak > 0 ? Math.ceil(this.roundBreak) : 0,
      my: this.score.get(mine) ?? 0,
      foe: Math.max(0, ...list.filter((x) => x[0] !== mine).map((x) => x[1])),
      ...(this.teamSize ? {} : { lead: list[0] && list[0][1] > 0 ? [list[0][2], list[0][1]] : null }),
    };
  }

  // the match: most rounds won (then kills) takes the pot; places follow the same order
  settleRounds() {
    const kills = new Map();
    for (const p of this.players.values()) kills.set(this.sideOf(p), (kills.get(this.sideOf(p)) ?? 0) + p.kills);
    const order = [...new Set([...this.players.values()].map((p) => this.sideOf(p)))].sort((a, b) => (this.score.get(b) ?? 0) - (this.score.get(a) ?? 0) || kills.get(b) - kills.get(a));
    const top = order[0];
    const tie = order[1] && (this.score.get(order[1]) ?? 0) === (this.score.get(top) ?? 0) && kills.get(order[1]) === kills.get(top);
    for (const p of this.players.values()) p.place = order.indexOf(this.sideOf(p)) + 1;
    const winners = tie || !top ? [] : [...this.players.values()].filter((p) => this.sideOf(p) === top);
    this.winners = winners.map((p) => p.id);
    if (!winners.length || this.pot <= 0) return;
    this.payPot(winners);
  }

  // ----------------------------------------------------------- gold rush

  // keep the ground stocked: a bag lands somewhere open every moment, up to a cap
  spawnGold() {
    this.goldT -= DT;
    const want = GOLD.base + GOLD.perRunner * this.players.size;
    let loose = 0;
    for (const g of this.gold.values()) if (!g.drop) loose++;
    if (this.goldT > 0 || loose >= want) return;
    const first = this.tick <= 1;
    this.goldT = GOLD.every;
    const n = first ? want : 1; // the opening: the whole field at once
    for (let i = 0; i < n; i++) {
      const pos = randomLootPoint(this.map, this.rnd, false, null);
      if (!pos) continue;
      const big = this.rnd() < GOLD.big;
      const g = { id: this.nextId++, x: pos.x, y: pos.y, v: big ? 3 : 1 };
      this.gold.set(g.id, g);
    }
  }

  // most bags first; a tie goes to whoever got there first
  goldOrder() {
    return [...this.players.values()].sort((a, b) => b.gb - a.gb || a.gbAt - b.gbAt || a.id - b.id);
  }

  checkGoldLead() {
    const [a, b] = this.goldOrder();
    const lead = a && a.gb > 0 && (!b || a.gb > b.gb) ? a : null;
    if (!lead || lead.id === this.leaderId) return;
    const old = this.leaderId ? this.players.get(this.leaderId) : null;
    this.leaderId = lead.id;
    this.emit({ k: 'lead', to: [lead.id], pid: lead.id });
    if (old) this.emit({ k: 'lostLead', to: [old.id], pid: old.id });
  }

  goldView(me) {
    const order = this.goldOrder();
    return {
      gb: me.gb,
      pl: order.indexOf(me) + 1,
      dth: me.deaths,
      rs: me.status === 'dead' && me.respawnAt !== null ? r2(Math.max(0, me.respawnAt - this.time)) : 0,
      top: order.slice(0, 3).map((p) => [p.name, p.gb, p.id === me.id ? 1 : 0]),
    };
  }

  // only one winner: the most bags (the earliest to that count on a tie); nobody with a
  // single bag means no winner and the pot waits for the next rush
  settleGold() {
    const top = this.goldOrder()[0];
    const winners = top && top.gb > 0 ? [top] : [];
    this.winners = winners.map((p) => p.id);
    if (!winners.length || this.pot <= 0) return;
    this.payPot(winners);
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
    if (!this.botsEnabled || !this.canJoin() || this.zombie) return; // zombies: humans only
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
    if (this.rounds) return; // each round has its own clock on the HUD
    if (this.zombie) return; // no clock in zombies
    if (this.goldRush) {
      if (tl <= 30) say('30', 'warn.gold30');
      if (tl <= 10) say('10', 'warn.gold10');
      return;
    }
    if (tl <= 30) say('30', this.potMode ? 'warn.pot30' : 'warn.exit30');
    if (tl <= 10) say('10', this.potMode ? 'warn.pot10' : 'warn.exit10');
  }

  // Pot modes: the last side standing takes the pot. If the clock runs out first, the side
  // with the most runners alive wins (then most kills); a dead heat splits it among them.
  settlePot() {
    if (this.dm) return this.settleKills();
    if (this.goldRush) return this.settleGold();
    if (this.rounds) return this.settleRounds();
    if (this.zombie) return; // no pot: the entry was a fee
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
      // gold rush pays shop credit, not coins
      this.emit({ k: 'payout', to: [p.id], pid: p.id, amount, ...(this.goldRush ? { credit: 1 } : {}) });
    }
    this.pot = 0;
    this.emit({ k: 'winners', names: winners.map((p) => p.name), team: this.teamSize ? winners[0].team : null });
  }

  end() {
    if (this.phase !== 'live') return;
    if (this.zombie) {
      // a cleared run is the whole squad's, the fallen included
      const cleared = !!this.horde.bossDown;
      for (const p of this.players.values()) {
        p.zWave = this.horde.cleared;
        p.won = cleared;
        if (cleared) p.place = 1;
        if (p.status === 'alive') {
          p.status = cleared ? 'won' : 'mia';
          p.endedAt = this.time;
        }
      }
      this.zombies.clear();
    }
    if (this.respawns || this.rounds) {
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
    this.packs.clear();
    this.gold.clear();
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
    const pct = (o) => Math.ceil((o.hp / GL.TURRET_LV[o.lv ?? 1].hp) * 100);
    const mine = (o) => (o.owner === me.id ? 1 : (this.teamSize && o.team === me.team) || this.zombie ? 2 : 0);
    const turrets = [];
    for (const o of this.turrets.values()) if (near(o.x, o.y, 40)) turrets.push({ i: o.id, x: r1(o.x), y: r1(o.y), a: r2(o.a), h: pct(o), fc: o.fc, o: mine(o), lv: o.lv ?? 1, tl: Math.ceil(o.until - this.time), ...(o.sk ? { sk: o.sk } : {}) });
    const mines = [];
    for (const o of this.mines.values()) {
      const lines = o.lines ?? [[o.x2, o.y2]];
      if (!near(o.x, o.y, 40) && !lines.some(([x, y]) => near(x, y, 40) || near((o.x + x) / 2, (o.y + y) / 2, 40))) continue;
      mines.push({ i: o.id, x: r1(o.x), y: r1(o.y), x2: r1(o.x2), y2: r1(o.y2), o: mine(o), lv: o.lv ?? 1, ...(lines.length > 1 ? { ls: lines.map(([x, y]) => [r1(x), r1(y)]) } : {}), arm: this.time >= o.armAt ? 1 : 0 });
    }
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
      out.push([Math.round(p.x / 10), Math.round(p.y / 10), (this.teamSize && p.team === me.team) || this.zombie ? 1 : 0]);
    }
    // zombies: the horde too (the boss marked 2)
    let n = 0;
    for (const z of this.zombies.values()) {
      if (n++ > 60) break;
      out.push([Math.round(z.x / 10), Math.round(z.y / 10), z.type === 'boss' ? 2 : 0]);
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
    // the dead travel with the runners, marked by their kind (zb), in sight or not:
    // a horde you can't see coming through the dark is no fun
    for (const z of this.zombies.values()) {
      if (!near(z.x, z.y, 200)) continue;
      players.push({ i: z.id, zb: z.type, x: r1(z.x), y: r1(z.y), a: r2(z.a), h: Math.max(1, Math.ceil((z.hp / z.max) * 100)), fc: z.fc, w: 0 });
    }
    const orbs = [];
    for (const o of this.orbs.values()) if (near(o.x, o.y, 40)) orbs.push({ i: o.id, x: r1(o.x), y: r1(o.y), t: o.t });
    const drops = [];
    for (const d of this.drops.values()) if (near(d.x, d.y, 40)) drops.push({ i: d.id, x: r1(d.x), y: r1(d.y) });
    const packs = [];
    for (const m of this.packs.values()) if (near(m.x, m.y, 40)) packs.push({ i: m.id, x: r1(m.x), y: r1(m.y) });
    const gold = [];
    for (const g of this.gold.values()) if (near(g.x, g.y, 60)) gold.push({ i: g.id, x: r1(g.x), y: r1(g.y), v: g.v });
    const bullets = [];
    for (const b of this.bullets.values()) {
      if (near(b.x, b.y, 120)) bullets.push({ i: b.id, x: r1(b.x), y: r1(b.y), vx: r1(b.vx), vy: r1(b.vy), d: r1(b.dist), o: b.owner === me.id ? 1 : 0, ...(b.kind ? { k: b.kind } : {}), ...(b.skin ? { s: b.skin } : {}) });
    }
    // rounds that stopped since the last snapshot, and where
    const ends = [];
    for (const e of this.bulletEnds) if (e.t > this.tick - CFG.SNAP_EVERY && near(e.x, e.y, 120)) ends.push([e.i, e.x, e.y, e.k]);

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
        ...(this.goldRush ? this.goldView(me) : {}),
        ...(this.rounds ? this.roundView(me) : {}),
        ...(this.horde ? { ...this.horde.view(), zk: me.zk } : {}),
        ...(this.shop ? { cr: me.cr } : {}),
      },
      players,
      // the minimap radar: every runner still standing, coarse, a few times a second
      ...(this.tick % 3 === 0 ? { radar: this.radarFor(me) } : {}),
      ...(this.shop ? this.gadgetsNear(me, near) : {}),
      orbs,
      drops,
      bullets,
      ...(ends.length ? { ends } : {}),
      ...(packs.length ? { packs } : {}),
      ...(this.goldRush ? { gold } : {}),
    };
  }
}
