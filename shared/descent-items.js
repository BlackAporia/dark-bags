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
  { id: 'op1-easy', name: 'First Stroke', rarity: 'epic', color: '#f8fafc', accent: '#fb923c', pattern: 'digital', fx: 'glow', descent: 'easy', op: 'tunnels' },
  { id: 'op1-hard', name: 'Third Rail', rarity: 'legendary', color: '#facc15', accent: '#0ea5e9', pattern: 'fade', fx: 'plasma', descent: 'hard', op: 'tunnels' },
  { id: 'op1-hardcore', name: 'The Eraser', rarity: 'mythic', color: '#e5e7eb', accent: '#fb923c', pattern: 'wave', fx: 'galaxy', descent: 'hardcore', op: 'tunnels' },
];
export const OP_OUTFITS = [
  // easy: the one who walked out of the wipe, white lines and an orange hood, grey smoke at the heels
  { id: 'op1-easy', name: 'Wipe Walker', rarity: 'epic', descent: 'easy', op: 'tunnels', color: '#f8fafc', accent: '#fb923c', head: 'hood', fx: 'glow', fx2: 'shadow' },
  { id: 'op1-hard', name: 'Tunnel Runner', rarity: 'legendary', descent: 'hard', op: 'tunnels', color: '#facc15', accent: '#111827', head: 'visor', armor: { style: 'vanguard', plate: '#111827', trim: '#facc15', glow: '#0ea5e9' } },
  { id: 'op1-hardcore', name: 'Last Train', rarity: 'mythic', descent: 'hardcore', op: 'tunnels', color: '#f8fafc', accent: '#fb923c', head: 'helmet', fx: 'glow', fx2: 'lightning', cape: '#111827', armor: { style: 'warlord', plate: '#0b0f19', trim: '#f8fafc', glow: '#fb923c' } },
];
export const OP_STYLE = [
  { ...STY('banner', 'op1-easy', 'Last Platform', 'epic', ['#fb923c', '#0b0f19'], 'aurora', 'easy'), op: 'tunnels' },
  { ...STY('killfx', 'op1-hard', 'Rubbed Out', 'legendary', ['#e5e7eb', '#fb923c'], 'ghost', 'hard'), op: 'tunnels' },
  { ...STY('frame', 'op1-hardcore', 'Last Train Ring', 'mythic', ['#f8fafc', '#fb923c'], 'gold', 'hardcore'), op: 'tunnels' },
  { ...STY('namefx', 'op1-hardcore', 'First Stroke', 'mythic', ['#f8fafc', '#fb923c'], 'neon', 'hardcore'), op: 'tunnels' },
];
DESCENT_FINISHES.push(...OP_FINISHES);
DESCENT_OUTFITS.push(...OP_OUTFITS);
DESCENT_STYLE.push(...OP_STYLE);

// Zombies' own items, the graveyard set: only holding out against the waves hands them out
// (room.js zombieRewards), never a case, the shop, the Descent or an operation. The finish comes
// on whichever gun you took in, so it exists on every zombie weapon.
export const ZOMBIE_GUNS = ['knife', 'pistol', 'deagle', 'shotgun', 'autoshotgun', 'smg', 'pdw', 'rifle', 'carbine', 'scout', 'lmg', 'magnum', 'sniper'];
export const ZB_FINISHES = [{ id: 'zb-bone', name: 'Bone Saw', rarity: 'legendary', color: '#e7e5d8', accent: '#65a30d', pattern: 'tiger', fx: 'glow', zombies: true, guns: ZOMBIE_GUNS }];
export const ZB_OUTFITS = [
  { id: 'zb-digger', name: 'Grave Digger', rarity: 'epic', zombies: true, color: '#a3a38a', accent: '#365314', head: 'cap', fx2: 'shadow' },
  { id: 'zb-warden', name: 'Night Warden', rarity: 'legendary', zombies: true, color: '#e7e5d8', accent: '#65a30d', head: 'hood', fx: 'pulse', fx2: 'frost', cape: '#1a2e05', armor: { style: 'warlord', plate: '#0b1406', trim: '#a3e635', glow: '#65a30d' } },
];
export const ZB_STYLE = [
  { kind: 'banner', id: 'b-zb-fence', name: 'Cemetery Fence', rarity: 'epic', c: ['#65a30d', '#0b0f07'], fx: 'aurora', excl: true, zombies: true },
  { kind: 'namefx', id: 'n-zb-undead', name: 'Undead Script', rarity: 'legendary', c: ['#a3e635', '#e7e5d8'], fx: 'neon', excl: true, zombies: true },
];
// what holding out pays: the mid boss down (wave 10 cleared), and all twenty waves
export const ZB_REWARDS = [
  { wave: 10, items: [{ k: 'outfit', id: 'zb-digger' }, { k: 'style', id: 'b-zb-fence' }] },
  { wave: 20, items: [{ k: 'outfit', id: 'zb-warden' }, { k: 'wskin', id: '{gun}.zb-bone' }, { k: 'style', id: 'n-zb-undead' }] },
];
export const zbItems = (waves, gun = 'rifle') =>
  ZB_REWARDS.filter((r) => waves >= r.wave).flatMap((r) => r.items.map((it) => ({ ...it, id: it.id.replace('{gun}', ZOMBIE_GUNS.includes(gun) ? gun : 'rifle'), wave: r.wave })));
DESCENT_FINISHES.push(...ZB_FINISHES);
DESCENT_OUTFITS.push(...ZB_OUTFITS);
DESCENT_STYLE.push(...ZB_STYLE);
