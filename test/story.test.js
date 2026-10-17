import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { World } from '../shared/world.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { MODE, MODES } from '../shared/modes.js';
import { NavGrid } from '../shared/nav.js';
import { BOXES, OUTFIT, OUTFITS, WSKIN, WEAPON_SKINS, boxCatalog } from '../shared/cosmetics.js';
import { STYLE } from '../shared/style.js';
import { DescentBook, DIFF_IDS, CLASS_IDS } from '../shared/descent.js';
import { OPS, OP_BOSSES, RETRIES, GOAL_R, opItems, opMap } from '../shared/story.js';

// one runner on autopilot: walks the mission (the goal, the survivors still hiding, the seal,
// away from the boss), shoots the nearest of the dead, and cannot die unless told so
function drive(w, me, t, { immortal = true } = {}) {
  const h = w.horde;
  if (h.state !== 'fight') w.descend(me.id, 'go');
  let tx = me.x;
  let ty = me.y;
  const G = w.map.goal;
  if (h.state === 'fight') {
    if (h.obj === 'reach') [tx, ty] = [G.x, G.y];
    else if (h.obj === 'escort') {
      const sv = h.survivorsLeft();
      const hiding = sv.find((p) => !p.found);
      [tx, ty] = hiding ? [hiding.x, hiding.y] : [G.x, G.y];
    } else if (h.obj === 'hold') [tx, ty] = [h.holdAt.x, h.holdAt.y];
    else if (h.obj === 'boss') {
      const b = h.bossId && w.zombies.get(h.bossId);
      if (b && Math.hypot(b.x - me.x, b.y - me.y) < 380) {
        const d = Math.hypot(b.x - me.x, b.y - me.y) || 1;
        [tx, ty] = [Math.min(w.map.w - 100, Math.max(100, me.x + ((me.x - b.x) / d) * 200)), Math.min(w.map.h - 100, Math.max(100, me.y + ((me.y - b.y) / d) * 200))];
      }
    }
  }
  if (me._map !== w.map) {
    me._map = w.map;
    me._rp = 0;
  }
  me._rp = (me._rp ?? 0) - 1 / CFG.TICK_RATE;
  if (me._rp <= 0) {
    w.nav ??= new NavGrid(w.map);
    me._path = w.nav.findPath(me.x, me.y, tx, ty);
    me._rp = 0.5;
  }
  while (me._path?.length && Math.hypot(me._path[0].x - me.x, me._path[0].y - me.y) < 14) me._path.shift();
  const wp = me._path?.[0] ?? (Math.hypot(tx - me.x, ty - me.y) > 10 ? { x: tx, y: ty } : null);
  let mx = 0;
  let my = 0;
  if (wp) {
    const d = Math.hypot(wp.x - me.x, wp.y - me.y) || 1;
    [mx, my] = [(wp.x - me.x) / d, (wp.y - me.y) / d];
  }
  let best = null;
  let bd = 600;
  for (const z of w.zombies.values()) {
    const d = Math.hypot(z.x - me.x, z.y - me.y);
    if (d < bd) [best, bd] = [z, d];
  }
  if (me.status === 'alive') w.queueInput(me.id, { s: t + 1, mx, my, a: best ? Math.atan2(best.y - me.y, best.x - me.x) : 0, f: !!best });
  if (immortal && me.status === 'alive') me.hp = 100;
  w.step();
  const evs = w.events.slice();
  w.events.length = 0;
  return evs;
}

test('story: operation 1 has its stages, its boss, its modes on every difficulty', () => {
  const O = OPS.tunnels;
  assert.deepEqual(O.stages.map((s) => s.obj), ['reach', 'escort', 'hold', 'boss']);
  assert.ok(OP_BOSSES.find((b) => b.id === O.stages[3].boss), 'the boss exists');
  for (const d of DIFF_IDS) {
    const m = MODES.find((x) => x.op === 'tunnels' && x.diff === d);
    assert.ok(m, `a mode for ${d}`);
    assert.equal(m.kind, 'descent', 'on the Descent machinery');
    assert.equal(m.tickets, { easy: 1, hard: 3, hardcore: 5 }[d], 'the same tickets as the Descent');
  }
  assert.deepEqual(RETRIES, { easy: 2, hard: 1, hardcore: 0 });
  // every stage map has a start, a goal and gates on open floor
  for (let n = 1; n <= O.stages.length; n++) {
    const map = opMap(7, 'tunnels', n);
    assert.ok(map.start && map.goal && map.gates.length >= 8, `stage ${n} map`);
    assert.equal(map.extracts.length, 0, 'no exits: the way out is the mission');
  }
});

