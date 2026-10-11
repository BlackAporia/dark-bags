// The game's own channels, and what following them pays (once per account, per channel):
// a free spin of the fortune wheel each, and on the first one the Community Member title
// (worn in neon like the season titles; +2% XP that never ends). The game can't see a follow,
// so the claim opens only after the link was opened. Pure data, no imports.

export const COMMUNITY = [
  { id: 'x', name: 'X', handle: '@play_dark_bags', url: 'https://x.com/play_dark_bags', color: '#e7e9ea' },
  { id: 'tg', name: 'Telegram', handle: 't.me/dark_bags_starknet', url: 'https://t.me/dark_bags_starknet', color: '#2aabee' },
];
export const COMMUNITY_IDS = COMMUNITY.map((c) => c.id);
export const COMMUNITY_TITLE = 'promo.community';
export const COMMUNITY_SPINS = 1; // wheel spins per channel
export const COMMUNITY_TITLE_DEF = { key: 'community', bonus: 0.02, color: '#3ce6ff', rarity: 'epic', forever: true };
