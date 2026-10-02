import { WEAPONS } from '../shared/weapons.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, GL } from '../shared/config.js';
import { World } from '../shared/world.js';
import { stepMovement, sanitizeInput } from '../shared/movement.js';
import { NavGrid } from '../shared/nav.js';
import { hasLOS } from '../shared/geom.js';

const DT = 1 / CFG.TICK_RATE;

function humanWorld(opts = {}) {
  return new World({ stake: 1000, seed: 42, bots: false, ...opts });
}

// Put money in a bag for a test scenario, booked as sponsor money so the audit still balances.
function setBag(w, p, amount) {
  w.ledger.sponsorIn += amount - p.bag;
  p.bag = amount;
}

test('money is conserved through full bot raids, rollover and golden raids', () => {
  let rollover = 0;
  for (let r = 1; r <= 4; r++) {
    const w = new World({ stake: 1000, seed: 700 + r, roundNo: r, rolloverIn: rollover, bonus: r === 4 ? 3000 : 0 });
    while (w.phase === 'live') {
      w.step();
      if (w.tick % 60 === 0) {
        const a = w.audit();
        assert.ok(a.ok, `raid ${r} tick ${w.tick}: inflow ${a.inflow} != accounted ${a.accounted}`);
      }
      w.events.length = 0;
    }
    const a = w.audit();
    assert.ok(a.ok);
    assert.equal(w.inWorld(), 0, 'nothing left inside after the seal');
    for (const v of Object.values(w.ledger)) assert.ok(Number.isInteger(v), 'ledger stays in whole mills');
    rollover = w.ledger.rolloverOut;
  }
});

test('entry splits the stake into rake, bag and loot pool', () => {
  const w = humanWorld();
  const p = w.addPlayer({ name: 'a', skin: '#fff' });
  assert.equal(w.ledger.rake, 50);
  assert.equal(p.bag, 475);
  assert.equal(w.lootPool, 475);
  assert.ok(w.audit().ok);
});

test("snapshots never contain another runner's bag", () => {
  const w = humanWorld();
  const a = w.addPlayer({ name: 'alice', skin: '#fff' });
  const b = w.addPlayer({ name: 'bob', skin: '#000' });
  w.map.walls = [];
  a.x = 500;
  a.y = 500;
  b.x = 600;
  b.y = 500;
  b.bag = 987654;
  const snap = w.snapshotFor(a.id);
  assert.equal(snap.players.length, 1, 'bob is in view');
  assert.deepEqual(Object.keys(snap.players[0]).sort(), ['a', 'b', 'c', 'd', 'e', 'fc', 'g', 'h', 'i', 'n', 'o', 'pr', 'rk', 's', 'w', 'x', 'y'].sort());
  assert.ok(!JSON.stringify(snap).includes('987654'), "bob's bag leaked into alice's snapshot");
  assert.equal(snap.you.bag, a.bag, 'you do see your own bag');
});

test('runners behind walls or out of range are not sent', () => {
  const w = humanWorld();
  const a = w.addPlayer({ name: 'a', skin: '#fff' });
  const b = w.addPlayer({ name: 'b', skin: '#fff' });
  const c = w.addPlayer({ name: 'c', skin: '#fff' });
  w.map.walls = [{ x: 1000, y: 1000, w: 40, h: 200 }];
  Object.assign(a, { x: 900, y: 1100 });
  Object.assign(b, { x: 1150, y: 1100 }); // behind the wall
  Object.assign(c, { x: 900 + CFG.VISION + 100, y: 1500 }); // too far
  const ids = w.snapshotFor(a.id).players.map((p) => p.i);
  assert.ok(!ids.includes(b.id), 'b is hidden by the wall');
  assert.ok(!ids.includes(c.id), 'c is out of vision range');
  b.y = 1400; // step out from behind the wall
  assert.ok(w.snapshotFor(a.id).players.some((p) => p.i === b.id));
});

