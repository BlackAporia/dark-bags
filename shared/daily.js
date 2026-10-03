// Coming back every day: the 30-day login calendar, the daily and weekly tasks, the rewards
// for achievements, the XP boost and the first win of the day. Everything here pays in game
// things (shop $, bags, crates, wheel spins, pass XP, XP boosts), never in coins.
//
// The day turns at 00:00 UTC. The calendar goes day 1 → 30 for days claimed in a row; a missed
// day starts it again at day 1, and after day 30 a new round starts. Tasks are the same for
// everyone on a day (and in a week), so friends can chase them together.
//
// Everything free here tops out at Epic: style items given are Common to Epic, and boxes come as
// gift boxes that roll no higher than Epic (Legendary and better: bought boxes, ranked, the pass).
//
// Pure bookkeeping, no I/O: the lobby hands out the gifts, the server persists toJSON().
import { ACHIEVEMENT, titleTier } from './achievements.js';

export const DAY_MS = 86400000;
export const dayOf = (t) => Math.floor(t / DAY_MS);
export const weekOf = (t) => Math.floor((dayOf(t) + 3) / 7); // weeks start on Monday (UTC)

// gift kinds: credit (shop cents), box, spin, pass (pass XP), xp (rank XP), boost (raids at ×2 XP),
// style (a frame, banner, kill effect or name effect)
const G = {
  c: (v) => ({ k: 'credit', v }),
  box: (id, n = 1) => ({ k: 'box', id, n }),
  spin: (n = 1) => ({ k: 'spin', n }),
  pass: (v) => ({ k: 'pass', v }),
  xp: (v) => ({ k: 'xp', v }),
  boost: (n) => ({ k: 'boost', n }),
  style: (id) => ({ k: 'style', id }),
};

// the calendar: something every day, a big one every week, the biggest on day 30
export const CALENDAR = [
  [G.c(5), G.pass(50)], // 1
  [G.spin(1)],
  [G.c(10), G.style('n-mint')],
  [G.boost(2)],
  [G.box('street')],
  [G.c(15), G.pass(80)],
  [G.box('vault'), G.spin(2)], // 7: the first big one
  [G.c(10), G.xp(250)],
  [G.spin(1), G.boost(2)],
  [G.box('w-scrap'), G.style('f-neon')],
  [G.c(15), G.pass(100)],
  [G.spin(2)],
  [G.c(20), G.boost(3)],
  [G.box('vault'), G.style('b-sunset')], // 14
  [G.c(15), G.xp(400)],
  [G.spin(2), G.pass(120)],
  [G.box('s-street'), G.style('k-confetti')],
  [G.c(20), G.boost(3)],
  [G.box('w-armory')],
  [G.spin(3)],
  [G.box('golden'), G.style('k-pixel')], // 21
  [G.c(25), G.xp(600)],
  [G.spin(3), G.pass(150)],
  [G.box('b-crypto'), G.style('n-gold')],
  [G.c(30), G.boost(5)],
  [G.box('c-pistol')],
  [G.spin(3), G.xp(800)],
  [G.box('vault'), G.style('k-coins')],
  [G.c(50), G.boost(5)],
  [G.box('golden', 2), G.style('f-circuit'), G.style('n-fire'), G.spin(5), G.xp(2000)], // 30: the grand prize
];
export const BIG_DAYS = [7, 14, 21, 30];

// the daily task pool (stat: a raidStats counter; three a day, one from each band)
export const DAILY_TASKS = [
  // easy
  { id: 'd_play3', stat: 'raids', goal: 3, band: 0, gifts: [G.c(5), G.pass(60)] },
  { id: 'd_kill5', stat: 'kills', goal: 5, band: 0, gifts: [G.spin(1)] },
  { id: 'd_alive10', stat: 'secs', goal: 600, band: 0, gifts: [G.c(5), G.xp(150)] },
  { id: 'd_fb1', stat: 'firstBloods', goal: 1, band: 0, gifts: [G.c(5), G.pass(60)] },
  // medium
  { id: 'd_extract1', stat: 'extracts', goal: 1, band: 1, gifts: [G.c(10), G.pass(80)] },
  { id: 'd_pvp10', stat: 'pvpKills', goal: 10, band: 1, gifts: [G.spin(1), G.xp(200)] },
  { id: 'd_head5', stat: 'headshots', goal: 5, band: 1, gifts: [G.c(10), G.boost(1)] },
  { id: 'd_zed60', stat: 'zKills', goal: 60, band: 1, gifts: [G.c(10), G.pass(80)] },
  { id: 'd_gold10', stat: 'goldBags', goal: 10, band: 1, gifts: [G.c(10), G.pass(80)] },
  // hard
  { id: 'd_win1', stat: 'wins', goal: 1, band: 2, gifts: [G.c(15), G.spin(1)] },
  { id: 'd_extract3', stat: 'extracts', goal: 3, band: 2, gifts: [G.box('street')] },
  { id: 'd_kill20', stat: 'kills', goal: 20, band: 2, gifts: [G.spin(2)] },
  { id: 'd_knife3', stat: 'kKnife', goal: 3, band: 2, gifts: [G.c(15), G.boost(2)] },
  { id: 'd_sniper5', stat: 'kSniper', goal: 5, band: 2, gifts: [G.c(15), G.boost(2)] },
];
// all three of the day done: one more
export const DAILY_SWEEP = [G.spin(1), G.pass(100)];

