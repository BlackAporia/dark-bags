// The Descent: a co-op PvE dungeon, fifty floors deep. One to four runners go down together,
// each as one of four classes, and every floor is a mission: clear the room, burn the nests,
// hold the seal, outlast the swarm; every fifth floor a boss with its own tricks. After each
// floor the squad stands in the camp: buy gear with the coins the dead dropped, then go deeper
// or get out. Getting out banks everything the run earned; dying down there loses the floor
// rewards (XP is halved, never lost). Clearing floor 50 is the full clear: a character skin,
// a chat frame and name style and a title that exist nowhere else.
//
// Entry is a ticket: one free a day (unused, it is gone the next day), the rest bought at
// $0.10 each. A difficulty costs 1, 3 or 5 tickets and pays rarer things the harder it is.
//
// Everything here is pure: the rules (floors, bosses, classes, gear, rewards) for the sim
// (shared/world.js) and the client, and the ticket book the server keeps.
import { CFG, GL } from './config.js';
import { moveCircle, hasLOS, circleHitsRect } from './geom.js';
import { Horde, ZTYPES, BOSS } from './horde.js';
import { generateArena, pointFree } from './map.js';
import { WEAPONS } from './weapons.js';
// the things only the Descent hands out: their catalog lives in descent-items.js (the locker and
// style books import it without pulling in the sim)
import { DESCENT_FINISHES, DESCENT_OUTFITS, DESCENT_STYLE, rarityAt, RAR } from './descent-items.js';
export { DESCENT_FINISHES, DESCENT_OUTFITS, DESCENT_STYLE, rarityAt };

export const FLOORS = 50;
export const MILESTONE = 5; // a reward every fifth floor, a boss on it
export const CAMP_SECONDS = 45; // between floors: shop, heal up, choose
export const CAMP_HEAL = 30;
export const START_COINS = 300;
export const TICKET_MILLS = 100; // $0.10
// bundles: tickets for $ (mills): a little cheaper in bulk
export const TICKET_PACKS = [
  { n: 1, mills: 100 },
  { n: 10, mills: 900 },
  { n: 50, mills: 4000 },
  { n: 100, mills: 7500 },
];
export const MAX_TICKETS = 2000; // nobody needs more banked than this
export const BUY_PER_DAY = 1000; // tickets one account may buy in a day

// difficulty: tickets it costs, how much tougher the dead are, coins, and whether the fallen
// stand back up in the camp. Hardcore: no second chances (only a medic's revive).
export const DIFFS = {
  easy: { tickets: 1, hp: 1, dmg: 1, count: 1, coins: 1, revive: true, xp: 1 },
  hard: { tickets: 3, hp: 1.75, dmg: 1.45, count: 1.25, coins: 1.2, revive: true, xp: 1.6 },
  hardcore: { tickets: 5, hp: 2.6, dmg: 2, count: 1.45, coins: 1.4, revive: false, xp: 2.4 },
};
export const DIFF_IDS = Object.keys(DIFFS);

// classes: one gun each (no swapping it for another), a pistol of your choice on the side
export const CLASSES = {
  assault: { weapon: 'carbine', icon: '⚔', color: '#f97316' },
  engineer: { weapon: 'smg', icon: '⚙', color: '#facc15' },
  medic: { weapon: 'shotgun', icon: '✚', color: '#4ade80' },
  sniper: { weapon: 'sniper', icon: '⌖', color: '#60a5fa' },
};
export const CLASS_IDS = Object.keys(CLASSES);
export const PISTOLS = ['pistol', 'deagle'];
export const DESCENT_WEAPONS = [...new Set([...CLASS_IDS.map((c) => CLASSES[c].weapon), ...PISTOLS])];

// The camp shop (and mid-fight: everything but gun and armour upgrades works any time).
// Levels: gun +15% damage a level (both guns), armour 8% less damage taken a level.
// cls: only that class may buy it.
export const GEAR = {
  gun: { max: 5, cost: [350, 800, 1600, 3000, 5200], step: 0.15 },
  armor: { max: 5, cost: [300, 700, 1400, 2600, 4500], step: 0.08 },
  medkit: { cost: 150, heal: 60 },
  stim: { cls: 'assault', cost: 250, secs: 8, dmg: 1.35, rof: 0.7 },
  turret: { cls: 'engineer', cost: GL.ITEMS.turret.cost },
  mine: { cls: 'engineer', cost: GL.ITEMS.mine.cost },
  aid: { cls: 'medic', cost: 300, heal: 55, r: 300 },
  revive: { cls: 'medic', cost: 600 },
  ap: { cls: 'sniper', max: 2, cost: [900, 2200] }, // armour-piercing rounds: each level, one more body
};
export const GEAR_IDS = Object.keys(GEAR);
export const gearCost = (id, lv = 0) => {
  const g = GEAR[id];
  if (!g) return null;
  return Array.isArray(g.cost) ? g.cost[lv] ?? null : g.cost;
};

// the dead down here: the zombie mode's kinds, plus spitters (acid from a distance) and nests
export const DTYPES = {
  ...ZTYPES,
  spitter: { hp: 46, speed: 84, dmg: 9, r: 16, cd: 2.1, range: 520, shot: 520 },
  nest: { hp: 900, speed: 0, dmg: 0, r: 30, cd: 6 },
};
// coins a kill drops (scaled by floor and difficulty)
export const COINS = { walker: 30, runner: 30, spitter: 45, brute: 90, nest: 250, boss: 700 };

