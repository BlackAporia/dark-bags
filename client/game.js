import { CFG, GL } from '../shared/config.js';
import { titleTier } from '../shared/achievements.js';
import { OUTFIT, FINISH, RARITY_ORDER, modelFor, meleeOf } from '../shared/cosmetics.js';
import { MODE } from '../shared/modes.js';
import { WAVES } from '../shared/horde.js';
import { usdText } from '../shared/assets.js';
import { t, getLang } from './i18n.js';
import { settings } from './settings.js';

const usdTextCents = (c) => usdText(c * 10, 1000); // cents → "$x.xx"
import { stepMovement, sanitizeInput } from '../shared/movement.js';
import { World } from '../shared/world.js';
import { WEAPONS, XP_PER_LEVEL } from '../shared/weapons.js';
import { zoneAt, exitState } from '../shared/zone.js';
import { pose, legPiece, FEET, hpColor } from './stickman.js';
import { Fx } from './fx.js';

const DT = 1 / CFG.TICK_RATE;
const INTERP_MS = 110;
const BLUFF = ['small', 'medium', 'fat'];
const STREAKS = {
  1: { title: 'First blood', voice: 'First blood', cls: 's1' },
  2: { title: 'Double kill', voice: 'Double kill', cls: 's2' },
  3: { title: 'Triple kill', voice: 'Triple kill', cls: 's3' },
  4: { title: 'Rampage', voice: 'Rampage!', cls: 's4' },
  5: { title: 'Godlike', voice: 'Godlike!', cls: 's5' },
};

export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const r3 = (v) => Math.round(v * 1000) / 1000;
const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ------------------------------------------------------------ animation book

/** Keeps a walk cycle, facing and wound state per runner from their positions. */
// What breaks on a player's device is invisible to us: a frame or script error goes to the server
// (a few per page, each message once) so it shows on the team's analytics page.
const reported = new Set();
export function reportError(where, e) {
  try {
    const m = String(e?.message ?? e).slice(0, 300);
    if (reported.has(m) || reported.size >= 8) return;
    reported.add(m);
    globalThis.__darkbagsSend?.({ t: 'cerr', where, m, st: String(e?.stack ?? '').slice(0, 900), ua: navigator.userAgent.slice(0, 160) });
  } catch {}
}

export class AnimBook {
  constructor() {
    this.map = new Map();
  }

  get(id) {
    return this.map.get(id);
  }

  update(id, x, y, aim, dt, now, extra) {
    let a = this.map.get(id);
    if (!a) {
      a = { id, x, y, vx: 0, vy: 0, aim, facing: Math.cos(aim) >= 0 ? 1 : -1, phase: Math.random() * 6, moveK: 0, wounds: 0, minHp: 100, seen: now, hitT: -1e9, attackT: -1e9, dashT: -1e9, w: 0, bluff: 1 };
      this.map.set(id, a);
    }
    const dx = x - a.x;
    const dy = y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 150) {
      a.vx = a.vy = 0;
    } else if (dt > 0) {
      a.vx = dx / dt;
      a.vy = dy / dt;
      const sp = dist / dt;
      a.moveK += ((sp > 20 ? Math.min(1, sp / 230) : 0) - a.moveK) * Math.min(1, dt * 12);
      a.phase += dist * 0.12;
    }
    a.x = x;
    a.y = y;
    a.aim = aim;
    a.facing = Math.cos(aim) >= 0 ? 1 : -1;
    a.seen = now;
    Object.assign(a, extra);
    return a;
  }

  prune(now, ms = 1000) {
    for (const [id, a] of this.map) if (now - a.seen > ms) this.map.delete(id);
  }
}

/**
 * Client side of one raid: predicts your own movement, interpolates everyone else
 * ~110 ms in the past, turns snapshots and events into animation, effects, sound
 * and music, and drives the HUD.
 */
export class GameClient {
  constructor({ renderer, input, sfx, send, el }) {
    this.renderer = renderer;
    this.input = input;
    this.sfx = sfx;
    this.send = send;
    this.el = el;
    this.active = false;
    this.bannerT = null;
    this.fx = new Fx();
    this.anims = new AnimBook();
    this.gore = false;
  }

  // mills → $
  money(mills) {
    return usdText(mills);
  }

  begin(start, skin, gore, look = null) {
    this.active = true;
    this.outfit = start.look ?? look ?? { outfit: null, body: 'm' }; // cosmetics (this.look is the camera offset)
    this.gore = gore;
    this.map = start.map;
    this.plan = start.zone;
    this.pid = start.pid;
    this.stake = start.stake;
    this.golden = start.golden;
    // pot modes: no bag and no exits; the HUD shows the prize pot and who is left
    this.mode = start.mode ?? 'raid';
    this.potMode = (MODE[this.mode]?.kind ?? 'raid') !== 'raid';
    this.teamMode = MODE[this.mode]?.kind === 'team';
    this.dmMode = MODE[this.mode]?.kind === 'dm'; // respawns, most kills wins, no storm
    this.shopMode = !!MODE[this.mode]?.shop; // guns + lasers
    this.hardcore = !!MODE[this.mode]?.hardcore;
    this.zombieMode = MODE[this.mode]?.kind === 'zombie'; // co-op waves, a boss on the last
    this.goldMode = MODE[this.mode]?.kind === 'gold'; // grab the most gold bags
    this.respawnMode = this.dmMode || this.goldMode;
    this.roundsMode = !!MODE[this.mode]?.rounds; // teams, ranked: rounds on a clock
    this.el.glShop.hidden = !this.shopMode;
    document.body.classList.toggle('gl-on', this.shopMode);
    document.body.classList.toggle('z-on', this.zombieMode);
    document.body.classList.toggle('gold-on', this.goldMode);
    this.el.spect.classList.toggle('respawn', this.respawnMode);
    this.prevGadgets = new Map();
    const bagLabel = document.querySelector('.hud-bag .eyebrow');
    if (bagLabel) bagLabel.textContent = t(this.zombieMode ? 'hud.waveK' : this.goldMode ? 'hud.goldK' : this.potMode ? 'hud.pot' : 'hud.bagPrivate');
    this.renderer.noExits = this.potMode; // last one standing: no exits to draw
    // no bag to bluff about in pot modes; one fixed weapon means no ladder to climb
    this.el.bluffChip.hidden = this.potMode;
    const tBag = document.getElementById('t-bag');
    if (tBag) tBag.hidden = this.potMode;
    const fixed = !!MODE[this.mode]?.weapon || !!MODE[this.mode]?.pick || this.goldMode; // no ladder to climb
    this.el.ladder.hidden = fixed;
    this.el.nextWeapon.hidden = fixed;
    document.querySelector('.xp')?.toggleAttribute('hidden', fixed);
    this.skin = OUTFIT[this.outfit.outfit]?.color ?? skin;
    this.snaps = [];
    this.pending = [];
    this.seq = 0;
    this.pred = null;
    this.corr = { x: 0, y: 0 };
    this.you = null;
    this.offset = null;
    this.acc = 0;
    this.aim = 0;
    this.localFireCd = 0;
    this.hurt = 0;
    this.shake = 0;
    this.bluff = 1;
    this.lastHud = 0;
    this.lastTick = -1;
    this.cam = null;
    this.look = { x: 0, y: 0 };
    this.lastFrame = performance.now();
    this.stepPhase = 0;
    this.heartT = 0;
    this.riserStage = -1;
    this.lastStage = 0;
    this.prevBullets = new Map();
    this.meAnim = null;
    this.dead = false;
    this.recvTl = { tl: start.duration - start.time, at: performance.now() };
    this.duration = start.duration;
    this.bagStart = null;
    this.fx.clear();
    this.anims = new AnimBook();
    this.renderer.setMap(start.map);
    const el = this.el;
    el.hud.hidden = false;
    el.feed.replaceChildren();
    el.golden.hidden = !start.golden;
    el.spect.hidden = true;
    el.extract.hidden = true;
    this.updateBluffChip();
    this.sfx.music?.set({ mode: 'raid', intensity: 1, bpm: 140 });
    if (start.golden) this.banner(t(this.potMode ? 'hud.goldenPot' : 'hud.goldenStart'), 'gold', 3000);
    else this.banner(t(this.zombieMode ? 'hud.startZ' : this.goldMode ? 'hud.startGold' : this.shopMode ? 'hud.startGl' : this.dmMode ? 'hud.startDm' : this.hardcore ? 'hud.startHc' : this.teamMode ? 'hud.startTeam' : this.potMode ? 'hud.startPot' : 'hud.start'), 'money', 2600);
  }

