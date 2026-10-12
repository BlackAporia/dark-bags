import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { RankBook } from '../shared/ranks.js';
import { Inventory } from '../shared/cosmetics.js';
import { ReferralBook } from '../shared/referrals.js';
import { Guard } from '../shared/guard.js';
import { StatsBook } from '../shared/stats.js';
import { createRegionMain, createRegionEdge, journaled } from '../server/regions.js';

const SECRET = 'y'.repeat(40);

// One account, two devices: whatever moves the rank reaches both, and a match played on a region
// never shows a rank lower than the one the player already has.

test('a new rank reaches every device of the account', () => {
  const inbox = new Map();
  const lobby = new Lobby({ wallet: new MemoryWallet(), send: (cid, m) => (inbox.get(cid) ?? inbox.set(cid, []).get(cid)).push(m), newToken: () => 'tokphone01' });
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'a' });
  const key = inbox.get(1).find((m) => m.t === 'welcome').token;
  lobby.connect(2);
  lobby.handle(2, { t: 'hello', name: 'a', token: key }); // the same account on a second device
  lobby.ranks.add(key, 5000);
  // what a finished match calls (shared/room.js, after its result)
  lobby.roomArgs.onRank(key);
  for (const cid of [1, 2]) {
    const r = inbox.get(cid).filter((m) => m.t === 'rank').at(-1);
    assert.ok(r, `device ${cid} got the rank`);
    assert.deepEqual(r.rank, lobby.ranks.get(key));
  }
  // a regional match settled on the main server: the devices get the rank with the balance
  inbox.clear();
  lobby.refreshPlayer(key);
  for (const cid of [1, 2]) assert.deepEqual(inbox.get(cid).find((m) => m.t === 'rank')?.rank, lobby.ranks.get(key));
});

test('a region keeps a rank that is ahead of the main server until its report gets there', async () => {
  let t = 1_000_000;
  const now = () => t;
  const sent = [];
  const main = new Lobby({ wallet: new MemoryWallet(), send: (cid, m) => sent.push([cid, m]), newToken: () => 'never', stats: new StatsBook() });
  const rm = createRegionMain({ lobby: main, secret: SECRET, regions: [{ id: 'us', url: 'https://us.example' }], now, log: { warn() {}, error() {} } });
  const journal = [];
  const edge = new Lobby({
    edge: true,
    wallet: new MemoryWallet({ faucet: [] }),
    ranks: journaled('ranks', new RankBook(), journal),
    inventory: journaled('inventory', new Inventory(), journal),
    referrals: journaled('referrals', new ReferralBook(), journal),
    guard: journaled('guard', new Guard({ sharedIp: true }), journal),
    stats: journaled('stats', new StatsBook(), journal),
    send: () => {},
    newToken: () => 'never',
    bots: false,
  });
  let up = false; // the main server is restarting (a deploy)
  const fetchImpl = async (_url, { body }) => {
    if (!up) throw new Error('connect ECONNREFUSED');
    rm.apply(JSON.parse(body));
    return { ok: true };
  };
  const re = createRegionEdge({ lobby: edge, secret: SECRET, region: 'us', mainUrl: 'https://main.example', journal, now, log: { warn() {}, error() {} }, fetchImpl });
  main.wallet.ensure('alice');
  main.ranks.add('alice', 2000);
  const admit = () => {
    const cid = Math.floor(Math.random() * 1e9);
    edge.connect(cid, { ip: '1.2.3.4' });
    re.admit(cid, { ticket: rm.entryTicket('alice', 'us', 'alice') });
  };
  admit();
  // a match on the region: XP the main server has not heard of yet
  edge.ranks.add('alice', 3000);
  await re.flush();
  assert.equal(re.outbox().length, 1, 'the report waits for the main server');
  // next match: the main server's record (older) must not wind the rank back
  admit();
  assert.equal(edge.ranks.get('alice').xp, 5000, 'the region kept the newer record');
  // the main server is back: the XP arrives, and the player's devices hear the rank
  up = true;
  main.connect(7);
  main.sessions.get(7).token = 'alice';
  await re.flush();
  assert.equal(re.outbox().length, 0);
  assert.equal(main.ranks.get('alice').xp, 5000, 'the main server has every point');
  assert.deepEqual(sent.filter(([c, m]) => c === 7 && m.t === 'rank').at(-1)?.[1].rank, main.ranks.get('alice'));
  // and now the region follows the main server again
  admit();
  assert.equal(edge.ranks.get('alice').xp, 5000);
});

test('a region going down keeps trying to hand its reports over', async () => {
  let t = 0;
  const journal = [];
  const lobby = new Lobby({ edge: true, wallet: new MemoryWallet({ faucet: [] }), ranks: journaled('ranks', new RankBook(), journal), send: () => {}, newToken: () => 'never', bots: false });
  let tries = 0;
  const fetchImpl = async () => {
    tries++;
    if (tries < 3) throw new Error('main is restarting');
    return { ok: true };
  };
  const re = createRegionEdge({ lobby, secret: SECRET, region: 'us', mainUrl: 'https://main.example', journal, now: () => t, log: { warn() {}, error() {} }, fetchImpl });
  lobby.ranks.add('bob', 100);
  const left = await re.drain(10_000, async (ms) => (t += ms));
  assert.equal(left, 0, 'delivered once the main server answered');
  assert.equal(tries, 3);
});
