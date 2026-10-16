// The Descent's own items (shared/descent.js hands them out): nothing else ever drops them.
// Every difficulty has its own set: two weapon finishes, three armours, and style (a banner, a
// kill effect, a frame, a name style, and the full clear's crown frame and crown name style for
// the chat). Rarer the harder: easy starts at Rare, hard at Epic, hardcore at Legendary, and the
// last milestones reach Mythic and Exotic. Pure data, no imports.
const DIFF_IDS = ['easy', 'hard', 'hardcore'];
export const RAR = ['common', 'rare', 'epic', 'legendary', 'mythic', 'exotic'];
export const BASE = { easy: 1, hard: 2, hardcore: 3 };
export const rarityAt = (diff, i) => RAR[Math.min(5, (BASE[diff] ?? 1) + Math.floor((i * 3) / 9))];
const SETS = {
  easy: { name: 'Warden', c1: '#34d399', c2: '#a7f3d0', dark: '#04170f', head: 'helmet', fx2: 'frost', fin: [['Verdigris', 'wave', null], ['Warden Rune', 'digital', 'glow']], style: { banner: 'aurora', killfx: 'frost', frame: 'frost', namefx: 'ice', crownFrame: 'gold', crownName: 'neon' } },
  hard: { name: 'Emberforged', c1: '#f97316', c2: '#fde047', dark: '#1c0702', head: 'horns', fx2: 'sparks', fin: [['Emberforged', 'dots', 'fire'], ['Hellfire Sigil', 'fade', 'fire']], style: { banner: 'lava', killfx: 'firework', frame: 'inferno', namefx: 'fire', crownFrame: 'inferno', crownName: 'rainbow' } },
  hardcore: { name: 'Abyssal', c1: '#a855f7', c2: '#22d3ee', dark: '#05010d', head: 'kabuto', fx2: 'galaxy', fin: [['Abyssal', 'wave', 'plasma'], ['Void Crown', 'fade', 'galaxy']], style: { banner: 'galaxy', killfx: 'blackhole', frame: 'void', namefx: 'glitch', crownFrame: 'prism', crownName: 'prism' } },
};

export const DESCENT_FINISHES = DIFF_IDS.flatMap((d) =>
  SETS[d].fin.map(([name, pattern, fx], j) => ({ id: `dx-${d}-${'ab'[j]}`, name, rarity: rarityAt(d, j ? 6 : 0), color: j ? SETS[d].c2 : SETS[d].c1, accent: j ? SETS[d].c1 : SETS[d].dark, pattern, ...(fx ? { fx } : {}), descent: d })),
);
export const DESCENT_OUTFITS = DIFF_IDS.flatMap((d) => {
  const S = SETS[d];
  return [
    { id: `dx-${d}-1`, name: `${S.name} Plate`, rarity: rarityAt(d, 4), descent: d, color: S.c1, accent: S.dark, head: 'helmet', armor: { style: 'vanguard', plate: S.dark, trim: S.c1, glow: S.c2 } },
    { id: `dx-${d}-2`, name: `${S.name} Lord`, rarity: rarityAt(d, 8), descent: d, color: S.c1, accent: S.c2, head: S.head, fx: 'glow', armor: { style: 'warlord', plate: S.dark, trim: S.c1, glow: S.c2 } },
    { id: `dx-${d}-3`, name: `${S.name} Conqueror`, rarity: RAR[Math.min(5, (BASE[d] ?? 1) + 4)], descent: d, crown: true, color: S.c2, accent: S.c1, head: 'crown', fx: 'pulse', fx2: S.fx2, cape: S.dark, armor: { style: 'apex', plate: S.dark, trim: S.c2, glow: S.c1 } },
  ];
});
const STY = (kind, id, name, rarity, c, fx, d) => ({ kind, id: `${kind[0]}-${id}`, name, rarity, c, fx, excl: true, descent: d });
export const DESCENT_STYLE = DIFF_IDS.flatMap((d) => {
  const S = SETS[d];
  const c = [S.c1, S.c2];
  return [
    STY('banner', `dx-${d}`, `${S.name} Depths`, rarityAt(d, 1), [S.c1, S.dark], S.style.banner, d),
    STY('killfx', `dx-${d}`, `${S.name} Burst`, rarityAt(d, 3), c, S.style.killfx, d),
    STY('frame', `dx-${d}`, `${S.name} Ring`, rarityAt(d, 5), c, S.style.frame, d),
    STY('namefx', `dx-${d}`, `${S.name} Script`, rarityAt(d, 7), c, S.style.namefx, d),
    STY('frame', `dx-${d}-crown`, `${S.name} Crown`, RAR[Math.min(5, (BASE[d] ?? 1) + 4)], [S.c2, S.c1], S.style.crownFrame, d),
    STY('namefx', `dx-${d}-crown`, `${S.name} Sovereign`, RAR[Math.min(5, (BASE[d] ?? 1) + 4)], [S.c2, S.c1], S.style.crownName, d),
  ];
});

// the guns the Descent's finishes come on: the four class guns and the two pistols
export const DESCENT_GUNS = ['carbine', 'smg', 'shotgun', 'sniper', 'pistol', 'deagle'];

// The story operations' own items (shared/story.js hands them out for completing an operation,
// once per difficulty). They ride with the Descent's lists: PvE only, never in cases or the shop.
// Operation 1, the Tunnels: the first stroke of the flash, the third rail, the last train.
export const OP_FINISHES = [
  { id: 'op1-easy', name: 'First Stroke', rarity: 'rare', color: '#f8fafc', accent: '#fb923c', pattern: 'digital', fx: 'glow', descent: 'easy', op: 'tunnels' },
  { id: 'op1-hard', name: 'Third Rail', rarity: 'epic', color: '#facc15', accent: '#0ea5e9', pattern: 'fade', fx: 'plasma', descent: 'hard', op: 'tunnels' },
];
export const OP_OUTFITS = [
  { id: 'op1-hard', name: 'Tunnel Runner', rarity: 'epic', descent: 'hard', op: 'tunnels', color: '#facc15', accent: '#111827', head: 'visor', armor: { style: 'vanguard', plate: '#111827', trim: '#facc15', glow: '#0ea5e9' } },
  { id: 'op1-hardcore', name: 'Last Train', rarity: 'legendary', descent: 'hardcore', op: 'tunnels', color: '#f8fafc', accent: '#fb923c', head: 'helmet', fx: 'glow', cape: '#111827', armor: { style: 'warlord', plate: '#0b0f19', trim: '#f8fafc', glow: '#fb923c' } },
];
export const OP_STYLE = [
  { ...STY('banner', 'op1-easy', 'Last Platform', 'rare', ['#fb923c', '#0b0f19'], 'aurora', 'easy'), op: 'tunnels' },
  { ...STY('frame', 'op1-hardcore', 'Last Train Ring', 'legendary', ['#f8fafc', '#fb923c'], 'gold', 'hardcore'), op: 'tunnels' },
  { ...STY('namefx', 'op1-hardcore', 'First Stroke', 'legendary', ['#f8fafc', '#fb923c'], 'neon', 'hardcore'), op: 'tunnels' },
];
DESCENT_FINISHES.push(...OP_FINISHES);
DESCENT_OUTFITS.push(...OP_OUTFITS);
DESCENT_STYLE.push(...OP_STYLE);