  stop() {
    this.active = false;
    document.body.classList.remove('gl-on', 'z-on', 'gold-on');
    this.el.hud.hidden = true;
    this.el.streak.hidden = true;
    this.sfx.setStorm(0);
  }

  // ------------------------------------------------------------ network in

  onSnap(s) {
    const now = performance.now();
    this.snapAt = now;
    const off = s.time - now;
    if (this.offset === null || off > this.offset) this.offset = off;
    else this.offset += (off - this.offset) * 0.02;
    const prev = this.snaps[this.snaps.length - 1];
    this.snaps.push(s);
    if (this.snaps.length > 30) this.snaps.shift();
    this.recvTl = { tl: s.tl, at: now };
    const you = s.you;
    if (s.radar) this.radar = s.radar;
    const wasAlive = this.you?.st === 'alive';
    if (you.rl > 0 && !(this.you?.rl > 0) && you.st === 'alive') this.sfx.play('reload', { secs: WEAPONS[you.w]?.reload });
    this.you = you;
    if (this.dead && you.st === 'alive') {
      // deathmatch: back in. Fresh body, fresh prediction.
      this.dead = false;
      this.pred = null;
      this.pending = [];
      this.corr = { x: 0, y: 0 };
      this.anims.map.delete(-1);
      this.meAnim = null;
      this.hurt = 0;
    }
    if (you.st === 'alive') {
      this.pending = this.pending.filter((i) => i.s > you.ack);
      const old = this.pred;
      const np = { x: you.x, y: you.y, dashT: you.dashT, dashCd: you.dashCd, dashDx: you.dashDx, dashDy: you.dashDy };
      for (const i of this.pending) stepMovement(np, i, DT, this.map);
      if (old) {
        const dx = old.x - np.x;
        const dy = old.y - np.y;
        if (Math.hypot(dx, dy) < 100) {
          this.corr.x += dx;
          this.corr.y += dy;
        } else this.corr = { x: 0, y: 0 };
      }
      this.pred = np;
    } else {
      this.pred = null;
      if (wasAlive && you.st === 'extracted') this.sfx.play('extract');
    }
    // what the snapshot changed (hits, shots, impacts) plays when the picture gets there: the
    // world is drawn INTERP_MS behind the server, so the effects wait as long
    setTimeout(() => this.active && this.diffSnap(prev, s, performance.now()), INTERP_MS);
  }

  // Effects other runners cause that we only learn about from snapshots.
  diffSnap(prev, s, now) {
    if (!prev) return;
    const before = new Map(prev.players.map((p) => [p.i, p]));
    for (const p of s.players) {
      const q = before.get(p.i);
      const a = this.anims.get(p.i);
      if (!q || !a) continue;
      if (p.zb) {
        // the dead: a swipe, and the flinch when a round lands
        if (p.fc !== q.fc) a.attackT = now;
        if (p.h < q.h - 0.5) this.zHitFx(a, now);
        continue;
      }
      if (p.fc !== q.fc) this.attackFx(a, p.w, now, false);
      if (p.rl && !q.rl) this.sfx.play('reload', { x: a.x, y: a.y, secs: WEAPONS[p.w]?.reload });
      if (p.h < q.h - 0.5) this.hitFx(a, now, q.h - p.h);
      if (p.d && !q.d) a.dashT = now;
    }
    // turrets that fired since the last snapshot: a flash and a shot you can place
    for (const o of s.turrets ?? []) {
      const q = prev.turrets?.find((x) => x.i === o.i);
      if (!q || q.fc === o.fc) continue;
      const mx = o.x + Math.cos(o.a) * 20;
      const my = o.y + Math.sin(o.a) * 20;
      this.fx.muzzle(mx, my, 22, o.a, false, now, o.o === 1 ? '#3ddc97' : '#ff4d5e');
      this.sfx.play(o.lv === 3 ? 'shotgun' : o.lv === 2 ? 'sniper' : 'smg', { x: o.x, y: o.y, pitch: o.lv === 3 ? 0.6 : o.lv === 2 ? 1.3 : 1 });
    }
    // rounds that stopped in a wall: sparks and a ricochet, exactly where they struck
    for (const [, x, y, k] of s.ends ?? []) {
      if (k !== 'w') continue;
      this.fx.sparks(x, y, 18, 6);
      this.fx.dust(x, y, 2, 'rgba(180,180,190,0.3)');
      if (Math.random() < 0.6) this.sfx.play('impact', { x, y });
    }
  }

  attackFx(a, w, now, mine) {
    a.attackT = now;
    const wp = WEAPONS[w];
    const p = pose(a, now + 30, this.gore);
    const opts = mine ? { pitch: wp.pitch } : { x: a.x, y: a.y, pitch: wp.pitch };
    this.sfx.play(wp.snd ?? wp.id, opts);
    // a weapon skin from rare up tints the flash and the swing in its neon
    const fin = FINISH[a.ws?.[wp.id]];
    const tint = fin && RARITY_ORDER.indexOf(fin.rarity) >= 1 ? (fin.fx === 'rainbow' ? `hsl(${(now / 3) % 360}, 100%, 65%)` : fin.color) : null;
    if (wp.melee) {
      const big = ['axe', 'katana', 'scythe', 'hammer', 'esword', 'dual'].includes(fin ? modelFor(wp.id, fin.id) : '');
      // drawn where the hit lands: around the runner, at gun height, out to the blade's reach
      // (a target counts when its body is inside it)
      const m = meleeOf(fin?.id);
      this.fx.slash(a.x, a.y, 18, a.aim, a.facing, tint, big, m.reach + CFG.PLAYER_R, m.arc);
      return;
    }
    this.fx.muzzle(p.muzzle.x, a.y + FEET, a.y + FEET - p.muzzle.y, p.aim, !!wp.heavy, now, tint);
    this.fx.casing(p.grip.x, a.y + FEET, a.y + FEET - p.grip.y, a.facing);
    if (mine) this.shake = Math.max(this.shake, wp.snd === 'sniper' ? 9 : wp.heavy ? 7 : 2.5);
  }

  hitFx(a, now, dmg) {
    a.hitT = now;
    const z = 26;
    const dx = Math.cos(a.aim + Math.PI);
    const dy = Math.sin(a.aim + Math.PI);
    if (this.gore) {
      this.fx.blood(a.x, a.y + FEET, z, dx, dy, Math.min(22, 6 + dmg * 0.4));
      this.sfx.play('flesh', { x: a.x, y: a.y });
    } else {
      this.fx.sparks(a.x, a.y + FEET, z, 7, '#e8f0ff');
      this.fx.chips(a.x, a.y + FEET, z, 3);
      this.sfx.play('armor', { x: a.x, y: a.y });
    }
  }

  // the damage a hit did, popping off the target: white for yours, gold for a head hit,
  // red over yourself when you take it; numbers in quick succession fan out a little
  dmgNumber(x, y, d, kind) {
    this.dmgFan = ((this.dmgFan ?? 0) + 1) % 5;
    const dx = (this.dmgFan - 2) * 9;
    const color = kind === 'crit' ? '#ffd166' : kind === 'me' ? '#ff4d5e' : '#ffffff';
    const size = kind === 'crit' ? 19 : Math.min(18, 12 + d / 12);
    this.fx.floater(x + dx, y - 10 - Math.abs(dx) * 0.3, `-${d}`, color, size, kind === 'crit' ? 0.9 : 0.75, true);
  }

