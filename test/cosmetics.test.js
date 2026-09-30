import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { Inventory, BOXES, BOX, OUTFITS, OUTFIT, PITY, RARITIES, RARITY_ORDER, TRIAL_MS, rollRarity, botLook } from '../shared/cosmetics.js';
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
  inv.rec('p').credit = 1e9;
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

test('smart drops: no duplicates until a rarity is complete, then duplicates pay $ back', () => {
  const inv = new Inventory({ rnd: seeded(3) });
  inv.rec('p').credit = 1e9;
  const commons = OUTFITS.filter((o) => o.rarity === 'common' && !o.basic).length;
  const seen = [];
  let firstDup = null;
  for (let i = 0; i < 200; i++) {
    const r = inv.open('p', 'street');
    if (r.rarity !== 'common') continue;
    if (r.dup && firstDup === null) {
      firstDup = seen.length;
      assert.equal(r.refund, RARITIES.common.refund);
    }
    seen.push(r);
  }
  assert.equal(firstDup, commons, 'the first common duplicate comes only after all commons are owned');
  for (const o of OUTFITS) if (!o.basic) assert.equal(o.price, RARITIES[o.rarity].price, `${o.id} can be bought outright`);
  const old = new Inventory({ data: { p: { scrap: 300, credit: 5 } } });
  assert.equal(old.view('p').credit, 155, 'leftover scrap from old saves becomes $ bonus');
  assert.ok(!('scrap' in old.rec('p')));
});

test('shop in $: credit first, then USDC/USDT; bags you hold open free', () => {
  let now = 1_000_000;
  const inv = new Inventory({ now: () => now, rnd: seeded(5) });
  let wallet = 500; // cents of stablecoin the player holds
  const pay = (c) => (wallet >= c ? ((wallet -= c), true) : false);
  assert.equal(inv.view('p').credit, 0);
  assert.equal(inv.view('p').boxes.street, 1, 'a welcome bag');
  const first = inv.open('p', 'street', pay);
  assert.ok(first.ok && first.free);
  assert.equal(wallet, 500, 'the welcome bag cost nothing');

  assert.equal(inv.equip('p', 'satoshi').ok, false);
  assert.equal(inv.buy('p', 'satoshi', pay).ok, false, 'a legendary costs more than the player has');
  inv.rec('p').credit = 30;
  const olive = inv.buy('p', 'olive', pay);
  assert.ok(olive.ok);
  assert.equal(inv.view('p').credit, 0, 'credit goes first');
  assert.equal(wallet, 500 - (OUTFIT.olive.price - 30), 'then the stablecoin');
  assert.equal(inv.buy('p', 'olive', pay).ok, false, 'no double buy');
  wallet = 0;
  assert.equal(inv.open('p', 'golden', pay).ok, false, 'cannot afford');
  assert.equal(inv.view('p').boxes.street, 0);

  assert.ok(inv.equip('p', 'olive').ok);
  assert.ok(inv.equip('p', 'basic-3').ok, 'basic outfits are free for everyone');
  assert.ok(inv.setBody('p', 'f').ok);
  assert.equal(inv.setBody('p', 'x').ok, false);
  assert.deepEqual(inv.look('p'), { outfit: 'basic-3', body: 'f' });
  const saved = new Inventory({ data: JSON.parse(JSON.stringify(inv.toJSON())), now: () => now });
  assert.deepEqual(saved.view('p'), inv.view('p'));
  for (let i = 0; i < 100; i++) assert.ok(OUTFIT[botLook(Math.random).outfit]);
});

test('every rank-up pays a bag, $ credit and a 72h trial outfit that expires', () => {
  let now = 5_000_000;
  const inv = new Inventory({ now: () => now, rnd: seeded(9) });
  const got = inv.rankUp('p', 1, 4);
  assert.equal(got.length, 3);
  const v = inv.view('p');
  assert.equal(Object.values(v.boxes).reduce((a, b) => a + b, 0), 1 + 3);
  assert.ok(v.credit > 0);
  const trial = got[0].trial.id;
  assert.ok(!OUTFIT[trial].basic && !v.owned.includes(trial));
  assert.ok(inv.equip('p', trial).ok, 'a trial can be worn');
  assert.equal(inv.look('p').outfit, trial);
  now += TRIAL_MS + 1;
  assert.equal(inv.look('p').outfit, 'basic-0', 'expired trials come off');
  assert.equal(inv.equip('p', trial).ok, false);
  assert.ok(!(trial in inv.view('p').trials));
});

test('the lobby sells in $ (play balance, or USDC/USDT), and rank-ups arrive with the result', () => {
  const out = [];
  const wallet = new MemoryWallet();
  const lobby = new Lobby({ wallet, send: (cid, m) => out.push(m), newToken: () => 'tok00001', bots: false, prepSeconds: 1, practice: true });
  const last = (t) => out.filter((m) => m.t === t).at(-1);
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'me' });
  const w = last('welcome');
  assert.equal(w.locker.boxes.street, 1);
  assert.equal(w.catalog.boxes.length, BOXES.length);
  lobby.handle(1, { t: 'box', id: 'street' });
  assert.ok(last('locker').result.free);
  // play money: the shop charges the one play balance at the $ rate (1,000 sats = $1)
  const before = BigInt(wallet.balance('tok00001', 'SATS'));
  lobby.handle(1, { t: 'box', id: 'vault' });
  const paid = last('locker');
  assert.equal(paid.op, 'box');
  assert.equal(BigInt(wallet.balance('tok00001', 'SATS')), before - BigInt(BOX.vault.price) * 10n);
  // real tokens: USDC/USDT, cents × 10⁴ for 6 decimals
  const usdc = BigInt(wallet.balance('tok00001', 'USDC'));
  lobby.cashier = {};
  assert.ok(lobby.stablePay('tok00001')(299));
  lobby.cashier = null;
  assert.equal(BigInt(wallet.balance('tok00001', 'USDC')), usdc - 299n * 10n ** 4n);
  lobby.handle(1, { t: 'equip', id: paid.result.item });
  lobby.handle(1, { t: 'body', id: 'f' });
  assert.equal(last('locker').locker.body, 'f');

  lobby.handle(1, { t: 'join', stake: 100 });
  lobby.handle(1, { t: 'ready', asset: 'SATS' });
  const room = lobby.rooms.get(100);
  for (let i = 0; i < CFG.TICK_RATE * 2 && room.state !== 'live'; i++) lobby.tick();
  const me = room.world.players.get(room.clients.get(1).pid);
  assert.equal(me.outfit, paid.result.item, 'the equipped outfit goes into the raid');
  assert.equal(me.body, 'f');
  me.kills = 3;
  me.status = 'alive';
  room.world.extract(me);
  lobby.tick();
  const res = last('result');
  assert.ok(res.rank.after.rank > res.rank.before.rank, 'a good first raid ranks up');
  assert.equal(res.rewards.length, res.rank.after.rank - res.rank.before.rank);
  assert.ok(res.locker.credit > 0);
});
