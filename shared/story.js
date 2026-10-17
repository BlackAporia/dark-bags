// Story operations: the campaign of the Stroke, told as co-op missions. One to four runners go in
// together; the empty seats are taken by the squad of the story (AI companions who fight the
// dead, follow the humans and hold the seals with them), so a lone player always has a squad.
//
// The world of the story: on day zero the OUTLINE satellites were switched on to map the whole
// planet, misfired, and one flash redrew everything that lived as a single line. Most people
// became Scribbles (the dead of the Descent); the few who kept their minds are the runners.
// Colour left the world, all but the orange dust, which is why everybody carries a bag.
//
// An operation is a run of stages on the Descent's machinery (descent.js: classes, the camp shop,
// bosses, tickets), each with its own map and mission:
//   reach    run for the goal while the wipe (a wall of erasure) sweeps the map behind you, then
//            hold the shut door there until it opens, the wipe at your backs
//   escort   find the survivors across the map and lead them to the goal: they follow the
//            nearest runner and the dead hunt them
//   hold     hold the switch until it closes (the Descent's seal)
//   boss     the operation's boss
// Between stages a checkpoint (the camp: shop and patch up). If the whole squad of humans goes
// down, the stage starts over from its checkpoint while retries last (none on hardcore).
// Rewards only for completing the operation: its exclusive items the first time on each
// difficulty, rank XP every time. The entry is the Descent's tickets (one free a day).
import { CFG } from './config.js';
import { hasLOS } from './geom.js';
import { NavGrid } from './nav.js';
import { generateMap, pointFree } from './map.js';
import { WEAPONS } from './weapons.js';
import { Descent, DIFFS, CLASSES, CLASS_IDS, CAMP_HEAL, floorPlan, floorBonus, endlessCap, ENDLESS_PACE, SURVIVE_SECONDS, HOLD_R } from './descent.js';
import { OP_FINISHES, OP_OUTFITS, OP_STYLE } from './descent-items.js';
export { OP_FINISHES, OP_OUTFITS, OP_STYLE };

const TAU = Math.PI * 2;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// lvl: how hard the dead come (a Descent floor's worth); theme: the map (map.js MAP_THEMES)
export const OPS = {
  tunnels: {
    id: 'tunnels',
    n: 1,
    stages: [
      { obj: 'reach', theme: 'city', lvl: 3 },
      { obj: 'escort', theme: 'metro', lvl: 5, survivors: 2 },
      { obj: 'hold', theme: 'metro', lvl: 7 },
      { obj: 'boss', theme: 'metro', lvl: 9, boss: 'dispatcher' },
    ],
  },
};
export const OP_IDS = Object.keys(OPS);
// the operations still to come: shown locked in the lobby, in story order
export const OP_SOON = ['harbor', 'silence', 'factory', 'outline'];

export const OP_BOSSES = [
  // the station's dispatcher, scribbled into something huge, still calling trains that never come
  { id: 'dispatcher', hp: 0.8, speed: 100, skills: ['summon', 'charge', 'volley'], color: '#3f3f46', eye: '#facc15' },
];

// who takes the empty seats: 'ai' the story's companions, 'solo' nobody (you alone, harder),
// 'friends' nobody either, and the ready room waits for a second runner (or Start)
export const SQUADS = ['ai', 'solo', 'friends'];
export const RETRIES = { easy: 2, hard: 1, hardcore: 0 }; // stage restarts after the squad goes down
export const CHECKPOINT_SECONDS = 25; // the camp between stages
export const INTRO_FIRST = 40; // the opening film: the stage starts when everyone saw it (or skipped)
export const INTRO_NEXT = 6; // the card before every other stage
export const GOAL_R = 150;
export const DOOR_SECONDS = { easy: 22, hard: 26, hardcore: 30 }; // the chase's shut door, held open
// the escort: once a runner stands at the train with everyone they brought aboard, it leaves after
// this long (whoever still hides is left behind), so a squad is never stuck waiting for the last few
export const DEPART_SECONDS = 8;
// the wipe: how fast it sweeps (px/s; a runner does 230, so stopping to fight costs ground), how
// much it hurts, how far behind the squad it starts, how often its damage lands (seconds)
export const WIPE = { speed: { easy: 120, hard: 138, hardcore: 156 }, dps: 34, lead: 430, every: 0.5 };
// the companions' share: their rounds hit softer, the dead bite them softer, survivors softer still
export const ALLY_DMG = 0.55;
export const ALLY_HURT = 0.6;
export const SURVIVOR_HURT = 0.45;

