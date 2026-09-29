// DARK BAGS — shared tuning constants (used by server, offline mode and tests).
// Everything gameplay-relevant lives here so balancing is one-file work.

export const CFG = {
  // simulation
  TICK_RATE: 30,          // server ticks per second
  SNAP_EVERY: 2,          // send a snapshot every N ticks (15 Hz)

  // match flow
  ROUND_SECONDS: 180,     // one raid = 3 minutes
  INTERMISSION: 8,        // results screen between raids
  PREP_SECONDS: 20,       // ready-room countdown, starts at the first Ready
  PREP_ALL_READY: 5,      // countdown drops to this once every human in the room is ready
  BOT_REVEAL: 5,          // bots light up in the ready room during the last N seconds

  // map
  MAP_W: 2400,
  MAP_H: 2400,

  // players
  PLAYER_R: 18,
  SPEED: 230,             // px/s
  DASH_SPEED: 700,
  DASH_TIME: 0.15,
  DASH_CD: 2.4,
  HP: 100,
  MULTI_WINDOW: 4,        // seconds between kills to chain a double/triple/... kill
  SPAWN_SHIELD: 3,        // seconds of spawn protection; firing drops it early
  REGEN_DELAY: 4,         // seconds without damage before regen starts
  REGEN_RATE: 8,          // hp per second
  VISION: 520,            // you only see this far (and not through walls)

  // weapons live in weapons.js (Arms Race ladder)

  // extraction
  EXTRACT_R: 80,
  EXTRACT_TIME: 3,        // seconds standing in the zone; any hit resets it

  // loot
  PICKUP_R: 26,
  MAX_ORBS: 140,
  // value of each orb tier as a share of the room stake
  ORB_TIERS: [
    { name: 'dust', pct: 0.02, w: 70, r: 7 },
    { name: 'stack', pct: 0.08, w: 25, r: 10 },
    { name: 'chest', pct: 0.3, w: 5, r: 14 },
  ],
  OPENING_BURST: 0.4,     // share of the loot pool dropped on the map at raid start

  // economy (all amounts are integer sats)
  TIERS: [100, 1000, 10000],
  RAKE: 0.05,             // house fee taken from each stake
  BAG_SHARE: 0.5,         // share of the net stake you carry in; the rest is scattered as loot
  GOLDEN_EVERY: 4,        // every Nth raid in a room is a sponsored golden raid
  GOLDEN_BONUS: 3,        // sponsor adds this × stake to the golden raid's loot pool
  START_BALANCE: 100000,  // test-mode faucet

  // population
  BOT_FILL: 10,           // bots keep the raid at roughly this many runners
  MAX_PLAYERS: 24,
};

export const SKINS = ['#ff5a5f', '#4cc9f0', '#b5e48c', '#f72585', '#ffd166', '#9b5de5', '#00f5d4', '#ff9f1c'];

export const EXTRACT_NAMES = ['North Gate', 'Rail Tunnel', 'East Pier', 'Old Culvert', 'Scrapyard', 'South Dock', 'Sewer Hatch', 'West Bridge'];
