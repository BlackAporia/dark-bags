// Players, friends, private messages and guilds.
//
// Every player key (a session token for play money, a Starknet address with the cashier)
// gets a random public id the first time it is seen. Only that id ever leaves the server:
// a session token is a password, and addresses are nobody else's business.
//
// Friends are mutual: "add" sends a request; the other side accepting (or adding back)
// makes both friends. Messages go between public ids, the last DM_KEEP per pair are kept.
// Guilds: anyone may join an open guild; creating one needs a real purchase (shop $ paid
// in USDC/USDT) and career rank GUILD_RANK or higher. Each guild has its own chat room
// (the last GCHAT_KEEP messages); members see what came in since they last looked.

export const DM_MAX = 300; // characters per private message
export const DM_KEEP = 100; // messages kept per conversation
export const DM_GAP_MS = 700; // one message per 0.7 s per sender
export const GUILD_RANK = 20;
export const GUILD_MAX = 50; // members
export const GCHAT_KEEP = 150; // guild chat messages kept per guild
const NAME_RE = /^[\p{L}\p{N} _.'-]{3,24}$/u;
const TAG_RE = /^[A-Z0-9]{2,5}$/;

const clean = (s, max) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

function randomId(n = 10) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => a[x % a.length]).join('');
}

export class SocialBook {
  constructor({ data = {}, onChange = null, now = () => Date.now() } = {}) {
    this.now = now;
    this.onChange = onChange;
    this.players = new Map(Object.entries(data.players ?? {})); // key → record
    this.ids = new Map([...this.players].map(([k, p]) => [p.id, k])); // public id → key
    this.dms = new Map(Object.entries(data.dms ?? {})); // "idA|idB" (sorted) → [{ f, text, at }]
    this.guilds = new Map(Object.entries(data.guilds ?? {})); // guild id → { id, name, tag, owner, members, created, desc }
    this.gchat = new Map(Object.entries(data.gchat ?? {})); // guild id → [{ f, text, at }]
    this.lastDm = new Map(); // key → time of their last message (rate limit, not saved)
  }

  toJSON() {
    return { players: Object.fromEntries(this.players), dms: Object.fromEntries(this.dms), guilds: Object.fromEntries(this.guilds), gchat: Object.fromEntries(this.gchat) };
  }

  changed() {
    this.onChange?.(this);
  }

  // ------------------------------------------------------------- players

  // seen (or renamed): make sure the key has a record and a public id
  touch(key, name) {
    if (!key) return null;
    let p = this.players.get(key);
    if (!p) {
      let id = randomId();
      while (this.ids.has(id)) id = randomId();
      p = { id, name: clean(name, 16) || 'runner', created: this.now(), seen: this.now(), friends: [], out: [], in: [], unread: {}, purchases: 0, guild: null };
      this.players.set(key, p);
      this.ids.set(id, key);
    } else {
      const n = clean(name, 16);
      if (n) p.name = n;
      p.seen = this.now();
    }
    this.changed();
    return p;
  }

  get(key) {
    return this.players.get(key) ?? null;
  }

  keyOf(id) {
    return this.ids.get(String(id)) ?? null;
  }

  markPurchase(key) {
    const p = this.players.get(key);
    if (!p) return;
    p.purchases = (p.purchases ?? 0) + 1;
    this.changed();
  }

  // everyone who ever played, optionally filtered by name; online first, then most recent
  search(q = '', isOnline = () => false) {
    const needle = clean(q, 24).toLowerCase();
    return [...this.players]
      .filter(([, p]) => !needle || p.name.toLowerCase().includes(needle) || p.id === needle)
      .map(([k, p]) => ({ key: k, p, on: isOnline(k) }))
      .sort((a, b) => b.on - a.on || b.p.seen - a.p.seen);
  }

  relation(key, otherId) {
    const p = this.players.get(key);
    if (!p || p.id === otherId) return 'me';
    if (p.friends.includes(otherId)) return 'friend';
    if (p.out.includes(otherId)) return 'sent';
    if (p.in.includes(otherId)) return 'incoming';
    return 'none';
  }

