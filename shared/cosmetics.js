// Cosmetics: characters, outfits, weapon skins and luck boxes.
//
// Skins come only out of boxes (and rank-up trials): nothing is sold directly.
// Two families, always sold separately:
//   outfit bags   for your runner (looks, headgear, capes, auras, particles)
//   weapon crates for your guns and knife (finishes per weapon)
// Each family has nine tiers from $0.99 to $999; the dearer the box, the better the
// odds, up to a 30% shot at an Exotic in the $999 tier. A few Exotics are limited
// editions: only a fixed number will ever drop, each one numbered.
//
// What keeps it fair:
//   - odds are published on every box, and the roll happens on the server
//   - pity: Epic-or-better within 15 opens and Legendary-or-better within 60, per box
//   - smart drops: you get something you don't own while that rarity has any left;
//     a duplicate pays 10% of its rarity's value back as shop $
//   - buy one or many at once; boxes you hold are used first
//
// One shop currency: shop $, bought 1:1 with USDC/USDT (packs add a bonus). It only
// spends here and cannot be withdrawn. A purchase spends shop $ first and tops up the
// exact difference from the player's USDC/USDT.
// Rank-ups pay one thing: a random outfit to try for 72 hours. Nothing here changes
// how a runner plays. It is all looks.
import { WEAPONS } from './weapons.js';

export const BODIES = ['m', 'f'];

