import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { createBackups } from '../server/backup.js';

// The browser keeps a signed copy of its account's records; a server that lost them gets them back
// at the next hello. Nothing in the copy can be edited, and it only fits its own account.

const SECRET = 'b'.repeat(32);

function server() {
  const inbox = new Map();
  const lobby = new Lobby({ wallet: new MemoryWallet(), send: (cid, m) => (inbox.get(cid) ?? inbox.set(cid, []).get(cid)).push(m), newToken: () => 'tokfresh01' });
  lobby.backups = createBackups({ secret: SECRET, lobby, every: 0, log: { warn() {} } });
  return { lobby, inbox };
}

function played() {
  const { lobby, inbox } = server();
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'Fox', token: 'tokplayer01' });
  lobby.ranks.add('tokplayer01', 4000);
  lobby.ranks.progress('tokplayer01', { raids: 12, kills: 30 });
  lobby.inventory.give('tokplayer01', { k: 'credit', v: 1500 });
  lobby.backups.tick();
  const copy = inbox.get(1).filter((m) => m.t === 'backup').at(-1);
  return { lobby, copy };
}

test('every signed-in session gets its copy, again only when its records change', () => {
  const { lobby, copy } = played();
  assert.equal(copy.key, 'tokplayer01');
  assert.ok(lobby.backups.read(copy.b));
  const before = lobby.sessions.size;
  lobby.backups.tick();
  assert.equal(lobby.sessions.size, before);
});

test('a wiped server takes the records back from the copy at hello', () => {
  const { lobby: old, copy } = played();
  const { lobby, inbox } = server();
  lobby.connect(7);
  lobby.handle(7, { t: 'hello', name: 'Fox', token: 'tokplayer01', backups: [copy.b] });
  const w = inbox.get(7).find((m) => m.t === 'welcome');
  assert.equal(w.rank.xp, old.ranks.get('tokplayer01').xp);
  assert.equal(w.career.stats.raids, 12);
  assert.equal(lobby.inventory.rec('tokplayer01').credit, old.inventory.rec('tokplayer01').credit);
  assert.equal(w.name, 'Fox');
});

test('an edited or foreign copy brings nothing back', () => {
  const { copy } = played();
  const [body, sig] = copy.b.split('.');
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  p.ranks.xp = 9_999_999;
  const forged = `${Buffer.from(JSON.stringify(p)).toString('base64url')}.${sig}`;
  const { lobby } = server();
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'x', token: 'tokplayer01', backups: [forged, 'junk', 42] });
  assert.equal(lobby.ranks.get('tokplayer01').xp, 0);
  lobby.connect(2);
  lobby.handle(2, { t: 'hello', name: 'y', token: 'tokother001', backups: [copy.b] });
  assert.equal(lobby.ranks.get('tokother001').xp, 0, "someone else's copy");
});

test('records the server keeps stand; a newer life of the file adds the copy to itself', () => {
  const { lobby: old, copy } = played();
  // the same server, records intact: the copy changes nothing
  old.connect(3);
  const kept0 = old.ranks.get('tokplayer01').xp;
  old.handle(3, { t: 'hello', name: 'Fox', token: 'tokplayer01', backups: [copy.b] });
  assert.equal(old.ranks.get('tokplayer01').xp, kept0);
  const kept = old.ranks.get('tokplayer01').xp;
  assert.equal(old.backups.restore('tokplayer01', [copy.b]).length, 0);
  assert.equal(old.ranks.get('tokplayer01').xp, kept);
  // a wiped server where the player already played again (another device, no copy): both add up
  const { lobby } = server();
  lobby.ranks.add('tokplayer01', 300);
  const did = lobby.backups.restore('tokplayer01', [copy.b]);
  assert.ok(did.includes('ranks') && did.includes('locker'));
  assert.equal(lobby.ranks.get('tokplayer01').xp, kept + 300);
  // and the same copy again adds nothing
  assert.deepEqual(lobby.backups.restore('tokplayer01', [copy.b]), []);
  assert.equal(lobby.ranks.get('tokplayer01').xp, kept + 300);
});
