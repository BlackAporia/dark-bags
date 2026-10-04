import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, MAP_THEMES, pickTheme, solids, pointFree } from '../shared/map.js';
import { World } from '../shared/world.js';
import { CFG } from '../shared/config.js';
import { circleHitsRect, rectsOverlap } from '../shared/geom.js';

// every free spot on the floor connects to every other (flood fill on a fine grid)
function pockets(map) {
  const cell = 20;
  const cols = Math.ceil(map.w / cell);
  const rows = Math.ceil(map.h / cell);
  const r = CFG.PLAYER_R + 2;
  const free = new Uint8Array(cols * rows);
  const solid = solids(map);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * cell;
      const y = (j + 0.5) * cell;
      if (x < r || y < r || x > map.w - r || y > map.h - r) continue;
      free[j * cols + i] = solid.some((w) => circleHitsRect(x, y, r, w)) ? 0 : 1;
    }
  const seen = new Uint8Array(free.length);
  const sizes = [];
  for (let s = 0; s < free.length; s++) {
    if (!free[s] || seen[s]) continue;
    let n = 0;
    const q = [s];
    seen[s] = 1;
    while (q.length) {
      const c = q.pop();
      n++;
      const ci = c % cols;
      for (const k of [c + 1, c - 1, c + cols, c - cols]) {
        if (k < 0 || k >= free.length || !free[k] || seen[k]) continue;
        if ((k === c + 1 && ci === cols - 1) || (k === c - 1 && ci === 0)) continue;
        seen[k] = 1;
        q.push(k);
      }
    }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}

test('every map theme is seeded: same seed and theme, same map', () => {
  for (const t of MAP_THEMES) assert.deepEqual(generateMap(99, t), generateMap(99, t), t);
  assert.notDeepEqual(generateMap(99, 'lava').walls, generateMap(99, 'snow').walls);
});

test('every map theme keeps the raid: two vaults with doors, one exit in the middle, no stray pockets', () => {
  for (const t of MAP_THEMES)
    for (let seed = 1; seed <= 12; seed++) {
      const m = generateMap(seed * 7717, t);
      assert.equal(m.theme, t);
      assert.equal(m.extracts.length, 1, `${t} ${seed}`);
      assert.equal(m.vaults.length, 2, `${t} ${seed}`);
      for (const v of m.vaults) assert.ok(v.doors.length >= 2);
      // exits are open ground
      for (const e of m.extracts) assert.ok(pointFree(m, e.x, e.y, CFG.PLAYER_R), `${t} ${seed} exit`);
      // no cover inside a vault
      for (const w of [...m.walls, ...(m.pits ?? [])]) if (w.k) for (const v of m.vaults) assert.ok(!rectsOverlap(v, w, 0), `${t} ${seed} cover in a vault`);
      // one floor: anything else is a sliver too small to stand in for long
      const p = pockets(m);
      assert.ok(p.slice(1).every((n) => n <= 3), `${t} ${seed}: pockets ${p.slice(0, 4)}`);
    }
});

test('pits stop runners but not bullets', () => {
  const m = generateMap(5, 'lava');
  assert.ok(m.pits.length > 0);
  const r = m.pits[0];
  assert.ok(!pointFree(m, r.x + r.w / 2, r.y + r.h / 2, 4));
  assert.ok(!m.walls.includes(r));
  // the pits travel with the map, the merged list does not
  const wire = JSON.parse(JSON.stringify(m));
  assert.equal(wire._solid, undefined);
  assert.equal(solids(wire).length, m.walls.length + m.pits.length);
});

test('the map vote: most votes wins, ties by lot, no votes is any map', () => {
  assert.equal(pickTheme(['lava', 'snow', 'lava', null]), 'lava');
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(pickTheme(['lava', 'snow']));
  assert.deepEqual([...seen].sort(), ['lava', 'snow']);
  assert.ok(MAP_THEMES.includes(pickTheme([])));
  assert.ok(MAP_THEMES.includes(pickTheme([null, 'nope'])));
});

test('a raid runs on every theme with bots', () => {
  for (const t of MAP_THEMES) {
    const w = new World({ stake: 1000, seed: 321, theme: t, practice: true, roundSeconds: 60 });
    assert.equal(w.map.theme, t);
    w.addPlayer({ name: 'me' });
    for (let i = 0; i < 20 * 20; i++) w.step();
  }
});