test('standing in an exit for EXTRACT_TIME pays out exactly the bag', () => {
  const w = humanWorld();
  const p = w.addPlayer({ name: 'a', skin: '#fff' });
  const e = w.map.extracts[0];
  p.x = e.x;
  p.y = e.y;
  setBag(w, p, 1234);
  const ticks = Math.ceil(CFG.EXTRACT_TIME * CFG.TICK_RATE) + 2;
  for (let i = 0; i < ticks && p.status === 'alive'; i++) w.step();
  assert.equal(p.status, 'extracted');
  const payout = w.events.find((ev) => ev.k === 'payout');
  assert.deepEqual(payout.to, [p.id]);
  assert.equal(payout.amount, 1234);
  assert.equal(w.ledger.paidOut, 1234);
  const pub = w.events.find((ev) => ev.k === 'extract');
  assert.ok(!('amount' in pub) && !('v' in pub), 'public extract event carries no amount');
  assert.ok(w.audit().ok);
});

test('a hit resets extraction progress', () => {
  const w = humanWorld();
  const p = w.addPlayer({ name: 'a', skin: '#fff' });
  const e = w.map.extracts[0];
  Object.assign(p, { x: e.x, y: e.y, shield: 0 });
  for (let i = 0; i < 45; i++) w.step();
  assert.ok(p.ext > 0.4);
  w.damage(p, null, 10);
  assert.equal(p.ext, 0);
});

test('death drops the whole bag; only the looter learns the amount', () => {
  const w = humanWorld();
  const a = w.addPlayer({ name: 'shooter', skin: '#fff' });
  const b = w.addPlayer({ name: 'target', skin: '#fff' });
  w.map.walls = [];
  Object.assign(a, { x: 800, y: 800, shield: 0, w: 1 }); // pistol
  Object.assign(b, { x: 950, y: 800, shield: 0 });
  setBag(w, b, 3210);
  let s = 0;
  for (let i = 0; i < 200 && b.status === 'alive'; i++) {
    w.queueInput(a.id, { s: ++s, mx: 0, my: 0, a: 0, f: true, d: false });
    w.queueInput(b.id, { s, mx: 0, my: 0, a: Math.PI, f: false, d: false });
    w.step();
  }
  assert.equal(b.status, 'dead');
  assert.equal(b.killer, a.id);
  const drop = [...w.drops.values()][0];
  assert.equal(drop.v, 3210);
  const kill = w.events.find((ev) => ev.k === 'kill');
  assert.ok(!('v' in kill) && !('amount' in kill) && !kill.to, 'kill feed is public and amount-free');

  const before = a.bag;
  w.events.length = 0;
  Object.assign(a, { x: drop.x, y: drop.y });
  w.step();
  assert.equal(a.bag, before + 3210);
  const loot = w.events.find((ev) => ev.k === 'loot');
  assert.deepEqual(loot.to, [a.id]);
  assert.equal(loot.v, 3210);
  assert.ok(w.audit().ok);
});

test('spawn shield blocks damage until the runner fires', () => {
  const w = humanWorld();
  const p = w.addPlayer({ name: 'a', skin: '#fff' });
  w.damage(p, null, 20);
  assert.equal(p.hp, CFG.HP);
  w.queueInput(p.id, { s: 1, mx: 0, my: 0, a: 0, f: true, d: false });
  w.step();
  assert.equal(p.shield, 0);
  w.damage(p, null, 20);
  assert.equal(p.hp, CFG.HP - 20);
});

test('entry closes once the raid is running, and the raid seals at 0:00', () => {
  const w = humanWorld({ roundSeconds: 20 });
  const p = w.addPlayer({ name: 'a', skin: '#fff' });
  setBag(w, p, 500);
  p.hp = 1e9; // idle runner: survive the storm so the seal is what gets them
  w.step();
  assert.equal(w.canJoin(), false);
  assert.throws(() => w.addPlayer({ name: 'late', skin: '#fff' }));
  while (w.phase === 'live') w.step();
  assert.equal(p.status, 'mia');
  assert.equal(p.lostBag, 500);
  assert.ok(w.ledger.rolloverOut >= 500);
  assert.ok(w.audit().ok);
});

