import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../shared/config.js';
import { World } from '../shared/world.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { BOXES, OUTFIT, OUTFITS, WSKIN, WEAPON_SKINS, RARITY_ORDER, boxCatalog } from '../shared/cosmetics.js';
import { STYLE } from '../shared/style.js';
import { DescentBook, DIFFS, FLOORS, MILESTONE, BOSSES, bossOf, objectiveOf, milestoneItems, runItems, runXp, priceFor, MAX_TICKETS, BUY_PER_DAY } from '../shared/descent.js';

const DAY = 86_400_000;

// a squad that walks to the fight (or the seal), shoots the nearest thing and never dies
function drive(w, ps, t) {
  for (const me of ps) {
    if (me.status !== 'alive') continue;
    let best = null;
    let bd = 1e9;
    for (const z of w.zombies.values()) {
      const d = Math.hypot(z.x - me.x, z.y - me.y);
      if (d < bd) [best, bd] = [z, d];
    }
    const H = w.horde.obj === 'hold' && w.horde.state === 'fight' ? w.horde.holdAt : null;
    const goal = H ?? (best && bd > 140 ? best : null);
    let mx = 0;
    let my = 0;
    if (goal) {
      const d = Math.hypot(goal.x - me.x, goal.y - me.y) || 1;
      if (d > 40) [mx, my] = [(goal.x - me.x) / d, (goal.y - me.y) / d];
    }
    w.queueInput(me.id, { s: t + 1, mx, my, a: best ? Math.atan2(best.y - me.y, best.x - me.x) : 0, f: !!best });
    me.hp = 100;
  }
  w.step();
  w.events.length = 0;
}

test('descent: 50 floors, a boss every 5th, missions rotate', () => {
  assert.equal(FLOORS, 50);
  for (let f = 1; f <= FLOORS; f++) {
    assert.equal(objectiveOf(f) === 'boss', f % MILESTONE === 0, `floor ${f}`);
    if (f % MILESTONE === 0) assert.ok(bossOf(f), `a boss on ${f}`);
  }
  assert.equal(new Set(BOSSES.map((b) => b.id)).size, 10);
  assert.ok(new Set(Array.from({ length: 49 }, (_, i) => objectiveOf(i + 1))).size >= 5, 'clear, nests, hold, survive and boss all show up');
  assert.deepEqual([DIFFS.easy.tickets, DIFFS.hard.tickets, DIFFS.hardcore.tickets], [1, 3, 5]);
  assert.equal(DIFFS.hardcore.revive, false);
});

test('descent: its items exist, are found only down there, and get rarer with the difficulty', () => {
  const inBoxes = new Set([...BOXES.flatMap((b) => boxCatalog(b)).map((x) => x.id), ...OUTFITS.map((o) => o.id), ...WEAPON_SKINS.map((s) => s.id)]);
  const rank = (r) => RARITY_ORDER.indexOf(r);
  const best = {};
  for (const diff of Object.keys(DIFFS)) {
    const all = runItems(diff, FLOORS, 'medic', 'deagle');
    assert.equal(new Set(all.map((x) => x.floor)).size, FLOORS / MILESTONE, 'every milestone pays');
    for (const it of all) {
      const x = it.k === 'outfit' ? OUTFIT[it.id] : it.k === 'wskin' ? WSKIN[it.id] : STYLE[it.id];
      assert.ok(x, `${it.k} ${it.id} exists`);
      assert.ok(!inBoxes.has(it.id), `${it.id} is not in any case, trial or shop list`);
      assert.ok(it.k !== 'style' || x.excl, `${it.id} is never sold`);
      assert.ok(!x.price, `${it.id} is not sold`);
      best[diff] = (best[diff] ?? 0) + rank(x.rarity);
    }
    assert.ok(milestoneItems(diff, FLOORS).some((it) => it.id.endsWith('-crown')), 'the full clear brings the crown');
  }
  assert.ok(best.easy < best.hard && best.hard < best.hardcore, JSON.stringify(best));
  assert.equal(runItems('easy', 4).length, 0, 'nothing before floor 5');
  assert.ok(runXp(10, 'hard', true) > runXp(10, 'hard', false), 'getting out keeps more');
});

test('descent: free ticket once a UTC day, gone the next day; network and device caps', () => {
  let now = Date.UTC(2026, 9, 6, 12);
  const book = new DescentBook({ now: () => now });
  assert.equal(book.view('a').free, 1);
  assert.deepEqual(book.spend('a', 1, { net: 'n1', dev: 'd1' }), { free: 1, bought: 0 });
  assert.equal(book.spend('a', 1, { net: 'n1', dev: 'd1' }), null, 'one free a day');
  // the same device on another account: no second free ticket
  assert.equal(book.freeLeft('b', { net: 'n1', dev: 'd1' }), 0);
  // a network gets 3 a day, whatever the devices
  assert.ok(book.spend('b', 1, { net: 'n1', dev: 'd2' }));
  assert.ok(book.spend('c', 1, { net: 'n1', dev: 'd3' }));
  assert.equal(book.freeLeft('d', { net: 'n1', dev: 'd4' }), 0, 'the network had its 3');
  assert.equal(book.freeLeft('e', { net: 'n2', dev: 'd5', ok: false }), 0, 'flagged accounts get none');
  // unused free tickets do not pile up: the next day there is one again, never two
  now += DAY;
  assert.equal(book.view('a').free, 1);
  now += 3 * DAY;
  assert.equal(book.view('a').free, 1);
  assert.equal(book.spend('a', 3, {}), null, 'a hard run needs 3: one free is not enough');
  assert.ok(book.add('a', 2));
  assert.deepEqual(book.spend('a', 3, {}), { free: 1, bought: 2 }, 'the free ticket goes first');
  assert.equal(book.view('a').bought, 0);
  // a refund on the same day gives both back
  book.refund('a', { free: 1, bought: 2 });
  assert.equal(book.view('a').free, 1);
  assert.equal(book.view('a').bought, 2);
});