export const RARITIES = {
  // value: what the rarity is worth in cents (duplicates refund 10% of it)
  common: { name: 'Common', color: '#b8bfcc', value: 49, refund: 5 },
  rare: { name: 'Rare', color: '#4cc9f0', value: 149, refund: 15 },
  epic: { name: 'Epic', color: '#b37bff', value: 399, refund: 40 },
  legendary: { name: 'Legendary', color: '#f7931a', value: 999, refund: 100 },
  mythic: { name: 'Mythic', color: '#ff3d7f', value: 1999, refund: 200 },
  exotic: { name: 'Exotic', color: '#00f0ff', value: 4999, refund: 500 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic', 'exotic'];
const rank = (r) => RARITY_ORDER.indexOf(r);

// head: none cap beanie bandana helmet mask hood horns kabuto tophat crown halo visor
//       catears dogears bunny wizard viking astro mohawk antenna cowboy pumpkin skull
//       frog domino party headphones diamond
// fx (aura): glow, pulse, ghost (translucent), laser (eye beams), rainbow (hue cycles),
//     fire, gold (shimmering gold), holo (flickering hologram), glitch (RGB split)
// fx2 (particles): lightning, galaxy, sparks, frost, money, matrix, shadow
// cape: a colour for a cape off the shoulders; limited: how many will ever exist
// Names are original archetypes (crypto memes, comics, cartoons, sci-fi); no real
// characters or brands.

const BASIC = ['#ff5a5f', '#4cc9f0', '#b5e48c', '#f72585', '#ffd166', '#9b5de5', '#00f5d4', '#ff9f1c'];
const BASIC_NAMES = ['Red', 'Sky', 'Moss', 'Magenta', 'Sun', 'Violet', 'Mint', 'Tangerine'];

export const OUTFITS = [
  ...BASIC.map((color, i) => ({ id: `basic-${i}`, name: `${BASIC_NAMES[i]} Runner`, rarity: 'common', color, head: 'none', basic: true })),
  { id: 'olive', name: 'Olive Drab', rarity: 'common', color: '#8a9a5b', head: 'cap' },
  { id: 'slate', name: 'Slate', rarity: 'common', color: '#8c9aab', head: 'beanie' },
  { id: 'rust', name: 'Rust', rarity: 'common', color: '#c4561c', head: 'bandana' },
  { id: 'denim', name: 'Denim', rarity: 'common', color: '#5b82c4', head: 'cap' },
  { id: 'khaki', name: 'Khaki', rarity: 'common', color: '#c3b091', head: 'helmet' },
  { id: 'night-ops', name: 'Night Ops', rarity: 'rare', color: '#6f8fe8', accent: '#1d2745', head: 'helmet' },
  { id: 'hazard', name: 'Hazard', rarity: 'rare', color: '#ffb000', accent: '#1a1a1a', head: 'beanie' },
  { id: 'arctic', name: 'Arctic', rarity: 'rare', color: '#e8f1ff', accent: '#9fd3ff', head: 'beanie' },
  { id: 'toxic', name: 'Toxic', rarity: 'rare', color: '#9ef01a', accent: '#2b2b2b', head: 'mask' },
  { id: 'desert', name: 'Desert Storm', rarity: 'rare', color: '#d9b77e', accent: '#7a5a2a', head: 'helmet' },
  { id: 'neon', name: 'Neon Pink', rarity: 'rare', color: '#ff4fd8', accent: '#ffffff', head: 'bandana' },
  { id: 'ghost', name: 'Ghost', rarity: 'epic', color: '#dfe7ff', head: 'hood', fx: 'ghost' },
  { id: 'blood-moon', name: 'Blood Moon', rarity: 'epic', color: '#e0233a', accent: '#ffb3b3', head: 'horns', fx: 'glow' },
  { id: 'circuit', name: 'Circuit', rarity: 'epic', color: '#00f5d4', accent: '#0b3d36', head: 'helmet', fx: 'pulse' },
  { id: 'samurai', name: 'Ronin', rarity: 'epic', color: '#e63946', accent: '#ffd166', head: 'kabuto' },
  { id: 'gentleman', name: 'Gentleman', rarity: 'epic', color: '#f1f1f1', accent: '#1b1b1b', head: 'tophat' },
  { id: 'satoshi', name: 'Satoshi', rarity: 'legendary', color: '#f7931a', accent: '#ffe29a', head: 'hood', fx: 'glow' },
  { id: 'laser-eyes', name: 'Laser Eyes', rarity: 'legendary', color: '#ff2d55', accent: '#ff2d55', head: 'none', fx: 'laser' },
  { id: 'gold-bag', name: 'Gold Bag', rarity: 'legendary', color: '#ffd166', accent: '#fff3c4', head: 'crown', fx: 'glow' },
  { id: 'void', name: 'Void Walker', rarity: 'legendary', color: '#b36bff', accent: '#140f24', head: 'hood', fx: 'pulse' },
  { id: 'genesis', name: 'Genesis Block', rarity: 'mythic', color: '#ffffff', head: 'halo', fx: 'rainbow' },
  { id: 'inferno', name: 'Inferno', rarity: 'mythic', color: '#ff5a1f', accent: '#ffd166', head: 'horns', fx: 'fire' },
  // commons: everyday crypto and street
  { id: 'paper-hands', name: 'Paper Hands', rarity: 'common', color: '#f4f1ea', accent: '#3a3a3a', head: 'headphones' },
  { id: 'gm', name: 'GM Sunrise', rarity: 'common', color: '#ffb347', accent: '#b35c00', head: 'cap' },
  { id: 'stacker', name: 'Stacker', rarity: 'common', color: '#7bc67b', accent: '#2f5d2f', head: 'beanie' },
  { id: 'rookie-vest', name: 'Rookie Vest', rarity: 'common', color: '#9aa5b1', accent: '#4a5561', head: 'helmet' },
  { id: 'streetwear', name: 'Streetwear', rarity: 'common', color: '#e5e5e5', accent: '#ef233c', head: 'headphones' },
  { id: 'woodland', name: 'Woodland', rarity: 'common', color: '#6b8f5e', accent: '#2f4a2a', head: 'bandana' },
  // rares: memes and cartoon archetypes
  { id: 'hodler', name: 'HODLer', rarity: 'rare', color: '#5b8fd8', accent: '#1f3a60', head: 'beanie' },
  { id: 'degen', name: 'Degen', rarity: 'rare', color: '#ff006e', accent: '#ffbe0b', head: 'party' },
  { id: 'shiba-scout', name: 'Shiba Scout', rarity: 'rare', color: '#f4a261', accent: '#e76f51', head: 'dogears' },
  { id: 'rug-pull', name: 'Rug Pull', rarity: 'rare', color: '#9d7fb0', accent: '#e56b6f', head: 'mask' },
  { id: 'sheriff', name: 'Sheriff', rarity: 'rare', color: '#d8b27c', accent: '#6b4423', head: 'cowboy' },
  { id: 'toon-cat', name: 'Toon Cat', rarity: 'rare', color: '#ff8fab', accent: '#ffc2d1', head: 'catears' },
  { id: 'bunny-bandit', name: 'Bunny Bandit', rarity: 'rare', color: '#ececec', accent: '#ff5d8f', head: 'bunny' },
  { id: 'mad-scientist', name: 'Mad Scientist', rarity: 'rare', color: '#f1faee', accent: '#7fd1d8', head: 'mohawk' },
  { id: 'airdrop', name: 'Airdrop Hunter', rarity: 'rare', color: '#90be6d', accent: '#2d6a4f', head: 'cap' },
  // epics: glowing heroes, meme icons, sci-fi
  { id: 'moon-boy', name: 'Moon Boy', rarity: 'epic', color: '#cfd8ff', accent: '#5b6cff', head: 'astro', fx: 'pulse' },
  { id: 'much-wow', name: 'Much Wow', rarity: 'epic', color: '#e9c46a', accent: '#c47f2c', head: 'dogears', fx: 'glow' },
  { id: 'frog-prince', name: 'Frog Prince', rarity: 'epic', color: '#52b788', accent: '#2d6a4f', head: 'frog', fx: 'pulse' },
  { id: 'validator', name: 'Validator', rarity: 'epic', color: '#4cc9f0', accent: '#1b263b', head: 'visor', fx: 'glow' },
  { id: 'bear-market', name: 'Bear Market', rarity: 'epic', color: '#a1887f', accent: '#3e2723', head: 'catears', fx2: 'shadow' },
  { id: 'pumpkin-king', name: 'Pumpkin King', rarity: 'epic', color: '#ff8c1a', accent: '#2b2b2b', head: 'pumpkin', fx2: 'sparks' },
  { id: 'alien', name: 'Alien Visitor', rarity: 'epic', color: '#9ef01a', accent: '#1b4332', head: 'antenna', fx: 'holo' },
  { id: 'arcade', name: 'Arcade Glitch', rarity: 'epic', color: '#ff2dd4', accent: '#00f5ff', head: 'visor', fx: 'glitch' },
  { id: 'neon-ninja', name: 'Neon Ninja', rarity: 'epic', color: '#2b3a55', accent: '#00f5d4', head: 'bandana', fx: 'pulse' },
  { id: 'caped-wonder', name: 'Caped Wonder', rarity: 'epic', color: '#3a86ff', accent: '#ff006e', head: 'domino', cape: '#e0115f' },
  // legendaries: bright, animated, unmistakable
  { id: 'diamond-hands', name: 'Diamond Hands', rarity: 'legendary', color: '#9fe8ff', accent: '#e0fbff', head: 'diamond', fx: 'glow', fx2: 'sparks' },
  { id: 'bull-run', name: 'Bull Run', rarity: 'legendary', color: '#2dc653', accent: '#f1e3c8', head: 'horns', fx: 'gold' },
  { id: 'whale', name: 'Whale', rarity: 'legendary', color: '#3b82f6', accent: '#93c5fd', head: 'headphones', fx: 'pulse', fx2: 'money' },
  { id: 'night-vigilante', name: 'Night Vigilante', rarity: 'legendary', color: '#4b5563', accent: '#0b0b0b', head: 'domino', cape: '#0b0b10', fx2: 'shadow' },
  { id: 'space-ranger', name: 'Space Ranger', rarity: 'legendary', color: '#e5e7eb', accent: '#7c3aed', head: 'astro', fx: 'glow', fx2: 'galaxy' },
  { id: 'skull-rider', name: 'Skull Rider', rarity: 'legendary', color: '#efe8d8', accent: '#111111', head: 'skull', fx: 'fire' },
  { id: 'chrome-android', name: 'Chrome Android', rarity: 'legendary', color: '#d1d5db', accent: '#4b5563', head: 'visor', fx: 'glow', fx2: 'sparks' },
  { id: 'frost-queen', name: 'Frost Queen', rarity: 'legendary', color: '#bde0fe', accent: '#a2d2ff', head: 'crown', fx: 'glow', fx2: 'frost' },
  { id: 'matrix-runner', name: 'Matrix Runner', rarity: 'legendary', color: '#39ff14', accent: '#022c22', head: 'visor', fx: 'pulse', fx2: 'matrix' },
  { id: 'zero-knowledge', name: 'Zero Knowledge', rarity: 'legendary', color: '#9d7bff', accent: '#1e1b4b', head: 'hood', fx: 'holo', fx2: 'sparks' },
  // mythics: gods of the multiverse, with capes and particle storms
  { id: 'thunder-god', name: 'Thunder God', rarity: 'mythic', color: '#60a5fa', accent: '#c0c0c0', head: 'viking', fx: 'glow', fx2: 'lightning', cape: '#b91c1c' },
  { id: 'cosmic-wizard', name: 'Cosmic Wizard', rarity: 'mythic', color: '#a78bfa', accent: '#312e81', head: 'wizard', fx: 'pulse', fx2: 'galaxy', cape: '#1e1b4b' },
  { id: 'shadow-demon', name: 'Shadow Demon', rarity: 'mythic', color: '#ef4444', accent: '#1a0000', head: 'horns', fx: 'fire', fx2: 'shadow', cape: '#1a0000' },
  { id: 'galaxy-brain', name: 'Galaxy Brain', rarity: 'mythic', color: '#f0abfc', head: 'halo', fx: 'rainbow', fx2: 'galaxy' },
  { id: 'money-printer', name: 'Money Printer', rarity: 'mythic', color: '#22c55e', accent: '#14532d', head: 'visor', fx: 'gold', fx2: 'money' },
  { id: 'stark-pioneer', name: 'Stark Pioneer', rarity: 'mythic', color: '#ec796b', accent: '#0c0c4f', head: 'astro', fx: 'holo', fx2: 'galaxy', cape: '#0c0c4f' },
  // exotics: the rarest in the game, everything at once
  { id: 'golden-bull', name: 'Golden Bull', rarity: 'exotic', limited: 500, color: '#ffd166', accent: '#fff3c4', head: 'horns', fx: 'gold', fx2: 'money', cape: '#8a6508' },
  { id: 'genesis-ghost', name: 'Genesis Ghost', rarity: 'exotic', limited: 250, color: '#a5f3fc', accent: '#0e7490', head: 'hood', fx: 'holo', fx2: 'matrix', cape: '#083344' },
  { id: 'multiverse-prime', name: 'Multiverse Prime', rarity: 'exotic', limited: 100, color: '#ffffff', head: 'halo', fx: 'rainbow', fx2: 'lightning', cape: '#f8fafc' },
  { id: 'void-emperor', name: 'Void Emperor', rarity: 'exotic', color: '#c084fc', accent: '#000000', head: 'crown', fx: 'glitch', fx2: 'galaxy', cape: '#050008' },
  // more exotics, open supply
  { id: 'celestial', name: 'Celestial Knight', rarity: 'exotic', color: '#fef3c7', accent: '#f59e0b', head: 'helmet', fx: 'gold', fx2: 'galaxy', cape: '#1e3a8a' },
  { id: 'neon-samurai', name: 'Neon Samurai', rarity: 'exotic', color: '#f472b6', accent: '#22d3ee', head: 'kabuto', fx: 'glitch', fx2: 'lightning', cape: '#0f172a' },
  { id: 'phoenix', name: 'Phoenix', rarity: 'exotic', color: '#fb923c', accent: '#fde047', head: 'crown', fx: 'fire', fx2: 'sparks', cape: '#b91c1c' },
  // limited editions: a fixed number will ever exist, numbered as they drop
  { id: 'first-block', name: 'First Block #1', rarity: 'exotic', limited: 21, color: '#ffffff', accent: '#f7931a', head: 'diamond', fx: 'gold', fx2: 'money', cape: '#f7931a' },
  { id: 'singularity', name: 'Singularity', rarity: 'exotic', limited: 50, color: '#111111', accent: '#a855f7', head: 'halo', fx: 'glitch', fx2: 'galaxy', cape: '#000000' },
];

export const OUTFIT = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));
export const DEFAULT_OUTFIT = 'basic-0';

