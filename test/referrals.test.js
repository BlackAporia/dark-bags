import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReferralBook, REF, CREATOR } from '../shared/referrals.js';
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
  // the ladder: a gift for alice on bob's 1st, 5th and 20th match, once each; bob a recruit on his 3rd
  const hits = [];
  for (let i = 0; i < 22; i++) hits.push(rb.onMatch('bob'));
  assert.equal(hits[0].welcome, 'bob', 'the welcome bag after the first match');
  assert.equal(hits[0].fan, false);
  const gifts = hits.flatMap((h, i) => (h?.gifts ?? []).map((g) => [i + 1, g.to, g.gift.k, g.gift.id ?? null]));
  assert.deepEqual(gifts, [
    [1, 'alice', 'spin', null],
    [REF.milestone, 'alice', 'box', 'vault'],
    [20, 'alice', 'box', 'golden'],
  ]);
  assert.equal(hits.filter((h) => h?.recruit).length, 1);
  assert.equal(hits[REF.active - 1].recruit, 'alice');
  assert.equal(rb.view('alice').active, 1);
  assert.equal(rb.view('alice').recruits, 1);
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

test('creators: their own code, tiers by recruits, a real share for a year, supporters, payouts', () => {
  let t = 0;
  const rb = new ReferralBook({ now: () => t });
  const base = rb.codeOf('nyx');
  assert.equal(rb.makeCreator('nyx', 'ab').error, 'code', 'three letters at least');
  rb.codeOf('other');
  assert.equal(rb.makeCreator('other', base).error, 'taken', 'not someone else\'s code');
  assert.deepEqual(rb.makeCreator('nyx', 'nyx tv!'), { ok: true, code: 'NYXTV' });
  assert.equal(rb.view('nyx').code, 'NYXTV');
  // both codes bring players to nyx; a creator's player supports them and gets the fan welcome
  assert.equal(rb.claim('fan1', 'nyxtv').creator, true);
  assert.ok(rb.claim('fan2', base).ok);
  assert.equal(rb.view('fan1').support, 'NYXTV');
  assert.equal(rb.onMatch('fan1').fan, true);
  // the share is owed in real $, at the tier's rate, never shop $
  const paid = rb.onStake('fan1', 1000); // $20 stake: 1000 mills rake
  assert.deepEqual(paid, { to: 'nyx', cents: Math.floor((1000 * CREATOR.tiers[0].share) / 10), real: true });
  assert.equal(rb.view('nyx').creator.owed, paid.cents);
  assert.equal(rb.view('nyx').creator.tier, 'creator');
  // 25 recruits make a partner (40%)
  for (let i = 0; i < 25; i++) {
    rb.claim(`p${i}`, 'NYXTV');
    for (let m = 0; m < REF.active; m++) rb.onMatch(`p${i}`);
  }
  assert.equal(rb.tierOf('nyx').id, 'partner');
  assert.equal(rb.view('nyx').creator.next.tier, 'elite');
  // support-a-creator: anyone, any time; the creator gets a share of real shop spend
  assert.equal(rb.support('walker', 'NOPE').error, 'notCreator');
  assert.equal(rb.support('nyx', 'NYXTV').error, 'self');
  assert.deepEqual(rb.support('walker', 'nyxtv'), { ok: true, code: 'NYXTV' });
  const before = rb.view('nyx').creator.owed;
  assert.deepEqual(rb.onShop('walker', 1000), { to: 'nyx', cents: 1000 * CREATOR.support });
  assert.equal(rb.view('nyx').creator.owed - before, 50);
  assert.equal(rb.view('nyx').creator.supporters, 28, 'fan1, fan2, 25 players and walker');
  assert.deepEqual(rb.support('walker', ''), { ok: true, code: null });
  assert.equal(rb.onShop('walker', 1000), null);
  // a year, not 90 days
  t = (REF.days + 10) * 86400000;
  assert.ok(rb.onStake('fan1', 1000));
  t = (CREATOR.days + 1) * 86400000;
  assert.equal(rb.onStake('fan1', 1000), null);
  // the team pays out (never more than owed)
  const owed = rb.view('nyx').creator.owed;
  assert.equal(rb.markPaid('nyx', owed + 999), owed);
  assert.deepEqual([rb.view('nyx').creator.owed, rb.view('nyx').creator.paid], [0, owed]);
  assert.equal(rb.creators()[0].code, 'NYXTV');
  // taking it back frees the code; old players' support ends
  assert.equal(rb.dropCreator('nyx'), true);
  assert.equal(rb.codes.get('NYXTV'), undefined);
  assert.equal(rb.codes.get(base), 'nyx', 'the random code stays');
  assert.equal(rb.view('fan1').support, null);
  // persists
  const back = new ReferralBook({ data: JSON.parse(JSON.stringify(rb.toJSON())) });
  assert.equal(back.view('nyx').creator, null);
  assert.equal(back.view('nyx').recruits, 25);
});

