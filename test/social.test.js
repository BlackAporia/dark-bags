import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { RankBook } from '../shared/ranks.js';
import { SocialBook, GUILD_RANK } from '../shared/social.js';

function setup() {
  const inbox = new Map();
  let clock = 1_000_000;
  const ranks = new RankBook();
  const lobby = new Lobby({
    wallet: new MemoryWallet(),
    ranks,
    send: (cid, m) => {
      if (!inbox.has(cid)) inbox.set(cid, []);
      inbox.get(cid).push(m);
    },
    newToken: () => `tok${Math.random().toString(36).slice(2, 12)}`,
    bots: false,
    now: () => clock,
  });
  lobby.social.now = () => clock;
  const last = (cid, t) => [...(inbox.get(cid) ?? [])].reverse().find((m) => m.t === t);
  const client = (cid, name) => {
    lobby.connect(cid);
    lobby.handle(cid, { t: 'hello', name });
    return { cid, id: last(cid, 'welcome').social.me, token: last(cid, 'welcome').token };
  };
  const tick = (ms) => (clock += ms);
  return { lobby, ranks, client, last, tick, inbox };
}

test('players get a public id, never their token; the directory shows who is online', () => {
  const { lobby, client, last } = setup();
  const a = client('a', 'alice');
  const b = client('b', 'bob');
  assert.match(a.id, /^[a-z0-9]{10}$/);
  assert.notEqual(a.id, a.token);
  lobby.handle('a', { t: 'players' });
  const list = last('a', 'players').list;
  assert.deepEqual(list.map((p) => p.n), ['bob'], 'everyone but me');
  assert.equal(list[0].st, 'lobby');
  assert.ok(!JSON.stringify(list).includes(b.token), 'tokens never leave the server');
  lobby.disconnect('b');
  lobby.handle('a', { t: 'players', q: 'bo' });
  assert.equal(last('a', 'players').list[0].st, 'off');
});

test('friends are mutual: a request, then accepting it', () => {
  const { lobby, client, last } = setup();
  const a = client('a', 'alice');
  const b = client('b', 'bob');
  lobby.handle('a', { t: 'friend', id: b.id });
  assert.equal(last('a', 'rel').rel, 'sent');
  assert.equal(last('b', 'friendReq').from.n, 'alice');
  lobby.handle('b', { t: 'friends' });
  assert.equal(last('b', 'friends').incoming[0].id, a.id);
  lobby.handle('b', { t: 'friend', id: a.id }); // accept
  assert.equal(last('b', 'rel').rel, 'friend');
  lobby.handle('a', { t: 'friends' });
  assert.equal(last('a', 'friends').friends[0].n, 'bob');
  lobby.handle('a', { t: 'unfriend', id: b.id });
  lobby.handle('b', { t: 'friends' });
  assert.equal(last('b', 'friends').friends.length, 0);
});

test('private messages reach the other player, count as unread, and are rate limited', () => {
  const { lobby, client, last, tick } = setup();
  const a = client('a', 'alice');
  const b = client('b', 'bob');
  lobby.handle('a', { t: 'dm', to: b.id, text: 'gm <b>bob</b>' });
  const got = last('b', 'dm');
  assert.equal(got.m.text, 'gm bbob/b', 'no markup');
  assert.equal(got.unread, 1);
  lobby.handle('a', { t: 'dm', to: b.id, text: 'again' });
  assert.match(last('a', 'err').msg, /Slow down/);
  tick(1000);
  lobby.handle('a', { t: 'dm', to: b.id, text: 'again' });
  lobby.handle('b', { t: 'inbox' });
  assert.equal(last('b', 'inbox').list[0].unread, 2);
  lobby.handle('b', { t: 'dms', with: a.id });
  assert.equal(last('b', 'dms').list.length, 2);
  assert.equal(last('b', 'dms').unread, 0, 'reading clears the badge');
});