// ------------------------------------------------------------ weapon skins
// Finishes, each available on every weapon. fx: glow, shimmer, rainbow, fire, ice,
// galaxy, plasma; pattern: camo, tiger, carbon, digital (drawn as stripes on the art).
export const FINISHES = [
  { id: 'field', name: 'Field', rarity: 'common', color: '#6b7c4b' },
  { id: 'sand', name: 'Sand', rarity: 'common', color: '#c8a870' },
  { id: 'urban', name: 'Urban', rarity: 'common', color: '#8a929c' },
  { id: 'arctic', name: 'Arctic', rarity: 'common', color: '#e9f1f7' },
  { id: 'crimson', name: 'Crimson', rarity: 'common', color: '#b3242f' },
  { id: 'woodland', name: 'Woodland', rarity: 'rare', color: '#556b2f', accent: '#2f3b1d', pattern: 'camo' },
  { id: 'tiger', name: 'Tiger', rarity: 'rare', color: '#f59e0b', accent: '#111111', pattern: 'tiger' },
  { id: 'carbon', name: 'Carbon', rarity: 'rare', color: '#2b2b2b', accent: '#5a5a5a', pattern: 'carbon' },
  { id: 'cobalt', name: 'Cobalt', rarity: 'rare', color: '#2563eb', accent: '#93c5fd' },
  { id: 'digital', name: 'Digital', rarity: 'rare', color: '#64748b', accent: '#cbd5e1', pattern: 'digital' },
  { id: 'neon', name: 'Neon', rarity: 'epic', color: '#ff2dd4', accent: '#00f5ff', fx: 'glow' },
  { id: 'toxic', name: 'Toxic', rarity: 'epic', color: '#9ef01a', accent: '#1b4332', fx: 'glow' },
  { id: 'blood', name: 'Bloodline', rarity: 'epic', color: '#7f1d1d', accent: '#ef4444', pattern: 'tiger' },
  { id: 'hazard', name: 'Hazard', rarity: 'epic', color: '#facc15', accent: '#111111', pattern: 'digital' },
  { id: 'gold', name: 'Gold', rarity: 'legendary', color: '#ffd166', accent: '#fff3c4', fx: 'shimmer' },
  { id: 'chrome', name: 'Chrome', rarity: 'legendary', color: '#e5e7eb', accent: '#9ca3af', fx: 'shimmer' },
  { id: 'ice', name: 'Glacier', rarity: 'legendary', color: '#bae6fd', accent: '#e0f2fe', fx: 'ice' },
  { id: 'inferno', name: 'Inferno', rarity: 'legendary', color: '#f97316', accent: '#fde047', fx: 'fire' },
  { id: 'galaxy', name: 'Galaxy', rarity: 'mythic', color: '#7c3aed', accent: '#f0abfc', fx: 'galaxy' },
  { id: 'plasma', name: 'Plasma', rarity: 'mythic', color: '#22d3ee', accent: '#a78bfa', fx: 'plasma' },
  { id: 'diamond', name: 'Diamond', rarity: 'mythic', color: '#9fe8ff', accent: '#ffffff', fx: 'shimmer' },
  { id: 'prism', name: 'Prism', rarity: 'exotic', color: '#ffffff', fx: 'rainbow' },
  { id: 'void', name: 'Void', rarity: 'exotic', color: '#0b0014', accent: '#a855f7', fx: 'plasma' },
  { id: 'genesis', name: 'Genesis', rarity: 'exotic', limited: 100, color: '#f7931a', accent: '#fff3c4', fx: 'rainbow' },
];
export const FINISH = Object.fromEntries(FINISHES.map((f) => [f.id, f]));

