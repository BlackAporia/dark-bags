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

  // what the client may know: the link that opens the game in Telegram
  info() {
    return this.link ? { link: this.link } : null;
  }

  get size() {
    return this.users.size;
  }

  toJSON() {
    return { v: 1, users: Object.fromEntries(this.users) };
  }
}
