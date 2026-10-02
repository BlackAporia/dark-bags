// The in-game mailbox: news for everyone, notes for one player, and gifts to claim (shop $, bags,
// trial skins, wheel spins). The team sends mail from the server (POST /api/admin/mail); the game
// sends some by itself (the welcome bonus). Pure bookkeeping, no I/O: the server persists toJSON().
const KEEP = 200; // messages kept per player (broadcasts are kept apart)
const GIFTS = new Set(['credit', 'box', 'spin', 'trial', 'wtrial']);

export function cleanGift(g) {
  if (!g || !GIFTS.has(g.k)) return null;
  if (g.k === 'credit') return { k: 'credit', v: Math.max(1, Math.min(10000, Math.round(Number(g.v) || 0))) };
  if (g.k === 'spin') return { k: 'spin', n: Math.max(1, Math.min(10, Math.round(Number(g.n) || 1))) };
  if (g.k === 'box') return { k: 'box', id: String(g.id ?? ''), n: Math.max(1, Math.min(10, Math.round(Number(g.n) || 1))) };
  return { k: g.k, id: String(g.id ?? '') };
}

export class MailBook {
  constructor({ data = {}, onChange = null, now = () => Date.now(), rnd = Math.random } = {}) {
    this.all = data.all ?? []; // broadcasts: { id, at, title, body, gift?, kind }
    this.users = new Map(Object.entries(data.users ?? {})); // key -> { own: [msgs], read: [ids], claimed: [ids], since }
    this.onChange = onChange;
    this.now = now;
    this.rnd = rnd;
  }

  toJSON() {
    return { all: this.all, users: Object.fromEntries(this.users) };
  }

  rec(key) {
    let r = this.users.get(key);
    if (!r) this.users.set(key, (r = { own: [], read: [], claimed: [], since: this.now() }));
    return r;
  }

  id() {
    return `${this.now().toString(36)}${Math.floor(this.rnd() * 1e9).toString(36)}`;
  }

  msg({ title, body = '', gift = null, kind = 'news', key = null, i18n = null }) {
    return { id: this.id(), at: this.now(), title: String(title ?? '').slice(0, 120), body: String(body ?? '').slice(0, 4000), gift: cleanGift(gift), kind, ...(i18n ? { i18n } : {}) };
  }

  // to one player (key) or to everyone (key null). i18n: a client string key for the text
  send({ key = null, ...m }) {
    const msg = this.msg(m);
    if (key) {
      const r = this.rec(key);
      r.own.unshift(msg);
      if (r.own.length > KEEP) r.own.length = KEEP;
    } else {
      this.all.unshift(msg);
      if (this.all.length > KEEP) this.all.length = KEEP;
    }
    this.onChange?.(this);
    return msg;
  }

  // a player's mailbox, newest first: broadcasts since they joined (and a few before), plus their own
  inbox(key) {
    const r = this.rec(key);
    const start = r.since - 14 * 86400000; // a new player still sees the last two weeks of news
    const list = [...r.own, ...this.all.filter((m) => m.at >= start)].sort((a, b) => b.at - a.at);
    return list.map((m) => ({ ...m, read: r.read.includes(m.id), claimed: r.claimed.includes(m.id) }));
  }

  unread(key) {
    return this.inbox(key).filter((m) => !m.read || (m.gift && !m.claimed)).length;
  }

  read(key, id) {
    const r = this.rec(key);
    if (!this.inbox(key).some((m) => m.id === id) || r.read.includes(id)) return false;
    r.read.push(id);
    if (r.read.length > 600) r.read.splice(0, r.read.length - 600);
    this.onChange?.(this);
    return true;
  }

  // the gift of a message, once; null if there is none or it was already taken
  claim(key, id) {
    const r = this.rec(key);
    const m = this.inbox(key).find((x) => x.id === id);
    if (!m?.gift || r.claimed.includes(id)) return null;
    r.claimed.push(id);
    if (!r.read.includes(id)) r.read.push(id);
    this.onChange?.(this);
    return m.gift;
  }
}
