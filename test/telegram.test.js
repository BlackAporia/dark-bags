import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { checkInitData, TelegramBook, createTelegramBot, starPrices } from '../server/telegram.js';
import { Guard } from '../shared/guard.js';
import { Lobby } from '../shared/lobby.js';
import { Inventory, PACKS } from '../shared/cosmetics.js';
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

// ------------------------------------------------------------------ Stars
// a fake Bot API: records every call, answers createInvoiceLink with a link
function fakeApi() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = url.split('/').pop();
    const body = JSON.parse(init.body);
    calls.push([method, body]);
    const result = method === 'createInvoiceLink' ? `https://t.me/$inv${calls.length}` : method === 'getUpdates' ? [] : true;
    return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
  };
  return { calls, fetchImpl };
}

test('stars: prices follow the dollar price, and nothing over one invoice’s limit', () => {
  const p = starPrices(PACKS, 50);
  assert.equal(p.p5, 250);
  assert.equal(p.p100, 5000);
  assert.equal(p.p500, undefined, '25 000 Stars is over the limit');
  assert.deepEqual(starPrices(PACKS, 0), {});
});

test('stars: an invoice, the pre-checkout, one credit per payment, support and the commands', async () => {
  let t = NOW;
  const book = new TelegramBook({ botToken: BOT, bot: 'DarkBagsBot', app: 'play', now: () => t });
  const { calls, fetchImpl } = fakeApi();
  const paid = [];
  const bot = createTelegramBot({ book, prices: starPrices(PACKS, 50), onPaid: (o) => paid.push(o), fetchImpl, support: '@darkbags_help', log: { warn() {}, error() {} } });
  await assert.rejects(bot.invoice({ key: 'tgabc', pack: 'p500', price: 50000 }), /not sold/);
  const inv = await bot.invoice({ key: 'tgabc', pack: 'p10', price: 1000, tg: 4242 });
  const [, ci] = calls.find(([m]) => m === 'createInvoiceLink');
  assert.equal(ci.currency, 'XTR');
  assert.deepEqual(ci.prices, [{ label: '$10 shop $', amount: 500 }]);
  assert.equal(ci.payload, inv.order);
  assert.ok(ci.title.length <= 32);
  // pre-checkout: right amount yes, another amount no
  await bot.handle({ update_id: 1, pre_checkout_query: { id: 'q1', currency: 'XTR', total_amount: 499, invoice_payload: inv.order } });
  await bot.handle({ update_id: 2, pre_checkout_query: { id: 'q2', currency: 'XTR', total_amount: 500, invoice_payload: inv.order } });
  const answers = calls.filter(([m]) => m === 'answerPreCheckoutQuery').map(([, b]) => b.ok);
  assert.deepEqual(answers, [false, true]);
  // the payment, delivered twice: credited once
  const pay = { update_id: 3, message: { chat: { id: 4242, type: 'private' }, from: { id: 4242 }, successful_payment: { currency: 'XTR', total_amount: 500, invoice_payload: inv.order, telegram_payment_charge_id: 'ch_1' } } };
  await bot.handle(pay);
  await bot.handle({ ...pay, update_id: 4 });
  assert.equal(paid.length, 1);
  assert.equal(paid[0].key, 'tgabc');
  assert.equal(paid[0].pack, 'p10');
  assert.deepEqual(book.totals(), { players: 0, orders: 1, stars: 500, refunds: 0 });
  // a paid order cannot be paid again, an old unpaid one expires
  assert.equal(book.payable(inv.order, 500), false);
  const old = await bot.invoice({ key: 'tgabc', pack: 'p5', price: 500 });
  t += 25 * 3600 * 1000;
  assert.equal(book.payable(old.order, 250), false);
  // refund: the Stars go back once
  book.credited(inv.order, 1550);
  const r = await bot.refund('ch_1');
  assert.equal(r.added, 1550);
  assert.ok(calls.some(([m, b]) => m === 'refundStarPayment' && b.user_id === 4242 && b.telegram_payment_charge_id === 'ch_1'));
  await assert.rejects(bot.refund('ch_1'), /already refunded/);
  assert.equal(book.totals().refunds, 1);
  // the commands Telegram asks for, and a message for the team
  const chat = (text) => ({ update_id: 9, message: { chat: { id: 7, type: 'private' }, from: { id: 7, username: 'runner7' }, text } });
  await bot.handle(chat('/start ref_ABC123'));
  const start = calls.filter(([m]) => m === 'sendMessage').at(-1)[1];
  assert.equal(start.reply_markup.inline_keyboard[0][0].url, 'https://t.me/DarkBagsBot/play?startapp=ref_ABC123');
  await bot.handle(chat('/paysupport'));
  assert.match(calls.at(-1)[1].text, /@darkbags_help/);
  await bot.handle(chat('/terms'));
  assert.match(calls.at(-1)[1].text, /no cash value/);
  await bot.handle(chat('I paid 500 stars and got nothing'));
  assert.equal(book.support[0].user, '@runner7');
  assert.match(book.support[0].text, /500 stars/);
  // group chats are not the bot's business
  const before = calls.length;
  await bot.handle({ update_id: 10, message: { chat: { id: -5, type: 'group' }, from: { id: 7 }, text: '/start' } });
  assert.equal(calls.length, before);
});