// Five chapters of ten floors; each has its own look (map.depth) and its two bosses.
export const CHAPTERS = [
  { id: 'crypt', tint: '#4ade80' },
  { id: 'ember', tint: '#fb923c' },
  { id: 'frost', tint: '#7dd3fc' },
  { id: 'void', tint: '#c084fc' },
  { id: 'throne', tint: '#fcd34d' },
];
export const chapterOf = (floor) => Math.min(CHAPTERS.length - 1, Math.floor((Math.max(1, floor) - 1) / 10));

// Ten bosses, one every fifth floor. hp: how much of the base boss's health, skills: what it does
//   slam    a ground pound that hurts everyone close
//   summon  calls a pack of runners
//   charge  winds up and rushes the one it hunts
//   volley  sprays acid all round
//   shield  turns to stone for a moment (nothing hurts it) and its brood comes
export const BOSSES = [
  { id: 'gravekeeper', floor: 5, hp: 0.5, speed: 96, skills: ['slam', 'summon'], color: '#5a476e', eye: '#ff2d55' },
  { id: 'colossus', floor: 10, hp: 0.85, speed: 88, skills: ['slam', 'charge'], color: '#d6d3c4', eye: '#7dd3fc' },
  { id: 'warden', floor: 15, hp: 1, speed: 92, skills: ['volley', 'slam'], color: '#7c2d12', eye: '#fde047' },
  { id: 'matriarch', floor: 20, hp: 1.2, speed: 90, skills: ['summon', 'volley', 'shield'], color: '#b91c1c', eye: '#fdba74' },
  { id: 'stalker', floor: 25, hp: 1.2, speed: 128, skills: ['charge', 'volley'], color: '#bae6fd', eye: '#0ea5e9' },
  { id: 'titan', floor: 30, hp: 1.55, speed: 80, skills: ['slam', 'shield', 'charge'], color: '#93c5fd', eye: '#e0f2fe' },
  { id: 'prophet', floor: 35, hp: 1.6, speed: 100, skills: ['shield', 'summon', 'volley'], color: '#3b0764', eye: '#e879f9' },
  { id: 'hive', floor: 40, hp: 1.85, speed: 86, skills: ['summon', 'volley', 'slam'], color: '#581c87', eye: '#a3e635' },
  { id: 'tyrant', floor: 45, hp: 2.1, speed: 110, skills: ['charge', 'slam', 'volley'], color: '#a16207', eye: '#fef08a' },
  { id: 'abyss_king', floor: 50, hp: 2.8, speed: 104, skills: ['slam', 'summon', 'charge', 'volley', 'shield'], color: '#0b0014', eye: '#ffd166' },
];
export const bossOf = (floor) => BOSSES.find((b) => b.floor === floor) ?? null;
const SKILL = { slam: 5, summon: 13, charge: 7, volley: 6, shield: 16 }; // seconds between uses

// What each floor asks of you. Every fifth: the boss. Otherwise four missions, rotating
// differently in each chapter so no two chapters play alike.
//   clear    kill everything that comes
//   nests    burn the nests (they keep hatching runners until they burst)
//   hold     stand on the seal until it closes (the longer nobody is on it, the slower)
//   survive  outlast the swarm until the clock runs out
export const OBJECTIVES = ['clear', 'nests', 'hold', 'survive', 'boss'];
const ROTATION = [
  ['clear', 'nests', 'clear', 'hold'],
  ['clear', 'hold', 'nests', 'survive'],
  ['nests', 'clear', 'survive', 'hold'],
  ['hold', 'nests', 'survive', 'clear'],
  ['survive', 'hold', 'nests', 'clear'],
];
export function objectiveOf(floor) {
  if (floor % MILESTONE === 0) return 'boss';
  return ROTATION[chapterOf(floor)][(floor % MILESTONE) - 1];
}
export const HOLD_SECONDS = 40;
export const HOLD_R = 150;
export const SURVIVE_SECONDS = 60;

// how big a floor is and what it is made of (squad: humans going down)
export function floorPlan(floor, diff = 'easy', squad = 1) {
  const D = DIFFS[diff] ?? DIFFS.easy;
  const k = 1 + 0.55 * (squad - 1);
  const obj = objectiveOf(floor);
  const base = 8 + 2.4 * (floor - 1);
  const mult = obj === 'boss' ? 0.45 : obj === 'survive' ? 0 : obj === 'hold' || obj === 'nests' ? 0.7 : 1;
  const count = Math.round(Math.min(150, base * mult * D.count * k));
  const f = floor;
  const mix =
    f >= 36 ? { walker: 0.24, runner: 0.34, spitter: 0.2, brute: 0.22 } :
    f >= 21 ? { walker: 0.32, runner: 0.33, spitter: 0.18, brute: 0.17 } :
    f >= 11 ? { walker: 0.42, runner: 0.3, spitter: 0.14, brute: 0.14 } :
    f >= 4 ? { walker: 0.58, runner: 0.27, spitter: 0.07, brute: 0.08 } :
    { walker: 0.78, runner: 0.22, spitter: 0, brute: 0 };
  const nests = obj === 'nests' ? Math.min(6, 3 + Math.floor(f / 15) + (squad > 2 ? 1 : 0)) : 0;
  return { floor, obj, count, mix, nests, boss: obj === 'boss' ? bossOf(floor) : null };
}
// every floor tougher: health, bite, a little speed (levels off so it stays playable)
export function floorScale(floor, diff = 'easy') {
  const D = DIFFS[diff] ?? DIFFS.easy;
  return { hp: D.hp * (1 + 0.085 * (floor - 1)), dmg: D.dmg * (1 + 0.04 * (floor - 1)), speed: Math.min(1.5, 1 + 0.012 * (floor - 1)) };
}
export const coinsFor = (type, floor, diff = 'easy') => Math.round((COINS[type] ?? 30) * (1 + 0.04 * (floor - 1)) * (DIFFS[diff] ?? DIFFS.easy).coins);
export const floorBonus = (floor, diff = 'easy') => Math.round((100 + 25 * floor) * (DIFFS[diff] ?? DIFFS.easy).coins);

