import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { World } from '../shared/world.js';
import { bandOf, bandMax, validStake } from '../shared/stakes.js';

test('stake bands: each tier opens a range', () => {
  assert.equal(bandOf(100), 100);
  assert.equal(bandOf(990), 100);
  assert.equal(bandOf(1000), 1000);
  assert.equal(bandOf(9990), 1000);
  assert.equal(bandOf(5_000_000), 100000);
  assert.equal(bandMax(100), 990);
  assert.equal(bandMax(100000), 10_000_000);
  assert.ok(validStake(2500) && !validStake(2505) && !validStake(50));
});

// a duel between two runners with stakes of their own; `winner` takes it
function duel(stakeA, stakeB, winner) {
  const w = new World({ stake: 1000, seed: 3, bots: false, mode: 'duel' });
  const a = w.addPlayer({ name: 'a', skin: '#fff', stake: stakeA });
  const b = w.addPlayer({ name: 'b', skin: '#fff', stake: stakeB });
  const pot = w.pot;
  w.payPot([winner === 'a' ? a : b]);
  assert.ok(w.audit().ok, 'every unit accounted for');
  return { a, b, pot };
}

test('side pots: equal stakes, the winner takes the whole pot', () => {
  const { a, b, pot } = duel(1000, 1000, 'a');
  assert.equal(a.payout, pot);
  assert.ok(!b.payout);
});

test('side pots: a small stake cannot win more than it risked; the rest goes back', () => {
  const { a, b, pot } = duel(9000, 1000, 'b');
  assert.equal(b.payout, b.potIn * 2, 'the small stake wins its match from the big one');
  assert.equal(a.refund, a.potIn - b.potIn, 'the unmatched part comes back');
  assert.equal(a.payout + b.payout, pot);
});

test('side pots: the big stake wins everything on the table', () => {
  const { a, b, pot } = duel(9000, 1000, 'a');
  assert.equal(a.payout, pot);
  assert.ok(!b.payout);
});

test("a raid bag is the runner's own stake share", () => {
  const w = new World({ stake: 1000, seed: 4, bots: false });
  const a = w.addPlayer({ name: 'a', skin: '#fff', stake: 1000 });
  const b = w.addPlayer({ name: 'b', skin: '#fff', stake: 5000 });
  assert.ok(b.bag > a.bag * 4.5, 'bigger stake, bigger bag');
  assert.equal(b.stake, 5000);
  assert.ok(w.audit().ok);
  void CFG;
});