test('creators in rooms: a fan gets two welcome bags, the creator no shop $, the inviter a recruit title', () => {
  const inventory = new Inventory();
  const wallet = { debit: () => true, credit: () => {}, balances: () => ({}), faucet: () => {} };
  const lobby = new Lobby({ wallet, inventory, send: () => {}, newToken: () => 'x' });
  const rb = lobby.referrals;
  rb.codeOf('tokC');
  rb.makeCreator('tokC', 'STREAMER');
  rb.claim('tokF', 'STREAMER');
  const room = new RoomCore({ stake: 10000, mode: 'br', wallet, send: () => {}, inventory, ranks: lobby.ranks, referrals: rb, bots: false, minPlayers: 1 });
  const credit = inventory.view('tokC').credit;
  room.addClient('c1', { token: 'tokF', name: 'F' });
  room.handle('c1', { t: 'ready' });
  room.startRaid();
  assert.equal(inventory.view('tokC').credit, credit, 'no shop $ for a creator');
  assert.ok(rb.view('tokC').creator.owed > 0, 'owed in $ instead');
  // the fan's first finished match: two welcome bags (gift boxes)
  const bonus = rb.onMatch('tokF');
  assert.equal(bonus.fan, true);
});

test('support-a-creator in the lobby: the code by message, a top-up pays the creator a share, titles for recruits', () => {
  const sent = [];
  const inventory = new Inventory();
  const usdc = { id: 'USDC', symbol: 'USDC', decimals: 6, stable: true };
  const wallet = { debit: () => true, credit: () => {}, balances: () => ({ USDC: '100000000' }), faucet: () => {}, ensure: () => {} };
  const lobby = new Lobby({ wallet, inventory, send: (cid, m) => sent.push([cid, m]), newToken: () => 'x' });
  lobby.prices.list = () => [usdc];
  lobby.referrals.codeOf('tokC');
  lobby.referrals.makeCreator('tokC', 'STREAMER');
  lobby.connect('s');
  lobby.sessions.get('s').token = 'tokS';
  lobby.handle('s', { t: 'ref_support', code: 'nope' });
  assert.equal(sent.at(-1)[1].supportError, 'notCreator');
  lobby.handle('s', { t: 'ref_support', code: 'streamer' });
  assert.equal(sent.at(-1)[1].support, 'STREAMER');
  lobby.handle('s', { t: 'topup', id: 'p10' });
  assert.equal(sent.filter(([, m]) => m.t === 'locker').at(-1)?.[1].op, 'topup');
  assert.equal(lobby.referrals.view('tokC').creator.owed, 1000 * CREATOR.support, '5% of a $10 top-up');
  // a recruit unlocks the first recruiter title
  assert.ok(lobby.ranks.progress('tokC', { recruits: 1 }).some((a) => a.id === 'first_recruit'));
});
