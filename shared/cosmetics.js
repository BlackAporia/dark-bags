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
import { STYLE, STYLE_ITEMS, STYLE_CASES, STYLE_KINDS, pickStyle } from './style.js';
import { featured, storeDay, CARD, STARTER, tierCost } from './store.js';
import { vipOf, VIP_LEVELS } from './vip.js';
import { SEASON_OUTFITS, SEASON_FINISHES, SEASON_TURRETS, TURRET_SKIN, seasonAt, seasonItems } from './season.js';
import { DESCENT_OUTFITS, DESCENT_FINISHES, DESCENT_GUNS } from './descent-items.js';
export { SEASON_OUTFITS, SEASON_FINISHES, SEASON_TURRETS, TURRET_SKIN, seasonAt, seasonItems };

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
  // collection outfits (themed bags)
  { id: 'courier', name: 'Night Courier', rarity: 'common', color: '#64748b', accent: '#f59e0b', head: 'cap' },
  { id: 'skater', name: 'Skater', rarity: 'common', color: '#a3e635', accent: '#1f2937', head: 'beanie' },
  { id: 'oni-mask', name: 'Oni Mask', rarity: 'rare', color: '#b91c1c', accent: '#111111', head: 'mask' },
  { id: 'ice-cadet', name: 'Ice Cadet', rarity: 'rare', color: '#dbeafe', accent: '#3b82f6', head: 'helmet' },
  { id: 'luchador', name: 'Luchador', rarity: 'rare', color: '#7c3aed', accent: '#facc15', head: 'mask' },
  { id: 'cyber-oni', name: 'Cyber Oni', rarity: 'epic', color: '#ef4444', accent: '#22d3ee', head: 'kabuto', fx: 'pulse' },
  { id: 'yeti', name: 'Yeti', rarity: 'epic', color: '#f1f5f9', accent: '#93c5fd', head: 'hood', fx2: 'frost' },
  { id: 'disco', name: 'Disco Fever', rarity: 'epic', color: '#f472b6', accent: '#fde047', head: 'party', fx: 'glow', fx2: 'sparks' },
  { id: 'storm-chaser', name: 'Storm Chaser', rarity: 'legendary', color: '#38bdf8', accent: '#0c4a6e', head: 'visor', fx: 'glow', fx2: 'lightning' },
  { id: 'jade-emperor', name: 'Jade Emperor', rarity: 'legendary', color: '#10b981', accent: '#fde68a', head: 'crown', fx: 'gold', cape: '#065f46' },
  { id: 'kraken-lord', name: 'Kraken Lord', rarity: 'mythic', color: '#0e7490', accent: '#22d3ee', head: 'horns', fx: 'pulse', fx2: 'shadow', cape: '#082f49' },
  { id: 'toon-overlord', name: 'Toon Overlord', rarity: 'exotic', color: '#facc15', accent: '#f472b6', head: 'crown', fx: 'rainbow', fx2: 'sparks', cape: '#7c3aed' },
];

