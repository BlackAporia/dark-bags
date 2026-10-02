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
  // winning pot modes (battle royale, duel, weapon modes, teams)
  { id: 'champion', stat: 'wins', goal: 1, xp: 150 },
  { id: 'warlord', stat: 'wins', goal: 25, xp: 1500 },
  // career rank (titles only: rank already paid its way)
  { id: 'seasoned', stat: 'rank', goal: 10, xp: 0 },
  { id: 'officer', stat: 'rank', goal: 30, xp: 0 },
  { id: 'commander', stat: 'rank', goal: 60, xp: 0 },
  { id: 'legend', stat: 'rank', goal: 90, xp: 0 },
  // the locker
  { id: 'collector', stat: 'outfits', goal: 5, xp: 200 },
  { id: 'curator', stat: 'outfits', goal: 20, xp: 600 },
  { id: 'hoarder', stat: 'outfits', goal: 50, xp: 3000 },
  // weapon mastery (kills with a family of guns)
  { id: 'gunslinger', stat: 'kHandgun', goal: 50, xp: 300 },
  { id: 'close_quarters', stat: 'kShotgun', goal: 50, xp: 300 },
  { id: 'spray_and_pray', stat: 'kSmg', goal: 100, xp: 500 },
  { id: 'rifleman', stat: 'kRifle', goal: 100, xp: 500 },
  { id: 'marksman', stat: 'kSniper', goal: 50, xp: 600 },
  { id: 'deadeye', stat: 'kSniper', goal: 250, xp: 2000 },
  { id: 'blade_dancer', stat: 'kKnife', goal: 25, xp: 400 },
  { id: 'shadow_blade', stat: 'kKnife', goal: 150, xp: 2500 },
  // the modes
  { id: 'deathmatch_king', stat: 'dmWins', goal: 5, xp: 600 },
  { id: 'duelist', stat: 'duelWins', goal: 10, xp: 800 },
  { id: 'squad_goals', stat: 'teamWins', goal: 10, xp: 700 },
  { id: 'one_shot_one_kill', stat: 'hcWins', goal: 3, xp: 900 },
  { id: 'specialist', stat: 'weaponWins', goal: 5, xp: 500 },
  { id: 'engineer', stat: 'turretKills', goal: 25, xp: 500 },
  // ranked
  { id: 'ranked_debut', stat: 'rankedGames', goal: 1, xp: 100 },
  { id: 'ranked_grinder', stat: 'rankedGames', goal: 50, xp: 1500 },
  { id: 'ranked_victor', stat: 'rankedWins', goal: 10, xp: 1200 },
  { id: 'gold_league', stat: 'bestDiv', goal: 2, xp: 500 },
  { id: 'diamond_league', stat: 'bestDiv', goal: 4, xp: 1500 },
  { id: 'neon_legend', stat: 'bestDiv', goal: 6, xp: 6000 },
  // cases, skins, the pass, season titles
  { id: 'unboxer', stat: 'opened', goal: 10, xp: 150 },
  { id: 'case_hunter', stat: 'opened', goal: 100, xp: 800 },
  { id: 'case_lord', stat: 'opened', goal: 500, xp: 3000 },
  { id: 'armory', stat: 'wskins', goal: 10, xp: 300 },
  { id: 'arsenal_baron', stat: 'wskins', goal: 60, xp: 2500 },
  { id: 'pass_holder', stat: 'passTier', goal: 25, xp: 500 },
  { id: 'pass_maxed', stat: 'passTier', goal: 50, xp: 1500 },
  { id: 'neon_bearer', stat: 'stitles', goal: 1, xp: 800 },
  // zombies: survive the waves, clear the boss, top the squad
  { id: 'graveyard_shift', stat: 'zRuns', goal: 1, xp: 80 },
  { id: 'hold_the_line', stat: 'bestWave', goal: 5, xp: 300 },
  { id: 'undertaker', stat: 'zKills', goal: 100, xp: 300 },
  { id: 'exterminator', stat: 'zKills', goal: 1000, xp: 1500 },
  { id: 'giant_slayer', stat: 'zBoss', goal: 1, xp: 1200 },
  { id: 'zombie_slayer', stat: 'zClears', goal: 1, xp: 1500 },
  { id: 'top_of_the_horde', stat: 'zMvp', goal: 1, xp: 3000 },
  { id: 'nightmare_walker', stat: 'zClears', goal: 5, xp: 3500 },
  { id: 'army_of_one', stat: 'zSolo', goal: 1, xp: 5000 },
  // gold rush: grab the most bags, be the one who takes it all
  { id: 'prospector', stat: 'goldRuns', goal: 1, xp: 60 },
  { id: 'gold_fever', stat: 'goldWins', goal: 1, xp: 400 },
  { id: 'mother_lode', stat: 'bestGold', goal: 25, xp: 600 },
  { id: 'bag_hoarder', stat: 'goldBags', goal: 300, xp: 1200 },
  { id: 'midas', stat: 'goldWins', goal: 10, xp: 3000 },
  // headshots: clean, centred hits (double damage)
  { id: 'sharpshooter', stat: 'headshots', goal: 25, xp: 300 },
  { id: 'headhunter', stat: 'headshots', goal: 250, xp: 1500 },
  // secret: hidden until you earn them
  { id: 'by_a_thread', stat: 'clutch', goal: 1, xp: 700, secret: true },
  { id: 'untouchable', stat: 'flawless', goal: 1, xp: 900, secret: true },
  { id: 'ghost_walker', stat: 'ninjaWin', goal: 1, xp: 1200, secret: true },
  { id: 'one_tap', stat: 'oneShots', goal: 10, xp: 1500, secret: true },
];

