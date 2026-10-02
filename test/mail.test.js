import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MailBook } from '../shared/mail.js';
import { Inventory, WHEEL, OUTFIT, WSKIN } from '../shared/cosmetics.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';

test('mail: news for all, notes for one, gifts claimed once', () => {
  let t = 1000;
  const mb = new MailBook({ now: () => t });
  mb.rec('a'); // a joins
  mb.send({ title: 'Season 2', body: 'New maps' });
  mb.send({ key: 'a', title: 'For you', gift: { k: 'credit', v: 150 } });
  assert.equal(mb.inbox('a').length, 2);
  assert.equal(mb.inbox('b').length, 1, 'b only sees the broadcast');
  assert.equal(mb.unread('a'), 2);
  const gid = mb.inbox('a').find((m) => m.gift).id;
  assert.deepEqual(mb.claim('a', gid), { k: 'credit', v: 150 });
  assert.equal(mb.claim('a', gid), null, 'once');
  assert.equal(mb.claim('b', gid), null, "not someone else's");
  // a player who joins much later does not get very old news
  t += 30 * 86400000;
  assert.equal(mb.inbox('late').length, 0);
  assert.deepEqual(new MailBook({ data: JSON.parse(JSON.stringify(mb.toJSON())) }).inbox('a').length, 2);
});

test('wheel: a spin pays a 72h trial outfit, a 72h trial weapon skin or up to $2 of shop credit', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const inv = new Inventory({ rnd: Math.random });
    assert.equal(inv.spin('p').ok, false, 'no spins yet');
    inv.give('p', { k: 'spin', n: 1 });
    const r = inv.spin('p');
    assert.ok(r.ok);
    assert.ok(r.slot >= 0 && r.slot < WHEEL.length);
    const v = inv.view('p');
    if (r.prize.k === 'credit') assert.ok(r.prize.v > 0 && r.prize.v <= 200 && v.credit === r.prize.v);
    if (r.prize.k === 'trial') assert.ok(OUTFIT[r.prize.id] && v.trials[r.prize.id] > Date.now() && inv.owns('p', r.prize.id));
    if (r.prize.k === 'wtrial') {
      assert.ok(WSKIN[r.prize.id] && v.wtrials[r.prize.id] > Date.now());
      assert.ok(inv.equipWeapon('p', r.prize.id).ok, 'a trial weapon skin can be worn');
    }
    assert.equal(v.spins, 0);
    seen.add(r.prize.k);
  }
  assert.deepEqual([...seen].sort(), ['credit', 'trial', 'wtrial']);
});

test('welcome bonus: the first top-up gives the Founder title and a letter with a spin, once', () => {
  const out = [];
  const wallet = new MemoryWallet();
  const lobby = new Lobby({ wallet, send: (cid, m) => out.push(m), newToken: () => 'tok00001' });
  const last = (t) => out.filter((m) => m.t === t).at(-1);
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'me' });
  lobby.handle(1, { t: 'topup', id: 'p5' });
  assert.equal(last('mailbox').unread, 1);
  assert.equal(lobby.ranks.title('tok00001'), 'founder');
  lobby.handle(1, { t: 'topup', id: 'p5' });
  lobby.handle(1, { t: 'mail_list' });
  const box = last('mailbox');
  assert.equal(box.list.filter((m) => m.i18n === 'welcome').length, 1, 'only once');
  lobby.handle(1, { t: 'mail_claim', id: box.list[0].id });
  assert.deepEqual(last('mailbox').claimed, { k: 'spin', n: 1 });
  assert.equal(last('mailbox').locker.spins, 1);
  lobby.handle(1, { t: 'spin' });
  assert.ok(last('mailbox').spin.ok);
  assert.equal(last('mailbox').locker.spins, 0);
});

test('welcome bonus catches up: a player who topped up before it existed gets it on the next visit', () => {
  const out = [];
  const lobby = new Lobby({ wallet: new MemoryWallet(), send: (cid, m) => out.push(m), newToken: () => 'tok00002' });
  lobby.inventory.rec('tok00002').bought = 500; // an old top-up
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', token: 'tok00002', name: 'early' });
  assert.equal(lobby.ranks.title('tok00002'), 'founder');
  assert.equal(lobby.mail.inbox('tok00002').filter((m) => m.i18n === 'welcome').length, 1);
  lobby.connect(2);
  lobby.handle(2, { t: 'hello', token: 'tok00002', name: 'early' });
  assert.equal(lobby.mail.inbox('tok00002').filter((m) => m.i18n === 'welcome').length, 1, 'once');
});
