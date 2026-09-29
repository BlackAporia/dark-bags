import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { World } from '../shared/world.js';
import { stepMovement, sanitizeInput } from '../shared/movement.js';
import { NavGrid } from '../shared/nav.js';
import { hasLOS } from '../shared/geom.js';

const DT = 1 / CFG.TICK_RATE;

function humanWorld(opts = {}) {
  return new World({ stake: 1000, seed: 42, bots: false, ...opts });
}

// Put sats in a bag for a test scenario, booked as sponsor money so the audit still balances.
function setBag(w, p, amount) {
  w.ledger.sponsorIn += amount - p.bag;
  p.bag = amount;
}

test('sats are conserved through full bot raids, rollover and golden raids', () => {
  let rollover = 0;
  for (let r = 1; r <= 4; r++) {
    const w = new World({ stake: 1000, seed: 700 + r, roundNo: r, rolloverIn: rollover, golden: r === 4 });
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
    for (const v of Object.values(w.ledger)) assert.ok(Number.isInteger(v), 'ledger stays in whole sats');
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
  assert.deepEqual(Object.keys(snap.players[0]).sort(), ['a', 'b', 'c', 'd', 'e', 'fc', 'h', 'i', 'n', 'pr', 's', 'w', 'x', 'y'].sort());
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

test('entry closes at JOIN_CUTOFF and the raid seals at 0:00', () => {
  const w = humanWorld({ roundSeconds: CFG.JOIN_CUTOFF + 2 });
  const p = w.addPlayer({ name: 'a', skin: '#fff' });
  setBag(w, p, 500);
  p.hp = 1e9; // idle runner: survive the storm so the seal is what gets them
  for (let i = 0; i < 3 * CFG.TICK_RATE; i++) w.step();
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
