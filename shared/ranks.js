import { applyStats, achievementView } from './achievements.js';
// Career ranks: 1 (Lance Corporal) to 90 (Legend). Every raid pays rank XP, win or lose.
// The first ranks come after a raid or two; the last ones take hundreds of hours.
// Separate from the Arms Race weapon XP inside a raid (weapons.js), which resets every raid.

export const MAX_RANK = 90;

// 18 grades × 5 steps (I–V); rank 90 is its own thing
const GRADES = [
  'Lance Corporal', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Sergeant First Class', 'Master Sergeant',
  'Sergeant Major', 'Warrant Officer', 'Second Lieutenant', 'First Lieutenant', 'Captain', 'Major',
  'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'Major General', 'Lieutenant General', 'General',
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

const nice = (v) => {
  const step = v < 1000 ? 10 : v < 10000 ? 50 : v < 100000 ? 500 : 1000;
  return Math.round(v / step) * step;
};

// XP to go from rank r to r+1 (index r-1): 100 at the start, ~150k before Legend
export const RANK_STEP = Array.from({ length: MAX_RANK - 1 }, (_, i) => nice(90 * 1.087 ** i + 12 * i));

// total XP needed to reach each rank (index r-1): RANK_XP[0] = 0
export const RANK_XP = RANK_STEP.reduce((acc, s) => (acc.push(acc[acc.length - 1] + s), acc), [0]);

export const RANKS = RANK_XP.map((xp, i) => {
  const rank = i + 1;
  if (rank === MAX_RANK) return { rank, name: 'Legend', grade: GRADES.length, step: 0, xp };
  const grade = Math.floor(i / 5);
  return { rank, name: `${GRADES[grade]} ${ROMAN[i % 5]}`, grade, step: i % 5, xp };
});

export function rankOf(xp) {
  xp = Math.max(0, Math.floor(xp || 0));
  let lo = 0;
  let hi = MAX_RANK - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (RANK_XP[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  const r = RANKS[lo];
  const max = r.rank === MAX_RANK;
  return {
    rank: r.rank,
    name: r.name,
    xp,
    into: max ? 0 : xp - r.xp, // progress inside this rank
    need: max ? 0 : RANK_STEP[lo], // size of this rank
    toNext: max ? 0 : RANK_XP[lo + 1] - xp,
    max,
  };
}

// What a raid is worth. p is the world's player record at the end of their raid.
export function raidXp(p, { practice = false } = {}) {
  const parts = [];
  const add = (label, xp) => xp > 0 && parts.push({ label, xp: Math.round(xp) });
  const secs = Math.max(0, (p.endedAt ?? 0) - (p.joinedAt ?? 0));
  add('Raid', 40);
  add(`${p.kills} ${p.kills === 1 ? 'kill' : 'kills'}`, p.kills * 50);
  add('Damage', (p.dmgDealt ?? 0) * 0.5);
  add('Time alive', Math.min(90, secs / 2));
  if (p.firstBlood) add('First blood', 25);
  const multi = [0, 0, 20, 40, 70, 120][Math.min(5, p.bestMulti ?? 0)];
  if (multi) add(['', '', 'Double kill', 'Triple kill', 'Rampage', 'Godlike'][Math.min(5, p.bestMulti)], multi);
  if (p.prestige) add('Full arsenal', p.prestige * 150);
  if (p.won) {
    add('Victory', 150);
    add('Profit', Math.min(200, (60 * Math.max(0, p.payout - p.stake)) / Math.max(1, p.stake)));
  } else if (p.status === 'extracted') {
    add('Extracted', 120);
    add('Profit', Math.min(200, (60 * Math.max(0, p.payout - p.stake)) / Math.max(1, p.stake)));
  }
  let total = parts.reduce((s, x) => s + x.xp, 0);
  if (practice) {
    const cut = Math.floor(total / 2);
    parts.push({ label: 'Practice ×0.5', xp: -cut });
    total -= cut;
  }
  return { total, parts };
}

// bots wear believable ranks, mostly early ones
export function botRank(rnd) {
  return 1 + Math.floor(rnd() ** 1.8 * 45);
}

// Career per player key (session token, Starknet address, or 'practice' in the browser):
// rank XP, the achievement counters and the title the player wears.
export class RankBook {
  constructor({ data = {}, onChange = null } = {}) {
    // old save files hold a bare XP number per key
    this.recs = new Map(
      Object.entries(data).map(([k, v]) => [k, typeof v === 'object' && v ? { ...v, xp: Math.max(0, Math.floor(Number(v.xp) || 0)) } : { xp: Math.max(0, Math.floor(Number(v) || 0)) }]),
    );
    this.onChange = onChange;
  }

  rec(key) {
    if (!this.recs.has(key)) this.recs.set(key, { xp: 0 });
    return this.recs.get(key);
  }

  get(key) {
    return rankOf(this.recs.get(key)?.xp ?? 0);
  }

  add(key, amount) {
    const before = this.get(key);
    const r = this.rec(key);
    r.xp = before.xp + Math.max(0, Math.floor(amount));
    this.onChange?.(this);
    return { before, after: rankOf(r.xp) };
  }

  // fold a raid (or anything else) into the achievement counters; returns what it completed
  progress(key, add) {
    const fresh = applyStats(this.rec(key), add);
    this.onChange?.(this);
    return fresh;
  }

  title(key) {
    return this.recs.get(key)?.title ?? null;
  }

  // wear an unlocked achievement as a title (null takes it off)
  setTitle(key, id) {
    const r = this.rec(key);
    if (id !== null && !r.done?.[id]) return false;
    r.title = id;
    this.onChange?.(this);
    return true;
  }

  career(key) {
    const r = this.recs.get(key);
    return { title: r?.title ?? null, stats: r?.stats ?? {}, achievements: achievementView(r) };
  }

  toJSON() {
    return Object.fromEntries(this.recs);
  }
}
