import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { checkInitData, TelegramBook } from '../server/telegram.js';
import { Guard } from '../shared/guard.js';
import { Lobby } from '../shared/lobby.js';
import { Inventory } from '../shared/cosmetics.js';
import { StatsBook } from '../shared/stats.js';

// a made-up bot token (the real one lives in the host's variables only)
const BOT = '123456789:AAFakeTokenForTestsOnly_abcdefghijklmn';
const NOW = Date.parse('2026-11-09T12:00:00Z');

// launch data signed the way Telegram signs it
function signed(fields, { bot = BOT, withSignature = false, hashSignature = true } = {}) {
  const all = { auth_date: String(Math.floor(NOW / 1000)), query_id: 'AAH1', user: JSON.stringify({ id: 777000111, first_name: 'Nyx', username: 'nyx_runner', language_code: 'uk' }), ...fields };
  if (withSignature) all.signature = 'c2lnbmF0dXJl';
  const secret = crypto.createHmac('sha256', 'WebAppData').update(bot).digest();
  const check = Object.entries(all)
    .filter(([k]) => hashSignature || k !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...all, hash }).toString();
}

test('telegram: signed launch data names the user; anything forged, stale or for another bot does not', () => {
  const u = checkInitData(signed({ start_param: 'ref_ABC123' }), BOT, NOW);
  assert.deepEqual(u, { id: 777000111, username: 'nyx_runner', firstName: 'Nyx', lang: 'uk', start: 'ref_ABC123' });
  // the newer `signature` field, inside the hash or left out of it
  assert.equal(checkInitData(signed({}, { withSignature: true }), BOT, NOW)?.id, 777000111);
  assert.equal(checkInitData(signed({}, { withSignature: true, hashSignature: false }), BOT, NOW)?.id, 777000111);
  // another user id swapped in after signing
  const forged = signed({}).replace(encodeURIComponent('777000111'), encodeURIComponent('777000112'));
  assert.equal(checkInitData(forged, BOT, NOW), null);
  // signed with another bot's token
  assert.equal(checkInitData(signed({}, { bot: '987654321:AAOtherBotTokenOnlyForTests_xyzxyzxyz' }), BOT, NOW), null);
  // older than a day, or from the future
  assert.equal(checkInitData(signed({ auth_date: String(Math.floor(NOW / 1000) - 2 * 86400) }), BOT, NOW), null);
  assert.equal(checkInitData(signed({ auth_date: String(Math.floor(NOW / 1000) + 3600) }), BOT, NOW), null);
  // junk
  for (const bad of ['', 'hash=zz', 'user=%7B%7D', null, 42, 'x'.repeat(9000)]) assert.equal(checkInitData(bad, BOT, NOW), null);
  assert.equal(checkInitData(signed({}), 'not-a-token', NOW), null);
});

test('telegram: one Telegram user keeps one game token, across restarts and a new bot token', () => {
  const saves = [];
  const book = new TelegramBook({ botToken: BOT, bot: '@DarkBagsBot', app: 'play', now: () => NOW, onChange: (b) => saves.push(b.toJSON()) });
  assert.equal(book.on, true);
  assert.deepEqual(book.info(), { link: 'https://t.me/DarkBagsBot/play' });
  const a = book.signIn(signed({}));
  assert.match(a.token, /^tg[0-9a-f]{32}$/);
  assert.equal(a.fresh, true);
  const b = book.signIn(signed({ query_id: 'AAH2' }));
  assert.equal(b.token, a.token);
  assert.equal(b.fresh, false);
  assert.equal(saves.length, 1, 'saved once, when the user was new');
  // the book on disk holds ids and tokens only: no names
  assert.deepEqual(Object.keys(saves[0].users), ['777000111']);
  assert.ok(!JSON.stringify(saves[0]).includes('nyx'));
  // after a leak the bot gets a new token: the same players keep their runners
  const NEW_BOT = '123456789:AANewTokenAfterRotation_abcdefghijklmn';
  const again = new TelegramBook({ botToken: NEW_BOT, data: saves[0], now: () => NOW });
  assert.equal(again.signIn(signed({}, { bot: NEW_BOT })).token, a.token);
  assert.equal(again.signIn(signed({})), null, 'the old token no longer signs anyone in');
  // without a token the book is off and shares no link
  const off = new TelegramBook({});
  assert.equal(off.on, false);
  assert.equal(off.signIn(signed({})), null);
  assert.equal(off.info(), null);
  assert.equal(new TelegramBook({ botToken: BOT, bot: 'no spaces allowed' }).info(), null);
});

test('telegram: the lobby signs a Telegram player in with the same runner on every device', () => {
  const sent = [];
  const stats = new StatsBook({ now: () => NOW });
  const telegram = new TelegramBook({ botToken: BOT, bot: 'DarkBagsBot', app: 'play', now: () => NOW });
  let n = 0;
  const wallet = { debit: () => true, credit: () => {}, balances: () => ({}), faucet: () => {}, ensure: () => {} };
  const lobby = new Lobby({ wallet, guard: new Guard(), inventory: new Inventory(), stats, telegram, send: (cid, m) => sent.push([cid, m]), newToken: () => `guest${String(++n).padStart(4, '0')}` });
  const hello = (cid, msg) => {
    lobby.connect(cid, { ip: `10.1.0.${cid}` });
    lobby.handle(cid, { t: 'hello', name: 'nyx', dev: `device${cid}aaaaaaaaaa`.slice(0, 16), ...msg });
    return sent.filter(([c, m]) => c === cid && m.t === 'welcome').at(-1)[1];
  };
  const phone = hello(1, { tg: signed({}) });
  assert.match(phone.token, /^tg/);
  assert.deepEqual(phone.tg, { link: 'https://t.me/DarkBagsBot/play' });
  // the laptop has its own old guest token: Telegram's word wins
  const laptop = hello(2, { tg: signed({ query_id: 'AAH9' }), token: 'oldguest0001' });
  assert.equal(laptop.token, phone.token);
  // forged launch data falls back to the device's own token
  const forged = signed({}).replace(encodeURIComponent('777000111'), encodeURIComponent('5'));
  assert.equal(hello(3, { tg: forged, token: 'oldguest0003' }).token, 'oldguest0003');
  // outside Telegram nothing changes
  assert.equal(hello(4, {}).token, 'guest0001');
  // the team's analytics count who came through Telegram
  assert.equal([...stats.players.values()].filter((p) => p.tg).length, 1);
});