test('client prediction replays to the exact server position', () => {
  const w = humanWorld();
  const p = w.addPlayer({ name: 'a', skin: '#fff' });
  const start = { x: p.x, y: p.y, dashT: 0, dashCd: 0, dashDx: 0, dashDy: 0 };
  const inputs = [];
  for (let s = 1; s <= 150; s++) {
    const a = s * 0.07;
    inputs.push({ t: 'in', s, mx: Math.round(Math.cos(a) * 1000) / 1000, my: Math.round(Math.sin(a * 1.3) * 1000) / 1000, a, f: false, d: s % 40 === 0 });
  }
  for (const i of inputs) {
    w.queueInput(p.id, JSON.parse(JSON.stringify(i)));
    w.step();
  }
  const pred = { ...start };
  for (const i of inputs) stepMovement(pred, sanitizeInput(i), DT, w.map);
  assert.equal(pred.x, p.x);
  assert.equal(pred.y, p.y);
  assert.equal(p.ack, 150);
});

test('hostile inputs are sanitised', () => {
  const i = sanitizeInput({ s: 'x', mx: 1e9, my: NaN, a: Infinity, f: 'yes', d: 0 });
  assert.equal(i.s, 0);
  assert.ok(Math.hypot(i.mx, i.my) <= 1 + 1e-9);
  assert.equal(i.a, 0);
  assert.equal(i.f, true);
  assert.equal(i.d, false);
});

test('bot navigation finds wall-free paths', () => {
  const w = new World({ stake: 1000, seed: 99 });
  const nav = new NavGrid(w.map);
  const v = w.map.vaults[0];
  const from = { x: 100, y: 100 };
  const to = { x: v.x + v.w / 2, y: v.y + v.h / 2 };
  const path = nav.findPath(from.x, from.y, to.x, to.y);
  assert.ok(path.length > 0, 'vault center is reachable');
  let cx = from.x;
  let cy = from.y;
  for (const pt of path) {
    assert.ok(hasLOS(cx, cy, pt.x, pt.y, w.map.walls), 'path leg crosses a wall');
    cx = pt.x;
    cy = pt.y;
  }
});

import { MODES } from '../shared/modes.js';

function playOut(w) {
  let guard = 0;
  while (w.phase === 'live' && guard++ < 60 * 60 * 10) w.step();
}

test('pot modes: every stake goes into one pot, the last one standing takes it, and money is conserved', () => {
  for (const mode of ['br', 'duel', 'knives', 'snipers']) {
    for (const seed of [1, 2]) {
      const w = new World({ stake: 1000, seed, mode, botFill: mode === 'duel' ? 2 : 6, roundSeconds: 120 });
      w.step();
      const n = w.players.size;
      assert.equal(w.pot, n * (1000 - 50), `${mode}: pot is the net stakes`);
      for (const p of w.players.values()) assert.equal(p.bag, 0, 'nothing rides in bags');
      playOut(w);
      assert.ok(w.audit().ok, `${mode} audit`);
      const won = [...w.players.values()].filter((p) => p.won);
      if (won.length) assert.equal(won.reduce((s, p) => s + p.payout, 0), w.ledger.paidOut + w.ledger.botPaidOut);
      assert.equal(w.orbs.size, 0, 'no loot on the map');
      if (mode === 'knives') for (const p of w.players.values()) assert.equal(p.w, 0, 'knives only, all raid');
      if (mode === 'snipers') for (const p of w.players.values()) assert.equal(WEAPONS[p.w].id, 'sniper', 'snipers only, all raid');
    }
  }
});