// What wearing it looks like: a title's tier, from plain to mythic, and the secret ones
// (mystery). Set by how hard it is to earn.
export const TITLE_TIERS = ['common', 'rare', 'epic', 'legendary', 'mythic', 'mystery'];
export function titleTier(id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return 'common';
  if (a.secret) return 'mystery';
  if (a.stat === 'rank') return a.goal >= 90 ? 'mythic' : a.goal >= 60 ? 'legendary' : a.goal >= 30 ? 'epic' : 'rare';
  return a.xp >= 3000 ? 'mythic' : a.xp >= 1200 ? 'legendary' : a.xp >= 500 ? 'epic' : a.xp >= 200 ? 'rare' : 'common';
}
export const ACHIEVEMENT = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// counters that keep the best value instead of adding up
const MAX_STATS = new Set(['bestKills', 'bestMulti', 'bestReturn', 'rank', 'outfits', 'bestDiv', 'opened', 'wskins', 'passTier', 'stitles', 'bestWave', 'bestGold']);

// What one finished raid adds to the career counters. p is the world's player record.
// squad: runners in the match; mvp: topped the squad's zombie kills on a clear
export function raidStats(p, { golden = false, lastExit = false, mode = null, squad = 1, mvp = false } = {}) {
  const out = p.status === 'extracted' || !!p.won;
  const won = !!p.won;
  const zed = mode?.kind === 'zombie';
  const gold = mode?.kind === 'gold';
  const side = zed || gold; // the side modes have their own achievements, not the raid ones
  const wk = p.wk ?? {};
  const secs = Math.max(0, Math.round((p.endedAt ?? 0) - (p.joinedAt ?? 0)));
  return {
    kHandgun: wk.handgun ?? 0,
    kShotgun: wk.shotgun ?? 0,
    kSmg: wk.smg ?? 0,
    kRifle: wk.rifle ?? 0,
    kSniper: wk.sniper ?? 0,
    kKnife: wk.knife ?? 0,
    turretKills: p.turretKills ?? 0,
    headshots: p.headshots ?? 0,
    oneShots: p.oneShots ?? 0,
    dmWins: won && mode?.kind === 'dm' ? 1 : 0,
    duelWins: won && mode?.id === 'duel' ? 1 : 0,
    teamWins: won && mode?.kind === 'team' ? 1 : 0,
    hcWins: won && mode?.hardcore ? 1 : 0,
    weaponWins: won && mode?.weapon ? 1 : 0,
    clutch: out && p.hp > 0 && p.hp <= (p.maxHp ?? 100) * 0.1 ? 1 : 0,
    flawless: out && !(p.dmgTaken > 0) && secs >= 120 ? 1 : 0,
    ninjaWin: won && mode && mode.kind !== 'raid' && !side && !p.kills ? 1 : 0,
    zRuns: zed ? 1 : 0,
    bestWave: zed ? p.zWave ?? 0 : 0,
    zKills: zed ? p.zk ?? 0 : 0,
    zBoss: zed && p.bossKill ? 1 : 0,
    zClears: zed && won ? 1 : 0,
    zMvp: zed && won && mvp ? 1 : 0,
    zSolo: zed && won && squad === 1 ? 1 : 0,
    goldRuns: gold ? 1 : 0,
    goldWins: gold && won ? 1 : 0,
    goldBags: gold ? p.gb ?? 0 : 0,
    bestGold: gold ? p.gb ?? 0 : 0,
    wins: p.won ? 1 : 0,
    raids: 1,
    extracts: out && !side ? 1 : 0,
    kills: p.kills ?? 0,
    bestKills: p.kills ?? 0,
    bestMulti: p.bestMulti ?? 0,
    prestige: p.prestige ?? 0,
    firstBloods: p.firstBlood ? 1 : 0,
    secs: Math.max(0, Math.round((p.endedAt ?? 0) - (p.joinedAt ?? 0))),
    bestReturn: out && !side && p.stake > 0 ? Math.floor((100 * p.payout) / p.stake) : 0,
    golden: out && golden ? 1 : 0,
    lastExit: out && lastExit ? 1 : 0,
    pacifist: out && !side && !p.kills ? 1 : 0,
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