// the squad of the story: one of each class (the humans' classes go first)
export const COMPANIONS = [
  { name: 'Wedge', cls: 'assault', skin: '#f97316' },
  { name: 'Brace', cls: 'engineer', skin: '#facc15' },
  { name: 'Myra', cls: 'medic', skin: '#4ade80' },
  { name: 'Hush', cls: 'sniper', skin: '#60a5fa' },
];
export const SURVIVORS = ['Vera', 'Old Ilko', 'Nadia', 'Tymko', 'Lev', 'Dina', 'Marko', 'Zoya'];

// What completing an operation hands out (only the first time on a difficulty: owned items pay
// rank XP like the Descent's duplicates).
export function opItems(op, diff, cls = 'assault') {
  if (!OPS[op]) return [];
  const gun = CLASSES[cls]?.weapon ?? 'carbine';
  const n = OPS[op].n;
  if (diff === 'hardcore') return [{ k: 'outfit', id: `op${n}-hardcore` }, { k: 'style', id: `f-op${n}-hardcore` }, { k: 'style', id: `n-op${n}-hardcore` }];
  if (diff === 'hard') return [{ k: 'outfit', id: `op${n}-hard` }, { k: 'wskin', id: `${gun}.op${n}-hard` }];
  return [{ k: 'wskin', id: `${gun}.op${n}-easy` }, { k: 'style', id: `b-op${n}-easy` }];
}

// ------------------------------------------------------------------ maps

// a free spot as close as it gets to (x, y)
function freeNear(map, x, y, r = 40) {
  for (let ring = 0; ring < 30; ring++) {
    const d = ring * 24;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      if (pointFree(map, px, py, r)) return { x: px, y: py };
    }
  }
  return { x, y };
}

// A stage's map: one of the raid maps (the city, the metro), with the squad's start on the west
// side, the goal on the east, and gates for the dead all round the edge. No exits: the way out is
// the mission.
export function opMap(seed, op, n) {
  const O = OPS[op] ?? OPS.tunnels;
  const S = O.stages[Math.max(0, Math.min(O.stages.length - 1, n - 1))];
  const map = generateMap((seed + n * 7919) >>> 0, S.theme);
  map.extracts = [];
  map.op = O.id;
  map.stage = n;
  map.start = freeNear(map, 300, map.h / 2, 60);
  // the escort: the survivors hide apart on the far side (north and south), the train is back west, up north
  map.goal = S.obj === 'escort' ? freeNear(map, 340, 360, 80) : freeNear(map, map.w - 300, map.h / 2, 80);
  if (S.obj === 'escort') {
    map.hideouts = [
      [map.w - 520, map.h * 0.24],
      [map.w - 600, map.h * 0.78],
      [map.w - 360, map.h / 2 + 120],
    ].map(([x, y]) => freeNear(map, x, y, 80));
    map.camp = map.hideouts[0];
  }
  const gates = [];
  const edge = 70;
  for (let x = 200; x < map.w - 100; x += 260) gates.push({ x, y: edge }, { x, y: map.h - edge });
  for (let y = 200; y < map.h - 100; y += 260) gates.push({ x: map.w - edge, y }, { x: edge, y });
  map.gates = gates.map((g) => freeNear(map, g.x, g.y, 24)).map((g, id) => ({ id, x: Math.round(g.x), y: Math.round(g.y) }));
  return map;
}

// ------------------------------------------------------------- the brains

class Walker {
  constructor(w, p) {
    this.w = w;
    this.p = p;
    this.path = [];
    this.goal = null;
    this.repath = 0;
    this.mapRef = w.map;
    this.slot = Math.random() * TAU;
    this.stuckT = 1;
    this.lastX = p.x;
    this.lastY = p.y;
    p.botInput = { s: 0, mx: 0, my: 0, a: 0, f: false, d: false };
  }

