import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { World } from '../shared/world.js';
import { RoomCore } from '../shared/room.js';
import { MemoryWallet } from '../shared/wallet.js';
import { MAX_RANK, RANKS, RANK_STEP, RANK_XP, RankBook, rankOf, raidXp, botRank } from '../shared/ranks.js';

test('90 ranks from Lance Corporal to Legend, cheap early and expensive late', () => {
  assert.equal(RANKS.length, MAX_RANK);
  assert.equal(RANKS[0].name, 'Lance Corporal I');
  assert.equal(RANKS[89].name, 'Legend');
  assert.equal(RANK_XP[0], 0);
  for (let i = 1; i < RANK_STEP.length; i++) assert.ok(RANK_STEP[i] >= RANK_STEP[i - 1], `step ${i + 1} is not smaller than the one before`);
  assert.ok(RANK_STEP[0] <= 100, 'rank 2 comes after one raid or two');
  assert.ok(RANK_STEP[88] > 100 * RANK_STEP[0], 'the last ranks cost far more');
  assert.ok(RANK_XP[89] > 1_000_000);

  assert.equal(rankOf(0).rank, 1);
  assert.equal(rankOf(RANK_XP[1] - 1).rank, 1);
  assert.equal(rankOf(RANK_XP[1]).rank, 2);
  assert.equal(rankOf(RANK_XP[89]).rank, 90);
  assert.equal(rankOf(1e12).max, true);
  const mid = rankOf(RANK_XP[10] + 5);
  assert.equal(mid.into, 5);
  assert.equal(mid.need, RANK_STEP[10]);
  for (let i = 0; i < 1000; i++) {
    const r = botRank(Math.random);
    assert.ok(r >= 1 && r <= 46);
  }
});

test('every raid pays rank XP; extracting and fighting pay more; practice pays half', () => {
  const base = { kills: 0, dmgDealt: 0, joinedAt: 0, endedAt: 20, stake: 1000, payout: 0, prestige: 0, bestMulti: 0 };
  const died = raidXp({ ...base, status: 'dead' });
  const out = raidXp({ ...base, status: 'extracted', endedAt: 120, payout: 1800, kills: 3, dmgDealt: 260, bestMulti: 2, firstBlood: true });
  assert.ok(died.total >= 40);
  assert.ok(out.total > died.total * 5);
  assert.ok(out.parts.some((p) => p.label === 'Double kill'));
  const practice = raidXp({ ...base, status: 'extracted', endedAt: 120, payout: 1800, kills: 3, dmgDealt: 260 }, { practice: true });
  const online = raidXp({ ...base, status: 'extracted', endedAt: 120, payout: 1800, kills: 3, dmgDealt: 260 });
  assert.equal(practice.total, online.total - Math.floor(online.total / 2));

  const book = new RankBook();
  const r = book.add('me', 500);
  assert.equal(r.before.rank, 1);
  assert.ok(r.after.rank > 1);
  assert.deepEqual(new RankBook({ data: book.toJSON() }).get('me'), book.get('me'));
});

function runFor(w, seconds) {
  for (let i = 0; i < seconds * CFG.TICK_RATE && w.phase === 'live'; i++) w.step();
}

test('practice bots fight each other from the start; online bots keep their truce', () => {
  let practice = 0;
  let online = 0;
  for (const seed of [1, 2, 3, 4]) {
    for (const mode of [true, false]) {
      const w = new World({ stake: 1000, seed, practice: mode });
      runFor(w, CFG.BOT_TRUCE - 2);
      const dmg = [...w.players.values()].reduce((s, p) => s + p.dmgDealt, 0);
      if (mode) practice += dmg;
      else online += dmg;
    }
  }
  assert.equal(online, 0, 'no bot-on-bot fights during the online truce');
  assert.ok(practice > 0, 'practice bots are every runner for themselves');
});