  // ------------------------------------------------------------- friends

  // add (or accept): returns the new relation, or { error }
  addFriend(key, otherId) {
    const me = this.players.get(key);
    const otherKey = this.keyOf(otherId);
    const other = otherKey && this.players.get(otherKey);
    if (!me || !other) return { error: 'No such player.' };
    if (me.id === other.id) return { error: 'That is you.' };
    if (me.friends.includes(other.id)) return { rel: 'friend' };
    if (me.in.includes(other.id)) {
      // they asked first: accepting makes both friends
      me.in = me.in.filter((x) => x !== other.id);
      other.out = other.out.filter((x) => x !== me.id);
      me.friends.push(other.id);
      other.friends.push(me.id);
      this.changed();
      return { rel: 'friend', otherKey };
    }
    if (!me.out.includes(other.id)) {
      if (me.out.length >= 200) return { error: 'Too many open requests.' };
      me.out.push(other.id);
      other.in.push(me.id);
      this.changed();
    }
    return { rel: 'sent', otherKey };
  }

  // decline a request, cancel your own, or unfriend
  dropFriend(key, otherId) {
    const me = this.players.get(key);
    const otherKey = this.keyOf(otherId);
    const other = otherKey && this.players.get(otherKey);
    if (!me || !other) return { error: 'No such player.' };
    const drop = (arr, id) => arr.filter((x) => x !== id);
    me.friends = drop(me.friends, other.id);
    other.friends = drop(other.friends, me.id);
    me.in = drop(me.in, other.id);
    other.out = drop(other.out, me.id);
    me.out = drop(me.out, other.id);
    other.in = drop(other.in, me.id);
    this.changed();
    return { rel: 'none', otherKey };
  }

  // ------------------------------------------------------------ messages