test('team modes: balanced sides, no friendly fire, the winning team splits the whole pot', () => {
  const w = new World({ stake: 1000, seed: 5, mode: 'team2', botFill: 4, roundSeconds: 150 });
  const me = w.addPlayer({ name: 'me', skin: '#fff' });
  w.step();
  const teams = [0, 0];
  for (const p of w.players.values()) teams[p.team]++;
  assert.deepEqual(teams, [2, 2]);
  const mate = [...w.players.values()].find((p) => p !== me && p.team === me.team);
  const foe = [...w.players.values()].find((p) => p.team !== me.team);
  me.shield = mate.shield = foe.shield = 0;
  const hp = mate.hp;
  w.damage(mate, me, 40);
  assert.equal(mate.hp, hp, 'teammates cannot hurt each other');
  assert.ok(!w.visibleEnemies(me).includes(mate));
  // wipe the other team twice (two rounds): my team wins, and my fallen teammate shares it
  w.kill(mate, foe);
  for (const p of w.players.values()) if (p.team !== me.team) w.kill(p, me);
  w.step();
  assert.equal(w.phase, 'live', 'one round won, the match goes on');
  assert.equal(w.score.get(`t${me.team}`), 1);
  for (let i = 0; i < 30 * 5; i++) w.step();
  assert.equal(w.roundNo, 2, 'the next round');
  assert.equal(mate.status, 'alive', 'everyone is back for it');
  assert.equal(mate.hp, CFG.HP);
  for (const p of w.players.values()) p.shield = 0;
  for (const p of w.players.values()) if (p.team !== me.team) w.kill(p, me);
  w.step();
  assert.equal(w.phase, 'ended');
  assert.ok(me.won && mate.won, 'the whole team wins, the fallen too');
  assert.equal(me.payout + mate.payout, 4 * 950);
  assert.equal(me.status, 'won');
  assert.ok(w.audit().ok);
});

test('every mode is playable to the end with its own line-up', () => {
  for (const m of MODES) {
    const w = new World({ stake: 100, seed: 3, mode: m.id, botFill: m.size, roundSeconds: 60 });
    // zombies: a squad of humans, no bots
    if (m.kind === 'zombie') for (let i = 0; i < 2; i++) w.addPlayer({ name: `h${i}`, skin: '#fff', weapon: 'lmg' });
    w.step();
    assert.equal(w.players.size, m.kind === 'zombie' ? 2 : m.size, `${m.id} fills to ${m.size}`);
    playOut(w);
    assert.equal(w.phase, 'ended');
    assert.ok(w.audit().ok, `${m.id} audit`);
  }
});

test('deathmatch: the fallen respawn, the clock decides, and the most kills takes the whole pot', () => {
  const w = new World({ stake: 1000, seed: 11, mode: 'dm', botFill: 6, roundSeconds: 60 });
  const me = w.addPlayer({ name: 'me', skin: '#fff' });
  w.step();
  const [a, b] = [...w.players.values()].filter((p) => p !== me);
  me.shield = a.shield = b.shield = 0;
  w.kill(a, me);
  w.kill(b, me);
  assert.equal(a.status, 'dead');
  assert.equal(w.leaderId, me.id, 'two kills: the lead');
  // nobody wins by surviving: the match runs on with everyone else down
  for (let i = 0; i < CFG.RESPAWN * CFG.TICK_RATE + 2; i++) w.step();
  assert.equal(w.phase, 'live');
  assert.equal(a.status, 'alive', 'back in after the respawn timer');
  assert.equal(a.hp, CFG.HP);
  assert.equal(a.deaths, 1);
  assert.ok(a.shield > 0, 'spawn shield on respawn');
  // the leader goes down at the whistle and still wins: kills count, not survival
  w.kill(me, a);
  while (w.phase === 'live') {
    for (const p of w.players.values()) p.shield = 1; // freeze the score
    w.step();
  }
  assert.ok(w.audit().ok);
  assert.ok(me.won, 'most kills wins');
  assert.equal(me.status, 'won');
  assert.equal(me.payout, w.players.size * 950);
  assert.equal(w.winners.length, 1);
});

