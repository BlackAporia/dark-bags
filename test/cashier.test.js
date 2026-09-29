import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cashier, normAddr } from '../server/cashier/cashier.js';
import { Lobby } from '../shared/lobby.js';
import { PriceBook } from '../shared/assets.js';
import { CFG } from '../shared/config.js';

const HOUSE = normAddr('0x4a05e');
const STRK = normAddr('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d');
const USDC = normAddr('0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb');
const ALICE = normAddr('0xa11ce');
const BOB = normAddr('0xb0b');
const E18 = 10n ** 18n;

function fakeChain({ routes = ['private', 'public'] } = {}) {
  const chain = {
    tokens: [
      { id: STRK, symbol: 'STRK', decimals: 18, color: '#ec796b' },
      { id: USDC, symbol: 'USDC', decimals: 6, color: '#2775ca' },
    ],
    receipts: new Map(), // tx → { status, transfers }
    notes: [],
    paid: [],
    failNext: null, // 'notSent' | 'unknown'
    info: () => ({ network: 'sepolia', chainId: 'SN_SEPOLIA', house: HOUSE, routes, tokens: chain.tokens }),
    async verifySignature(address, td, sig) {
      return sig[0] === `signed:${address}:${td.message.nonce}`;
    },
    async readPublicDeposit(tx) {
      return chain.receipts.get(tx) ?? { status: 'pending', transfers: [] };
    },
    async scanPrivateDeposits() {
      return chain.notes;
    },
    async pay(route, a) {
      if (chain.failNext) {
        const kind = chain.failNext;
        chain.failNext = null;
        throw Object.assign(new Error(`boom ${kind}`), { notSent: kind === 'notSent' });
      }
      chain.paid.push({ route, ...a });
      return { tx: `0xtx${chain.paid.length}` };
    },
    payPublic(a) {
      return chain.pay('public', a);
    },
    payPrivate(a) {
      return chain.pay('private', a);
    },
  };
  return chain;
}

function setup(opts = {}) {
  const chain = fakeChain(opts);
  const prices = new PriceBook(chain.tokens.map((t) => ({ ...t, satsPerToken: t.symbol === 'STRK' ? 150 : 1000 })));
  const cashier = new Cashier({ chain, prices, data: opts.data, privy: opts.privy ?? null });
  return { chain, prices, cashier };
}

async function signIn(cashier, session, address) {
  const td = cashier.challenge(session);
  return cashier.login(session, address, [`signed:${normAddr(address)}:${td.message.nonce}`]);
}

test('sign-in needs a fresh challenge and a valid signature', async () => {
  const { cashier } = setup();
  await assert.rejects(cashier.login('s1', ALICE, ['x']), /expired/);
  const td = cashier.challenge('s1');
  assert.equal(td.primaryType, 'Login');
  assert.equal(td.domain.chainId, 'SN_SEPOLIA');
  await assert.rejects(cashier.login('s1', ALICE, ['wrong']), /did not check out/);
  // the challenge was burnt by the failed attempt
  await assert.rejects(cashier.login('s1', ALICE, [`signed:${ALICE}:${td.message.nonce}`]), /expired/);
  assert.equal(await signIn(cashier, 's1', '0xA11CE'), ALICE);
  assert.equal(cashier.accountFor('s1'), ALICE);
  cashier.logout('s1');
  assert.equal(cashier.accountFor('s1'), null);
});