test('story: its items exist, only completing the operation gives them, never a case or the shop', () => {
  const inBoxes = new Set([...BOXES.flatMap((b) => boxCatalog(b)).map((x) => x.id), ...OUTFITS.map((o) => o.id), ...WEAPON_SKINS.map((s) => s.id)]);
  for (const d of DIFF_IDS) {
    for (const cls of CLASS_IDS) {
      const items = opItems('tunnels', d, cls);
      assert.ok(items.length >= 2, `${d} pays`);
      for (const it of items) {
        const x = it.k === 'outfit' ? OUTFIT[it.id] : it.k === 'wskin' ? WSKIN[it.id] : STYLE[it.id];
        assert.ok(x, `${it.k} ${it.id} exists`);
        assert.ok(!inBoxes.has(it.id), `${it.id} is not in any case or shop list`);
      }
    }
  }
});

test('story: companions take the empty seats, the humans pick their classes first', () => {
  const w = new World({ stake: 0, mode: 'op1-easy', bots: false, seed: 5 });
  const me = w.addPlayer({ name: 'me', skin: '#fff', cls: 'medic' });
  w.step();
  const allies = [...w.players.values()].filter((p) => p.npc === 'ally');
  assert.equal(allies.length, 3, 'a squad of four');
  assert.ok(!allies.some((p) => p.dClass === 'medic'), 'not a second medic');
  assert.deepEqual(new Set(allies.map((p) => p.dClass)), new Set(['assault', 'engineer', 'sniper']));
  // everyone stands at the stage's start, not in the middle of the map
  for (const p of [me, ...allies]) assert.ok(Math.hypot(p.x - w.map.start.x, p.y - w.map.start.y) < 300);
  const full = new World({ stake: 0, mode: 'op1-easy', bots: false, seed: 5 });
  for (let i = 0; i < 4; i++) full.addPlayer({ name: `h${i}`, skin: '#fff', cls: CLASS_IDS[i] });
  full.step();
  assert.equal([...full.players.values()].filter((p) => p.npc).length, 0, 'four humans: no companions');
});

test('story: a solo runner plays the whole operation through; the survivors make the train', () => {
  const w = new World({ stake: 0, mode: 'op1-easy', bots: false, seed: 12345, roundSeconds: 99999 });
  const me = w.addPlayer({ name: 'me', skin: '#fff', cls: 'assault' });
  const seen = new Set();
  let wipeAtDoor = Infinity;
  for (let t = 0; t < 30 * 600 && w.phase === 'live'; t++) {
    for (const e of drive(w, me, t)) seen.add(e.k);
    if (w.horde.state === 'fight' && w.horde.obj === 'reach' && w.horde.door !== null) wipeAtDoor = Math.min(wipeAtDoor, w.map.goal.x - w.horde.wipeX);
  }
  assert.equal(w.phase, 'ended');
  assert.ok(me.dFull, 'the operation is complete');
  assert.equal(me.status, 'extracted');
  assert.equal(me.dFloors, 4);
  assert.ok(me.dSaved >= 1, `survivors saved (${me.dSaved})`);
  for (const k of ['floor', 'radio', 'door', 'found', 'saved', 'camp', 'floorMap', 'bossIn', 'bossDown', 'opDone']) assert.ok(seen.has(k), `${k} happened`);
  assert.ok(wipeAtDoor > GOAL_R, 'the wipe stops short of the ones holding the door');
  assert.equal([...w.players.values()].filter((p) => p.npc === 'sv' && p.status === 'extracted').length, me.dSaved);
});

test('story: a squad that goes down starts the stage over while retries last; hardcore has none', () => {
  for (const [mode, retries] of [['op1-easy', 2], ['op1-hc', 0]]) {
    const w = new World({ stake: 0, mode, bots: false, seed: 9, roundSeconds: 99999 });
    const me = w.addPlayer({ name: 'me', skin: '#fff', cls: 'sniper' });
    let t = 0;
    for (; t < 30 * 60 && w.horde.state !== 'fight'; t++) drive(w, me, t);
    let retried = 0;
    for (let i = 0; i <= retries && w.phase === 'live'; i++) {
      me.shield = 0;
      w.damage(me, null, 999, 'zombie');
      const evs = drive(w, me, t++, { immortal: false });
      if (evs.some((e) => e.k === 'opRetry')) retried++;
      for (; t < 30 * 600 && w.phase === 'live' && w.horde.state !== 'fight'; t++) drive(w, me, t);
    }
    assert.equal(retried, retries, `${mode}: ${retries} restarts`);
    assert.equal(w.phase, 'ended', `${mode}: the next wipe ends it`);
    assert.ok(!me.dFull);
  }
});