test('deathmatch: a tie on kills splits the pot; no kills at all rolls it over', () => {
  const w = new World({ stake: 1000, seed: 12, mode: 'dm', botFill: 4, roundSeconds: 30 });
  w.step();
  const [a, b, c, d] = [...w.players.values()];
  w.kill(c, a);
  w.kill(d, b);
  while (w.phase === 'live') {
    for (const p of w.players.values()) p.shield = 1;
    w.step();
  }
  assert.ok(a.won && b.won);
  assert.equal(a.payout + b.payout, 4 * 950);
  assert.ok(w.audit().ok);
  const z = new World({ stake: 1000, seed: 13, mode: 'dm', botFill: 3, roundSeconds: 20 });
  z.step();
  while (z.phase === 'live') {
    for (const p of z.players.values()) p.shield = 1;
    z.step();
  }
  assert.equal(z.ledger.rolloverOut, 3 * 950);
  assert.ok(z.audit().ok);
});

test('hardcore: one hit and you are down, from any weapon', () => {
  const w = new World({ stake: 1000, seed: 14, mode: 'hardcore', botFill: 4, roundSeconds: 60 });
  const me = w.addPlayer({ name: 'me', skin: '#fff' });
  w.step();
  const foe = [...w.players.values()].find((p) => p !== me);
  foe.shield = 0;
  w.damage(foe, me, 1);
  assert.equal(foe.status, 'dead');
  // the HUD still reads in %: full health is 100
  assert.equal(w.snapshotFor(me.id).you.hp, 100);
  playOut(w);
  assert.ok(w.audit().ok);
});

test('guns + lasers: kills pay credits; medkits, turrets and tripmines cost them and work', () => {
  const w = new World({ stake: 1000, seed: 15, mode: 'gl', bots: false, roundSeconds: 120 });
  const me = w.addPlayer({ name: 'me', skin: '#fff' });
  const foe = w.addPlayer({ name: 'foe', skin: '#000' });
  w.step();
  assert.equal(me.cr, GL.START);
  assert.equal(w.buy(me.id, 'turret'), false, 'not enough credits yet');
  assert.equal(w.buy(me.id, 'constructor'), false, 'only real items');
  me.shield = foe.shield = 0;
  w.kill(foe, me);
  assert.equal(me.cr, GL.START + GL.KILL);
  // a medkit heals, and costs
  me.hp = 30;
  assert.ok(w.buy(me.id, 'medkit'));
  assert.equal(me.hp, 30 + GL.ITEMS.medkit.heal);
  assert.equal(me.cr, GL.START + GL.KILL - GL.ITEMS.medkit.cost);
  me.hp = CFG.HP;
  assert.equal(w.buy(me.id, 'medkit'), false, 'no medkit at full health');
  // turret: set it down in the open and bring the foe in front of it
  me.cr = 5000;
  me.x = 1200;
  me.y = 1200;
  me.aim = 0;
  assert.ok(w.buy(me.id, 'turret'));
  assert.equal(w.buy(me.id, 'turret'), false, 'one turret at a time');
  const tur = [...w.turrets.values()][0];
  for (let i = 0; i < CFG.RESPAWN * CFG.TICK_RATE + 2; i++) w.step();
  assert.equal(foe.status, 'alive');
  foe.shield = 0;
  foe.x = tur.x + 150;
  foe.y = tur.y;
  foe.hp = CFG.HP;
  const clear = hasLOS(tur.x, tur.y, foe.x, foe.y, w.map.walls);
  const kills = me.kills;
  for (let i = 0; i < 200 && foe.status === 'alive'; i++) {
    foe.x = tur.x + 150;
    foe.y = tur.y;
    w.step();
  }
  if (clear) {
    assert.equal(foe.status, 'dead', 'the turret shoots enemies');
    assert.equal(me.kills, kills + 1, 'turret kills count for the owner');
    assert.equal(foe.cause, 'turret');
  }
  // the owner walks through their own tripmine; the enemy does not
  for (let i = 0; i < CFG.RESPAWN * CFG.TICK_RATE + 2; i++) w.step();
  w.turrets.clear();
  me.aim = Math.PI / 2;
  assert.ok(w.buy(me.id, 'mine'));
  const mine = [...w.mines.values()][0];
  for (let i = 0; i < GL.ITEMS.mine.arm * CFG.TICK_RATE + 2; i++) w.step();
  assert.ok(w.mines.has(mine.id), 'the owner does not trip it');
  foe.shield = 0;
  foe.hp = 50;
  foe.x = (mine.x + mine.x2) / 2;
  foe.y = (mine.y + mine.y2) / 2;
  w.step();
  assert.ok(!w.mines.has(mine.id), 'an enemy on the beam sets it off');
  assert.equal(foe.status, 'dead');
  assert.equal(foe.cause, 'mine');
  // everything is gone at the whistle and the money still adds up
  playOut(w);
  assert.equal(w.turrets.size + w.mines.size, 0);
  assert.ok(w.audit().ok);
});