// seasonal armour is not in OUTFITS (no box or trial ever drops it); it is still an outfit
// the Descent's armours: only its milestones hand them out (shared/descent.js)
export { DESCENT_OUTFITS, DESCENT_FINISHES };
export const OUTFIT = Object.fromEntries([...OUTFITS, ...SEASON_OUTFITS, ...DESCENT_OUTFITS].map((o) => [o.id, o]));
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
  // collection finishes (themed cases); new patterns: dots, wave, fade, stripe
  { id: 'graphite', name: 'Graphite', rarity: 'common', color: '#3f3f46' },
  { id: 'copper', name: 'Copper', rarity: 'common', color: '#b87333' },
  { id: 'wasteland', name: 'Wasteland', rarity: 'common', color: '#78716c', accent: '#a3e635', pattern: 'camo' },
  { id: 'navy', name: 'Navy', rarity: 'common', color: '#1e3a8a' },
  { id: 'sakura', name: 'Sakura', rarity: 'rare', color: '#ffb7c5', accent: '#ff5d8f', pattern: 'dots' },
  { id: 'circuit', name: 'Circuit', rarity: 'rare', color: '#0f172a', accent: '#22d3ee', pattern: 'digital' },
  { id: 'frostbite', name: 'Frostbite', rarity: 'rare', color: '#dbeafe', accent: '#3b82f6', pattern: 'wave' },
  { id: 'candy', name: 'Candy Cane', rarity: 'rare', color: '#fdf2f8', accent: '#f43f5e', pattern: 'stripe' },
  { id: 'oni', name: 'Oni', rarity: 'epic', color: '#b91c1c', accent: '#111111', pattern: 'tiger' },
  { id: 'synthwave', name: 'Synthwave', rarity: 'epic', color: '#ff2dd4', accent: '#7c3aed', pattern: 'fade', fx: 'glow' },
  { id: 'lava', name: 'Lava Flow', rarity: 'epic', color: '#7c2d12', accent: '#f97316', pattern: 'wave', fx: 'glow' },
  { id: 'black-ice', name: 'Black Ice', rarity: 'epic', color: '#1e293b', accent: '#bae6fd', pattern: 'wave' },
  { id: 'bubblegum', name: 'Bubblegum', rarity: 'epic', color: '#f9a8d4', accent: '#a5f3fc', pattern: 'dots', fx: 'glow' },
  { id: 'graffiti', name: 'Graffiti', rarity: 'epic', color: '#22c55e', accent: '#f43f5e', pattern: 'stripe' },
  { id: 'jade', name: 'Jade', rarity: 'legendary', color: '#10b981', accent: '#d1fae5', fx: 'shimmer' },
  { id: 'hologram', name: 'Hologram', rarity: 'legendary', color: '#a5f3fc', accent: '#f0abfc', pattern: 'fade', fx: 'shimmer' },
  { id: 'hash-power', name: 'Hash Power', rarity: 'legendary', color: '#f7931a', accent: '#111111', pattern: 'digital', fx: 'shimmer' },
  { id: 'biohazard', name: 'Biohazard', rarity: 'legendary', color: '#a3e635', accent: '#000000', pattern: 'stripe', fx: 'glow' },
  { id: 'dragon', name: 'Dragon Scale', rarity: 'mythic', color: '#dc2626', accent: '#fbbf24', pattern: 'dots', fx: 'fire' },
  { id: 'aurora', name: 'Aurora', rarity: 'mythic', color: '#34d399', accent: '#818cf8', pattern: 'fade', fx: 'galaxy' },
  { id: 'moonshot', name: 'Moonshot', rarity: 'mythic', color: '#e5e7eb', accent: '#6366f1', fx: 'galaxy' },
  { id: 'abyss', name: 'Abyss', rarity: 'mythic', color: '#020617', accent: '#0ea5e9', fx: 'plasma' },
  { id: 'supernova', name: 'Supernova', rarity: 'exotic', color: '#fff7ae', accent: '#f97316', fx: 'rainbow' },
  { id: 'dragonlord', name: 'Dragonlord', rarity: 'exotic', limited: 77, color: '#dc2626', accent: '#fbbf24', pattern: 'dots', fx: 'fire' },
];
export const FINISH = Object.fromEntries([...FINISHES, ...SEASON_FINISHES, ...DESCENT_FINISHES].map((f) => [f.id, f]));

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
  autoshotgun: 'Auto Shotgun', pdw: 'PDW', carbine: 'Carbine', scout: 'Scout', lmg: 'Machine Gun', minigun: 'Minigun', magnum: 'Magnum Sniper',
};
// models per weapon, by rarity (common → exotic); finishes of one rarity cycle through the list
const MODELS = {
  knife: [['knife', 'dagger'], ['machete', 'tanto', 'cleaver'], ['axe', 'cleaver', 'machete'], ['katana', 'axe'], ['dual', 'scythe', 'katana'], ['esword', 'hammer', 'scythe']],
  pistol: [['pistol'], ['pistol', 'revolver'], ['revolver', 'deagle'], ['deagle', 'revolver'], ['blaster', 'deagle'], ['blaster']],
  shotgun: [['shotgun'], ['shotgun', 'double'], ['double', 'drum'], ['drum', 'double'], ['drum'], ['double', 'drum']],
  smg: [['smg'], ['smg', 'uzi'], ['uzi', 'vector'], ['vector'], ['vector', 'uzi'], ['vector']],
  rifle: [['rifle'], ['rifle', 'ak'], ['ak', 'bullpup'], ['bullpup', 'ak'], ['plasma', 'bullpup'], ['plasma']],
  sniper: [['sniper'], ['sniper', 'bolt'], ['bolt'], ['bolt', 'rail'], ['rail'], ['rail']],
  deagle: [['deagle'], ['deagle', 'revolver'], ['revolver', 'deagle'], ['deagle'], ['blaster', 'deagle'], ['blaster']],
  autoshotgun: [['autoshotgun'], ['autoshotgun', 'drum'], ['drum', 'autoshotgun'], ['drum', 'double'], ['drum'], ['drum']],
  pdw: [['pdw'], ['pdw', 'vector'], ['vector', 'pdw'], ['vector'], ['vector', 'uzi'], ['vector']],
  carbine: [['carbine'], ['carbine', 'bullpup'], ['bullpup', 'ak'], ['bullpup', 'carbine'], ['plasma', 'bullpup'], ['plasma']],
  scout: [['scout'], ['scout', 'bolt'], ['bolt', 'scout'], ['bolt'], ['rail', 'bolt'], ['rail']],
  lmg: [['lmg'], ['lmg'], ['lmg', 'minigun'], ['minigun', 'lmg'], ['minigun'], ['minigun']],
  magnum: [['magnum'], ['magnum', 'bolt'], ['bolt', 'magnum'], ['rail', 'magnum'], ['rail'], ['rail']],
};
// Blades are the one exception to "looks only": a longer blade reaches a little further.
// reach: how far past your body the swing lands (the plain knife: 44); arc: how wide (rad)
export const MELEE = {
  knife: { reach: 44, arc: 1.9 },
  dagger: { reach: 44, arc: 1.9 },
  tanto: { reach: 48, arc: 1.9 },
  cleaver: { reach: 50, arc: 2.0 },
  machete: { reach: 54, arc: 2.0 },
  axe: { reach: 54, arc: 2.0 },
  dual: { reach: 52, arc: 2.4 },
  hammer: { reach: 56, arc: 2.2 },
  katana: { reach: 62, arc: 2.0 },
  esword: { reach: 64, arc: 2.0 },
  scythe: { reach: 66, arc: 2.4 },
};
export const meleeOf = (finishId) => MELEE[modelFor('knife', finishId)] ?? MELEE.knife;