  // a round in the head that does not kill: CRIT (and the ping)
  critFx(x, y, now) {
    this.fx.floater(x, y - 30, t('hud.crit'), '#ffd166', 16, 0.7);
    this.fx.sparks(x, y, 44, 5, '#ffd166');
    if (now - (this.hsPing ?? 0) > 120) {
      this.hsPing = now;
      this.sfx.play('headshot');
    }
  }

  // the kill went through the head: a big HEADSHOT over them, a ping, and the announcer
  headshotFx(x, y, now, vid = null) {
    if (vid != null) {
      // the victim's last known spot (kill events carry no position)
      const a = this.anims.get(vid) ?? (vid === this.pid ? this.meAnim : null);
      if (a) ({ x, y } = a);
    }
    this.fx.floater(x, y - 34, t('hud.headshot'), '#ff3b5c', 20, 0.9);
    this.fx.sparks(x, y, 44, 8, '#ffd166');
    if (now - (this.hsPing ?? 0) > 120) {
      this.hsPing = now;
      this.sfx.play('headshot');
    }
    if (now - (this.hsSay ?? 0) > 2500) {
      this.hsSay = now;
      this.sfx.say?.('headshot', getLang(), 0.05);
    }
  }

  // a round in a zombie: dark ichor (or sparks without gore) and a wet thud
  zHitFx(a, now) {
    a.hitT = now;
    if (this.gore) this.fx.blood(a.x, a.y + FEET, 26, Math.cos(a.aim + Math.PI), Math.sin(a.aim + Math.PI), 6);
    else this.fx.sparks(a.x, a.y + FEET, 26, 5, '#b8f28a');
    if (now - (this.zThud ?? 0) > 70) {
      this.zThud = now;
      this.sfx.play('flesh', { x: a.x, y: a.y });
    }
  }

  // a zombie goes down: it slumps into a green-black splash (the boss shakes the ground)
  zDeathFx(x, y, type, now) {
    const big = type === 'boss' ? 3 : type === 'brute' ? 1.6 : 1;
    this.fx.dust(x, y + FEET, Math.round(6 * big), 'rgba(110, 170, 80, 0.35)');
    this.fx.sparks(x, y + FEET, 20, Math.round(6 * big), '#9be36b');
    if (this.gore) this.fx.blood(x, y + FEET, 20, 0, -1, Math.round(10 * big));
    this.fx.ring(x, y + FEET, type === 'boss' ? '#ff4d5e' : '#7fd35a');
    this.sfx.play(type === 'boss' ? 'boom' : 'pop', { x, y });
    if (type === 'boss') this.shake = Math.max(this.shake, 20);
  }

  // 18+: legs come off as health drops (the lowest health reached this life counts)
  woundCheck(a, hp, now) {
    a.minHp = Math.min(a.minHp, hp);
    const want = a.minHp <= 30 ? 2 : a.minHp <= 60 ? 1 : 0;
    if (!this.gore || want <= a.wounds) {
      if (!this.gore) a.wounds = 0;
      return;
    }
    const p = pose(a, now, true);
    for (let wnd = a.wounds + 1; wnd <= want; wnd++) {
      const leg = wnd === 1 ? 1 : 0;
      this.fx.limb(legPiece(p, leg), a.color ?? '#ebe5d6', -a.facing);
      this.fx.blood(p.legs[leg].hip.x, a.y + FEET, FEET + 4, -a.facing, 0, 14);
      this.sfx.play('bone', { x: a.x, y: a.y });
    }
    a.wounds = want;
  }

  // from: where the killing round came from; a headshot knocks the head clean off, flying
  // away from the shooter (with gore off too, just without the blood)
  deathFx(a, color, now, hs = false, from = null) {
    const p = pose(a, now, true);
    if (hs) {
      const dx = from ? a.x - from.x : -a.facing;
      const dy = from ? a.y - from.y : 0;
      const l = Math.hypot(dx, dy) || 1;
      this.fx.head(p.head.x, a.y + FEET, a.y + FEET - p.head.y, color, a.facing, { dx: dx / l, dy: dy / l, clean: !this.gore });
      if (this.gore) this.fx.blood(p.neck.x, a.y + FEET, a.y + FEET - p.neck.y, dx / l, dy / l - 0.5, 34);
      else this.fx.sparks(p.neck.x, a.y + FEET, a.y + FEET - p.neck.y, 10, '#ffd166');
      this.sfx.play('pop', { x: a.x, y: a.y });
    } else if (this.gore) {
      this.fx.head(p.head.x, a.y + FEET, a.y + FEET - p.head.y, color, a.facing);
      this.fx.blood(p.neck.x, a.y + FEET, a.y + FEET - p.neck.y, 0, -1, 26);
      this.sfx.play('pop', { x: a.x, y: a.y });
    }
    this.fx.grave(a, { color, headless: this.gore || hs, gore: this.gore }, now);
    this.sfx.play('grave', { x: a.x, y: a.y });
  }

  // events land with the picture (see onSnap): a hit shows when its tracer gets there
  onEvents(list) {
    setTimeout(() => this.active && this.applyEvents(list), INTERP_MS);
  }

