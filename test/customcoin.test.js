// A coin added by its address: priced only by its pool, never a stablecoin, stake-only with a cap,
// and it joins only with a real market behind it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PriceBook, TEST_ASSETS, isStable } from '../shared/assets.js';
import { PriceFeed } from '../server/cashier/prices.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';

const quiet = { log() {}, warn() {}, error() {} };
const FAKE = { id: '0xfa4e', symbol: 'USDC', decimals: 6, color: '#888', usd: 1, custom: true, maxStake: 5000 };

test('a coin added by address is never a stablecoin, whatever it calls itself', () => {
  assert.equal(isStable(FAKE), false);
  assert.equal(isStable(TEST_ASSETS[0]), true);
  const usdc = TEST_ASSETS[0];
  const usd = { ...usdc, id: 'usdc' };
  const t = { id: '0xfa4e', symbol: 'USDC', decimals: 6, custom: true, maxStake: 5000 };
  const prices = new PriceBook([]);
  const feed = new PriceFeed({ tokens: [usd, t], prices, quoter: async () => 0n, usd, fixed: { USDC: 1 }, log: quiet });
  assert.equal(prices.has(t.id), false, 'no peg, no fixed price: it waits for its own pool');
  assert.equal(prices.get(t.id).custom, true);
  assert.equal(feed.stable(t), false);
});

test('stake-only: capped stakes, no swaps, no tickets, no spins', () => {
  const prices = new PriceBook([...TEST_ASSETS, FAKE]);
  assert.match(prices.stakeError(FAKE.id, 10_000), /up to \$5/);
  assert.equal(prices.stakeError(FAKE.id, 5_000), null);
  assert.equal(prices.stakeError('USDC', 1e9), null);
  assert.equal(prices.spendable(FAKE.id), false);

  const inbox = new Map();
  const wallet = new MemoryWallet();
  const lobby = new Lobby({ wallet, prices, send: (cid, m) => (inbox.get(cid) ?? inbox.set(cid, []).get(cid)).push(m), newToken: () => 'tok1', bots: false });
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'x' });
  wallet.credit('tok1', FAKE.id, 100_000_000n);
  const last = (t) => [...inbox.get(1)].reverse().find((m) => m.t === t);
  lobby.handle(1, { t: 'swap', from: FAKE.id, to: 'USDC', units: '10000000' });
  assert.match(last('err').msg, /only be staked/);
  // a $10 table refuses it, a $5 one takes it
  lobby.handle(1, { t: 'join', stake: 10_000 });
  lobby.handle(1, { t: 'ready', asset: FAKE.id });
  assert.equal(last('err').code, 'custom_cap');
  lobby.handle(1, { t: 'leave' });
  lobby.handle(1, { t: 'join', stake: 5_000 });
  const before = wallet.balance('tok1', FAKE.id);
  lobby.handle(1, { t: 'ready', asset: FAKE.id });
  assert.ok(wallet.balance('tok1', FAKE.id) < before, 'staked');
});

test('it joins only with a real market: selling $200 of it must keep 90% of its price', async () => {
  const usd = { id: 'usdc', symbol: 'USDC', decimals: 6 };
  const t = { id: '0xabc', symbol: 'MEME', decimals: 18, custom: true };
  let depthUsd = 1e9; // what the pool can pay out before the price collapses
  const quoter = async ({ amountIn }) => {
    const want = (Number(amountIn) / 1e18) * 0.5; // $0.50 a token
    return BigInt(Math.round(Math.min(want, depthUsd) * 1e6));
  };
  const feed = new PriceFeed({ tokens: [usd], prices: new PriceBook([]), quoter, usd, log: quiet });
  assert.equal((await feed.depth(t, 200)).ok, true);
  depthUsd = 20; // a $20 pool propped up to look like $0.50
  const thin = await feed.depth(t, 200);
  assert.equal(thin.ok, false);
  assert.match(thin.why, /returns \$20/);
});

test('a token read from the chain: short-string and ByteArray names, junk refused', async () => {
  const { erc20Meta } = await import('../server/cashier/starknet.js');
  const { shortString, byteArray } = await import('starknet');
  const ba = (s) => {
    const b = byteArray.byteArrayFromString(s);
    return [String(b.data.length), ...b.data.map(String), String(b.pending_word), String(b.pending_word_len)];
  };
  const felt = (s) => [shortString.encodeShortString(s)];
  const old = { symbol: felt('STRK'), name: felt('Starknet Token'), decimals: ['0x12'] };
  assert.deepEqual(await erc20Meta(async (e) => old[e]), { symbol: 'STRK', name: 'Starknet Token', decimals: 18 });
  const neu = { symbol: ba('MEME'), name: ba('A rather long meme coin name, over 31 chars'), decimals: ['6'] };
  assert.deepEqual(await erc20Meta(async (e) => neu[e]), { symbol: 'MEME', name: 'A rather long meme coin name, over 31 ch', decimals: 6 });
  assert.equal(await erc20Meta(async () => null), null, 'not a token');
  assert.equal(await erc20Meta(async (e) => (e === 'decimals' ? ['99'] : felt('X'))), null, 'silly decimals');
});

test('a many-source price (STACHE): Ekubo to USDC and via STRK, DexScreener, GeckoTerminal; outliers dropped', async () => {
  const { robustMedian } = await import('../server/cashier/prices.js');
  assert.equal(robustMedian([1, 1.1, 0.9, 5]), 1);
  assert.equal(robustMedian([]), 0);
  const usd = { id: '0xusdc', symbol: 'USDC', decimals: 6 };
  const strk = { id: '0x4718', symbol: 'STRK', decimals: 18 };
  const st = { id: '0x0101', symbol: 'STACHE', decimals: 18, multi: true };
  // STRK at $0.12; STACHE is 0.001 STRK ($0.00012); the direct USDC route is a thin pool (way off)
  const quoter = async ({ tokenIn, tokenOut, amountIn }) => {
    const n = Number(amountIn) / 1e18;
    if (tokenIn.id === strk.id && tokenOut.id === usd.id) return BigInt(Math.round(n * 0.12 * 1e6));
    if (tokenIn.id === st.id && tokenOut.id === strk.id) return BigInt(Math.round(n * 0.001 * 1e18));
    if (tokenIn.id === st.id && tokenOut.id === usd.id) return BigInt(Math.round(n * 0.0004 * 1e6));
    return 0n;
  };
  const fetchImpl = async (url) => ({
    ok: true,
    json: async () =>
      url.includes('dexscreener')
        ? { pairs: [{ chainId: 'starknet', baseToken: { address: '0x101' }, priceUsd: '0.000121', liquidity: { usd: 9000 } }, { chainId: 'starknet', baseToken: { address: '0x101' }, priceUsd: '0.5', liquidity: { usd: 3 } }] }
        : { data: { attributes: { token_prices: { '0x0101': '0.000119' } } } },
  });
  const prices = new PriceBook([]);
  const feed = new PriceFeed({ tokens: [usd, strk, st], prices, quoter, usd, fetchImpl, log: quiet });
  await feed.refresh();
  const p = prices.get(st.id).usd;
  assert.ok(Math.abs(p - 0.00012) / 0.00012 < 0.02, `median of the sources that agree: ${p}`);
  assert.deepEqual(feed.sources.get(st.id).map(([n]) => n), ['ekubo-usdc', 'ekubo-strk', 'dexscreener', 'geckoterminal']);
});
