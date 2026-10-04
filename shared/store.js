// The offers next to the cases: things bought outright, no roll.
//
//   Featured store: six skins a day (two outfits, two weapon skins, two style items), the same
//     for everyone, Rare to Mythic, priced by rarity. A new set at 00:00 UTC.
//   Insider card: 30 days for $4.99: $1 of shop $ at once, then $0.15 of shop $ and a wheel spin
//     every day you claim it, +25% battle-pass XP and the Insider frame (only from the card).
//   Starter pack: once per account, $1.99: an Epic outfit, two Vault bags and an Armory crate
//     (bought boxes: the full odds), five wheel spins and an Epic frame.
//   Pass tiers: $0.99 a tier, ten for $8.99.
//
// Skins bought here are never limited editions, Exotic, basic or season items: those stay in the
// cases, the pass and ranked. Pure rules: the inventory charges and gives (shared/cosmetics.js).
import { STYLE_ITEMS } from './style.js';

export const DAY_MS = 86400000;
export const storeDay = (t) => Math.floor(t / DAY_MS);

// cents, by rarity: well above what a box costs per draw, below what chasing one item costs
export const STORE_PRICE = { rare: 149, epic: 399, legendary: 1499, mythic: 3999 };
// how the day's six slots pick a rarity (the last slot of each pair can be better)
const SLOT_RARITY = [
  ['rare', 'epic'],
  ['epic', 'epic', 'legendary', 'legendary', 'mythic'],
];

export const CARD = { price: 499, days: 30, now: 100, daily: 15, spins: 1, passBoost: 0.25, frame: 'f-insider' };
export const STARTER = { price: 199, boxes: [['vault', 2], ['w-armory', 1]], spins: 5, style: 'f-circuit', outfit: 'epic' };
export const TIER_PRICE = 99;
export const tierCost = (n) => (n >= 10 ? Math.floor(n / 10) * 899 + (n % 10) * TIER_PRICE : n * TIER_PRICE);

function mix(n) {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

const sellable = (o) => !o.basic && !o.limited && !o.season && !o.excl && STORE_PRICE[o.rarity];

// the day's six offers: [{ id, kind: 'outfit' | 'wskin' | 'style', rarity, price }]
export function featured(day, { outfits, wskins }) {
  const out = [];
  const lists = [
    ['outfit', outfits.filter(sellable)],
    ['wskin', wskins.filter(sellable)],
    ['style', STYLE_ITEMS.filter(sellable)],
  ];
  let n = 0;
  for (const [kind, list] of lists)
    for (let slot = 0; slot < 2; slot++) {
      const h = mix(day * 31 + n++);
      const choices = SLOT_RARITY[slot];
      let rarity = choices[h % choices.length];
      let pool = list.filter((o) => o.rarity === rarity);
      if (!pool.length) pool = list.filter((o) => o.rarity === 'epic');
      if (!pool.length) continue;
      let pick = pool[mix(h) % pool.length];
      if (out.some((x) => x.id === pick.id)) pick = pool[(mix(h) + 1) % pool.length];
      rarity = pick.rarity;
      out.push({ id: pick.id, kind, rarity, price: STORE_PRICE[rarity] });
    }
  return out;
}