test('stars: the lobby sells packs inside Telegram only and credits the paid one; test coins can be turned off', async () => {
  const sent = [];
  const telegram = new TelegramBook({ botToken: BOT, now: () => NOW });
  let n = 0;
  const balances = { USDC: '100000000' };
  const wallet = { debit: () => true, credit: () => {}, balances: () => balances, faucet: () => {}, ensure: () => {} };
  const inventory = new Inventory();
  const lobby = new Lobby({ wallet, guard: new Guard(), inventory, telegram, stableShop: false, send: (cid, m) => sent.push([cid, m]), newToken: () => `guest${String(++n).padStart(4, '0')}` });
  const { fetchImpl } = fakeApi();
  lobby.stars = createTelegramBot({ book: telegram, prices: starPrices(PACKS, 50), fetchImpl, log: { warn() {}, error() {} } });
  const last = (cid, type) => sent.filter(([c, m]) => c === cid && m.t === type).at(-1)?.[1];
  lobby.connect(1, { ip: '10.2.0.1' });
  lobby.handle(1, { t: 'hello', name: 'tgp', dev: 'deviceaaaaaaaaa1', tg: signed({}) });
  assert.equal(last(1, 'welcome').tg.stars.p5, 250);
  assert.equal(last(1, 'welcome').shopPay, false);
  lobby.connect(2, { ip: '10.2.0.2' });
  lobby.handle(2, { t: 'hello', name: 'web', dev: 'deviceaaaaaaaaa2' });
  assert.equal(last(2, 'welcome').tg, null, 'outside Telegram: no Stars');
  lobby.handle(2, { t: 'stars_buy', id: 'p5' });
  assert.match(last(2, 'err').msg, /inside Telegram/);
  lobby.handle(1, { t: 'stars_buy', id: 'p5' });
  await new Promise((r) => setTimeout(r, 10));
  const inv = last(1, 'stars_invoice');
  assert.equal(inv.stars, 250);
  assert.match(inv.link, /^https:\/\/t\.me\/\$/);
  // Telegram confirms: the shop $ land, with the first top-up bonus, and the player hears it
  const key = lobby.key(lobby.sessions.get(1));
  const order = [...telegram.orders].find(([, o]) => o.key === key);
  const r = lobby.starsPaid({ id: order[0], ...order[1] });
  assert.equal(r.added, 1000, '$5 and the first top-up doubles it');
  assert.equal(inventory.rec(key).credit, 1000);
  assert.equal(last(1, 'locker').op, 'topup');
  // with SHOP_TEST_PAY=0 test USDC no longer buys shop $
  lobby.handle(2, { t: 'topup', id: 'p5' });
  assert.match(last(2, 'err').msg, /Not enough/);
  // a refund takes back what is left, never below zero
  assert.equal(inventory.takeCredit(key, 1500, 500), 1000);
  assert.equal(inventory.rec(key).credit, 0);
});

test('telegram: a tap through to the site counts once a day per player', () => {
  let t = NOW;
  const sb = new StatsBook({ now: () => t });
  assert.equal(sb.tgSite(4242), true);
  assert.equal(sb.tgSite(4242), false);
  assert.equal(sb.tgSite(777), true);
  t += 86400000;
  assert.equal(sb.tgSite(4242), true);
  assert.deepEqual([sb.days['2026-11-09'].tgSite, sb.days['2026-11-10'].tgSite], [2, 1]);
});
