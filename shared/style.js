// Style: the things you show off besides your runner and your guns. All of them are animated.
//   frame:  around your portrait (profile card, ready room, profile window)
//   banner: behind your profile card and in your profile window
//   killfx: what bursts where your victim falls, for everyone around to see
//   namefx: how your name is painted, over your head in the raid and in the menus
// They come from the Style cases in the shop, the daily calendar, tasks and achievements.
// c: the colours the drawing uses; fx: which animation (client/flair.js and style.css).

export const STYLE_KINDS = ['frame', 'banner', 'killfx', 'namefx'];

const S = (kind, id, name, rarity, c, fx = id) => ({ kind, id: `${kind[0]}-${id}`, name, rarity, c, fx });

export const STYLE_ITEMS = [
  // frames
  S('frame', 'steel', 'Steel Rim', 'common', ['#9aa3b5', '#5b6273']),
  S('frame', 'mint', 'Mint Line', 'common', ['#3ddc97', '#1f7a55']),
  S('frame', 'neon', 'Neon Pulse', 'rare', ['#3ce6ff', '#1a7d99']),
  S('frame', 'ember', 'Ember Glow', 'rare', ['#ff8a3c', '#a33b10']),
  S('frame', 'circuit', 'Circuit Ring', 'epic', ['#3ce6ff', '#a86bff']),
  S('frame', 'toxic', 'Toxic Drip', 'epic', ['#a3e635', '#3f6212']),
  S('frame', 'gold', 'Gold Crown', 'legendary', ['#ffd166', '#f7931a']),
  S('frame', 'frost', 'Frost Bite', 'legendary', ['#bae6fd', '#38bdf8']),
  S('frame', 'inferno', 'Inferno', 'mythic', ['#ff3d3d', '#ffb347']),
  S('frame', 'void', 'Void Gate', 'mythic', ['#a855f7', '#1e0b3a']),
  S('frame', 'prism', 'Prism', 'exotic', ['#ff3cc8', '#3ce6ff']),
  // only with the Insider card (shared/store.js): never in a case, a reward or the store
  { ...S('frame', 'insider', 'Insider', 'legendary', ['#ffd34d', '#ff6bd5'], 'gold'), excl: true },
  // VIP levels 5 and 8 (shared/vip.js)
  { ...S('frame', 'vip', 'VIP Gold', 'legendary', ['#ffd166', '#b8860b'], 'gold'), excl: true },
  { ...S('frame', 'vipx', 'VIP Diamond', 'mythic', ['#bae6fd', '#a855f7'], 'prism'), excl: true },
  // banners
  S('banner', 'grid', 'Night Grid', 'common', ['#1b2440', '#0b1020']),
  S('banner', 'stripes', 'Hazard Tape', 'common', ['#c9a227', '#1a1712']),
  S('banner', 'sunset', 'Synth Sunset', 'rare', ['#ff3cc8', '#ffb347']),
  S('banner', 'ocean', 'Deep Ocean', 'rare', ['#0ea5e9', '#082f49']),
  S('banner', 'matrix', 'Code Rain', 'epic', ['#3ddc97', '#03140c']),
  S('banner', 'aurora', 'Aurora', 'epic', ['#34d399', '#818cf8']),
  S('banner', 'lava', 'Lava Lamp', 'legendary', ['#ff5a14', '#3a0d05']),
  S('banner', 'galaxy', 'Galaxy', 'legendary', ['#a855f7', '#0b0420']),
  S('banner', 'storm', 'Thunderstorm', 'mythic', ['#e0f2fe', '#0f172a']),
  S('banner', 'bull', 'Bull Run', 'mythic', ['#22c55e', '#052e16']),
  S('banner', 'genesis', 'Genesis Holo', 'exotic', ['#ff3cc8', '#3ce6ff']),
  // kill effects
  S('killfx', 'sparks', 'Sparks', 'common', ['#ffd166', '#ff8a3c']),
  S('killfx', 'smoke', 'Smoke Puff', 'common', ['#9aa3b5', '#3b4252']),
  S('killfx', 'confetti', 'Confetti', 'rare', ['#ff4d6d', '#45c4ff']),
  S('killfx', 'coins', 'Coin Burst', 'rare', ['#ffd166', '#f7931a']),
  S('killfx', 'pixel', 'Pixelate', 'epic', ['#3ce6ff', '#a86bff']),
  S('killfx', 'ghost', 'Ghost Out', 'epic', ['#e5e7eb', '#a5b4fc']),
  S('killfx', 'lightning', 'Lightning Strike', 'legendary', ['#e0f2fe', '#60a5fa']),
  S('killfx', 'frost', 'Ice Shatter', 'legendary', ['#bae6fd', '#38bdf8']),
  S('killfx', 'blackhole', 'Black Hole', 'mythic', ['#a855f7', '#000000']),
  S('killfx', 'firework', 'Firework', 'mythic', ['#ff3cc8', '#ffd166']),
  S('killfx', 'rugged', 'Rugged', 'exotic', ['#ff3d3d', '#ffd166']),
  // name effects
  S('namefx', 'mint', 'Mint', 'common', ['#3ddc97', '#3ddc97']),
  S('namefx', 'sky', 'Sky', 'common', ['#60a5fa', '#60a5fa']),
  S('namefx', 'gold', 'Gold Shine', 'rare', ['#ffd166', '#f7931a']),
  S('namefx', 'ice', 'Ice', 'rare', ['#e0f2fe', '#38bdf8']),
  S('namefx', 'fire', 'On Fire', 'epic', ['#ffd166', '#ff3d3d']),
  S('namefx', 'toxic', 'Toxic', 'epic', ['#d9f99d', '#65a30d']),
  S('namefx', 'neon', 'Neon Sign', 'legendary', ['#ff3cc8', '#3ce6ff']),
  S('namefx', 'rainbow', 'Rainbow', 'legendary', ['#ff4d6d', '#45c4ff']),
  S('namefx', 'glitch', 'Glitch', 'mythic', ['#3ce6ff', '#ff3cc8']),
  S('namefx', 'galaxy', 'Galaxy', 'mythic', ['#c4b5fd', '#7c3aed']),
  S('namefx', 'prism', 'Holo Prism', 'exotic', ['#ffffff', '#3ce6ff']),
];
export const STYLE = Object.fromEntries(STYLE_ITEMS.map((x) => [x.id, x]));