export const WEEKLY_TASKS = [
  { id: 'w_play25', stat: 'raids', goal: 25, gifts: [G.box('vault'), G.pass(300)] },
  { id: 'w_kill75', stat: 'kills', goal: 75, gifts: [G.box('s-street'), G.boost(3)] },
  { id: 'w_win5', stat: 'wins', goal: 5, gifts: [G.box('w-armory'), G.c(30)] },
  { id: 'w_extract10', stat: 'extracts', goal: 10, gifts: [G.box('vault'), G.c(20)] },
  { id: 'w_alive2h', stat: 'secs', goal: 7200, gifts: [G.spin(2), G.xp(1500)] },
  { id: 'w_ranked5', stat: 'rankedGames', goal: 5, gifts: [G.box('c-rifle')] },
  { id: 'w_zclear2', stat: 'zClears', goal: 2, gifts: [G.box('vault'), G.spin(2)] },
  { id: 'w_head25', stat: 'headshots', goal: 25, gifts: [G.box('s-street'), G.c(20)] },
];

export const FIRST_WIN_XP = 300; // the first win (or extraction) of the day

// what an achievement pays when you claim it, by how hard it was
export function achGifts(id) {
  const a = ACHIEVEMENT[id];
  if (!a) return [];
  const tier = titleTier(id);
  switch (tier) {
    case 'common':
      return [G.c(5)];
    case 'rare':
      return [G.spin(1)];
    case 'epic':
      return [G.c(20), G.spin(1)];
    case 'legendary':
      return [G.box('vault'), G.box('s-street'), G.boost(2)];
    case 'mythic':
      return [G.box('golden'), G.box('s-street', 2), G.spin(3)];
    default: // mystery, premium
      return [G.box('vault'), G.spin(1)];
  }
}

const TASK = Object.fromEntries([...DAILY_TASKS, ...WEEKLY_TASKS].map((x) => [x.id, x]));

