import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Inventory, PASS_STEP, PASS_TIERS, PASS_PRICE, passRewards, seasonAt, seasonItems, boxCatalog, BOXES, OUTFIT, WSKIN, TURRET_SKIN, BOX } from '../shared/cosmetics.js';
import { seasonInfo } from '../shared/season.js';

const OCT = Date.UTC(2026, 9, 10);

test('seasons are calendar months, each with its own theme and items', () => {
  const a = seasonAt(OCT);
  const b = seasonAt(Date.UTC(2026, 10, 2));
  assert.equal(a.id, '2026-10');
  assert.equal(b.id, '2026-11');
  assert.equal(a.n + 1, b.n);
  assert.notEqual(a.theme.name, b.theme.name);
  assert.equal(seasonInfo('2026-10').end, Date.UTC(2026, 10, 1));
  const s = seasonItems(a.id);
  assert.ok(OUTFIT[s.apex].armor && OUTFIT[s.apex].season === a.id);
  assert.ok(TURRET_SKIN[s.overwatch]);
});

test('seasonal items never drop from a box', () => {
  for (const b of BOXES) for (const i of boxCatalog(b)) assert.ok(!i.season, `${b.id} has ${i.id}`);
});

test('every pass reward points at something real', () => {
  const R = passRewards('2026-10');
  assert.equal(Object.keys(R.p).length, PASS_TIERS);
  for (const rw of [...Object.values(R.f), ...Object.values(R.p)]) {
    if (rw.k === 'box') assert.ok(BOX[rw.id], rw.id);
    if (rw.k === 'outfit') assert.ok(OUTFIT[rw.id], rw.id);
    if (rw.k === 'wskin') assert.ok(WSKIN[rw.id], rw.id);
    if (rw.k === 'turret') assert.ok(TURRET_SKIN[rw.id], rw.id);
  }
});

test('the pass: XP fills tiers; free claims at once, premium after buying; no double claims; a new season resets', () => {
  let now = OCT;
  const inv = new Inventory({ now: () => now, rnd: () => 0.5 });
  const up = inv.passXp('p', PASS_STEP * 25 + 10);
  assert.equal(up.after, 25);
  assert.ok(inv.passClaim('p', 'f', 25).ok);
  assert.ok(inv.view('p').wowned.includes(`rifle.${seasonItems('2026-10').edge}`));
  assert.equal(inv.passClaim('p', 'f', 25).ok, false, 'once');
  assert.equal(inv.passClaim('p', 'f', 30).ok, false, 'not reached');
  assert.equal(inv.passClaim('p', 'p', 25).ok, false, 'premium is bought first');
  assert.equal(inv.passBuy('p', () => false).ok, false, 'cannot afford');
  inv.rec('p').credit = PASS_PRICE;
  assert.ok(inv.passBuy('p', null).ok);
  assert.equal(inv.rec('p').credit, 0);
  assert.ok(inv.passClaim('p', 'p', 25).ok);
  assert.ok(inv.view('p').owned.includes(seasonItems('2026-10').warlord));
  assert.ok(inv.passClaim('p', 'p', 5).ok);
  assert.ok(inv.equipTurret('p', seasonItems('2026-10').sentry).ok);
  assert.equal(inv.look('p').ts, seasonItems('2026-10').sentry, 'others see your turret skin');
  assert.ok(inv.equip('p', seasonItems('2026-10').warlord).ok, 'armour can be worn');
  now = Date.UTC(2026, 10, 3);
  const v = inv.view('p').pass;
  assert.equal(v.sid, '2026-11');
  assert.equal(v.xp, 0);
  assert.equal(v.premium, false);
  assert.ok(inv.view('p').owned.includes(seasonItems('2026-10').warlord), 'last season\'s armour is kept');
});