// Each skin is also a model: the rarer the finish, the wilder the weapon. Knife skins
// become daggers, machetes, axes, katanas, twin blades, scythes, energy swords; guns
// become revolvers, hand cannons, double barrels, assault rifles, railguns. Looks only:
// every model of a weapon hits exactly like the plain one.
export const MODEL_NAMES = {
  knife: 'Knife', dagger: 'Dagger', machete: 'Machete', tanto: 'Tanto', cleaver: 'Cleaver', axe: 'Axe', katana: 'Katana', dual: 'Twin Blades', scythe: 'Scythe', esword: 'Energy Sword', hammer: 'War Hammer',
  pistol: 'Pistol', revolver: 'Revolver', deagle: 'Hand Cannon', blaster: 'Blaster',
  shotgun: 'Shotgun', double: 'Double Barrel', drum: 'Drum Shotgun',
  smg: 'SMG', uzi: 'Machine Pistol', vector: 'Vector SMG',
  rifle: 'Rifle', ak: 'Assault Rifle', bullpup: 'Bullpup', plasma: 'Plasma Rifle',
  sniper: 'Laser Sniper', bolt: 'Bolt Sniper', rail: 'Railgun',
};
// models per weapon, by rarity (common → exotic); finishes of one rarity cycle through the list
const MODELS = {
  knife: [['knife', 'dagger'], ['machete', 'tanto', 'cleaver'], ['axe', 'cleaver', 'machete'], ['katana', 'axe'], ['dual', 'scythe', 'katana'], ['esword', 'hammer', 'scythe']],
  pistol: [['pistol'], ['pistol', 'revolver'], ['revolver', 'deagle'], ['deagle', 'revolver'], ['blaster', 'deagle'], ['blaster']],
  shotgun: [['shotgun'], ['shotgun', 'double'], ['double', 'drum'], ['drum', 'double'], ['drum'], ['double', 'drum']],
  smg: [['smg'], ['smg', 'uzi'], ['uzi', 'vector'], ['vector'], ['vector', 'uzi'], ['vector']],
  rifle: [['rifle'], ['rifle', 'ak'], ['ak', 'bullpup'], ['bullpup', 'ak'], ['plasma', 'bullpup'], ['plasma']],
  sniper: [['sniper'], ['sniper', 'bolt'], ['bolt'], ['bolt', 'rail'], ['rail'], ['rail']],
};
export function modelFor(weapon, finishId) {
  const f = FINISH[finishId];
  const list = MODELS[weapon];
  if (!f || !list) return weapon;
  const ri = RARITY_ORDER.indexOf(f.rarity);
  const same = FINISHES.filter((x) => x.rarity === f.rarity);
  const opts = list[ri] ?? [weapon];
  return opts[same.indexOf(f) % opts.length];
}
export const WEAPON_SKINS = WEAPONS.flatMap((w) =>
  FINISHES.map((f) => {
    const model = modelFor(w.id, f.id);
    return { id: `${w.id}.${f.id}`, weapon: w.id, finish: f.id, model, name: `${f.name} ${MODEL_NAMES[model]}`, rarity: f.rarity, ...(f.limited ? { limited: f.limited } : {}) };
  }),
);
export const WSKIN = Object.fromEntries(WEAPON_SKINS.map((s) => [s.id, s]));

