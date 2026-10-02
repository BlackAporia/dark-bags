import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { RankBook } from '../shared/ranks.js';
import { Inventory } from '../shared/cosmetics.js';
import { ReferralBook } from '../shared/referrals.js';
import { Guard } from '../shared/guard.js';
import { StatsBook } from '../shared/stats.js';
import { createRegionMain, createRegionEdge, journaled, makeTicket, readTicket, parseRegions } from '../server/regions.js';

const SECRET = 'x'.repeat(40);

function setup() {
  let t = 1_000_000;
  const now = () => t;
  const main = new Lobby({ wallet: new MemoryWallet(), send: () => {}, newToken: () => `tok${Math.random().toString(36).slice(2, 10)}`, stats: new StatsBook() });
  const rm = createRegionMain({ lobby: main, secret: SECRET, regions: [{ id: 'us', url: 'https://us.example' }], now, log: { warn() {}, error() {} } });
  const journal = [];
  const out = [];
  const edge = new Lobby({
    edge: true,
    wallet: new MemoryWallet({ faucet: [] }),
    ranks: journaled('ranks', new RankBook(), journal),
    inventory: journaled('inventory', new Inventory(), journal),
    referrals: journaled('referrals', new ReferralBook(), journal),
    guard: journaled('guard', new Guard({ sharedIp: true }), journal),
    stats: journaled('stats', new StatsBook(), journal),
    send: (cid, m) => out.push([cid, m]),
    newToken: () => 'never',
    bots: false,
    minPlayers: 2,
    waitForStart: true,
  });
  const fetchImpl = async (_url, { body }) => {
    rm.apply(JSON.parse(body));
    return { ok: true };
  };
  const re = createRegionEdge({ lobby: edge, secret: SECRET, region: 'us', mainUrl: 'https://main.example', journal, now, log: { warn() {} }, fetchImpl });
  const player = (key) => {
    main.wallet.ensure(key);
    const cid = Math.floor(Math.random() * 1e9);
    edge.connect(cid, { ip: '1.2.3.4' });
    re.admit(cid, { ticket: rm.entryTicket(key, 'us', key) });
    edge.handle(cid, { t: 'join', mode: 'raid', stake: 1000 });
    return cid;
  };
  return { main, rm, edge, re, player, out, journal, tick: (ms) => (t += ms) };
}

test('regions: a stake goes to the region and comes back when the player stands up', async () => {
  const { main, rm, edge, re, player } = setup();
  const cid = player('alice');
  const start = main.wallet.balance('alice', 'USDC');
  const { ticket } = rm.stakeTicket('alice', 'us', { asset: 'USDC', mills: 1000 });
  assert.ok(main.wallet.balance('alice', 'USDC') < start, 'the main server took the stake');
  re.ready(cid, { ticket, asset: 'USDC' });
  assert.ok([...edge.rooms.values()].some((r) => [...r.clients.values()].some((c) => c.escrow)), 'escrowed on the match server');
  await re.flush();
  assert.ok(main.wallet.balance('alice', 'USDC') < start, 'nothing comes back while it is at stake');
  edge.handle(cid, { t: 'unready' });
  await re.flush();
  assert.equal(main.wallet.balance('alice', 'USDC'), start, 'the stake is home');
  assert.equal(rm.pots().us.USDC, '0');
  assert.equal(rm.pending(), 0, 'the ticket was redeemed');
});

