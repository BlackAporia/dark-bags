// Referrals: every account has an invite code (and a link with it). A new player who comes
// in through it is tied to the inviter for good (only before their first match, never to
// themselves). From then on:
//
//   friends   the inviter earns a share of the house's cut from every stake that player plays,
//             for REF.days, paid as shop $ (spent on bags and crates, never withdrawn), and a gift
//             at each step of REF.ladder as the friend keeps playing. A friend who has finished
//             REF.active matches is a recruit: recruits earn the inviter titles. The new player
//             gets a welcome bag after their first staked match (two when a creator brought them).
//   creators  accounts the team names (an admin call): their own code (NYXTV), a bigger share of
//             the cut for longer (CREATOR.tiers by recruits, CREATOR.days), accrued in real $ and
//             paid out by the team after a fair-play check, and support-a-creator: any player may
//             enter a creator's code, and the creator gets CREATOR.support of that player's
//             real-money shop spend. A creator's own players support them from the start.
//
// Fair play (shared networks or devices, daily caps, flagged accounts) is checked by the lobby
// and rooms with shared/guard.js before any of this pays.
//
// Pure bookkeeping, no I/O: the server persists toJSON() and calls onStake / onMatch / onShop.
export const REF = {
  share: 0.2, // of the house rake on each stake the invited player plays
  days: 90, // how long a player keeps paying their inviter
  milestone: 5, // the match the inviter's bonus bag comes on (a step of the ladder)
  active: 3, // matches a friend finishes before they count as a recruit
  // the inviter's gifts as a friend finishes matches
  ladder: [
    { at: 1, gift: { k: 'spin', n: 1 } },
    { at: 5, gift: { k: 'box', id: 'vault', cap: 1 } },
    { at: 20, gift: { k: 'box', id: 'golden', cap: 1 } },
  ],
};
export const CREATOR = {
  // by recruits (players they brought in who keep playing)
  tiers: [
    { id: 'creator', at: 0, share: 0.3 },
    { id: 'partner', at: 25, share: 0.4 },
    { id: 'elite', at: 100, share: 0.5 },
  ],
  days: 365, // how long a creator's player keeps paying them
  support: 0.05, // of a supporter's real-money shop spend
};
const DAY = 86400000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

