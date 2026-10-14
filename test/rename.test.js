import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';

// A new name shows everywhere: every device of the account (a ready room there too), the lobby
// chat's earlier lines, and everyone else's screens.

test('a rename reaches the other devices, the ready room, the chat history and other players', () => {
  const inbox = new Map();
  const got = (cid, t) => (inbox.get(cid) ?? []).filter((m) => m.t === t);
  let n = 0;
  const lobby = new Lobby({ wallet: new MemoryWallet(), send: (cid, m) => (inbox.get(cid) ?? inbox.set(cid, []).get(cid)).push(m), newToken: () => `tok${String(++n).padStart(8, '0')}` });
  // the account on a PC and a phone; someone else in the lobby
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'OldFox', token: 'tokfoxpc001' });
  lobby.connect(2);
  lobby.handle(2, { t: 'hello', name: 'OldFox', token: 'tokfoxpc001' });
  lobby.connect(3);
  lobby.handle(3, { t: 'hello', name: 'Bear', token: 'tokbear0001' });
  // the fox says something, then the phone sits down at a table
  lobby.handle(1, { t: 'chat', text: 'gm' });
  lobby.handle(2, { t: 'join', stake: 1000, band: 1000, mode: 'raid', name: 'OldFox' });
  const room = lobby.sessions.get(2).room;
  assert.ok(room, 'the phone is at a table');
  // the PC renames
  lobby.handle(1, { t: 'rename', name: 'NewFox' });
  assert.equal(got(1, 'renamed').at(-1).name, 'NewFox');
  assert.equal(got(2, 'renamed').at(-1).name, 'NewFox');
  assert.equal(room.clients.get(2).name, 'NewFox', 'the ready room on the phone');
  assert.equal(lobby.chat.at(-1).n, 'NewFox', 'the earlier chat line');
  const seen = got(3, 'player_renamed').at(-1);
  assert.deepEqual([seen.id, seen.n], [lobby.social.get('tokfoxpc001').id, 'NewFox']);
  assert.equal(got(1, 'player_renamed').length, 0, 'the account itself gets renamed, not player_renamed');
  // and the server's own views read it
  assert.equal(lobby.social.get('tokfoxpc001').name, 'NewFox');
});
