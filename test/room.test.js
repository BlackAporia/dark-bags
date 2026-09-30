import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { PriceBook, unitsAtEntryRate } from '../shared/assets.js';

const START = 100000; // test faucet: $100 of USDC, in mills ($1 = 1,000)
const mills = (wallet, token) => Number(wallet.balance(token, 'USDC')) / 1000; // 6 decimals: 1 mill = 1,000 units

function setup({ roundSeconds = 120, bots = false } = {}) {
  const inbox = new Map();
  const wallet = new MemoryWallet();
  const lobby = new Lobby({
    wallet,
    send: (cid, m) => {
      if (!inbox.has(cid)) inbox.set(cid, []);
      inbox.get(cid).push(m);
    },
    newToken: () => `tok${Math.random().toString(36).slice(2, 12)}`,
    bots,
    roundSeconds,
  });
  const client = (cid, name = 'runner') => {
    lobby.connect(cid);
    lobby.handle(cid, { t: 'hello', name });
    const welcome = inbox.get(cid).find((m) => m.t === 'welcome');
    return {
      cid,
      token: welcome.token,
      last: (t) => [...(inbox.get(cid) ?? [])].reverse().find((m) => m.t === t),
    };
  };
  const ticks = (seconds) => {
    for (let i = 0; i < Math.ceil(seconds * CFG.TICK_RATE); i++) lobby.tick();
  };
  return { lobby, wallet, client, ticks };
}

test('entering a table is free; Ready escrows the stake and lights your icon', () => {
  const { lobby, wallet, client } = setup();
  const c = client(1, 'vy');
  lobby.handle(1, { t: 'join', stake: 1000 });
  assert.equal(mills(wallet, c.token), START);
  assert.equal(c.last('prep').state, 'prep');
  assert.equal(c.last('prep').count, null, 'no countdown until someone is ready');
  lobby.handle(1, { t: 'ready' });
  assert.equal(mills(wallet, c.token), START - 1000);
  const prep = c.last('prep');
  assert.equal(prep.slots.length, 1);
  assert.equal(prep.slots[0].n, 'vy');
  assert.equal(prep.slots[0].me, 1);
  assert.equal(prep.count, CFG.PREP_SECONDS);
});

test('Unready refunds the stake and stops the countdown', () => {
  const { lobby, wallet, client } = setup();
  const c = client(1);
  lobby.handle(1, { t: 'join', stake: 100 });
  lobby.handle(1, { t: 'ready' });
  lobby.handle(1, { t: 'unready' });
  assert.equal(mills(wallet, c.token), START);
  assert.equal(c.last('prep').count, null);
});

test('the countdown starts the raid for everyone who is ready, at once', () => {
  const { lobby, client, ticks } = setup({ bots: true });
  const a = client(1, 'a');
  const b = client(2, 'b');
  const watcher = client(3, 'w');
  for (const cid of [1, 2, 3]) lobby.handle(cid, { t: 'join', stake: 1000 });
  lobby.handle(1, { t: 'ready' });
  ticks(3);
  lobby.handle(2, { t: 'ready' });
  ticks(CFG.PREP_SECONDS - CFG.BOT_REVEAL + 1);
  assert.ok(a.last('prep').bots.length > 0, 'bots light up near the end');
  ticks(CFG.BOT_REVEAL);
  assert.ok(a.last('start') && b.last('start'), 'both ready runners entered');
  assert.equal(watcher.last('start'), undefined, 'the one who never readied did not');
  const w = lobby.rooms.get(1000).world;
  lobby.tick();
  assert.equal(w.players.size, CFG.BOT_FILL, 'bots fill the raid to size');
  const names = [...w.players.values()].filter((p) => p.isBot).map((p) => p.name);
  const shown = a.last('prep').bots?.map((x) => x.n) ?? [];
  for (const n of shown) assert.ok(names.includes(n), `bot ${n} shown in the ready room is in the raid`);
});

test('when every human in the room is ready, the countdown hurries', () => {
  const { lobby, client } = setup();
  const a = client(1);
  client(2);
  lobby.handle(1, { t: 'join', stake: 100 });
  lobby.handle(2, { t: 'join', stake: 100 });
  lobby.handle(1, { t: 'ready' });
  assert.equal(a.last('prep').count, CFG.PREP_SECONDS);
  lobby.handle(2, { t: 'ready' });
  assert.equal(a.last('prep').count, CFG.PREP_ALL_READY);
});

test('extracting credits the wallet with the bag', () => {
  const { lobby, wallet, client, ticks } = setup();
  const c = client(1);
  lobby.handle(1, { t: 'join', stake: 1000 });
  lobby.handle(1, { t: 'ready' });
  ticks(CFG.PREP_SECONDS + 0.1);
  const room = lobby.rooms.get(1000);
  const p = room.world.players.get(c.last('start').pid);
  const e = room.world.map.extracts.find((x) => x.id === room.world.zonePlan.finalExit);
  const extra = 2500 - p.bag;
  room.world.ledger.sponsorIn += extra; // test scenario: bag of 2,500
  Object.assign(p, { x: e.x, y: e.y, bag: 2500 });
  ticks(CFG.EXTRACT_TIME + 1);
  const res = c.last('result');
  assert.equal(res.status, 'extracted');
  assert.equal(res.payout, 2500);
  assert.equal(mills(wallet, c.token), START - 1000 + 2500);
  assert.ok(room.world.audit().ok);
});

