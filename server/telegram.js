// Telegram Mini App sign-in.
//
// Inside Telegram the game opens with launch data that Telegram signs with the bot's token
// (initData, see core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). The
// server checks that signature and gives each Telegram user one game token, kept in this book:
// the same runner on every phone and computer the player opens the bot on. The token is random,
// not derived from the bot token, so a new bot token (after a leak) keeps everyone's progress.
//
// The book holds only Telegram user id → game token: no names, no usernames, no phone numbers.
// TELEGRAM_BOT_TOKEN lives in the host's variables only, never in the repository.
import crypto from 'node:crypto';

const MAX_AGE_S = 24 * 3600; // launch data older than a day is no sign-in (the saved token still is)
const SKEW_S = 300; // a clock a few minutes ahead is fine
const BOT_TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
const BOT_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const APP_NAME_RE = /^[A-Za-z0-9_]{3,30}$/;

// The signed launch data → { id, username, firstName, lang, start } or null when anything is off.
export function checkInitData(initData, botToken, nowMs = Date.now()) {
  if (typeof initData !== 'string' || !initData || initData.length > 8192 || !BOT_TOKEN_RE.test(String(botToken ?? ''))) return null;
  let entries;
  try {
    entries = [...new URLSearchParams(initData).entries()];
  } catch {
    return null;
  }
  const field = (k) => entries.find(([n]) => n === k)?.[1] ?? null;
  const hash = field('hash') ?? '';
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const want = Buffer.from(hash, 'hex');
  const signs = (skip) => {
    const check = entries
      .filter(([k]) => !skip.includes(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    return crypto.timingSafeEqual(crypto.createHmac('sha256', secret).update(check).digest(), want);
  };
  // the hash covers every field but itself; newer clients add `signature` (for checks with
  // Telegram's public key), which some of them leave out of the hash
  if (!signs(['hash']) && !signs(['hash', 'signature'])) return null;
  const at = Number(field('auth_date'));
  const now = nowMs / 1000;
  if (!Number.isFinite(at) || now - at > MAX_AGE_S || at - now > SKEW_S) return null;
  let user = null;
  try {
    user = JSON.parse(field('user') ?? 'null');
  } catch {
    return null;
  }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  return { id: user.id, username: str(user.username, 32), firstName: str(user.first_name, 64), lang: str(user.language_code, 12), start: str(field('start_param'), 64) || null };
}

const ORDER_TTL_MS = 24 * 3600 * 1000; // an unpaid invoice older than a day is void
const KEEP_PAID = 5000; // paid orders kept for refunds and the books
const SUPPORT_KEEP = 200;

export class TelegramBook {
  // botToken: TELEGRAM_BOT_TOKEN; bot / app: the bot's @username and the Mini App's short name
  // (public, for t.me links); data: what toJSON() saved
  constructor({ botToken = '', bot = '', app = '', data = {}, onChange = () => {}, now = () => Date.now(), newToken = () => `tg${crypto.randomBytes(16).toString('hex')}` } = {}) {
    this.botToken = BOT_TOKEN_RE.test(String(botToken).trim()) ? String(botToken).trim() : '';
    if (botToken && !this.botToken) console.warn('TELEGRAM_BOT_TOKEN does not look like a bot token: Telegram sign-in is off');
    const b = String(bot).trim().replace(/^@/, '');
    const a = String(app).trim();
    this.link = BOT_NAME_RE.test(b) ? `https://t.me/${b}${APP_NAME_RE.test(a) ? `/${a}` : ''}` : null;
    this.users = new Map(Object.entries(data?.users ?? {}).filter(([id, tok]) => /^\d+$/.test(id) && typeof tok === 'string' && /^[a-z0-9]{8,64}$/.test(tok)));
    // Stars invoices: order id → { key, pack, stars, tg, at, paid?, charge?, payer?, refunded? }
    this.orders = new Map(Object.entries(data?.orders ?? {}).filter(([id, o]) => /^[0-9a-f]{24}$/.test(id) && o && typeof o.key === 'string'));
    // what players wrote to the bot (payment questions), newest first
    this.support = Array.isArray(data?.support) ? data.support.slice(0, SUPPORT_KEEP) : [];
    this.onChange = onChange;
    this.now = now;
    this.newToken = newToken;
  }

  get on() {
    return !!this.botToken;
  }

  // launch data → { token, user, fresh } (fresh: this Telegram user is new here) or null
  signIn(initData) {
    if (!this.on) return null;
    const user = checkInitData(initData, this.botToken, this.now());
    if (!user) return null;
    const id = String(user.id);
    let token = this.users.get(id);
    const fresh = !token;
    if (fresh) {
      token = this.newToken();
      this.users.set(id, token);
      this.onChange(this);
    }
    return { token, user, fresh };
  }

  // the game token of a Telegram user (null when they never opened the game)
  tokenOf(tgId) {
    return this.users.get(String(tgId)) ?? null;
  }

  // what the client may know: the link that opens the game in Telegram
  info() {
    return this.link ? { link: this.link } : null;
  }

  get size() {
    return this.users.size;
  }

  // ------------------------------------------------------------- Stars orders
  newOrder({ key, pack, stars, tg = null }) {
    const t = this.now();
    for (const [id, o] of this.orders) if (!o.paid && t - o.at > ORDER_TTL_MS) this.orders.delete(id);
    const paid = [...this.orders].filter(([, o]) => o.paid);
    if (paid.length > KEEP_PAID) for (const [id] of paid.sort((a, b) => a[1].paid - b[1].paid).slice(0, paid.length - KEEP_PAID)) this.orders.delete(id);
    const id = crypto.randomBytes(12).toString('hex');
    this.orders.set(id, { key, pack, stars, tg: tg ?? null, at: t });
    this.onChange(this);
    return id;
  }

  // an order that may still be paid: known, unpaid, not expired, for exactly this many Stars
  payable(id, stars) {
    const o = this.orders.get(String(id));
    return !!o && !o.paid && this.now() - o.at <= ORDER_TTL_MS && o.stars === stars;
  }

  // Telegram says it is paid → the order (once: a charge id is never counted twice)
  pay(id, charge, stars, payer = null) {
    const o = this.orders.get(String(id));
    if (!o || o.paid || o.stars !== stars || !charge) return null;
    for (const x of this.orders.values()) if (x.charge === charge) return null;
    o.paid = this.now();
    o.charge = String(charge);
    o.payer = payer;
    this.onChange(this);
    return { id: String(id), ...o };
  }

  // how much shop $ the order credited (a refund takes that back)
  credited(id, added) {
    const o = this.orders.get(String(id));
    if (!o) return;
    o.added = added;
    this.onChange(this);
  }

  byCharge(charge) {
    for (const [id, o] of this.orders) if (o.charge === charge) return { id, ...o };
    return null;
  }

  markRefunded(charge) {
    for (const o of this.orders.values())
      if (o.charge === charge && !o.refunded) {
        o.refunded = this.now();
        this.onChange(this);
        return true;
      }
    return false;
  }

  // a message for the team (payment help), kept short
  note(msg) {
    this.support.unshift({ at: this.now(), tg: msg.tg, user: String(msg.user ?? '').slice(0, 64), text: String(msg.text ?? '').slice(0, 1000) });
    this.support.length = Math.min(this.support.length, SUPPORT_KEEP);
    this.onChange(this);
  }

  // the team's numbers: Stars paid and refunded
  totals() {
    let n = 0;
    let stars = 0;
    let refunds = 0;
    for (const o of this.orders.values()) {
      if (!o.paid) continue;
      if (o.refunded) refunds++;
      else {
        n++;
        stars += o.stars;
      }
    }
    return { players: this.users.size, orders: n, stars, refunds };
  }

  toJSON() {
    return { v: 2, users: Object.fromEntries(this.users), orders: Object.fromEntries(this.orders), support: this.support };
  }
}

// ------------------------------------------------------------------ the bot
// The bot behind the Mini App: /start opens the game, /paysupport and /terms answer what
// Telegram asks of every bot that sells digital goods, and Stars (XTR) buy shop $ packs. It
// reads its updates by long polling (no public webhook URL needed); only one server may read a
// bot's updates, so TELEGRAM_POLL=0 turns it off on every server but one.
//
//   prices: { packId: stars }   onPaid(order): credit the player (called once per payment)
export const MAX_STARS = 10000; // the most one invoice may ask for

export function starPrices(packs, perUsd = 50) {
  const out = {};
  const k = Number(perUsd);
  if (!(k > 0)) return out;
  for (const p of packs) {
    const stars = Math.round((p.price / 100) * k);
    if (stars >= 1 && stars <= MAX_STARS) out[p.id] = stars;
  }
  return out;
}

const TEXT = {
  start: '🎒 DARK BAGS: a free extraction shooter. Drop in, grab the loot, get out alive. Nobody sees what is in your bag.\n\nTap Play to practice right here. Online PvP and PvE, ranks and rewards are on the website.',
  play: '▶ Play',
  site: '🌐 dark-bags.com',
  support: (who) => `Problem with a payment? Write it here in one message: the date, how many Stars, and what you bought. The team reads every message${who ? ` and answers through ${who}` : ''}. Payments are refunded as Telegram's terms for Stars say (telegram.org/tos/stars).`,
  terms: 'Purchases in DARK BAGS: Telegram Stars buy shop $, the in-game currency for bags, crates, skins and the pass. Shop $ has no cash value, cannot be withdrawn or traded, and stays with your Telegram account. Purchases are final, except where Telegram\'s terms for Stars give a refund (telegram.org/tos/stars). Help: /paysupport',
  noted: 'Thanks, the team got your message.',
  expired: 'This order is no longer open. Open the shop in the game and try again.',
};

export function createTelegramBot({ book, prices = {}, onPaid = () => {}, support = '', appUrl = '', siteUrl = 'https://dark-bags.com/', fetchImpl = fetch, log = console, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!book?.on) return null;
  const token = book.botToken;
  async function api(method, params = {}) {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(method === 'getUpdates' ? 45000 : 15000),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) throw Object.assign(new Error(j.description || `telegram ${res.status}`), { code: j.error_code ?? res.status });
    return j.result;
  }

  // the button that opens the game: inside the chat when the game's URL is known, else the t.me link
  function playButton(param = '') {
    const p = String(param).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (/^https:\/\//.test(appUrl)) {
      // a button inside the chat carries no start parameter: a referral code rides as ?ref=
      const u = new URL(appUrl);
      const ref = /^ref_([A-Za-z0-9]{1,12})$/.exec(p);
      if (ref) u.searchParams.set('ref', ref[1]);
      return { text: TEXT.play, web_app: { url: u.href } };
    }
    if (book.link) return { text: TEXT.play, url: p ? `${book.link}?startapp=${p}` : book.link };
    return null;
  }

  const usd = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
  // an invoice link for a shop $ pack, tied to the player's game key
  async function invoice({ key, pack, price, tg = null }) {
    const stars = prices[pack];
    if (!stars || !key) throw Object.assign(new Error('This pack is not sold for Stars.'), { user: true });
    const id = book.newOrder({ key, pack, stars, tg });
    const link = await api('createInvoiceLink', {
      title: `${usd(price)} shop $ · DARK BAGS`.slice(0, 32),
      description: 'Shop $ for bags, crates, skins and the pass in DARK BAGS. No cash value.',
      payload: id,
      currency: 'XTR',
      prices: [{ label: `${usd(price)} shop $`, amount: stars }],
    });
    return { link, order: id, stars };
  }

  const said = new Map(); // tg id → messages to the team today (a cap against spam)
  async function handle(u) {
    if (u.pre_checkout_query) {
      const q = u.pre_checkout_query;
      const ok = q.currency === 'XTR' && book.payable(q.invoice_payload, q.total_amount);
      await api('answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: TEXT.expired });
      return;
    }
    const m = u.message;
    if (!m || m.chat?.type !== 'private') return;
    if (m.successful_payment) {
      const p = m.successful_payment;
      if (p.currency !== 'XTR') return;
      const o = book.pay(p.invoice_payload, p.telegram_payment_charge_id, p.total_amount, m.from?.id ?? null);
      if (o) onPaid(o);
      else log.warn?.(`telegram: a payment for order ${String(p.invoice_payload).slice(0, 24)} was not counted (unknown, already paid or another amount)`);
      return;
    }
    const text = typeof m.text === 'string' ? m.text.trim() : '';
    if (!text) return;
    const reply = (t, extra = {}) => api('sendMessage', { chat_id: m.chat.id, text: t, ...extra });
    const [cmd, arg = ''] = text.split(/\s+/, 2);
    if (cmd === '/start' || cmd.startsWith('/start@')) {
      const rows = [playButton(arg), siteUrl ? { text: TEXT.site, url: siteUrl } : null].filter(Boolean).map((b) => [b]);
      return reply(TEXT.start, rows.length ? { reply_markup: { inline_keyboard: rows } } : {});
    }
    if (cmd === '/paysupport' || cmd.startsWith('/paysupport@')) return reply(TEXT.support(support));
    if (cmd === '/terms' || cmd.startsWith('/terms@')) return reply(TEXT.terms);
    if (text.startsWith('/')) return;
    // anything else is a message for the team
    const day = new Date().toISOString().slice(0, 10);
    const k = `${m.from?.id}:${day}`;
    const n = (said.get(k) ?? 0) + 1;
    said.set(k, n);
    if (said.size > 5000) said.clear();
    if (n > 10) return;
    book.note({ tg: m.from?.id ?? null, user: m.from?.username ? `@${m.from.username}` : m.from?.first_name ?? '', text });
    return reply(TEXT.noted);
  }

  let running = false;
  let offset = 0;
  async function loop() {
    try {
      await api('deleteWebhook', {});
      await api('setMyCommands', {
        commands: [
          { command: 'start', description: 'Play DARK BAGS' },
          { command: 'paysupport', description: 'Help with a payment' },
          { command: 'terms', description: 'Terms of purchases' },
        ],
      });
    } catch (e) {
      log.warn?.(`telegram: setup failed: ${e.message}`);
    }
    while (running) {
      try {
        const ups = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'pre_checkout_query'] });
        for (const up of ups) {
          offset = up.update_id + 1;
          await handle(up).catch((e) => log.warn?.(`telegram: update failed: ${e.message}`));
        }
      } catch (e) {
        if (!running) break;
        if (e.code === 409) log.warn?.('telegram: another server reads this bot (set TELEGRAM_POLL=0 on all servers but one)');
        else if (e.code === 401) {
          log.error?.('telegram: the bot token was refused; the bot is off');
          running = false;
          break;
        }
        await sleep(5000);
      }
    }
  }

  async function refund(charge) {
    const o = book.byCharge(String(charge));
    if (!o || o.refunded || !o.payer) throw Object.assign(new Error('Unknown or already refunded payment.'), { user: true });
    await api('refundStarPayment', { user_id: o.payer, telegram_payment_charge_id: o.charge });
    book.markRefunded(o.charge);
    return o;
  }

  return {
    prices,
    api,
    handle,
    invoice,
    refund,
    start() {
      if (running) return;
      running = true;
      loop();
    },
    stop() {
      running = false;
    },
  };
}
