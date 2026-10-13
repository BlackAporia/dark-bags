// The game's analytics book: who came and when, every finished match (mode, players, stakes, the
// house cut), every purchase (shop $ packs, bags, the battle pass, fortune spins), the online peak.
// Kept per UTC day so the team can chart it; totals never reset (not even on a data epoch).
//
// Pure bookkeeping, no I/O: the lobby and the rooms report, the server persists toJSON() and builds
// the admin snapshot (server/analytics.js) from this plus the other books and the cashier journal.
const DAY_KEEP = 400; // days of daily rows
const HOUR_KEEP = 24 * 14; // hours of online samples

export const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
// shop: real money in (cents: shop $ packs, and anything paid in coins); credit: shop $ spent
const blankDay = () => ({ active: 0, fresh: 0, wallets: 0, raids: 0, humans: 0, stakes: 0, rake: 0, paid: 0, shop: 0, credit: 0, buys: 0, spins: 0, peak: 0 });
const blankMode = () => ({ raids: 0, humans: 0, stakes: 0, rake: 0, paid: 0, seconds: 0, last: 0 });

export class StatsBook {
  constructor({ data = {}, onChange = null, now = () => Date.now() } = {}) {
    this.now = now;
    this.onChange = onChange;
    this.born = data.born ?? now(); // the first time this server kept stats
    this.players = new Map(Object.entries(data.players ?? {})); // key → { f: first seen, l: last seen, v: visits, w: signed in with a wallet }
    this.days = data.days ?? {}; // 'YYYY-MM-DD' → day row
    this.modes = data.modes ?? {}; // mode → totals
    this.stakesBy = data.stakesBy ?? {}; // stake (mills) → raids played at it
    this.shop = data.shop ?? {}; // kind → { n, cents }
    this.items = data.items ?? {}; // bag / pack id → { n, cents }
    this.hours = data.hours ?? []; // [{ h: hour start, n: peak online }]
    this.peak = data.peak ?? { n: 0, at: 0 };
    this.recent = data.recent ?? []; // last matches, newest first
    this.boots = (data.boots ?? 0) + 1;
    this.active = new Map(Object.entries(data.active ?? {})); // today's visitors (key → 1), to count each once a day
    this.activeDay = data.activeDay ?? dayOf(now());
  }

  toJSON() {
    return {
      born: this.born,
      players: Object.fromEntries(this.players),
      days: this.days,
      modes: this.modes,
      stakesBy: this.stakesBy,
      shop: this.shop,
      items: this.items,
      hours: this.hours,
      peak: this.peak,
      recent: this.recent,
      boots: this.boots,
      active: Object.fromEntries(this.active),
      activeDay: this.activeDay,
    };
  }

  changed() {
    this.onChange?.(this);
  }

  day(t = this.now()) {
    const k = dayOf(t);
    const d = (this.days[k] ??= blankDay());
    if (Object.keys(this.days).length > DAY_KEEP) delete this.days[Object.keys(this.days).sort()[0]];
    return d;
  }

  // Someone opened the game (key: their session or wallet); wallet: signed in with one. device:
  // the session token behind a wallet sign-in. The device was seen on its own before the sign-in;
  // it is the same person, so it is marked as theirs (a: 1) and never counted twice: not as a
  // visitor, not as a new player that day, not as a second active one.
  seen(key, { wallet = false, device = null } = {}) {
    if (!key) return;
    const t = this.now();
    const today = dayOf(t);
    if (today !== this.activeDay) {
      this.active.clear();
      this.activeDay = today;
    }
    const d = this.day(t);
    const dev = device && device !== key ? this.players.get(device) : null;
    let p = this.players.get(key);
    if (!p) {
      p = { f: t, l: t, v: 0 };
      this.players.set(key, p);
      // a device first seen today that now signs in for the first time: one new player, not two
      if (!(dev && !dev.a && dayOf(dev.f) === today)) d.fresh++;
    }
    if (dev) dev.a = 1;
    if (wallet && !p.w) {
      p.w = 1;
      d.wallets++;
    }
    p.l = t;
    p.v++;
    if (!this.active.has(key)) {
      this.active.set(key, 1);
      if (!(device && this.active.has(device))) d.active++;
    }
    this.changed();
  }

  // people: wallets, and devices that never signed in to one
  people() {
    let n = 0;
    for (const p of this.players.values()) if (!p.a) n++;
    return n;
  }

  // a finished match: everything in mills
  raid({ mode, stake = 0, humans = 0, stakes = 0, rake = 0, paid = 0, seconds = 0, golden = false }) {
    const t = this.now();
    const m = (this.modes[mode] ??= blankMode());
    m.raids++;
    m.humans += humans;
    m.stakes += stakes;
    m.rake += rake;
    m.paid += paid;
    m.seconds += Math.round(seconds);
    m.last = t;
    this.stakesBy[stake] = (this.stakesBy[stake] ?? 0) + 1;
    const d = this.day(t);
    d.raids++;
    d.humans += humans;
    d.stakes += stakes;
    d.rake += rake;
    d.paid += paid;
    this.recent.unshift({ at: t, mode, stake, humans, stakes, rake, paid, golden: !!golden });
    if (this.recent.length > 50) this.recent.length = 50;
    this.changed();
  }

  // A purchase: kind topup | box | pass | store | card | starter | descent | fortune; cents = what
  // it cost; item = pack / bag id; real = the part paid with real money (USDC/USDT or a coin), the
  // rest was shop $. A shop $ pack is real money; spending the shop $ later is not new money, so
  // only `real` counts as income (shop $ spent goes to `credit`).
  buy(kind, cents, item = null, real = cents) {
    if (!(cents > 0)) return;
    real = Math.max(0, Math.min(cents, real));
    const s = (this.shop[kind] ??= { n: 0, cents: 0, real: 0 });
    s.n++;
    s.cents += cents;
    s.real = (s.real ?? 0) + real;
    if (item) {
      const i = (this.items[`${kind}:${item}`] ??= { n: 0, cents: 0 });
      i.n++;
      i.cents += cents;
    }
    const d = this.day();
    d.shop += real;
    d.credit = (d.credit ?? 0) + (cents - real);
    d.buys++;
    if (kind === 'fortune') d.spins++;
    this.changed();
  }

  // how many are connected right now (sampled by the server)
  online(n) {
    const t = this.now();
    const h = t - (t % 3600000);
    const last = this.hours.at(-1);
    if (last?.h === h) last.n = Math.max(last.n, n);
    else {
      this.hours.push({ h, n });
      if (this.hours.length > HOUR_KEEP) this.hours.splice(0, this.hours.length - HOUR_KEEP);
    }
    const d = this.day(t);
    d.peak = Math.max(d.peak, n);
    if (n > this.peak.n) this.peak = { n, at: t };
    // no save for a sample alone: it rides the next real change
  }

  // people seen within `ms` (a device that signed in counts with its wallet)
  activeWithin(ms) {
    const since = this.now() - ms;
    let n = 0;
    for (const p of this.players.values()) if (p.l >= since && !p.a) n++;
    return n;
  }
}