// ------------------------------------------------------------- rewards

// rank XP for the floors cleared (halved for a run that died down there)
export function runXp(floors, diff = 'easy', banked = true) {
  let xp = 0;
  for (let f = 1; f <= floors; f++) xp += 30 + 7 * f + (f % MILESTONE === 0 ? 120 + 10 * f : 0);
  xp = Math.round(xp * (DIFFS[diff] ?? DIFFS.easy).xp);
  return banked ? xp : Math.floor(xp / 2);
}

// the full clear's title per difficulty (an achievement: shared/achievements.js)
export const CLEAR_TITLE = { easy: 'dx_warden', hard: 'dx_emberlord', hardcore: 'dx_abyss_king' };

// What milestone `floor` (5, 10, … 50) of a difficulty hands out, for this class and pistol.
export function milestoneItems(diff, floor, cls = 'assault', pistol = 'pistol') {
  const i = Math.round(floor / MILESTONE) - 1;
  if (i < 0 || i > 9 || floor % MILESTONE) return [];
  const gun = CLASSES[cls]?.weapon ?? 'carbine';
  const pist = PISTOLS.includes(pistol) ? pistol : 'pistol';
  const d = DIFFS[diff] ? diff : 'easy';
  switch (i) {
    case 0: return [{ k: 'wskin', id: `${pist}.dx-${d}-a` }];
    case 1: return [{ k: 'style', id: `b-dx-${d}` }];
    case 2: return [{ k: 'wskin', id: `${gun}.dx-${d}-a` }];
    case 3: return [{ k: 'style', id: `k-dx-${d}` }];
    case 4: return [{ k: 'outfit', id: `dx-${d}-1` }];
    case 5: return [{ k: 'style', id: `f-dx-${d}` }];
    case 6: return [{ k: 'wskin', id: `${gun}.dx-${d}-b` }];
    case 7: return [{ k: 'style', id: `n-dx-${d}` }];
    case 8: return [{ k: 'outfit', id: `dx-${d}-2` }];
    default: return [{ k: 'outfit', id: `dx-${d}-3` }, { k: 'style', id: `f-dx-${d}-crown` }, { k: 'style', id: `n-dx-${d}-crown` }];
  }
}

// every milestone a run reached (floors cleared), its items in order
export function runItems(diff, floors, cls, pistol) {
  const out = [];
  for (let f = MILESTONE; f <= Math.min(FLOORS, floors); f += MILESTONE) for (const it of milestoneItems(diff, f, cls, pistol)) out.push({ ...it, floor: f });
  return out;
}
// an item you already own pays this much rank XP instead
export const DUP_XP = { common: 40, rare: 80, epic: 160, legendary: 320, mythic: 640, exotic: 1200 };

// ------------------------------------------------------------- the sim

// A fresh arena for every floor: a dungeon of pillars and broken walls around an altar, with
// the gates the dead come out of. depth (0–4) picks the chapter's look on the client.
export function floorMap(seed, floor) {
  const map = generateArena((seed + floor * 7919) >>> 0, 'dungeon');
  map.depth = chapterOf(floor);
  map.floor = floor;
  return map;
}

/**
 * The Descent inside a World (shared/world.js), on the zombie mode's machinery: the dead live in
 * world.zombies, only the squad's rounds hurt them, there is no friendly fire. This adds floors
 * and missions, bosses with skills, acid, nests, the camp between floors and the class gear.
 */
export class Descent extends Horde {
  constructor(world, { diff = 'easy', floor = 1 } = {}) {
    super(world);
    this.diff = DIFFS[diff] ? diff : 'easy';
    this.D = DIFFS[this.diff];
    this.floor = floor; // the floor being fought (or the camp after it)
    this.cleared = floor - 1;
    this.state = 'intro'; // intro (story card) → fight → camp → intro …
    this.t = 7; // seconds of the story card before the first floor
    this.obj = objectiveOf(floor);
    this.hold = 0; // seal progress 0–1
    this.surviveT = 0;
    this.choice = new Map(); // pid → 'go' | 'out' in the camp
  }

  get wave() {
    return this.floor;
  }
  set wave(_v) {}

  plan() {
    return floorPlan(this.floor, this.diff, this.squad);
  }

  step(dt) {
    const w = this.w;
    if (this.state === 'intro') {
      this.t -= dt;
      if (this.t <= 0) this.startFloor();
    } else if (this.state === 'camp') {
      this.t -= dt;
      const humans = [...w.players.values()].filter((p) => !p.isBot && p.status === 'alive');
      if (this.t <= 0 || (humans.length && humans.every((p) => this.choice.has(p.id)))) this.leaveCamp();
      return;
    } else {
      this.stepFight(dt);
    }
    for (const z of this.zombies.values()) this.think(z, dt);
    this.stepShots(dt);
  }