  applyEvents(list) {
    const now = performance.now();
    for (const ev of list) {
      switch (ev.k) {
        case 'pickup':
          this.fx.floater(ev.x, ev.y, `+${this.money(ev.v)}`, this.golden ? '#ffd166' : '#f7931a', 15 + ev.t * 4, 0.9);
          this.fx.ring(ev.x, ev.y, '#f7931a');
          this.sfx.play('coin', { tier: ev.t });
          break;
        case 'loot':
          this.fx.floater(ev.x, ev.y, `+${this.money(ev.v)}`, '#ffd166', 24, 1.8);
          this.fx.ring(ev.x, ev.y, '#ffd166');
          this.banner(t('hud.bagOpened', { v: this.money(ev.v) }), 'money', 2000);
          this.sfx.play('bag');
          break;
        case 'hit':
          if (ev.vid === this.pid) {
            this.hurt = 1;
            this.shake = Math.max(this.shake, 12);
            this.sfx.play('hurt');
            if (this.meAnim) this.hitFx(this.meAnim, now, 20);
            if (ev.d) this.dmgNumber(this.meAnim?.x ?? ev.x, this.meAnim?.y ?? ev.y, ev.d, 'me');
          } else if (ev.sid === this.pid) {
            if (ev.hs && !ev.fatal) this.critFx(ev.x, ev.y, now);
            else if (!ev.hs) this.sfx.play('hitmark');
            if (ev.d) this.dmgNumber(ev.x, ev.y, ev.d, ev.hs ? 'crit' : 'hit');
          }
          if (ev.hs && ev.vid === this.pid) this.shake = Math.max(this.shake, 16);
          break;
        case 'kill': {
          const from = ev.kid === this.pid ? this.meAnim : this.anims.get(ev.kid);
          if (ev.hs && ev.kid === this.pid) this.headshotFx(ev.x ?? from?.x ?? 0, ev.y ?? from?.y ?? 0, now, ev.vid);
          if (ev.vid === this.pid && this.meAnim && !this.dead) {
            this.dead = true;
            this.deathFx(this.meAnim, this.skin, now, !!ev.hs, from);
            this.sfx.play('death');
          } else {
            const a = this.anims.get(ev.vid);
            if (a && now - a.seen < 400) {
              this.deathFx(a, a.color, now, !!ev.hs, from);
              this.anims.map.delete(ev.vid);
            }
          }
          const how = ev.cause === 'storm';
          if (ev.kid === this.pid && this.shopMode) this.fx.floater(this.pred?.x ?? 0, (this.pred?.y ?? 0) - 40, `+${GL.KILL} CR`, '#3ddc97', 18, 1.2);
          const b = (n) => `<b>${esc(n)}</b>`;
          if (ev.kid === this.pid) this.feed(`${t('feed.youDropped', { name: b(ev.victim) })}${ev.hs ? ` · ${t('hud.headshot')}` : ''}`, 'me');
          else if (ev.cause === 'zombie' || ev.cause === 'boss') this.feed(t(ev.vid === this.pid ? 'feed.zYou' : 'feed.zDown', { name: b(ev.victim) }), ev.vid === this.pid ? 'me' : 'warnline');
          else if (ev.vid === this.pid) this.feed(how ? t('feed.storm') : t('feed.droppedYou', { name: `<b>${esc(ev.killer ?? 'The dark')}</b>` }), 'me');
          else if (how) this.feed(t('feed.stormTook', { name: b(ev.victim) }));
          else if (ev.killer) this.feed(`${t('feed.dropped', { a: b(ev.killer), b: b(ev.victim) })}${ev.cause === 'turret' ? ' ◈' : ev.cause === 'mine' ? ' ⌁' : ev.hs ? ' ⌖' : ''}`);
          else this.feed(t('feed.down', { name: b(ev.victim) }));
          break;
        }
        case 'extract': {
          const a = this.anims.get(ev.pid);
          if (a && now - a.seen < 400) {
            this.fx.ring(a.x, a.y + FEET, '#3ddc97');
            this.fx.dust(a.x, a.y + FEET, 8, 'rgba(61,220,151,0.35)');
          }
          if (ev.pid !== this.pid) this.feed(t('feed.extracted', { name: `<b>${esc(ev.name)}</b>` }), 'exit');
          break;
        }
        case 'warn':
          this.banner(t(ev.text), 'warn', 2400);
          this.sfx.play('beep', { f: 660 });
          break;
        case 'storm':
          this.banner(t(ev.text), 'warn', 2600);
          if (/final/i.test(ev.text) && !this.dead) this.sfx.say?.('final', getLang());
          this.sfx.play('storm');
          break;
        case 'exitClosed':
          this.feed(t('feed.exitClosed', { name: `<b>${esc(ev.name)}</b>` }), 'warnline');
          break;
        case 'level': {
          const wp = WEAPONS[ev.w];
          this.banner(ev.wrap ? t('hud.arsenal') : t('hud.unlocked', { w: t(`w.${wp.name}`) }), 'gold', 1800);
          this.sfx.play('level');
          break;
        }
        case 'demote':
          this.banner(t('hud.demoted', { w: t(`w.${WEAPONS[ev.w].name}`) }), 'warn', 1800);
          break;
        case 'arsenal':
          if (ev.pid !== this.pid) this.feed(`<b>${esc(ev.name)}</b> finished the arsenal ★`, 'warnline');
          break;
        case 'streak':
          if (ev.tier === 1 || ev.pid === this.pid) this.showStreak(ev.tier, ev.pid === this.pid ? null : ev.name);
          break;
        case 'roundStart':
          this.banner(t('hud.roundStart', { n: ev.n, of: ev.of }), 'gold', 1800);
          this.sfx.play('ready');
          break;
        case 'roundEnd': {
          const mine = this.teamMode ? `t${this.you?.tm}` : `p${this.pid}`;
          if (ev.win === mine) {
            this.banner(t('hud.roundWon', { n: ev.n }), 'gold', 2600);
            this.sfx.play('level');
          } else if (!ev.win) this.banner(t('hud.roundDraw', { n: ev.n }), 'warn', 2600);
          else {
            this.banner(this.teamMode ? t('hud.roundLost', { n: ev.n }) : t('hud.roundTo', { n: ev.n, name: ev.name ?? '?' }), 'warn', 2600);
            this.sfx.play('beep', { f: 330 });
          }
          break;
        }
        case 'respawn':
          this.banner(t('hud.respawned'), 'money', 1200);
          this.sfx.play('ready');
          break;
        case 'lead':
          this.banner(t('hud.tookLead'), 'gold', 2000);
          this.sfx.say?.('lead', getLang(), 0.9);
          break;
        case 'lostLead':
          this.banner(t('hud.lostLead'), 'warn', 2000);
          this.sfx.say?.('lostLead', getLang(), 0.9);
          break;
        case 'leader':
          if (ev.pid !== this.pid) this.feed(t('feed.leader', { name: `<b>${esc(ev.name)}</b>`, k: ev.kills }), 'warnline');
          break;
        case 'bought':
          this.sfx.play('coin', { tier: 1 });
          this.fx.ring(ev.x, ev.y, '#3ddc97');
          this.banner(t(`gl.${ev.item}`), 'money', 900);
          break;
        case 'upgraded':
          this.sfx.play('level');
          this.fx.ring(ev.x, ev.y, '#ffd166');
          this.fx.sparks(ev.x, ev.y, 24, 14, '#ffd166');
          this.banner(t(ev.kind === 'turret' ? 'gl.upTurret' : 'gl.upMine', { lv: ev.lv }), 'gold', 1600);
          break;
        case 'revived':
          this.sfx.play('level');
          this.fx.ring(ev.x, ev.y, '#ffd166');
          this.fx.sparks(ev.x, ev.y, 30, 18, '#ffd166');
          this.banner(t('gl.revived', { name: ev.by === this.pid ? t('gl.you') : ev.name, n: ev.n }), 'gold', 2200);
          break;
        case 'buyFail':
          this.banner(t(`gl.no.${ev.why}`), 'warn', 1200);
          this.sfx.play('beep', { f: 220, dur: 0.08 });
          break;
        case 'wreck':
          this.fx.sparks(ev.x, ev.y, 16, 14);
          this.fx.dust(ev.x, ev.y, 6, 'rgba(180,180,190,0.35)');
          this.sfx.play('impact', { x: ev.x, y: ev.y });
          if (ev.by === this.pid) this.fx.floater(ev.x, ev.y, `+${GL.WRECK} CR`, '#3ddc97', 16, 1);
          break;
        case 'boom':
          this.fx.boom?.(ev.x, ev.y);
          this.fx.sparks(ev.x, ev.y, 10, 26, '#ff4d5e');
          this.fx.dust(ev.x, ev.y, 12, 'rgba(255,90,60,0.35)');
          this.sfx.play('boom', { x: ev.x, y: ev.y });
          if (this.pred && Math.hypot(ev.x - this.pred.x, ev.y - this.pred.y) < 400) this.shake = Math.max(this.shake, ev.small ? 7 : 14);
          break;
        case 'wave':
          this.banner(ev.boss ? t(ev.n >= ev.of ? 'hud.bossWave' : 'hud.midBossWave') : t('hud.wave', { n: ev.n, of: ev.of }), ev.boss ? 'warn' : 'gold', 2600);
          this.sfx.play('storm');
          if (ev.boss) {
            this.sfx.say?.('final', getLang());
            this.shake = Math.max(this.shake, 10);
          }
          break;
        case 'waveClear':
          this.banner(t('hud.waveClear', { n: ev.n }), 'money', 2200);
          this.sfx.play('level');
          if (this.pred) this.fx.floater(this.pred.x, this.pred.y - 40, t('hud.patched'), '#3ddc97', 16, 1.2);
          break;
        case 'zdead': {
          const a = this.anims.get(ev.zid);
          this.zDeathFx(a?.x ?? ev.x, a?.y ?? ev.y, ev.type, now);
          this.anims.map.delete(ev.zid);
          if (ev.kid === this.pid && ev.hs) this.headshotFx(ev.x, ev.y, now);
          else if (ev.kid === this.pid) this.fx.floater(ev.x, ev.y - 30, ev.type === 'boss' ? '☠ BOSS' : '+1', ev.type === 'boss' ? '#ff4d5e' : '#9be36b', ev.type === 'boss' ? 26 : 13, 0.7);
          break;
        }
        case 'zhit':
          if (ev.d) this.dmgNumber(ev.x, ev.y, ev.d, ev.hs ? 'crit' : 'hit');
          if (ev.hs && !ev.fatal) this.critFx(ev.x, ev.y, now);
          else if (ev.hs) break;
          else if (now - (this.zMark ?? 0) > 90) {
            this.zMark = now;
            this.sfx.play('hitmark');
          }
          break;
        case 'slam':
          this.fx.ring(ev.x, ev.y + FEET, '#ff4d5e');
          this.fx.boom?.(ev.x, ev.y);
          this.fx.dust(ev.x, ev.y + FEET, 16, 'rgba(120, 90, 60, 0.4)');
          this.sfx.play('boom', { x: ev.x, y: ev.y });
          if (this.pred && Math.hypot(ev.x - this.pred.x, ev.y - this.pred.y) < 500) this.shake = Math.max(this.shake, 16);
          break;
        case 'summon':
          this.banner(t('hud.summon'), 'warn', 1400);
          break;
        case 'bossDown':
          this.banner(t(ev.mid ? 'hud.midBossDown' : 'hud.bossDown'), 'gold', 3000);
          this.sfx.music?.sting(true);
          break;
        case 'zcr':
          this.fx.floater(ev.x, ev.y - 46, `+${ev.v} CR`, '#3ddc97', 13, 0.8);
          break;
        case 'medkit':
          this.fx.floater(ev.x, ev.y - 20, '+HP', '#3ddc97', 16, 1);
          this.fx.ring(ev.x, ev.y, '#3ddc97');
          this.sfx.play('coin', { tier: 1 });
          break;
        case 'gold':
          this.fx.floater(ev.x, ev.y - 20, `+${ev.v} ${t('hud.bagsShort')}`, '#ffd166', ev.v > 1 ? 22 : 16, 1.1);
          this.fx.ring(ev.x, ev.y, '#ffd166');
          this.sfx.play(ev.v > 1 ? 'bag' : 'coin', { tier: ev.v > 1 ? 2 : 1 });
          break;
        case 'streakFeed':
          if (ev.pid !== this.pid) this.feed(`<b>${esc(ev.name)}</b> is on a ${STREAKS[ev.tier].title.toLowerCase()}`, 'warnline');
          break;
        default:
      }
    }
  }

