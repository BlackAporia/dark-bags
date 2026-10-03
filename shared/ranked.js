// Ranked: a battle royale with a stake that also moves your season rating (RP). Placement
// and kills decide the change; divisions run from Bronze to Neon Legend. Ratings reset with
// the season (a calendar month, as the battle pass).
//
// After every ranked match a bonus spin may come up (always for a win, often for the top
// three): a case lottery that pays a case, a weapon skin or, rarely, a limited season title.
// Season titles glow in neon over your name and add a bonus to all the XP you earn until the
// season ends. Pure rules: the server rolls, the client only shows.
import { seasonAt } from './season.js';

export const START_RP = 1000;

// lower bound of each division (RP)
export const DIVISIONS = [
  { id: 'bronze', min: 0, color: '#cd7f32' },
  { id: 'silver', min: 1100, color: '#c0c7d1' },
  { id: 'gold', min: 1250, color: '#ffd166' },
  { id: 'platinum', min: 1450, color: '#67e8f9' },
  { id: 'diamond', min: 1700, color: '#9fe8ff' },
  { id: 'master', min: 2000, color: '#c084fc' },
  { id: 'legend', min: 2400, color: '#ff2dd4' },
];
// What reaching a division pays, once a season: the best style and cases in the game are earned
// here (and in the battle pass), never from free daily rewards.
//   style: a style item of that rarity you don't own yet; box: a case to open (rolls in full)
export const DIV_PRIZES = {
  silver: [{ k: 'style', rarity: 'epic' }],
  gold: [{ k: 'style', rarity: 'legendary' }],
  platinum: [{ k: 'box', id: 's-neon' }, { k: 'style', rarity: 'legendary' }],
  diamond: [{ k: 'style', rarity: 'legendary' }, { k: 'box', id: 'golden' }],
  master: [{ k: 'style', rarity: 'mythic' }, { k: 'box', id: 's-icon' }],
  legend: [{ k: 'style', rarity: 'mythic' }, { k: 'style', rarity: 'exotic' }, { k: 'box', id: 'apex' }],
};

export function divisionOf(rp) {
  let d = DIVISIONS[0];
  for (const x of DIVISIONS) if (rp >= x.min) d = x;
  return d;
}

// RP for a finish: the top places climb, the bottom places drop; kills always help a bit.
// Scaled to the lobby size, so a win among 10 is worth more than a win in a duel.
export function rpDelta({ place, size, kills = 0 }) {
  size = Math.max(2, size);
  const pct = (place - 1) / (size - 1); // 0 = winner, 1 = first out
  const base = Math.round(40 - pct * 64); // +40 … −24
  const k = Math.min(15, kills * 3);
  return Math.max(-25, Math.min(55, base + k));
}

// season titles: one set per season, each with its XP bonus and its neon
export const TITLE_TIERS = [
  { key: 'contender', bonus: 0.05, color: '#00f5ff', odds: 10 },
  { key: 'elite', bonus: 0.1, color: '#ff2dd4', odds: 4 },
  { key: 'champion', bonus: 0.15, color: '#ffd166', odds: 1 },
];
export const seasonTitleId = (sid, key) => `${sid}.${key}`;
export function seasonTitle(id) {
  const [sid, key] = String(id ?? '').split('.');
  const tier = TITLE_TIERS.find((x) => x.key === key);
  return tier && sid ? { id, sid, ...tier } : null;
}
// the active bonus of a worn title (none once its season is over)
export function titleBonus(id, now = Date.now()) {
  const t = seasonTitle(id);
  return t && t.sid === seasonAt(now).id ? t.bonus : 0;
}

// the chance of a bonus spin for a finish
export const spinChance = (place) => (place === 1 ? 1 : place <= 3 ? 0.6 : 0.2);

// what the spin pays: odds in percent (titles first, then a skin, else a case)
export const LOTTERY = [
  ...TITLE_TIERS.map((x) => ({ k: 'title', key: x.key, odds: x.odds })),
  { k: 'wskin', odds: 25 },
  { k: 'box', odds: 60 },
];
export function rollLottery(rnd) {
  let r = rnd() * 100;
  for (const x of LOTTERY) {
    if (r < x.odds) return x;
    r -= x.odds;
  }
  return LOTTERY[LOTTERY.length - 1];
}
