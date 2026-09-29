import { CFG } from '../shared/config.js';
import { stepMovement, sanitizeInput } from '../shared/movement.js';
import { World } from '../shared/world.js';

const DT = 1 / CFG.TICK_RATE;
const INTERP_MS = 110;
const BLUFF = ['small', 'medium', 'fat'];

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

/**
 * Client side of one raid: predicts your own movement from your inputs,
 * interpolates everyone else ~110 ms in the past, and drives the HUD.
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
  }

  begin(start, skin) {
    this.active = true;
    this.map = start.map;
    this.pid = start.pid;
    this.stake = start.stake;
    this.golden = start.golden;
    this.skin = skin;
    this.snaps = [];
    this.pending = [];
    this.seq = 0;
    this.pred = null;
    this.corr = { x: 0, y: 0 };
    this.you = null;
    this.offset = null;
    this.fx = [];
    this.acc = 0;
    this.aim = 0;
    this.localFireCd = 0;
    this.hurt = 0;
    this.shake = 0;
    this.bluff = 1;
    this.lastHud = 0;
    this.lastTick = -1;
    this.cam = null;
    this.recvTl = { tl: start.duration - start.time, at: performance.now() };
    this.renderer.setMap(start.map);
    const el = this.el;
    el.hud.hidden = false;
    el.feed.replaceChildren();
    el.golden.hidden = !start.golden;
    el.spect.hidden = true;
    el.extract.hidden = true;
    this.updateBluffChip();
    if (start.golden) this.banner('Golden raid · sponsor loot inside', 'gold', 3000);
    else this.banner('Grab the orange · reach a green exit', 'money', 2600);
  }

  stop() {
    this.active = false;
    this.el.hud.hidden = true;
  }

  // ------------------------------------------------------------ network in

  onSnap(s) {
    const now = performance.now();
    const off = s.time - now;
    if (this.offset === null || off > this.offset) this.offset = off;
    else this.offset += (off - this.offset) * 0.02;
    this.snaps.push(s);
    if (this.snaps.length > 30) this.snaps.shift();
    this.recvTl = { tl: s.tl, at: now };
    const you = s.you;
    this.you = you;
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
    }
  }

  onEvents(list) {
    for (const ev of list) {
      switch (ev.k) {
        case 'pickup':
          this.floater(ev.x, ev.y, `+${fmt(ev.v)}`, this.golden ? '#ffd166' : '#f7931a', 15 + ev.t * 4, 900);
          this.sfx.play('pickup', ev.t);
          break;
        case 'loot':
          this.floater(ev.x, ev.y, `+${fmt(ev.v)} sats`, '#ffd166', 24, 1800);
          this.fx.push({ kind: 'ring', x: ev.x, y: ev.y, color: '#ffd166', born: performance.now(), life: 700 });
          this.banner(`Bag opened · +${fmt(ev.v)} sats`, 'money', 2000);
          this.sfx.play('loot');
          break;
        case 'hit':
          if (ev.vid === this.pid) {
            this.hurt = 1;
            this.shake = 12;
            this.sfx.play('hurt');
          } else if (ev.sid === this.pid) {
            this.fx.push({ kind: 'hitmark', x: ev.x, y: ev.y, born: performance.now(), life: 260 });
            this.sfx.play('hit');
          }
          break;
        case 'kill':
          if (ev.kid === this.pid) {
            this.feed(`You dropped <b>${esc(ev.victim)}</b>`, 'me');
            this.banner('Runner down · their bag is on the floor', 'money', 1600);
            this.sfx.play('kill');
          } else if (ev.vid === this.pid) {
            this.feed(`<b>${esc(ev.killer ?? 'The dark')}</b> dropped you`, 'me');
            this.sfx.play('death');
          } else if (ev.killer) this.feed(`<b>${esc(ev.killer)}</b> dropped <b>${esc(ev.victim)}</b>`);
          else this.feed(`<b>${esc(ev.victim)}</b> went down`);
          break;
        case 'extract':
          if (ev.pid === this.pid) this.sfx.play('extract');
          else this.feed(`<b>${esc(ev.name)}</b> extracted`, 'exit');
          break;
        case 'warn':
          this.banner(ev.text, 'warn', 2400);
          this.sfx.play('tick');
          break;
        default:
      }
    }
  }

  // ------------------------------------------------------------- local ui

  floater(x, y, text, color, size, life) {
    this.fx.push({ kind: 'text', x, y, text, color, size, born: performance.now(), life });
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

  cycleBluff() {
    if (!this.active || this.you?.st !== 'alive') return;
    this.bluff = (this.bluff + 1) % 3;
    this.send({ t: 'bluff', v: this.bluff });
    this.updateBluffChip();
    if (this.input.touchOn) this.banner(`Bag look: ${BLUFF[this.bluff]}`, 'money', 900);
  }

  updateBluffChip() {
    this.el.bluffChip.firstChild.textContent = `Bag look: ${BLUFF[this.bluff]} `;
  }

  // ------------------------------------------------------------ per frame

  sampleInput() {
    if (!this.you || this.you.st !== 'alive' || !this.pred) return;
    const mv = this.input.moveVector();
    const sp = this.renderer.toScreen(this.pred.x + this.corr.x, this.pred.y + this.corr.y);
    const a = this.input.aimAngle(sp.x, sp.y);
    const f = this.input.firing();
    const d = this.input.takeDash();
    const msg = { t: 'in', s: ++this.seq, mx: r3(mv.x), my: r3(mv.y), a: r3(a), f, d };
    this.send(msg);
    const inp = sanitizeInput(msg);
    const cdBefore = this.pred.dashCd;
    stepMovement(this.pred, inp, DT, this.map);
    if (d && cdBefore <= 0 && this.pred.dashT > 0) this.sfx.play('dash');
    this.pending.push(inp);
    if (this.pending.length > 90) this.pending.shift();
    this.aim = inp.a;
    this.localFireCd = Math.max(0, this.localFireCd - DT);
    if (f && this.localFireCd <= 0) {
      this.localFireCd = CFG.FIRE_CD;
      this.sfx.play('shoot');
      const r = CFG.PLAYER_R + 14;
      this.fx.push({ kind: 'flash', x: this.pred.x + Math.cos(a) * r, y: this.pred.y + Math.sin(a) * r, born: performance.now(), life: 70 });
    }
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
    this.fx = this.fx.filter((f) => now - f.born < f.life);
    const view = this.buildView(now);
    if (view) this.renderer.draw(view);
    if (now - this.lastHud > 90) {
      this.lastHud = now;
      this.updateHud(now);
    }
  }

  buildView(now) {
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
    const t = span > 0 ? Math.min(1, Math.max(0, (rt - a.time) / span)) : 1;
    const pa = new Map(a.players.map((p) => [p.i, p]));
    const players = b.players.map((p) => {
      const q = pa.get(p.i);
      return q ? { ...p, x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t), a: lerpAngle(q.a, p.a, t) } : p;
    });
    const ba = new Map(a.bullets.map((x) => [x.i, x]));
    const bullets = b.bullets.map((x) => {
      const q = ba.get(x.i);
      return q ? { ...x, x: lerp(q.x, x.x, t), y: lerp(q.y, x.y, t) } : x;
    });

    const you = this.you;
    let me = null;
    let eye;
    if (you.st === 'alive' && this.pred) {
      const x = this.pred.x + this.corr.x;
      const y = this.pred.y + this.corr.y;
      me = { x, y, a: this.aim, c: this.skin, b: this.bluff, e: you.ext, d: this.pred.dashT > 0, h: you.hp, s: you.shield > 0 && this.localFireCd <= 0 };
      eye = { x, y };
      this.cam = { x, y };
    } else {
      const spec = you.spect ? players.find((p) => p.n === you.spect) : null;
      eye = spec ? { x: spec.x, y: spec.y } : { x: you.ex, y: you.ey };
      if (!this.cam) this.cam = { ...eye };
      this.cam.x += (eye.x - this.cam.x) * 0.12;
      this.cam.y += (eye.y - this.cam.y) * 0.12;
    }
    return {
      cam: this.cam,
      eye,
      me,
      players,
      orbs: last.orbs,
      drops: last.drops,
      bullets,
      fx: this.fx,
      time: now,
      golden: last.golden,
      shake: this.shake,
      hurt: this.hurt,
      showArrows: true,
    };
  }

  updateHud(now) {
    const you = this.you;
    const el = this.el;
    if (!you) return;
    const alive = you.st === 'alive';
    el.bag.textContent = fmt(alive ? you.bag : 0);
    const pnl = (alive ? you.bag : 0) - this.stake;
    el.pnl.textContent = `${pnl >= 0 ? '+' : '−'}${fmt(Math.abs(pnl))} vs ${fmt(this.stake)} stake`;
    el.pnl.className = `pnl ${pnl > 0 ? 'up' : pnl < 0 ? 'down' : ''}`;
    const tl = Math.max(0, this.recvTl.tl - (now - this.recvTl.at) / 1000);
    el.timer.textContent = mmss(tl);
    el.timer.classList.toggle('hot', tl <= 30);
    if (alive && tl <= 10 && tl > 0 && Math.floor(tl) !== this.lastTick) {
      this.lastTick = Math.floor(tl);
      this.sfx.play('tick');
    }
    const last = this.snaps[this.snaps.length - 1];
    if (last) el.alive.textContent = `${last.alive} runner${last.alive === 1 ? '' : 's'} inside`;
    el.hpBar.style.width = `${Math.max(0, you.hp)}%`;
    el.hpBar.classList.toggle('low', you.hp <= 35);
    el.hpNum.textContent = Math.max(0, you.hp);
    const cd = this.pred ? this.pred.dashCd : 0;
    el.dashChip.classList.toggle('cooling', cd > 0);
    el.dashChip.firstChild.textContent = cd > 0 ? `Dash ${cd.toFixed(1)}s ` : 'Dash ';
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
    if (you.st === 'dead') {
      el.spect.hidden = false;
      el.spect.textContent = you.spect ? `Watching ${you.spect} carry your bag` : 'You went down';
    } else el.spect.hidden = true;
  }
}

/**
 * Lobby background: a real bot raid, seen through one bot's eyes.
 */
export class Attract {
  constructor(renderer) {
    this.renderer = renderer;
    this.world = null;
    this.acc = 0;
    this.followId = null;
    this.cam = null;
  }

  start() {
    this.world = new World({ stake: 1000, seed: (Math.random() * 2 ** 32) >>> 0, roundSeconds: 900 });
    this.world.step();
    this.renderer.setMap(this.world.map);
    this.followId = null;
    this.cam = null;
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
    const eye = { x: p.x, y: p.y };
    if (!this.cam) this.cam = { ...eye };
    this.cam.x += (eye.x - this.cam.x) * 0.08;
    this.cam.y += (eye.y - this.cam.y) * 0.08;
    const self = { i: p.id, n: p.name, c: p.skin, x: p.x, y: p.y, a: p.aim, h: Math.ceil(p.hp), b: p.bluff, e: p.ext, d: p.dashT > 0 ? 1 : 0 };
    this.renderer.draw({
      cam: this.cam,
      eye: this.cam,
      me: null,
      players: [self, ...s.players],
      orbs: s.orbs,
      drops: s.drops,
      bullets: s.bullets,
      fx: [],
      time: now,
      golden: false,
      shake: 0,
      hurt: 0,
      showArrows: false,
    });
  }
}