  // the floor's mission: spawning, and whether it is done
  stepFight(dt) {
    const w = this.w;
    this.spawnT -= dt;
    const cap = Math.min(52, 30 + this.squad * 6);
    const alive = [...this.zombies.values()].filter((z) => z.type !== 'nest').length;
    const endless = this.obj === 'survive' || this.obj === 'hold';
    if ((this.toSpawn > 0 || endless) && this.spawnT <= 0 && alive < cap) {
      this.spawnT = Math.max(0.18, 0.75 - 0.012 * this.floor) / (1 + 0.3 * (this.squad - 1));
      this.spawn(this.pickType());
      if (this.toSpawn > 0) this.toSpawn--;
    }
    if (this.obj === 'hold') {
      const H = this.holdAt;
      const on = [...w.players.values()].some((p) => p.status === 'alive' && Math.hypot(p.x - H.x, p.y - H.y) < HOLD_R);
      this.hold = Math.min(1, this.hold + (on ? dt / (HOLD_SECONDS * (1 + 0.15 * (this.squad - 1))) : -dt / 90));
      this.hold = Math.max(0, this.hold);
      if (this.hold >= 1) return this.endFloor(true);
    } else if (this.obj === 'survive') {
      this.surviveT -= dt;
      if (this.surviveT <= 0) return this.endFloor(true);
    } else if (this.obj === 'nests') {
      if (![...this.zombies.values()].some((z) => z.type === 'nest')) return this.endFloor(true);
    } else if (this.obj === 'boss') {
      if (this.bossDown) return this.endFloor(true);
    } else if (!this.left()) return this.endFloor(false);
    // nests hatch runners
    for (const z of this.zombies.values()) {
      if (z.type !== 'nest') continue;
      z.cd -= dt;
      if (z.cd <= 0 && alive < cap) {
        z.cd = Math.max(3, DTYPES.nest.cd - this.floor * 0.05);
        for (let i = 0; i < 2; i++) this.spawn(this.w.rnd() < 0.7 ? 'runner' : 'walker', { x: z.x, y: z.y });
        w.emit({ k: 'hatch', x: Math.round(z.x), y: Math.round(z.y) });
      }
    }
  }

  startFloor() {
    const w = this.w;
    this.squad = Math.max(1, [...w.players.values()].filter((p) => !p.isBot && p.status !== 'extracted').length);
    const plan = this.plan();
    this.obj = plan.obj;
    this.state = 'fight';
    this.toSpawn = plan.count;
    this.spawnT = 0.8;
    this.mix = plan.mix;
    this.bossDown = false;
    this.bossId = null;
    this.hold = 0;
    this.surviveT = SURVIVE_SECONDS;
    if (this.obj === 'hold') this.holdAt = this.sealSpot();
    for (let i = 0; i < plan.nests; i++) this.spawnNest();
    if (plan.boss) this.spawn('boss');
    w.emit({ k: 'floor', n: this.floor, of: FLOORS, obj: this.obj, count: plan.count, ...(plan.boss ? { boss: plan.boss.id } : {}), ...(this.holdAt && this.obj === 'hold' ? { hx: Math.round(this.holdAt.x), hy: Math.round(this.holdAt.y) } : {}) });
  }

  // the floor is done: the rest of the dead fall (the seal closed, the swarm broke)
  endFloor(sweep) {
    const w = this.w;
    if (sweep) {
      for (const o of this.zombies.values()) w.emit({ k: 'zdead', zid: o.id, type: o.type, x: Math.round(o.x), y: Math.round(o.y), kid: 0 });
      this.zombies.clear();
    }
    w.bullets.clear();
    this.toSpawn = 0;
    this.cleared = this.floor;
    const bonus = floorBonus(this.floor, this.diff);
    for (const p of w.players.values()) {
      if (p.isBot || p.status === 'extracted') continue;
      if (p.status === 'alive') {
        p.dFloors = this.cleared;
        p.cr = Math.min(GL.MAX * 10, (p.cr ?? 0) + bonus);
        p.hp = Math.min(w.maxHp, p.hp + CAMP_HEAL);
      } else if (this.D.revive && w.aliveCount()) {
        // the fallen stand back up in the camp (not on hardcore), and the floor counts for them
        w.respawn(p, true, true);
        p.dFloors = this.cleared;
      }
    }
    for (const p of w.players.values()) if (p.status === 'alive') p.zWave = this.cleared;
    if (this.cleared >= FLOORS) {
      // the full clear: everyone standing comes up with all of it
      for (const p of w.players.values()) if (p.status === 'alive') p.dFull = true;
      w.emit({ k: 'fullClear', diff: this.diff });
      return w.end();
    }
    this.state = 'camp';
    this.t = CAMP_SECONDS;
    this.choice.clear();
    w.emit({ k: 'camp', n: this.cleared, of: FLOORS, secs: CAMP_SECONDS, bonus, next: objectiveOf(this.floor + 1), ...(bossOf(this.floor + 1) ? { boss: bossOf(this.floor + 1).id } : {}), milestone: this.cleared % MILESTONE === 0 ? 1 : 0 });
  }

  // a runner in the camp chose: go deeper, or take what the run earned and get out
  choose(p, v) {
    if (this.state !== 'camp' || p.status !== 'alive' || p.isBot) return false;
    if (v !== 'go' && v !== 'out') return false;
    this.choice.set(p.id, v);
    this.w.emit({ k: 'chose', pid: p.id, name: p.name, v });
    return true;
  }

