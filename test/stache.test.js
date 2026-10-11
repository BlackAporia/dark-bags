// STACHE: the coin, the Stache Case (every kind, paid in STACHE only), and the first-100 gift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { PromoBook } from '../shared/promo.js';
import { Inventory, BOX, boxCatalog, OUTFIT, WSKIN } from '../shared/cosmetics.js';
import { STYLE } from '../shared/style.js';
import { STACHE_CASE_ID, STACHE_TITLE, isStache, STACHE_ADDRESS } from '../shared/stache.js';
import { titleBonus, foreverBonus, seasonTitle } from '../shared/ranked.js';

function setup({ promo = new PromoBook() } = {}) {
  const inbox = new Map();
  const wallet = new MemoryWallet();
  let n = 0;
  const lobby = new Lobby({ wallet, promo, bots: false, send: (cid, m) => (inbox.get(cid) ?? inbox.set(cid, []).get(cid)).push(m), newToken: () => `tok${++n}` });
  const client = (cid) => {
    lobby.connect(cid);
    lobby.handle(cid, { t: 'hello', name: `p${cid}` });
    const token = inbox.get(cid).find((m) => m.t === 'welcome').token;
    return { cid, token, last: (t) => [...inbox.get(cid)].reverse().find((m) => m.t === t) };
  };
  return { lobby, wallet, client };
}

test('the coin: its address and the test id, nothing else', () => {
  assert.ok(isStache(STACHE_ADDRESS));
  assert.ok(isStache(STACHE_ADDRESS.toUpperCase().replace('0X', '0x')));
  assert.ok(isStache('STACHE'));
  assert.ok(!isStache('0x1234'));
  assert.ok(!isStache('stache'));
});

test('the Stache Case: runners, weapon skins and style, all of them only there', () => {
  const cat = boxCatalog(BOX[STACHE_CASE_ID]);
  const kinds = new Set(cat.map((i) => i._k));
  assert.deepEqual([...kinds].sort(), ['outfit', 'style', 'weapon']);
  assert.ok(new Set(cat.map((i) => i.rarity)).size >= 5, 'every rarity, common to exotic');
  for (const i of cat) assert.ok((i._k === 'outfit' ? OUTFIT : i._k === 'weapon' ? WSKIN : STYLE)[i.id], i.id);
  // nothing else drops them
  for (const b of Object.values(BOX)) if (b.id !== STACHE_CASE_ID) assert.ok(!boxCatalog(b).some((i) => i.stacheItem), b.id);
  // opening lands each kind in its own list
  const inv = new Inventory({ rnd: (() => { let x = 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })() });
  inv.give('a', { k: 'box', id: STACHE_CASE_ID, n: 60 });
  const r = inv.open('a', STACHE_CASE_ID, null, 60);
  assert.ok(r.ok);
  const v = inv.view('a');
  for (const x of r.results) {
    const list = x.kind === 'outfit' ? v.owned : x.kind === 'weapon' ? v.wowned : v.sowned;
    assert.ok(list.includes(x.item), `${x.kind} ${x.item}`);
  }
  assert.ok(new Set(r.results.map((x) => x.kind)).size === 3, 'sixty opens show every kind');
});

test('bought only with STACHE, at its live price, never with shop $', () => {
  const { lobby, wallet, client } = setup();
  const c = client(1);
  lobby.inventory.rec(c.token).credit = 10_000; // $100 of shop $ does not buy it
  const stache = () => wallet.balance(c.token, 'STACHE');
  const before = stache();
  for (const id of ['USDC', 'USDT']) wallet.debit(c.token, id, wallet.balance(c.token, id));
  lobby.handle(1, { t: 'box', id: STACHE_CASE_ID, n: 1 });
  assert.equal(c.last('locker')?.op, 'box', c.last('err')?.msg);
  const paid = before - stache();
  const want = lobby.prices.quote('STACHE', 990);
  assert.equal(paid, want, 'exactly $0.99 of STACHE');
  assert.ok(paid > 8_000n * 10n ** 18n && paid < 8_500n * 10n ** 18n, 'about 8,412 STACHE');
  assert.equal(lobby.inventory.rec(c.token).credit, 10_000, 'shop $ untouched');
  // no STACHE, no case
  wallet.debit(c.token, 'STACHE', stache());
  lobby.handle(1, { t: 'box', id: STACHE_CASE_ID, n: 1 });
  assert.match(c.last('err').msg, /STACHE/);
});

