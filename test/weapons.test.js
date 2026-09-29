import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { World } from '../shared/world.js';
import { WEAPONS, XP_PER_LEVEL } from '../shared/weapons.js';

function duel(opts = {}) {
  const w = new World({ stake: 1000, seed: 3, bots: false, ...opts });
  const a = w.addPlayer({ name: 'a', skin: '#fff' });
  const b = w.addPlayer({ name: 'b', skin: '#fff' });
  w.map.walls = [];
  Object.assign(a, { x: 1000, y: 1000, shield: 0 });
  Object.assign(b, { x: 1050, y: 1000, shield: 0 });
  let s = 0;
  const swing = (aim = 0) => {
    w.queueInput(a.id, { s: ++s, mx: 0, my: 0, a: aim, f: true, d: false });
    w.queueInput(b.id, { s, mx: 0, my: 0, a: Math.PI, f: false, d: false });
    w.step();
  };
  return { w, a, b, swing };
}

test('everyone enters equal: knife and full health', () => {
  const w = new World({ stake: 1000, seed: 1 });
  w.step();
  assert.ok(w.players.size >= CFG.BOT_FILL);
  for (const p of w.players.values()) {
    assert.equal(WEAPONS[p.w].id, 'knife');
    assert.equal(p.hp, CFG.HP);
  }
});

test('the knife kills in two slashes and a kill levels you up to the pistol', () => {
  const { a, b, swing } = duel();
  for (let i = 0; i < 60 && b.status === 'alive'; i++) swing();
  assert.equal(b.status, 'dead');
  assert.equal(a.kills, 1);
  assert.equal(WEAPONS[a.w].id, 'pistol');
});

test('the knife only cuts what is in front of you and not through walls', () => {
  const { w, b, swing } = duel();
  for (let i = 0; i < 20; i++) swing(Math.PI); // facing away
  assert.equal(b.hp, CFG.HP);
  w.map.walls = [{ x: 1020, y: 950, w: 10, h: 100 }];
  for (let i = 0; i < 20; i++) swing(0);
  assert.equal(b.hp, CFG.HP);
});

test('the shotgun fires a spread of pellets', () => {
  const { w, a, swing } = duel();
  a.w = WEAPONS.findIndex((x) => x.id === 'shotgun');
  swing(Math.PI / 2);
  assert.equal(w.bullets.size, WEAPONS[a.w].pellets);
});

test('the ladder wraps from the laser sniper back to the knife with a prestige', () => {
  const { w, a } = duel();
  a.w = WEAPONS.length - 1;
  w.addXp(a, XP_PER_LEVEL);
  assert.equal(a.w, 0);
  assert.equal(a.prestige, 1);
  assert.ok(w.events.some((e) => e.k === 'arsenal' && e.pid === a.id));
});

test('loot and damage also earn experience', () => {
  const { w, a, b, swing } = duel();
  swing();
  assert.ok(a.xp > 0 && a.xp < XP_PER_LEVEL, 'damage gives a little xp');
  const before = a.xp;
  const o = { id: 9999, x: a.x, y: a.y, v: 10, t: 2 };
  w.orbs.set(o.id, o);
  w.lootPool -= 0; // bookkeeping irrelevant here
  w.ledger.sponsorIn += 10;
  w.pickups();
  assert.ok(a.xp > before);
  assert.equal(b.status, 'alive');
});

test('first blood goes to everyone; chained kills climb the multi-kill ladder', () => {
  const w = new World({ stake: 1000, seed: 8, bots: false });
  const k = w.addPlayer({ name: 'killer', skin: '#fff' });
  const vs = [1, 2, 3, 4, 5, 6].map((i) => w.addPlayer({ name: `v${i}`, skin: '#fff' }));
  w.step();
  const tiers = [];
  for (const v of vs) {
    w.events.length = 0;
    w.kill(v, k);
    for (const e of w.events) if (e.k === 'streak') tiers.push([e.tier, e.to ? 'me' : 'all']);
    w.time += 1; // well inside the multi-kill window
  }
  assert.deepEqual(tiers, [[1, 'all'], [2, 'me'], [3, 'me'], [4, 'me'], [5, 'me'], [5, 'me']]);
});

test('bots climb slower on each other and leave each other alone early on', () => {
  const w = new World({ stake: 1000, seed: 9, bots: false });
  const b1 = w.addPlayer({ name: 'b1', skin: '#fff', isBot: true });
  const b2 = w.addPlayer({ name: 'b2', skin: '#fff', isBot: true });
  const h = w.addPlayer({ name: 'human', skin: '#fff' });
  w.step();
  w.kill(b2, b1);
  assert.equal(b1.w, 0, 'one bot kill is not a weapon');
  assert.ok(b1.xp > 0 && b1.xp < XP_PER_LEVEL);
  w.kill(h, b1);
  assert.equal(b1.w, 1, 'killing a human is');
});
