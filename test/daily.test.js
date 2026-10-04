import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DailyBook, CALENDAR, DAY_MS, dailyIds, weeklyIds, DAILY_SWEEP, FIRST_WIN_XP, achGifts } from '../shared/daily.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';

const clock = (t0 = 20000 * DAY_MS + 3600e3) => {
  const c = { t: t0, now: () => c.t, day: () => (c.t += DAY_MS) };
  return c;
};

test('the calendar: one claim a day, day after day; a missed day starts over; after 30 a new round', () => {
  const c = clock();
  const d = new DailyBook({ now: c.now });
  assert.equal(CALENDAR.length, 30);
  const r1 = d.claimDay('a');
  assert.ok(r1.ok);
  assert.equal(r1.day, 1);
  assert.equal(d.claimDay('a').ok, false); // twice the same day
  c.day();
  assert.equal(d.claimDay('a').day, 2);
  c.day();
  c.day(); // missed one
  const v = d.calendar('a');
  assert.equal(v.lost, true);
  assert.equal(v.day, 1);
  assert.equal(d.claimDay('a').day, 1);
  for (let i = 2; i <= 30; i++) {
    c.day();
    assert.equal(d.claimDay('a').day, i);
  }
  c.day();
  const again = d.claimDay('a');
  assert.equal(again.day, 1);
  assert.equal(d.users.get('a').rounds, 1);
  assert.equal(d.users.get('a').best, 30);
});

test('tasks: a match moves the day and the week; claims once; all three pay the sweep', () => {
  const c = clock();
  const d = new DailyBook({ now: c.now });
  const ids = dailyIds(Math.floor(c.t / DAY_MS));
  assert.equal(ids.length, 3);
  assert.equal(weeklyIds(5).length, 3);
  assert.equal(d.claimTask('a', ids[0]).ok, false); // not done yet
  // a huge match does everything
  const big = { raids: 50, kills: 100, secs: 99999, firstBloods: 9, extracts: 9, pvpKills: 99, headshots: 99, zKills: 999, goldBags: 99, wins: 9, kKnife: 9, kSniper: 9, rankedGames: 9, zClears: 9 };
  const done = d.raid('a', big);
  assert.equal(done.length, 6);
  const a = d.claimTask('a', ids[0]);
  const b = d.claimTask('a', ids[1]);
  assert.ok(a.ok && b.ok && !a.sweep && !b.sweep);
  assert.equal(d.claimTask('a', ids[0]).ok, false);
  const last = d.claimTask('a', ids[2]);
  assert.ok(last.sweep);
  assert.deepEqual(last.gifts.slice(-DAILY_SWEEP.length), DAILY_SWEEP);
  // tomorrow: fresh tasks, the old ones are over
  c.day();
  const v = d.view('a');
  assert.ok(v.daily.every((x) => x.have === 0 && !x.claimed));
});

test('XP bonuses: the first win of the day once, the boost doubles and counts down', () => {
  const c = clock();
  const d = new DailyBook({ now: c.now });
  assert.deepEqual(d.bonusXp('a', { won: false, xp: 100 }), []);
  assert.deepEqual(d.bonusXp('a', { won: true, xp: 100 }), [{ label: 'First win of the day', xp: FIRST_WIN_XP }]);
  assert.deepEqual(d.bonusXp('a', { won: true, xp: 100 }), []);
  d.addBoost('a', 2);
  assert.equal(d.bonusXp('a', { won: false, xp: 100 })[0].xp, 100);
  d.bonusXp('a', { won: false, xp: 100 });
  assert.equal(d.users.get('a').boost, 0);
  c.day();
  const x = (() => {
    d.addBoost('a', 1);
    return d.bonusXp('a', { won: true, xp: 100 });
  })();
  assert.equal(x.reduce((s, y) => s + y.xp, 0), FIRST_WIN_XP + 100 + FIRST_WIN_XP);
});

test('achievement rewards: only unlocked ones, only once', () => {
  const d = new DailyBook();
  assert.equal(d.claimAch('a', 'rookie', {}).ok, false);
  const r = d.claimAch('a', 'rookie', { rookie: 1 });
  assert.ok(r.ok);
  assert.deepEqual(r.gifts, achGifts('rookie'));
  assert.equal(d.claimAch('a', 'rookie', { rookie: 1 }).ok, false);
  assert.deepEqual(d.view('a', { rookie: 1, hunter: 1 }).achClaim, ['hunter']);
});

test('the lobby pays daily gifts into the locker, and practice gets none', () => {
  const out = [];
  const lobby = new Lobby({ wallet: new MemoryWallet(), send: (cid, m) => out.push([cid, m]), newToken: () => 'tok1', bots: false });
  lobby.connect?.('c1');
  lobby.handle('c1', { t: 'hello', name: 'x' });
  const s = lobby.sessions.get('c1');
  const key = lobby.key(s);
  assert.ok(key);
  const before = lobby.inventory.view(key).credit;
  lobby.handle('c1', { t: 'daily_claim', what: 'day' });
  const msg = out.map(([, m]) => m).find((m) => m.t === 'daily' && m.claimed);
  assert.ok(msg, 'claimed');
  assert.equal(lobby.inventory.view(key).credit, before + CALENDAR[0][0].v);
  assert.equal(msg.view.cal.claimed, true);
  const p = new Lobby({ wallet: new MemoryWallet(), send: (cid, m) => out.push([cid, m]), newToken: () => 'tok2', practice: true });
  p.connect?.('c2');
  p.handle('c2', { t: 'hello', name: 'y' });
  p.handle('c2', { t: 'daily', what: 'day' });
  assert.ok(out.some(([cid, m]) => cid === 'c2' && m.t === 'daily' && m.offline));
});