  leaveCamp() {
    const w = this.w;
    // whoever did not choose in time gets out with what they have: never dragged deeper
    for (const p of w.players.values()) {
      if (p.isBot || p.status !== 'alive') continue;
      if ((this.choice.get(p.id) ?? 'out') === 'out') w.extract(p);
    }
    if (!w.aliveCount()) return w.end();
    this.floor++;
    this.newFloorMap();
    this.state = 'intro';
    this.t = 6;
    this.choice.clear();
  }

  // the stairs down: a new arena, everyone together in the middle, the gadgets left behind
  newFloorMap() {
    const w = this.w;
    w.map = floorMap(w.seed, this.floor);
    w.nav = null;
    this.nav = null;
    w.turrets.clear();
    w.mines.clear();
    w.packs.clear();
    w.bullets.clear();
    const placed = [];
    for (const p of w.players.values()) {
      if (p.status !== 'alive') continue;
      const pos = w.squadSpot(placed);
      p.x = pos.x;
      p.y = pos.y;
      p.vx = p.vy = 0;
      p.shield = 3;
      p.queue.length = 0;
      placed.push(p);
    }
    w.emit({ k: 'floorMap', map: w.map, n: this.floor, obj: objectiveOf(this.floor), ...(bossOf(this.floor) ? { boss: bossOf(this.floor).id } : {}), story: 1 });
  }

  // the seal for a hold: somewhere off the middle, on open floor
  sealSpot() {
    const w = this.w;
    for (let i = 0; i < 60; i++) {
      const a = w.rnd() * Math.PI * 2;
      const d = 260 + w.rnd() * 420;
      const x = w.map.w / 2 + Math.cos(a) * d;
      const y = w.map.h / 2 + Math.sin(a) * d;
      if (pointFree(w.map, x, y, 60)) return { x, y };
    }
    return { x: w.map.w / 2, y: w.map.h / 2 };
  }

  spawnNest() {
    const w = this.w;
    for (let i = 0; i < 80; i++) {
      const x = 200 + w.rnd() * (w.map.w - 400);
      const y = 200 + w.rnd() * (w.map.h - 400);
      if (Math.hypot(x - w.map.w / 2, y - w.map.h / 2) < 420 || !pointFree(w.map, x, y, 40)) continue;
      if ([...this.zombies.values()].some((z) => z.type === 'nest' && Math.hypot(z.x - x, z.y - y) < 300)) continue;
      return this.spawn('nest', { x, y });
    }
    return null;
  }

  pickType() {
    let r = this.w.rnd();
    for (const [k, v] of Object.entries(this.mix)) {
      if (r < v) return k;
      r -= v;
    }
    return 'walker';
  }

  spawn(type, at = null) {
    const w = this.w;
    const base = DTYPES[type];
    const sc = floorScale(this.floor, this.diff);
    const gates = w.map.gates;
    const g = at ?? gates[Math.floor(w.rnd() * gates.length)];
    const B = type === 'boss' ? bossOf(this.floor) ?? BOSSES[0] : null;
    const hp = type === 'boss' ? BASE_BOSS_HP * B.hp * this.D.hp * (1 + 0.65 * (this.squad - 1)) : base.hp * sc.hp * (type === 'nest' ? 1 + 0.4 * (this.squad - 1) : 1);
    const spread = type === 'nest' ? 0 : 60;
    const z = {
      id: w.nextId++,
      type,
      x: Math.min(w.map.w - base.r - 2, Math.max(base.r + 2, g.x + (w.rnd() - 0.5) * spread)),
      y: Math.min(w.map.h - base.r - 2, Math.max(base.r + 2, g.y + (w.rnd() - 0.5) * spread)),
      a: 0,
      hp: Math.round(hp),
      max: Math.round(hp),
      speed: type === 'boss' ? B.speed : base.speed * sc.speed,
      dmg: (type === 'boss' ? ZTYPES.boss.dmg : base.dmg) * sc.dmg,
      r: base.r,
      cd: type === 'nest' ? 2 + w.rnd() * 3 : 0.5,
      cdMax: type === 'spitter' ? 1.2 : base.cd,
      fc: 0,
      target: null,
      retarget: 0,
      path: [],
      repath: 0,
      phase: w.rnd() * 6,
      ...(B ? { boss: B.id, skills: Object.fromEntries(B.skills.map((s, i) => [s, SKILL[s] * (0.6 + 0.2 * i)])) } : {}),
    };
    for (let i = 0; i < 6 && type !== 'nest' && w.map.walls.some((r) => circleHitsRect(z.x, z.y, z.r, r)); i++) {
      z.x += (w.map.w / 2 - z.x) * 0.1;
      z.y += (w.map.h / 2 - z.y) * 0.1;
    }
    this.zombies.set(z.id, z);
    if (type === 'boss') {
      this.bossId = z.id;
      w.emit({ k: 'bossIn', boss: B.id, x: Math.round(z.x), y: Math.round(z.y) });
    }
    return z;
  }

  think(z, dt) {
    if (z.type === 'nest') return;
    if (z.stoneT > 0) {
      z.stoneT -= dt;
      return; // turned to stone: it waits for its brood
    }
    if (z.chargeT > 0) return this.charging(z, dt);
    if (z.type === 'spitter') return this.spit(z, dt);
    super.think(z, dt);
  }

