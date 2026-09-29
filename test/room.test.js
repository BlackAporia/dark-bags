import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';

function setup({ roundSeconds = 120 } = {}) {
  const inbox = new Map();
  const wallet = new MemoryWallet();
  const lobby = new Lobby({
    wallet,
    send: (cid, m) => {
      if (!inbox.has(cid)) inbox.set(cid, []);
      inbox.get(cid).push(m);
    },
    newToken: () => `tok${Math.random().toString(36).slice(2, 12)}`,
    bots: false,
    roundSeconds,
  });
  const client = (cid, name = 'runner') => {
    lobby.connect(cid);
    lobby.handle(cid, { t: 'hello', name });
    const welcome = inbox.get(cid).find((m) => m.t === 'welcome');
    return { cid, token: welcome.token, msgs: () => inbox.get(cid) ?? [], last: (t) => [...(inbox.get(cid) ?? [])].reverse().find((m) => m.t === t) };
  };
  return { lobby, wallet, client, inbox };
}

test('joining debits the stake and starts a raid', () => {
  const { lobby, wallet, client } = setup();
  const c = client(1);
  assert.equal(wallet.balance(c.token), CFG.START_BALANCE);
  lobby.handle(1, { t: 'join', stake: 1000, name: 'vy' });
  const start = c.last('start');
  assert.ok(start, 'got a start message');
  assert.equal(start.stake, 1000);
  assert.equal(wallet.balance(c.token), CFG.START_BALANCE - 1000);
  assert.ok(Array.isArray(start.map.walls) && start.map.extracts.length === 3);
});

test('extracting credits the wallet with the bag', () => {
  const { lobby, wallet, client } = setup();
  const c = client(1);
  lobby.handle(1, { t: 'join', stake: 1000 });
  const room = lobby.rooms.get(1000);
  const p = room.world.players.get(c.last('start').pid);
  const e = room.world.map.extracts[0];
  Object.assign(p, { x: e.x, y: e.y, bag: 2500 });
  for (let i = 0; i < CFG.TICK_RATE * (CFG.EXTRACT_TIME + 1); i++) lobby.tick();
  const res = c.last('result');
  assert.equal(res.status, 'extracted');
  assert.equal(res.payout, 2500);
  assert.equal(wallet.balance(c.token), CFG.START_BALANCE - 1000 + 2500);
  assert.equal(res.balance, wallet.balance(c.token));
});

test('a sealed raid queues you for the next one', () => {
  const { lobby, wallet, client } = setup({ roundSeconds: CFG.JOIN_CUTOFF + 1 });
  const a = client(1, 'first');
  lobby.handle(1, { t: 'join', stake: 100 });
  for (let i = 0; i < CFG.TICK_RATE * 2; i++) lobby.tick();
  const b = client(2, 'late');
  lobby.handle(2, { t: 'join', stake: 100 });
  assert.equal(b.last('start'), undefined, 'no entry into a sealed raid');
  assert.equal(b.last('room').queued, true);
  assert.equal(wallet.balance(b.token), CFG.START_BALANCE, 'queued runners are not charged yet');
  // run out the raid and the intermission
  for (let i = 0; i < CFG.TICK_RATE * (CFG.JOIN_CUTOFF + CFG.INTERMISSION + 2); i++) lobby.tick();
  assert.ok(b.last('start'), 'late runner entered the next raid');
  assert.equal(wallet.balance(b.token), CFG.START_BALANCE - 100);
  assert.equal(a.last('result').status, 'mia', 'first runner never extracted');
});

test('cannot join a table you cannot afford', () => {
  const { lobby, wallet, client } = setup();
  const c = client(1);
  wallet.accounts.set(c.token, 50);
  lobby.handle(1, { t: 'join', stake: 100 });
  assert.equal(c.last('start'), undefined);
  assert.ok(c.last('err'));
  lobby.handle(1, { t: 'faucet' });
  assert.equal(wallet.balance(c.token), CFG.START_BALANCE);
});

test('a disconnected runner stays in the raid and can still be looted', () => {
  const { lobby, client } = setup();
  const c = client(1);
  lobby.handle(1, { t: 'join', stake: 1000 });
  const room = lobby.rooms.get(1000);
  const pid = c.last('start').pid;
  lobby.disconnect(1);
  assert.equal(room.world.players.get(pid).status, 'alive');
  lobby.tick();
  assert.ok(room.world.audit().ok);
});
