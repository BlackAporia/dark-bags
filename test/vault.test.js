import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ec } from 'starknet';
import { Cashier, normAddr } from '../server/cashier/cashier.js';
import { PriceBook } from '../shared/assets.js';
import { OP, chainRake, createPotRecorder, depositActions, invokeCalldata, operatorKey, payoutHash, signPayout } from '../server/cashier/vault.js';

const VAULT = normAddr('0x7a017');
const STRK = normAddr('0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d');
const USDC = normAddr('0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb');
const ALICE = normAddr('0xa11ce');
const E18 = 10n ** 18n;

test('the payout hash is the one DarkBagsVault computes', () => {
  // the same inputs and value as payout_hash_matches_the_server in contracts/tests
  const h = payoutHash({ chainId: 'SN_SEPOLIA', vault: '0x1234', payoutId: '0x99', token: '0x777', notes: [{ noteId: '0xaaa', amount: 3000n }, { noteId: '0xbbb', amount: 1500n }] });
  assert.equal(h, '0x655852042aa9f71d5d860106fcc0470b682d78bac5ad2bb83a64cee76c50f09');
  const key = '0x1234567890abcdef';
  const { r, s } = signPayout(key, h);
  assert.ok(ec.starkCurve.verify(new ec.starkCurve.Signature(BigInt(r), BigInt(s)), h, ec.starkCurve.getPublicKey(key)));
  assert.match(operatorKey(key), /^0x[0-9a-f]+$/);
});

test('a private deposit is a withdraw to the vault plus an invoke with the reference', () => {
  const a = depositActions({ vault: VAULT, token: STRK, amount: 5n * E18, reference: '0xabc' });
  assert.deepEqual(a[0], { type: 'withdraw', token: STRK, amount: `0x${(5n * E18).toString(16)}`, recipient: VAULT });
  assert.equal(a[1].type, 'invoke');
  assert.equal(a[1].contract, VAULT);
  // privacy_invoke(op, data: Span) reads [op, len, ...data]
  assert.deepEqual(a[1].calldata, [OP.DEPOSIT, '0x3', `0x${BigInt(STRK).toString(16)}`, `0x${(5n * E18).toString(16)}`, '0xabc']);
  assert.deepEqual(invokeCalldata(OP.PAYOUT, [1, 2]), [OP.PAYOUT, '0x2', '0x1', '0x2']);
});

test('the on-chain house cut never goes over the contract cap', () => {
  assert.equal(chainRake(10000n, 0.04), 400n);
  assert.equal(chainRake(10000n, 1), 500n); // a mode that keeps more is capped at 5% on chain
  assert.equal(chainRake(19n, 0.04), 0n);
});

function vaultChain() {
  const chain = {
    tokens: [
      { id: STRK, symbol: 'STRK', decimals: 18 },
      { id: USDC, symbol: 'USDC', decimals: 6 },
    ],
    events: [],
    vault: { address: VAULT, cursor: 0 },
    info: () => ({ network: 'sepolia', chainId: 'SN_SEPOLIA', house: normAddr('0x4a05e'), vault: VAULT, routes: ['private', 'public'], tokens: chain.tokens }),
    async scanVaultDeposits() {
      return chain.events;
    },
    async scanPrivateDeposits() {
      return [];
    },
  };
  return chain;
}

test('vault deposits are credited to whoever was handed the reference, once', async () => {
  const chain = vaultChain();
  const prices = new PriceBook(chain.tokens.map((t) => ({ ...t, usd: t.symbol === 'STRK' ? 0.15 : 1 })));
  const cashier = new Cashier({ chain, prices });
  const { reference, vault } = cashier.depositRef(ALICE);
  assert.equal(vault, VAULT);
  assert.match(reference, /^0x[0-9a-f]+$/);
  // the event carries the reference as the chain prints it (no leading zeros either way)
  chain.events = [
    { id: 'vault:0xt1:1', reference, token: STRK, amount: 7n * E18 },
    { id: 'vault:0xt2:1', reference: '0xdead', token: STRK, amount: E18 },
  ];
  const got = await cashier.scanVault();
  assert.equal(got.length, 1);
  assert.equal(got[0].account, ALICE);
  assert.equal(cashier.ledger.balances(ALICE)[STRK], (7n * E18).toString());
  // an unknown reference is kept for the operator, not credited to anyone
  assert.equal(cashier.deposits.find((d) => d.id === 'vault:0xt2:1').held, 'unknown-ref');
  assert.equal((await cashier.scanVault()).length, 0); // never twice
  // the references survive a restart
  const again = new Cashier({ chain, prices, data: JSON.parse(JSON.stringify(cashier.toJSON())) });
  assert.ok(again.refs[reference]);
});

test('each player may hold only a few open references', () => {
  const chain = vaultChain();
  const cashier = new Cashier({ chain, prices: new PriceBook([]) });
  for (let i = 0; i < 10; i++) cashier.depositRef(ALICE);
  assert.throws(() => cashier.depositRef(ALICE), /Too many/);
});

test('a staked match puts only its pot per coin on chain, then the capped cut', async () => {
  const calls = [];
  const vault = {
    openMatch: async (a) => (calls.push(['open', a]), '0xo'),
    settleMatch: async (a) => (calls.push(['settle', a]), '0xs'),
    voidMatch: async (a) => (calls.push(['void', a]), '0xv'),
  };
  const rec = createPotRecorder({ vault, houseShare: 0.04, rand: crypto.randomBytes, log: { log() {}, error() {} } });
  const r = rec.start('raid:100:1:1', [
    { account: ALICE, asset: STRK, units: 1000n },
    { account: normAddr('0xb0b'), asset: STRK, units: 3000n },
    { account: normAddr('0xc4a'), asset: USDC, units: 500n },
  ]);
  await new Promise((res) => setImmediate(res));
  const [kind, open] = calls[0];
  assert.equal(kind, 'open');
  // per coin totals only: no addresses, no single stakes
  assert.deepEqual(open.pots, [{ token: STRK, amount: 4000n }, { token: USDC, amount: 500n }]);
  assert.ok(!JSON.stringify(open, (k, v) => (typeof v === 'bigint' ? v.toString() : v)).includes('a11ce'));
  // every player gets their own receipt (salt + leaf) to check against the root
  assert.equal(r.receipts.length, 3);
  assert.equal(r.receipts[0].account, ALICE);
  rec.end('raid:100:1:1');
  await new Promise((res) => setImmediate(res));
  const [, settle] = calls[1];
  assert.equal(settle.matchId, open.matchId);
  assert.deepEqual(settle.rakes, [{ token: STRK, amount: 160n }, { token: USDC, amount: 20n }]);
  assert.match(settle.root, /^0x[0-9a-f]+$/);
  // practice / no real coins: nothing goes on chain
  assert.equal(rec.start('x', [{ account: ALICE, asset: 'not-a-coin', units: 5n }]), null);
});

test('pool transactions carry fixed bounds instead of a fee estimate that drops the proof', async () => {
  const { proofBounds } = await import('../server/cashier/strk20.js');
  const b = await proofBounds({ getBlockWithTxHashes: async () => ({ l1_gas_price: { price_in_fri: '0x10' }, l2_gas_price: { price_in_fri: '0x5' }, l1_data_gas_price: {} }) });
  assert.equal(b.l2_gas.max_price_per_unit, 10n);
  assert.ok(b.l2_gas.max_amount > 0n && b.l1_data_gas.max_amount > 0n);
  assert.ok(b.l1_data_gas.max_price_per_unit > 0n); // a missing price falls back to a floor, never 0
});