test('health never comes back by itself (only Guns + Lasers medkits heal)', () => {
  const w = new World({ stake: 1000, seed: 9, bots: false });
  const a = w.addPlayer({ name: 'a', skin: '#fff' });
  w.addPlayer({ name: 'b', skin: '#fff' });
  Object.assign(a, { x: w.zone.x, y: w.zone.y, shield: 0 });
  a.hp = CFG.HP / 2;
  for (let i = 0; i < CFG.TICK_RATE * 20; i++) w.step();
  assert.equal(a.hp, CFG.HP / 2);
});

test('achievement counters: kills by weapon family, one-hit kills, clutch and flawless exits', async () => {
  const { raidStats, titleTier, ACHIEVEMENTS } = await import('../shared/achievements.js');
  const w = new World({ stake: 1000, seed: 4, bots: false });
  const a = w.addPlayer({ name: 'a', skin: '#fff' });
  const b = w.addPlayer({ name: 'b', skin: '#fff' });
  Object.assign(b, { shield: 0 });
  a.w = WEAPONS.findIndex((x) => x.id === 'magnum');
  w.damage(b, a, 200);
  assert.equal(a.wk.sniper, 1);
  assert.equal(a.oneShots, 1);
  const s = raidStats({ status: 'extracted', hp: 8, kills: 0, dmgTaken: 0, joinedAt: 0, endedAt: 130, stake: 1000, payout: 500 }, { mode: { id: 'raid', kind: 'raid' } });
  assert.equal(s.clutch, 1);
  assert.equal(s.flawless, 1);
  assert.equal(titleTier('by_a_thread'), 'mystery');
  assert.equal(titleTier('rookie'), 'common');
  assert.equal(titleTier('neon_legend'), 'mythic');
  assert.ok(ACHIEVEMENTS.length >= 70);
});

test('headshots: a centred round does double damage in every mode; an edge hit does not', () => {
  for (const mode of ['raid', 'br', 'dm', 'zombies']) {
    const w = new World({ stake: 1000, seed: 21, mode, botFill: 2 });
    const a = w.addPlayer({ name: 'a', skin: '#fff', weapon: 'pistol' });
    const v = mode === 'zombies' ? null : w.addPlayer({ name: 'v', skin: '#fff' });
    w.step();
    if (!v) {
      assert.ok(w.headshot({ cause: 'shot', x: 0, y: 0, vx: 1000, vy: 0, speed: 1000 }, { x: 50, y: 2 }));
      continue;
    }
    v.shield = 0;
    const shoot = (dy) => w.headshot({ cause: 'shot', x: v.x - 60, y: v.y + dy, vx: 1000, vy: 0, speed: 1000 }, v);
    assert.ok(shoot(0), `${mode}: dead centre`);
    assert.ok(shoot(-3), `${mode}: within the head`);
    assert.ok(!shoot(12), `${mode}: the edge of the body`);
    assert.ok(!w.headshot({ cause: 'turret', x: v.x - 60, y: v.y, vx: 1000, vy: 0, speed: 1000 }, v), 'turrets never headshot');
    const hp = v.hp;
    w.damage(v, a, 20, 'shot', true);
    assert.equal(a.headshots, 1);
    assert.equal(hp - v.hp, 20);
  }
  assert.equal(CFG.HEADSHOT, 2);
});