// the cases (shop): all four kinds in each, better odds the dearer it is
export const STYLE_CASES = [
  { id: 's-street', name: 'Street Style Case', price: 99, odds: { common: 62, rare: 28, epic: 8, legendary: 1.8, mythic: 0.2 }, jackpot: 'legendary', art: { c1: '#3ddc97', c2: '#04140c', icon: '✦' } },
  { id: 's-neon', name: 'Neon Style Case', price: 299, odds: { rare: 50, epic: 36.5, legendary: 11, mythic: 2.2, exotic: 0.3 }, jackpot: 'mythic', art: { c1: '#ff3cc8', c2: '#160420', icon: '◆' } },
  { id: 's-icon', name: 'Icon Style Case', price: 999, odds: { epic: 45, legendary: 38, mythic: 14.5, exotic: 2.5 }, jackpot: 'exotic', exoticPity: 40, art: { c1: '#ffd166', c2: '#1a1204', icon: '♛' } },
];

// one item of that rarity (and kind, if given) you don't own yet; null when you have them all
export function pickStyle(rarity, owned = [], rnd = Math.random, kind = null) {
  const pool = STYLE_ITEMS.filter((x) => !x.excl && x.rarity === rarity && (!kind || x.kind === kind) && !owned.includes(x.id));
  return pool.length ? pool[Math.floor(rnd() * pool.length)].id : null;
}
