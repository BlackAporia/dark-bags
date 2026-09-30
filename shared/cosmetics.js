// Cosmetics: characters, outfits, the shop and luck boxes.
//
// Built on the Warface model (a shop plus random "luck boxes"), with the parts that
// make players feel cheated taken out:
//   - odds are published on every box, and the roll happens on the server
//   - pity: every box guarantees an Epic-or-better within 15 opens and a
//     Legendary-or-better within 60, and the counter shows how close you are
//   - smart drops: while you are missing items of the rolled rarity, you get one
//     you don't own; duplicates only happen once you own them all
//   - a duplicate pays part of its price back as $ credit
//   - every outfit can also be bought outright, so nothing is locked behind luck
//   - bought items are permanent; timed outfits only come free, as rank-up trials
//
// One shop currency: shop $, bought 1:1 with USDC/USDT (packs add a bonus). It can
// only be spent here, never withdrawn. A purchase spends shop $ first and tops up
// the exact difference from the player's USDC/USDT if they are short.
// Rank-ups pay one thing: a random outfit to try for 72 hours. Rank is XP only.
// Nothing here changes how a runner plays. It's all looks.

export const BODIES = ['m', 'f'];

export const RARITIES = {
  // price and duplicate refund in US cents
  common: { name: 'Common', color: '#b8bfcc', price: 49, refund: 5 },
  rare: { name: 'Rare', color: '#4cc9f0', price: 149, refund: 15 },
  epic: { name: 'Epic', color: '#b37bff', price: 399, refund: 40 },
  legendary: { name: 'Legendary', color: '#f7931a', price: 999, refund: 100 },
  mythic: { name: 'Mythic', color: '#ff3d7f', price: 1999, refund: 200 },
  exotic: { name: 'Exotic', color: '#00f0ff', price: 4999, refund: 500 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic', 'exotic'];
const rank = (r) => RARITY_ORDER.indexOf(r);

// head: none cap beanie bandana helmet mask hood horns kabuto tophat crown halo visor
//       catears dogears bunny wizard viking astro mohawk antenna cowboy pumpkin skull
//       frog domino party headphones diamond
// fx (aura): glow, pulse, ghost (translucent), laser (eye beams), rainbow (hue cycles),
//     fire, gold (shimmering gold), holo (flickering hologram), glitch (RGB split)
// fx2 (particles): lightning, galaxy, sparks, frost, money, matrix, shadow
// cape: a colour for a cape off the shoulders
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
  { id: 'golden-bull', name: 'Golden Bull', rarity: 'exotic', color: '#ffd166', accent: '#fff3c4', head: 'horns', fx: 'gold', fx2: 'money', cape: '#8a6508' },
  { id: 'genesis-ghost', name: 'Genesis Ghost', rarity: 'exotic', color: '#a5f3fc', accent: '#0e7490', head: 'hood', fx: 'holo', fx2: 'matrix', cape: '#083344' },
  { id: 'multiverse-prime', name: 'Multiverse Prime', rarity: 'exotic', color: '#ffffff', head: 'halo', fx: 'rainbow', fx2: 'lightning', cape: '#f8fafc' },
  { id: 'void-emperor', name: 'Void Emperor', rarity: 'exotic', color: '#c084fc', accent: '#000000', head: 'crown', fx: 'glitch', fx2: 'galaxy', cape: '#050008' },
];
for (const o of OUTFITS) if (!o.basic) o.price = RARITIES[o.rarity].price;
export const OUTFIT = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));
export const DEFAULT_OUTFIT = 'basic-0';

// odds in percent; the jackpot is what a box is "for" (shared as a hit or a miss)
// prices are in US cents
export const BOXES = [
  { id: 'street', name: 'Street Bag', price: 99, odds: { common: 80, rare: 16.5, epic: 3, legendary: 0.5, mythic: 0 }, jackpot: 'legendary' },
  { id: 'vault', name: 'Vault Bag', price: 299, odds: { common: 50, rare: 36, epic: 11, legendary: 2.7, mythic: 0.3 }, jackpot: 'legendary' },
  { id: 'golden', name: 'Golden Bag', price: 799, odds: { common: 0, rare: 60, epic: 30, legendary: 8.2, mythic: 1.5, exotic: 0.3 }, jackpot: 'mythic' },
];
export const BOX = Object.fromEntries(BOXES.map((b) => [b.id, b]));
export const PITY = { epic: 15, legendary: 60 }; // guaranteed at or better, by the Nth open of a box

export const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
export const TRIAL_MS = 72 * 3600 * 1000;
export const START_BOXES = { street: 1 }; // a welcome bag for every new runner

// Shop $ packs: paid in USDC/USDT, credited as shop $ with a bonus on the bigger ones.
export const PACKS = [
  { id: 'p5', price: 500, bonus: 0 },
  { id: 'p10', price: 1000, bonus: 50 },
  { id: 'p25', price: 2500, bonus: 250 },
  { id: 'p50', price: 5000, bonus: 750 },
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
  const fromPity = (pity?.sinceLegendary ?? 0) + 1 >= PITY.legendary ? 'legendary' : (pity?.sinceEpic ?? 0) + 1 >= PITY.epic ? 'epic' : null;
  let r = rnd() * 100;
  let rolled = 'common';
  for (const k of RARITY_ORDER) {
    const p = box.odds[k] ?? 0;
    if (p > 0 && r < p) {
      rolled = k;
      break;
    }
    r -= p;
    rolled = k; // floating-point remainder lands on the last rarity with odds
  }
  while ((box.odds[rolled] ?? 0) === 0 && rank(rolled) > 0) rolled = RARITY_ORDER[rank(rolled) - 1];
  if (fromPity && rank(rolled) < rank(fromPity)) return { rarity: fromPity, pity: true };
  return { rarity: rolled, pity: false };
}