test('public deposits credit the sender once, pending ones are retried', async () => {
  const { chain, cashier } = setup();
  await signIn(cashier, 's1', ALICE);
  const tx = '0xdead';
  let r = await cashier.depositPublic(ALICE, tx);
  assert.equal(r.status, 'pending');
  chain.receipts.set(normAddr(tx), {
    status: 'ok',
    transfers: [
      { id: `${tx}:0`, token: STRK, from: ALICE, amount: 10n * E18 },
      { id: `${tx}:1`, token: '0x999', from: ALICE, amount: 5n }, // a token we don't price
    ],
  });
  await cashier.poll();
  assert.equal(cashier.ledger.balance(ALICE, STRK), 10n * E18);
  r = await cashier.depositPublic(ALICE, tx); // replay
  assert.equal(r.credited.length, 0);
  assert.equal(cashier.ledger.balance(ALICE, STRK), 10n * E18);
  assert.ok(cashier.history(ALICE).deposits.some((d) => d.unsupported));
});

test('pending deposits are capped per account', async () => {
  const { cashier } = setup();
  for (let i = 1; i <= 5; i++) assert.equal((await cashier.depositPublic(ALICE, `0x${i}`)).status, 'pending');
  await assert.rejects(cashier.depositPublic(ALICE, '0x6'), /Too many/);
  assert.equal((await cashier.depositPublic(ALICE, '0x1')).status, 'pending', 'a known hash is fine');
  assert.equal((await cashier.depositPublic(BOB, '0x7')).status, 'pending');
});

test('a deposit is credited to whoever sent it, never to whoever reports it', async () => {
  const { chain, cashier } = setup();
  chain.receipts.set(normAddr('0xbeef'), { status: 'ok', transfers: [{ id: '0xbeef:0', token: USDC, from: BOB, amount: 50_000_000n }] });
  const r = await cashier.depositPublic(ALICE, '0xbeef');
  assert.equal(r.credited[0].account, BOB);
  assert.equal(cashier.ledger.balance(ALICE, USDC), 0n);
  assert.equal(cashier.ledger.balance(BOB, USDC), 50_000_000n);
});

test('private notes are attributed by sender and deduplicated across scans', async () => {
  const { chain, cashier } = setup();
  const pushed = [];
  cashier.onCredit = (a) => pushed.push(a);
  chain.notes = [
    { id: 'n1', token: STRK, from: ALICE, amount: 3n * E18 },
    { id: 'n2', token: STRK, from: BOB, amount: 1n * E18 },
  ];
  let scans = 0;
  const inner = chain.scanPrivateDeposits;
  chain.scanPrivateDeposits = () => (scans++, inner());
  await Promise.all([cashier.scanPrivate(), cashier.scanPrivate()]); // one scan serves both
  assert.equal(scans, 1);
  await cashier.scanOnce();
  assert.equal(cashier.ledger.balance(ALICE, STRK), 3n * E18);
  assert.equal(cashier.ledger.balance(BOB, STRK), 1n * E18);
  assert.deepEqual(pushed, [ALICE, BOB]);
});

test('withdrawals pay the signed-in address and refund only when nothing was sent', async () => {
  const { chain, cashier } = setup();
  cashier.ledger.credit(ALICE, STRK, 100n * E18);
  const w = await cashier.withdraw(ALICE, { asset: STRK, units: (40n * E18).toString(), route: 'private' });
  assert.equal(w.status, 'sent');
  assert.deepEqual(chain.paid[0], { route: 'private', token: STRK, to: ALICE, amount: 40n * E18 });
  assert.equal(cashier.ledger.balance(ALICE, STRK), 60n * E18);

  chain.failNext = 'notSent';
  const f = await cashier.withdraw(ALICE, { asset: STRK, units: (10n * E18).toString(), route: 'public' });
  assert.equal(f.status, 'failed');
  assert.equal(cashier.ledger.balance(ALICE, STRK), 60n * E18);

  chain.failNext = 'unknown'; // may have reached the chain: hold for a human
  const u = await cashier.withdraw(ALICE, { asset: STRK, units: (10n * E18).toString(), route: 'public' });
  assert.equal(u.status, 'review');
  assert.equal(cashier.ledger.balance(ALICE, STRK), 50n * E18);

  await assert.rejects(cashier.withdraw(ALICE, { asset: STRK, units: (999n * E18).toString(), route: 'public' }), /Not enough/);
  await assert.rejects(cashier.withdraw(ALICE, { asset: STRK, units: '1', route: 'public' }), /at least/);
  await assert.rejects(cashier.withdraw(ALICE, { asset: '0x999', units: '1', route: 'public' }), /Unknown token/);
});

