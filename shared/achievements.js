// Achievements: long-run tasks over everything a runner does. Each one pays rank XP
// once (so achievements push you up the 90 ranks) and unlocks its name as a title
// you can wear next to your name. Nothing here touches money or gameplay.
//
// Names, descriptions and titles are translated on the client (achievement ids are
// the keys); the server only counts.

// stat: which career counter it watches; goal: the value to reach; xp: paid once
export const ACHIEVEMENTS = [
  // raids played
  { id: 'rookie', stat: 'raids', goal: 1, xp: 50 },
  { id: 'regular', stat: 'raids', goal: 10, xp: 150 },
  { id: 'veteran', stat: 'raids', goal: 50, xp: 400 },
  { id: 'lifer', stat: 'raids', goal: 250, xp: 1200 },
  { id: 'eternal', stat: 'raids', goal: 1000, xp: 4000 },
  // extractions
  { id: 'escape_artist', stat: 'extracts', goal: 1, xp: 80 },
  { id: 'ghost', stat: 'extracts', goal: 10, xp: 250 },
  { id: 'smuggler', stat: 'extracts', goal: 50, xp: 700 },
  { id: 'phantom', stat: 'extracts', goal: 250, xp: 2500 },
  // kills
  { id: 'first_kill', stat: 'kills', goal: 1, xp: 50 },
  { id: 'hunter', stat: 'kills', goal: 25, xp: 200 },
  { id: 'butcher', stat: 'kills', goal: 100, xp: 500 },
  { id: 'reaper', stat: 'kills', goal: 500, xp: 1500 },
  { id: 'apex', stat: 'kills', goal: 2000, xp: 5000 },
  // one raid
  { id: 'rampage', stat: 'bestKills', goal: 5, xp: 300 },
  { id: 'one_man_army', stat: 'bestKills', goal: 10, xp: 1000 },
  { id: 'double_tap', stat: 'bestMulti', goal: 2, xp: 100 },
  { id: 'triple_threat', stat: 'bestMulti', goal: 3, xp: 250 },
  { id: 'godlike', stat: 'bestMulti', goal: 5, xp: 800 },
  { id: 'full_arsenal', stat: 'prestige', goal: 1, xp: 400 },
  { id: 'arsenal_master', stat: 'prestige', goal: 10, xp: 2000 },
  { id: 'first_blood', stat: 'firstBloods', goal: 1, xp: 80 },
  { id: 'opener', stat: 'firstBloods', goal: 25, xp: 600 },
  // time inside raids (seconds)
  { id: 'night_shift', stat: 'secs', goal: 3600, xp: 300 },
  { id: 'insomniac', stat: 'secs', goal: 36000, xp: 2000 },
  // how you get out
  { id: 'double_up', stat: 'bestReturn', goal: 200, xp: 250 },
  { id: 'big_bag', stat: 'bestReturn', goal: 500, xp: 1000 },
  { id: 'gold_rush', stat: 'golden', goal: 1, xp: 400 },
  { id: 'last_one_out', stat: 'lastExit', goal: 1, xp: 300 },
  { id: 'pacifist', stat: 'pacifist', goal: 1, xp: 300 },
  // career rank (titles only: rank already paid its way)
  { id: 'seasoned', stat: 'rank', goal: 10, xp: 0 },
  { id: 'officer', stat: 'rank', goal: 30, xp: 0 },
  { id: 'commander', stat: 'rank', goal: 60, xp: 0 },
  { id: 'legend', stat: 'rank', goal: 90, xp: 0 },
  // the locker
  { id: 'collector', stat: 'outfits', goal: 5, xp: 200 },
  { id: 'curator', stat: 'outfits', goal: 20, xp: 600 },
  { id: 'hoarder', stat: 'outfits', goal: 50, xp: 3000 },
];
export const ACHIEVEMENT = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// counters that keep the best value instead of adding up
const MAX_STATS = new Set(['bestKills', 'bestMulti', 'bestReturn', 'rank', 'outfits']);

// What one finished raid adds to the career counters. p is the world's player record.
export function raidStats(p, { golden = false, lastExit = false } = {}) {
  const out = p.status === 'extracted';
  return {
    raids: 1,
    extracts: out ? 1 : 0,
    kills: p.kills ?? 0,
    bestKills: p.kills ?? 0,
    bestMulti: p.bestMulti ?? 0,
    prestige: p.prestige ?? 0,
    firstBloods: p.firstBlood ? 1 : 0,
    secs: Math.max(0, Math.round((p.endedAt ?? 0) - (p.joinedAt ?? 0))),
    bestReturn: out && p.stake > 0 ? Math.floor((100 * p.payout) / p.stake) : 0,
    golden: out && golden ? 1 : 0,
    lastExit: out && lastExit ? 1 : 0,
    pacifist: out && !p.kills ? 1 : 0,
  };
}

// fold counters into a career record; returns the achievements this just completed
export function applyStats(rec, add) {
  rec.stats ??= {};
  rec.done ??= {};
  for (const [k, v] of Object.entries(add)) {
    if (!Number.isFinite(v)) continue;
    rec.stats[k] = MAX_STATS.has(k) ? Math.max(rec.stats[k] ?? 0, v) : (rec.stats[k] ?? 0) + v;
  }
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (rec.done[a.id]) continue;
    if ((rec.stats[a.stat] ?? 0) >= a.goal) {
      rec.done[a.id] = 1;
      fresh.push(a);
    }
  }
  return fresh;
}

// progress list for the client
export function achievementView(rec) {
  const stats = rec?.stats ?? {};
  const done = rec?.done ?? {};
  return ACHIEVEMENTS.map((a) => ({ id: a.id, stat: a.stat, goal: a.goal, xp: a.xp, have: Math.min(a.goal, stats[a.stat] ?? 0), done: !!done[a.id] }));
}
