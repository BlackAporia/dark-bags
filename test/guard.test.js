import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Guard, GUARD, aimVerdict, digest } from '../shared/guard.js';
import { Lobby } from '../shared/lobby.js';
import { Inventory } from '../shared/cosmetics.js';
import { World } from '../shared/world.js';
import { hasLOS } from '../shared/geom.js';

const wallet = { debit: () => true, credit: () => {}, balances: () => ({}), faucet: () => {}, ensure: () => {} };
function lobbyWith(guard) {
  const sent = [];
  let n = 0;
  const lobby = new Lobby({ wallet, guard, inventory: new Inventory(), send: (cid, m) => sent.push([cid, m]), newToken: () => `token${String(++n).padStart(4, '0')}` });
  return { lobby, sent, last: (cid, t) => sent.filter(([c, m]) => c === cid && (!t || m.t === t)).at(-1)?.[1] };
}

test('guard: networks and devices are hashed, never stored raw', () => {
  const g = new Guard({ salt: 's' });
  const net = g.net('203.0.113.7');
  assert.notEqual(net, '203.0.113.7');
  assert.equal(net, digest('203.0.113.7', 's'));
  g.see('alice', net, g.dev('device123abc'));
  assert.ok(!JSON.stringify(g.toJSON()).includes('203.0.113.7'));
  assert.equal(g.dev('bad id!'), null);
});

test('guard: one person, one seat at a staked table', () => {
  const { lobby, last } = lobbyWith(new Guard());
  lobby.connect(1, { ip: '1.1.1.1' });
  lobby.connect(2, { ip: '1.1.1.1' });
  lobby.connect(3, { ip: '2.2.2.2' });
  for (const c of [1, 2, 3]) lobby.handle(c, { t: 'hello', name: 'p' + c, dev: 'device' + c + 'xxxxx' });
  lobby.handle(1, { t: 'join', mode: 'br', stake: 1000 });
  assert.ok(lobby.sessions.get(1).room);
  lobby.handle(2, { t: 'join', mode: 'br', stake: 1000 });
  assert.equal(lobby.sessions.get(2).room, null);
  assert.equal(last(2, 'err').code, 'guard_seat');
  lobby.handle(3, { t: 'join', mode: 'br', stake: 1000 });
  assert.ok(lobby.sessions.get(3).room, 'another network sits fine');
  // the same device on another network is the same person too
  lobby.connect(4, { ip: '9.9.9.9' });
  lobby.handle(4, { t: 'hello', name: 'p4', dev: 'device1xxxxx' });
  lobby.handle(4, { t: 'join', mode: 'br', stake: 1000 });
  assert.equal(last(4, 'err').code, 'guard_seat');
});

test('guard: new accounts and faucet top-ups per network per day', () => {
  const { lobby, last } = lobbyWith(new Guard());
  for (let i = 0; i < GUARD.newPerIpDay + 1; i++) {
    lobby.connect(10 + i, { ip: '5.5.5.5' });
    lobby.handle(10 + i, { t: 'hello', name: 'x' });
  }
  assert.equal(last(10 + GUARD.newPerIpDay, 'err').code, 'guard_new');
  // a returning player (with their token) always gets in
  lobby.connect(99, { ip: '5.5.5.5' });
  lobby.handle(99, { t: 'hello', token: 'token0001', name: 'x' });
  assert.equal(last(99).t, 'welcome');
  for (let i = 0; i <= GUARD.faucetPerIpDay; i++) lobby.handle(99, { t: 'faucet' });
  assert.equal(last(99, 'err').code, 'guard_faucet');
});