  pair(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  dm(key, toId, text) {
    const me = this.players.get(key);
    const toKey = this.keyOf(toId);
    const to = toKey && this.players.get(toKey);
    if (!me || !to) return { error: 'No such player.' };
    if (me.id === to.id) return { error: 'That is you.' };
    const body = clean(text, DM_MAX);
    if (!body) return { error: 'Type a message.' };
    const now = this.now();
    if (now - (this.lastDm.get(key) ?? 0) < DM_GAP_MS) return { error: 'Slow down a little.' };
    this.lastDm.set(key, now);
    const k = this.pair(me.id, to.id);
    const list = this.dms.get(k) ?? [];
    const m = { f: me.id, text: body, at: now };
    list.push(m);
    if (list.length > DM_KEEP) list.splice(0, list.length - DM_KEEP);
    this.dms.set(k, list);
    to.unread[me.id] = (to.unread[me.id] ?? 0) + 1;
    this.changed();
    return { m, toKey };
  }

  thread(key, withId) {
    const me = this.players.get(key);
    if (!me) return [];
    if (me.unread[withId]) {
      delete me.unread[withId];
      this.changed();
    }
    return this.dms.get(this.pair(me.id, withId)) ?? [];
  }

  // conversations, newest first, with the unread count per partner
  inbox(key) {
    const me = this.players.get(key);
    if (!me) return [];
    const out = [];
    for (const [k, list] of this.dms) {
      const [a, b] = k.split('|');
      if (a !== me.id && b !== me.id) continue;
      const other = a === me.id ? b : a;
      const last = list[list.length - 1];
      if (last) out.push({ id: other, last, unread: me.unread[other] ?? 0 });
    }
    return out.sort((x, y) => y.last.at - x.last.at);
  }

  unreadTotal(key) {
    const me = this.players.get(key);
    return me ? Object.values(me.unread).reduce((s, n) => s + n, 0) : 0;
  }

  // -------------------------------------------------------------- guilds

  canCreateGuild(key, rank) {
    const me = this.players.get(key);
    if (!me) return { ok: false, why: 'signin' };
    if (me.guild) return { ok: false, why: 'member' };
    if (!(me.purchases > 0)) return { ok: false, why: 'purchase' };
    if (rank < GUILD_RANK) return { ok: false, why: 'rank' };
    return { ok: true };
  }

  createGuild(key, { name, tag, desc }, rank) {
    const can = this.canCreateGuild(key, rank);
    if (!can.ok) return { error: can.why };
    const n = clean(name, 24);
    const t = clean(tag, 5).toUpperCase();
    if (!NAME_RE.test(n)) return { error: 'name' };
    if (!TAG_RE.test(t)) return { error: 'tag' };
    for (const g of this.guilds.values()) if (g.name.toLowerCase() === n.toLowerCase() || g.tag === t) return { error: 'taken' };
    const me = this.players.get(key);
    let id = randomId(8);
    while (this.guilds.has(id)) id = randomId(8);
    const g = { id, name: n, tag: t, desc: clean(desc, 140), owner: me.id, members: [me.id], created: this.now() };
    this.guilds.set(id, g);
    me.guild = id;
    this.changed();
    return { guild: g };
  }

  joinGuild(key, gid) {
    const me = this.players.get(key);
    const g = this.guilds.get(String(gid));
    if (!me || !g) return { error: 'No such guild.' };
    if (me.guild) return { error: 'Leave your guild first.' };
    if (g.members.length >= GUILD_MAX) return { error: 'That guild is full.' };
    g.members.push(me.id);
    me.guild = g.id;
    me.gRead = this.now(); // new members start with nothing unread
    this.changed();
    return { guild: g };
  }

  // the owner leaving hands the guild to the longest-standing member; the last one out closes it
  leaveGuild(key) {
    const me = this.players.get(key);
    const g = me?.guild && this.guilds.get(me.guild);
    if (!me || !g) return { error: 'You are not in a guild.' };
    g.members = g.members.filter((x) => x !== me.id);
    me.guild = null;
    delete me.gRead;
    if (!g.members.length) {
      this.guilds.delete(g.id);
      this.gchat.delete(g.id);
    } else if (g.owner === me.id) g.owner = g.members[0];
    this.changed();
    return { ok: true };
  }

  guildOf(key) {
    const me = this.players.get(key);
    return me?.guild ? this.guilds.get(me.guild) ?? null : null;
  }

  // ---------------------------------------------------------- guild chat

  // post to your guild's chat: { m, guild } or { error }
  guildSay(key, text) {
    const me = this.players.get(key);
    const g = this.guildOf(key);
    if (!me || !g) return { error: 'You are not in a guild.' };
    const body = clean(text, DM_MAX);
    if (!body) return { error: 'Type a message.' };
    const now = this.now();
    if (now - (this.lastDm.get(key) ?? 0) < DM_GAP_MS) return { error: 'Slow down a little.' };
    this.lastDm.set(key, now);
    const list = this.gchat.get(g.id) ?? [];
    const m = { f: me.id, text: body, at: now };
    list.push(m);
    if (list.length > GCHAT_KEEP) list.splice(0, list.length - GCHAT_KEEP);
    this.gchat.set(g.id, list);
    me.gRead = now;
    this.changed();
    return { m, guild: g };
  }

  // your guild's chat; reading it marks it read
  guildChat(key) {
    const me = this.players.get(key);
    const g = this.guildOf(key);
    if (!me || !g) return [];
    const list = this.gchat.get(g.id) ?? [];
    const last = list[list.length - 1]?.at ?? 0;
    if (last > (me.gRead ?? 0)) {
      me.gRead = last;
      this.changed();
    }
    return list;
  }

  // messages from others since you last opened the guild chat
  guildUnread(key) {
    const me = this.players.get(key);
    const g = this.guildOf(key);
    if (!me || !g) return 0;
    const since = me.gRead ?? 0;
    let n = 0;
    for (const m of this.gchat.get(g.id) ?? []) if (m.at > since && m.f !== me.id) n++;
    return n;
  }
}
