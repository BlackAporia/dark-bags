// VIP levels: what a player has paid in real money over all time (shop $ packs and the
// USDC/USDT part of any purchase; never free shop $). Perks are comfort and status, never
// power in a match:
//   bonus: extra shop $ on every top-up (% of the pack)
//   daily: free wheel spins to claim every day
//   frame: a VIP-only frame given on reaching the level
// Pure rules: the inventory counts the points and hands out the perks (shared/cosmetics.js).
export const VIP_LEVELS = [
  { lv: 1, min: 500, bonus: 0, daily: 0, color: '#9aa3b5' },
  { lv: 2, min: 2000, bonus: 2, daily: 0, color: '#4cc9f0' },
  { lv: 3, min: 5000, bonus: 3, daily: 1, color: '#3ddc97' },
  { lv: 4, min: 10000, bonus: 4, daily: 1, color: '#a3e635' },
  { lv: 5, min: 25000, bonus: 5, daily: 2, color: '#ffd166', frame: 'f-vip' },
  { lv: 6, min: 50000, bonus: 6, daily: 2, color: '#f7931a' },
  { lv: 7, min: 100000, bonus: 8, daily: 3, color: '#ff6bd5' },
  { lv: 8, min: 250000, bonus: 10, daily: 3, color: '#b37bff', frame: 'f-vipx' },
  { lv: 9, min: 500000, bonus: 12, daily: 4, color: '#ff3d3d' },
  { lv: 10, min: 1000000, bonus: 15, daily: 5, color: '#3ce6ff' },
];

// points (cents paid) → the level reached (0: none yet) and the next one
export function vipOf(points) {
  let cur = null;
  for (const l of VIP_LEVELS) if (points >= l.min) cur = l;
  const next = VIP_LEVELS.find((l) => points < l.min) ?? null;
  return { lv: cur?.lv ?? 0, cur, next, points, toNext: next ? next.min - points : 0 };
}
