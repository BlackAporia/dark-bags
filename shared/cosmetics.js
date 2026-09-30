// Cosmetics: characters, outfits, the shop and luck boxes.
//
// Built on the Warface model (a shop plus random "luck boxes"), with the parts that
// make players feel cheated taken out:
//   - odds are published on every box, and the roll happens on the server
//   - pity: every box guarantees an Epic-or-better within 10 opens and a
//     Legendary-or-better within 40, and the counter shows how close you are
//   - smart drops: while you are missing items of the rolled rarity, you get one
//     you don't own; duplicates only happen once you own them all
//   - duplicates turn into scrap, and scrap crafts any outfit you choose
//   - everything is permanent: no 7-day rentals
//   - boxes cost marks, earned by playing (raids, rank-ups), never real tokens:
//     paid random rewards are gambling law in many places
// Nothing here changes how a runner plays. It's all looks.

export const BODIES = ['m', 'f'];

export const RARITIES = {
  common: { name: 'Common', color: '#b8bfcc', scrap: 20, craft: 100 },
  rare: { name: 'Rare', color: '#4cc9f0', scrap: 60, craft: 300 },
  epic: { name: 'Epic', color: '#b37bff', scrap: 200, craft: 1000 },
  legendary: { name: 'Legendary', color: '#f7931a', scrap: 600, craft: 3000 },
  mythic: { name: 'Mythic', color: '#ff3d7f', scrap: 1500, craft: 8000 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];
const rank = (r) => RARITY_ORDER.indexOf(r);

// head: none cap beanie bandana helmet mask hood horns kabuto tophat crown halo
// fx: glow (soft aura), pulse (breathing aura), ghost (translucent), laser (eye beams),
//     rainbow (hue cycles), fire (flickering flame aura)
const BASIC = ['#ff5a5f', '#4cc9f0', '#b5e48c', '#f72585', '#ffd166', '#9b5de5', '#00f5d4', '#ff9f1c'];
const BASIC_NAMES = ['Red', 'Sky', 'Moss', 'Magenta', 'Sun', 'Violet', 'Mint', 'Tangerine'];

export const OUTFITS = [
  ...BASIC.map((color, i) => ({ id: `basic-${i}`, name: `${BASIC_NAMES[i]} Runner`, rarity: 'common', color, head: 'none', basic: true })),
  { id: 'olive', name: 'Olive Drab', rarity: 'common', color: '#8a9a5b', head: 'cap', price: 150 },
  { id: 'slate', name: 'Slate', rarity: 'common', color: '#8c9aab', head: 'beanie', price: 150 },
  { id: 'rust', name: 'Rust', rarity: 'common', color: '#c4561c', head: 'bandana', price: 150 },
  { id: 'denim', name: 'Denim', rarity: 'common', color: '#5b82c4', head: 'cap', price: 150 },
  { id: 'khaki', name: 'Khaki', rarity: 'common', color: '#c3b091', head: 'helmet', price: 150 },
  { id: 'night-ops', name: 'Night Ops', rarity: 'rare', color: '#6f8fe8', accent: '#1d2745', head: 'helmet', price: 450 },
  { id: 'hazard', name: 'Hazard', rarity: 'rare', color: '#ffb000', accent: '#1a1a1a', head: 'beanie', price: 450 },
  { id: 'arctic', name: 'Arctic', rarity: 'rare', color: '#e8f1ff', accent: '#9fd3ff', head: 'beanie', price: 450 },
  { id: 'toxic', name: 'Toxic', rarity: 'rare', color: '#9ef01a', accent: '#2b2b2b', head: 'mask', price: 450 },
  { id: 'desert', name: 'Desert Storm', rarity: 'rare', color: '#d9b77e', accent: '#7a5a2a', head: 'helmet', price: 450 },
  { id: 'neon', name: 'Neon Pink', rarity: 'rare', color: '#ff4fd8', accent: '#ffffff', head: 'bandana', price: 450 },
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
];
export const OUTFIT = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));
export const DEFAULT_OUTFIT = 'basic-0';