  // ------------------------------------------------------------- local ui

  showStreak(tier, who) {
    const s = STREAKS[tier];
    const el = this.el.streak;
    this.el.banner.hidden = true; // the streak owns the centre of the screen
    el.hidden = false;
    el.className = `streak ${s.cls}`;
    el.querySelector('.st-title').textContent = t(`streak.${tier}`);
    el.querySelector('.st-sub').textContent = who ? who : tier === 1 ? t('streak.you1') : '';
    for (const c of el.querySelectorAll('.coin-rain')) c.remove();
    if (tier === 5) {
      for (let i = 0; i < 28; i++) {
        const c = document.createElement('span');
        c.className = 'coin-rain';
        c.textContent = '₿';
        c.style.left = `${Math.random() * 100}%`;
        c.style.animationDelay = `${Math.random() * 0.9}s`;
        el.append(c);
      }
    }
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('go');
    clearTimeout(this.streakT);
    this.streakT = setTimeout(() => (el.hidden = true), 2600);
    this.sfx.sting?.(tier);
    this.sfx.say?.(`s${tier}`, getLang(), tier === 1 ? 0.35 : 0.15);
    if (tier >= 4) this.shake = Math.max(this.shake, 10);
  }

  feed(html, cls = '') {
    const li = document.createElement('li');
    li.innerHTML = html;
    if (cls) li.className = cls;
    const f = this.el.feed;
    f.prepend(li);
    while (f.children.length > 5) f.lastChild.remove();
    setTimeout(() => li.classList.add('fade'), 5000);
    setTimeout(() => li.remove(), 5700);
  }

