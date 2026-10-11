// STACHE: a partner coin on the table, with its own things. Pure data, no imports.
//
//   the coin:  staked like any other (the cashier adds it at start, shared/stache.js is where the
//              game learns its address and its logo)
//   the case:  the Stache Case, the only place its skins come from: moustached runners, weapon
//              finishes and style, every rarity. Sold for $0.99 paid in STACHE at the live price.
//   the gift:  the first 100 players to stake STACHE online get the Moustache Holder title
//              (+5% XP, for good) and two Stache Cases.

export const STACHE_ADDRESS = '0x010124018202a8174b3e30673ed42bdc14ff91d8ca0c057112fb904e262a30bf';
// test mode (no chain) plays with symbol ids; the real coin is only ever its address
export const isStache = (id) => id === 'STACHE' || String(id ?? '').toLowerCase() === STACHE_ADDRESS;
export const STACHE_COIN = { symbol: 'STACHE', logo: 'coins/stache.png', color: '#b08d63' };

export const STACHE_CASE_ID = 'c-stache';
export const STACHE_CASE_CENTS = 99; // $0.99, paid in STACHE
export const STACHE_GIFTS = 100; // the first stakers who get the gift
export const STACHE_GIFT_CASES = 2;
export const STACHE_TITLE = 'promo.moustache';

// the palette: waxed brown, silver-grey hair, the navy of the coin
const BROWN = '#5a4330';
const WAX = '#b08d63';
const SILVER = '#c9c3b8';
const NAVY = '#1d2b4a';
const GOLD = '#e0b062';

// runners: every one wears the moustache (outfit.stache: its shape; stacheColor: its hair;
// stacheFx: the rarer, the finer: shine, silver, gold, glow, sparkle; client/stickman.js draws it)
export const STACHE_OUTFITS = [
  { id: 'st-barber', name: 'Barber Shop', rarity: 'common', color: '#c9c3b8', accent: BROWN, head: 'cap', stache: 'brush', stacheColor: '#6b4a2e' },
  { id: 'st-gent', name: 'Fine Gentleman', rarity: 'rare', color: '#3a4a6b', accent: '#e8e2d4', head: 'tophat', stache: 'handlebar', stacheColor: '#1c1714', stacheFx: 'shine' },
  { id: 'st-bandit', name: 'Whisker Bandit', rarity: 'rare', color: '#8a5a3b', accent: '#2a1a10', head: 'cowboy', stache: 'horseshoe', stacheColor: '#b5541c', stacheFx: 'shine' },
  { id: 'st-baron', name: 'Moustache Baron', rarity: 'epic', color: NAVY, accent: GOLD, head: 'tophat', stache: 'handlebar', fx2: 'sparks', stacheColor: '#7a3b1a', stacheFx: 'shine' },
  { id: 'st-viking', name: 'Bristle Viking', rarity: 'epic', color: '#7c5a3a', accent: SILVER, head: 'viking', stache: 'walrus', stacheColor: '#d9a441', stacheFx: 'shine' },
  { id: 'st-tycoon', name: 'Wax Tycoon', rarity: 'legendary', color: '#2b2118', accent: GOLD, head: 'tophat', stache: 'handlebar', fx: 'gold', cape: '#1d2b4a', stacheColor: '#e8b44c', stacheFx: 'gold' },
  { id: 'st-silverfox', name: 'Silver Fox', rarity: 'legendary', color: SILVER, accent: '#3b4252', head: 'none', stache: 'walrus', fx: 'shimmer', stacheColor: '#e6e2da', stacheFx: 'silver' },
  { id: 'st-emperor', name: 'Moustache Emperor', rarity: 'mythic', color: NAVY, accent: WAX, head: 'crown', stache: 'imperial', fx: 'pulse', fx2: 'sparks', cape: '#0b1222', stacheColor: '#6d4bd8', stacheFx: 'glow' },
  { id: 'st-legend', name: 'The Stache', rarity: 'exotic', color: WAX, accent: '#fff3d6', head: 'crown', stache: 'imperial', fx: 'gold', fx2: 'sparks', cape: NAVY, stacheColor: '#ffd36a', stacheFx: 'sparkle' },
].map((o) => ({ ...o, stacheItem: true }));

// weapon finishes, on the guns everyone carries
export const STACHE_FINISHES = [
  // stache: the emblem's colour on the gun; rarer, richer: wood, barber pole, wax, navy & silver, gold, royal
  { id: 'st-bristle', name: 'Bristle', rarity: 'common', color: '#7a5236', accent: '#3a2416', pattern: 'tiger', stache: '#2a1a10' },
  { id: 'st-barberpole', name: 'Barber Pole', rarity: 'rare', color: '#f2ede2', accent: '#c0262f', pattern: 'stripe', stache: '#1d2b4a' },
  { id: 'st-wax', name: 'Moustache Wax', rarity: 'epic', color: '#c08a4a', accent: '#5a3a1c', pattern: 'wave', fx: 'glow', stache: '#2c1d12' },
  { id: 'st-navy', name: 'Stache Navy', rarity: 'legendary', color: NAVY, accent: SILVER, pattern: 'fade', fx: 'shimmer', stache: '#e6e2da' },
  { id: 'st-handlebar', name: 'Golden Handlebar', rarity: 'mythic', color: '#e8b44c', accent: '#6b3f10', pattern: 'dots', fx: 'shimmer', stache: '#3a2614', stacheSheen: '#fff3c4' },
  { id: 'st-royale', name: 'Stache Royale', rarity: 'exotic', color: '#ffd36a', accent: '#6d4bd8', pattern: 'wave', fx: 'galaxy', stache: '#6d4bd8', stacheSheen: '#fff6d0' },
].map((f) => ({ ...f, stacheItem: true }));
export const STACHE_GUNS = ['pistol', 'rifle', 'shotgun', 'sniper', 'smg', 'knife'];

// style: banner, kill effect, frame, name, and the gift title's own look
const STY = (kind, id, name, rarity, c, fx) => ({ kind, id: `${kind[0]}-${id}`, name, rarity, c, fx, excl: true, stacheItem: true });
export const STACHE_STYLE = [
  // fx 'stache…' are their own looks (client/flair.js, client/style.css): moustaches drifting on
  // the banner, a moustache under the frame, one before the name, a burst of them on a kill;
  // the rarer ones in gold (shimmering, spinning) or royal purple
  STY('banner', 'stache', 'Moustache Parade', 'common', [WAX, NAVY], 'stache'),
  STY('killfx', 'stache', 'Whisker Burst', 'rare', [WAX, SILVER], 'stache'),
  STY('namefx', 'stache', 'Waxed Script', 'rare', [GOLD, WAX], 'stache'),
  STY('frame', 'stache', 'Handlebar Ring', 'epic', [WAX, NAVY], 'stache'),
  STY('banner', 'stache-navy', 'Midnight Barbershop', 'legendary', [GOLD, NAVY], 'stache-gold'),
  STY('killfx', 'stache-gold', 'Golden Whiskers', 'mythic', [GOLD, '#fff3d6'], 'stache-gold'),
  STY('frame', 'stache-gold', 'Golden Stache', 'mythic', [GOLD, '#5a3a14'], 'stache-gold'),
  STY('namefx', 'stache-gold', 'Royal Whiskers', 'exotic', [GOLD, '#8b6cf0'], 'stache-royal'),
];

// the gift title: worn in neon like a season title, and its +5% XP never ends
export const FOREVER_TITLES = {
  [STACHE_TITLE]: { key: 'moustache', bonus: 0.05, color: GOLD, rarity: 'exotic', forever: true },
};
