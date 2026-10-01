import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RankBook } from '../shared/ranks.js';
import { rpDelta, divisionOf, rollLottery, LOTTERY, titleBonus, seasonTitleId, START_RP } from '../shared/ranked.js';
import { World } from '../shared/world.js';
import { MODE } from '../shared/modes.js';

const OCT = Date.UTC(2026, 9, 10);

test('RP: winners climb, the first out drops, kills help; divisions by RP', () => {
  assert.ok(rpDelta({ place: 1, size: 10 }) > 30);
  assert.ok(rpDelta({ place: 10, size: 10 }) < 0);
  assert.ok(rpDelta({ place: 5, size: 10, kills: 3 }) > rpDelta({ place: 5, size: 10 }));
  assert.equal(divisionOf(START_RP).id, 'bronze');
  assert.equal(divisionOf(1300).id, 'gold');
  assert.equal(divisionOf(2500).id, 'legend');
});

test('the ranked season: results move RP, the table sorts by it, a new month resets', () => {
  const rb = new RankBook();
  rb.rankedResult('a', { place: 1, size: 10, kills: 4, won: true }, OCT);
  rb.rankedResult('b', { place: 9, size: 10, kills: 0 }, OCT);
  rb.rankedResult('c', { place: 3, size: 10, kills: 1 }, OCT);
  const top = rb.leaderboard(OCT);
  assert.deepEqual(top.map((r) => r.key), ['a', 'c', 'b']);
  assert.equal(top[0].wins, 1);
  assert.equal(top[1].top3, 1);
  assert.equal(rb.rankedView('a', Date.UTC(2026, 10, 2)).rp, START_RP, 'November starts fresh');
  assert.equal(rb.leaderboard(Date.UTC(2026, 10, 2)).length, 0);
});

test('season titles: won, worn in neon, a bonus while their season lasts', () => {
  const rb = new RankBook();
  const { id, fresh } = rb.addSeasonTitle('a', '2026-10', 'elite');
  assert.ok(fresh);
  assert.equal(id, seasonTitleId('2026-10', 'elite'));
  assert.equal(rb.neon('a'), id, 'the first title goes straight on');
  assert.equal(titleBonus(id, OCT), 0.1);
  assert.equal(titleBonus(id, Date.UTC(2026, 10, 2)), 0, 'the bonus ends with the season');
  assert.equal(rb.setNeon('a', '2026-10.champion'), false, 'only titles you won');
  assert.ok(rb.setNeon('a', null));
  assert.equal(rb.neon('a'), null);
});

test('the lottery pays at its odds (titles rare, cases common)', () => {
  assert.equal(LOTTERY.reduce((s, x) => s + x.odds, 0), 100);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = { title: 0, wskin: 0, box: 0 };
  for (let i = 0; i < 20000; i++) n[rollLottery(rnd).k]++;
  assert.ok(n.title > 2400 && n.title < 3600, `titles ${n.title}`);
  assert.ok(n.box > n.wskin && n.wskin > n.title);
});

test('ranked is a battle royale: finishing places are recorded', () => {
  assert.equal(MODE.ranked.kind, 'br');
  const w = new World({ stake: 1000, seed: 5, mode: 'ranked', bots: false });
  const ps = ['a', 'b', 'c'].map((n) => w.addPlayer({ name: n, skin: '#fff' }));
  w.kill(ps[0], ps[2]);
  w.kill(ps[1], ps[2]);
  assert.equal(ps[0].place, 3);
  assert.equal(ps[1].place, 2);
});
