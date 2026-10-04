import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FortuneBook, FORTUNE } from '../shared/fortune.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { OUTFIT, WSKIN } from '../shared/cosmetics.js';

test('fortune: the house always keeps at least 70% of every spin; the bank pays at $0.50, $1, $1.50 …', () => {
  const fb = new FortuneBook({ rnd: Math.random });
  const jackpots = [];
  for (let i = 0; i < 20000; i++) {
    const r = fb.spin();
    if (r.jackpot) jackpots.push(r.jackpot);
    assert.ok(fb.paid + fb.pool <= fb.taken * FORTUNE.bank + 1, 'never more out than the bank share');
  }
  assert.equal(fb.taken, 20000 * FORTUNE.price);
  assert.ok(fb.paid / fb.taken <= FORTUNE.bank);
  assert.ok(jackpots[0] >= 500 && jackpots[1] >= 1000 && jackpots[2] >= 1500, 'marks climb');
  // real skins are rare: about 7% of spins
  const real = FORTUNE.slots.filter((s) => s.k === 'outfit' || s.k === 'wskin').reduce((n, s) => n + s.w, 0) / FORTUNE.slots.reduce((n, s) => n + s.w, 0);
  assert.ok(real < 0.08);
});

test('fortune in the lobby: $0.05 in any coin, a prize every spin, the jackpot credited in real coins', () => {
  const out = [];
  const wallet = new MemoryWallet();
  const lobby = new Lobby({ wallet, send: (cid, m) => out.push(m), newToken: () => 'tok00009' });
  lobby.fortune.pool = 499; // the next spin fills the $0.50 mark
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'lucky' });
  const strk = lobby.prices.list().find((a) => a.symbol === 'STRK').id;
  const usdc = lobby.prices.list().find((a) => a.symbol === 'USDC').id;
  const before = { strk: BigInt(wallet.balance('tok00009', strk)), usdc: BigInt(wallet.balance('tok00009', usdc)) };
  return lobby.fortuneSpin(1, lobby.sessions.get(1), { asset: strk }).then(() => {
    const r = out.filter((m) => m.t === 'fortune').at(-1).spun;
    assert.equal(BigInt(wallet.balance('tok00009', strk)), before.strk - lobby.prices.quote(strk, FORTUNE.price), '$0.05 of STRK');
    assert.ok(['trial', 'wtrial', 'outfit', 'wskin', 'credit', 'pass', 'boost', 'spin', 'box', 'style'].includes(r.prize.k));
    if (['trial', 'wtrial', 'outfit', 'wskin'].includes(r.prize.k)) assert.ok(OUTFIT[r.prize.id] || WSKIN[r.prize.id]);
    assert.equal(r.jackpot.symbol, 'USDC');
    assert.equal(BigInt(wallet.balance('tok00009', usdc)), before.usdc + BigInt(r.jackpot.units), 'the bank in USDC');
    assert.equal(lobby.fortune.pool, 0);
    assert.equal(lobby.fortune.view().mark, 1000);
    assert.equal(lobby.fortune.view().wins[0].name, 'lucky');
  });
});

test('fortune: free spins turn the same wheel without touching the bank; every slot pays and nothing is above Epic', () => {
  const out = [];
  const lobby = new Lobby({ wallet: new MemoryWallet(), send: (cid, m) => out.push(m), newToken: () => 'tok00010' });
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'free' });
  const s = lobby.sessions.get(1);
  const key = lobby.key(s);
  lobby.inventory.give(key, { k: 'spin', n: 10 });
  lobby.inventory.give(key, { k: 'spin', n: 10 });
  const pool = lobby.fortune.pool;
  const kinds = new Set();
  for (let i = 0; i < 20; i++) {
    lobby.fortuneSpin(1, s, { free: 1 });
    const r = out.filter((m) => m.t === 'fortune').at(-1).spun;
    assert.ok(r.free && r.prize && !r.jackpot);
    kinds.add(r.prize.k);
  }
  assert.equal(lobby.fortune.pool, pool, 'no money came in, so no bank');
  assert.equal(lobby.fortune.taken, 0);
  // every slot kind can pay out
  for (const slot of FORTUNE.slots) {
    const p = lobby.inventory.fortunePrize(key, slot);
    assert.ok(p && p.k, slot.k);
    if (p.k === 'pass' || p.k === 'boost') lobby.grant(key, [p]);
  }
  const ranks = ['common', 'rare', 'epic'];
  assert.ok(FORTUNE.slots.every((x) => !x.rarity || ranks.includes(x.rarity)), 'the wheel tops out at Epic');
  // out of free spins: refused
  for (let i = 0; i < 500 && out.at(-1).t !== 'err'; i++) lobby.fortuneSpin(1, s, { free: 1 });
  assert.equal(out.at(-1).t, 'err');
  assert.equal(lobby.inventory.view(key).spins, 0);
});

test('fortune: all free spins at once, one result each', () => {
  const out = [];
  const lobby = new Lobby({ wallet: new MemoryWallet(), send: (cid, m) => out.push(m), newToken: () => 'tok00011' });
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'many' });
  const s = lobby.sessions.get(1);
  const key = lobby.key(s);
  lobby.inventory.give(key, { k: 'spin', n: 7 });
  lobby.fortuneSpin(1, s, { free: 7 });
  const r = out.filter((m) => m.t === 'fortune').at(-1).spun;
  assert.equal(r.all.length, 7);
  assert.ok(r.all.some((x) => x.slot === r.slot), 'the wheel shows one of them');
  assert.equal(lobby.fortune.taken, 0);
});