test('guard: no inviting yourself from a second account, and a daily cap per inviter', () => {
  const { lobby, last } = lobbyWith(new Guard());
  lobby.connect(1, { ip: '1.1.1.1' });
  lobby.handle(1, { t: 'hello', name: 'host', dev: 'hostdevice1' });
  lobby.handle(1, { t: 'ref_info' });
  const code = last(1, 'ref').code;
  lobby.connect(2, { ip: '1.1.1.1' });
  lobby.handle(2, { t: 'hello', name: 'alt', dev: 'altdevice22' });
  lobby.handle(2, { t: 'ref_claim', code });
  assert.equal(last(2, 'ref').error, 'linked');
  for (let i = 0; i < GUARD.refPerDay + 1; i++) {
    const c = 100 + i;
    lobby.connect(c, { ip: `10.0.0.${i}` });
    lobby.handle(c, { t: 'hello', name: 'n', dev: `newdevice${i}x` });
    lobby.handle(c, { t: 'ref_claim', code });
  }
  assert.equal(last(100, 'ref').claimed, true);
  assert.equal(last(100 + GUARD.refPerDay, 'ref').error, 'busy');
});

test('guard: aim review needs many shots, and flags inhuman numbers', () => {
  assert.equal(aimVerdict({ shots: 50, hits: 50, hs: 50, snap: 50 }), null, 'too few shots to say');
  assert.equal(aimVerdict({ shots: 1000, hits: 380, hs: 90, snap: 30 }), null, 'a good human');
  assert.equal(aimVerdict({ shots: 1000, hits: 900, hs: 100, snap: 0 }), 'accuracy');
  assert.equal(aimVerdict({ shots: 1000, hits: 500, hs: 400, snap: 0 }), 'headshots');
  assert.equal(aimVerdict({ shots: 1000, hits: 500, hs: 100, snap: 300 }), 'snaps');
  const logs = [];
  const g = new Guard({ log: (m) => logs.push(m) });
  for (let i = 0; i < 10; i++) g.aim('cheat', { shots: 100, hits: 95, hs: 70, snap: 60 });
  assert.ok(g.flagged('cheat'));
  assert.equal(logs.length, 1, 'flagged once');
  g.clear('cheat');
  assert.ok(!g.flagged('cheat'));
});

test('guard: the sim counts human shots, hits, headshots and flicks', () => {
  const w = new World({ stake: 1000, seed: 3, bots: false, mode: 'snipers' });
  const A = w.addPlayer({ name: 'a', skin: '#fff', weapon: 'scout' });
  const B = w.addPlayer({ name: 'b', skin: '#fff' });
  w.step();
  // a clear lane: somewhere with no wall between the two
  let ok = false;
  for (let y = 100; y < w.map.h - 100 && !ok; y += 37)
    for (let x = 100; x < w.map.w - 300 && !ok; x += 53) {
      if (hasLOS(x, y, x + 140, y, w.map.walls) && hasLOS(x, y - 20, x + 140, y - 20, w.map.walls) && hasLOS(x, y + 20, x + 140, y + 20, w.map.walls)) {
        Object.assign(A, { x, y });
        Object.assign(B, { x: x + 140, y });
        ok = true;
      }
    }
  assert.ok(ok);
  A.shield = B.shield = 0;
  B.hp = 1e9;
  A.aim = Math.PI;
  let s = 1;
  w.queueInput(A.id, { s: s++, a: Math.PI });
  w.step();
  w.queueInput(A.id, { s: s++, a: 0, f: true }); // a half-turn in one tick, then fire
  for (let i = 0; i < 20; i++) w.step();
  assert.equal(A.ac.shots, 1);
  assert.equal(A.ac.hits, 1);
  assert.equal(A.ac.snap, 1);
});

test('guard: trusted test accounts may share a network and a table', () => {
  const a = '0x03b318c215e22262cd9a5accf8a97bfefa0805dfe03ddfd370ed4db2f5f50e82';
  const b = '0x04c5a81396849724434ca58bdccdc68177ac6db5ef219823361795fa877c043a';
  const g = new Guard({ trusted: [a, b] });
  g.see(a, 'net1', 'dev1');
  g.see(b, 'net1', 'dev2');
  assert.equal(g.linked(a, b), false);
  assert.ok(g.seatOk({ key: b, net: 'net1', dev: 'dev2' }, [{ key: a, net: 'net1', dev: 'dev1' }]));
  // strangers are still split
  assert.ok(!new Guard().seatOk({ key: 'x', net: 'n' }, [{ key: 'y', net: 'n' }]));
});