  // a spitter keeps its distance and lobs acid
  spit(z, dt) {
    const w = this.w;
    z.cd = Math.max(0, z.cd - dt);
    let tgt = null;
    let bd = Infinity;
    for (const p of w.players.values()) {
      if (p.status !== 'alive') continue;
      const d = Math.hypot(p.x - z.x, p.y - z.y);
      if (d < bd) {
        bd = d;
        tgt = p;
      }
    }
    if (!tgt) return;
    z.a = Math.atan2(tgt.y - z.y, tgt.x - z.x);
    const T = DTYPES.spitter;
    const see = hasLOS(z.x, z.y, tgt.x, tgt.y, w.map.walls);
    if (see && bd < T.range) {
      if (z.cd <= 0) {
        z.cd = T.cd;
        z.fc = (z.fc + 1) % 1000;
        this.acid(z, z.a + (w.rnd() - 0.5) * 0.08, z.dmg, T.shot);
      }
      // back off when they get close
      if (bd < 220) {
        const l = bd || 1;
        moveCircle(z, (-(tgt.x - z.x) / l) * z.speed * dt, (-(tgt.y - z.y) / l) * z.speed * dt, z.r, w.map.walls, w.map.w, w.map.h);
      }
      return;
    }
    super.think(z, dt); // walk in until it can see you
  }

  acid(z, a, dmg, speed = 480) {
    const w = this.w;
    const b = { id: w.nextId++, owner: 0, foe: true, x: z.x + Math.cos(a) * (z.r + 6), y: z.y + Math.sin(a) * (z.r + 6), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, range: 900, dmg, dist: 0, skin: null, cause: 'acid', kind: 'a' };
    w.bullets.set(b.id, b);
  }

  stepShots() {}

  // bosses: the base slam and summon, plus charge, volley and stone
  bossMoves(z, tgt, d, dt) {
    const w = this.w;
    const B = bossOf(this.floor) ?? BOSSES[0];
    const sk = z.skills ?? {};
    const enraged = z.hp < z.max * BOSS.enrage;
    const rate = enraged ? 1.4 : 1;
    for (const s of Object.keys(sk)) sk[s] -= dt * rate;
    if (sk.slam !== undefined && sk.slam <= 0 && d < BOSS.slamR) {
      sk.slam = SKILL.slam;
      w.emit({ k: 'slam', x: Math.round(z.x), y: Math.round(z.y), r: BOSS.slamR });
      for (const p of w.players.values()) {
        if (p.status !== 'alive') continue;
        const pd = Math.hypot(p.x - z.x, p.y - z.y);
        if (pd < BOSS.slamR) w.damage(p, null, BOSS.slamDmg * this.D.dmg * (1 - (0.5 * pd) / BOSS.slamR), 'boss');
      }
    }
    if (sk.summon !== undefined && sk.summon <= 0) {
      sk.summon = SKILL.summon;
      const n = BOSS.summon + Math.floor(this.floor / 15);
      for (let i = 0; i < n; i++) this.spawn(i % 3 === 2 ? 'spitter' : 'runner', { x: z.x + (w.rnd() - 0.5) * 120, y: z.y + (w.rnd() - 0.5) * 120 });
      w.emit({ k: 'summon' });
    }
    if (sk.volley !== undefined && sk.volley <= 0) {
      sk.volley = SKILL.volley;
      const n = 10 + Math.floor(this.floor / 10) * 2;
      const off = w.rnd() * Math.PI;
      for (let i = 0; i < n; i++) this.acid(z, off + (i / n) * Math.PI * 2, 14 * this.D.dmg * (1 + 0.02 * this.floor), 420);
      w.emit({ k: 'volley', x: Math.round(z.x), y: Math.round(z.y), boss: B.id });
    }
    if (sk.charge !== undefined && sk.charge <= 0 && d > 140 && d < 700) {
      sk.charge = SKILL.charge;
      z.chargeT = 0.9;
      z.chargeA = Math.atan2(tgt.y - z.y, tgt.x - z.x);
      z.hitIds = [];
      w.emit({ k: 'charge', zid: z.id, x: Math.round(z.x), y: Math.round(z.y), a: Math.round(z.chargeA * 100) / 100 });
    }
    if (sk.shield !== undefined && sk.shield <= 0) {
      sk.shield = SKILL.shield;
      z.stoneT = 4;
      for (let i = 0; i < 3 + Math.floor(this.floor / 12); i++) this.spawn(w.rnd() < 0.5 ? 'brute' : 'runner', { x: z.x + (w.rnd() - 0.5) * 160, y: z.y + (w.rnd() - 0.5) * 160 });
      w.emit({ k: 'stone', zid: z.id, x: Math.round(z.x), y: Math.round(z.y), secs: 4 });
    }
  }

  // the rush: three times its speed in a straight line; anyone in the way is thrown and hurt
  charging(z, dt) {
    const w = this.w;
    z.chargeT -= dt;
    const sp = z.speed * 3.2;
    const ox = z.x;
    const oy = z.y;
    moveCircle(z, Math.cos(z.chargeA) * sp * dt, Math.sin(z.chargeA) * sp * dt, z.r, w.map.walls, w.map.w, w.map.h);
    if (Math.hypot(z.x - ox, z.y - oy) < sp * dt * 0.3) z.chargeT = 0; // hit a wall: stop
    for (const p of w.players.values()) {
      if (p.status !== 'alive' || z.hitIds.includes(p.id)) continue;
      if (Math.hypot(p.x - z.x, p.y - z.y) < z.r + CFG.PLAYER_R + 6) {
        z.hitIds.push(p.id);
        w.damage(p, null, 28 * this.D.dmg * (1 + 0.02 * this.floor), 'boss');
      }
    }
  }