// seeded pick, the same for everyone on that day / week
function mix(n) {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}
export function dailyIds(day) {
  return [0, 1, 2].map((band) => {
    const pool = DAILY_TASKS.filter((x) => x.band === band);
    return pool[mix(day * 3 + band) % pool.length].id;
  });
}
export function weeklyIds(week) {
  const ids = [];
  for (let i = 0; ids.length < 3; i++) {
    const id = WEEKLY_TASKS[mix(week * 7 + i) % WEEKLY_TASKS.length].id;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

const fresh = () => ({ streak: 0, last: -1, best: 0, rounds: 0, dd: -1, dp: {}, dc: [], sweep: -1, ww: -1, wp: {}, wc: [], ach: [], boost: 0, fw: -1, tasks: 0 });

export class DailyBook {
  constructor({ data = {}, onChange = null, now = () => Date.now() } = {}) {
    this.users = new Map(Object.entries(data).map(([k, v]) => [k, { ...fresh(), ...v }]));
    this.onChange = onChange;
    this.now = now;
  }

  toJSON() {
    return Object.fromEntries(this.users);
  }

  changed() {
    this.onChange?.(this);
  }

  rec(key) {
    let r = this.users.get(key);
    if (!r) this.users.set(key, (r = fresh()));
    // a new day or week: fresh tasks
    const d = dayOf(this.now());
    const w = weekOf(this.now());
    if (r.dd !== d) {
      r.dd = d;
      r.dp = {};
      r.dc = [];
    }
    if (r.ww !== w) {
      r.ww = w;
      r.wp = {};
      r.wc = [];
    }
    return r;
  }

  // ------------------------------------------------------------ the calendar
  // which calendar day is up for today (1..30), and whether it can be claimed
  calendar(key) {
    const r = this.rec(key);
    const today = dayOf(this.now());
    const claimed = r.last === today;
    const kept = r.last === today - 1 || claimed; // still a run of days in a row
    const run = kept ? r.streak : 0;
    // the day you claim next (or claimed today)
    const day = claimed ? run : run >= 30 ? 1 : run + 1;
    return { day, claimed, lost: !kept && r.streak > 0, streak: run, best: r.best, rounds: r.rounds };
  }

  claimDay(key) {
    const c = this.calendar(key);
    if (c.claimed) return { ok: false, error: 'Already claimed today. Come back tomorrow!' };
    const r = this.rec(key);
    if (c.day === 1 && r.streak >= 30 && r.last === dayOf(this.now()) - 1) r.rounds++;
    r.streak = c.day;
    r.last = dayOf(this.now());
    r.best = Math.max(r.best, r.streak);
    this.changed();
    return { ok: true, day: c.day, gifts: CALENDAR[c.day - 1], streak: r.streak };
  }

  // ------------------------------------------------------------ tasks
  // a finished online match counts towards the day's and the week's tasks; returns the ones it completed
  raid(key, stats) {
    const r = this.rec(key);
    const done = [];
    const bump = (ids, prog) => {
      for (const id of ids) {
        const x = TASK[id];
        const v = Number(stats?.[x.stat]) || 0;
        if (v <= 0) continue;
        const was = prog[id] ?? 0;
        prog[id] = Math.min(x.goal, was + v);
        if (was < x.goal && prog[id] >= x.goal) done.push(id);
      }
    };
    bump(dailyIds(r.dd), r.dp);
    bump(weeklyIds(r.ww), r.wp);
    this.changed();
    return done;
  }

  claimTask(key, id) {
    const r = this.rec(key);
    const daily = dailyIds(r.dd).includes(id);
    const weekly = weeklyIds(r.ww).includes(id);
    if (!daily && !weekly) return { ok: false, error: 'That task is over.' };
    const x = TASK[id];
    const prog = daily ? r.dp : r.wp;
    const claimed = daily ? r.dc : r.wc;
    if ((prog[id] ?? 0) < x.goal) return { ok: false, error: 'Finish the task first.' };
    if (claimed.includes(id)) return { ok: false, error: 'Already claimed.' };
    claimed.push(id);
    r.tasks++;
    const gifts = [...x.gifts];
    // all three of today's: the sweep bonus
    let sweep = false;
    if (daily && r.sweep !== r.dd && dailyIds(r.dd).every((t) => r.dc.includes(t))) {
      r.sweep = r.dd;
      gifts.push(...DAILY_SWEEP);
      sweep = true;
    }
    this.changed();
    return { ok: true, id, gifts, sweep, tasks: r.tasks };
  }

  // ------------------------------------------------------------ achievements
  claimAch(key, id, done) {
    if (!ACHIEVEMENT[id] || !done?.[id]) return { ok: false, error: 'Unlock that achievement first.' };
    const r = this.rec(key);
    if (r.ach.includes(id)) return { ok: false, error: 'Already claimed.' };
    r.ach.push(id);
    this.changed();
    return { ok: true, id, gifts: achGifts(id) };
  }

  // ------------------------------------------------------------ XP bonuses
  addBoost(key, n) {
    const r = this.rec(key);
    r.boost = Math.min(99, r.boost + Math.max(0, Math.floor(n)));
    this.changed();
  }

  // the XP bonuses of a finished online match: the first win (or extraction) of the day, then
  // the boost doubles everything (and uses one raid of it). Returns [{ label, xp }].
  bonusXp(key, { won, xp }) {
    const r = this.rec(key);
    const out = [];
    const today = dayOf(this.now());
    if (won && r.fw !== today) {
      r.fw = today;
      out.push({ label: 'First win of the day', xp: FIRST_WIN_XP });
    }
    if (r.boost > 0 && xp > 0) {
      r.boost--;
      out.push({ label: 'XP boost ×2', xp: xp + out.reduce((s, x) => s + x.xp, 0) });
    }
    if (out.length) this.changed();
    return out;
  }

  // ------------------------------------------------------------ for the client
  view(key, achDone = {}) {
    const r = this.rec(key);
    const task = (id, prog, claimed) => {
      const x = TASK[id];
      return { id, stat: x.stat, goal: x.goal, have: Math.min(x.goal, prog[id] ?? 0), claimed: claimed.includes(id), gifts: x.gifts, band: x.band ?? null };
    };
    const daily = dailyIds(r.dd).map((id) => task(id, r.dp, r.dc));
    const weekly = weeklyIds(r.ww).map((id) => task(id, r.wp, r.wc));
    const achClaim = Object.keys(achDone).filter((id) => achDone[id] && ACHIEVEMENT[id] && !r.ach.includes(id));
    const cal = this.calendar(key);
    const ready = (x) => !x.claimed && x.have >= x.goal;
    const now = this.now();
    return {
      cal,
      calendar: CALENDAR,
      daily,
      weekly,
      sweep: r.sweep === r.dd,
      sweepGifts: DAILY_SWEEP,
      achClaimed: r.ach,
      achClaim,
      boost: r.boost,
      firstWin: r.fw === dayOf(now),
      tasksDone: r.tasks,
      // how many things wait for a claim (the menu badge)
      ready: (cal.claimed ? 0 : 1) + daily.filter(ready).length + weekly.filter(ready).length + achClaim.length,
      dayEnds: (dayOf(now) + 1) * DAY_MS - now,
      weekEnds: (weekOf(now) + 1) * 7 * DAY_MS - 3 * DAY_MS - now,
    };
  }
}