// pick an outfit of that rarity, preferring ones the player is missing
export function pickOutfit(rarity, owned, rnd) {
  const pool = OUTFITS.filter((o) => o.rarity === rarity && !o.basic);
  const fresh = pool.filter((o) => !owned.has(o.id));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(rnd() * from.length)];
}

// believable looks for bots: mostly basic and common, now and then something shiny
export function botLook(rnd) {
  const r = rnd();
  const rarity = r < 0.55 ? null : r < 0.8 ? 'common' : r < 0.93 ? 'rare' : r < 0.985 ? 'epic' : 'legendary';
  const o = rarity ? pickOutfit(rarity, new Set(), rnd) : OUTFITS[Math.floor(rnd() * BASIC.length)];
  return { outfit: o.id, body: rnd() < 0.5 ? 'm' : 'f' };
}

// ------------------------------------------------------------- inventory

// Saves from before scrap was retired: turn leftover scrap into $ bonus at its old crafting value
// (100 scrap crafted a $0.49 common), so nobody loses what they had.
function migrate(r) {
  if (r.scrap > 0) r.credit = (r.credit ?? 0) + Math.round(r.scrap / 2);
  delete r.scrap;
  return r;
}

function fresh() {
  return { credit: 0, owned: [], trials: {}, boxes: { ...START_BOXES }, outfit: DEFAULT_OUTFIT, body: 'm', pity: {}, opened: 0, spent: 0 };
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

  // Pay `cents`: $ credit first, the rest through `external(cents)` (USDC/USDT), all or nothing.
  charge(key, cents, external) {
    const r = this.rec(key);
    const fromCredit = Math.min(r.credit, cents);
    const rest = cents - fromCredit;
    if (rest > 0 && !(external && external(rest))) return false;
    r.credit -= fromCredit;
    r.spent += cents;
    return { fromCredit, external: rest };
  }

  // what the client needs to render the locker
  view(key) {
    const r = this.rec(key);
    const now = this.now();
    for (const [id, until] of Object.entries(r.trials)) if (until <= now) delete r.trials[id];
    return {
      credit: r.credit,
      owned: r.owned,
      trials: r.trials,
      boxes: r.boxes,
      outfit: r.outfit,
      body: r.body,
      opened: r.opened,
      pity: Object.fromEntries(BOXES.map((b) => [b.id, { sinceEpic: r.pity[b.id]?.sinceEpic ?? 0, sinceLegendary: r.pity[b.id]?.sinceLegendary ?? 0 }])),
    };
  }

  // what others see in a raid
  look(key) {
    const r = this.rec(key);
    return { outfit: this.owns(key, r.outfit) ? r.outfit : DEFAULT_OUTFIT, body: BODIES.includes(r.body) ? r.body : 'm' };
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
      // a trial of something you don't have yet (any rarity if you own them all)
      // prefer outfits you neither own nor are already trying
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

  setBody(key, body) {
    if (!BODIES.includes(body)) return { ok: false, error: 'Unknown character.' };
    this.rec(key).body = body;
    this.changed();
    return { ok: true };
  }

  buy(key, id, external) {
    const o = OUTFIT[id];
    const r = this.rec(key);
    if (!o || !o.price) return { ok: false, error: 'That outfit is not sold in the shop.' };
    if (r.owned.includes(id) || o.basic) return { ok: false, error: 'You already own it.' };
    const paid = this.charge(key, o.price, external);
    if (!paid) return { ok: false, error: `Not enough $ (${usd(o.price)} needed).` };
    r.owned.push(id);
    delete r.trials[id];
    this.changed();
    return { ok: true, item: id };
  }

  // a bag you hold opens free; otherwise it is bought at its price
  open(key, boxId, external) {
    const box = BOX[boxId];
    const r = this.rec(key);
    if (!box) return { ok: false, error: 'Unknown bag.' };
    let free = false;
    if ((r.boxes[boxId] ?? 0) > 0) {
      r.boxes[boxId]--;
      free = true;
    } else if (!this.charge(key, box.price, external)) return { ok: false, error: `Not enough $ (${usd(box.price)} needed).` };
    const p = (r.pity[boxId] ??= { sinceEpic: 0, sinceLegendary: 0 });
    const roll = rollRarity(box, p, this.rnd);
    const item = pickOutfit(roll.rarity, new Set(r.owned), this.rnd);
    const dup = r.owned.includes(item.id);
    let refund = 0;
    if (dup) {
      refund = RARITIES[item.rarity].refund;
      r.credit += refund;
    } else {
      r.owned.push(item.id);
      delete r.trials[item.id];
    }
    p.sinceEpic = rank(item.rarity) >= rank('epic') ? 0 : p.sinceEpic + 1;
    p.sinceLegendary = rank(item.rarity) >= rank('legendary') ? 0 : p.sinceLegendary + 1;
    r.opened++;
    this.changed();
    return { ok: true, box: boxId, item: item.id, rarity: item.rarity, dup, refund, free, pity: roll.pity, jackpot: rank(item.rarity) >= rank(box.jackpot) };
  }

  toJSON() {
    return Object.fromEntries(this.data);
  }
}