// ------------------------------------------------------------------ boxes
// odds in percent; the jackpot is what a box is "for" (shared as a hit or a miss);
// prices in US cents; tier drives the odds and the share of limited editions
// Priced for impulse at the bottom ($0.49) and a $99.99 ceiling at the top (whales buy
// ×10 or ×100 rather than one $999 box). Every step up is better value per dollar: the
// expected price of a Mythic falls from ~$250 to ~$180 and of an Exotic from ~$2,500 to
// ~$1,250, so players are pulled up the ladder while Exotics and limited editions stay
// scarce. The guarantee caps the worst case on the top three at ~$1,600–1,800 an Exotic.
const TIERS = [
  { price: 49, odds: { common: 82, rare: 15, epic: 2.6, legendary: 0.4 }, jackpot: 'legendary' },
  { price: 99, odds: { common: 62, rare: 28, epic: 8, legendary: 1.8, mythic: 0.2 }, jackpot: 'legendary' },
  { price: 199, odds: { common: 30, rare: 46, epic: 18.12, legendary: 5, mythic: 0.8, exotic: 0.08 }, jackpot: 'mythic' },
  { price: 399, odds: { rare: 52, epic: 35.02, legendary: 11, mythic: 1.8, exotic: 0.18 }, jackpot: 'mythic' },
  { price: 799, odds: { rare: 25, epic: 48.6, legendary: 22, mythic: 4, exotic: 0.4 }, jackpot: 'mythic' },
  { price: 1499, odds: { epic: 56.15, legendary: 35, mythic: 8, exotic: 0.85 }, jackpot: 'mythic' },
  // the top tiers also guarantee an Exotic within `exoticPity` opens
  { price: 2999, odds: { epic: 35, legendary: 45, mythic: 18, exotic: 2 }, jackpot: 'exotic', exoticPity: 60 },
  { price: 5999, odds: { legendary: 60.5, mythic: 35, exotic: 4.5 }, jackpot: 'exotic', exoticPity: 30 },
  { price: 9999, odds: { legendary: 37, mythic: 55, exotic: 8 }, jackpot: 'exotic', exoticPity: 16 },
];
const BAG_IDS = ['street', 'vault', 'golden', 'elite', 'diamond', 'obsidian', 'royal', 'apex', 'genesis'];
const BAG_NAMES = ['Street Bag', 'Vault Bag', 'Golden Bag', 'Elite Bag', 'Diamond Bag', 'Obsidian Bag', 'Royal Bag', 'Apex Bag', 'Genesis Bag'];
const CRATE_IDS = ['w-scrap', 'w-armory', 'w-brass', 'w-specops', 'w-diamond', 'w-obsidian', 'w-royal', 'w-apex', 'w-genesis'];
const CRATE_NAMES = ['Scrap Crate', 'Armory Crate', 'Brass Crate', 'Spec Ops Crate', 'Diamond Crate', 'Obsidian Crate', 'Royal Crate', 'Apex Crate', 'Genesis Crate'];
export const BOXES = [
  ...TIERS.map((t, i) => ({ id: BAG_IDS[i], family: 'outfit', tier: i + 1, name: BAG_NAMES[i], ...t })),
  ...TIERS.map((t, i) => ({ id: CRATE_IDS[i], family: 'weapon', tier: i + 1, name: CRATE_NAMES[i], ...t })),
];
export const BOX = Object.fromEntries(BOXES.map((b) => [b.id, b]));
export const PITY = { epic: 15, legendary: 60 }; // guaranteed at or better, by the Nth open of a box
export const MAX_OPEN = 100; // boxes per purchase
// how often an Exotic from this tier is one of the limited editions (while any are left)
const limitedShare = (tier) => (tier >= 9 ? 0.35 : tier >= 7 ? 0.2 : tier >= 5 ? 0.08 : 0.02);

