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
