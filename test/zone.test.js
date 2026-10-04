import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { World } from '../shared/world.js';
import { planZone, zoneAt, exitState } from '../shared/zone.js';
import { generateMap } from '../shared/map.js';
import { mulberry32 } from '../shared/geom.js';

const inside = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) + a.r <= b.r + 1e-6; // a inside b

test('storm circles nest and collapse onto the last exit, for many maps', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const map = generateMap(seed);
    const plan = planZone(map, mulberry32(seed), 180);
    const { circles } = plan;
    for (let i = 1; i < circles.length; i++) assert.ok(inside(circles[i], circles[i - 1]), `seed ${seed}: circle ${i} escapes ${i - 1}`);
    const fin = map.extracts.find((e) => e.id === plan.finalExit);
    assert.ok(Math.hypot(circles.at(-1).x - fin.x, circles.at(-1).y - fin.y) < 1, 'final circle sits on the last exit');
    // the zone only ever shrinks, and the last exit never closes
    let prev = zoneAt(plan, 0);
    for (let t = 0.5; t <= 180; t += 0.5) {
      const z = zoneAt(plan, t);
      assert.ok(inside(z, prev), `seed ${seed}: zone grew at t=${t}`);
      assert.equal(exitState(plan, z, fin), 'last');
      prev = z;
    }
  }
});

test('exits close once the storm swallows them and never reopen', () => {
  const map = generateMap(7);
  const plan = planZone(map, mulberry32(7), 180);
  for (const e of map.extracts) {
    let closed = false;
    for (let t = 0; t <= 180; t += 1) {
      const s = exitState(plan, zoneAt(plan, t), e);
      if (closed) assert.equal(s, 'closed', `exit ${e.id} reopened at ${t}`);
      if (s === 'closed') closed = true;
    }
    if (e.id !== plan.finalExit) assert.ok(closed, `exit ${e.id} should be closed by the end`);
  }
});

test('the storm kills runners caught outside, and their bag drops', () => {
  const w = new World({ stake: 1000, seed: 11, bots: false });
  const p = w.addPlayer({ name: 'greedy', skin: '#fff' });
  // step to the final circle, then park the runner far outside it
  while (w.time < w.zonePlan.times.at(-1)[1] && p.status === 'alive') {
    const far = w.zone;
    const a = Math.atan2(p.y - far.x, p.x - far.x);
    Object.assign(p, { x: Math.min(w.map.w - 30, Math.max(30, far.x + Math.cos(a) * (far.r + 300))), y: Math.min(w.map.h - 30, Math.max(30, far.y + Math.sin(a) * (far.r + 300))), shield: 0 });
    w.step();
  }
  assert.equal(p.status, 'dead');
  assert.equal(p.cause, 'storm');
  assert.equal(p.killer, null);
  assert.ok([...w.drops.values()].some((d) => d.v === p.lostBag));
  assert.ok(w.audit().ok);
});

test('the one exit is in the middle and the storm closes onto it', () => {
  const w = new World({ stake: 1000, seed: 5, bots: false });
  assert.equal(w.map.extracts.length, 1);
  const e = w.map.extracts[0];
  assert.equal(e.x, w.map.w / 2);
  assert.equal(e.y, w.map.h / 2);
  assert.equal(w.zonePlan.finalExit, e.id);
  w.time = w.zonePlan.times.at(-1)[1] - 1;
  w.updateZone();
  assert.equal(w.exitStates[e.id], 'last');
});

test('new loot lands inside the circle the storm is heading to', () => {
  const w = new World({ stake: 1000, seed: 21 });
  let checked = 0;
  while (w.phase === 'live') {
    const before = new Set(w.orbs.keys());
    w.step();
    w.events.length = 0;
    if (w.tick < 2) continue;
    for (const [id, o] of w.orbs) {
      if (before.has(id)) continue;
      const c = w.zone.next;
      assert.ok(Math.hypot(o.x - c.x, o.y - c.y) <= c.r, `orb spawned outside the next circle at t=${w.time.toFixed(1)}`);
      checked++;
    }
  }
  assert.ok(checked > 20);
});