// Bulk: every 10th box you pay for is free (10 for the price of 9, 100 for 90).
export const BULK_FREE_EVERY = 10;
export const boxCost = (box, n) => (n - Math.floor(n / BULK_FREE_EVERY)) * box.price;

export const usd = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const TRIAL_MS = 72 * 3600 * 1000;
export const START_BOXES = { street: 1, 'w-scrap': 1 }; // a welcome bag and crate for every new runner

// Shop $ packs: paid in USDC/USDT, credited as shop $ with a bonus on the bigger ones.
export const PACKS = [
  { id: 'p5', price: 500, bonus: 0 },
  { id: 'p10', price: 1000, bonus: 50 },
  { id: 'p25', price: 2500, bonus: 250 },
  { id: 'p50', price: 5000, bonus: 750 },
  { id: 'p100', price: 10000, bonus: 2000 },
  { id: 'p500', price: 50000, bonus: 12500 },
  { id: 'p1000', price: 100000, bonus: 30000 },
];
export const PACK = Object.fromEntries(PACKS.map((p) => [p.id, p]));

// The rarity of the 72h trial outfit one rank-up pays (the only rank-up reward).
export function rankReward(rank, rnd) {
  const tr = rnd() + Math.min(0.1, rank / 900); // a little better as you climb
  const rarity = tr < 0.55 ? 'rare' : tr < 0.85 ? 'epic' : tr < 0.97 ? 'legendary' : 'mythic';
  return { rarity };
}

// ------------------------------------------------------------------ rolls

export function rollRarity(box, pity, rnd) {
  const fromPity =
    box.exoticPity && (pity?.sinceExotic ?? 0) + 1 >= box.exoticPity ? 'exotic'
    : (pity?.sinceLegendary ?? 0) + 1 >= PITY.legendary ? 'legendary'
    : (pity?.sinceEpic ?? 0) + 1 >= PITY.epic ? 'epic'
    : null;
  let r = rnd() * 100;
  let rolled = null;
  let last = null;
  for (const k of RARITY_ORDER) {
    const p = box.odds[k] ?? 0;
    if (p <= 0) continue;
    last = k;
    if (r < p) {
      rolled = k;
      break;
    }
    r -= p;
  }
  rolled ??= last; // floating-point remainder lands on the last rarity with odds
  if (fromPity && rank(rolled) < rank(fromPity)) return { rarity: fromPity, pity: true };
  return { rarity: rolled, pity: false };
}

// Pick an item of that rarity from a catalog, preferring ones the player is missing.
// Limited editions that are sold out never drop; the rest drop at the tier's share.
export function pickItem(catalog, rarity, owned, rnd, { tier = 1, minted = {} } = {}) {
  for (let ri = rank(rarity); ri >= 0; ri--) {
    const pool = catalog.filter((o) => o.rarity === RARITY_ORDER[ri] && !o.basic && !(o.limited && (minted[o.id] ?? 0) >= o.limited));
    if (!pool.length) continue;
    const limited = pool.filter((o) => o.limited);
    const open = pool.filter((o) => !o.limited);
    const fromLimited = limited.length && (!open.length || rnd() < limitedShare(tier));
    const from = fromLimited ? limited : open;
    const fresh = from.filter((o) => !owned.has(o.id));
    const list = fresh.length ? fresh : from;
    return list[Math.floor(rnd() * list.length)];
  }
  return null;
}
export const pickOutfit = (rarity, owned, rnd, opts) => pickItem(OUTFITS, rarity, owned, rnd, opts);

