import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';

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
  assert.equal(wallet.balance(c.token), CFG.START_BALANCE);
  assert.equal(c.last('prep').state, 'prep');
  assert.equal(c.last('prep').count, null, 'no countdown until someone is ready');
  lobby.handle(1, { t: 'ready' });
  assert.equal(wallet.balance(c.token), CFG.START_BALANCE - 1000);
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
  assert.equal(wallet.balance(c.token), CFG.START_BALANCE);
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
  assert.equal(wallet.balance(c.token), CFG.START_BALANCE - 1000 + 2500);
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
  assert.equal(wallet.balance(b.token), CFG.START_BALANCE - 100, 'escrowed');
  assert.equal(b.last('start'), undefined, 'no mid-raid entry');
  ticks(30 + CFG.INTERMISSION + CFG.PREP_SECONDS + 1);
  assert.ok(b.last('start'), 'entered the next raid');
});

test('cannot ready up without the sats; the test faucet refills', () => {
  const { lobby, wallet, client } = setup();
  const c = client(1);
  wallet.accounts.set(c.token, 50);
  lobby.handle(1, { t: 'join', stake: 100 });
  lobby.handle(1, { t: 'ready' });
  assert.ok(c.last('err'));
  assert.equal(c.last('prep').slots.length, 0);
  lobby.handle(1, { t: 'faucet' });
  assert.equal(wallet.balance(c.token), CFG.START_BALANCE);
});

test('leaving the ready room refunds; leaving a raid leaves the body behind', () => {
  const { lobby, wallet, client, ticks } = setup();
  const a = client(1);
  lobby.handle(1, { t: 'join', stake: 1000 });
  lobby.handle(1, { t: 'ready' });
  lobby.disconnect(1);
  assert.equal(wallet.balance(a.token), CFG.START_BALANCE);

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
