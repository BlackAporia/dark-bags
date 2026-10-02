// Referrals: every account has an invite code (and a link with it). A new player who comes
// in through it is tied to the inviter for good (only before their first match, never to
// themselves). From then on the inviter earns a share of the house's cut from every stake that
// player plays, for REF.days, paid as shop $ (spent on bags and crates, never withdrawn). The
// new player gets a welcome bag after their first staked match; when they finish REF.milestone
// matches, the inviter gets one too. Fair play (shared networks or devices, daily caps, flagged
// accounts) is checked by the lobby and rooms with shared/guard.js before any of this pays.
//
// Pure bookkeeping, no I/O: the server persists toJSON() and calls onStake / onMatch.
export const REF = {
  share: 0.2, // of the house rake on each stake the invited player plays
  days: 90, // how long a player keeps paying their inviter
  milestone: 5, // matches the invited player finishes before the inviter's bonus bag
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
    this.rec(by).refs.push(key);
    this.changed();
    return { ok: true, by };
  }

  // a stake went in: the inviter's share of the house cut (mills), paid in whole cents
  onStake(key, rakeMills) {
    const r = this.users.get(key);
    if (!r?.by || rakeMills <= 0 || this.now() - r.at > REF.days * DAY) return null;
    const up = this.rec(r.by);
    up.frac += rakeMills * REF.share;
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
  // throwaway account that never plays gets nothing), the inviter's bonus bag on the milestone
  onMatch(key) {
    const r = this.users.get(key);
    if (!r) return null;
    r.matches++;
    this.changed();
    if (!r.by) return null;
    if (r.matches === 1) return { welcome: key, ...(REF.milestone === 1 ? { to: r.by } : {}) };
    return r.matches === REF.milestone ? { to: r.by } : null;
  }

  view(key) {
    const r = this.rec(key);
    const code = this.codeOf(key);
    const refs = r.refs.map((k) => this.users.get(k)).filter(Boolean);
    return {
      code,
      by: r.by ? this.users.get(r.by)?.code ?? null : null,
      invited: refs.length,
      active: refs.filter((x) => x.matches > 0).length,
      earned: r.earned,
      share: REF.share,
      days: REF.days,
      milestone: REF.milestone,
      canClaim: !r.by && r.matches === 0,
    };
  }
}
