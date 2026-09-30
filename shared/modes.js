// Game modes. Every mode has stakes; how the money moves depends on the kind:
//
//   raid  the extraction game: half your stake rides in your bag, half is loot on
//         the map; get out through an exit to keep what you carry.
//   br    battle royale: every stake (minus the rake) goes into one prize pot, no
//         exits; the last runner standing takes the pot.
//   team  two teams, each player's stake grows the shared pot; the last team
//         standing takes it, split equally across the team (fallen teammates too).
//
// size: runners per raid (bots fill the empty spots); weapon: everyone holds this
// one weapon for the whole raid (no arms race); seconds: raid length.
export const MODES = [
  { id: 'raid', kind: 'raid', size: 10 },
  { id: 'br', kind: 'br', size: 20 },
  { id: 'duel', kind: 'br', size: 2, seconds: 90 },
  { id: 'knives', kind: 'br', size: 12, weapon: 'knife' },
  { id: 'pistols', kind: 'br', size: 12, weapon: 'pistol' },
  { id: 'shotguns', kind: 'br', size: 12, weapon: 'shotgun' },
  { id: 'rifles', kind: 'br', size: 12, weapon: 'rifle' },
  { id: 'snipers', kind: 'br', size: 12, weapon: 'sniper' },
  { id: 'team2', kind: 'team', size: 4, teamSize: 2, seconds: 150 },
  { id: 'team4', kind: 'team', size: 8, teamSize: 4 },
  { id: 'team8', kind: 'team', size: 16, teamSize: 8 },
];
export const MODE = Object.fromEntries(MODES.map((m) => [m.id, m]));
export const isPotMode = (m) => !!m && m.kind !== 'raid';
