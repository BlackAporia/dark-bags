import { CFG } from './config.js';
import { NavGrid } from './nav.js';

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

/**
 * Simple raid bot. It only uses what a real runner could perceive
 * (vision radius + line of sight), never other runners' bags.
 */
export class BotBrain {
  constructor(world, p, rnd) {
    this.w = world;
    this.p = p;
    this.rnd = rnd;
    this.skill = 0.25 + rnd() * 0.5; // tuned so a new player survives first contact more often than not
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

  nearestExit() {
    let best = null;
    let bd = Infinity;
    for (const e of this.w.map.extracts) {
      const d = dist(e, this.p);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  pickLoot() {
    const p = this.p;
    let best = null;
    let score = 0;
    const R2 = (CFG.VISION + 150) ** 2;
    for (const d of this.w.drops.values()) {
      const d2 = (d.x - p.x) ** 2 + (d.y - p.y) ** 2;
      if (d2 > R2) continue;
      const s = (this.p.stake * 0.6) / (Math.sqrt(d2) + 80);
      if (s > score) {
        score = s;
        best = d;
      }
    }
    for (const o of this.w.orbs.values()) {
      const d2 = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      if (d2 > R2) continue;
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
    if (m.vaults.length && this.rnd() < 0.35 + this.brave * 0.3) {
      const v = m.vaults[Math.floor(this.rnd() * m.vaults.length)];
      return { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    }
    return { x: 150 + this.rnd() * (m.w - 300), y: 150 + this.rnd() * (m.h - 300) };
  }

  think(dt) {
    const p = this.p;
    const w = this.w;
    const inp = p.botInput;
    inp.d = false;
    inp.f = false;

    const tl = w.timeLeft;
    const exit = this.nearestExit();
    const inZone = exit && dist(exit, p) < exit.r - 12;
    const wantOut =
      tl < this.leaveAt || p.bag >= p.stake * this.greed || (p.hp < 40 && p.bag >= p.stake * 0.6);

    // perception
    const foes = w.visibleEnemies(p).filter((f) => f.shield <= 0);
    let foe = null;
    let fd = Infinity;
    for (const f of foes) {
      const d = dist(f, p);
      if (d < fd) {
        fd = d;
        foe = f;
      }
    }
    for (const id of this.seenFoe.keys()) if (!foes.some((f) => f.id === id)) this.seenFoe.delete(id);
    if (foe && !this.seenFoe.has(foe.id)) this.seenFoe.set(foe.id, w.time);

    let move = { mx: 0, my: 0 };
    let aim = null;

    if (foe) {
      const reaction = 0.18 + (1 - this.skill) * 0.35;
      const seenFor = w.time - this.seenFoe.get(foe.id);
      const t = fd / CFG.BULLET_SPEED;
      const lead = 0.4 + this.skill * 0.6;
      const tx = foe.x + foe.vx * t * lead;
      const ty = foe.y + foe.vy * t * lead;
      this.aimErr += (this.rnd() - 0.5) * 0.12;
      const maxErr = (1 - this.skill) * 0.4 + 0.05;
      this.aimErr = Math.max(-maxErr, Math.min(maxErr, this.aimErr));
      aim = Math.atan2(ty - p.y, tx - p.x) + this.aimErr;
      if (seenFor > reaction && fd < CFG.BULLET_RANGE * 0.95) inp.f = true;

      const lowHp = p.hp < 25 + this.brave * 25;
      if (lowHp && !inZone) {
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
        const want = 250 + (1 - this.brave) * 90;
        const radial = fd > want + 60 ? 1 : fd < want - 60 ? -1 : 0;
        let mx = ux * radial + -uy * this.strafe * 0.9;
        let my = uy * radial + ux * this.strafe * 0.9;
        const l = Math.hypot(mx, my) || 1;
        mx /= l;
        my /= l;
        move = { mx, my };
        if (w.time - p.lastHit < 0.15 && p.dashCd <= 0 && this.rnd() < 0.35) inp.d = true;
      }
    } else if (wantOut && exit) {
      move = inZone ? { mx: 0, my: 0 } : this.goTo(exit.x, exit.y);
    } else {
      this.decideT -= dt;
      if (this.decideT <= 0 || (this.lootTarget && !w.orbs.has(this.lootTarget.id) && !w.drops.has(this.lootTarget.id))) {
        this.decideT = 0.3;
        this.lootTarget = this.pickLoot();
      }
      if (this.lootTarget) move = this.goTo(this.lootTarget.x, this.lootTarget.y);
      else {
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