// odds in percent; the jackpot is what a box is "for" (shared as a hit or a miss)
export const BOXES = [
  { id: 'street', name: 'Street Box', price: 120, odds: { common: 70, rare: 24, epic: 5, legendary: 1, mythic: 0 }, jackpot: 'legendary' },
  { id: 'vault', name: 'Vault Box', price: 400, odds: { common: 35, rare: 43, epic: 16, legendary: 5.5, mythic: 0.5 }, jackpot: 'legendary' },
  { id: 'golden', name: 'Golden Box', price: 1200, odds: { common: 0, rare: 45, epic: 35, legendary: 17, mythic: 3 }, jackpot: 'mythic' },
];
export const BOX = Object.fromEntries(BOXES.map((b) => [b.id, b]));
export const PITY = { epic: 10, legendary: 40 }; // guaranteed at or better, by the Nth open of a box

// marks: the soft currency. Earned, never bought.
export const START_MARKS = 300; // enough for two Street Boxes on day one
export const RANK_UP_MARKS = 150;
export const raidMarks = (rankXp) => Math.max(5, Math.round(rankXp * 0.3));

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

function fresh() {
  return { marks: START_MARKS, scrap: 0, owned: [], outfit: DEFAULT_OUTFIT, body: 'm', pity: {}, opened: 0, totalMarks: 0 };
}

/**
 * Per-player inventory (same keys as balances and ranks). Every method returns
 * { ok: true, ... } or { ok: false, error } and never throws on player input.
 */
export class Inventory {
  constructor({ data = {}, onChange = null, rnd = Math.random } = {}) {
    this.data = new Map(Object.entries(data).map(([k, v]) => [k, { ...fresh(), ...v }]));
    this.onChange = onChange;
    this.rnd = rnd;
  }

  rec(key) {
    if (!this.data.has(key)) this.data.set(key, fresh());
    return this.data.get(key);
  }

  owns(key, id) {
    const o = OUTFIT[id];
    return !!o && (o.basic || this.rec(key).owned.includes(id));
  }

  // what the client needs to render the locker
  view(key) {
    const r = this.rec(key);
    return {
      marks: r.marks,
      scrap: r.scrap,
      owned: r.owned,
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

  addMarks(key, n) {
    const r = this.rec(key);
    const add = Math.max(0, Math.floor(n));
    r.marks += add;
    r.totalMarks += add;
    this.changed();
    return r.marks;
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

  buy(key, id) {
    const o = OUTFIT[id];
    const r = this.rec(key);
    if (!o || !o.price) return { ok: false, error: 'That outfit is not sold in the shop.' };
    if (this.owns(key, id)) return { ok: false, error: 'You already own it.' };
    if (r.marks < o.price) return { ok: false, error: `Not enough marks (${o.price} needed).` };
    r.marks -= o.price;
    r.owned.push(id);
    this.changed();
    return { ok: true, item: id };
  }

  craft(key, id) {
    const o = OUTFIT[id];
    const r = this.rec(key);
    if (!o || o.basic) return { ok: false, error: 'That cannot be crafted.' };
    if (this.owns(key, id)) return { ok: false, error: 'You already own it.' };
    const cost = RARITIES[o.rarity].craft;
    if (r.scrap < cost) return { ok: false, error: `Not enough scrap (${cost} needed).` };
    r.scrap -= cost;
    r.owned.push(id);
    this.changed();
    return { ok: true, item: id };
  }

  open(key, boxId) {
    const box = BOX[boxId];
    const r = this.rec(key);
    if (!box) return { ok: false, error: 'Unknown box.' };
    if (r.marks < box.price) return { ok: false, error: `Not enough marks (${box.price} needed).` };
    r.marks -= box.price;
    const p = (r.pity[boxId] ??= { sinceEpic: 0, sinceLegendary: 0 });
    const roll = rollRarity(box, p, this.rnd);
    const item = pickOutfit(roll.rarity, new Set(r.owned), this.rnd);
    const dup = r.owned.includes(item.id);
    let scrap = 0;
    if (dup) {
      scrap = RARITIES[item.rarity].scrap;
      r.scrap += scrap;
    } else r.owned.push(item.id);
    p.sinceEpic = rank(item.rarity) >= rank('epic') ? 0 : p.sinceEpic + 1;
    p.sinceLegendary = rank(item.rarity) >= rank('legendary') ? 0 : p.sinceLegendary + 1;
    r.opened++;
    this.changed();
    return { ok: true, box: boxId, item: item.id, rarity: item.rarity, dup, scrap, pity: roll.pity, jackpot: rank(item.rarity) >= rank(box.jackpot) };
  }

  toJSON() {
    return Object.fromEntries(this.data);
  }
}