test('the first 100 to stake STACHE: the title (+5% XP for good) and two cases, once each', () => {
  const promo = new PromoBook({ data: { stache: Array.from({ length: 98 }, (_, i) => ({ key: `old${i}`, at: 0 })) } });
  const { lobby, client } = setup({ promo });
  const a = client(1);
  lobby.handle(1, { t: 'join', stake: 1000 });
  lobby.handle(1, { t: 'ready', asset: 'USDC' });
  assert.equal(promo.stacheLeft(), 2, 'USDC does not count');
  lobby.handle(1, { t: 'unready' });
  lobby.handle(1, { t: 'ready', asset: 'STACHE' });
  assert.equal(promo.stacheLeft(), 1);
  // the gift waits in the mailbox, one letter with everything, claimed with one button
  assert.ok(!lobby.ranks.stitleIds(a.token).includes(STACHE_TITLE), 'nothing until it is claimed');
  const letter = lobby.mail.inbox(a.token).find((m) => m.i18n === 'stache');
  assert.equal(letter.gift.k, 'bundle');
  lobby.handle(1, { t: 'mail_claim', id: letter.id });
  assert.ok(lobby.ranks.stitleIds(a.token).includes(STACHE_TITLE));
  assert.equal(lobby.ranks.neon(a.token), STACHE_TITLE, 'worn at once');
  assert.equal(lobby.inventory.rec(a.token).boxes[STACHE_CASE_ID], 2, 'two cases at full odds (not gifts capped at Epic)');
  lobby.handle(1, { t: 'mail_claim', id: letter.id });
  assert.equal(lobby.inventory.rec(a.token).boxes[STACHE_CASE_ID], 2, 'claimed once');
  // once per player
  lobby.handle(1, { t: 'unready' });
  lobby.handle(1, { t: 'ready', asset: 'STACHE' });
  assert.equal(promo.stacheLeft(), 1);
  // the 100th, then none
  const b = client(2);
  lobby.handle(2, { t: 'join', stake: 100 });
  lobby.handle(2, { t: 'ready', asset: 'STACHE' });
  assert.equal(promo.stacheLeft(), 0);
  const c = client(3);
  lobby.handle(3, { t: 'join', stake: 100 });
  lobby.handle(3, { t: 'ready', asset: 'STACHE' });
  assert.ok(!lobby.mail.inbox(c.token).some((m) => m.i18n === 'stache'), 'the 101st gets nothing');
  assert.ok(lobby.mail.inbox(b.token).some((m) => m.i18n === 'stache'));
  // the bonus never ends, worn or not
  assert.equal(seasonTitle(STACHE_TITLE).forever, true);
  assert.equal(titleBonus(STACHE_TITLE, Date.UTC(2030, 0, 1)), 0.05);
  assert.equal(foreverBonus([STACHE_TITLE], null), 0.05);
  assert.equal(foreverBonus([STACHE_TITLE], STACHE_TITLE), 0, 'worn: counted once, by the worn title');
});

test('the early gifts (granted before letters) get their letter once more, with two more cases', () => {
  const promo = new PromoBook({ data: { stache: [{ key: 'me', at: 1 }, { key: 'friend', at: 2 }, { key: 'third', at: 3 }] } });
  const { lobby } = setup({ promo });
  lobby.mail.send({ key: 'third', kind: 'gift', title: 'STACHE gift', i18n: 'stache', gift: { k: 'box', id: STACHE_CASE_ID, n: 2 } }); // got the letter already
  lobby.ranks.addForeverTitle('me', STACHE_TITLE); // the title was already given to the first
  assert.equal(lobby.resendStacheGifts(), 2);
  assert.equal(lobby.resendStacheGifts(), 0, 'once');
  assert.equal(lobby.mail.inbox('third').filter((m) => m.i18n === 'stache').length, 1, 'no second letter for one who had it');
  const mine = lobby.mail.inbox('me').find((m) => m.i18n === 'stache').gift;
  assert.deepEqual(mine.items.map((x) => x.k), ['box'], 'the title is not sent twice');
  const friend = lobby.mail.inbox('friend').find((m) => m.i18n === 'stache').gift;
  assert.deepEqual(friend.items.map((x) => x.k), ['ntitle', 'box']);
  assert.equal(friend.items[1].n, 2);
});