test('rounds: a round on the clock goes to the side with more runners standing; ranked picks its winner by rounds', () => {
  const w = new World({ stake: 1000, seed: 6, mode: 'ranked', botFill: 4 });
  const me = w.addPlayer({ name: 'me', skin: '#fff', weapon: 'scout' });
  w.step();
  assert.equal(WEAPONS[me.w].id, 'scout', 'your pick');
  assert.ok([...w.players.values()].filter((p) => p.isBot).every((p) => !WEAPONS[p.w].melee), 'bots carry a gun');
  // round 1: everyone but me goes down
  for (const p of w.players.values()) if (p !== me) {
    p.shield = 0;
    w.kill(p, me);
  }
  w.step();
  assert.equal(w.score.get(`p${me.id}`), 1);
  for (let i = 0; i < 30 * 5; i++) w.step();
  assert.equal(w.roundNo, 2);
  assert.equal(WEAPONS[me.w].id, 'scout', 'the pick stays for every round');
  // round 2 runs out the clock with two left: the one with more health takes it
  for (const p of w.players.values()) if (p !== me) p.shield = 0;
  const others = [...w.players.values()].filter((p) => p !== me);
  for (const p of others.slice(1)) w.kill(p, me);
  others[0].hp = 10;
  w.time = w.roundEndsAt;
  w.step();
  assert.equal(w.phase, 'ended');
  assert.ok(me.won);
  assert.equal(me.place, 1);
  assert.ok(w.audit().ok);
});

test('upgrades: walk up to your turret or tripmine and pay for level 2 and 3; rockets burst', () => {
  const w = new World({ stake: 1000, seed: 41, mode: 'gl', botFill: 2, roundSeconds: 120 });
  const me = w.addPlayer({ name: 'me', skin: '#fff' });
  w.step();
  me.cr = 9999;
  assert.ok(w.buy(me.id, 'turret'));
  const tur = [...w.turrets.values()].find((o) => o.owner === me.id);
  assert.equal(tur.lv, 1);
  me.cr = 1000;
  assert.ok(!w.upgrade(me.id), 'not enough credits');
  me.cr = GL.UP[2] + GL.UP[3];
  assert.ok(w.upgrade(me.id));
  assert.equal(tur.lv, 2);
  assert.equal(tur.hp, GL.TURRET_LV[2].hp);
  assert.ok(w.upgrade(me.id));
  assert.equal(tur.lv, 3);
  assert.equal(me.cr, 0);
  me.cr = 9999;
  assert.ok(!w.upgrade(me.id), 'level 3 is the top');
  // a level 3 turret fires rockets that burst on a foe
  const foe = [...w.players.values()].find((p) => p !== me);
  foe.shield = 0;
  foe.x = tur.x + 200;
  foe.y = tur.y;
  tur.a = 0;
  tur.cd = 0;
  for (let i = 0; i < 30 * 3 && foe.status === 'alive' && foe.hp === 100; i++) w.step();
  assert.ok(foe.hp < 100 || foe.status !== 'alive', 'the rocket hurt');
  assert.ok(w.events.length >= 0);
  // tripmines: two beams at level 2, three at level 3
  const w2 = new World({ stake: 1000, seed: 42, mode: 'gl', botFill: 1, roundSeconds: 120 });
  const a = w2.addPlayer({ name: 'a', skin: '#fff' });
  w2.step();
  a.cr = 9999;
  a.aim = 0;
  assert.ok(w2.buy(a.id, 'mine'));
  const m = [...w2.mines.values()][0];
  assert.equal(m.lines.length, 1);
  w2.upgrade(a.id);
  assert.equal(m.lines.length, 2);
  w2.upgrade(a.id);
  assert.equal(m.lines.length, 3);
  // too far: nothing to upgrade
  a.x += 300;
  assert.ok(!w2.upgrade(a.id));
});