// believable looks for bots: mostly basic and common, now and then something shiny
export function botLook(rnd) {
  const r = rnd();
  const rarity = r < 0.55 ? null : r < 0.8 ? 'common' : r < 0.93 ? 'rare' : r < 0.985 ? 'epic' : 'legendary';
  const o = rarity ? pickItem(OUTFITS.filter((x) => !x.limited), rarity, new Set(), rnd) : OUTFITS[Math.floor(rnd() * BASIC.length)];
  const look = { outfit: o.id, body: rnd() < 0.5 ? 'm' : 'f' };
  if (rnd() < 0.35) {
    const f = FINISHES.filter((x) => rank(x.rarity) <= 2);
    look.ws = { [WEAPONS[Math.floor(rnd() * WEAPONS.length)].id]: f[Math.floor(rnd() * f.length)].id };
  }
  return look;
}

// ------------------------------------------------------------- inventory

// Saves from before scrap was retired: turn leftover scrap into shop $ at its old
// crafting value (100 scrap crafted a $0.49 common), so nobody loses what they had.
function migrate(r) {
  if (r.scrap > 0) r.credit = (r.credit ?? 0) + Math.round(r.scrap / 2);
  delete r.scrap;
  r.wowned ??= [];
  r.wequip ??= {};
  r.serials ??= {};
  return r;
}

function fresh() {
  return { credit: 0, owned: [], wowned: [], wequip: {}, serials: {}, trials: {}, boxes: { ...START_BOXES }, outfit: DEFAULT_OUTFIT, body: 'm', pity: {}, opened: 0, spent: 0 };
}

/**
 * Per-player inventory (same keys as balances and ranks). Every method returns
 * { ok: true, ... } or { ok: false, error } and never throws on player input.
 */
export class Inventory {
  constructor({ data = {}, onChange = null, rnd = Math.random, now = () => Date.now() } = {}) {
    this.data = new Map(Object.entries(data).map(([k, v]) => [k, migrate({ ...fresh(), ...v })]));
    this.onChange = onChange;
    this.rnd = rnd;
    this.now = now;
    // limited editions minted so far, across every player
    this.minted = {};
    for (const r of this.data.values()) for (const id of [...r.owned, ...r.wowned]) if ((OUTFIT[id] ?? WSKIN[id])?.limited) this.minted[id] = (this.minted[id] ?? 0) + 1;
  }

  rec(key) {
    if (!this.data.has(key)) this.data.set(key, fresh());
    return this.data.get(key);
  }

  owns(key, id) {
    const o = OUTFIT[id];
    const r = this.rec(key);
    return !!o && (o.basic || r.owned.includes(id) || (r.trials[id] ?? 0) > this.now());
  }

  // Pay `cents`: shop $ first, the rest through `external(cents)` (USDC/USDT), all or nothing.
  charge(key, cents, external) {
    const r = this.rec(key);
    const fromCredit = Math.min(r.credit, cents);
    const rest = cents - fromCredit;
    if (rest > 0 && !(external && external(rest))) return false;
    r.credit -= fromCredit;
    r.spent += cents;
    return { fromCredit, external: rest };
  }

  // supply left of every limited edition
  supply() {
    const out = {};
    for (const o of [...OUTFITS, ...WEAPON_SKINS]) if (o.limited) out[o.id] = { of: o.limited, minted: this.minted[o.id] ?? 0 };
    return out;
  }

  // what the client needs to render the locker
  view(key) {
    const r = this.rec(key);
    const now = this.now();
    for (const [id, until] of Object.entries(r.trials)) if (until <= now) delete r.trials[id];
    return {
      credit: r.credit,
      owned: r.owned,
      wowned: r.wowned,
      wequip: r.wequip,
      serials: r.serials,
      trials: r.trials,
      boxes: r.boxes,
      outfit: r.outfit,
      body: r.body,
      opened: r.opened,
      supply: this.supply(),
      pity: Object.fromEntries(BOXES.map((b) => [b.id, { sinceEpic: r.pity[b.id]?.sinceEpic ?? 0, sinceLegendary: r.pity[b.id]?.sinceLegendary ?? 0, sinceExotic: r.pity[b.id]?.sinceExotic ?? 0 }])),
    };
  }

  // what others see in a raid
  look(key) {
    const r = this.rec(key);
    const ws = {};
    for (const [w, f] of Object.entries(r.wequip)) if (r.wowned.includes(`${w}.${f}`)) ws[w] = f;
    return { outfit: this.owns(key, r.outfit) ? r.outfit : DEFAULT_OUTFIT, body: BODIES.includes(r.body) ? r.body : 'm', ws };
  }

  changed() {
    this.onChange?.(this);
  }

