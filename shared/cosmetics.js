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
];
for (const o of OUTFITS) if (!o.basic) o.price = RARITIES[o.rarity].price;
export const OUTFIT = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));
export const DEFAULT_OUTFIT = 'basic-0';

// odds in percent; the jackpot is what a box is "for" (shared as a hit or a miss)
// prices are in US cents
export const BOXES = [
  { id: 'street', name: 'Street Bag', price: 99, odds: { common: 80, rare: 16.5, epic: 3, legendary: 0.5, mythic: 0 }, jackpot: 'legendary' },
  { id: 'vault', name: 'Vault Bag', price: 299, odds: { common: 50, rare: 36, epic: 11, legendary: 2.7, mythic: 0.3 }, jackpot: 'legendary' },
  { id: 'golden', name: 'Golden Bag', price: 799, odds: { common: 0, rare: 60, epic: 30, legendary: 8.5, mythic: 1.5 }, jackpot: 'mythic' },
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
      const all = OUTFITS.filter((o) => !o.basic && !r.owned.includes(o.id));
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
