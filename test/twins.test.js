import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Guard } from '../shared/guard.js';
import { Lobby } from '../shared/lobby.js';
import { Inventory } from '../shared/cosmetics.js';
import { MODE } from '../shared/modes.js';

const wallet = { debit: () => true, credit: () => {}, balances: () => ({}), faucet: () => {}, ensure: () => {} };
function lobbyWith() {
  let n = 0;
  const lobby = new Lobby({ wallet, guard: new Guard(), inventory: new Inventory(), send: () => {}, newToken: () => `token${String(++n).padStart(4, '0')}` });
  let cid = 0;
  const join = (mode, stake = 1000, extra = {}) => {
    const c = ++cid;
    lobby.connect(c, { ip: `10.0.${c >> 8}.${c & 255}` });
    lobby.handle(c, { t: 'hello', name: `p${c}`, dev: `device${c}xxxxx` });
    lobby.handle(c, { t: 'join', mode, stake, ...extra });
    return lobby.sessions.get(c).room;
  };
  return { lobby, join };
}

test('twins: a full table gets a twin; the list shows one line with everyone', () => {
  const { lobby, join } = lobbyWith();
  const seats = MODE.raid.size;
  const rooms = Array.from({ length: seats + 1 }, () => join('raid'));
  const base = rooms[0];
  assert.ok(rooms.slice(0, seats).every((r) => r === base), 'the first ten sit together');
  assert.equal(rooms[seats].twin, base.id);
  const lines = lobby.tables().filter((x) => x.mode === 'raid' && x.stake === base.stake);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].watching, seats + 1);
});

test('twins: a PvE run under way sends the next squad to a twin; a PvP round keeps them for the next', () => {
  const { join } = lobbyWith();
  const op = join('op1-easy', 100);
  op.state = 'live'; // a run that lasts an hour
  const next = join('op1-easy', 100);
  assert.notEqual(next, op);
  assert.equal(next.twin, op.id);
  const raid = join('raid');
  raid.state = 'live'; // a three-minute round
  assert.equal(join('raid'), raid, 'waits for the next round with the people there');
});

test('twins: an operation gone solo takes nobody else; an invite seats you with your friend', () => {
  const { lobby, join } = lobbyWith();
  const op = join('op1-easy', 100);
  const c = [...op.clients.values()][0];
  c.ready = true;
  c.squad = 'solo';
  const other = join('op1-easy', 100);
  assert.notEqual(other, op);
  // two rooms waiting: the invite picks the inviter's, not the fuller one
  join('op1-easy', 100); // a second runner in the twin
  const lone = join('dx-easy', 100);
  const twin = (lone.state = 'live', join('dx-easy', 100));
  lone.state = 'prep';
  const invited = join('dx-easy', 100, { room: lone.id });
  assert.equal(invited, lone);
  assert.notEqual(twin, lone);
  void lobby;
});

test('twins: an empty twin goes, and what it held goes home to its table', () => {
  const { lobby, join } = lobbyWith();
  const op = join('zombies', 100);
  op.state = 'live';
  const twin = join('zombies', 100);
  twin.jackpot = 70;
  twin.rollover = 30;
  twin.totals.raids = 2;
  const before = { jackpot: op.jackpot, rollover: op.rollover };
  for (const [cid, s] of lobby.sessions) if (s.room === twin) lobby.handle(cid, { t: 'leave' });
  op.state = 'prep'; // (no world was made for the pretend run)
  lobby.tick();
  assert.ok(!lobby.rooms.has(twin.id));
  assert.equal(op.jackpot, before.jackpot + 70);
  assert.equal(op.rollover, before.rollover + 30);
  assert.equal(op.totals.raids, 2);
});
