import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';

test('rank XP given outside a match reaches every open tab at once', () => {
  const inbox = new Map();
  const lobby = new Lobby({ wallet: new MemoryWallet(), send: (cid, m) => (inbox.get(cid) ?? inbox.set(cid, []).get(cid)).push(m), newToken: () => `tok${Math.random().toString(36).slice(2, 12)}` });
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'a' });
  const token = inbox.get(1).find((m) => m.t === 'welcome').token;
  const before = lobby.ranks.get(token);
  lobby.grant(token, [{ k: 'xp', v: 5000 }]);
  const pushed = inbox.get(1).filter((m) => m.t === 'rank').at(-1);
  assert.ok(pushed, 'a rank message was sent');
  assert.ok(pushed.rank.rank > before.rank, 'with the new rank');
  assert.deepEqual(pushed.rank, lobby.ranks.get(token));
  // gifts with no XP send nothing
  const n = inbox.get(1).filter((m) => m.t === 'rank').length;
  lobby.grant(token, [{ k: 'credit', v: 10 }]);
  assert.equal(inbox.get(1).filter((m) => m.t === 'rank').length, n);
});