  hit(z, by, dmg, hs = false) {
    const w = this.w;
    if (!this.zombies.has(z.id)) return;
    if (z.stoneT > 0) {
      w.emit({ k: 'zhit', to: by ? [by.id] : undefined, zid: z.id, x: Math.round(z.x), y: Math.round(z.y), d: 0, stone: 1 });
      return;
    }
    const dealt = Math.max(1, Math.round(Math.min(dmg, Math.max(0, z.hp))));
    z.hp -= dmg;
    if (hs && by) by.headshots = (by.headshots ?? 0) + 1;
    if (by) by.zDmg = (by.zDmg ?? 0) + dealt;
    if (z.type === 'boss' && by) by.bossDmg = (by.bossDmg ?? 0) + dmg;
    w.emit({ k: 'zhit', to: by ? [by.id] : undefined, zid: z.id, x: Math.round(z.x), y: Math.round(z.y), d: dealt, ...(hs ? { hs: 1 } : {}), ...(z.hp <= 0 ? { fatal: 1 } : {}) });
    if (z.hp > 0) return;
    this.zombies.delete(z.id);
    const coins = coinsFor(z.type, this.floor, this.diff);
    if (by) {
      by.zk = (by.zk ?? 0) + 1;
      by.cr = Math.min(GL.MAX * 10, (by.cr ?? 0) + coins);
      w.emit({ k: 'zcr', to: [by.id], v: coins, x: Math.round(z.x), y: Math.round(z.y) });
      if (z.type === 'brute') by.zBrutes = (by.zBrutes ?? 0) + 1;
      if (z.type === 'nest') by.nests = (by.nests ?? 0) + 1;
    }
    w.emit({ k: 'zdead', zid: z.id, type: z.type, x: Math.round(z.x), y: Math.round(z.y), kid: by?.id ?? 0, ...(hs ? { hs: 1 } : {}) });
    if (z.type !== 'boss' && z.type !== 'nest' && w.rnd() < (z.type === 'brute' ? 0.3 : 0.04)) {
      const m = { id: w.nextId++, x: z.x, y: z.y, heal: 30 };
      w.packs.set(m.id, m);
    }
    if (z.type === 'boss') {
      this.bossDown = true;
      this.bossId = null;
      if (by) by.bossKill = true;
      for (const p of w.players.values()) if (!p.isBot && p.status !== 'extracted') p.dBosses = (p.dBosses ?? 0) + 1;
      w.emit({ k: 'bossDown', name: by?.name ?? null, boss: z.boss, mid: 1 });
    }
  }

  // HUD: the floor, the mission, its progress, the camp clock and the boss's health
  view(me) {
    const boss = this.bossId ? this.zombies.get(this.bossId) : null;
    const nests = this.obj === 'nests' ? [...this.zombies.values()].filter((z) => z.type === 'nest').length : 0;
    return {
      zw: this.floor,
      zc: this.cleared,
      zl: this.obj === 'clear' ? this.left() : this.obj === 'boss' ? (boss ? 1 : 0) : 0,
      dx: 1,
      ds: this.state === 'intro' ? 0 : this.state === 'camp' ? 2 : 1,
      dt: this.state === 'fight' ? (this.obj === 'survive' ? Math.ceil(this.surviveT) : 0) : Math.ceil(this.t),
      ob: this.obj,
      ...(this.obj === 'hold' && this.state === 'fight' ? { hd: Math.round(this.hold * 100), hx: Math.round(this.holdAt.x), hy: Math.round(this.holdAt.y) } : {}),
      ...(this.obj === 'nests' && this.state === 'fight' ? { nn: nests } : {}),
      ...(boss ? { zb: Math.ceil((boss.hp / boss.max) * 100), bk: boss.boss, ...(boss.stoneT > 0 ? { bst: 1 } : {}) } : {}),
      ...(me && this.state === 'camp' ? { ch: this.choice.get(me.id) ?? null, wait: [...this.w.players.values()].filter((p) => !p.isBot && p.status === 'alive' && !this.choice.has(p.id)).length } : {}),
    };
  }
}
const BASE_BOSS_HP = ZTYPES.boss.hp * 1.5; // the Descent's bosses are the fight of the chapter

// ---------------------------------------------------------- class gear

// what a runner may buy, and what it costs them now (null: not theirs or maxed)
export function priceFor(p, id) {
  const g = GEAR[id];
  if (!g || (g.cls && g.cls !== p.dClass)) return null;
  if (g.max) {
    const lv = id === 'gun' ? p.dGun ?? 0 : id === 'armor' ? p.dArmor ?? 0 : p.dAp ?? 0;
    return lv >= g.max ? null : g.cost[lv];
  }
  return g.cost;
}

// the damage a runner's gun does now (upgrades, the assault's stim)
export function dmgK(p, time) {
  let k = 1 + GEAR.gun.step * (p.dGun ?? 0);
  if ((p.stimUntil ?? 0) > time) k *= GEAR.stim.dmg;
  return k;
}
export const rofK = (p, time) => ((p.stimUntil ?? 0) > time ? GEAR.stim.rof : 1);
export const armorK = (p) => 1 - GEAR.armor.step * (p.dArmor ?? 0);
export const isDescentWeapon = (id) => WEAPONS.some((w) => w.id === id) && DESCENT_WEAPONS.includes(id);

// ------------------------------------------------------------- tickets