  // Top up shop $ from USDC/USDT with a pack. Shop $ never goes back out.
  topUp(key, packId, external) {
    const p = PACK[packId];
    if (!p) return { ok: false, error: 'Unknown pack.' };
    if (!(external && external(p.price))) return { ok: false, error: `Not enough USDC or USDT (${usd(p.price)} needed).` };
    const r = this.rec(key);
    r.credit += p.price + p.bonus;
    r.bought = (r.bought ?? 0) + p.price;
    this.changed();
    return { ok: true, pack: p.id, added: p.price + p.bonus };
  }

  // rank-ups: one 72h trial outfit per rank gained, nothing else
  rankUp(key, fromRank, toRank) {
    const r = this.rec(key);
    const out = [];
    for (let rank = fromRank + 1; rank <= toRank; rank++) {
      const w = rankReward(rank, this.rnd);
      // prefer outfits you neither own nor are already trying; never exotics
      const unowned = OUTFITS.filter((o) => !o.basic && !r.owned.includes(o.id) && o.rarity !== 'exotic');
      const untried = unowned.filter((o) => !((r.trials[o.id] ?? 0) > this.now()));
      const all = untried.length ? untried : unowned;
      const pool = all.filter((o) => o.rarity === w.rarity);
      const from = pool.length ? pool : all;
      let trial = null;
      if (from.length) {
        const o = from[Math.floor(this.rnd() * from.length)];
        r.trials[o.id] = Math.max(r.trials[o.id] ?? 0, this.now()) + TRIAL_MS;
        trial = { id: o.id, until: r.trials[o.id] };
      }
      out.push({ rank, trial });
    }
    if (out.length) this.changed();
    return out;
  }

  equip(key, id) {
    if (!this.owns(key, id)) return { ok: false, error: 'You do not own that outfit.' };
    this.rec(key).outfit = id;
    this.changed();
    return { ok: true };
  }

  // wear a weapon skin ("knife.gold"), or "knife.default" for the plain one
  equipWeapon(key, id) {
    const [w, f] = String(id).split('.');
    if (!WEAPONS.some((x) => x.id === w)) return { ok: false, error: 'Unknown weapon.' };
    const r = this.rec(key);
    if (f === 'default') delete r.wequip[w];
    else if (!r.wowned.includes(id)) return { ok: false, error: 'You do not own that skin.' };
    else r.wequip[w] = f;
    this.changed();
    return { ok: true };
  }

  setBody(key, body) {
    if (!BODIES.includes(body)) return { ok: false, error: 'Unknown character.' };
    this.rec(key).body = body;
    this.changed();
    return { ok: true };
  }

  // Open `count` boxes: the ones you hold go first (free), the rest are bought in one charge.
  open(key, boxId, external, count = 1) {
    const box = BOX[boxId];
    const r = this.rec(key);
    if (!box) return { ok: false, error: 'Unknown box.' };
    count = Math.max(1, Math.min(MAX_OPEN, Math.floor(Number(count) || 1)));
    const held = r.boxes[boxId] ?? 0;
    const free = Math.min(held, count);
    const paid = count - free;
    if (paid > 0 && !this.charge(key, boxCost(box, paid), external)) return { ok: false, error: `Not enough $ (${usd(boxCost(box, paid))} needed).` };
    r.boxes[boxId] = held - free;
    const results = [];
    for (let i = 0; i < count; i++) results.push({ ...this.roll(r, box), free: i < free });
    this.changed();
    return { ...results[0], ok: true, box: boxId, count, held: free, bought: paid, results };
  }

  roll(r, box) {
    const p = (r.pity[box.id] ??= { sinceEpic: 0, sinceLegendary: 0 });
    p.sinceExotic ??= 0;
    const roll = rollRarity(box, p, this.rnd);
    const weapon = box.family === 'weapon';
    const mine = weapon ? r.wowned : r.owned;
    const item = pickItem(weapon ? WEAPON_SKINS : OUTFITS, roll.rarity, new Set(mine), this.rnd, { tier: box.tier, minted: this.minted });
    const dup = mine.includes(item.id);
    let refund = 0;
    let serial = null;
    if (dup) {
      refund = RARITIES[item.rarity].refund;
      r.credit += refund;
    } else {
      mine.push(item.id);
      if (!weapon) delete r.trials[item.id];
      if (item.limited) {
        serial = this.minted[item.id] = (this.minted[item.id] ?? 0) + 1;
        r.serials[item.id] = serial;
      }
    }
    p.sinceEpic = rank(item.rarity) >= rank('epic') ? 0 : p.sinceEpic + 1;
    p.sinceLegendary = rank(item.rarity) >= rank('legendary') ? 0 : p.sinceLegendary + 1;
    p.sinceExotic = rank(item.rarity) >= rank('exotic') ? 0 : p.sinceExotic + 1;
    r.opened++;
    return { kind: box.family, item: item.id, rarity: item.rarity, dup, refund, serial, pity: roll.pity, jackpot: rank(item.rarity) >= rank(box.jackpot) };
  }

  toJSON() {
    return Object.fromEntries(this.data);
  }
}
