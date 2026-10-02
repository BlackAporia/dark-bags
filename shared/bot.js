import { CFG, GL } from './config.js';
import { NavGrid } from './nav.js';
import { WEAPONS, BOT_RANGE } from './weapons.js';

const NAMES = [
  'hodl_rat', 'wagmi_wolf', 'rekt_ronin', 'sat_stacker', 'moon_mole', 'bag_goblin', 'fud_fox', 'ape_42',
  'degen_dan', 'laser_eyes', 'rug_ranger', 'gm_ghost', 'ngmi_ninja', 'pleb_77', 'whale_wannabe', 'dca_dino',
  'exit_liq', 'paper_hands', 'cold_wallet', 'mempool_mo', 'fee_sniper', 'utxo_uri', 'orange_pill', 'dust_dealer',
];

export function botName(rnd, taken) {
  for (let i = 0; i < 20; i++) {
    const n = NAMES[Math.floor(rnd() * NAMES.length)];
    if (!taken.has(n)) return n;
  }
  return `runner_${Math.floor(rnd() * 900 + 100)}`;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const HUMAN_HUNTERS = 2;

/**
 * Simple raid bot. It only uses what a real runner could perceive
 * (vision radius + line of sight), never other runners' bags.
 */
export class BotBrain {
  constructor(world, p, rnd) {
    this.w = world;
    this.p = p;
    this.rnd = rnd;
    // practice difficulty: easy bots are slower to react, sloppier and fire in short bursts;
    // normal plays like online bots; hard ones aim and react like veterans
    const diff = world.difficulty ?? (world.practice ? 'easy' : 'normal');
    this.ffa = !!world.practice || world.dm || world.goldRush; // practice, deathmatch, gold rush: every bot for itself
    this.shopT = 1 + rnd() * 2; // guns + lasers: when to think about buying next
    this.easy = diff === 'easy';
    this.skill = this.easy ? 0.05 + rnd() * 0.3 : diff === 'hard' ? 0.5 + rnd() * 0.45 : 0.15 + rnd() * 0.4; // online: a new player survives first contact more often than not
    this.burstT = 0; // practice: bots fire in bursts with pauses in between
    this.burstOn = true;
    this.target = null; // who this bot is fighting right now (id)
    this.greed = 1.05 + rnd() * 1.6; // heads out once bag >= stake * greed
    this.leaveAt = 16 + rnd() * 40; // or when this many seconds remain
    this.brave = rnd();
    this.path = [];
    this.goal = null;
    this.repath = 0;
    this.wander = null;
    this.decideT = 0;
    this.lootTarget = null;
    this.seenFoe = new Map();
    this.strafe = rnd() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.aimErr = 0;
    this.stuckT = 1;
    this.lastX = p.x;
    this.lastY = p.y;
    p.botInput = { s: 0, mx: 0, my: 0, a: 0, f: false, d: false };
  }

  // back from the dead (deathmatch): forget the old fight and route
  reset() {
    this.path = [];
    this.goal = null;
    this.target = null;
    this.wander = null;
    this.lootTarget = null;
    this.seenFoe.clear();
    this.aimErr = 0;
  }

  // Guns + Lasers: patch up when hurt, put a turret down when there's cash and a quiet
  // moment, and now and then lay a tripmine across a corridor.
  shopping(dt, foe) {
    const w = this.w;
    const p = this.p;
    this.shopT -= dt;
    if (this.shopT > 0) return;
    this.shopT = 0.8 + this.rnd() * 1.2;
    const I = GL.ITEMS;
    if (p.hp < w.maxHp * 0.45 && p.cr >= I.medkit.cost) w.buy(p.id, 'medkit');
    else if (foe && p.cr >= I.turret.cost + I.medkit.cost && this.rnd() < 0.5) w.buy(p.id, 'turret');
    else if (!foe && p.cr >= I.turret.cost && this.rnd() < 0.6) w.buy(p.id, 'turret');
    else if (!foe && p.cr >= I.mine.cost + I.medkit.cost && this.rnd() < 0.25) w.buy(p.id, 'mine');
  }

  // Deathmatch: nobody to loot and nowhere to go, so head for the nearest live enemy.
  hunt() {
    const p = this.p;
    let best = null;
    let bd = Infinity;
    for (const q of this.w.players.values()) {
      if (q === p || q.status !== 'alive') continue;
      const d = dist(q, p);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best ? { x: best.x, y: best.y } : this.pickWander();
  }

  // other live bots currently fighting this runner
  huntersOn(id) {
    let n = 0;
    for (const [bid, b] of this.w.brains) if (b !== this && b.target === id && this.w.players.get(bid)?.status === 'alive') n++;
    return n;
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
      this.repath = 1.2 + this.rnd() * 0.6;
    }
    while (this.path.length && Math.hypot(this.path[0].x - p.x, this.path[0].y - p.y) < 14) this.path.shift();
    if (!this.path.length) return { mx: 0, my: 0 };
    const wp = this.path[0];
    const dx = wp.x - p.x;
    const dy = wp.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return { mx: dx / d, my: dy / d };
  }

  // nearest exit that will still be open when we get there
  nearestExit() {
    const w = this.w;
    let best = null;
    let bd = Infinity;
    for (const e of w.map.extracts) {
      const st = w.exitStates[e.id];
      if (st === 'closed') continue;
      const d = dist(e, this.p);
      if (st === 'closing' && (w.zone.shrinking || d / CFG.SPEED > w.zone.until)) continue;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // is a point safe from the storm for a while?
  safe(x, y, pad = 40) {
    const z = this.w.zone;
    const c = z.shrinking || z.until < 10 ? z.next : z;
    return Math.hypot(x - c.x, y - c.y) < c.r - pad;
  }

  pickLoot() {
    const p = this.p;
    let best = null;
    let score = 0;
    const R2 = (CFG.VISION + 150) ** 2;
    for (const d of this.w.drops.values()) {
      const d2 = (d.x - p.x) ** 2 + (d.y - p.y) ** 2;
      if (d2 > R2 || !this.safe(d.x, d.y, 0)) continue;
      const s = (this.p.stake * 0.6) / (Math.sqrt(d2) + 80);
      if (s > score) {
        score = s;
        best = d;
      }
    }
    // gold rush: bags of gold, the big ones and the spills worth the detour
    for (const g of this.w.gold?.values() ?? []) {
      const d2 = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
      if (d2 > R2) continue;
      const s = (g.v * 100) / (Math.sqrt(d2) + 80);
      if (s > score) {
        score = s;
        best = g;
      }
    }
    for (const o of this.w.orbs.values()) {
      const d2 = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      if (d2 > R2 || !this.safe(o.x, o.y)) continue;
      const s = o.v / (Math.sqrt(d2) + 80);
      if (s > score) {
        score = s;
        best = o;
      }
    }
    return best;
  }

  pickWander() {
    const w = this.w;
    const m = w.map;
    const vaults = m.vaults.filter((v) => this.safe(v.x + v.w / 2, v.y + v.h / 2, 80));
    if (vaults.length && this.rnd() < 0.35 + this.brave * 0.3) {
      const v = vaults[Math.floor(this.rnd() * vaults.length)];
      return { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    }
    const c = w.zone.next;
    for (let i = 0; i < 10; i++) {
      const a = this.rnd() * Math.PI * 2;
      const d = Math.sqrt(this.rnd()) * (c.r - 60);
      const x = c.x + Math.cos(a) * d;
      const y = c.y + Math.sin(a) * d;
      if (x > 100 && y > 100 && x < m.w - 100 && y < m.h - 100) return { x, y };
    }
    return { x: c.x, y: c.y };
  }

  think(dt) {
    const p = this.p;
    const w = this.w;
    const inp = p.botInput;
    inp.d = false;
    inp.f = false;
    inp.r = false;

    const tl = w.timeLeft;
    const exit = w.potMode ? null : this.nearestExit(); // pot modes have no exits
    const inZone = exit && dist(exit, p) < exit.r - 12;
    const wantOut =
      tl < this.leaveAt || p.bag >= p.stake * this.greed || (p.hp < 40 && p.bag >= p.stake * 0.6);

    // perception
    // Online, bots mostly leave each other alone: an early truce for everyone, then only
    // the hunters (about a third) go after other bots. Anyone who attacks a bot gets a
    // reply, and humans are always fair game.
    // Practice is every runner for themselves: bots fight whoever is closest, bot or human.
    // Either way, humans get HUMAN_GRACE seconds to find their feet, and then at most
    // HUMAN_HUNTERS bots press one human at a time (unless that human started it):
    // a lone player gets fights, not a pile-on.
    const truce = w.time < CFG.BOT_TRUCE && !w.dm && !w.goldRush;
    const hunter = this.brave > 0.68;
    const foes = w
      .visibleEnemies(p)
      .filter((f) => f.shield <= 0 && (this.ffa || !f.isBot || p.lastAttacker === f.id || (!truce && hunter)))
      .filter((f) => f.isBot || p.lastAttacker === f.id || (w.time >= CFG.HUMAN_GRACE && (this.target === f.id || this.huntersOn(f.id) < HUMAN_HUNTERS)));
    let foe = null;
    let fd = Infinity;
    let best = Infinity;
    for (const f of foes) {
      const d = dist(f, p);
      // practice bots pick fights with each other first: a human counts as 1.5× farther away
      const score = this.easy && !f.isBot ? d * 1.5 : d;
      if (score < best) {
        best = score;
        fd = d;
        foe = f;
      }
    }
    this.target = foe?.id ?? null;
    if (w.shop) this.shopping(dt, foe);
    for (const id of this.seenFoe.keys()) if (!foes.some((f) => f.id === id)) this.seenFoe.delete(id);
    if (foe && !this.seenFoe.has(foe.id)) this.seenFoe.set(foe.id, w.time);

    let move = { mx: 0, my: 0 };
    let aim = null;

    // storm first: anyone near the edge (or outside it) heads for the next circle
    const z = w.zone;
    const edge = z.r - Math.hypot(p.x - z.x, p.y - z.y);
    const stormBound = edge < 70 && !inZone && !(wantOut && exit && this.safe(exit.x, exit.y, 0));
    if (stormBound) {
      move = this.goTo(z.next.x, z.next.y);
      if (edge < 0 && p.dashCd <= 0 && this.rnd() < 0.1) inp.d = true;
    }

    // a quiet moment: top the magazine up
    if (!foe && !WEAPONS[p.w].melee && p.ammo < WEAPONS[p.w].mag * 0.5) inp.r = true;
    if (foe) {
      const wp = WEAPONS[p.w];
      const reaction = this.easy ? 0.45 + (1 - this.skill) * 0.5 : 0.3 + (1 - this.skill) * 0.4;
      const seenFor = w.time - this.seenFoe.get(foe.id);
      const t = wp.melee ? 0 : fd / wp.speed;
      const lead = 0.4 + this.skill * 0.6;
      const tx = foe.x + foe.vx * t * lead;
      const ty = foe.y + foe.vy * t * lead;
      this.aimErr += (this.rnd() - 0.5) * 0.12;
      const maxErr = ((1 - this.skill) * 0.4 + 0.05) * (wp.laser ? 0.35 : 1) * (this.easy ? 1.5 : 1);
      this.aimErr = Math.max(-maxErr, Math.min(maxErr, this.aimErr));
      aim = Math.atan2(ty - p.y, tx - p.x) + this.aimErr;
      const reach = wp.melee ? wp.reach + CFG.PLAYER_R * 2 - 4 : wp.range * 0.9;
      if (this.easy) {
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.burstOn = !this.burstOn;
          this.burstT = this.burstOn ? 0.5 + this.rnd() * 0.7 : 0.5 + this.rnd() * 0.8;
        }
      }
      if (seenFor > reaction && fd < reach && (!this.easy || this.burstOn)) inp.f = true;

      const lowHp = p.hp < 25 + this.brave * 25;
      if (stormBound) {
        // keep running inward, shooting on the move
      } else if (lowHp && !inZone) {
        // break contact: run for the exit if it's worth it, else away from the threat
        if (wantOut && exit) move = this.goTo(exit.x, exit.y);
        else {
          const dx = p.x - foe.x;
          const dy = p.y - foe.y;
          const d = Math.hypot(dx, dy) || 1;
          move = this.goTo(p.x + (dx / d) * 260, p.y + (dy / d) * 260);
        }
        if (p.dashCd <= 0 && this.rnd() < 0.08) inp.d = true;
      } else if (!inZone) {
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafeT = 0.6 + this.rnd() * 1.2;
          this.strafe = this.rnd() < 0.5 ? 1 : -1;
        }
        const dx = foe.x - p.x;
        const dy = foe.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const want = BOT_RANGE[wp.id] + (wp.melee ? 0 : (1 - this.brave) * 60);
        const band = wp.melee ? 10 : 60;
        const radial = fd > want + band ? 1 : fd < want - band ? -1 : 0;
        // knife: rush straight in (and dash to close the gap); sniper: plant and shoot
        const side = wp.melee ? 0.25 : wp.laser && inp.f ? 0 : 0.9;
        let mx = ux * radial + -uy * this.strafe * side;
        let my = uy * radial + ux * this.strafe * side;
        if (wp.melee && fd < 200 && fd > 70 && p.dashCd <= 0 && this.rnd() < (this.easy ? 0.03 : 0.12)) inp.d = true;
        const l = Math.hypot(mx, my);
        move = l > 0.01 ? { mx: mx / l, my: my / l } : { mx: 0, my: 0 };
        if (w.time - p.lastHit < 0.15 && p.dashCd <= 0 && this.rnd() < (this.easy ? 0.1 : 0.35)) inp.d = true;
      }
    } else if (stormBound) {
      // already moving inward
    } else if (wantOut && exit) {
      move = inZone ? { mx: 0, my: 0 } : this.goTo(exit.x, exit.y);
    } else {
      this.decideT -= dt;
      if (this.decideT <= 0 || (this.lootTarget && !w.orbs.has(this.lootTarget.id) && !w.drops.has(this.lootTarget.id) && !w.gold?.has(this.lootTarget.id))) {
        this.decideT = 0.3;
        this.lootTarget = this.pickLoot();
      }
      if (this.lootTarget) move = this.goTo(this.lootTarget.x, this.lootTarget.y);
      else if (w.dm || w.goldRush) {
        this.huntT = (this.huntT ?? 0) - dt;
        if (!this.wander || dist(this.wander, p) < 60 || this.huntT <= 0) {
          this.huntT = 2;
          this.wander = this.hunt();
        }
        move = this.goTo(this.wander.x, this.wander.y);
      } else {
        if (!this.wander || dist(this.wander, p) < 60) this.wander = this.pickWander();
        move = this.goTo(this.wander.x, this.wander.y);
      }
    }

    // unstick
    this.stuckT -= dt;
    if (this.stuckT <= 0) {
      const moved = Math.hypot(p.x - this.lastX, p.y - this.lastY);
      if (moved < 20 && (move.mx || move.my) && !inp.f) {
        this.path = [];
        this.goal = null;
        this.lootTarget = null;
        this.wander = this.pickWander();
      }
      this.stuckT = 1;
      this.lastX = p.x;
      this.lastY = p.y;
    }

    inp.mx = move.mx;
    inp.my = move.my;
    if (aim === null && (move.mx || move.my)) aim = Math.atan2(move.my, move.mx);
    if (aim !== null) inp.a = aim;
  }
}