export function modelFor(weapon, finishId) {
  const f = FINISH[finishId];
  const list = MODELS[weapon];
  if (!f || !list) return weapon;
  const ri = RARITY_ORDER.indexOf(f.rarity);
  const same = FINISHES.filter((x) => x.rarity === f.rarity);
  const opts = list[ri] ?? [weapon];
  return opts[Math.max(0, same.indexOf(f)) % opts.length]; // seasonal finishes take the first
}
export const WEAPON_SKINS = WEAPONS.flatMap((w) =>
  FINISHES.map((f) => {
    const model = modelFor(w.id, f.id);
    return { id: `${w.id}.${f.id}`, weapon: w.id, finish: f.id, model, name: `${f.name} ${MODEL_NAMES[model]}`, rarity: f.rarity, ...(f.limited ? { limited: f.limited } : {}) };
  }),
);
// seasonal weapon skins: a season's two finishes on the three guns it names
export const SEASON_WSKINS = SEASON_FINISHES.flatMap((f) =>
  f.weapons.map((w) => {
    const model = modelFor(w, f.id);
    return { id: `${w}.${f.id}`, weapon: w, finish: f.id, model, name: `${f.name} ${MODEL_NAMES[model]}`, rarity: f.rarity, season: f.season };
  }),
);
// the Descent's finishes, on its six guns
export const DESCENT_WSKINS = DESCENT_FINISHES.flatMap((f) =>
  DESCENT_GUNS.map((w) => {
    const model = modelFor(w, f.id);
    return { id: `${w}.${f.id}`, weapon: w, finish: f.id, model, name: `${f.name} ${MODEL_NAMES[model]}`, rarity: f.rarity, descent: f.descent };
  }),
);
export const WSKIN = Object.fromEntries([...WEAPON_SKINS, ...SEASON_WSKINS, ...DESCENT_WSKINS].map((s) => [s.id, s]));

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
// Collection cases: a themed set (or one class of guns) instead of the whole catalog, each
// with its own look. One price and one odds table for all of them; the knife case is the
// premium one. art: the case's colours and emblem.
const CASE_ODDS = { common: 38, rare: 36, epic: 18, legendary: 6.3, mythic: 1.45, exotic: 0.25 };
const KNIFE_ODDS = { rare: 45, epic: 35, legendary: 15, mythic: 4.2, exotic: 0.8 };
const ALL_FIN = null; // every finish
const COLLECTIONS = [
  // weapon cases: themes (every gun, the theme's finishes)
  { id: 'c-samurai', family: 'weapon', name: 'Cyber Samurai Case', finishes: ['urban', 'navy', 'sakura', 'oni', 'jade', 'dragon', 'supernova'], art: { c1: '#ff5d8f', c2: '#1a0610', icon: '刀' } },
  { id: 'c-neon', family: 'weapon', name: 'Neon Nights Case', finishes: ['graphite', 'circuit', 'cobalt', 'neon', 'synthwave', 'hologram', 'plasma', 'prism'], art: { c1: '#ff2dd4', c2: '#0b0420', icon: '◆' } },
  { id: 'c-arctic', family: 'weapon', name: 'Arctic Ops Case', finishes: ['arctic', 'frostbite', 'black-ice', 'ice', 'aurora', 'prism'], art: { c1: '#bae6fd', c2: '#0b1726', icon: '❄' } },
  { id: 'c-inferno', family: 'weapon', name: 'Inferno Case', finishes: ['crimson', 'copper', 'tiger', 'lava', 'blood', 'inferno', 'dragon', 'dragonlord'], art: { c1: '#f97316', c2: '#1c0702', icon: '♨' } },
  { id: 'c-crypto', family: 'weapon', name: 'Crypto Kings Case', finishes: ['sand', 'carbon', 'digital', 'hazard', 'hash-power', 'gold', 'moonshot', 'genesis'], art: { c1: '#f7931a', c2: '#140c02', icon: '₿' } },
  { id: 'c-toxic', family: 'weapon', name: 'Toxic Wasteland Case', finishes: ['wasteland', 'field', 'woodland', 'toxic', 'graffiti', 'biohazard', 'abyss', 'void'], art: { c1: '#a3e635', c2: '#0a1402', icon: '☣' } },
  { id: 'c-toon', family: 'weapon', name: 'Toon Town Case', finishes: ['sand', 'candy', 'bubblegum', 'neon', 'chrome', 'diamond', 'supernova'], art: { c1: '#f9a8d4', c2: '#1d0a1a', icon: '★' } },
  // weapon cases: one class of guns, every finish
  { id: 'c-knife', family: 'weapon', name: 'Knife Case', weapons: ['knife'], odds: KNIFE_ODDS, price: 699, jackpot: 'exotic', art: { c1: '#e5e7eb', c2: '#0a0a0a', icon: '⚔' } },
  { id: 'c-pistol', family: 'weapon', name: 'Pistol Case', weapons: ['pistol', 'deagle'], art: { c1: '#94a3b8', c2: '#0b0f16', icon: '◎' } },
  { id: 'c-smg', family: 'weapon', name: 'SMG Case', weapons: ['smg', 'pdw'], art: { c1: '#38bdf8', c2: '#06121c', icon: '≋' } },
  { id: 'c-rifle', family: 'weapon', name: 'Rifle Case', weapons: ['rifle', 'carbine'], art: { c1: '#84cc16', c2: '#0b1204', icon: '✦' } },
  { id: 'c-heavy', family: 'weapon', name: 'Heavy Case', weapons: ['shotgun', 'autoshotgun', 'lmg'], art: { c1: '#f59e0b', c2: '#160d02', icon: '▣' } },
  { id: 'c-sniper', family: 'weapon', name: 'Sniper Case', weapons: ['scout', 'magnum', 'sniper'], art: { c1: '#ef4444', c2: '#160404', icon: '⌖' } },
  // outfit bags: themes
  { id: 'b-crypto', family: 'outfit', name: 'Crypto Memes Bag', outfits: ['paper-hands', 'gm', 'stacker', 'hodler', 'degen', 'rug-pull', 'airdrop', 'much-wow', 'validator', 'bear-market', 'satoshi', 'diamond-hands', 'bull-run', 'whale', 'money-printer', 'stark-pioneer', 'golden-bull', 'first-block'], art: { c1: '#f7931a', c2: '#140c02', icon: '₿' } },
  { id: 'b-heroes', family: 'outfit', name: 'Multiverse Heroes Bag', outfits: ['rookie-vest', 'denim', 'sheriff', 'night-ops', 'caped-wonder', 'samurai', 'moon-boy', 'night-vigilante', 'space-ranger', 'storm-chaser', 'thunder-god', 'cosmic-wizard', 'celestial', 'multiverse-prime'], art: { c1: '#3a86ff', c2: '#060b1f', icon: '⚡' } },
  { id: 'b-monsters', family: 'outfit', name: 'Monsters & Myths Bag', outfits: ['rust', 'woodland', 'oni-mask', 'toxic', 'ghost', 'blood-moon', 'pumpkin-king', 'alien', 'yeti', 'skull-rider', 'void', 'inferno', 'shadow-demon', 'kraken-lord', 'phoenix', 'void-emperor'], art: { c1: '#ef4444', c2: '#140204', icon: '☠' } },
  { id: 'b-cyber', family: 'outfit', name: 'Cyber Street Bag', outfits: ['streetwear', 'courier', 'skater', 'neon', 'hazard', 'luchador', 'circuit', 'arcade', 'neon-ninja', 'cyber-oni', 'chrome-android', 'matrix-runner', 'zero-knowledge', 'galaxy-brain', 'neon-samurai', 'genesis-ghost', 'singularity'], art: { c1: '#00f5d4', c2: '#020f14', icon: '◈' } },
  { id: 'b-toon', family: 'outfit', name: 'Toon Friends Bag', outfits: ['slate', 'olive', 'toon-cat', 'bunny-bandit', 'shiba-scout', 'mad-scientist', 'ice-cadet', 'frog-prince', 'disco', 'much-wow', 'gold-bag', 'jade-emperor', 'genesis', 'money-printer', 'toon-overlord'], art: { c1: '#f9a8d4', c2: '#1d0a1a', icon: '✿' } },
];
export const BOXES = [
  ...TIERS.map((t, i) => ({ id: BAG_IDS[i], family: 'outfit', tier: i + 1, group: 'tier', name: BAG_NAMES[i], ...t })),
  ...TIERS.map((t, i) => ({ id: CRATE_IDS[i], family: 'weapon', tier: i + 1, group: 'tier', name: CRATE_NAMES[i], ...t })),
  ...COLLECTIONS.map((c) => ({ price: 249, odds: CASE_ODDS, jackpot: 'mythic', tier: 4, group: c.weapons ? 'class' : 'theme', ...c })),
  // style cases: frames, banners, kill effects, name effects
  ...STYLE_CASES.map((c, i) => ({ family: 'style', group: 'style', tier: [2, 4, 7][i], ...c })),
];
export const BOX = Object.fromEntries(BOXES.map((b) => [b.id, b]));
// what a box can drop: the whole family, or its collection
export function boxCatalog(box) {
  if (box.family === 'style') return STYLE_ITEMS.filter((x) => !x.excl);
  if (box.family === 'outfit') return box.outfits ? box.outfits.map((id) => OUTFIT[id]).filter(Boolean) : OUTFITS;
  if (!box.finishes && !box.weapons) return WEAPON_SKINS;
  return WEAPON_SKINS.filter((s) => (!box.finishes || box.finishes.includes(s.finish)) && (!box.weapons || box.weapons.includes(s.weapon)));
}
export const PITY = { epic: 15, legendary: 60 }; // guaranteed at or better, by the Nth open of a box
export const MAX_OPEN = 100; // boxes per purchase
// how often an Exotic from this tier is one of the limited editions (while any are left)
const limitedShare = (tier) => (tier >= 9 ? 0.35 : tier >= 7 ? 0.2 : tier >= 5 ? 0.08 : 0.02);

