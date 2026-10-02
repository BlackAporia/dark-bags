// The zombie mode: ten waves of the dead coming over the cemetery fence from every side,
// each wave bigger, tougher and faster than the last, and on the tenth a boss with its
// escort. Kill the boss and the run is cleared. The squad (one to four runners) shares
// the fight: no friendly fire, and anyone who went down climbs back up when the next
// wave starts, as long as somebody held on. Between waves everyone patches up a little.
//
// Runs inside World (world.js) on the same tick; zombies are not players, they live in
// world.zombies and only humans' bullets and knives hurt them.
import { CFG } from './config.js';
import { moveCircle, hasLOS, circleHitsRect } from './geom.js';
import { NavGrid } from './nav.js';

export const WAVES = 10;
export const WAVE_BREAK = 6; // seconds between waves (and before the first)
export const WAVE_HEAL = 35; // health back for everyone standing when a wave is cleared
const MAX_ALIVE = 36;

// base stats; waves scale them up
export const ZTYPES = {
  walker: { hp: 60, speed: 92, dmg: 10, r: 17, cd: 0.9 },
  runner: { hp: 34, speed: 172, dmg: 7, r: 15, cd: 0.65 },
  brute: { hp: 260, speed: 70, dmg: 22, r: 24, cd: 1.2 },
  boss: { hp: 4200, speed: 104, dmg: 36, r: 36, cd: 1.1 },
};
export const BOSS = { slamEvery: 5, slamR: 170, slamDmg: 30, summonEvery: 14, summon: 4, enrage: 0.4 };

// how big a wave is and what it is made of
export function wavePlan(n, squad = 1) {
  const k = 1 + 0.6 * (squad - 1);
  if (n >= WAVES) return { count: Math.round(12 * k), boss: true, mix: { walker: 0.5, runner: 0.4, brute: 0.1 } };
  const count = Math.round((8 + 5 * (n - 1)) * k);
  const mix = n >= 7 ? { walker: 0.5, runner: 0.35, brute: 0.15 } : n >= 5 ? { walker: 0.65, runner: 0.25, brute: 0.1 } : n >= 3 ? { walker: 0.75, runner: 0.25, brute: 0 } : { walker: 1, runner: 0, brute: 0 };
  return { count, boss: false, mix };
}
export const waveScale = (n) => ({ hp: 1 + 0.16 * (n - 1), speed: 1 + 0.035 * (n - 1), dmg: 1 + 0.1 * (n - 1) });

export class Horde {
  constructor(world) {
    this.w = world;
    this.wave = 0; // the wave being fought (0 before the first)
    this.cleared = 0; // waves cleared
    this.state = 'break'; // 'break' between waves, 'fight' during one
    this.t = WAVE_BREAK; // seconds left in the break
    this.toSpawn = 0;
    this.spawnT = 0;
    this.bossId = null;
    this.bossDown = false;
    this.nav = null;
    this.squad = 1;
  }

  get zombies() {
    return this.w.zombies;
  }

  // zombies still to come in this wave, standing or not yet over the fence
  left() {
    return this.toSpawn + this.zombies.size;
  }

  step(dt) {
    const w = this.w;
    if (this.state === 'break') {
      this.t -= dt;
      if (this.t <= 0) this.startWave();
    } else {
      this.spawnT -= dt;
      if (this.toSpawn > 0 && this.spawnT <= 0 && this.zombies.size < MAX_ALIVE) {
        this.spawnT = Math.max(0.16, 0.7 - 0.05 * this.wave) / (1 + 0.3 * (this.squad - 1));
        this.spawn(this.pickType());
        this.toSpawn--;
      }
      if (!this.left() && !this.bossDown) this.endWave();
    }
    for (const z of this.zombies.values()) this.think(z, dt);
  }

  startWave() {
    const w = this.w;
    this.wave++;
    this.squad = Math.max(1, [...w.players.values()].filter((p) => !p.isBot).length);
    const plan = wavePlan(this.wave, this.squad);
    this.state = 'fight';
    this.toSpawn = plan.count;
    this.spawnT = 0.5;
    this.mix = plan.mix;
    // back on your feet for the new wave, if anyone held out
    if (w.aliveCount()) for (const p of w.players.values()) if (p.status === 'dead') w.respawn(p, true);
    if (plan.boss) this.spawn('boss');
    w.emit({ k: 'wave', n: this.wave, of: WAVES, boss: plan.boss ? 1 : 0, count: plan.count + (plan.boss ? 1 : 0) });
  }

