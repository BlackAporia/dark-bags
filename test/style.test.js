import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLE_ITEMS, STYLE, STYLE_KINDS, STYLE_CASES } from '../shared/style.js';
import { Inventory, BOX, RARITIES } from '../shared/cosmetics.js';
import { CALENDAR } from '../shared/daily.js';

test('the style catalog: four kinds, unique ids, every rarity has items, cases are in the shop', () => {
  assert.equal(new Set(STYLE_ITEMS.map((x) => x.id)).size, STYLE_ITEMS.length);
  for (const k of STYLE_KINDS) assert.ok(STYLE_ITEMS.filter((x) => x.kind === k).length >= 10, k);
  for (const x of STYLE_ITEMS) assert.ok(RARITIES[x.rarity] && x.c.length === 2, x.id);
  for (const c of STYLE_CASES) assert.equal(BOX[c.id].family, 'style');
  // every style gift in the calendar exists
  for (const day of CALENDAR) for (const g of day) if (g.k === 'style') assert.ok(STYLE[g.id], g.id);
});

test('style: open a case, own it, wear it; the look carries it; you cannot wear what you lack', () => {
  const inv = new Inventory({ rnd: () => 0.5 });
  const r = inv.open('a', 's-street', () => true, 3);
  assert.ok(r.ok);
  for (const x of r.results) assert.equal(x.kind, 'style');
  const owned = inv.view('a').sowned;
  assert.ok(owned.length >= 1);
  const it = STYLE[owned[0]];
  assert.ok(inv.equipStyle('a', it.kind, it.id).ok);
  const look = inv.look('a');
  assert.equal(look[{ frame: 'fr', banner: 'bn', killfx: 'kf', namefx: 'nf' }[it.kind]], it.id);
  const other = STYLE_ITEMS.find((x) => x.kind === it.kind && !owned.includes(x.id));
  assert.equal(inv.equipStyle('a', it.kind, other.id).ok, false);
  assert.equal(inv.equipStyle('a', 'frame', 'n-mint').ok, false); // a name is not a frame
  assert.ok(inv.equipStyle('a', it.kind, null).ok);
  assert.equal(Object.keys(inv.look('a')).some((k) => ['fr', 'bn', 'kf', 'nf'].includes(k)), false);
});

test('style gifts: given once, a duplicate refunds shop $', () => {
  const inv = new Inventory();
  inv.give('a', { k: 'style', id: 'f-gold' });
  assert.deepEqual(inv.view('a').sowned, ['f-gold']);
  const c = inv.view('a').credit;
  inv.give('a', { k: 'style', id: 'f-gold' });
  assert.equal(inv.view('a').credit, c + RARITIES.legendary.refund);
  inv.give('a', { k: 'style', id: 'nope' });
  assert.deepEqual(inv.view('a').sowned, ['f-gold']);
});
