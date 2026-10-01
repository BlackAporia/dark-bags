import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { Inventory, BOXES, BOX, OUTFITS, OUTFIT, PITY, RARITIES, RARITY_ORDER, TRIAL_MS, WEAPON_SKINS, WSKIN, MAX_OPEN, rollRarity, botLook, boxCost } from '../shared/cosmetics.js';
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

test('pity guarantees Epic within 15 and Legendary within 60 opens, even on bad luck', () => {
  const unlucky = () => 0; // always the worst roll (commons first)
  const inv = new Inventory({ rnd: unlucky });
  inv.rec('p').credit = 1e9;
  const got = [];
  for (let i = 0; i < PITY.legendary; i++) got.push(inv.open('p', 'street'));
  assert.equal(got[PITY.epic - 1].rarity, 'epic', 'the 15th open is the pity epic');
  assert.ok(got[PITY.epic - 1].pity);
  assert.ok(got.slice(0, PITY.epic - 1).every((r) => r.rarity === 'common'));
  assert.equal(got[PITY.legendary - 1].rarity, 'legendary');
  assert.ok(got[PITY.legendary - 1].pity && got[PITY.legendary - 1].jackpot);
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
  for (const o of OUTFITS) assert.equal(o.price, undefined, `${o.id} is not sold outright: bags only`);
  const old = new Inventory({ data: { p: { scrap: 300, credit: 5 } } });
  assert.equal(old.view('p').credit, 155, 'leftover scrap from old saves becomes $ bonus');
  assert.ok(!('scrap' in old.rec('p')));
});

test('skins come only from boxes: shop $ first, the shortfall from USDC/USDT; boxes you hold open free', () => {
  let now = 1_000_000;
  const inv = new Inventory({ now: () => now, rnd: seeded(5) });
  let wallet = 500; // cents of stablecoin the player holds
  const pay = (c) => (wallet >= c ? ((wallet -= c), true) : false);
  assert.equal(inv.buy, undefined, 'there is no direct purchase');
  assert.deepEqual(inv.view('p').boxes, { street: 1, 'w-scrap': 1 }, 'a welcome bag and crate');
  const first = inv.open('p', 'street', pay);
  assert.ok(first.ok && first.free);
  assert.equal(wallet, 500, 'the welcome bag cost nothing');
  inv.rec('p').credit = 30;
  const bag = inv.open('p', 'street', pay);
  assert.ok(bag.ok && !bag.free);
  assert.equal(inv.view('p').credit, bag.refund, 'shop $ goes first');
  assert.equal(wallet, 500 - (BOX.street.price - 30), 'then the stablecoin');
  wallet = 1000;
  inv.rec('p').credit = 0;
  const pack = inv.topUp('p', 'p10', pay);
  assert.ok(pack.ok);
  assert.equal(wallet, 0);
  assert.equal(pack.first, 1000, 'the first top-up doubles');
  assert.equal(inv.view('p').credit, 2050, 'the $10 pack gives $10.50 of shop $, plus $10 for being the first');
  assert.equal(inv.view('p').firstTopup, false);
  assert.equal(inv.topUp('p', 'p10', pay).ok, false, 'packs need USDC/USDT');
  wallet = 1000;
  inv.rec('p').credit = 0;
  assert.equal(inv.topUp('p', 'p10', pay).added, 1050, 'only the first one doubles');
  inv.rec('p').credit = 0;
  assert.equal(inv.open('p', 'genesis', pay).ok, false, 'cannot afford');
  assert.equal(inv.view('p').boxes.street, 0);

  assert.ok(inv.equip('p', first.item).ok, 'what you pulled can be worn');
  assert.ok(inv.equip('p', 'basic-3').ok, 'basic outfits are free for everyone');
  assert.equal(inv.equip('p', 'golden-bull').ok, false);
  assert.ok(inv.setBody('p', 'f').ok);
  assert.equal(inv.setBody('p', 'x').ok, false);
  assert.equal(inv.look('p').outfit, 'basic-3');
  const saved = new Inventory({ data: JSON.parse(JSON.stringify(inv.toJSON())), now: () => now });
  assert.deepEqual(saved.view('p'), inv.view('p'));
  for (let i = 0; i < 100; i++) assert.ok(OUTFIT[botLook(Math.random).outfit]);
});

