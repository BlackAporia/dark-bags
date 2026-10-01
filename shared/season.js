// Seasons: one per calendar month (UTC). Each has its own theme and its own items, which
// only that season's battle pass hands out: three armour sets that change a runner's whole
// silhouette, two weapon finishes and two turret skins. When the month ends they are gone
// for good (owners keep them). Ranked seasons follow the same calendar.
//
// Pure data and date maths: no dependencies, shared by the server and the client.

// a season's look: its colours, the armour's helmet, its particle effect and finish pattern
const THEMES = [
  { name: 'Neon Uprising', c1: '#ff2dd4', c2: '#00f5ff', dark: '#14061f', head: 'visor', fx2: 'sparks', pattern: 'fade', fx: 'plasma' },
  { name: 'Frostfall', c1: '#bae6fd', c2: '#3b82f6', dark: '#06121f', head: 'helmet', fx2: 'frost', pattern: 'wave', fx: 'ice' },
  { name: 'Inferno Protocol', c1: '#f97316', c2: '#fde047', dark: '#1c0702', head: 'horns', fx2: 'sparks', pattern: 'dots', fx: 'fire' },
  { name: 'Void Dynasty', c1: '#a855f7', c2: '#f0abfc', dark: '#0b0014', head: 'kabuto', fx2: 'galaxy', pattern: 'fade', fx: 'galaxy' },
  { name: 'Gold Rush', c1: '#ffd166', c2: '#fff3c4', dark: '#1a1205', head: 'crown', fx2: 'money', pattern: 'digital', fx: 'shimmer' },
  { name: 'Toxic Dawn', c1: '#a3e635', c2: '#22d3ee', dark: '#0a1402', head: 'mask', fx2: 'matrix', pattern: 'stripe', fx: 'plasma' },
  { name: 'Storm Legion', c1: '#38bdf8', c2: '#e0f2fe', dark: '#06121c', head: 'viking', fx2: 'lightning', pattern: 'wave', fx: 'plasma' },
  { name: 'Blood Moon', c1: '#ef4444', c2: '#fca5a5', dark: '#160404', head: 'horns', fx2: 'shadow', pattern: 'tiger', fx: 'fire' },
  { name: 'Jade Empire', c1: '#10b981', c2: '#fde68a', dark: '#03140d', head: 'kabuto', fx2: 'sparks', pattern: 'dots', fx: 'shimmer' },
  { name: 'Cyber Ronin', c1: '#f472b6', c2: '#22d3ee', dark: '#120614', head: 'visor', fx2: 'matrix', pattern: 'digital', fx: 'glow' },
  { name: 'Solar Flare', c1: '#fde047', c2: '#f97316', dark: '#1a1003', head: 'halo', fx2: 'sparks', pattern: 'fade', fx: 'fire' },
  { name: 'Abyss Walkers', c1: '#0ea5e9', c2: '#a5f3fc', dark: '#020617', head: 'hood', fx2: 'shadow', pattern: 'wave', fx: 'galaxy' },
];

export const FIRST_SEASON = '2026-10';
const SEASONS_AHEAD = 36; // the catalog holds three years of seasons

const pad = (n) => String(n).padStart(2, '0');
const idOf = (y, m) => `${y}-${pad(m + 1)}`;
const parse = (sid) => {
  const [y, m] = sid.split('-').map(Number);
  return { y, m: m - 1 };
};
const index = (sid) => {
  const a = parse(FIRST_SEASON);
  const b = parse(sid);
  return (b.y - a.y) * 12 + (b.m - a.m);
};

// the season running at `now` (ms): id, number, theme, start and end
export function seasonAt(now = Date.now()) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return seasonInfo(idOf(y, m));
}

export function seasonInfo(sid) {
  const { y, m } = parse(sid);
  const n = index(sid);
  return {
    id: sid,
    n: n + 1,
    theme: THEMES[((n % THEMES.length) + THEMES.length) % THEMES.length],
    start: Date.UTC(y, m, 1),
    end: Date.UTC(y, m + 1, 1),
  };
}

// every season the catalog knows (from the first, three years on)
const ALL = Array.from({ length: SEASONS_AHEAD }, (_, i) => {
  const { y, m } = parse(FIRST_SEASON);
  return seasonInfo(idOf(y + Math.floor((m + i) / 12), (m + i) % 12));
});

// armour: plate colour, trim, the glowing core, and a style (how much of it there is)
export const SEASON_OUTFITS = ALL.flatMap((s) => {
  const T = s.theme;
  const p = `s${s.id}`;
  return [
    { id: `${p}-vanguard`, name: `${T.name} Vanguard`, rarity: 'epic', season: s.id, color: T.c1, accent: T.dark, head: 'helmet', armor: { style: 'vanguard', plate: T.dark, trim: T.c1, glow: T.c2 } },
    { id: `${p}-warlord`, name: `${T.name} Warlord`, rarity: 'legendary', season: s.id, color: T.c1, accent: T.c2, head: T.head, fx: 'glow', armor: { style: 'warlord', plate: T.dark, trim: T.c1, glow: T.c2 } },
    { id: `${p}-apex`, name: `${T.name} Apex`, rarity: 'mythic', season: s.id, color: T.c2, accent: T.c1, head: T.head, fx: 'pulse', fx2: T.fx2, cape: T.dark, armor: { style: 'apex', plate: T.dark, trim: T.c2, glow: T.c1 } },
  ];
});

// weapon finishes: one legendary, one mythic, each on three guns
export const SEASON_FINISHES = ALL.flatMap((s) => {
  const T = s.theme;
  const p = `s${s.id}`;
  return [
    { id: `${p}-edge`, name: `${T.name} Edge`, rarity: 'legendary', season: s.id, color: T.c1, accent: T.c2, pattern: T.pattern, fx: 'shimmer', weapons: ['knife', 'deagle', 'rifle'] },
    { id: `${p}-relic`, name: `${T.name} Relic`, rarity: 'mythic', season: s.id, color: T.dark, accent: T.c1, pattern: T.pattern, fx: T.fx, weapons: ['knife', 'carbine', 'magnum'] },
  ];
});

// turret skins (guns + lasers): the turret's body, barrels and eye
export const SEASON_TURRETS = ALL.flatMap((s) => {
  const T = s.theme;
  const p = `s${s.id}`;
  return [
    { id: `${p}-sentry`, name: `${T.name} Sentry`, rarity: 'legendary', season: s.id, body: T.dark, trim: T.c1, eye: T.c2 },
    { id: `${p}-overwatch`, name: `${T.name} Overwatch`, rarity: 'mythic', season: s.id, body: T.c1, trim: T.c2, eye: '#ffffff', fx: true },
  ];
});
export const TURRET_SKIN = Object.fromEntries(SEASON_TURRETS.map((t) => [t.id, t]));

// the ids of one season's items
export function seasonItems(sid) {
  const p = `s${sid}`;
  return {
    vanguard: `${p}-vanguard`,
    warlord: `${p}-warlord`,
    apex: `${p}-apex`,
    edge: `${p}-edge`,
    relic: `${p}-relic`,
    sentry: `${p}-sentry`,
    overwatch: `${p}-overwatch`,
  };
}