  banner(text, kind, ms) {
    const b = this.el.banner;
    b.textContent = text;
    b.className = `banner ${kind}`;
    b.hidden = false;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => (b.hidden = true), ms);
  }

  // your own turret or tripmine within reach that can still go up a level
  upgradable() {
    if (!this.shopMode || !this.pred || this.you?.st !== 'alive') return null;
    const last = this.snaps[this.snaps.length - 1];
    let best = null;
    let bd = GL.UP_REACH;
    for (const o of [...(last?.turrets ?? []), ...(last?.mines ?? [])]) {
      if (o.o !== 1 || (o.lv ?? 1) >= 3) continue;
      const dd = Math.hypot(o.x - this.pred.x, o.y - this.pred.y);
      if (dd < bd) {
        bd = dd;
        best = { ...o, kind: last.turrets?.includes(o) ? 'turret' : 'mine' };
      }
    }
    return best;
  }

  // Space (or the touch button) next to your gadget: upgrade it instead of dashing
  tryUpgrade() {
    const g = this.upgradable();
    if (!g || !this.active) return false;
    this.send({ t: 'upgrade' });
    return true;
  }

  buy(item) {
    if (!this.active || !this.shopMode || this.you?.st !== 'alive') return;
    this.send({ t: 'buy', item });
  }

  cycleBluff() {
    if (!this.active || this.you?.st !== 'alive') return;
    this.bluff = (this.bluff + 1) % 3;
    this.send({ t: 'bluff', v: this.bluff });
    this.updateBluffChip();
    if (this.input.touchOn) this.banner(`${t('hud.bagLook')}: ${t(`bluff.${this.bluff}`)}`, 'money', 900);
  }

  updateBluffChip() {
    this.el.bluffChip.firstChild.textContent = `${t('hud.bagLook')}: ${t(`bluff.${this.bluff}`)} `;
  }

  // ------------------------------------------------------------ per frame

  sampleInput() {
    if (!this.you || this.you.st !== 'alive' || !this.pred) return;
    const mv = this.input.moveVector();
    // aim from the gun, not the feet: figures stand upright
    const sp = this.renderer.toScreen(this.pred.x + this.corr.x, this.pred.y + this.corr.y - 18);
    let a = this.input.aimAngle(sp.x, sp.y);
    const f = this.input.firing();
    // touch: the Fire button aims itself at the nearest enemy in range
    this.aimTarget = null;
    if (this.input.touchOn && f) {
      const tg = this.autoTarget();
      if (tg) {
        a = Math.atan2(tg.a.y - this.pred.y, tg.a.x - this.pred.x);
        this.input.lastAim = a;
        this.aimTarget = tg.a.id;
      }
    }
    const d = this.input.takeDash();
    const r = this.input.takeReload();
    const msg = { t: 'in', s: ++this.seq, mx: r3(mv.x), my: r3(mv.y), a: r3(a), f, d, ...(r ? { r: true } : {}) };
    this.send(msg);
    const inp = sanitizeInput(msg);
    const cdBefore = this.pred.dashCd;
    stepMovement(this.pred, inp, DT, this.map);
    if (d && cdBefore <= 0 && this.pred.dashT > 0) {
      this.sfx.play('dash');
      if (this.meAnim) this.meAnim.dashT = performance.now();
    }
    this.pending.push(inp);
    if (this.pending.length > 90) this.pending.shift();
    this.aim = inp.a;
    this.localFireCd = Math.max(0, this.localFireCd - DT);
    const wp = WEAPONS[this.you.w ?? 0];
    const dry = !wp.melee && ((this.you.rl ?? 0) > 0 || (this.you.am ?? 1) <= 0);
    if (f && dry && this.localFireCd <= 0 && !this.dryT) {
      this.dryT = 1;
      this.sfx.play('dry');
    }
    if (!f) this.dryT = 0;
    if (f && !dry && this.localFireCd <= 0) {
      this.localFireCd = wp.cd;
      if (this.meAnim) this.attackFx(this.meAnim, this.you.w ?? 0, performance.now(), true);
    }
  }

  // nearest enemy we can see within the current weapon's reach (allies never)
  autoTarget() {
    const wp = WEAPONS[this.you?.w ?? 0];
    const reach = wp.melee ? meleeOf(this.outfit?.ws?.[wp.id]).reach + CFG.PLAYER_R * 2 + 20 : wp.range * 0.95;
    let best = null;
    let bd = reach;
    for (const f of [...(this.lastFigures ?? []), ...(this.lastZombies ?? [])]) {
      if (f.isMe || f.ally === true || f.hp <= 0) continue;
      const d = Math.hypot(f.a.x - this.pred.x, f.a.y - this.pred.y);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  frame(now, dt) {
    if (!this.active) return;
    this.acc = Math.min(this.acc + dt, 0.2);
    while (this.acc >= DT) {
      this.acc -= DT;
      this.sampleInput();
    }
    const k = Math.exp(-dt * 10);
    this.corr.x *= k;
    this.corr.y *= k;
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.fx.update(dt, now);
    const view = this.buildView(now, dt);
    // one bad frame must never freeze the raid: log it once and keep the game (and HUD) running
    try {
      if (view) this.renderer.draw(view);
    } catch (e) {
      const key = String(e?.message ?? e);
      this.drawErrs ??= new Set();
      if (!this.drawErrs.has(key) && this.drawErrs.size < 5) {
        this.drawErrs.add(key);
        console.error('frame draw failed', e);
        reportError('draw', e);
      }
      this.fx.clear();
    }
    this.renderer.measure(dt * 1000);
    this.fx.setQuality(this.renderer.quality);
    if (now - this.lastHud > 90) {
      this.lastHud = now;
      this.updateHud(now, view);
    }
  }

  buildView(now, dt) {
    const S = this.snaps;
    if (!S.length || !this.you) return null;
    const rt = now + this.offset - INTERP_MS;
    const last = S[S.length - 1];
    let a = last;
    let b = last;
    if (rt < last.time) {
      a = S[0];
      b = S[0];
      for (let i = S.length - 1; i > 0; i--) {
        if (S[i - 1].time <= rt) {
          a = S[i - 1];
          b = S[i];
          break;
        }
      }
    }
    const span = b.time - a.time;
    const k = span > 0 ? Math.min(1, Math.max(0, (rt - a.time) / span)) : 1;
    const pa = new Map(a.players.map((p) => [p.i, p]));
    const figures = [];
    const zombies = [];
    for (const p of b.players) {
      const q = pa.get(p.i);
      const x = q ? lerp(q.x, p.x, k) : p.x;
      const y = q ? lerp(q.y, p.y, k) : p.y;
      const aim = q ? lerpAngle(q.a, p.a, k) : p.a;
      if (p.zb) {
        const an = this.anims.update(p.i, x, y, aim, dt, now, { w: 0, color: '#7fae5a' });
        zombies.push({ a: an, type: p.zb, hp: p.h, flash: now - an.hitT < 90 });
        continue;
      }
      const skins = settings.skins === 'all'; // settings: draw others' outfits and weapon skins?
      const an = this.anims.update(p.i, x, y, aim, dt, now, { w: p.w, bluff: p.b, color: p.c, outfit: skins ? p.o : null, body: p.g, ws: skins ? p.ws : null });
      this.woundCheck(an, p.h, now);
      figures.push({ a: an, color: p.c, name: p.n, ping: p.pg, noName: !settings.names, ally: p.tm !== undefined && this.you?.tm !== undefined ? p.tm === this.you.tm : null, title: p.tt && settings.titles && settings.names ? t(`ach.${p.tt}`) : null, ttier: p.tt ? titleTier(p.tt) : null, neon: p.nt && settings.titles ? p.nt : null, hp: p.h, isMe: false, flash: now - an.hitT < 90, shield: p.s, ext: p.e, pr: p.pr, rk: p.rk, laser: WEAPONS[p.w]?.laser });
    }
    this.anims.prune(now);
    this.lastFigures = figures;
    this.lastZombies = zombies;
    const bullets = this.tracers(a, b, rt);

    const you = this.you;
    let eye;
    const alive = you.st === 'alive' && this.pred && !this.dead;
    if (alive) {
      const x = this.pred.x + this.corr.x;
      const y = this.pred.y + this.corr.y;
      const me = (this.meAnim = this.animSelf(x, y, dt, now));
      this.woundCheck(me, you.hp, now);
      figures.push({ a: me, color: this.skin, name: this.myName || 'you', rk: this.myRank, title: settings.titles ? this.myTitle : null, ttier: this.myTitleTier ?? null, neon: settings.titles ? this.myNeon : null, hp: you.hp, isMe: true, flash: now - me.hitT < 90, shield: you.shield > 0, ext: you.ext, pr: you.pr, laser: WEAPONS[you.w]?.laser });
      eye = { x, y };
      // look a little ahead of where you aim
      const la = Math.min(1, 1 - Math.exp(-dt * 6));
      this.look.x += (Math.cos(this.aim) * 70 - this.look.x) * la;
      this.look.y += (Math.sin(this.aim) * 50 - this.look.y) * la;
      this.cam = { x: x + this.look.x, y: y + this.look.y };
      this.footsteps(me, now);
    } else {
      const spec = you.spect ? figures.find((f) => f.name === you.spect) : null;
      eye = spec ? { x: spec.a.x, y: spec.a.y } : { x: you.ex, y: you.ey };
      if (!this.cam) this.cam = { ...eye };
      this.cam.x += (eye.x - this.cam.x) * 0.1;
      this.cam.y += (eye.y - this.cam.y) * 0.1;
    }
    this.sfx.setListener(eye.x, eye.y);
    const zone = this.plan && !this.plan.none ? zoneAt(this.plan, Math.max(0, rt / 1000)) : null;
    const exitStates = zone ? Object.fromEntries(this.map.extracts.map((e) => [e.id, exitState(this.plan, zone, e)])) : null;
    this.zone = zone;
    this.exitStates = exitStates;
    return {
      cam: this.cam,
      eye,
      figures,
      orbs: last.orbs,
      drops: last.drops,
      bullets,
      turrets: last.turrets,
      mines: last.mines,
      zombies,
      gold: last.gold,
      packs: last.packs,
      fx: this.fx,
      time: now,
      golden: last.golden,
      zone,
      exitStates,
      shake: settings.shake ? this.shake : 0,
      hurt: this.hurt,
      storm: alive && you.storm,
      showArrows: true,
      gore: this.gore,
      meAlive: alive,
      radar: this.radar,
      target: this.aimTarget,
    };
  }

  // Every round where it is at the render time: between two snapshots it slides; a round
  // that stopped flies on to the exact point where it stopped (a body, a wall, the end of
  // its range) and no further; a round fired after the last snapshot but one starts at the
  // muzzle, not halfway down its path. tr: how much tail it may show (never behind the gun).
  tracers(a, b, rt) {
    const ends = new Map();
    for (const s of this.snaps) for (const e of s.ends ?? []) ends.set(e[0], e);
    const out = [];
    const inB = new Map(b.bullets.map((x) => [x.i, x]));
    for (const q of a === b ? [] : a.bullets) {
      if (inB.has(q.i)) continue;
      const e = ends.get(q.i);
      if (!e) continue;
      const sp = Math.hypot(q.vx, q.vy) || 1;
      const went = (sp * Math.max(0, rt - a.time)) / 1000;
      const to = Math.hypot(e[1] - q.x, e[2] - q.y);
      if (went >= to) continue; // it already got there
      out.push({ ...q, x: q.x + (q.vx / sp) * went, y: q.y + (q.vy / sp) * went, tr: (q.d ?? 999) + went });
    }
    for (const x of b.bullets) {
      const q = a === b ? null : a.bullets.find((y) => y.i === x.i);
      if (q) {
        const k = Math.min(1, Math.max(0, (rt - a.time) / Math.max(1, b.time - a.time)));
        out.push({ ...x, x: lerp(q.x, x.x, k), y: lerp(q.y, x.y, k), tr: lerp(q.d ?? 999, x.d ?? 999, k) });
        continue;
      }
      const sp = Math.hypot(x.vx, x.vy) || 1;
      const back = (sp * Math.max(0, b.time - rt)) / 1000;
      const d = x.d ?? 999;
      if (back >= d) continue; // not fired yet at the render time
      out.push({ ...x, x: x.x - (x.vx / sp) * back, y: x.y - (x.vy / sp) * back, tr: d - back });
    }
    return out;
  }

  animSelf(x, y, dt, now) {
    const you = this.you;
    return this.anims.update(-1, x, y, this.aim, dt, now, { w: you.w ?? 0, bluff: this.bluff, color: this.skin, id: -1, outfit: settings.skins === 'none' ? null : this.outfit.outfit, body: this.outfit.body, ws: settings.skins === 'none' ? null : this.outfit.ws });
  }

  footsteps(me, now) {
    if (me.moveK < 0.3) return;
    const step = Math.floor(me.phase / Math.PI);
    if (step !== this.stepPhase) {
      this.stepPhase = step;
      this.sfx.play('step');
      if (Math.random() < 0.3) this.fx.dust(me.x, me.y + FEET, 1, 'rgba(150,150,160,0.25)');
    }
  }

  // First raids: one short hint at a time, picked from what is going on right now.
  updateCoach(you, alive, tl) {
    const el = this.el.coach;
    if (!el) return;
    let hint = '';
    if (this.coachOn && alive && !(you.ext > 0)) {
      const inside = this.duration ? this.duration - tl : 0;
      this.bagStart ??= you.bag;
      const touch = this.input.touchOn;
      if (you.storm) hint = t('coach.storm');
      else if (this.zombieMode) hint = inside < 12 ? t('coach.z') : '';
      else if (this.goldMode) hint = inside < 12 ? t('coach.gold') : '';
      else if (this.shopMode && inside >= 4 && inside < 30) hint = t('coach.gl');
      else if (this.dmMode && inside >= 7) hint = t('coach.dm');
      else if (this.potMode && inside >= 7) hint = t(this.teamMode ? 'coach.team' : 'coach.pot');
      else if (inside < 7) hint = touch ? t('coach.touch') : t('coach.keys');
      else if (tl < 75 || you.bag >= this.stake) hint = t('coach.exit');
      else if (you.bag <= this.bagStart) hint = t('coach.loot');
      else if (!you.k) hint = touch ? t('coach.killsTouch') : t('coach.kills');
    }
    if (el.textContent !== hint) el.textContent = hint;
    el.hidden = !hint;
  }

  updateHud(now, view) {
    const you = this.you;
    const el = this.el;
    // no picture from the server for a while: say so, instead of a silent freeze
    const lagEl = document.getElementById('lagwarn');
    if (lagEl) lagEl.hidden = !(this.snapAt && now - this.snapAt > 1200);
    if (!you) return;
    const alive = you.st === 'alive' && !this.dead;
    if (this.zombieMode) {
      el.bag.textContent = t('hud.waveN', { n: you.zw ?? 0, of: WAVES });
      el.pnl.textContent = you.zbr ? t('hud.nextWave', { s: you.zbr }) : t('hud.zLeft', { n: you.zl ?? 0, k: you.zk ?? 0 });
      el.pnl.className = 'pnl';
    } else if (this.goldMode) {
      el.bag.textContent = `${you.gb ?? 0}`;
      el.pnl.textContent = t('hud.goldPlace', { p: you.pl ?? 1, d: you.dth ?? 0, s: this.money(you.pot ?? 0) });
      el.pnl.className = `pnl ${you.pl === 1 && you.gb ? 'up' : ''}`;
    } else if (this.dmMode) {
      el.bag.textContent = this.money(you.pot ?? 0);
      el.pnl.textContent = t('hud.dmScore', { k: you.k ?? 0, d: you.dth ?? 0, p: you.pl ?? 1 });
      el.pnl.className = 'pnl';
    } else if (this.potMode) {
      el.bag.textContent = this.money(you.pot ?? 0);
      el.pnl.textContent = t(this.teamMode ? 'hud.teamsLeft' : 'hud.left', { n: you.sides ?? 0, s: this.money(this.stake) });
      el.pnl.className = 'pnl';
    } else this.updateBag(you, alive);
    // count down between snapshots, but not past a second: with none coming (practice paused, a
    // stalled link) the clock holds instead of running ahead and jumping back
    const tl = Math.max(0, this.recvTl.tl - Math.min(1, (now - this.recvTl.at) / 1000));
    this.updateRest(now, view, you, alive, tl);
  }

  updateBag(you, alive) {
    const el = this.el;
    el.bag.textContent = this.money(alive ? you.bag : 0);
    const pnl = (alive ? you.bag : 0) - this.stake;
    // from rounded cents, so bag and profit always add up on screen
    const r = this.rate ?? 1000;
    const cents = (x) => Math.round((x * 100) / r);
    const d = cents(alive ? you.bag : 0) - cents(this.stake);
    el.pnl.textContent = t('hud.pnl', { d: `${d >= 0 ? '+' : '−'}${usdTextCents(Math.abs(d))}`, s: this.money(this.stake) });
    el.pnl.className = `pnl ${pnl > 0 ? 'up' : pnl < 0 ? 'down' : ''}`;
  }

  updateRest(now, view, you, alive, tl) {
    const el = this.el;
    el.timer.textContent = mmss(tl);
    el.timer.hidden = this.zombieMode; // zombies: no clock, hold out as long as you can
    el.timer.classList.toggle('hot', tl <= 30);
    if (alive && tl <= 10 && tl > 0 && Math.floor(tl) !== this.lastTick) {
      this.lastTick = Math.floor(tl);
      this.sfx.play('beep', { f: 990, dur: 0.05 });
    }
    const last = this.snaps[this.snaps.length - 1];
    if (last) el.alive.textContent = t('hud.alive', { n: last.alive });
    // your round trip to the server (online only; practice runs in this tab)
    const ms = this.ping?.();
    el.ping.hidden = ms == null;
    if (ms != null) {
      el.ping.textContent = `${ms} ms`;
      el.ping.className = `ping-chip ${ms < 80 ? 'good' : ms < 160 ? 'ok' : 'bad'}`;
    }
    const hp = Math.max(0, you.hp);
    el.hpBar.style.width = `${hp}%`;
    el.hpBar.style.background = hpColor(hp / 100);
    el.hpNum.textContent = this.hardcore ? t('hud.oneHit') : hp;
    // standing next to your own gadget: what Space does, and what it costs
    const up = alive ? this.upgradable() : null;
    if (el.upHint) {
      el.upHint.hidden = !up;
      if (up) {
        const cost = GL.UP[(up.lv ?? 1) + 1];
        el.upHint.textContent = t(this.input.touchOn ? 'gl.upHintTouch' : 'gl.upHint', { what: t(up.kind === 'turret' ? 'gl.turret' : 'gl.mine'), lv: (up.lv ?? 1) + 1, c: cost });
        el.upHint.classList.toggle('poor', (you.cr ?? 0) < cost);
      }
    }
    const tUp = document.getElementById('t-up');
    if (tUp) {
      tUp.hidden = !up;
      if (up) tUp.querySelector('em').textContent = GL.UP[(up.lv ?? 1) + 1];
    }
    if (this.shopMode) {
      const cr = you.cr ?? 0;
      el.glCr.textContent = fmt(cr);
      for (const b of document.querySelectorAll('[data-buy]')) b.classList.toggle('poor', cr < GL.ITEMS[b.dataset.buy].cost);
    }
    const cd = this.pred ? this.pred.dashCd : 0;
    el.dashChip.classList.toggle('cooling', cd > 0);
    el.dashChip.firstChild.textContent = cd > 0 ? `${t('hud.dash')} ${cd.toFixed(1)}s ` : `${t('hud.dash')} `;

    // weapon ladder
    const w = you.w ?? 0;
    el.weapon.textContent = t(`w.${WEAPONS[w].name}`);
    // the magazine: rounds left, or the reload filling up
    const wpn = WEAPONS[w];
    el.ammo.hidden = !!wpn.melee;
    if (!wpn.melee) {
      const rl = you.rl ?? 0;
      el.ammo.classList.toggle('reloading', rl > 0);
      el.ammo.classList.toggle('low', rl <= 0 && (you.am ?? 0) <= Math.ceil(wpn.mag * 0.2));
      el.ammoNum.textContent = rl > 0 ? t('hud.reloading') : `${you.am ?? 0} / ${wpn.mag}`;
      el.ammoBar.style.width = `${rl > 0 ? (1 - rl / wpn.reload) * 100 : ((you.am ?? 0) / wpn.mag) * 100}%`;
    }
    el.xpBar.style.width = `${Math.min(100, ((you.xp ?? 0) / XP_PER_LEVEL) * 100)}%`;
    el.nextWeapon.textContent = t('hud.next', { w: t(`w.${WEAPONS[w + 1 >= WEAPONS.length ? 1 : w + 1].name}`) });
    el.prestige.textContent = you.pr ? '★'.repeat(Math.min(5, you.pr)) : '';
    [...el.ladder.children].forEach((d, i) => {
      d.classList.toggle('on', i === w);
      d.classList.toggle('done', i < w);
    });

    this.updateCoach(you, alive, tl);

    // storm
    const z = this.zone;
    if (this.roundsMode) {
      el.storm.textContent = you.rb ? t('hud.roundNext', { s: you.rb }) : t('hud.roundScore', { n: you.rd ?? 1, of: you.rds ?? 3, a: you.my ?? 0, b: you.foe ?? 0 });
      el.storm.classList.toggle('hot', !you.rb && tl <= 15);
    } else if (this.zombieMode) {
      el.storm.textContent = you.zb != null ? t('hud.bossHp', { p: you.zb }) : you.zbr ? t('hud.zBreak', { s: you.zbr }) : t('hud.zGoal');
      el.storm.classList.toggle('hot', you.zb != null || tl <= 60);
    } else if (this.goldMode) {
      const top = you.top ?? [];
      el.storm.textContent = top.length && top[0][1] > 0 ? top.map(([n, k], i) => `${i + 1}. ${n} ${k}`).join(' · ') : t('hud.goldGoal');
      el.storm.classList.toggle('hot', tl <= 30);
    } else if (this.dmMode) {
      const top = you.top ?? [];
      el.storm.textContent = top.length && top[0][1] > 0 ? top.map(([n, k], i) => `${i + 1}. ${n} ${k}`).join(' · ') : t('hud.dmGoal');
      el.storm.classList.toggle('hot', tl <= 30);
    } else if (z) {
      const secs = Math.ceil(z.until);
      el.storm.textContent = z.final ? t('hud.final') : z.shrinking ? t('hud.closing', { t: mmss(secs) }) : t('hud.stormIn', { t: mmss(secs) });
      el.storm.classList.toggle('hot', z.shrinking || z.final);
      if (!z.shrinking && !z.final && z.until < 4.5 && this.riserStage !== z.stage) {
        this.riserStage = z.stage;
        this.sfx.music?.riser(z.until);
      }
    }
    if (alive && this.pred && z) {
      const edge = z.r - Math.hypot(this.pred.x - z.x, this.pred.y - z.y);
      this.sfx.setStorm(edge < 0 ? 1 : Math.max(0, Math.min(0.6, 1 - edge / 260)));
    } else this.sfx.setStorm(0);

    // heartbeat when low
    if (alive && hp < 35 && now - this.heartT > 850) {
      this.heartT = now;
      this.sfx.play('heart');
    }

    // music mood: storm stage + danger + extraction
    if (this.sfx.music) {
      const stage = this.zombieMode ? Math.min(4, Math.floor((you.zw ?? 0) / 2.5)) : z ? z.stage : 0;
      const danger = view?.figures?.some((f) => !f.isMe && this.pred && Math.hypot(f.a.x - this.pred.x, f.a.y - this.pred.y) < 380) ? 1 : 0;
      const intensity = alive ? Math.min(4, 1 + Math.floor(stage * 0.75) + danger + (you.ext > 0 ? 2 : 0) + (this.hurt > 0.3 ? 1 : 0)) : 0;
      this.sfx.music.set({ mode: alive ? 'raid' : 'calm', intensity, bpm: alive ? 140 + stage * 7 : 96 });
    }

    if (alive && you.ext > 0) {
      el.extract.hidden = false;
      let best = null;
      let bd = Infinity;
      for (const e of this.map.extracts) {
        const d = Math.hypot(e.x - you.x, e.y - you.y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      el.extName.textContent = best ? best.name : '';
      el.extBar.style.width = `${Math.min(100, you.ext * 100)}%`;
    } else el.extract.hidden = true;
    if (you.st === 'dead' && this.roundsMode) {
      el.spect.hidden = false;
      el.spText.textContent = you.spect ? `${t('hud.roundDown')} · ${t('spect.watching', { name: you.spect })}` : t('hud.roundDown');
    } else if (you.st === 'dead' && this.zombieMode) {
      el.spect.hidden = false;
      el.spText.textContent = t('hud.zDown');
    } else if (you.st === 'dead' && this.respawnMode) {
      el.spect.hidden = false;
      el.spText.textContent = t('hud.respawnIn', { s: Math.max(0, you.rs ?? 0).toFixed(1) });
    } else if (you.st === 'dead') {
      el.spect.hidden = false;
      el.spText.textContent = you.spect ? t('spect.watching', { name: you.spect }) : t('spect.down');
    } else el.spect.hidden = true;
  }
}

/**
 * Lobby background: a real bot raid seen through one bot's eyes, drawn with the
 * same renderer, figures and effects as a live raid.
 */
export class Attract {
  constructor(renderer) {
    this.renderer = renderer;
    this.world = null;
    this.acc = 0;
    this.followId = null;
    this.cam = null;
    this.fx = new Fx();
    this.anims = new AnimBook();
  }

  start() {
    this.renderer.noExits = false;
    this.world = new World({ stake: 1000, seed: (Math.random() * 2 ** 32) >>> 0, roundSeconds: 900 });
    this.world.step();
    this.renderer.setMap(this.world.map);
    this.followId = null;
    this.cam = null;
    this.fx.clear();
    this.anims = new AnimBook();
    this.fcs = new Map();
  }

  stop() {
    this.world = null;
  }

  frame(now, dt) {
    const w = this.world;
    if (!w) return;
    this.acc = Math.min(this.acc + dt, 0.2);
    while (this.acc >= DT) {
      w.step();
      for (const ev of w.events) {
        if (ev.k === 'kill') {
          const a = this.anims.get(ev.vid);
          if (a) {
            this.fx.grave(a, { color: a.color, headless: false, gore: false }, now);
            this.anims.map.delete(ev.vid);
          }
        }
      }
      w.events.length = 0;
      this.acc -= DT;
    }
    let p = this.followId ? w.players.get(this.followId) : null;
    if (!p || p.status !== 'alive') {
      const alive = [...w.players.values()].filter((x) => x.status === 'alive');
      if (alive.length < 3 || w.phase !== 'live') {
        this.start();
        return;
      }
      p = alive[Math.floor(Math.random() * alive.length)];
      this.followId = p.id;
    }
    const s = w.snapshotFor(p.id);
    if (!this.cam) this.cam = { x: p.x, y: p.y };
    this.cam.x += (p.x - this.cam.x) * 0.08;
    this.cam.y += (p.y - this.cam.y) * 0.08;
    const figures = [];
    for (const q of [{ i: p.id, n: p.name, c: p.skin, x: p.x, y: p.y, a: p.aim, h: Math.ceil(p.hp), b: p.bluff, e: p.ext, s: 0, w: p.w, fc: p.fc, pr: p.prestige, rk: p.rank, o: p.outfit, g: p.body }, ...s.players]) {
      const a = this.anims.update(q.i, q.x, q.y, q.a, dt, now, { w: q.w, bluff: q.b, color: q.c, outfit: q.o, body: q.g, ws: q.ws });
      if (this.fcs.get(q.i) !== undefined && this.fcs.get(q.i) !== q.fc) a.attackT = now;
      this.fcs.set(q.i, q.fc);
      figures.push({ a, color: q.c, name: q.n, hp: q.h, isMe: false, flash: false, shield: 0, ext: q.e, pr: q.pr, rk: q.rk, laser: WEAPONS[q.w]?.laser });
    }
    this.anims.prune(now);
    this.fx.update(dt, now);
    const zone = zoneAt(w.zonePlan, w.time);
    this.renderer.draw({
      cam: this.cam,
      eye: { x: p.x, y: p.y },
      figures,
      orbs: s.orbs,
      drops: s.drops,
      bullets: s.bullets,
      fx: this.fx,
      time: now,
      golden: false,
      zone,
      exitStates: Object.fromEntries(w.map.extracts.map((e) => [e.id, exitState(w.zonePlan, zone, e)])),
      shake: 0,
      hurt: 0,
      storm: false,
      showArrows: false,
      gore: false,
      meAlive: false,
    });
    this.renderer.measure(dt * 1000);
  }
}
