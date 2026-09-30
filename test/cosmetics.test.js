import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { Inventory, BOXES, BOX, OUTFITS, OUTFIT, PITY, RARITIES, RARITY_ORDER, START_MARKS, rollRarity, botLook, raidMarks } from '../shared/cosmetics.js';
import { RoomCore } from '../shared/room.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('catalog: every outfit valid, every box sums to 100% and has something to drop', () => {
  const ids = new Set();
  for (const o of OUTFITS) {
    assert.ok(!ids.has(o.id), `duplicate id ${o.id}`);
    ids.add(o.id);
    assert.ok(RARITIES[o.rarity], o.id);
    assert.match(o.color, /^#[0-9a-f]{6}$/i);
  }
  for (const b of BOXES) {
    const sum = Object.values(b.odds).reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(sum - 100) < 1e-9, `${b.id} odds add up to ${sum}`);
    for (const [r, p] of Object.entries(b.odds)) if (p > 0) assert.ok(OUTFITS.some((o) => o.rarity === r && !o.basic), `${b.id} can roll ${r}`);
  }
});

test('published odds match what boxes actually drop', () => {
  const rnd = seeded(7);
  for (const b of BOXES) {
    const n = 40000;
    const got = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
    for (let i = 0; i < n; i++) got[rollRarity(b, { sinceEpic: 0, sinceLegendary: 0 }, rnd).rarity]++;
    for (const r of RARITY_ORDER) {
      const want = b.odds[r] ?? 0;
      const seen = (got[r] / n) * 100;
      assert.ok(Math.abs(seen - want) < 1, `${b.id} ${r}: published ${want}%, dropped ${seen.toFixed(2)}%`);
    }
  }
});

test('pity guarantees Epic within 10 and Legendary within 40 opens, even on bad luck', () => {
  const unlucky = () => 0; // always the worst roll (commons first)
  const inv = new Inventory({ rnd: unlucky });
  inv.addMarks('p', 1e9);
  const got = [];
  for (let i = 0; i < 40; i++) got.push(inv.open('p', 'street'));
  assert.ok(got.slice(0, 10).some((r) => r.rarity === 'epic' && r.pity), 'epic by the 10th open');
  assert.equal(got[39].rarity, 'legendary');
  assert.ok(got[39].pity && got[39].jackpot);
  assert.equal(got[9].rarity, 'epic', 'the 10th open is the pity epic');
  assert.ok(got.slice(0, 9).every((r) => r.rarity === 'common'));
  const view = inv.view('p');
  assert.equal(view.pity.street.sinceLegendary, 0);
});

test('smart drops: no duplicates until a rarity is complete, then scrap crafts what you want', () => {
  const inv = new Inventory({ rnd: seeded(3) });
  inv.addMarks('p', 1e9);
  const commons = OUTFITS.filter((o) => o.rarity === 'common' && !o.basic).length;
  const seen = [];
  let firstDup = null;
  for (let i = 0; i < 200; i++) {
    const r = inv.open('p', 'street');
    if (r.rarity !== 'common') continue;
    if (r.dup && firstDup === null) firstDup = seen.length;
    seen.push(r);
  }
  assert.equal(firstDup, commons, 'the first common duplicate comes only after all commons are owned');
  const view = inv.view('p');
  assert.ok(view.scrap > 0);
  const missing = OUTFITS.find((o) => !o.basic && !view.owned.includes(o.id));
  if (missing) {
    inv.data.get('p').scrap = RARITIES[missing.rarity].craft;
    assert.ok(inv.craft('p', missing.id).ok);
    assert.equal(inv.view('p').scrap, 0);
    assert.ok(inv.owns('p', missing.id));
  }
});

test('shop, equip and character: marks spent once, only owned outfits can be worn', () => {
  const inv = new Inventory();
  assert.equal(inv.view('p').marks, START_MARKS);
  assert.equal(inv.equip('p', 'satoshi').ok, false);
  assert.equal(inv.buy('p', 'satoshi').ok, false, 'legendaries are not in the shop');
  assert.equal(inv.buy('p', 'night-ops').ok, false, 'not enough marks');
  assert.ok(inv.buy('p', 'olive').ok);
  assert.equal(inv.view('p').marks, START_MARKS - OUTFIT.olive.price);
  assert.equal(inv.buy('p', 'olive').ok, false, 'no double buy');
  assert.ok(inv.equip('p', 'olive').ok);
  assert.ok(inv.equip('p', 'basic-3').ok, 'basic outfits are free for everyone');
  assert.ok(inv.setBody('p', 'f').ok);
  assert.equal(inv.setBody('p', 'x').ok, false);
  assert.deepEqual(inv.look('p'), { outfit: 'basic-3', body: 'f' });
  assert.equal(inv.open('p', 'golden').ok, false, 'cannot afford');
  assert.equal(inv.view('p').marks, START_MARKS - OUTFIT.olive.price, 'a refused box costs nothing');
  const saved = new Inventory({ data: JSON.parse(JSON.stringify(inv.toJSON())) });
  assert.deepEqual(saved.view('p'), inv.view('p'));
  for (let i = 0; i < 100; i++) assert.ok(OUTFIT[botLook(Math.random).outfit]);
  assert.ok(raidMarks(0) > 0);
});

test('raids pay marks, and the lobby handles locker messages end to end', () => {
  const out = [];
  const wallet = new MemoryWallet();
  const lobby = new Lobby({ wallet, send: (cid, m) => out.push(m), newToken: () => 'tok00001', bots: false, prepSeconds: 1, practice: true });
  const last = (t) => out.filter((m) => m.t === t).at(-1);
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'me' });
  const w = last('welcome');
  assert.equal(w.locker.marks, START_MARKS);
  assert.ok(w.catalog.boxes.length === BOXES.length);
  lobby.handle(1, { t: 'box', id: 'street' });
  const opened = last('locker');
  assert.equal(opened.op, 'box');
  assert.ok(OUTFIT[opened.result.item]);
  assert.equal(opened.locker.marks, START_MARKS - BOX.street.price);
  lobby.handle(1, { t: 'equip', id: opened.result.item });
  lobby.handle(1, { t: 'body', id: 'f' });
  assert.equal(last('locker').locker.body, 'f');

  lobby.handle(1, { t: 'join', stake: 100 });
  lobby.handle(1, { t: 'ready', asset: 'SATS' });
  const room = lobby.rooms.get(100);
  for (let i = 0; i < CFG.TICK_RATE * 2 && room.state !== 'live'; i++) lobby.tick();
  const me = room.world.players.get(room.clients.get(1).pid);
  assert.equal(me.outfit, opened.result.item, 'the equipped outfit goes into the raid');
  assert.equal(me.body, 'f');
  room.world.kill(me, null, 'storm');
  lobby.tick();
  const res = last('result');
  assert.ok(res.marks.gained > 0);
  assert.equal(res.marks.total, START_MARKS - BOX.street.price + res.marks.gained);
});
