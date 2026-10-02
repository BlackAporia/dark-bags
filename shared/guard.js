// Fair play: the sim is server-authoritative (movement, fire rate, range and damage are all
// computed here, clients only send sticks and buttons), so speed, teleport and damage hacks have
// nothing to change. What is left to guard:
//  - aim assist: shots that land too well, too often, right after an inhuman flick
//  - multi-accounting (sybil): a network or device opening account after account, farming the
//    faucet or invite bags, or seating several accounts at one staked table to feed one of them
//  - invite farming: inviting yourself, or an endless stream of throwaway invitees
//
// Pure bookkeeping, no I/O: the server persists toJSON(). Networks and devices are stored only as
// salted hashes, never raw.
export const GUARD = {
  connsPerIp: 16, // open sockets from one network (mobile carriers put many people behind one address)
  newPerIpDay: 20, // new play accounts from one network a day
  faucetPerIpDay: 3, // test-token top-ups from one network a day
  refPerDay: 10, // invites one account can collect a day
  keep: 12, // networks / devices remembered per account
  // aim review: needs enough shots before it says anything
  aim: { minShots: 400, minHits: 120, acc: 0.82, hs: 0.6, snap: 0.5 },
};
const DAY = 86400000;

// FNV-1a, 52 bits: enough to tell networks apart, not to read them back
export function digest(s, salt = '') {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const ch of salt + '|' + s) {
    const c = ch.codePointAt(0);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 12);
}

export class Guard {
  constructor({ data = {}, onChange = null, now = () => Date.now(), salt = '', sharedIp = false, trusted = [], log = () => {} } = {}) {
    this.seen = new Map(Object.entries(data.seen ?? {})); // key -> { n: [nets], d: [devices] }
    this.aims = new Map(Object.entries(data.aims ?? {})); // key -> { shots, hits, hs, snap }
    this.flags = new Map(Object.entries(data.flags ?? {})); // key -> { why, at }
    this.onChange = onChange;
    this.now = now;
    this.salt = salt;
    this.sharedIp = sharedIp; // a LAN cafe may run with this on: tables then only split by device
    this.trusted = new Set(trusted.map((k) => String(k).toLowerCase())); // the team's own test accounts: never split or linked
    this.log = log;
    this.counts = new Map(); // daily counters, in memory only
    this.conns = new Map(); // net -> open sockets
  }

  toJSON() {
    return { seen: Object.fromEntries(this.seen), aims: Object.fromEntries(this.aims), flags: Object.fromEntries(this.flags) };
  }

  changed() {
    this.onChange?.(this);
  }

  net(ip) {
    return ip ? digest(String(ip), this.salt) : null;
  }

  dev(d) {
    return typeof d === 'string' && /^[a-z0-9]{8,40}$/.test(d) ? digest(d, this.salt) : null;
  }

  // one more of something a network or account may only do so often a day
  allow(kind, id, max) {
    if (!id) return true;
    const k = `${kind}:${id}:${Math.floor(this.now() / DAY)}`;
    const n = this.counts.get(k) ?? 0;
    if (n >= max) return false;
    this.counts.set(k, n + 1);
    if (this.counts.size > 50000) this.counts.clear(); // old days fall away
    return true;
  }

  open(net) {
    if (!net) return true;
    const n = this.conns.get(net) ?? 0;
    if (n >= GUARD.connsPerIp) return false;
    this.conns.set(net, n + 1);
    return true;
  }

  close(net) {
    if (!net) return;
    const n = (this.conns.get(net) ?? 1) - 1;
    if (n <= 0) this.conns.delete(net);
    else this.conns.set(net, n);
  }

  // an account showed up from this network and device
  see(key, net, dev) {
    if (!key || (!net && !dev)) return;
    let r = this.seen.get(key);
    if (!r) this.seen.set(key, (r = { n: [], d: [] }));
    let moved = false;
    for (const [list, v] of [
      [r.n, net],
      [r.d, dev],
    ]) {
      if (!v || list[list.length - 1] === v) continue;
      const i = list.indexOf(v);
      if (i >= 0) list.splice(i, 1);
      list.push(v);
      if (list.length > GUARD.keep) list.shift();
      moved = true;
    }
    if (moved) this.changed();
  }

  // two accounts that have shared a network or a device: one person, as far as rewards go
  linked(a, b) {
    if (!a || !b || a === b) return a === b && !!a;
    if (this.isTrusted(a) && this.isTrusted(b)) return false;
    const x = this.seen.get(a);
    const y = this.seen.get(b);
    if (!x || !y) return false;
    return x.d.some((v) => y.d.includes(v)) || (!this.sharedIp && x.n.some((v) => y.n.includes(v)));
  }

  // may this session sit at a staked table with these others? (no feeding your own alt)
  isTrusted(key) {
    return !!key && this.trusted.has(String(key).toLowerCase());
  }

  seatOk(me, others) {
    if (this.isTrusted(me.key)) return true;
    for (const o of others) {
      if (o.key === me.key || this.isTrusted(o.key)) continue;
      if (me.dev && me.dev === o.dev) return false;
      if (!this.sharedIp && me.net && me.net === o.net) return false;
      if (this.linked(me.key, o.key)) return false;
    }
    return true;
  }

  // a finished match's aim numbers for one account (guns only, humans only)
  aim(key, ac) {
    if (!key || !ac || !ac.shots) return null;
    const a = this.aims.get(key) ?? { shots: 0, hits: 0, hs: 0, snap: 0 };
    a.shots += ac.shots;
    a.hits += ac.hits;
    a.hs += ac.hs;
    a.snap += ac.snap;
    this.aims.set(key, a);
    this.changed();
    const why = aimVerdict(a);
    if (why && !this.flags.has(key)) {
      this.flags.set(key, { why, at: this.now() });
      this.log(`guard: ${key} flagged for review (${why})`, a);
      this.changed();
    }
    return why;
  }

  flagged(key) {
    return !!key && this.flags.has(key);
  }

  // an operator cleared the account: start its numbers over
  clear(key) {
    this.flags.delete(key);
    this.aims.delete(key);
    this.changed();
  }
}

// Humans miss. Over hundreds of shots no one keeps 80%+ of rounds on target, lands most of them
// in the head, or makes half their hits within a tick of a flick no hand can do.
export function aimVerdict(a) {
  const T = GUARD.aim;
  if (a.shots < T.minShots || a.hits < T.minHits) return null;
  if (a.hits / a.shots > T.acc) return 'accuracy';
  if (a.hs / a.hits > T.hs) return 'headshots';
  if (a.snap / a.hits > T.snap) return 'snaps';
  return null;
}