export const cleanCode = (c) =>
  String(c ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

export class ReferralBook {
  constructor({ data = {}, onChange = null, now = () => Date.now(), rnd = Math.random } = {}) {
    this.codes = new Map(Object.entries(data.codes ?? {})); // code -> key
    this.users = new Map(Object.entries(data.users ?? {})); // key -> record
    this.onChange = onChange;
    this.now = now;
    this.rnd = rnd;
  }

  toJSON() {
    return { codes: Object.fromEntries(this.codes), users: Object.fromEntries(this.users) };
  }

  changed() {
    this.onChange?.(this);
  }

  rec(key) {
    let r = this.users.get(key);
    if (!r) {
      r = { code: null, by: null, at: 0, matches: 0, refs: [], earned: 0, frac: 0 };
      // creators: creator { code, at }, owed / out (real cents to pay / paid), rfrac; anyone: sup (a creator's key)
      this.users.set(key, r);
    }
    return r;
  }

  // the account's own invite code, made on first ask
  codeOf(key) {
    const r = this.rec(key);
    if (r.code) return r.code;
    let code;
    do {
      code = '';
      for (let i = 0; i < 6; i++) code += ALPHABET[Math.floor(this.rnd() * ALPHABET.length)];
    } while (this.codes.has(code));
    r.code = code;
    this.codes.set(code, key);
    this.changed();
    return code;
  }

  // a new player names who brought them. fresh: they have not finished a match yet
  claim(key, code, { fresh = true } = {}) {
    code = cleanCode(code);
    const by = this.codes.get(code);
    const r = this.rec(key);
    if (r.by) return { ok: false, error: 'already' };
    if (!by) return { ok: false, error: 'unknown' };
    if (by === key) return { ok: false, error: 'self' };
    if (!fresh || r.matches > 0) return { ok: false, error: 'late' };
    // no loops: the inviter must not have been brought in by this player
    if (this.users.get(by)?.by === key) return { ok: false, error: 'self' };
    r.by = by;
    r.at = this.now();
    if (this.isCreator(by)) r.sup = by; // a creator's player supports them from the start
    this.rec(by).refs.push(key);
    this.changed();
    return { ok: true, by, creator: this.isCreator(by) };
  }

  // a stake went in: the inviter's share of the house cut (mills), paid in whole cents. A
  // creator's share is real money, kept here until the team pays it out ({ real: true }).
  onStake(key, rakeMills) {
    const r = this.users.get(key);
    if (!r?.by || rakeMills <= 0) return null;
    const creator = this.isCreator(r.by);
    if (this.now() - r.at > (creator ? CREATOR.days : REF.days) * DAY) return null;
    const up = this.rec(r.by);
    const share = creator ? this.tierOf(r.by).share : REF.share;
    // a creator's share is owed in $ (the team pays it out after a fair-play check), never shop $;
    // on a match server the main server's replay of this call is the one that counts
    if (creator) {
      up.rfrac = (up.rfrac ?? 0) + rakeMills * share;
      const cents = Math.floor(up.rfrac / 10);
      if (cents > 0) {
        up.rfrac -= cents * 10;
        up.owed = (up.owed ?? 0) + cents;
        up.earned += cents;
      }
      this.changed();
      return cents > 0 ? { to: r.by, cents, real: true } : null;
    }
    up.frac += rakeMills * share;
    const cents = Math.floor(up.frac / 10);
    if (cents <= 0) {
      this.changed();
      return null;
    }
    up.frac -= cents * 10;
    up.earned += cents;
    this.changed();
    return { to: r.by, cents };
  }

  // a staked match finished: the invitee's welcome bag after the first (not on the claim, so a
  // throwaway account that never plays gets nothing; fan: a creator brought them, two bags), the
  // inviter's gifts on the ladder, and on the REF.active-th match the friend becomes a recruit
  onMatch(key) {
    const r = this.users.get(key);
    if (!r) return null;
    r.matches++;
    this.changed();
    if (!r.by) return null;
    const out = { gifts: REF.ladder.filter((s) => s.at === r.matches).map((s) => ({ to: r.by, gift: s.gift })) };
    if (r.matches === 1) {
      out.welcome = key;
      out.fan = this.isCreator(r.by);
    }
    if (r.matches === REF.active) out.recruit = r.by;
    return out.welcome || out.gifts.length || out.recruit ? out : null;
  }

  // ------------------------------------------------------------ creators
  isCreator(key) {
    return !!this.users.get(key)?.creator;
  }

  // friends who keep playing (finished REF.active matches)
  recruits(key) {
    return (this.users.get(key)?.refs ?? []).filter((k) => (this.users.get(k)?.matches ?? 0) >= REF.active).length;
  }

  tierOf(key) {
    const n = this.recruits(key);
    return [...CREATOR.tiers].reverse().find((t) => n >= t.at) ?? CREATOR.tiers[0];
  }

  supporters(key) {
    let n = 0;
    for (const u of this.users.values()) if (u.sup === key) n++;
    return n;
  }

  // the team names a creator, with their own code (3 to 12 letters and digits, free or theirs)
  makeCreator(key, vanity) {
    const code = cleanCode(vanity);
    if (code.length < 3) return { ok: false, error: 'code' };
    const owner = this.codes.get(code);
    if (owner && owner !== key) return { ok: false, error: 'taken' };
    const r = this.rec(key);
    this.codeOf(key); // the random code keeps working
    if (r.creator?.code && r.creator.code !== code && r.creator.code !== r.code) this.codes.delete(r.creator.code);
    this.codes.set(code, key);
    r.creator = { code, at: r.creator?.at ?? this.now() };
    this.changed();
    return { ok: true, code };
  }

  dropCreator(key) {
    const r = this.users.get(key);
    if (!r?.creator) return false;
    if (r.creator.code !== r.code) this.codes.delete(r.creator.code);
    r.creator = null;
    for (const u of this.users.values()) if (u.sup === key) u.sup = null;
    this.changed();
    return true;
  }

  // support-a-creator: a creator's code, or '' to stop
  support(key, code) {
    const r = this.rec(key);
    if (!cleanCode(code)) {
      r.sup = null;
      this.changed();
      return { ok: true, code: null };
    }
    const by = this.codes.get(cleanCode(code));
    if (!by || !this.isCreator(by)) return { ok: false, error: 'notCreator' };
    if (by === key) return { ok: false, error: 'self' };
    r.sup = by;
    this.changed();
    return { ok: true, code: this.users.get(by).creator.code };
  }

  // real money a player spent in the shop (cents): the supported creator's share
  onShop(key, cents) {
    const r = this.users.get(key);
    if (!r?.sup || !(cents > 0) || !this.isCreator(r.sup)) return null;
    const up = this.rec(r.sup);
    up.rfrac = (up.rfrac ?? 0) + cents * 10 * CREATOR.support;
    const c = Math.floor(up.rfrac / 10);
    if (c <= 0) {
      this.changed();
      return null;
    }
    up.rfrac -= c * 10;
    up.owed = (up.owed ?? 0) + c;
    up.earned += c;
    this.changed();
    return { to: r.sup, cents: c };
  }

  // the team paid a creator out (cents, at most what is owed)
  markPaid(key, cents) {
    const r = this.users.get(key);
    const c = Math.max(0, Math.min(Math.floor(cents), r?.owed ?? 0));
    if (!c) return 0;
    r.owed -= c;
    r.out = (r.out ?? 0) + c;
    this.changed();
    return c;
  }

  creators() {
    const out = [];
    for (const [key, r] of this.users) {
      if (!r.creator) continue;
      out.push({ key, code: r.creator.code, since: r.creator.at, tier: this.tierOf(key).id, invited: r.refs.length, recruits: this.recruits(key), supporters: this.supporters(key), owed: r.owed ?? 0, paid: r.out ?? 0 });
    }
    return out.sort((a, b) => b.recruits - a.recruits);
  }

  view(key) {
    const r = this.rec(key);
    const code = this.codeOf(key);
    const refs = r.refs.map((k) => this.users.get(k)).filter(Boolean);
    const recruits = refs.filter((x) => x.matches >= REF.active).length;
    let creator = null;
    if (r.creator) {
      const tier = this.tierOf(key);
      const next = CREATOR.tiers.find((t) => t.at > recruits) ?? null;
      creator = { code: r.creator.code, tier: tier.id, share: tier.share, next: next ? { tier: next.id, need: next.at - recruits, share: next.share } : null, owed: r.owed ?? 0, paid: r.out ?? 0, supporters: this.supporters(key), days: CREATOR.days, support: CREATOR.support };
    }
    const sup = r.sup && this.users.get(r.sup)?.creator ? this.users.get(r.sup).creator.code : null;
    return {
      code: r.creator?.code ?? code,
      by: r.by ? this.users.get(r.by)?.creator?.code ?? this.users.get(r.by)?.code ?? null : null,
      invited: refs.length,
      active: refs.filter((x) => x.matches > 0).length,
      recruits,
      earned: r.earned,
      share: REF.share,
      days: REF.days,
      milestone: REF.milestone,
      ladder: REF.ladder.map((s) => ({ at: s.at, gift: s.gift })),
      needed: REF.active,
      canClaim: !r.by && r.matches === 0,
      creator,
      support: sup,
      supportShare: CREATOR.support,
    };
  }
}