// Tickets per account. One free each UTC day: it is never banked (unused, it is gone the next
// day). Bought tickets keep. A run takes the free one first. Free tickets are also counted per
// network and device a day, so a stack of fresh accounts on one phone gets one, not a stack.
export const FREE_PER_NET_DAY = 3; // households, offices, carrier NAT: a few, not dozens
export const FREE_PER_DEV_DAY = 1;
const DAY = 86400000;
export const dayOf = (now) => Math.floor(now / DAY);

export class DescentBook {
  constructor({ data = {}, onChange = null, now = () => Date.now() } = {}) {
    this.users = new Map(Object.entries(data.users ?? {}));
    this.freeBy = new Map(Object.entries(data.freeBy ?? {})); // 'n:<net>' | 'd:<dev>' → { day, n }
    this.onChange = onChange;
    this.now = now;
  }

  toJSON() {
    const today = dayOf(this.now());
    const freeBy = {};
    for (const [k, v] of this.freeBy) if (v.day >= today) freeBy[k] = v; // old days drop off
    return { users: Object.fromEntries(this.users), freeBy };
  }

  changed() {
    this.onChange?.(this);
  }

  rec(key) {
    let r = this.users.get(key);
    if (!r) {
      r = { bought: 0, freeDay: -1, runs: 0, best: {}, clears: {}, boughtDay: -1, boughtToday: 0 };
      this.users.set(key, r);
    }
    return r;
  }

  // is today's free ticket still there for this account (and its network and device)?
  freeLeft(key, { net = null, dev = null, ok = true } = {}) {
    if (!key || !ok) return 0;
    const today = dayOf(this.now());
    if (this.rec(key).freeDay === today) return 0;
    const used = (id, max) => {
      if (!id) return false;
      const v = this.freeBy.get(id);
      return !!v && v.day === today && v.n >= max;
    };
    if (used(net && `n:${net}`, FREE_PER_NET_DAY) || used(dev && `d:${dev}`, FREE_PER_DEV_DAY)) return 0;
    return 1;
  }

  view(key, gate = {}) {
    const r = this.rec(key);
    const today = dayOf(this.now());
    return {
      free: this.freeLeft(key, gate),
      bought: r.bought,
      // the free ticket is gone at the next UTC midnight
      resetIn: (today + 1) * DAY - this.now(),
      runs: r.runs,
      best: { ...r.best },
      clears: { ...r.clears },
    };
  }

  // take `n` tickets for a run: today's free one first (if the gate allows it), then bought ones.
  // Returns what was taken ({ free, bought }) or null when there are not enough.
  spend(key, n, gate = {}) {
    if (!key || !(n >= 1)) return null;
    const r = this.rec(key);
    const free = Math.min(n, this.freeLeft(key, gate));
    const bought = n - free;
    if (r.bought < bought) return null;
    r.bought -= bought;
    if (free) {
      const today = dayOf(this.now());
      r.freeDay = today;
      for (const id of [gate.net && `n:${gate.net}`, gate.dev && `d:${gate.dev}`]) {
        if (!id) continue;
        const v = this.freeBy.get(id);
        this.freeBy.set(id, v && v.day === today ? { day: today, n: v.n + 1 } : { day: today, n: 1 });
      }
    }
    this.changed();
    return { free, bought };
  }

  // tickets back (the run never started, or the server went down under it). A free ticket comes
  // back only the same day: it was never meant to keep.
  refund(key, took) {
    if (!key || !took) return;
    const r = this.rec(key);
    r.bought = Math.min(MAX_TICKETS, r.bought + Math.max(0, took.bought | 0));
    if (took.free && r.freeDay === dayOf(this.now())) r.freeDay = -1;
    this.changed();
  }

  // a match server keeps the tickets the main server already took for it (never journaled)
  hold(key, n) {
    const r = this.rec(key);
    r.bought += Math.max(0, n | 0);
  }

  // bought tickets: true if added (the caller has taken the money)
  canBuy(key, n) {
    const r = this.rec(key);
    const today = dayOf(this.now());
    const done = r.boughtDay === today ? r.boughtToday : 0;
    return n >= 1 && r.bought + n <= MAX_TICKETS && done + n <= BUY_PER_DAY;
  }

  add(key, n) {
    if (!this.canBuy(key, n)) return false;
    const r = this.rec(key);
    const today = dayOf(this.now());
    if (r.boughtDay !== today) {
      r.boughtDay = today;
      r.boughtToday = 0;
    }
    r.bought += n;
    r.boughtToday += n;
    this.changed();
    return true;
  }

  // a finished run: the deepest floor per difficulty, full clears
  record(key, { diff, floors = 0, full = false }) {
    if (!DIFFS[diff]) return;
    const r = this.rec(key);
    r.runs++;
    r.best[diff] = Math.max(r.best[diff] ?? 0, floors | 0);
    if (full) r.clears[diff] = (r.clears[diff] ?? 0) + 1;
    this.changed();
  }

  // the deepest runners on one difficulty: [{ key, best, clears }]
  board(diff, n = 50) {
    const out = [];
    for (const [key, r] of this.users) if ((r.best?.[diff] ?? 0) > 0) out.push({ key, best: r.best[diff], clears: r.clears?.[diff] ?? 0 });
    return out.sort((a, b) => b.best - a.best || b.clears - a.clears).slice(0, n);
  }
}

// a run's own ticket cost
export const ticketsFor = (diff) => (DIFFS[diff] ?? DIFFS.easy).tickets;
// the best pack for n tickets is the caller's choice; this is the price of one pack
export const packOf = (n) => TICKET_PACKS.find((p) => p.n === n) ?? null;
