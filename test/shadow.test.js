import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash } from 'starknet';
import { Cashier, normAddr } from '../server/cashier/cashier.js';
import { PriceBook } from '../shared/assets.js';
import { shadowAccountOf, proves, feltOf, ANONYMIZER } from '../server/cashier/shadow.js';

// Private mode: playing from a STRK20 shadow account. Signing in needs proof of control on chain
// (0 sent from the shadow account to a random challenge address), never the commitment alone.

const HOUSE = normAddr('0x4a05e');
const STRK = normAddr('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d');
const SHADOW = normAddr('0x5ad0');
const PARTIAL = '0x1234abcd';
const TRANSFER = hash.getSelectorFromName('Transfer');
const ev = (token, from, to, amount = 0n) => ({ from_address: token, keys: [TRANSFER, from, to], data: [`0x${amount.toString(16)}`, '0x0'] });

function setup() {
  const chain = {
    tokens: [{ id: STRK, symbol: 'STRK', decimals: 18 }],
    receipts: new Map(),
    paid: [],
    info: () => ({ network: 'sepolia', chainId: 'SN_SEPOLIA', house: HOUSE, routes: ['public'], tokens: chain.tokens, cashOut: { public: true } }),
    shadowAccount: async (p) => (p === normAddr(PARTIAL) || BigInt(p) === BigInt(PARTIAL) ? { address: SHADOW, deployed: false } : Promise.reject(new Error('none'))),
    readReceipt: async (tx) => chain.receipts.get(normAddr(tx)) ?? { status: 'pending', receipt: null },
    async payPublic(a) {
      chain.paid.push(a);
      return { tx: '0xpaid' };
    },
  };
  const prices = new PriceBook(chain.tokens.map((t) => ({ ...t, usd: 0.15 })));
  return { chain, cashier: new Cashier({ chain, prices }) };
}

test('the anonymizer read: one account for the nonce, malformed answers refused', async () => {
  const calls = [];
  const r = await shadowAccountOf(async (c) => (calls.push(c), ['0x1', '0x0', SHADOW, '0x1']), ANONYMIZER.sepolia, PARTIAL);
  assert.deepEqual(r, { address: SHADOW, deployed: true });
  assert.deepEqual(calls[0].calldata, [PARTIAL, '0x0', '0x1', '0x0']);
  await assert.rejects(shadowAccountOf(async () => ['0x0'], ANONYMIZER.sepolia, PARTIAL));
  assert.equal(feltOf('nope'), null);
  assert.equal(feltOf('0x0'), null);
});

test('private sign-in: commitment → shadow address and a challenge; only the proof signs in', async () => {
  const { chain, cashier } = setup();
  const start = await cashier.shadowStart('sess', PARTIAL);
  assert.equal(start.account, SHADOW);
  assert.ok(start.challenge && start.challenge !== SHADOW);
  // the commitment alone: nothing
  assert.equal(cashier.accountFor('sess'), null);
  // still proving
  assert.deepEqual(await cashier.shadowFinish('sess', '0xaaa'), { status: 'pending' });
  // a transaction that moved 0 from someone else (or to another address) proves nothing
  chain.receipts.set(normAddr('0xbbb'), { status: 'ok', receipt: { events: [ev(STRK, normAddr('0x999'), start.challenge)] } });
  await assert.rejects(cashier.shadowFinish('sess', '0xbbb'), /does not prove/);
  assert.equal(cashier.accountFor('sess'), null);
  // and the attempt is spent: start again
  await assert.rejects(cashier.shadowFinish('sess', '0xbbb'), /expired/);
  const again = await cashier.shadowStart('sess', PARTIAL);
  chain.receipts.set(normAddr('0xccc'), { status: 'ok', receipt: { events: [ev(STRK, SHADOW, again.challenge)] } });
  assert.deepEqual(await cashier.shadowFinish('sess', '0xccc'), { status: 'ok', account: SHADOW });
  assert.equal(cashier.accountFor('sess'), SHADOW);
  assert.equal(cashier.isShadow('sess'), true);
});

test('the proof must come from one of our coins and not be reverted', () => {
  const shadow = SHADOW;
  const challenge = normAddr('0xc4a11');
  const tokens = new Set([STRK]);
  assert.equal(proves({ events: [ev(STRK, shadow, challenge)] }, { shadow, challenge, tokens }), true);
  assert.equal(proves({ events: [ev(normAddr('0xfake'), shadow, challenge)] }, { shadow, challenge, tokens }), false);
  assert.equal(proves({ execution_status: 'REVERTED', events: [ev(STRK, shadow, challenge)] }, { shadow, challenge, tokens }), false);
});

test('an unknown commitment gets no account', async () => {
  const { cashier } = setup();
  await assert.rejects(cashier.shadowStart('s', '0x777'), /Could not find/);
  await assert.rejects(cashier.shadowStart('s', 'junk'), /no shadow account commitment/);
});

test('moving to private mode carries the progress, never into an account that has its own', async () => {
  const { Lobby } = await import('../shared/lobby.js');
  const { MemoryWallet } = await import('../shared/wallet.js');
  const lobby = new Lobby({ wallet: new MemoryWallet(), send: () => {}, newToken: () => 'tokx0000001' });
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'Fox', token: 'tokmain0001' });
  lobby.ranks.add('tokmain0001', 5000);
  lobby.inventory.give('tokmain0001', { k: 'credit', v: 700 });
  const id = lobby.social.get('tokmain0001').id;
  assert.equal(lobby.carryProgress('tokmain0001', 'tokshadow01'), true);
  assert.equal(lobby.ranks.get('tokshadow01').xp, 5000);
  assert.equal(lobby.inventory.rec('tokshadow01').credit, 700);
  assert.equal(lobby.social.get('tokshadow01').id, id, 'same public id: friends and guilds follow');
  assert.equal(lobby.social.get('tokshadow01').name, 'Fox');
  assert.equal(lobby.social.get('tokmain0001'), null);
  assert.equal(lobby.ranks.recs.has('tokmain0001'), false, 'moved, not copied');
  // a shadow account with progress of its own is never overwritten
  lobby.ranks.add('tokother001', 10);
  lobby.ranks.add('tokmain0002', 900);
  assert.equal(lobby.carryProgress('tokmain0002', 'tokother001'), false);
  assert.equal(lobby.ranks.get('tokother001').xp, 10);
});