// Bulk: every 10th box you pay for is free (10 for the price of 9, 100 for 90).
export const BULK_FREE_EVERY = 10;
export const boxCost = (box, n) => (n - Math.floor(n / BULK_FREE_EVERY)) * box.price;

export const usd = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const TRIAL_MS = 3600 * 1000; // trial skins last an hour: long enough to enjoy, short enough to want the real one

// ------------------------------------------------------------ battle pass
export const PASS_TIERS = 50;
export const PASS_STEP = 600; // rank XP per tier: a month of regular play fills it
export const PASS_PRICE = 999; // the premium track, $9.99 in shop $
export const passTier = (xp) => Math.min(PASS_TIERS, Math.floor(xp / PASS_STEP));
// The tiers of a season's pass. Free: a reward every few tiers, one seasonal weapon skin
// and the season's first armour set at the end. Premium: something every tier, all of the
// season's items (both turret skins, five weapon skins, the Warlord and the Apex armour).
const passCache = new Map();
export function passRewards(sid) {
  if (passCache.has(sid)) return passCache.get(sid);
  const s = seasonItems(sid);
  const f = {
    3: { k: 'credit', v: 10 }, 5: { k: 'box', id: 'street' }, 8: { k: 'box', id: 'w-scrap' }, 10: { k: 'credit', v: 25 },
    15: { k: 'box', id: 'c-pistol' }, 20: { k: 'credit', v: 25 }, 25: { k: 'wskin', id: `rifle.${s.edge}` }, 30: { k: 'box', id: 'b-crypto' },
    35: { k: 'credit', v: 50 }, 40: { k: 'box', id: 'c-heavy' }, 45: { k: 'credit', v: 50 }, 50: { k: 'outfit', id: s.vanguard },
  };
  const special = {
    1: { k: 'wskin', id: `knife.${s.edge}` }, 5: { k: 'turret', id: s.sentry }, 10: { k: 'wskin', id: `deagle.${s.edge}` },
    15: { k: 'box', id: 'c-knife' }, 20: { k: 'wskin', id: `carbine.${s.relic}` }, 25: { k: 'outfit', id: s.warlord },
    30: { k: 'turret', id: s.overwatch }, 35: { k: 'wskin', id: `magnum.${s.relic}` }, 40: { k: 'box', id: 'c-knife' },
    45: { k: 'wskin', id: `knife.${s.relic}` }, 50: { k: 'outfit', id: s.apex },
  };
  // style on the pass: Epic on the free track, Legendary and Mythic on the premium one
  Object.assign(f, { 12: { k: 'style', id: 'k-ghost' }, 22: { k: 'style', id: 'b-aurora' }, 42: { k: 'style', id: 'n-neon' } });
  Object.assign(special, {
    7: { k: 'style', id: 'f-gold' }, 13: { k: 'style', id: 'n-rainbow' }, 18: { k: 'style', id: 'k-lightning' }, 22: { k: 'style', id: 'b-galaxy' },
    27: { k: 'style', id: 'f-inferno' }, 33: { k: 'style', id: 'k-firework' }, 38: { k: 'style', id: 'n-glitch' }, 42: { k: 'style', id: 'b-bull' }, 48: { k: 'style', id: 'f-void' },
  });
  const cases = ['c-samurai', 'c-neon', 'c-arctic', 'c-inferno', 'c-crypto', 'c-toxic', 'c-toon', 'b-cyber', 'b-heroes', 'b-monsters', 's-neon'];
  const p = {};
  for (let t = 1; t <= PASS_TIERS; t++) p[t] = special[t] ?? (t % 2 ? { k: 'credit', v: 15 } : { k: 'box', id: cases[(t / 2) % cases.length] });
  const out = { f, p };
  passCache.set(sid, out);
  return out;
}
export const START_BOXES = { street: 1, 'w-scrap': 1 }; // a welcome bag and crate for every new runner (gifts)
// Free rewards (the calendar, tasks, achievements, invites, the welcome boxes) come as gift boxes
// that roll no higher than Epic. Legendary and better: bought boxes, ranked play and the battle pass.
export const GIFT_CAP = 'epic';

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
// First top-up doubles: extra shop $ equal to the price, up to $25 (the step from a free
// player to a paying one is the one that matters most; capped so the bigger packs' own bonus
// still counts for the second top-up and after)
export const FIRST_TOPUP_MAX = 2500;
export const firstBonus = (price) => Math.min(price, FIRST_TOPUP_MAX);

