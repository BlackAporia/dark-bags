// Private stakes. A table is a stake range (a band), not one stake: everyone at it picks their
// own amount inside the range, and only they know it. The ready room shows the whole pool, never
// who put in what.
//
// Bands start at the stake tiers: $0.10–$0.99, $1–$9.99, $10–$99.99, $100–$10,000.
// In pot modes the prize is split like poker side pots (World.payPot): a winner can take from
// each player at most what they themselves put in; anything nobody could win goes back.
import { CFG } from './config.js';

export const STAKE_MIN = 100; // $0.10 (thousandths of a dollar)
export const STAKE_MAX = 10_000_000; // $10,000

export const validStake = (s) => Number.isInteger(s) && s >= STAKE_MIN && s <= STAKE_MAX && s % 10 === 0;

// the band a stake belongs to: its lowest stake (one of CFG.TIERS)
export function bandOf(stake) {
  let b = CFG.TIERS[0];
  for (const t of CFG.TIERS) if (stake >= t) b = t;
  return b;
}

// the highest stake of a band
export function bandMax(band) {
  const i = CFG.TIERS.indexOf(band);
  return i >= 0 && i < CFG.TIERS.length - 1 ? CFG.TIERS[i + 1] - 10 : STAKE_MAX;
}
