// One runner per account on every device, unique names, and the reward for following the
// game's channels (shared/community.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { PromoBook } from '../shared/promo.js';
import { SocialBook } from '../shared/social.js';
import { COMMUNITY_TITLE } from '../shared/community.js';
import { seasonTitle } from '../shared/ranked.js';

function setup() {
  const inbox = new Map();
  let n = 0;
  const lobby = new Lobby({ wallet: new MemoryWallet(), promo: new PromoBook(), bots: false, send: (cid, m) => (inbox.get(cid) ?? inbox.set(cid, []).get(cid)).push(m), newToken: () => `tok${String(++n).padStart(8, '0')}` });
  const last = (cid, t) => [...(inbox.get(cid) ?? [])].reverse().find((m) => m.t === t);
  const hello = (cid, msg) => {
    lobby.connect(cid);
    lobby.handle(cid, { t: 'hello', ...msg });
    return last(cid, 'welcome');
  };
  return { lobby, last, hello };
}

test('a second device with the same account gets the same runner, not a new one', () => {
  const { lobby, hello } = setup();
  const pc = hello(1, { name: 'Tsubasa' });
  assert.equal(pc.name, 'Tsubasa');
  assert.equal(pc.fresh, true);
  // the phone remembers nothing, or another name: the account's name wins
  const phone = hello(2, { token: pc.token, name: 'runner' });
  assert.equal(phone.name, 'Tsubasa');
  assert.equal(phone.fresh, false);
  const tablet = hello(3, { token: pc.token, name: 'SomethingElse' });
  assert.equal(tablet.name, 'Tsubasa');
  assert.equal(lobby.social.get(pc.token).name, 'Tsubasa');
  // joining a table with another name does not rename the account either
  lobby.handle(3, { t: 'join', stake: 1, mode: 'raid', name: 'Impostor' });
  assert.equal(lobby.social.get(pc.token).name, 'Tsubasa');
});

test('names are unique (any case): a taken one becomes the next free variant, a rename is refused', () => {
  const { lobby, hello, last } = setup();
  const a = hello(1, { name: 'tsubasap2e' });
  const b = hello(2, { name: 'TSUBASAP2E' });
  assert.equal(a.name, 'tsubasap2e');
  assert.equal(b.name, 'TSUBASAP2E2');
  lobby.handle(2, { t: 'rename', name: 'TsubasaP2E' });
  assert.equal(last(2, 'err').code, 'name_taken');
  assert.equal(lobby.social.get(b.token).name, 'TSUBASAP2E2');
  lobby.handle(2, { t: 'name_check', name: 'tsubasap2e' });
  assert.equal(last(2, 'name_check').free, false);
  lobby.handle(2, { t: 'name_check', name: 'Kaito' });
  assert.equal(last(2, 'name_check').free, true);
  lobby.handle(2, { t: 'rename', name: 'Kaito' });
  assert.equal(last(2, 'renamed').name, 'Kaito');
  // the old name is free again
  lobby.handle(1, { t: 'name_check', name: 'TSUBASAP2E2' });
  assert.equal(last(1, 'name_check').free, true);
});

test('names saved twice before they were unique: the first runner keeps it', () => {
  const sb = new SocialBook({
    data: {
      players: {
        late: { id: 'aaaa', name: 'tsubasap2e', created: 200, seen: 300, friends: [], out: [], in: [], unread: {} },
        early: { id: 'bbbb', name: 'tsubasap2e', created: 100, seen: 100, friends: [], out: [], in: [], unread: {} },
      },
    },
  });
  assert.equal(sb.get('early').name, 'tsubasap2e');
  assert.equal(sb.get('late').name, 'tsubasap2e2');
});

test('following a channel pays a wheel spin once, and the first one the Community Member title', () => {
  const { lobby, hello, last } = setup();
  const w = hello(1, { name: 'Fan' });
  assert.deepEqual(w.community, []);
  const spins = () => lobby.inventory.view(w.token).spins ?? 0;
  const s0 = spins();
  lobby.handle(1, { t: 'community', id: 'x' });
  assert.equal(last(1, 'community').got.title, COMMUNITY_TITLE);
  assert.equal(spins(), s0 + 1);
  assert.ok(lobby.ranks.stitleIds(w.token).includes(COMMUNITY_TITLE));
  assert.ok(seasonTitle(COMMUNITY_TITLE).forever);
  lobby.handle(1, { t: 'community', id: 'x' });
  assert.equal(last(1, 'community').got, null, 'once per channel');
  assert.equal(spins(), s0 + 1);
  lobby.handle(1, { t: 'community', id: 'tg' });
  assert.equal(last(1, 'community').got.title, null, 'the title only once');
  assert.equal(spins(), s0 + 2);
  lobby.handle(1, { t: 'community', id: 'discord' });
  assert.deepEqual(last(1, 'community').claimed, ['x', 'tg']);
  // another device of the same account sees it claimed
  assert.deepEqual(hello(2, { token: w.token }).community, ['x', 'tg']);
});