  endWave() {
    const w = this.w;
    this.cleared = this.wave;
    this.state = 'break';
    this.t = WAVE_BREAK;
    for (const p of w.players.values()) {
      if (p.status !== 'alive') continue;
      p.hp = Math.min(w.maxHp, p.hp + WAVE_HEAL);
      p.zWave = this.cleared;
    }
    w.emit({ k: 'waveClear', n: this.wave, of: WAVES });
  }

  pickType() {
    let r = this.w.rnd();
    for (const [k, v] of Object.entries(this.mix)) {
      if (r < v) return k;
      r -= v;
    }
    return 'walker';
  }

  // over the fence at one of the gates, the ones nearest the squad a little less often
  spawn(type, at = null) {
    const w = this.w;
    const base = ZTYPES[type];
    const sc = waveScale(this.wave);
    const gates = w.map.gates;
    const g = at ?? gates[Math.floor(w.rnd() * gates.length)];
    const hpK = type === 'boss' ? 1 + 0.7 * (this.squad - 1) : sc.hp;
    const z = {
      id: w.nextId++,
      type,
      x: Math.min(w.map.w - base.r - 2, Math.max(base.r + 2, g.x + (w.rnd() - 0.5) * 60)),
      y: Math.min(w.map.h - base.r - 2, Math.max(base.r + 2, g.y + (w.rnd() - 0.5) * 60)),
      a: 0,
      hp: Math.round(base.hp * hpK),
      max: Math.round(base.hp * hpK),
      speed: base.speed * (type === 'boss' ? 1 : sc.speed),
      dmg: base.dmg * (type === 'boss' ? 1 : sc.dmg),
      r: base.r,
      cd: 0.5,
      fc: 0, // swing counter: clients animate the swipe
      target: null,
      retarget: 0,
      path: [],
      repath: 0,
      slamT: BOSS.slamEvery,
      summonT: BOSS.summonEvery,
      phase: w.rnd() * 6,
    };
    // never on top of a headstone
    for (let i = 0; i < 6 && w.map.walls.some((r) => circleHitsRect(z.x, z.y, z.r, r)); i++) {
      z.x += (w.map.w / 2 - z.x) * 0.1;
      z.y += (w.map.h / 2 - z.y) * 0.1;
    }
    this.zombies.set(z.id, z);
    if (type === 'boss') this.bossId = z.id;
    return z;
  }

  navGrid() {
    if (!this.nav) this.nav = this.w.nav ?? (this.w.nav = new NavGrid(this.w.map));
    return this.nav;
  }

  // shamble at the nearest runner: straight when the way is clear, around the graves when not
  think(z, dt) {
    const w = this.w;
    z.cd = Math.max(0, z.cd - dt);
    z.retarget -= dt;
    let tgt = z.target ? w.players.get(z.target) : null;
    if (!tgt || tgt.status !== 'alive' || z.retarget <= 0) {
      z.retarget = 0.6;
      let bd = Infinity;
      tgt = null;
      for (const p of w.players.values()) {
        if (p.status !== 'alive') continue;
        const d = Math.hypot(p.x - z.x, p.y - z.y);
        if (d < bd) {
          bd = d;
          tgt = p;
        }
      }
      z.target = tgt?.id ?? null;
    }
    if (!tgt) return;
    const dx = tgt.x - z.x;
    const dy = tgt.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    z.a = Math.atan2(dy, dx);
    const reach = z.r + CFG.PLAYER_R + 6;
    if (z.type === 'boss') this.bossMoves(z, tgt, d, dt);
    if (d <= reach) {
      if (z.cd <= 0) {
        z.cd = ZTYPES[z.type].cd;
        z.fc = (z.fc + 1) % 1000;
        w.damage(tgt, null, z.dmg, z.type === 'boss' ? 'boss' : 'zombie');
      }
      return;
    }
    let mx = dx / d;
    let my = dy / d;
    const nav = this.navGrid();
    if (!hasLOS(z.x, z.y, tgt.x, tgt.y, nav.fat)) {
      z.repath -= dt;
      if (z.repath <= 0 || !z.path.length) {
        z.repath = 0.9 + w.rnd() * 0.5;
        z.path = nav.findPath(z.x, z.y, tgt.x, tgt.y);
      }
      while (z.path.length && Math.hypot(z.path[0].x - z.x, z.path[0].y - z.y) < 16) z.path.shift();
      if (z.path.length) {
        const p0 = z.path[0];
        const l = Math.hypot(p0.x - z.x, p0.y - z.y) || 1;
        mx = (p0.x - z.x) / l;
        my = (p0.y - z.y) / l;
      }
    } else z.path.length = 0;
    // keep a little apart from the rest of the horde
    for (const o of this.zombies.values()) {
      if (o === z) continue;
      const ox = z.x - o.x;
      const oy = z.y - o.y;
      const od = Math.hypot(ox, oy);
      const min = z.r + o.r;
      if (od > 0 && od < min) {
        mx += (ox / od) * 0.6;
        my += (oy / od) * 0.6;
      }
    }
    const l = Math.hypot(mx, my) || 1;
    const enraged = z.type === 'boss' && z.hp < z.max * BOSS.enrage;
    const sp = z.speed * (enraged ? 1.35 : 1) * (0.92 + 0.08 * Math.sin(w.time * 3 + z.phase));
    moveCircle(z, (mx / l) * sp * dt, (my / l) * sp * dt, z.r, w.map.walls, w.map.w, w.map.h);
  }

