import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StatsBook } from '../shared/stats.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { createAnalytics, adminSet, DEFAULT_ADMINS } from '../server/analytics.js';

test('stats: visitors once a day, wallets, matches per mode, purchases, the online peak', () => {
  let t = Date.parse('2026-10-01T10:00:00Z');
  const sb = new StatsBook({ now: () => t });
  sb.seen('a');
  sb.seen('a');
  sb.seen('b', { wallet: true });
  assert.equal(sb.players.size, 2);
  assert.deepEqual([sb.days['2026-10-01'].active, sb.days['2026-10-01'].fresh, sb.days['2026-10-01'].wallets], [2, 2, 1]);
  t += 86400000;
  sb.seen('a');
  assert.deepEqual([sb.days['2026-10-02'].active, sb.days['2026-10-02'].fresh], [1, 0]);
  sb.raid({ mode: 'duel', stake: 1000, humans: 2, stakes: 2000, rake: 100, paid: 1900, seconds: 90 });
  sb.raid({ mode: 'duel', stake: 1000, humans: 2, stakes: 2000, rake: 100, paid: 1900, seconds: 60 });
  sb.raid({ mode: 'br', stake: 100, humans: 5, stakes: 500, rake: 25, paid: 475, seconds: 300 });
  assert.equal(sb.modes.duel.raids, 2);
  assert.equal(sb.modes.duel.rake, 200);
  assert.equal(sb.stakesBy[1000], 2);
  assert.equal(sb.recent[0].mode, 'br');
  sb.buy('topup', 1000, 'p10');
  sb.buy('fortune', 5);
  sb.buy('box', 0); // free bags are not purchases
  assert.deepEqual(sb.shop.topup, { n: 1, cents: 1000 });
  assert.equal(sb.days['2026-10-02'].shop, 1005);
  sb.online(3);
  sb.online(7);
  sb.online(4);
  assert.equal(sb.peak.n, 7);
  assert.equal(sb.hours.at(-1).n, 7);
  // survives a save
  const back = new StatsBook({ data: JSON.parse(JSON.stringify(sb.toJSON())), now: () => t });
  assert.equal(back.players.size, 2);
  assert.equal(back.modes.br.raids, 1);
  assert.equal(back.boots, 2);
});

test('stats in the lobby: purchases are counted online, never in practice', () => {
  const stats = new StatsBook();
  const wallet = new MemoryWallet();
  const lobby = new Lobby({ stats, wallet, send: () => {}, newToken: () => 'tok00001' });
  lobby.connect(1);
  lobby.handle(1, { t: 'hello', name: 'buyer' });
  assert.equal(stats.players.size, 1);
  lobby.handle(1, { t: 'topup', id: 'p5' });
  assert.equal(stats.shop.topup?.n, 1);
  assert.equal(stats.shop.topup.cents, 500);
  const pstats = new StatsBook();
  const practice = new Lobby({ stats: pstats, practice: true, wallet: new MemoryWallet(), send: () => {}, newToken: () => 'tok00002' });
  practice.connect(1);
  practice.handle(1, { t: 'hello', name: 'demo' });
  practice.handle(1, { t: 'topup', id: 'p5' });
  assert.equal(pstats.shop.topup, undefined);
});

test('analytics: only the admin wallets (or ADMIN_KEY) get the snapshot', async () => {
  assert.equal(adminSet({}).size, 2);
  assert.ok(adminSet({}).has(DEFAULT_ADMINS[0]));
  assert.ok(adminSet({ ADMIN_WALLETS: '0x3b318c215e22262cd9a5accf8a97bfefa0805dfe03ddfd370ed4db2f5f50e82' }).has(DEFAULT_ADMINS[0]), 'short and padded forms match');
  const stats = new StatsBook();
  const sessions = { a: DEFAULT_ADMINS[1], b: '0x0123' };
  const lobby = new Lobby({ stats, wallet: new MemoryWallet(), send: () => {}, newToken: () => 'tok00003' });
  const real = { cashier: { accountFor: (s) => sessions[s] ?? null } };
  const an = createAnalytics({ stats, lobby, sockets: new Map(), real: null, ranks: lobby.ranks, inventory: lobby.inventory, social: lobby.social, referrals: lobby.referrals, mail: lobby.mail, fortune: lobby.fortune, guard: lobby.guard, env: { ADMIN_KEY: 'k'.repeat(20) } });
  const call = async (headers, a = an) => {
    let code = 0;
    let body = '';
    await a.handle({ headers }, { writeHead: (c) => ((code = c), { end: (b) => (body = b) }) });
    return { code, body: body ? JSON.parse(body) : null };
  };
  assert.equal((await call({})).code, 403);
  assert.equal((await call({ 'x-admin-key': 'wrong' })).code, 403);
  const ok = await call({ 'x-admin-key': 'k'.repeat(20) });
  assert.equal(ok.code, 200);
  assert.ok(ok.body.matches.modes.length > 10);
  assert.equal(ok.body.days.length, 60);
  assert.ok(ok.body.game.born > 0);
  // a wallet session: the admin passes, anyone else does not
  const an2 = createAnalytics({ stats, lobby, sockets: new Map(), real: { ...real, chain: { tokens: [] } }, ranks: lobby.ranks, inventory: lobby.inventory, social: lobby.social, referrals: lobby.referrals, mail: lobby.mail, fortune: lobby.fortune, guard: lobby.guard, env: {} });
  assert.equal(an2.isAdmin(DEFAULT_ADMINS[1]), true);
  assert.equal(an2.isAdmin('0x0123'), false);
  const denied = await call({ 'x-darkbags-session': 'b' }, an2);
  assert.equal(denied.code, 403);
});

test('stats: a finished online match lands in its mode with its stakes and rake', async () => {
  const { CFG } = await import('../shared/config.js');
  const stats = new StatsBook();
  const lobby = new Lobby({ stats, wallet: new MemoryWallet(), send: () => {}, newToken: () => `tok${Math.random().toString(36).slice(2, 12)}`, bots: false, roundSeconds: 20 });
  for (const cid of [1, 2]) {
    lobby.connect(cid);
    lobby.handle(cid, { t: 'hello', name: `p${cid}` });
    lobby.handle(cid, { t: 'join', mode: 'raid', stake: 1000, asset: 'USDC' });
    lobby.handle(cid, { t: 'ready', asset: 'USDC' });
  }
  for (let i = 0; i < 60 * CFG.TICK_RATE && !stats.modes.raid; i++) lobby.tick();
  assert.equal(stats.modes.raid?.raids, 1);
  assert.equal(stats.modes.raid.humans, 2);
  assert.equal(stats.modes.raid.stakes, 2000);
  assert.ok(stats.modes.raid.rake > 0);
});