test('Ready during a live raid carries you into the next one', () => {
  const { lobby, wallet, client, ticks } = setup({ roundSeconds: 30 });
  const a = client(1, 'first');
  lobby.handle(1, { t: 'join', stake: 100 });
  lobby.handle(1, { t: 'ready' });
  ticks(CFG.PREP_SECONDS + 0.1);
  assert.ok(a.last('start'));
  const b = client(2, 'late');
  lobby.handle(2, { t: 'join', stake: 100 });
  assert.equal(b.last('prep').state, 'live');
  lobby.handle(2, { t: 'ready' });
  assert.equal(mills(wallet, b.token), START - 100, 'escrowed');
  assert.equal(b.last('start'), undefined, 'no mid-raid entry');
  ticks(30 + CFG.INTERMISSION + CFG.PREP_SECONDS + 1);
  assert.ok(b.last('start'), 'entered the next raid');
});

test('cannot ready up without the money; the test faucet refills', () => {
  const { lobby, wallet, client } = setup();
  const c = client(1);
  wallet.accounts.set(c.token, new Map([['USDC', 50000n]]));
  lobby.handle(1, { t: 'join', stake: 100 });
  lobby.handle(1, { t: 'ready' });
  assert.ok(c.last('err'));
  assert.equal(c.last('prep').slots.length, 0);
  lobby.handle(1, { t: 'faucet' });
  assert.equal(mills(wallet, c.token), START);
});

test('leaving the ready room refunds; leaving a raid leaves the body behind', () => {
  const { lobby, wallet, client, ticks } = setup();
  const a = client(1);
  lobby.handle(1, { t: 'join', stake: 1000 });
  lobby.handle(1, { t: 'ready' });
  lobby.disconnect(1);
  assert.equal(mills(wallet, a.token), START);

  const b = client(2);
  lobby.handle(2, { t: 'join', stake: 1000 });
  lobby.handle(2, { t: 'ready' });
  ticks(CFG.PREP_SECONDS + 0.1);
  const room = lobby.rooms.get(1000);
  const pid = b.last('start').pid;
  lobby.disconnect(2);
  assert.equal(room.world.players.get(pid).status, 'alive');
  lobby.tick();
  assert.ok(room.world.audit().ok);
});

test('any token can be staked: the $ stake is quoted in it, paid out at the entry rate', () => {
  const { lobby, wallet, client, ticks } = setup();
  const prices = lobby.prices;
  const c = client(1, 'strk-holder');
  const before = wallet.balance(c.token, 'STRK');
  lobby.handle(1, { t: 'join', stake: 1000 });
  lobby.handle(1, { t: 'ready', asset: 'STRK' });
  const quote = prices.quote('STRK', 1000);
  assert.equal(wallet.balance(c.token, 'STRK'), before - quote, 'escrowed the quoted STRK');
  assert.equal(mills(wallet, c.token), START, 'USDC untouched');
  assert.ok(prices.value('STRK', quote) >= 1000, 'the quote covers the stake');
  ticks(CFG.PREP_SECONDS + 0.1);
  const room = lobby.rooms.get(1000);
  const p = room.world.players.get(c.last('start').pid);
  const e = room.world.map.extracts.find((x) => x.id === room.world.zonePlan.finalExit);
  room.world.ledger.sponsorIn += 3000 - p.bag;
  Object.assign(p, { x: e.x, y: e.y, bag: 3000 });
  ticks(CFG.EXTRACT_TIME + 1);
  const res = c.last('result');
  assert.equal(res.asset, 'STRK');
  const expected = unitsAtEntryRate({ units: quote, mills: 1000 }, 3000);
  assert.equal(res.payoutUnits, expected.toString());
  assert.equal(wallet.balance(c.token, 'STRK'), before - quote + expected);
  assert.equal(room.totals.byAsset.STRK.in, quote);
  assert.equal(room.totals.byAsset.STRK.out, expected);
});

test('a token without a price cannot be staked', () => {
  const { lobby, wallet, client } = setup();
  const c = client(1);
  wallet.credit(c.token, 'MYSTERY', 10n ** 18n);
  lobby.handle(1, { t: 'join', stake: 100 });
  lobby.handle(1, { t: 'ready', asset: 'MYSTERY' });
  assert.ok(c.last('err'));
  assert.equal(wallet.balance(c.token, 'MYSTERY'), 10n ** 18n);
});

test('price book rounds quotes up and values down', () => {
  const pb = new PriceBook([{ id: 'X', symbol: 'X', decimals: 18, usd: 0.15 }]);
  const q = pb.quote('X', 1000); // 6.666… X
  assert.equal(q, 6666666666666666667n);
  assert.ok(pb.value('X', q) >= 1000);
  assert.equal(pb.value('X', q - 1n), 999);
});