test('in practice the raid ends when the human is out, and bots hit softer', () => {
  const w = new World({ stake: 1000, seed: 9, practice: true });
  const me = w.addPlayer({ name: 'me', skin: '#fff', rank: 12 });
  w.step();
  assert.equal(w.phase, 'live');
  const bot = [...w.players.values()].find((p) => p.isBot);
  me.shield = 0;
  w.damage(me, bot, 50);
  assert.equal(me.hp, 75, 'a 50 damage knife hit lands for 25 in practice');
  assert.equal(w.snapshotFor(bot.id).players.find((p) => p.i === me.id)?.rk ?? 12, 12);
  w.kill(me, bot);
  w.step();
  assert.equal(w.phase, 'ended', 'no watching bots play on after you die');
  assert.ok(w.audit().ok, 'the ledger still balances');

  const online = new World({ stake: 1000, seed: 9 });
  const you = online.addPlayer({ name: 'you', skin: '#fff' });
  online.step();
  you.shield = 0;
  online.damage(you, [...online.players.values()].find((p) => p.isBot), 50);
  assert.equal(you.hp, 62.5, 'online bots hit humans for 75%');
  online.kill(you, null, 'storm');
  online.step();
  assert.equal(online.phase, 'live', 'online raids run to the clock');
});

test('practice is survivable: an idle human lasts longer than online', () => {
  const lifetime = (practice) => {
    let total = 0;
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const w = new World({ stake: 1000, seed, practice });
      const me = w.addPlayer({ name: 'me', skin: '#fff' });
      while (w.phase === 'live' && me.status === 'alive') w.step();
      total += (me.endedAt ?? w.time) - me.joinedAt;
    }
    return total / 6;
  };
  const easy = lifetime(true);
  const hard = lifetime(false);
  assert.ok(easy > hard, `practice ${easy.toFixed(1)}s vs online ${hard.toFixed(1)}s`);
});

test('the room pays rank XP with the result and shows ranks in the lineup', () => {
  const out = [];
  const ranks = new RankBook();
  const wallet = new MemoryWallet();
  const room = new RoomCore({ stake: 100, wallet, ranks, practice: true, send: (cid, m) => out.push(m), prepSeconds: 1 });
  wallet.ensure('tok');
  room.addClient(1, { token: 'tok', name: 'me' });
  room.handle(1, { t: 'ready', asset: 'SATS' });
  const prep = out.filter((m) => m.t === 'prep').at(-1);
  assert.equal(prep.slots[0].rk, 1);
  for (let i = 0; i < CFG.TICK_RATE * 2 && room.state !== 'live'; i++) room.tick();
  assert.equal(room.state, 'live');
  const me = room.world.players.get(room.clients.get(1).pid);
  room.world.kill(me, null, 'storm');
  room.tick();
  const res = out.find((m) => m.t === 'result');
  assert.ok(res.rank.gained > 0);
  assert.equal(res.rank.after.xp, res.rank.gained);
  assert.equal(ranks.get('tok').xp, res.rank.gained);
  assert.ok(res.rank.parts.some((p) => p.label === 'Practice ×0.5'));
  assert.equal(room.world.phase, 'ended');
});

test('bots give a human a grace period, then at most two press them at once', () => {
  for (const practice of [false, true]) {
    for (const seed of [31, 32, 33]) {
      const w = new World({ stake: 1000, seed, practice });
      const me = w.addPlayer({ name: 'me', skin: '#fff' });
      let hitEarly = false;
      let maxHunters = 0;
      const orig = w.damage.bind(w);
      w.damage = (v, s, a) => {
        if (v === me && s?.isBot && w.time < CFG.HUMAN_GRACE) hitEarly = true;
        return orig(v, s, a);
      };
      while (w.phase === 'live' && me.status === 'alive' && w.time < 40) {
        w.step();
        let n = 0;
        for (const [id, b] of w.brains) if (b.target === me.id && w.players.get(id).status === 'alive') n++;
        maxHunters = Math.max(maxHunters, n);
      }
      assert.equal(hitEarly, false, `no bot hits a human in the first ${CFG.HUMAN_GRACE}s (seed ${seed}, practice ${practice})`);
      assert.ok(maxHunters <= 2, `at most two bots on one human (saw ${maxHunters})`);
    }
  }
});