test('story: the same tickets as the Descent; items for completing only, once per difficulty', () => {
  const inbox = new Map();
  const now = Date.UTC(2026, 9, 16, 12);
  const descent = new DescentBook({ now: () => now });
  const wallet = new MemoryWallet();
  const lobby = new Lobby({ wallet, descent, send: (cid, m) => (inbox.get(cid) ?? inbox.set(cid, []).get(cid)).push(m), newToken: () => `tok${Math.random().toString(36).slice(2, 12)}`, bots: false, roundSeconds: 120 });
  const last = (t) => [...(inbox.get(1) ?? [])].reverse().find((m) => m.t === t);
  lobby.connect(1, { ip: '10.0.0.9' });
  lobby.handle(1, { t: 'hello', name: 'a' });
  const token = last('welcome').token;
  assert.equal(last('welcome').descent.free, 1);
  const room = lobby.rooms.get(`op1-easy:${MODE['op1-easy'].fixed}`);
  const run = (finish) => {
    inbox.set(1, []);
    lobby.handle(1, { t: 'join', mode: 'op1-easy', stake: MODE['op1-easy'].fixed });
    lobby.handle(1, { t: 'ready', cls: 'engineer' });
    assert.equal(last('prep')?.me.ready, true, 'the ticket is taken');
    for (let i = 0; i < Math.ceil((CFG.INTERMISSION + CFG.PREP_SECONDS + 4) * CFG.TICK_RATE) && room.state !== 'live'; i++) lobby.tick();
    assert.equal(room.state, 'live');
    const w = room.world;
    const me = [...w.players.values()].find((p) => !p.isBot);
    lobby.tick();
    if (finish) {
      me.dFloors = 4;
      me.dFull = true;
      me.dSaved = 5;
    }
    w.end();
    for (let i = 0; i < 5 && !last('result'); i++) lobby.tick();
    lobby.handle(1, { t: 'leave' });
    return last('result');
  };
  // the free ticket opens the operation, so the Descent's free one is gone too: one book
  const lost = run(false);
  assert.equal(descent.view(token).free, 0);
  assert.ok(lost.descent, 'a result');
  assert.equal(lost.descent.items.length, 0, 'not completed: no items');
  descent.add(token, 2);
  const first = run(true);
  assert.equal(first.descent.full, true);
  assert.deepEqual(first.descent.items.map((x) => x.id).sort(), opItems('tunnels', 'easy', 'engineer').map((x) => x.id).sort());
  assert.equal(first.descent.saved, 5);
  assert.equal(descent.view(token).ops.tunnels.clears.easy, 1);
  assert.equal(descent.view(token).ops.tunnels.saved, 5);
  const again = run(true);
  assert.equal(again.descent.items.length, 0, 'owned already');
  assert.ok(again.descent.dupXp > 0, 'pays XP instead');
  assert.equal(descent.view(token).best.easy ?? 0, 0, 'the Descent depth board is left alone');
});

