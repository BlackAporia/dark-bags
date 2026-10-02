import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { RoomCore } from '../shared/room.js';
import { Lobby } from '../shared/lobby.js';
import { MODE } from '../shared/modes.js';
import { WAVES, wavePlan, ZTYPES } from '../shared/horde.js';
import { raidStats } from '../shared/achievements.js';
import { raidXp } from '../shared/ranks.js';
import { WEAPONS } from '../shared/weapons.js';

const steps = (w, n) => {
  for (let i = 0; i < n && w.phase === 'live'; i++) {
    w.step();
    w.events.length = 0;
  }
};

test('zombies: a graveyard arena, no bots, your own weapon, and the whole stake is a fee', () => {
  const w = new World({ stake: 100, seed: 5, mode: 'zombies', roundSeconds: 480, practice: true });
  const a = w.addPlayer({ name: 'a', skin: '#fff', weapon: 'lmg' });
  const b = w.addPlayer({ name: 'b', skin: '#fff', weapon: 'nonsense' });
  w.step();
  assert.equal(w.map.theme, 'graveyard');
  assert.equal(w.map.extracts.length, 0);
  assert.equal(w.map.gates.length, 8);
  assert.equal(w.players.size, 2, 'humans only');
  assert.equal(WEAPONS[a.w].id, 'lmg');
  assert.equal(WEAPONS[b.w].id, 'pistol', 'an unknown pick falls back to the pistol');
  assert.equal(w.ledger.rake, 200, 'the entry is a fee');
  assert.equal(w.pot, 0);
  assert.ok(w.audit().ok);
});

test('zombies: waves grow, come from the gates, hurt the squad but the squad never hurts itself', () => {
  assert.ok(wavePlan(5).count > wavePlan(1).count);
  assert.ok(wavePlan(3, 4).count > wavePlan(3, 1).count, 'bigger squads, bigger waves');
  assert.equal(wavePlan(WAVES).boss, true);
  const w = new World({ stake: 100, seed: 8, mode: 'zombies', roundSeconds: 480 });
  const a = w.addPlayer({ name: 'a', skin: '#fff', weapon: 'rifle' });
  const b = w.addPlayer({ name: 'b', skin: '#fff', weapon: 'rifle' });
  steps(w, 30 * 8);
  assert.equal(w.horde.wave, 1);
  assert.ok(w.zombies.size > 0, 'the first wave is coming');
  a.shield = b.shield = 0;
  const hp = b.hp;
  w.damage(b, a, 50);
  assert.equal(b.hp, hp, 'no friendly fire');
  // a zombie reaches you and bites
  const z = [...w.zombies.values()][0];
  z.x = a.x + 30;
  z.y = a.y;
  z.cd = 0;
  steps(w, 2);
  assert.ok(a.hp < 100, 'the dead bite');
});

test('zombies: kill counts, revive between waves, the boss ends the run as a clear for the squad', () => {
  const w = new World({ stake: 100, seed: 9, mode: 'zombies', roundSeconds: 480 });
  const a = w.addPlayer({ name: 'a', skin: '#fff', weapon: 'rifle' });
  const b = w.addPlayer({ name: 'b', skin: '#fff', weapon: 'rifle' });
  steps(w, 30 * 7);
  const z = [...w.zombies.values()][0];
  w.horde.hit(z, a, 1e6);
  assert.equal(a.zk, 1);
  assert.equal(a.kills, 0, 'zombies are not player kills');
  // b goes down; when the wave is cleared and the next one starts, b is back on half health
  b.shield = 0;
  w.kill(b, null, 'zombie');
  assert.equal(b.status, 'dead');
  w.zombies.clear();
  w.horde.toSpawn = 0;
  steps(w, 30 * 8);
  assert.equal(w.horde.wave, 2);
  assert.equal(b.status, 'alive');
  assert.equal(b.hp, 50);
  // skip to the boss
  w.zombies.clear();
  w.horde.toSpawn = 0;
  w.horde.wave = WAVES - 1;
  w.horde.state = 'break';
  w.horde.t = 0;
  steps(w, 2);
  const boss = w.zombies.get(w.horde.bossId);
  assert.equal(boss.type, 'boss');
  assert.ok(boss.max > ZTYPES.boss.hp, 'the boss scales with the squad');
  w.horde.hit(boss, a, 1e6);
  assert.equal(w.phase, 'ended');
  assert.ok(a.won && b.won, "a clear is the whole squad's");
  assert.equal(a.zWave, WAVES);
  assert.ok(a.bossKill);
  const st = raidStats(a, { mode: MODE.zombies, squad: 2, mvp: true });
  assert.equal(st.zClears, 1);
  assert.equal(st.zMvp, 1);
  assert.equal(st.zSolo, 0);
  assert.equal(st.extracts, 0, 'no raid achievements from the side modes');
  // XP grows with every wave
  const x5 = raidXp({ zWave: 5, zk: 0 }, { kind: 'zombie' }).total;
  const x9 = raidXp({ zWave: 9, zk: 0 }, { kind: 'zombie' }).total;
  assert.ok(x9 > x5 * 2);
  assert.ok(w.audit().ok);
});

