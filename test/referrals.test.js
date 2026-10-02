import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReferralBook, REF } from '../shared/referrals.js';
import { Lobby, REF_GIFT } from '../shared/lobby.js';
import { RoomCore } from '../shared/room.js';
import { Inventory } from '../shared/cosmetics.js';
import { CFG } from '../shared/config.js';

test('referrals: one code each, one inviter for life, only before the first match, never yourself', () => {
  let t = 0;
  const rb = new ReferralBook({ now: () => t });
  const code = rb.codeOf('alice');
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.equal(rb.codeOf('alice'), code, 'stable');
  assert.equal(rb.claim('alice', code).error, 'self');
  assert.equal(rb.claim('bob', 'NOPE12').error, 'unknown');
  assert.ok(rb.claim('bob', code.toLowerCase()).ok, 'codes are case-insensitive');
  assert.equal(rb.claim('bob', code).error, 'already');
  assert.equal(rb.claim('carol', code, { fresh: false }).error, 'late', 'after a first match it is too late');
  assert.equal(rb.claim('alice', rb.codeOf('bob')).error, 'self', 'no loops');
  // bob's stakes pay alice a share of the house cut, in whole cents
  let paid = 0;
  for (let i = 0; i < 10; i++) paid += rb.onStake('bob', 50)?.cents ?? 0; // $1 stakes: 50 mills rake each
  assert.equal(paid, Math.floor((10 * 50 * REF.share) / 10));
  assert.equal(rb.view('alice').earned, paid);
  assert.equal(rb.view('alice').invited, 1);
  // the milestone bag, once
  const hits = [];
  for (let i = 0; i < REF.milestone + 2; i++) hits.push(rb.onMatch('bob'));
  assert.equal(hits[0].welcome, 'bob', 'the welcome bag after the first match');
  assert.equal(hits.filter((h) => h?.to).length, 1);
  assert.equal(rb.view('alice').active, 1);
  // after REF.days it stops paying
  t = (REF.days + 1) * 86400000;
  assert.equal(rb.onStake('bob', 5000), null);
  // persists
  const back = new ReferralBook({ data: JSON.parse(JSON.stringify(rb.toJSON())) });
  assert.equal(back.codeOf('alice'), code);
  assert.equal(back.view('alice').invited, 1);
});

test('referrals in the lobby and rooms: a welcome bag, and the inviter is paid in shop $ from real stakes', () => {
  const sent = [];
  const inventory = new Inventory();
  const balances = new Map();
  const wallet = { debit: () => true, credit: () => {}, balances: () => ({}), faucet: () => {} };
  let n = 0;
  const lobby = new Lobby({ wallet, inventory, send: (cid, m) => sent.push([cid, m]), newToken: () => `tok${++n}` });
  void balances;
  lobby.connect('a');
  lobby.connect('b');
  lobby.sessions.get('a').token = 'tokA';
  lobby.sessions.get('b').token = 'tokB';
  lobby.handle('a', { t: 'ref_info' });
  const code = sent.find(([c, m]) => c === 'a' && m.t === 'ref').at(1).code;
  const boxes = inventory.view('tokB').boxes[REF_GIFT] ?? 0;
  lobby.handle('b', { t: 'ref_claim', code });
  const reply = sent.filter(([c, m]) => c === 'b' && m.t === 'ref').at(-1)[1];
  assert.equal(reply.claimed, true);
  assert.equal(inventory.view('tokB').boxes[REF_GIFT] ?? 0, boxes, 'no bag for just claiming');
  // a real match: b stakes $10 twice, a earns 20% of the 5% rake each time ($0.10)
  const room = new RoomCore({ stake: 10000, mode: 'br', wallet, send: () => {}, inventory, referrals: lobby.referrals, bots: false, minPlayers: 1 });
  const before = inventory.view('tokA').credit;
  for (let i = 0; i < 2; i++) {
    room.addClient(`c${i}`, { token: 'tokB', name: 'B' });
    room.handle(`c${i}`, { t: 'ready' });
    room.startRaid();
    room.state = 'prep';
    room.clients.clear();
  }
  assert.equal(inventory.view('tokA').credit - before, 2 * Math.floor((10000 * CFG.RAKE * 0.2) / 10));
  // the welcome bag lands once the first staked match is reported
  const back = lobby.referrals.onMatch('tokB');
  assert.equal(back.welcome, 'tokB');
});