test('buy many at once: one charge, held boxes first, a result per box', () => {
  const inv = new Inventory({ rnd: seeded(21) });
  let wallet = 10_000;
  const pay = (c) => (wallet >= c ? ((wallet -= c), true) : false);
  const r = inv.open('p', 'street', pay, 10);
  assert.ok(r.ok);
  assert.equal(r.results.length, 10);
  assert.equal(r.held, 1, 'the welcome bag went first');
  assert.equal(r.bought, 9);
  assert.equal(wallet, 10_000 - 9 * BOX.street.price, 'nine paid, in one charge');
  assert.ok(r.results[0].free && !r.results[1].free);
  assert.equal(inv.open('p', 'street', () => false, 5).ok, false, 'all or nothing');
  // bulk: 10 paid boxes cost 9, 100 cost 90
  const before = wallet;
  assert.ok(inv.open('p', 'street', pay, 10).ok);
  assert.equal(before - wallet, 9 * BOX.street.price, 'every 10th box free');
  assert.equal(boxCost(BOX.genesis, 100), 90 * BOX.genesis.price);
  inv.rec('p').credit = 1e9;
  assert.equal(inv.open('p', 'street', pay, 10_000).results.length, MAX_OPEN, 'capped per purchase');
});

test('dearer boxes have better odds; weapon crates drop weapon skins you can wear', () => {
  const bags = BOXES.filter((b) => b.family === 'outfit' && b.group === 'tier').sort((a, b) => a.tier - b.tier);
  const ev = (b) => RARITY_ORDER.reduce((s, k, i) => s + (b.odds[k] ?? 0) * i, 0);
  for (let i = 1; i < bags.length; i++) assert.ok(ev(bags[i]) > ev(bags[i - 1]), `${bags[i].id} beats ${bags[i - 1].id}`);
  assert.equal(bags[0].price, 49, 'an impulse-priced entry box');
  assert.equal(bags.at(-1).price, 9999, 'a $99.99 ceiling');
  // every step up is better value: an Exotic costs less per dollar the dearer the box
  const perExotic = bags.filter((b) => b.odds.exotic).map((b) => b.price / b.odds.exotic);
  for (let i = 1; i < perExotic.length; i++) assert.ok(perExotic[i] < perExotic[i - 1], 'Exotics get cheaper per $ up the ladder');
  for (const b of BOXES) assert.equal(Math.round(Object.values(b.odds).reduce((a, c) => a + c, 0) * 100), 10000, `${b.id} odds add up to 100%`);
  assert.equal(BOXES.filter((b) => b.family === 'weapon' && b.group === 'tier').length, 9, 'weapon crates sold separately');

  const inv = new Inventory({ rnd: seeded(4) });
  inv.rec('p').credit = 1e9;
  const r = inv.open('p', 'w-diamond', null, 20);
  assert.ok(r.results.every((x) => x.kind === 'weapon' && WSKIN[x.item]));
  const got = r.results[0].item;
  assert.ok(inv.view('p').wowned.includes(got));
  assert.equal(inv.view('p').owned.length, 0, 'crates never drop outfits');
  assert.ok(inv.equipWeapon('p', got).ok);
  const [w, f] = got.split('.');
  assert.equal(inv.look('p').ws[w], f, 'others see your weapon skin');
  assert.equal(inv.equipWeapon('p', 'knife.prism').ok, inv.view('p').wowned.includes('knife.prism'));
  assert.ok(inv.equipWeapon('p', `${w}.default`).ok);
  assert.equal(inv.look('p').ws[w], undefined);
  assert.ok(WEAPON_SKINS.length >= 100);
});

test('limited editions: a fixed supply, numbered, never over-minted', () => {
  const inv = new Inventory({ rnd: seeded(8) });
  const lim = OUTFITS.filter((o) => o.limited);
  assert.ok(lim.length >= 3);
  let players = 0;
  // many whales opening the $999 tier until the smallest edition sells out
  const smallest = lim.reduce((a, b) => (a.limited < b.limited ? a : b));
  while ((inv.minted[smallest.id] ?? 0) < smallest.limited && players < 3000) {
    const k = `whale${players++}`;
    inv.rec(k).credit = 1e9;
    inv.open(k, 'genesis', null, 5);
  }
  assert.equal(inv.minted[smallest.id], smallest.limited, 'sold out');
  const serials = [...inv.data.values()].filter((r) => r.serials[smallest.id]).map((r) => r.serials[smallest.id]).sort((a, b) => a - b);
  assert.deepEqual(serials, Array.from({ length: smallest.limited }, (_, i) => i + 1), 'numbered 1..N, no gaps, no repeats');
  inv.rec('late').credit = 1e9;
  const late = inv.open('late', 'genesis', null, 100);
  assert.ok(!late.results.some((x) => x.item === smallest.id), 'no drops after it sells out');
  const reloaded = new Inventory({ data: JSON.parse(JSON.stringify(inv.toJSON())) });
  assert.equal(reloaded.minted[smallest.id], smallest.limited, 'the count survives a restart');
  assert.equal(inv.view('late').supply[smallest.id].minted, smallest.limited);
});

