import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash } from 'starknet';
import * as starkzap from 'starkzap';
import { normAddr } from '../server/cashier/cashier.js';
import { readConfig, resolveTokens } from '../server/cashier/config.js';
import { PriceFeed } from '../server/cashier/prices.js';
import { createStarknetChain } from '../server/cashier/starknet.js';
import { allowedBuild } from '../server/cashier/index.js';
import { PriceBook } from '../shared/assets.js';

const quiet = { warn() {}, error() {}, log() {} };
const HOUSE = normAddr('0x4a05e');
const PLAYER = normAddr('0xa11ce');
const TRANSFER = hash.getSelectorFromName('Transfer');

test('config: off by default, tokens from Starkzap presets plus extras', () => {
  assert.equal(readConfig({}), null);
  assert.equal(readConfig({ CHAIN: 'off' }), null);
  assert.throws(() => readConfig({ CHAIN: 'goerli' }), /sepolia or mainnet/);
  const cfg = readConfig({ CHAIN: 'mainnet', TOKENS: 'strk,usdc,nope', EXTRA_TOKENS: 'strkBTC:0xabc:8', FIXED_PRICES: 'STRK=0.15' });
  assert.equal(cfg.strk20.pool, '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a');
  assert.deepEqual(cfg.fixedPrices, { STRK: 0.15 });
  const tokens = resolveTokens(cfg, starkzap.mainnetTokens, normAddr);
  assert.deepEqual(tokens.map((t) => t.symbol), ['STRK', 'USDC', 'strkBTC']);
  assert.equal(tokens[2].btc, true);
  assert.equal(tokens[0].id, normAddr(starkzap.mainnetTokens.STRK.address));
});

test('price feed: swap quotes to $, stables and BTC wrappers pegged, stale prices switch off', async () => {
  const cfg = readConfig({ CHAIN: 'mainnet', TOKENS: 'STRK,USDC,USDT,WBTC,LBTC' });
  const tokens = resolveTokens(cfg, starkzap.mainnetTokens, normAddr);
  const [strk, usdc, usdt, wbtc, lbtc] = tokens;
  const prices = new PriceBook([]);
  let now = 0;
  let down = false;
  const quoter = async ({ tokenIn, amountIn }) => {
    if (down) throw new Error('quoter down');
    const perToken = (usd, dec) => (amountIn * BigInt(Math.round(usd * 1e6))) / 10n ** BigInt(dec); // USDC out
    if (tokenIn.id === strk.id) return perToken(0.15, 18);
    if (tokenIn.id === usdt.id) return perToken(0.5, 6); // a broken pool: ignored, the $1 peg instead
    if (tokenIn.id === wbtc.id) return perToken(100000, 8);
    if (tokenIn.id === lbtc.id) return perToken(50000, 8); // off from WBTC: WBTC's price instead
    return 0n;
  };
  const feed = new PriceFeed({ tokens, prices, quoter, usd: usdc, now: () => now, log: quiet });
  assert.equal(prices.has(strk.id), false);
  await feed.refresh();
  assert.ok(Math.abs(prices.get(strk.id).usd - 0.15) < 1e-9);
  assert.equal(prices.get(usdc.id).usd, 1);
  assert.equal(prices.get(usdt.id).usd, 1);
  assert.equal(prices.get(wbtc.id).usd, 100000);
  assert.equal(prices.get(lbtc.id).usd, 100000);
  assert.equal(prices.quote(usdc.id, 1000), 1_000_000n);

  down = true;
  now += 5 * 60 * 1000;
  await feed.refresh();
  assert.ok(prices.has(strk.id), 'a recent price survives a failed refresh');
  now += 6 * 60 * 1000;
  await feed.refresh();
  assert.equal(prices.has(strk.id), false, 'stale price is dropped');
  assert.ok(prices.has(usdc.id) && prices.has(usdt.id), 'stablecoins stay on their peg');
});

test('public deposits are read from Transfer events into the house (Cairo 1 and legacy)', async () => {
  const cfg = readConfig({ CHAIN: 'mainnet', HOUSE_ADDRESS: HOUSE, TOKENS: 'STRK,USDC' });
  const chain = await createStarknetChain({ cfg, starkzap, log: quiet });
  const strk = chain.tokens[0].id;
  const usdc = chain.tokens[1].id;
  const receipts = {
    [normAddr('0x1')]: {
      execution_status: 'SUCCEEDED',
      finality_status: 'ACCEPTED_ON_L2',
      events: [
        { from_address: strk, keys: [TRANSFER, PLAYER, HOUSE], data: ['0x8ac7230489e80000', '0x0'] }, // 10 STRK
        { from_address: usdc, keys: [TRANSFER], data: [PLAYER, HOUSE, '0x2faf080', '0x0'] }, // legacy layout, 50 USDC
        { from_address: strk, keys: [TRANSFER, PLAYER, normAddr('0xbad')], data: ['0x1', '0x0'] }, // not to the house
        { from_address: normAddr('0x999'), keys: [TRANSFER, PLAYER, HOUSE], data: ['0x1', '0x0'] }, // not our token
      ],
    },
    [normAddr('0x2')]: { execution_status: 'REVERTED', finality_status: 'ACCEPTED_ON_L2', events: [] },
    [normAddr('0x3')]: { execution_status: 'SUCCEEDED', finality_status: 'PRE_CONFIRMED', events: [] },
  };
  chain.sdk.getProvider().channel.getTransactionReceipt = async (tx) => {
    const r = receipts[normAddr(tx)];
    if (!r) throw new Error('29: Transaction hash not found');
    return r;
  };
  const r = await chain.readPublicDeposit(normAddr('0x1'));
  assert.equal(r.status, 'ok');
  assert.deepEqual(
    r.transfers.map((t) => [t.token, t.from, t.amount]),
    [
      [strk, PLAYER, 10n * 10n ** 18n],
      [usdc, PLAYER, 50_000_000n],
    ],
  );
  assert.equal((await chain.readPublicDeposit(normAddr('0x2'))).status, 'failed');
  assert.equal((await chain.readPublicDeposit(normAddr('0x3'))).status, 'pending');
  assert.equal((await chain.readPublicDeposit(normAddr('0x4'))).status, 'pending');
  assert.deepEqual(chain.info().routes, ['public']);
  assert.deepEqual(chain.info().cashOut, { private: false, public: false });
  await assert.rejects(chain.payPublic({ token: strk, to: PLAYER, amount: 1n }), (e) => e.notSent);
});