test('descent: buying is capped per day and in total', () => {
  let now = Date.UTC(2026, 9, 6, 12);
  const book = new DescentBook({ now: () => now });
  assert.ok(book.add('a', BUY_PER_DAY));
  assert.equal(book.canBuy('a', 1), false, 'the daily cap');
  now += DAY;
  assert.ok(book.add('a', MAX_TICKETS - BUY_PER_DAY));
  assert.equal(book.canBuy('a', 1), false, 'the holding cap');
  book.record('a', { diff: 'hard', floors: 17 });
  book.record('b', { diff: 'hard', floors: 50, full: true });
  assert.deepEqual(book.board('hard').map((r) => r.key), ['b', 'a']);
  const copy = new DescentBook({ data: JSON.parse(JSON.stringify(book)), now: () => now });
  assert.equal(copy.view('b').clears.hard, 1, 'survives a restart');
});

test('descent: floors, a camp between them, gear for coins, class-only gear', () => {
  const w = new World({ stake: 0, mode: 'dx-easy', bots: false, seed: 7, roundSeconds: 99999 });
  const a = w.addPlayer({ name: 'a', skin: '#fff', cls: 'sniper', pistol: 'deagle' });
  const b = w.addPlayer({ name: 'b', skin: '#fff', cls: 'engineer' });
  assert.equal(w.players.size, 2, 'no bots');
  assert.ok(w.audit().ok);
  let camps = 0;
  for (let t = 0; t < 20 * 1500 && w.horde.floor <= 3; t++) {
    drive(w, [a, b], t);
    if (w.horde.state === 'camp') {
      camps++;
      w.descend(a.id, 'go');
      w.descend(b.id, 'go');
    }
  }
  assert.ok(camps > 0 && w.horde.cleared >= 3, `cleared ${w.horde.cleared}`);
  assert.ok(a.cr > 0, 'kills paid coins');
  assert.equal(priceFor(a, 'turret'), null, 'a sniper has no turret');
  assert.ok(priceFor(b, 'turret') > 0, 'an engineer does');
  const cr = a.cr;
  w.buy(a.id, 'turret');
  assert.equal(a.cr, cr, 'nothing taken for gear of another class');
  a.cr = 10_000;
  const g0 = a.dGun;
  w.buy(a.id, 'gun');
  assert.equal(a.dGun, g0 + 1);
  assert.ok(a.cr < 10_000);
});

test('descent: from the camp one gets out with the run, the other goes deeper', () => {
  const w = new World({ stake: 0, mode: 'dx-hard', bots: false, seed: 3, roundSeconds: 99999 });
  const a = w.addPlayer({ name: 'a', skin: '#fff', cls: 'assault' });
  const b = w.addPlayer({ name: 'b', skin: '#fff', cls: 'medic' });
  let t = 0;
  for (; t < 20 * 600 && w.horde.state !== 'camp'; t++) drive(w, [a, b], t);
  assert.equal(w.horde.state, 'camp');
  assert.ok(w.descend(a.id, 'out'));
  assert.ok(w.descend(b.id, 'go'));
  assert.equal(w.descend(a.id, 'maybe'), false);
  for (; t < 20 * 900 && w.horde.state === 'camp'; t++) drive(w, [a, b], t);
  assert.equal(a.status, 'extracted');
  assert.equal(a.dFloors, 1);
  assert.equal(b.status, 'alive');
  assert.equal(w.horde.floor, 2);
});

test('descent: a run costs tickets, not money; unready gives them back', () => {
  const inbox = new Map();
  let now = Date.UTC(2026, 9, 6, 12);
  const descent = new DescentBook({ now: () => now });
  const wallet = new MemoryWallet();
  const lobby = new Lobby({ wallet, descent, send: (cid, m) => (inbox.get(cid) ?? inbox.set(cid, []).get(cid)).push(m), newToken: () => `tok${Math.random().toString(36).slice(2, 12)}`, bots: false, roundSeconds: 120 });
  const last = (cid, t) => [...(inbox.get(cid) ?? [])].reverse().find((m) => m.t === t);
  lobby.connect(1, { ip: '10.0.0.1' });
  lobby.handle(1, { t: 'hello', name: 'a' });
  const token = last(1, 'welcome').token;
  const before = wallet.balance(token, 'USDC');
  assert.equal(last(1, 'welcome').descent.free, 1);
  lobby.handle(1, { t: 'join', mode: 'dx-hard', stake: 300 });
  lobby.handle(1, { t: 'ready', cls: 'medic' });
  assert.equal(last(1, 'err')?.code, 'dx_tickets', 'hard takes 3 tickets');
  descent.add(token, 2);
  lobby.handle(1, { t: 'ready', cls: 'medic' });
  assert.equal(last(1, 'prep').me.ready, true);
  assert.equal(descent.view(token).bought, 0);
  assert.equal(descent.view(token).free, 0);
  assert.equal(wallet.balance(token, 'USDC'), before, 'no coins touched');
  lobby.handle(1, { t: 'unready' });
  assert.equal(descent.view(token).bought, 2);
  assert.equal(descent.view(token).free, 1);
  // a second account from the same network takes the free one, then the network's next
  lobby.handle(1, { t: 'ready', cls: 'medic' });
  for (let i = 0; i < Math.ceil((CFG.PREP_SECONDS + 2) * CFG.TICK_RATE); i++) lobby.tick();
  assert.equal(last(1, 'start')?.mode, 'dx-hard');
});