test('a rank-up pays only a 72h trial outfit, which expires', () => {
  let now = 5_000_000;
  const inv = new Inventory({ now: () => now, rnd: seeded(9) });
  const got = inv.rankUp('p', 1, 4);
  assert.equal(got.length, 3);
  const v = inv.view('p');
  assert.equal(Object.values(v.boxes).reduce((a, b) => a + b, 0), 2, 'no boxes beyond the welcome bag and crate');
  assert.equal(v.credit, 0, 'no shop $');
  assert.deepEqual(Object.keys(got[0]).sort(), ['rank', 'trial']);
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
  // shop $ comes from USDC/USDT, cents × 10⁴ for 6 decimals
  const usdc = BigInt(wallet.balance('tok00001', 'USDC'));
  lobby.handle(1, { t: 'box', id: 'vault' });
  const paid = last('locker');
  assert.equal(paid.op, 'box');
  assert.equal(BigInt(wallet.balance('tok00001', 'USDC')), usdc - BigInt(BOX.vault.price) * 10n ** 4n);
  lobby.handle(1, { t: 'topup', id: 'p5' });
  assert.equal(last('locker').locker.credit, 1000, 'the first $5 top-up doubles to $10 of shop $');
  assert.equal(BigInt(wallet.balance('tok00001', 'USDC')), usdc - BigInt(BOX.vault.price + 500) * 10n ** 4n);
  const strk = BigInt(wallet.balance('tok00001', 'STRK'));
  assert.ok(strk > 0n);
  lobby.handle(1, { t: 'equip', id: paid.result.item });
  lobby.handle(1, { t: 'body', id: 'f' });
  assert.equal(last('locker').locker.body, 'f');

  lobby.handle(1, { t: 'join', stake: 100 });
  lobby.handle(1, { t: 'ready', asset: 'STRK' });
  const room = lobby.rooms.get('raid:100');
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
  assert.ok(res.rewards.every((r) => r.trial), 'each rank-up is a trial outfit');
  assert.equal(res.locker.credit, 1000, 'rank-ups add no shop $');
  assert.ok(BigInt(res.balances.STRK) < strk, 'staked in STRK');
});

test('the top tiers guarantee an Exotic within their pity window', () => {
  const inv = new Inventory({ rnd: () => 0 }); // always the worst roll
  inv.rec('p').credit = 1e9;
  for (const id of ['royal', 'apex', 'genesis']) {
    const n = BOX[id].exoticPity;
    const r = inv.open('p', id, null, n);
    assert.equal(r.results.at(-1).rarity, 'exotic', `${id}: exotic by open ${n}`);
    assert.ok(r.results.slice(0, -1).every((x) => x.rarity !== 'exotic'));
  }
});

test('the first top-up bonus is capped at $10', async () => {
  const { Inventory, firstBonus } = await import('../shared/cosmetics.js');
  assert.equal(firstBonus(500), 500);
  assert.equal(firstBonus(100000), 10000);
  const inv = new Inventory();
  inv.rec('w');
  const r = inv.topUp('w', 'p100', () => true);
  assert.equal(r.added, 10000 + 2000 + 10000);
});

test('collection cases: every rarity they list can drop, and only from their collection', async () => {
  const { BOXES, boxCatalog, RARITY_ORDER, Inventory } = await import('../shared/cosmetics.js');
  const themed = BOXES.filter((b) => b.group !== 'tier');
  assert.ok(themed.length >= 15);
  for (const b of themed) {
    const cat = boxCatalog(b);
    for (const r of RARITY_ORDER) if (b.odds[r] > 0) assert.ok(cat.some((i) => i.rarity === r && !i.basic), `${b.id} has a ${r}`);
  }
  let seed = 7;
  const inv = new Inventory({ rnd: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) });
  inv.rec('p').credit = 1e9;
  for (const id of ['c-knife', 'c-samurai', 'b-cyber']) {
    const ids = new Set(boxCatalog(BOXES.find((b) => b.id === id)).map((i) => i.id));
    const r = inv.open('p', id, null, 100);
    assert.ok(r.ok, id);
    for (const x of r.results) assert.ok(ids.has(x.item), `${id} dropped ${x.item}`);
  }
});
