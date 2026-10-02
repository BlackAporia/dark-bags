import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../server/bridge.js';

const TOKENS = [
  { assetId: 'nep141:eth.omft.near', symbol: 'ETH', blockchain: 'eth', decimals: 18, price: 3000 },
  { assetId: 'nep141:btc.omft.near', symbol: 'BTC', blockchain: 'btc', decimals: 8, price: 60000 },
  { assetId: 'nep141:starknet-usdc', symbol: 'USDC', blockchain: 'starknet', decimals: 6, price: 1, contractAddress: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8' },
];
function fake() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.authorization ?? null });
    const json = u.pathname === '/v0/tokens' ? TOKENS : { quote: { depositAddress: 'bc1qdeposit', amountIn: '100000', amountInFormatted: '0.001', amountOut: '59000000', amountOutFormatted: '59', amountOutUsd: '59', timeEstimate: 600 } };
    return { ok: true, status: 200, text: async () => JSON.stringify(json) };
  };
  return { calls, fetchImpl };
}

test('bridge: into Starknet pays the signed-in player, refunds to their own address, adds our fee', async () => {
  const f = fake();
  const b = createBridge({ env: { BRIDGE_FEE_RECIPIENT: 'darkbags.near', BRIDGE_FEE_BPS: '30', ONECLICK_JWT: 'k' }, accountFor: () => '0xme', fetchImpl: f.fetchImpl });
  const q = await b.quote('0xme', { dir: 'in', originAsset: 'nep141:btc.omft.near', destinationAsset: 'nep141:starknet-usdc', amount: '100000', refundTo: 'bc1qmine', recipient: '0xsomeoneelse' });
  const body = f.calls.find((c) => c.path === '/v0/quote').body;
  assert.equal(body.recipient, '0xme', 'always the player, whatever the client asks');
  assert.equal(body.refundTo, 'bc1qmine');
  assert.deepEqual(body.appFees, [{ recipient: 'darkbags.near', fee: 30 }]);
  assert.equal(body.recipientType, 'DESTINATION_CHAIN');
  assert.ok(new Date(body.deadline) - Date.now() > 2.5 * 3600 * 1000, 'bitcoin gets a longer deadline');
  assert.equal(f.calls.at(-1).auth, 'Bearer k');
  assert.equal(q.depositAddress, 'bc1qdeposit');
  assert.equal(q.feeBps, 30);
  assert.equal(q.to.contractAddress, TOKENS[2].contractAddress);
});

test('bridge: out of Starknet refunds to the player; wrong directions and amounts are refused; fee capped at 1%', async () => {
  const f = fake();
  const b = createBridge({ env: { BRIDGE_FEE_RECIPIENT: 'x.near', BRIDGE_FEE_BPS: '900' }, accountFor: () => '0xme', fetchImpl: f.fetchImpl });
  assert.equal(b.feeBps, 100);
  await b.quote('0xme', { dir: 'out', originAsset: 'nep141:starknet-usdc', destinationAsset: 'nep141:eth.omft.near', amount: '5000000', recipient: '0xeth' });
  const body = f.calls.find((c) => c.path === '/v0/quote').body;
  assert.equal(body.refundTo, '0xme');
  assert.equal(body.recipient, '0xeth');
  await assert.rejects(b.quote('0xme', { dir: 'in', originAsset: 'nep141:btc.omft.near', destinationAsset: 'nep141:eth.omft.near', amount: '1', refundTo: 'x' }), /lands on Starknet/);
  await assert.rejects(b.quote('0xme', { dir: 'in', originAsset: 'nep141:btc.omft.near', destinationAsset: 'nep141:starknet-usdc', amount: '0.5', refundTo: 'x' }), /amount/);
  // no fee recipient: no fee
  assert.equal(createBridge({ env: {}, accountFor: () => null, fetchImpl: f.fetchImpl }).feeBps, 0);
  assert.equal(createBridge({ env: { BRIDGE: '0' } }), null);
});