test('regions: forged, foreign and reused tickets do nothing', () => {
  const { main, rm, edge, re, player, out } = setup();
  const cid = player('bob');
  re.ready(cid, { ticket: 'abc.def', asset: 'USDC' });
  re.ready(cid, { ticket: makeTicket('y'.repeat(40), { k: 'stake', id: 'z', key: 'bob', region: 'us', asset: 'USDC', units: '999999999', mills: 1000, exp: Date.now() + 1e6 }) });
  const { ticket } = rm.stakeTicket('bob', 'us', { asset: 'USDC', mills: 1000 });
  re.ready(cid, { ticket });
  edge.handle(cid, { t: 'unready' });
  re.ready(cid, { ticket }); // the same ticket again
  assert.equal(edge.wallet.balance('bob', 'USDC'), BigInt(readTicket(SECRET, ticket, 0).units), 'only one stake ever arrived');
  assert.ok(out.filter(([, m]) => m.t === 'err').length >= 3);
  // an entry ticket for another account cannot play as it
  const c2 = 777;
  edge.connect(c2, { ip: '9.9.9.9' });
  re.admit(c2, { ticket: makeTicket('y'.repeat(40), { k: 'entry', key: 'mallory', region: 'us', exp: Date.now() + 1e6 }) });
  assert.equal(edge.sessions.get(c2).token, null);
  assert.equal(main.wallet.balance('mallory', 'USDC'), 0n);
});

test('regions: a report can hand back only what was staked in the region', () => {
  const { main, rm } = setup();
  main.wallet.ensure('carol');
  const before = main.wallet.balance('carol', 'USDC');
  rm.stakeTicket('carol', 'us', { asset: 'USDC', mills: 1000 });
  const pot = BigInt(rm.pots().us.USDC);
  rm.apply({ id: 'r1', region: 'us', credits: [{ key: 'carol', asset: 'USDC', units: (pot * 100n).toString() }] });
  assert.equal(main.wallet.balance('carol', 'USDC'), before, 'capped at the pot');
  assert.equal(rm.pots().us.USDC, '0');
  rm.apply({ id: 'r1', region: 'us', credits: [{ key: 'carol', asset: 'USDC', units: '5' }] });
  assert.equal(main.wallet.balance('carol', 'USDC'), before, 'a report applies once');
  assert.deepEqual(rm.apply({ id: 'r2', region: 'mars' }), { error: 'unknown region' });
});

test('regions: the match bookkeeping is replayed on the real books; random rewards as outcomes', () => {
  const { main, rm, edge, journal } = setup();
  edge.ranks.add('dave', 500);
  edge.ranks.get('dave'); // reads are not journaled
  edge.inventory.give('dave', { k: 'box', id: 'vault' });
  const ups = edge.inventory.rankUp('dave', 0, 2);
  edge.stats.raid({ mode: 'duel', stake: 1000, humans: 2, stakes: 2000, rake: 100, paid: 1900, seconds: 60 });
  assert.ok(journal.every(([b, m]) => ['add', 'give', 'raid'].includes(m)), 'only writes, rankUp as gives');
  rm.apply({ id: 'j1', region: 'us', journal });
  assert.equal(main.ranks.recs.get('dave').xp, 500);
  assert.equal(main.inventory.rec('dave').boxes.vault >= 1, true);
  for (const u of ups) if (u.trial) assert.ok(main.inventory.rec('dave').trials[u.trial.id] > 0, 'the same trial outfit');
  assert.equal(main.stats.modes.duel.raids, 1);
});

test('regions: an unredeemed stake ticket goes back after 30 minutes', () => {
  const { main, rm, tick } = setup();
  main.wallet.ensure('erin');
  const before = main.wallet.balance('erin', 'USDC');
  rm.stakeTicket('erin', 'us', { asset: 'USDC', mills: 1000 });
  tick(31 * 60 * 1000);
  rm.sweep();
  assert.equal(main.wallet.balance('erin', 'USDC'), before);
  assert.equal(rm.pending(), 0);
});

test('regions: REGIONS parsing takes https hosts only (and localhost for tests)', () => {
  assert.deepEqual(parseRegions('us=https://a.example, asia=https://b.example ,bad=ftp://x,evil=https://x.example/path'), [
    { id: 'us', url: 'https://a.example' },
    { id: 'asia', url: 'https://b.example' },
  ]);
});