test('story: the train leaves once a runner is aboard with everyone who came along; the rest stay behind', () => {
  const w = new World({ stake: 0, mode: 'op1-easy', bots: false, seed: 31, roundSeconds: 99999 });
  const me = w.addPlayer({ name: 'me', skin: '#fff', cls: 'assault' });
  w.step();
  const h = w.horde;
  h.floor = 1;
  h.endFloor();
  h.leaveCamp();
  for (let t = 0; t < 30 * 20 && h.state !== 'fight'; t++) drive(w, me, t);
  assert.equal(h.obj, 'escort');
  const sv = h.survivorsLeft();
  assert.equal(sv.length, 2, 'two survivors');
  assert.ok(Math.hypot(sv[0].x - sv[1].x, sv[0].y - sv[1].y) > 600, 'hiding apart');
  // one is found and walks onto the train; the other still hides far away
  const G = w.map.goal;
  sv[0].found = true;
  sv[0].x = G.x;
  sv[0].y = G.y;
  me.x = G.x + 40;
  me.y = G.y;
  const seen = new Set();
  let t = 0;
  for (; t < 30 * 12 && h.state === 'fight'; t++) {
    me.hp = 100;
    w.queueInput(me.id, { s: t + 1, mx: 0, my: 0, a: 0, f: false });
    w.step();
    for (const e of w.events) seen.add(e.k);
    w.events.length = 0;
    if (h.floor === 2 && h.state === 'fight') assert.ok(!h.view(me).cx || sv[1].status === 'alive', 'the marker points at the one still hiding');
  }
  assert.ok(seen.has('saved') && seen.has('depart'), 'saved, then the train leaves');
  assert.ok(seen.has('camp'), 'the stage is done');
  assert.ok(t < 30 * 11, `within the departure time (${(t / 30).toFixed(1)} s)`);
  assert.equal(sv[1].status, 'mia', 'the one still hiding is left behind');
});

test('story: solo and friends bring no companions; friends waits for a second runner or Start', () => {
  for (const squad of ['solo', 'friends']) {
    const w = new World({ stake: 0, mode: 'op1-easy', bots: false, seed: 5, squad: 'none' });
    w.addPlayer({ name: 'me', skin: '#fff', cls: 'medic' });
    w.step();
    assert.equal([...w.players.values()].filter((p) => p.npc === 'ally').length, 0, `${squad}: no companions`);
  }
  const inbox = [];
  const descent = new DescentBook({ now: () => Date.UTC(2026, 9, 16, 12) });
  const lobby = new Lobby({ wallet: new MemoryWallet(), descent, send: (cid, m) => inbox.push([cid, m]), newToken: () => `tok${Math.random().toString(36).slice(2, 12)}`, bots: false, roundSeconds: 120 });
  const room = lobby.rooms.get(`op1-easy:${MODE['op1-easy'].fixed}`);
  for (const cid of [1, 2]) {
    lobby.connect(cid, { ip: `10.0.0.${cid}` });
    lobby.handle(cid, { t: 'hello', name: `p${cid}` });
  }
  lobby.handle(1, { t: 'join', mode: 'op1-easy', stake: MODE['op1-easy'].fixed });
  lobby.handle(1, { t: 'ready', cls: 'assault', squad: 'friends' });
  assert.equal(room.state, 'prep');
  assert.equal(room.countT, null, 'no countdown: waiting for friends');
  for (let i = 0; i < 30 * 30; i++) lobby.tick();
  assert.equal(room.state, 'prep', 'still waiting after 30 s');
  lobby.handle(2, { t: 'join', mode: 'op1-easy', stake: MODE['op1-easy'].fixed });
  lobby.handle(2, { t: 'ready', cls: 'medic', squad: 'friends' });
  assert.ok(room.countT !== null, 'a friend is ready: the countdown runs');
  for (let i = 0; i < 30 * 40 && room.state !== 'live'; i++) lobby.tick();
  assert.equal(room.state, 'live');
  lobby.tick();
  assert.equal([...room.world.players.values()].filter((p) => p.npc === 'ally').length, 0, 'two friends, no companions');
  // changing your mind to the AI squad starts the clock for a lone runner
  const lone = new Lobby({ wallet: new MemoryWallet(), descent, send: () => {}, newToken: () => `tok${Math.random().toString(36).slice(2, 12)}`, bots: false, roundSeconds: 120 });
  const r2 = lone.rooms.get(`op1-easy:${MODE['op1-easy'].fixed}`);
  lone.connect(9, { ip: '10.0.0.9' });
  lone.handle(9, { t: 'hello', name: 'z' });
  lone.handle(9, { t: 'join', mode: 'op1-easy', stake: MODE['op1-easy'].fixed });
  lone.handle(9, { t: 'ready', cls: 'sniper', squad: 'friends' });
  assert.equal(r2.countT, null);
  lone.handle(9, { t: 'pick', squad: 'ai' });
  assert.ok(r2.countT !== null, 'the AI squad: counting down');
  for (let i = 0; i < 30 * 40 && r2.state !== 'live'; i++) lone.tick();
  lone.tick(); // the companions sit down on the world's first tick
  assert.equal([...r2.world.players.values()].filter((p) => p.npc === 'ally').length, 3, 'the companions fill the squad');
});