// The rarity of the 1-hour trial outfit one rank-up pays (the only rank-up reward).
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
// Bots wear plain outfits only: colours and headgear, but no auras, glows, capes or animated
// effects, no name or kill effects, no weapon finishes with effects. Every effect is drawing
// work in every player's frame, and a table of bots in sparkly skins cost real players fps.
const PLAIN = (x) => !x.limited && !x.fx && !x.fx2 && !x.cape && !x.armor;
export function botLook(rnd) {
  const r = rnd();
  const rarity = r < 0.55 ? null : r < 0.8 ? 'common' : r < 0.93 ? 'rare' : 'epic';
  const o = rarity ? pickItem(OUTFITS.filter(PLAIN), rarity, new Set(), rnd) : OUTFITS[Math.floor(rnd() * BASIC.length)];
  const look = { outfit: PLAIN(o) ? o.id : OUTFITS[0].id, body: rnd() < 0.5 ? 'm' : 'f' };
  if (rnd() < 0.35) {
    const f = FINISHES.filter((x) => rank(x.rarity) <= 2 && !x.fx);
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
  r.towned ??= [];
  r.tequip ??= null;
  r.wtrials ??= {};
  r.spins ??= 0;
  return r;
}

function fresh() {
  return { credit: 0, owned: [], wowned: [], wequip: {}, towned: [], tequip: null, serials: {}, trials: {}, wtrials: {}, spins: 0, boxes: {}, gboxes: { ...START_BOXES }, outfit: DEFAULT_OUTFIT, body: 'm', pity: {}, opened: 0, spent: 0, sowned: [], sequip: {} };
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

  // a weapon skin you own, or are trying for an hour
  ownsW(key, id) {
    const r = this.rec(key);
    return r.wowned.includes(id) || (r.wtrials[id] ?? 0) > this.now();
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
    r.paid = (r.paid ?? 0) + rest; // real money: counts toward VIP
    this.vipSync(key);
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
    for (const [id, until] of Object.entries(r.wtrials)) if (until <= now) delete r.wtrials[id];
    return {
      credit: r.credit,
      firstTopup: !r.bought, // the first top-up still doubles
      owned: r.owned,
      wowned: r.wowned,
      wequip: r.wequip,
      serials: r.serials,
      trials: r.trials,
      wtrials: r.wtrials,
      spins: r.spins,
      boxes: Object.fromEntries([...new Set([...Object.keys(r.boxes), ...Object.keys(r.gboxes ?? {})])].map((id) => [id, (r.boxes[id] ?? 0) + (r.gboxes?.[id] ?? 0)])),
      gboxes: r.gboxes ?? {},
      outfit: r.outfit,
      body: r.body,
      opened: r.opened,
      supply: this.supply(),
      towned: r.towned,
      tequip: r.tequip,
      sowned: r.sowned ?? [],
      sequip: r.sequip ?? {},
      pass: this.passView(key),
      card: this.cardView(key),
      vip: this.vipView(key),
      store: this.store(key),
      starter: !!r.starter,
      pity: Object.fromEntries(BOXES.map((b) => [b.id, { sinceEpic: r.pity[b.id]?.sinceEpic ?? 0, sinceLegendary: r.pity[b.id]?.sinceLegendary ?? 0, sinceExotic: r.pity[b.id]?.sinceExotic ?? 0 }])),
    };
  }

  // what others see in a raid
  look(key) {
    const r = this.rec(key);
    const ws = {};
    for (const [w, f] of Object.entries(r.wequip)) if (this.ownsW(key, `${w}.${f}`)) ws[w] = f;
    const ts = r.tequip && r.towned.includes(r.tequip) ? r.tequip : null;
    // style: the frame, banner, kill effect and name effect worn (only what is owned)
    const st = {};
    const key2 = { frame: 'fr', banner: 'bn', killfx: 'kf', namefx: 'nf' };
    for (const k of STYLE_KINDS) {
      const id = r.sequip?.[k];
      if (id && STYLE[id]?.kind === k && r.sowned?.includes(id)) st[key2[k]] = id;
    }
    return { outfit: this.owns(key, r.outfit) ? r.outfit : DEFAULT_OUTFIT, body: BODIES.includes(r.body) ? r.body : 'm', ws, ...(ts ? { ts } : {}), ...st };
  }

  // What a player's profile shows of their collection: the best of each kind (rarest first), and
  // how many they own. Trials are not theirs, so they are left out.
  showcase(key, n = 24) {
    const r = this.rec(key);
    const rank = (x) => RARITY_ORDER.indexOf(x?.rarity ?? 'common');
    const best = (ids, cat) => {
      const own = [...new Set(ids ?? [])].filter((id) => cat[id]);
      return { ids: own.sort((a, b) => rank(cat[b]) - rank(cat[a])).slice(0, n), n: own.length };
    };
    return { o: best(r.owned, OUTFIT), w: best(r.wowned, WSKIN), s: best(r.sowned, STYLE), t: best(r.towned, TURRET_SKIN) };
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
    const first = r.bought ? 0 : firstBonus(p.price);
    const vip = Math.floor((p.price * (vipOf(this.vipPoints(key)).cur?.bonus ?? 0)) / 100); // the level before this pack
    r.credit += p.price + p.bonus + first + vip;
    r.bought = (r.bought ?? 0) + p.price;
    this.vipSync(key);
    this.changed();
    return { ok: true, pack: p.id, added: p.price + p.bonus + first + vip, first, vip };
  }

  // rank-ups: one 1-hour trial outfit per rank gained, nothing else
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
    else if (!this.ownsW(key, id)) return { ok: false, error: 'You do not own that skin.' };
    else r.wequip[w] = f;
    this.changed();
    return { ok: true };
  }

  // a turret skin you own (guns + lasers), or null for the plain one
  // wear a frame, banner, kill effect or name effect (id null: take it off)
  equipStyle(key, kind, id) {
    if (!STYLE_KINDS.includes(kind)) return { ok: false, error: 'Unknown style.' };
    const r = this.rec(key);
    r.sequip ??= {};
    if (!id) delete r.sequip[kind];
    else if (STYLE[id]?.kind !== kind || !r.sowned?.includes(id)) return { ok: false, error: 'You do not own that one.' };
    else r.sequip[kind] = id;
    this.changed();
    return { ok: true };
  }

  equipTurret(key, id) {
    const r = this.rec(key);
    if (id && !r.towned.includes(id)) return { ok: false, error: 'You do not own that turret skin.' };
    r.tequip = id || null;
    this.changed();
    return { ok: true };
  }

  // ------------------------------------------------------------ battle pass
  // One pass per season (a calendar month). Every raid's rank XP also fills it; each tier
  // pays on the free track, and on the premium track once the pass is bought. Rewards are
  // claimed from the pass page; a new season starts a new pass.
  passRec(key) {
    const r = this.rec(key);
    const sid = seasonAt(this.now()).id;
    if (r.pass?.sid !== sid) r.pass = { sid, xp: 0, premium: false, f: [], p: [] };
    return r.pass;
  }

  passView(key) {
    const ps = this.passRec(key);
    return { sid: ps.sid, xp: ps.xp, tier: passTier(ps.xp), premium: ps.premium, claimed: { f: ps.f, p: ps.p } };
  }

  passXp(key, xp) {
    const ps = this.passRec(key);
    const before = passTier(ps.xp);
    // the Insider card: +25% pass XP while it lasts
    const boost = (this.rec(key).card?.until ?? 0) > this.now() ? 1 + CARD.passBoost : 1;
    ps.xp = Math.min(PASS_TIERS * PASS_STEP, ps.xp + Math.max(0, Math.floor(xp * boost)));
    this.changed();
    return { before, after: passTier(ps.xp), xp: ps.xp };
  }

  passBuy(key, external) {
    const ps = this.passRec(key);
    if (ps.premium) return { ok: false, error: 'You already have the premium pass.' };
    if (!this.charge(key, PASS_PRICE, external)) return { ok: false, error: `Not enough $ (${usd(PASS_PRICE)} needed).` };
    ps.premium = true;
    this.changed();
    return { ok: true, premium: true };
  }

  // buy pass tiers outright ($0.99 each, ten for $8.99), up to the last tier
  passTiers(key, n, external) {
    const ps = this.passRec(key);
    const left = PASS_TIERS - passTier(ps.xp);
    n = Math.max(1, Math.min(left, Math.floor(Number(n) || 1)));
    if (left <= 0) return { ok: false, error: 'The pass is complete.' };
    const cost = tierCost(n);
    if (!this.charge(key, cost, external)) return { ok: false, error: `Not enough $ (${usd(cost)} needed).` };
    ps.xp = Math.min(PASS_TIERS * PASS_STEP, (passTier(ps.xp) + n) * PASS_STEP);
    this.changed();
    return { ok: true, tiers: n, tier: passTier(ps.xp), cost };
  }

  // ------------------------------------------------------------------ VIP (shared/vip.js)
  vipPoints(key) {
    const r = this.rec(key);
    return (r.bought ?? 0) + (r.paid ?? 0);
  }

  // hand out the frames of every level reached
  vipSync(key) {
    const r = this.rec(key);
    const v = vipOf(this.vipPoints(key));
    r.sowned ??= [];
    for (const l of VIP_LEVELS) if (l.lv <= v.lv && l.frame && !r.sowned.includes(l.frame)) r.sowned.push(l.frame);
  }

  vipView(key) {
    const r = this.rec(key);
    const v = vipOf(this.vipPoints(key));
    return { lv: v.lv, points: v.points, next: v.next?.min ?? null, toNext: v.toNext, daily: v.cur?.daily ?? 0, claimed: r.vipDay === storeDay(this.now()) };
  }

  // the VIP daily gift: free wheel spins by level
  vipClaim(key) {
    const r = this.rec(key);
    const v = this.vipView(key);
    if (!v.daily) return { ok: false, error: 'Your VIP level has no daily gift yet.' };
    if (v.claimed) return { ok: false, error: 'Already claimed today.' };
    r.vipDay = storeDay(this.now());
    r.spins += v.daily;
    this.changed();
    return { ok: true, spins: v.daily, vip: this.vipView(key) };
  }

  // ------------------------------------------------------------------ offers (shared/store.js)
  // today's featured store, with what you already own marked
  store(key) {
    const r = this.rec(key);
    const day = storeDay(this.now());
    const items = featured(day, { outfits: OUTFITS, wskins: WEAPON_SKINS }).map((x) => ({ ...x, owned: (x.kind === 'outfit' ? r.owned : x.kind === 'wskin' ? r.wowned : r.sowned ?? []).includes(x.id) }));
    return { day, ends: (day + 1) * 86400000, items };
  }

  storeBuy(key, id, external) {
    const it = this.store(key).items.find((x) => x.id === id);
    if (!it) return { ok: false, error: 'That one is not in the store today.' };
    if (it.owned) return { ok: false, error: 'You already own it.' };
    if (!this.charge(key, it.price, external)) return { ok: false, error: `Not enough $ (${usd(it.price)} needed).` };
    this.give(key, { k: it.kind, id: it.id });
    return { ok: true, item: it };
  }

  cardView(key) {
    const c = this.rec(key).card;
    const now = this.now();
    if (!c || c.until <= now) return null;
    return { until: c.until, claimed: c.day === storeDay(now), left: Math.ceil((c.until - now) / 86400000) };
  }

  // the Insider card: buying it again while it lasts adds 30 more days
  cardBuy(key, external) {
    const r = this.rec(key);
    if (!this.charge(key, CARD.price, external)) return { ok: false, error: `Not enough $ (${usd(CARD.price)} needed).` };
    const now = this.now();
    const from = Math.max(now, r.card?.until ?? 0);
    r.card = { until: from + CARD.days * 86400000, day: r.card?.day ?? -1 };
    r.credit += CARD.now;
    r.sowned ??= [];
    if (!r.sowned.includes(CARD.frame)) r.sowned.push(CARD.frame);
    this.changed();
    return { ok: true, card: this.cardView(key), added: CARD.now };
  }

  cardClaim(key) {
    const r = this.rec(key);
    const v = this.cardView(key);
    if (!v) return { ok: false, error: 'No Insider card.' };
    if (v.claimed) return { ok: false, error: 'Already claimed today.' };
    r.card.day = storeDay(this.now());
    r.credit += CARD.daily;
    r.spins += CARD.spins;
    this.changed();
    return { ok: true, credit: CARD.daily, spins: CARD.spins, card: this.cardView(key) };
  }

  // the starter pack, once per account
  starterBuy(key, external) {
    const r = this.rec(key);
    if (r.starter) return { ok: false, error: 'Already bought.' };
    if (!this.charge(key, STARTER.price, external)) return { ok: false, error: `Not enough $ (${usd(STARTER.price)} needed).` };
    r.starter = this.now();
    const pool = OUTFITS.filter((o) => o.rarity === STARTER.outfit && !o.basic && !o.limited && !o.season && !r.owned.includes(o.id));
    const outfit = pool.length ? pool[Math.floor(this.rnd() * pool.length)].id : null;
    if (outfit) this.give(key, { k: 'outfit', id: outfit });
    for (const [id, n] of STARTER.boxes) this.give(key, { k: 'box', id, n });
    r.spins += STARTER.spins;
    this.give(key, { k: 'style', id: STARTER.style });
    return { ok: true, outfit, boxes: STARTER.boxes, spins: STARTER.spins, style: STARTER.style };
  }

  // open everything you hold, every box kind at once (up to 300); nothing is charged
  openAll(key) {
    const r = this.rec(key);
    const held = BOXES.map((b) => [b.id, (r.boxes[b.id] ?? 0) + (r.gboxes?.[b.id] ?? 0)]).filter(([, n]) => n > 0);
    if (!held.length) return { ok: false, error: 'No boxes to open.' };
    const results = [];
    let left = 300;
    for (const [id, n] of held) {
      if (left <= 0) break;
      const k = Math.min(n, MAX_OPEN, left);
      const o = this.open(key, id, null, k);
      if (!o.ok) continue;
      left -= k;
      for (const x of o.results) results.push({ ...x, box: id });
    }
    const best = results.reduce((a, b) => (rank(b.rarity) > rank(a.rarity) ? b : a));
    return { ok: true, all: true, box: best.box, count: results.length, results };
  }

  passClaim(key, track, tier) {
    const ps = this.passRec(key);
    tier = Math.floor(Number(tier));
    const rw = passRewards(ps.sid)[track === 'p' ? 'p' : 'f'][tier];
    if (!rw) return { ok: false, error: 'No reward there.' };
    if (passTier(ps.xp) < tier) return { ok: false, error: 'Reach that tier first.' };
    if (track === 'p' && !ps.premium) return { ok: false, error: 'That one is on the premium pass.' };
    const list = track === 'p' ? ps.p : ps.f;
    if (list.includes(tier)) return { ok: false, error: 'Already claimed.' };
    list.push(tier);
    // boxes on the free track are gifts (up to Epic); the premium track's roll the full odds
    this.give(key, track !== 'p' && rw.k === 'box' ? { ...rw, cap: 1 } : rw);
    return { ok: true, track, tier, reward: rw };
  }

  // hand over a reward: shop $, a box, an outfit, a weapon skin or a turret skin
  give(key, rw) {
    const r = this.rec(key);
    if (rw.k === 'credit') r.credit += rw.v;
    else if (rw.k === 'box' && rw.cap) (r.gboxes ??= {})[rw.id] = (r.gboxes[rw.id] ?? 0) + (rw.n ?? 1); // a gift: rolls up to Epic
    else if (rw.k === 'box') r.boxes[rw.id] = (r.boxes[rw.id] ?? 0) + (rw.n ?? 1);
    else if (rw.k === 'outfit') {
      if (!r.owned.includes(rw.id)) r.owned.push(rw.id);
      delete r.trials[rw.id];
    } else if (rw.k === 'wskin' && !r.wowned.includes(rw.id)) r.wowned.push(rw.id);
    else if (rw.k === 'turret' && !r.towned.includes(rw.id)) r.towned.push(rw.id);
    else if (rw.k === 'spin') r.spins += Math.max(1, Math.min(10, rw.n ?? 1));
    else if (rw.k === 'style' && STYLE[rw.id]) {
      r.sowned ??= [];
      if (r.sowned.includes(rw.id)) r.credit += RARITIES[STYLE[rw.id].rarity].refund;
      else r.sowned.push(rw.id);
    }
    else if (rw.k === 'trial' && OUTFIT[rw.id]) r.trials[rw.id] = Math.max(r.trials[rw.id] ?? 0, this.now()) + TRIAL_MS;
    else if (rw.k === 'wtrial' && WSKIN[rw.id]) r.wtrials[rw.id] = Math.max(r.wtrials[rw.id] ?? 0, this.now()) + TRIAL_MS;
    this.changed();
  }

  // the welcome bonus is given once per account (the first top-up or deposit)
  welcome(key) {
    const r = this.rec(key);
    if (r.welcomed) return false;
    r.welcomed = this.now();
    this.changed();
    return true;
  }

  // a prize from the shop's fortune wheel: a 1-hour trial, or a real skin of that rarity to keep
  // (one you don't own yet; never limited or exotic). Falls back to a trial when there is none.
  fortunePrize(key, slot) {
    const r = this.rec(key);
    const fresh = (list, owned, trying, rarities) => {
      const pool = list.filter((o) => !o.basic && !o.limited && rarities.includes(o.rarity) && !owned.includes(o.id) && !((trying?.[o.id] ?? 0) > this.now()));
      return pool.length ? pool[Math.floor(this.rnd() * pool.length)] : null;
    };
    let prize = null;
    // shop $, another spin, a gift box: as they are; pass XP and the boost the lobby hands out
    if (slot.k === 'credit') prize = { k: 'credit', v: slot.v };
    else if (slot.k === 'spin') prize = { k: 'spin', n: slot.n ?? 1 };
    else if (slot.k === 'box') prize = { k: 'box', id: slot.id, n: 1, cap: 1 };
    else if (slot.k === 'pass') return { k: 'pass', v: slot.v };
    else if (slot.k === 'boost') return { k: 'boost', n: slot.n ?? 1 };
    else if (slot.k === 'style') {
      const id = pickStyle(slot.rarity, r.sowned ?? [], this.rnd);
      prize = id ? { k: 'style', id } : { k: 'credit', v: RARITIES[slot.rarity].refund };
    } else if (slot.k === 'outfit') {
      const o = fresh(OUTFITS, r.owned, null, [slot.rarity]);
      if (o) prize = { k: 'outfit', id: o.id };
    } else if (slot.k === 'wskin') {
      const o = fresh(WEAPON_SKINS, r.wowned, null, [slot.rarity]);
      if (o) prize = { k: 'wskin', id: o.id };
    }
    if (!prize) {
      const weapon = slot.k === 'wtrial' || slot.k === 'wskin';
      const o = weapon ? fresh(WEAPON_SKINS, r.wowned, r.wtrials, ['rare', 'epic', 'legendary']) : fresh(OUTFITS, r.owned, r.trials, ['rare', 'epic', 'legendary']);
      prize = o ? { k: weapon ? 'wtrial' : 'trial', id: o.id } : { k: 'credit', v: 5 };
    }
    this.give(key, prize);
    if (prize.k === 'trial') prize.until = r.trials[prize.id];
    if (prize.k === 'wtrial') prize.until = r.wtrials[prize.id];
    return prize;
  }

  // use one free spin (from tasks, the calendar, mail); false when there is none
  useSpin(key) {
    const r = this.rec(key);
    if (!(r.spins > 0)) return false;
    r.spins -= 1;
    this.changed();
    return true;
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
    const gheld = r.gboxes?.[boxId] ?? 0;
    // held boxes first (bought or earned in rated play), then gifts (up to Epic), then paid ones
    const fromHeld = Math.min(held, count);
    const fromGift = Math.min(gheld, count - fromHeld);
    const free = fromHeld + fromGift;
    const paid = count - free;
    if (paid > 0 && !this.charge(key, boxCost(box, paid), external)) return { ok: false, error: `Not enough $ (${usd(boxCost(box, paid))} needed).` };
    r.boxes[boxId] = held - fromHeld;
    if (fromGift) r.gboxes[boxId] = gheld - fromGift;
    const results = [];
    for (let i = 0; i < count; i++) {
      const gift = i >= fromHeld && i < free;
      results.push({ ...this.roll(r, box, gift ? GIFT_CAP : null), free: i < free, ...(gift ? { gift: 1 } : {}) });
    }
    this.changed();
    return { ...results[0], ok: true, box: boxId, count, held: free, gifts: fromGift, bought: paid, results };
  }

  // cap: a gift box rolls no higher than this, and does not move the pity counters
  roll(r, box, cap = null) {
    const p = cap ? { sinceEpic: 0, sinceLegendary: 0, sinceExotic: 0 } : (r.pity[box.id] ??= { sinceEpic: 0, sinceLegendary: 0 });
    p.sinceExotic ??= 0;
    const roll = rollRarity(box, cap ? null : p, this.rnd);
    if (cap && rank(roll.rarity) > rank(cap)) roll.rarity = cap;
    const weapon = box.family === 'weapon';
    const style = box.family === 'style';
    const mine = style ? (r.sowned ??= []) : weapon ? r.wowned : r.owned;
    const item = pickItem(boxCatalog(box), roll.rarity, new Set(mine), this.rnd, { tier: box.tier, minted: this.minted });
    const dup = mine.includes(item.id);
    let refund = 0;
    let serial = null;
    if (dup) {
      refund = RARITIES[item.rarity].refund;
      r.credit += refund;
    } else {
      mine.push(item.id);
      if (!weapon && !style) delete r.trials[item.id];
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