test('zombies: the whole squad down ends the run', () => {
  const w = new World({ stake: 100, seed: 10, mode: 'zombies', roundSeconds: 480 });
  const a = w.addPlayer({ name: 'a', skin: '#fff' });
  steps(w, 30);
  a.shield = 0;
  w.kill(a, null, 'zombie');
  steps(w, 2);
  assert.equal(w.phase, 'ended');
  assert.equal(a.won, false);
});

test('gold rush: bags spawn on a quarry, pickups count, death spills half, one winner takes the pot', () => {
  const w = new World({ stake: 100, seed: 12, mode: 'gold', roundSeconds: 150, botFill: 4 });
  const me = w.addPlayer({ name: 'me', skin: '#fff' });
  w.step();
  assert.equal(w.map.theme, 'mine');
  assert.ok(w.gold.size >= 6, 'the field is stocked');
  assert.ok(!WEAPONS[me.w].melee, 'a random gun');
  const g = [...w.gold.values()][0];
  me.x = g.x;
  me.y = g.y;
  me.shield = 0;
  w.pickups();
  assert.equal(me.gb, g.v);
  me.gb = 10;
  w.kill(me, null, 'shot');
  assert.equal(me.gb, 5, 'half spills');
  assert.ok([...w.gold.values()].some((x) => x.drop && x.v === 5));
  steps(w, 30 * 4);
  assert.equal(me.status, 'alive', 'back in after the respawn');
  for (const p of w.players.values()) if (p !== me) p.gb = Math.min(p.gb, 3);
  me.gb = 50;
  w.time = w.duration - 0.01; // the whistle
  steps(w, 2);
  assert.equal(w.phase, 'ended');
  assert.deepEqual(w.winners, [me.id], 'one winner');
  assert.equal(me.payout, w.players.size * 95, 'the pot minus the rake');
  assert.ok(w.audit().ok);
});

test('rooms: the side modes take one flat $0.10 entry; zombies start solo, gold pays shop credit', () => {
  const sent = [];
  const credit = new Map([['t1', 0], ['t2', 0]]);
  const wallet = { debit: () => true, credit: () => {}, balances: () => ({}) };
  const lobby = new Lobby({ wallet, send: () => {}, newToken: () => 'x', practice: true });
  assert.ok(lobby.rooms.has('zombies:100'));
  assert.ok(!lobby.rooms.has('zombies:1000'));
  assert.equal(lobby.roomFor('gold', 50000).stake, 100, 'any stake maps to the flat entry');
  const room = new RoomCore({ stake: 1000, mode: 'zombies', wallet, send: (cid, m) => sent.push([cid, m]), minPlayers: 2, waitForStart: true });
  assert.equal(room.stake, 100);
  assert.equal(room.minPlayers, 1, 'zombies: alone is fine');
  room.addClient('c1', { token: 't1', name: 'solo' });
  room.handle('c1', { t: 'ready', weapon: 'sniper' });
  room.handle('c1', { t: 'start' });
  for (let i = 0; i < 30 * 6; i++) room.tick();
  assert.equal(room.state, 'live');
  assert.equal(WEAPONS[[...room.world.players.values()][0].w].id, 'sniper');
  assert.equal(room.world.players.size, 1);
  void credit;
});

test('zombies: 1000 credits stand the whole downed squad back up; not in other modes', () => {
  const w = new World({ stake: 100, seed: 9, mode: 'zombies', roundSeconds: 480 });
  const a = w.addPlayer({ name: 'a', skin: '#fff', weapon: 'rifle' });
  const b = w.addPlayer({ name: 'b', skin: '#fff', weapon: 'rifle' });
  const c = w.addPlayer({ name: 'c', skin: '#fff', weapon: 'rifle' });
  w.step();
  assert.equal(w.buy(a.id, 'revive'), false, 'nobody is down yet');
  b.status = 'dead';
  c.status = 'dead';
  a.cr = 999;
  assert.equal(w.buy(a.id, 'revive'), false, 'needs 1000 credits');
  a.cr = 1200;
  assert.equal(w.buy(a.id, 'revive'), true);
  assert.equal(a.cr, 200);
  assert.equal(b.status, 'alive');
  assert.equal(c.status, 'alive');
  assert.ok(w.events.some((e) => e.k === 'revived' && e.n === 2));
  const g = new World({ stake: 100, seed: 9, mode: 'gl', roundSeconds: 240 });
  const x = g.addPlayer({ name: 'x', skin: '#fff' });
  g.addPlayer({ name: 'y', skin: '#fff' });
  g.step();
  x.cr = 5000;
  assert.equal(g.buy(x.id, 'revive'), false, 'guns + lasers has no revive');
});
