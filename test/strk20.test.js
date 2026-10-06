import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proofNodes, shortError, submitProof } from '../server/cashier/strk20.js';

const quiet = { log() {}, warn() {} };

test('a proof transaction moves on to the next node when one rejects it', async () => {
  const tried = [];
  const makeAccount = (_a, url) => ({
    async execute(call, details) {
      tried.push([url, details.proofFacts.length]);
      if (url === 'a') throw new Error('RPC: starknet_addInvokeTransaction with params {\n "proof": "AAAA"\n}\n\n 55: Account validation failed: argent invalid owner sig');
      return { transaction_hash: '0x1' };
    },
  });
  const res = await submitProof({ account: { address: '0x1' }, call: {}, details: { proofFacts: ['0x1'] }, nodes: ['a', 'b', 'c'], log: quiet, makeAccount });
  assert.equal(res.transaction_hash, '0x1');
  assert.deepEqual(tried, [['a', 1], ['b', 1]]);
});

test('every node rejecting it throws the last answer', async () => {
  const makeAccount = (_a, url) => ({ execute: async () => Promise.reject(new Error(`no ${url}`)) });
  await assert.rejects(submitProof({ account: {}, call: {}, details: {}, nodes: ['a', 'b'], log: quiet, makeAccount }), /no b/);
});

test('PROOF_RPC_URL comes first, the server node last, no repeats', () => {
  assert.deepEqual(proofNodes({ proofRpcUrls: ['p', 'x'], rpcUrl: 'x' }), ['p', 'x']);
  assert.deepEqual(proofNodes({ proofRpcUrls: ['p'], rpcUrl: 'r' }), ['p', 'r']);
});

test('the error keeps the node answer, not the megabyte request', () => {
  const e = new Error('RPC: x with params {\n "proof": "' + 'A'.repeat(5000) + '"\n}\n\n      55: Account validation failed: bad');
  assert.equal(shortError(e), '55: Account validation failed: bad');
});