  reset() {
    this.path = [];
    this.goal = null;
  }

  nav() {
    if (!this.w.nav) this.w.nav = new NavGrid(this.w.map);
    return this.w.nav;
  }

  goTo(x, y) {
    const p = this.p;
    this.repath -= 1 / CFG.TICK_RATE;
    if (!this.goal || Math.hypot(this.goal.x - x, this.goal.y - y) > 50 || this.repath <= 0 || !this.path.length) {
      this.goal = { x, y };
      this.path = this.nav().findPath(p.x, p.y, x, y);
      this.repath = 0.8 + Math.random() * 0.5;
    }
    while (this.path.length && Math.hypot(this.path[0].x - p.x, this.path[0].y - p.y) < 14) this.path.shift();
    if (!this.path.length) {
      const d = Math.hypot(x - p.x, y - p.y);
      return d > 8 ? { mx: (x - p.x) / d, my: (y - p.y) / d } : { mx: 0, my: 0 };
    }
    const wp = this.path[0];
    const d = Math.hypot(wp.x - p.x, wp.y - p.y) || 1;
    return { mx: (wp.x - p.x) / d, my: (wp.y - p.y) / d };
  }

  // the nearest human still standing
  leader() {
    let best = null;
    let bd = Infinity;
    for (const q of this.w.players.values()) {
      if (q.isBot || q.status !== 'alive') continue;
      const d = dist(q, this.p);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  // the nearest of the dead
  nearestZed(max = Infinity) {
    let best = null;
    let bd = max;
    for (const z of this.w.zombies.values()) {
      const d = dist(z, this.p);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  }

  unstick(dt, move) {
    const p = this.p;
    this.stuckT -= dt;
    if (this.stuckT > 0) return;
    if (Math.hypot(p.x - this.lastX, p.y - this.lastY) < 16 && (move.mx || move.my)) {
      this.reset();
      this.slot = Math.random() * TAU;
    }
    this.stuckT = 1;
    this.lastX = p.x;
    this.lastY = p.y;
  }

  newMap() {
    if (this.mapRef === this.w.map) return;
    this.mapRef = this.w.map;
    this.reset();
  }
}

// A companion: keeps close to the humans (or on the seal), shoots the nearest of the dead it can
// see, backs off when they get close, reloads in the quiet.
export class AllyBrain extends Walker {
  constructor(w, p, op) {
    super(w, p);
    this.op = op;
    this.tgt = null;
    this.retgt = 0;
    this.aimErr = 0;
  }

  reset() {
    super.reset();
    this.tgt = null;
  }

  think(dt) {
    const w = this.w;
    const p = this.p;
    const op = this.op;
    const inp = p.botInput;
    inp.f = false;
    inp.d = false;
    inp.r = false;
    this.newMap();
    const wp = WEAPONS[p.w];
    this.retgt -= dt;
    let tgt = this.tgt ? w.zombies.get(this.tgt) : null;
    if (!tgt || this.retgt <= 0) {
      this.retgt = 0.25;
      tgt = null;
      let bd = (wp.range ?? 300) * 0.92;
      for (const z of w.zombies.values()) {
        const d = dist(z, p);
        if (d < bd && hasLOS(p.x, p.y, z.x, z.y, w.map.walls)) {
          bd = d;
          tgt = z;
        }
      }
      this.tgt = tgt?.id ?? null;
    }
    const lead = this.leader();
    const fight = op.state === 'fight';
    let gx = p.x;
    let gy = p.y;
    if (fight && op.obj === 'hold' && op.holdAt) {
      gx = op.holdAt.x + Math.cos(this.slot) * HOLD_R * 0.5;
      gy = op.holdAt.y + Math.sin(this.slot) * HOLD_R * 0.5;
    } else if (lead) {
      gx = lead.x + Math.cos(this.slot) * 110;
      gy = lead.y + Math.sin(this.slot) * 110;
    }
    // the chase: never let the wipe catch up
    if (fight && op.obj === 'reach' && w.map.goal && p.x < op.wipeX + 260) {
      gx = w.map.goal.x;
      gy = w.map.goal.y;
    }
    let move = Math.hypot(gx - p.x, gy - p.y) > 60 ? this.goTo(gx, gy) : { mx: 0, my: 0 };
    if (tgt) {
      const d = dist(tgt, p) || 1;
      if (d < 95 && !wp.melee && !(op.obj === 'hold' && fight)) move = { mx: (p.x - tgt.x) / d, my: (p.y - tgt.y) / d };
      this.aimErr = Math.max(-0.12, Math.min(0.12, this.aimErr + (Math.random() - 0.5) * 0.08));
      inp.a = Math.atan2(tgt.y - p.y, tgt.x - p.x) + this.aimErr;
      if (p.reloadT <= 0) inp.f = true;
    } else {
      if (!wp.melee && p.ammo < (wp.mag ?? 0) * 0.6) inp.r = true;
      if (move.mx || move.my) inp.a = Math.atan2(move.my, move.mx);
    }
    this.unstick(dt, move);
    inp.mx = move.mx;
    inp.my = move.my;
  }
}

// A survivor: follows the nearest runner, heads for the goal once it is close and a runner is
// with them, and steps away from the dead. Never fights.
export class SurvivorBrain extends Walker {
  constructor(w, p, op) {
    super(w, p);
    this.op = op;
  }

  think(dt) {
    const w = this.w;
    const p = this.p;
    const inp = p.botInput;
    inp.f = false;
    inp.d = false;
    inp.r = false;
    this.newMap();
    const lead = this.leader();
    const G = w.map.goal;
    let move = { mx: 0, my: 0 };
    // they hide until a runner comes for them, then stay with the runners
    if (lead && dist(lead, p) < 380 && !p.found) {
      p.found = true;
      w.emit({ k: 'found', name: p.name, x: Math.round(p.x), y: Math.round(p.y) });
    }
    if (p.found && lead && dist(lead, p) < 900) {
      if (G && ((dist(G, p) < 520 && dist(lead, p) < 520) || dist(lead, G) < GOAL_R * 1.6)) move = this.goTo(G.x, G.y);
      else if (dist(lead, p) > 90) move = this.goTo(lead.x + Math.cos(this.slot) * 60, lead.y + Math.sin(this.slot) * 60);
    }
    const z = this.nearestZed(80);
    if (z) {
      const d = dist(z, p) || 1;
      move = { mx: (p.x - z.x) / d, my: (p.y - z.y) / d };
    }
    if (move.mx || move.my) inp.a = Math.atan2(move.my, move.mx);
    this.unstick(dt, move);
    inp.mx = move.mx;
    inp.my = move.my;
  }
}

// ------------------------------------------------------------------ the sim

/**
 * A story operation inside a World, on the Descent's machinery: the floors are the operation's
 * stages, the camp is the checkpoint, the squad's empty seats are companions, and the end is
 * the whole operation or nothing.
 */
export class Operation extends Descent {
  constructor(world, { op = 'tunnels', diff = 'easy' } = {}) {
    super(world, { diff });
    this.op = OPS[op] ? op : 'tunnels';
    this.O = OPS[this.op];
    this.stages = this.O.stages.length;
    this.retries = RETRIES[this.diff] ?? 0;
    this.t = INTRO_FIRST;
    this.saved = 0; // survivors on the train, the whole operation
    this.savedStage = 0;
    this.lostStage = 0;
    this.wipeX = -Infinity;
    this.door = 0; // the chase: how far the shut door at the goal is open (0–1); null before it is reached
    this.said = new Set(); // radio lines already played this stage
    this.humansOnly = true; // the run is over when the humans are down (companions don't count)
  }

  get S() {
    return this.O.stages[Math.min(this.stages, this.floor) - 1];
  }

  get depth() {
    return this.S.lvl;
  }

  bossDef() {
    return this.S.boss ? OP_BOSSES.find((b) => b.id === this.S.boss) ?? null : null;
  }

  // the dead come in through the gates away from the squad (and, in the chase, ahead of the wipe)
  gate(type) {
    const w = this.w;
    const gates = w.map.gates;
    const humans = [...w.players.values()].filter((p) => !p.isBot && p.status === 'alive');
    const far = (g) => humans.every((p) => dist(g, p) > (type === 'boss' ? 700 : 420));
    let pool = gates.filter(far);
    if (this.obj === 'reach') pool = pool.filter((g) => g.x > this.wipeX + WIPE.lead);
    if (!pool.length) pool = gates;
    return pool[Math.floor(w.rnd() * pool.length)];
  }

  plan() {
    const S = this.S;
    const base = floorPlan(S.lvl, this.diff, this.squad);
    const D = DIFFS[this.diff];
    const k = 1 + 0.55 * (this.squad - 1);
    const n = Math.round(Math.min(120, (8 + 2.4 * (S.lvl - 1)) * D.count * k));
    return { floor: this.floor, obj: S.obj, count: S.obj === 'boss' ? Math.round(n * 0.45) : S.obj === 'hold' ? Math.round(n * 0.7) : 0, mix: base.mix, nests: 0, boss: S.obj === 'boss' ? this.bossDef() : null };
  }

  humans(alive = true) {
    return [...this.w.players.values()].filter((p) => !p.isBot && (!alive || p.status === 'alive'));
  }

  // the first tick: the companions take the empty seats, everyone stands at the start
  join() {
    const w = this.w;
    const humans = this.humans(false);
    const free = w.squad === 'ai' ? Math.max(0, 4 - humans.length) : 0; // solo or friends: no companions
    const taken = new Set(humans.map((p) => p.dClass));
    const pick = [...COMPANIONS.filter((c) => !taken.has(c.cls)), ...COMPANIONS.filter((c) => taken.has(c.cls))].slice(0, free);
    for (const c of pick) {
      const p = w.addPlayer({ name: c.name, skin: c.skin, isBot: true, cls: c.cls, pistol: 'pistol', rank: 30, body: c.cls === 'medic' || c.cls === 'sniper' ? 'f' : 'm' });
      p.npc = 'ally';
      w.brains.set(p.id, new AllyBrain(w, p, this));
    }
    this.placeSquad();
  }

  placeSquad() {
    const w = this.w;
    const s = w.map.start ?? { x: w.map.w / 2, y: w.map.h / 2 };
    let i = 0;
    for (const p of w.players.values()) {
      if (p.status !== 'alive' || p.npc === 'sv') continue;
      const a = (i++ / 6) * TAU;
      const spot = freeNear(w.map, s.x + Math.cos(a) * 70, s.y + Math.sin(a) * 70, CFG.PLAYER_R + 4);
      p.x = spot.x;
      p.y = spot.y;
      p.vx = p.vy = 0;
      p.shield = 3;
      p.queue.length = 0;
      w.brains.get(p.id)?.reset?.();
    }
  }

  step(dt) {
    // the opening film and the stage cards: on as soon as every human has seen it
    if (this.state === 'intro') {
      const humans = this.humans();
      if (humans.length && humans.every((p) => this.choice.get(p.id) === 'go')) this.t = Math.min(this.t, 1.2);
    }
    super.step(dt);
  }

  // intro (seen), camp (on to the next stage): a runner is ready
  choose(p, v) {
    if (p.isBot || p.status !== 'alive' || v !== 'go') return false;
    if (this.state !== 'intro' && this.state !== 'camp') return false;
    this.choice.set(p.id, 'go');
    if (this.state === 'camp') this.w.emit({ k: 'chose', pid: p.id, name: p.name, v });
    return true;
  }

  radio(key) {
    const id = `s${this.floor}.${key}`;
    if (this.said.has(id)) return;
    this.said.add(id);
    this.w.emit({ k: 'radio', op: this.op, line: id });
  }

  startFloor() {
    const w = this.w;
    const S = this.S;
    this.squad = Math.max(1, this.humans(false).filter((p) => p.status !== 'extracted').length);
    const plan = this.plan();
    this.obj = S.obj;
    this.state = 'fight';
    this.choice.clear();
    this.toSpawn = plan.count;
    this.spawnT = 1.2;
    this.mix = plan.mix;
    this.bossDown = false;
    this.bossId = null;
    this.hold = 0;
    this.surviveT = SURVIVE_SECONDS;
    this.savedStage = 0;
    this.lostStage = 0;
    this.depart = null;
    this.holdAt = S.obj === 'hold' ? this.sealSpot() : null;
    if (S.obj === 'reach') {
      this.wipeX = (w.map.start?.x ?? 300) - WIPE.lead;
      this.door = null;
    }
    if (S.obj === 'escort') this.spawnSurvivors(S.survivors ?? 2);
    if (plan.boss) this.spawn('boss');
    const G = w.map.goal;
    w.emit({ k: 'floor', n: this.floor, of: this.stages, obj: S.obj, op: this.op, count: plan.count, ...(plan.boss ? { boss: plan.boss.id } : {}), ...(this.holdAt ? { hx: Math.round(this.holdAt.x), hy: Math.round(this.holdAt.y) } : {}), ...(G && (S.obj === 'reach' || S.obj === 'escort') ? { gx: Math.round(G.x), gy: Math.round(G.y) } : {}) });
    this.radio('go');
  }

  spawnSurvivors(n) {
    const w = this.w;
    const s = w.map.start;
    for (let i = 0; i < n; i++) {
      const p = w.addPlayer({ name: SURVIVORS[i % SURVIVORS.length], skin: '#e5e7eb', isBot: true, rank: 1, body: i % 2 ? 'f' : 'm', late: true });
      p.npc = 'sv';
      p.w = 0; // empty-handed but for a knife they never use
      p.w2 = null;
      delete p.dClass;
      const spots = w.map.hideouts ?? [w.map.camp ?? { x: s.x + 160, y: s.y }];
      const c = spots[i % spots.length];
      const spot = freeNear(w.map, c.x + Math.cos(i * 1.1) * 60, c.y + Math.sin(i * 1.1) * 60, CFG.PLAYER_R + 4);
      p.x = spot.x;
      p.y = spot.y;
      w.brains.set(p.id, new SurvivorBrain(w, p, this));
    }
  }

  // the escort's marker for a runner: the nearest spot where survivors still hide (none once all are found)
  hideoutFor(me) {
    let best = null;
    let bd = Infinity;
    for (const p of this.survivorsLeft()) {
      if (p.found) continue;
      const d = me ? dist(me, p) : 0;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? { cx: Math.round(best.x), cy: Math.round(best.y) } : {};
  }

  survivorsLeft() {
    return [...this.w.players.values()].filter((p) => p.npc === 'sv' && p.status === 'alive');
  }

  // the chase and the escort have their own missions; the hold and the boss are the Descent's
  stepFight(dt) {
    const S = this.S;
    if (S.obj === 'hold' || S.obj === 'boss') {
      if (S.obj === 'hold' && this.hold >= 0.5) this.radio('mid');
      const boss = this.bossId ? this.zombies.get(this.bossId) : null;
      if (boss && boss.hp < boss.max * 0.5) this.radio('mid');
      return super.stepFight(dt);
    }
    const w = this.w;
    this.spawnT -= dt;
    const cap = endlessCap(this.depth, this.squad);
    let alive = 0;
    for (const z of this.zombies.values()) if (z.type !== 'nest') alive++;
    if (this.spawnT <= 0 && alive < cap) {
      this.spawnT = (Math.max(0.22, 0.8 - 0.012 * this.depth) * ENDLESS_PACE) / (1 + 0.3 * (this.squad - 1));
      this.spawn(this.pickType());
    }
    const G = w.map.goal;
    if (S.obj === 'reach') {
      this.stepWipe(dt);
      const humans = this.humans();
      const at = humans.some((p) => dist(p, G) < GOAL_R);
      if (this.door === null && at) {
        // the entrance is shut: hold it while it is cut open, the wipe closing in behind
        this.door = 0;
        this.radio('mid');
        w.emit({ k: 'door', x: Math.round(G.x), y: Math.round(G.y) });
      }
      if (this.door !== null) {
        const secs = DOOR_SECONDS[this.diff] ?? 22;
        this.door = Math.max(0, Math.min(1, this.door + (at ? dt / (secs * (1 + 0.15 * (this.squad - 1))) : -dt / 60)));
        if (this.door >= 1) return this.endFloor(true);
      }
      return;
    }
    // the escort: whoever reaches the train is safe
    for (const p of this.survivorsLeft()) {
      if (dist(p, G) > GOAL_R) continue;
      p.status = 'extracted';
      p.endedAt = w.time;
      this.saved++;
      this.savedStage++;
      w.emit({ k: 'saved', name: p.name, n: this.savedStage, of: this.S.survivors ?? 2, x: Math.round(p.x), y: Math.round(p.y) });
      this.radio('mid');
    }
    if (!this.survivorsLeft().length) {
      if (this.savedStage > 0) return this.endFloor(true);
      if (!this.wiped()) this.w.end(); // nobody made it: the stage is lost
      return;
    }
    // the train leaves once a runner is aboard with everyone who came along: nobody found is
    // still on their way to it (a survivor far from every runner has stopped following)
    const at = this.humans().some((p) => dist(p, G) < GOAL_R);
    const coming = this.survivorsLeft().some((p) => p.found && this.humans().some((q) => dist(q, p) < 900));
    if (at && !coming && this.savedStage > 0) {
      if (this.depart === null) {
        this.depart = 0;
        w.emit({ k: 'depart', x: Math.round(G.x), y: Math.round(G.y), secs: DEPART_SECONDS, left: this.survivorsLeft().length });
      }
      this.depart = Math.min(1, this.depart + dt / DEPART_SECONDS);
      if (this.depart >= 1) {
        // the ones still hiding are left behind
        for (const p of this.survivorsLeft()) {
          p.status = 'mia';
          w.brains.delete(p.id);
        }
        return this.endFloor(true);
      }
    } else if (this.depart !== null) this.depart = Math.max(0, this.depart - dt / 20);
  }

  // the wipe: a wall of erasure sweeping east. Anything behind it is rubbed out.
  stepWipe(dt) {
    const w = this.w;
    this.wipeX += (WIPE.speed[this.diff] ?? WIPE.speed.easy) * dt;
    // it stops at the door's step: close enough to feel, not close enough to take the ones holding it
    const G = w.map.goal;
    if (G) this.wipeX = Math.min(this.wipeX, G.x - GOAL_R - 160);
    // its damage builds up and lands twice a second, like the storm's: one hit, one sound, one
    // number, not thirty a second
    for (const p of w.players.values()) {
      p.inWipe = p.status === 'alive' && p.x <= this.wipeX;
      if (!p.inWipe) {
        p.wipeAcc = 0;
        p.wipeT = 0;
        continue;
      }
      p.wipeAcc = (p.wipeAcc ?? 0) + WIPE.dps * dt * (p.isBot ? 3 : 1);
      p.wipeT = (p.wipeT ?? 0) - dt;
      if (p.wipeT > 0) continue;
      p.wipeT = WIPE.every;
      const d = p.wipeAcc;
      p.wipeAcc = 0;
      w.damage(p, null, d, 'storm');
    }
    for (const z of [...this.zombies.values()]) {
      if (z.x > this.wipeX || z.type === 'boss') continue;
      this.zombies.delete(z.id);
      w.emit({ k: 'zdead', zid: z.id, type: z.type, x: Math.round(z.x), y: Math.round(z.y), kid: 0 });
    }
  }

  // the squad's humans are all down: the stage starts over from its checkpoint, while retries last
  wiped() {
    if (this.retries <= 0 || this.state !== 'fight') return false;
    this.retries--;
    const w = this.w;
    for (const z of this.zombies.values()) w.emit({ k: 'zdead', zid: z.id, type: z.type, x: Math.round(z.x), y: Math.round(z.y), kid: 0 });
    this.zombies.clear();
    w.bullets.clear();
    w.packs.clear();
    this.toSpawn = 0;
    this.bossId = null;
    this.saved -= this.savedStage;
    for (const p of w.players.values()) {
      if (p.npc === 'sv') {
        if (p.status === 'alive' || p.status === 'extracted') p.status = 'mia';
        w.brains.delete(p.id);
        continue;
      }
      if (p.status === 'dead') w.respawn(p, false, true);
      if (p.status === 'alive') p.hp = w.maxHp;
    }
    this.placeSquad();
    this.said.clear();
    this.state = 'intro';
    this.t = 4;
    this.choice.clear();
    w.emit({ k: 'opRetry', left: this.retries, n: this.floor });
    return true;
  }

  endFloor() {
    const w = this.w;
    for (const o of this.zombies.values()) w.emit({ k: 'zdead', zid: o.id, type: o.type, x: Math.round(o.x), y: Math.round(o.y), kid: 0 });
    this.zombies.clear();
    w.bullets.clear();
    this.toSpawn = 0;
    this.wipeX = -Infinity;
    this.cleared = this.floor;
    this.radio('done');
    const bonus = floorBonus(this.depth, this.diff);
    const last = this.cleared >= this.stages;
    for (const p of w.players.values()) {
      if (p.npc === 'sv' || p.status === 'extracted') continue;
      if (p.status === 'dead' && (this.D.revive || p.isBot)) w.respawn(p, true, true);
      if (p.status !== 'alive') continue;
      p.hp = p.isBot ? w.maxHp : Math.min(w.maxHp, p.hp + CAMP_HEAL);
      if (p.isBot) continue;
      p.dFloors = this.cleared;
      p.zWave = this.cleared;
      p.cr = Math.min(1e6, (p.cr ?? 0) + bonus);
      if (last) {
        p.dFull = true;
        p.dSaved = this.saved;
      }
    }
    if (last) {
      w.emit({ k: 'opDone', op: this.op, diff: this.diff, saved: this.saved });
      return w.end();
    }
    this.state = 'camp';
    this.t = CHECKPOINT_SECONDS;
    this.choice.clear();
    const next = this.O.stages[this.floor];
    w.emit({ k: 'camp', n: this.cleared, of: this.stages, secs: CHECKPOINT_SECONDS, bonus, next: next.obj, op: this.op, ...(next.boss ? { boss: next.boss } : {}), milestone: 0 });
  }

  // everyone goes on: the operation has no way out but through
  leaveCamp() {
    this.floor++;
    this.newFloorMap();
    this.said.clear();
    this.state = 'intro';
    this.t = INTRO_NEXT;
    this.choice.clear();
  }

  newFloorMap() {
    const w = this.w;
    w.map = opMap(w.seed, this.op, this.floor);
    w.nav = null;
    this.nav = null;
    w.turrets.clear();
    w.mines.clear();
    w.packs.clear();
    w.bullets.clear();
    this.placeSquad();
    w.emit({ k: 'floorMap', map: w.map, n: this.floor, of: this.stages, obj: this.S.obj, op: this.op, ...(this.S.boss ? { boss: this.S.boss } : {}), story: 1 });
  }

  view(me) {
    const v = super.view(me);
    const G = this.w.map.goal;
    const goal = this.state === 'fight' && G && (this.obj === 'reach' || this.obj === 'escort');
    return {
      ...v,
      op: this.op,
      on: this.stages,
      rt: this.retries,
      ...(goal ? { gx: Math.round(G.x), gy: Math.round(G.y) } : {}),
      ...(this.state === 'fight' && this.obj === 'reach' && Number.isFinite(this.wipeX) ? { wx: Math.round(this.wipeX), ...(this.door !== null ? { dr: Math.round(this.door * 100) } : {}) } : {}),
      ...(this.state === 'fight' && this.obj === 'escort' && this.depart !== null ? { dr: Math.round(this.depart * 100) } : {}),
      ...(this.state === 'fight' && this.obj === 'escort' ? this.hideoutFor(me) : {}),
      ...(this.state === 'fight' && this.obj === 'escort' ? { sv: this.survivorsLeft().length, ss: this.savedStage, st0: this.S.survivors ?? 2 } : {}),
      sa: this.saved,
      ...(this.state === 'camp' ? { ch: this.choice.get(me?.id) ?? null, wait: this.humans().filter((p) => !this.choice.has(p.id)).length } : {}),
    };
  }
}

export const opOfMode = (m) => (m?.op && OPS[m.op] ? m.op : null);
export { CLASS_IDS };