test('withdrawals go out one at a time and survive a restart as review items', async () => {
  const { chain, cashier } = setup();
  cashier.ledger.credit(ALICE, USDC, 100_000_000n);
  const order = [];
  const slow = chain.pay;
  chain.pay = async (route, a) => {
    order.push(`start ${a.amount}`);
    await new Promise((r) => setTimeout(r, 5));
    order.push(`end ${a.amount}`);
    return slow.call(chain, route, a);
  };
  await Promise.all([
    cashier.withdraw(ALICE, { asset: USDC, units: '1000000', route: 'public' }),
    cashier.withdraw(ALICE, { asset: USDC, units: '2000000', route: 'public' }),
  ]);
  assert.deepEqual(order, ['start 1000000', 'end 1000000', 'start 2000000', 'end 2000000']);

  const data = cashier.toJSON();
  data.withdrawals.push({ id: 'x', account: ALICE, token: USDC, amount: '5', route: 'public', status: 'sending', at: 0 });
  const again = setup({ data }).cashier;
  assert.equal(again.withdrawals.at(-1).status, 'review');
  assert.equal(again.ledger.balance(ALICE, USDC), 97_000_000n);
});

test('Privy sign-in derives the account from a house-held wallet', async () => {
  const privy = {
    verify: async (t) => (t === 'good' ? 'did:privy:1' : null),
    createWallet: async () => ({ walletId: 'w1', publicKey: '0x123', account: ALICE }),
  };
  const { cashier } = setup({ privy });
  await assert.rejects(cashier.loginPrivy('s1', 'bad'), /expired/);
  const r = await cashier.loginPrivy('s1', 'good');
  assert.equal(r.account, ALICE);
  assert.equal(cashier.accountFor('s1'), ALICE);
  assert.equal(cashier.privyWalletOf('did:privy:1').walletId, 'w1');
});

test('lobby with a cashier: wallet first, then stake from the signed-in balance', async () => {
  const { cashier } = setup();
  const out = [];
  const lobby = new Lobby({ cashier, send: (cid, m) => out.push(m), newToken: () => 'sess0001', bots: false, prepSeconds: 1 });
  const last = (t) => out.filter((m) => m.t === t).at(-1);
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'al' });
  assert.equal(last('welcome').account, null);
  assert.equal(last('welcome').chain.house, HOUSE);
  lobby.handle(1, { t: 'join', stake: 1000 });
  assert.match(last('err').msg, /Connect a wallet/);
  lobby.handle(1, { t: 'faucet' });
  assert.equal(last('balance'), undefined);

  lobby.handle(1, { t: 'auth_start' });
  const td = last('auth_challenge').typedData;
  await lobby.cashierOp(1, lobby.sessions.get(1), { t: 'auth', address: ALICE, signature: [`signed:${ALICE}:${td.message.nonce}`] });
  assert.equal(last('authed').account, ALICE);

  cashier.ledger.credit(ALICE, STRK, 100n * E18);
  lobby.handle(1, { t: 'join', stake: 1000 });
  lobby.handle(1, { t: 'ready', asset: STRK });
  const escrow = lobby.prices.quote(STRK, 1000);
  assert.equal(cashier.ledger.balance(ALICE, STRK), 100n * E18 - escrow);
  for (let i = 0; i < CFG.TICK_RATE * 2; i++) lobby.tick();
  assert.ok(last('start'));

  // a reconnect with the same session token is still signed in
  lobby.connect(2);
  lobby.handle(2, { t: 'hello', token: 'sess0001' });
  assert.equal(last('welcome').account, ALICE);
});