test('the paymaster proxy only sponsors deposits to the house', () => {
  const tokens = new Set([normAddr('0x7')]);
  const transfer = hash.getSelectorFromName('transfer');
  const build = (calls, type = 'invoke', user = PLAYER) => ({ transaction: { type, invoke: { user_address: user, calls }, deployment: { address: user } }, parameters: {} });
  assert.ok(allowedBuild(build([{ to: '0x7', selector: transfer, calldata: [HOUSE, '0x5', '0x0'] }]), PLAYER, HOUSE, tokens));
  assert.ok(allowedBuild(build([{ to: '0x7', selector: transfer, calldata: [HOUSE, '0x5', '0x0'] }], 'deploy_and_invoke'), PLAYER, HOUSE, tokens));
  assert.ok(allowedBuild({ transaction: { type: 'deploy', deployment: { address: PLAYER } } }, PLAYER, HOUSE, tokens));
  assert.ok(!allowedBuild(build([{ to: '0x7', selector: transfer, calldata: ['0xbeef', '0x5', '0x0'] }]), PLAYER, HOUSE, tokens), 'elsewhere');
  assert.ok(!allowedBuild(build([{ to: '0x8', selector: transfer, calldata: [HOUSE, '0x5', '0x0'] }]), PLAYER, HOUSE, tokens), 'other token');
  assert.ok(!allowedBuild(build([{ to: '0x7', selector: hash.getSelectorFromName('approve'), calldata: [HOUSE, '0x5', '0x0'] }]), PLAYER, HOUSE, tokens), 'approve');
  assert.ok(!allowedBuild(build([{ to: '0x7', selector: transfer, calldata: [HOUSE, '0x5', '0x0'] }], 'invoke', normAddr('0xb0b')), PLAYER, HOUSE, tokens), 'someone else');
  assert.ok(!allowedBuild(build([]), PLAYER, HOUSE, tokens), 'empty');
  assert.ok(!allowedBuild({ transaction: { type: 'deploy', deployment: { address: '0xb0b' } } }, PLAYER, HOUSE, tokens));
});

test('deposit caps apply on mainnet; Sepolia test tokens are never capped unless asked', () => {
  const caps = { MAX_BALANCE_USD: '20', MAX_TOTAL_USD: '200' };
  const main = readConfig({ CHAIN: 'mainnet', ...caps });
  assert.equal(main.maxBalanceUsd, 20);
  assert.equal(main.maxTotalUsd, 200);
  const sep = readConfig({ CHAIN: 'sepolia', ...caps });
  assert.equal(sep.maxBalanceUsd, 0);
  assert.equal(sep.maxTotalUsd, 0);
  assert.equal(readConfig({ CHAIN: 'sepolia', SEPOLIA_CAPS: '1', ...caps }).maxBalanceUsd, 20);
});

test('the cashier takes the first Starknet node that answers on the right chain', async () => {
  const { pickNode } = await import('../server/cashier/starknet.js');
  const { readConfig } = await import('../server/cashier/config.js');
  const quiet = { warn: () => {}, error: () => {} };
  const answers = { 'https://down': null, 'https://other': '0x534e5f4d41494e', 'https://ok': '0x534e5f5345504f4c4941' };
  const fakeFetch = async (url) => {
    if (answers[url] == null) throw new Error('connect refused');
    return { json: async () => ({ result: answers[url] }) };
  };
  assert.equal(await pickNode(['https://down', 'https://other', 'https://ok'], 'SN_SEPOLIA', quiet, fakeFetch), 'https://ok');
  assert.equal(await pickNode(['https://down'], 'SN_SEPOLIA', quiet, fakeFetch), null);
  // the spare mainnet node is always in the list, after RPC_URL and RPC_FALLBACKS
  const cfg = readConfig({ CHAIN: 'mainnet', RPC_FALLBACKS: 'https://a,https://b' });
  assert.deepEqual(cfg.rpcFallbacks, ['https://a', 'https://b', 'https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10']);
});