  // the boss: a ground slam that hurts everyone close, and every so often it calls runners in
  bossMoves(z, tgt, d, dt) {
    const w = this.w;
    z.slamT -= dt;
    z.summonT -= dt;
    if (z.slamT <= 0 && d < BOSS.slamR) {
      z.slamT = BOSS.slamEvery;
      w.emit({ k: 'slam', x: Math.round(z.x), y: Math.round(z.y), r: BOSS.slamR });
      for (const p of w.players.values()) {
        if (p.status !== 'alive') continue;
        const pd = Math.hypot(p.x - z.x, p.y - z.y);
        if (pd < BOSS.slamR) w.damage(p, null, BOSS.slamDmg * (1 - (0.5 * pd) / BOSS.slamR), 'boss');
      }
    }
    if (z.summonT <= 0) {
      z.summonT = BOSS.summonEvery;
      for (let i = 0; i < BOSS.summon; i++) this.spawn('runner');
      w.emit({ k: 'summon' });
    }
  }

  // a bullet or a knife landed on a zombie
  hit(z, by, dmg, hs = false) {
    const w = this.w;
    if (!this.zombies.has(z.id)) return;
    z.hp -= dmg;
    if (hs && by) by.headshots = (by.headshots ?? 0) + 1;
    if (by) by.zDmg = (by.zDmg ?? 0) + Math.min(dmg, Math.max(0, z.hp + dmg));
    if (z.type === 'boss' && by) by.bossDmg = (by.bossDmg ?? 0) + dmg;
    w.emit({ k: 'zhit', to: by ? [by.id] : undefined, zid: z.id, x: Math.round(z.x), y: Math.round(z.y), ...(hs ? { hs: 1 } : {}), ...(z.hp <= 0 ? { fatal: 1 } : {}) });
    if (z.hp > 0) return;
    this.zombies.delete(z.id);
    if (by) {
      by.zk = (by.zk ?? 0) + 1;
      if (z.type === 'brute') by.zBrutes = (by.zBrutes ?? 0) + 1;
    }
    w.emit({ k: 'zdead', zid: z.id, type: z.type, x: Math.round(z.x), y: Math.round(z.y), kid: by?.id ?? 0, ...(hs ? { hs: 1 } : {}) });
    // now and then the dead drop a medkit
    if (z.type !== 'boss' && w.rnd() < (z.type === 'brute' ? 0.35 : 0.05)) {
      const m = { id: w.nextId++, x: z.x, y: z.y, heal: 30 };
      w.packs.set(m.id, m);
    }
    if (z.type === 'boss') {
      this.bossDown = true;
      if (by) by.bossKill = true;
      // the boss falls: the rest of the horde falls with it
      for (const o of this.zombies.values()) w.emit({ k: 'zdead', zid: o.id, type: o.type, x: Math.round(o.x), y: Math.round(o.y), kid: 0 });
      this.zombies.clear();
      this.toSpawn = 0;
      this.cleared = WAVES;
      for (const p of w.players.values()) p.zWave = WAVES;
      w.emit({ k: 'bossDown', name: by?.name ?? null });
      w.end();
    }
  }

  // HUD: the wave, what's left of it, the break countdown and the boss's health
  view() {
    const boss = this.bossId ? this.zombies.get(this.bossId) : null;
    return {
      zw: this.wave,
      zc: this.cleared,
      zl: this.left(),
      zbr: this.state === 'break' ? Math.ceil(this.t) : 0,
      ...(boss ? { zb: Math.ceil((boss.hp / boss.max) * 100) } : {}),
    };
  }
}