test('guilds: founding needs a purchase and rank 20; anyone may join; the last one out closes it', () => {
  const { lobby, ranks, client, last } = setup();
  const a = client('a', 'alice');
  const b = client('b', 'bob');
  lobby.handle('a', { t: 'guild_create', name: 'Night Shift', tag: 'NS' });
  assert.equal(last('a', 'guildErr').why, 'purchase');
  lobby.social.markPurchase(a.token);
  lobby.handle('a', { t: 'guild_create', name: 'Night Shift', tag: 'NS' });
  assert.equal(last('a', 'guildErr').why, 'rank');
  ranks.add(a.token, 10_000_000);
  assert.ok(ranks.get(a.token).rank >= GUILD_RANK);
  lobby.handle('a', { t: 'guild_create', name: 'Night Shift', tag: 'ns' });
  const gid = last('a', 'guildDone').id;
  assert.ok(gid);
  lobby.handle('b', { t: 'guilds' });
  assert.equal(last('b', 'guilds').list[0].tag, 'NS');
  lobby.handle('b', { t: 'guild_join', id: gid });
  lobby.handle('b', { t: 'guild', id: gid });
  assert.equal(last('b', 'guild').members.length, 2);
  lobby.handle('a', { t: 'guild_leave' });
  assert.equal(lobby.social.guilds.get(gid).owner, b.id, 'ownership passes on');
  lobby.handle('b', { t: 'guild_leave' });
  assert.equal(lobby.social.guilds.has(gid), false);
});

test('guild chat reaches every member online, counts unread, and stays with the guild', () => {
  const { lobby, ranks, client, last, tick } = setup();
  const a = client('a', 'alice');
  const b = client('b', 'bob');
  const c = client('c', 'carol');
  lobby.social.markPurchase(a.token);
  ranks.add(a.token, 10_000_000);
  lobby.handle('a', { t: 'guild_create', name: 'Night Shift', tag: 'NS' });
  const gid = last('a', 'guildDone').id;
  lobby.handle('b', { t: 'guild_join', id: gid });
  lobby.handle('c', { t: 'guild_say', text: 'let me in' });
  assert.equal(last('c', 'err').msg, 'You are not in a guild.');
  tick(1000);
  lobby.handle('a', { t: 'guild_say', text: 'raid at 9 <b>' });
  const got = last('b', 'guild_msg');
  assert.equal(got.gid, gid);
  assert.equal(got.m.text, 'raid at 9 b', 'no markup');
  assert.equal(got.m.n, 'alice');
  assert.equal(got.gUnread, 1);
  assert.equal(last('a', 'guild_msg').gUnread, 0, 'your own message is not unread');
  assert.equal(last('c', 'guild_msg'), undefined, 'outsiders hear nothing');
  lobby.handle('a', { t: 'guild_say', text: 'again' });
  assert.equal(last('a', 'err').msg, 'Slow down a little.');
  lobby.handle('b', { t: 'hello', token: b.token });
  assert.equal(last('b', 'welcome').social.gUnread, 1);
  lobby.handle('b', { t: 'guild_chat' });
  assert.deepEqual(last('b', 'guild_chat').list.map((m) => m.text), ['raid at 9 b']);
  assert.equal(lobby.social.guildUnread(b.token), 0, 'reading clears it');
  // survives a restart
  const again = new SocialBook({ data: JSON.parse(JSON.stringify(lobby.social)) });
  assert.equal(again.guildChat(a.token).length, 1);
  // the last one out closes the guild and its chat
  lobby.handle('a', { t: 'guild_leave' });
  lobby.handle('b', { t: 'guild_leave' });
  assert.equal(lobby.social.gchat.has(gid), false);
});

test('invite someone online into the room you are waiting in', () => {
  const { lobby, client, last, inbox } = setup();
  client('a', 'alice');
  const b = client('b', 'bob');
  lobby.handle('a', { t: 'invite', id: b.id });
  assert.match(last('a', 'err').msg, /Open a room first/);
  lobby.handle('a', { t: 'join', stake: 1000, mode: 'duel' });
  lobby.handle('a', { t: 'invite', id: b.id });
  const inv = last('b', 'invited');
  assert.equal(inv.from.n, 'alice');
  assert.equal(inv.mode, 'duel');
  assert.equal(inv.stake, 1000);
  inbox.get('a').length = 0;
  lobby.handle('a', { t: 'invite', id: b.id });
  assert.match(last('a', 'err').msg, /already/);
});

test('the social book survives a restart', () => {
  const s = new SocialBook();
  s.touch('k1', 'alice');
  s.touch('k2', 'bob');
  s.addFriend('k1', s.get('k2').id);
  const t = new SocialBook({ data: JSON.parse(JSON.stringify(s.toJSON())) });
  assert.equal(t.get('k2').in[0], s.get('k1').id);
  assert.equal(t.keyOf(s.get('k1').id), 'k1');
});
