// Game modes. Every mode has stakes; how the money moves depends on the kind:
//
//   raid  the extraction game: half your stake rides in your bag, half is loot on
//         the map; get out through an exit to keep what you carry.
//   br    battle royale: every stake (minus the rake) goes into one prize pot, no
//         exits; the last runner standing takes the pot.
//   dm    deathmatch: every stake into one pot, everyone for themselves, and you come
//         back a few seconds after you die. When the clock runs out the runner with
//         the most kills takes the pot (a tie splits it).
//   team  two teams, each player's stake grows the shared pot; the last team
//         standing takes it, split equally across the team (fallen teammates too).
//
// size: runners per raid (bots fill the empty spots); weapon: everyone holds this
// one weapon for the whole raid (no arms race); seconds: raid length;
// hardcore: one hit and you're down; shop: in-match credits buy medkits, sentry
// turrets and laser tripmines (Guns + Lasers, after the CS 1.6 CSDM mod); ranked: the
// finish moves your season rating and may earn a bonus spin.
//
//   zombie  co-op survival on the graveyard map: alone or with up to three friends, hold
//           out against ten waves of the dead coming from every side, the last one a boss.
//           The entry is a flat fee; it pays XP (more for every wave survived),
//           achievements and titles, not money. You pick your weapon before you go in.
//   gold    gold rush on the mine map: bags of gold drop all over, grab more than anyone
//           before the clock runs out. Random weapons, quick respawns. The one runner with
//           the most bags takes the whole pot (minus the rake) as shop credit.
//
// fixed: the only stake the mode takes (mills); solo: one ready player can start it.
// pick: you choose your weapon in the ready room and keep it the whole match (bots get a
// random gun). rounds: the match is played in rounds on a clock; a round goes to the last
// side standing, or when time runs out to the side with the most runners (then health)
// alive; the first to win `rounds` rounds takes the pot. Everyone comes back for each round.
export const MODES = [
  { id: 'raid', kind: 'raid', size: 10 },
  { id: 'br', kind: 'br', size: 20 },
  { id: 'duel', kind: 'br', size: 2, seconds: 90 },
  { id: 'dm', kind: 'dm', size: 12, seconds: 180 },
  { id: 'gl', kind: 'dm', size: 12, seconds: 240, shop: true },
  { id: 'hardcore', kind: 'br', size: 12, hardcore: true },
  { id: 'knives', kind: 'br', size: 12, weapon: 'knife' },
  { id: 'pistols', kind: 'br', size: 12, weapon: 'pistol' },
  { id: 'shotguns', kind: 'br', size: 12, weapon: 'shotgun' },
  { id: 'rifles', kind: 'br', size: 12, weapon: 'rifle' },
  { id: 'snipers', kind: 'br', size: 12, weapon: 'sniper' },
  // teams and ranked are played in rounds on a clock (rounds: wins needed, round: seconds),
  // with the weapon you pick in the ready room
  { id: 'team2', kind: 'team', size: 4, teamSize: 2, pick: true, rounds: 2, round: 60 },
  { id: 'team4', kind: 'team', size: 8, teamSize: 4, pick: true, rounds: 2, round: 75 },
  { id: 'team8', kind: 'team', size: 16, teamSize: 8, pick: true, rounds: 2, round: 90 },
  // ranked: a battle royale that also moves your season rating (ranked.js)
  { id: 'ranked', kind: 'br', size: 10, ranked: true, pick: true, rounds: 2, round: 90 },
  // zombies: no clock (two hours is only a safety net) and the Guns + Lasers buy menu
  { id: 'zombies', kind: 'zombie', size: 4, seconds: 7200, fixed: 100, solo: true, pick: true, shop: true },
  { id: 'gold', kind: 'gold', size: 8, seconds: 150, fixed: 100 },
];
export const MODE = Object.fromEntries(MODES.map((m) => [m.id, m]));
export const isPotMode = (m) => !!m && m.kind !== 'raid';

// weapons a zombie hunter may take in (everything with a magazine, and the knife for the brave)
export const ZOMBIE_WEAPONS = ['knife', 'pistol', 'deagle', 'shotgun', 'autoshotgun', 'smg', 'pdw', 'rifle', 'carbine', 'scout', 'lmg', 'magnum', 'sniper'];
