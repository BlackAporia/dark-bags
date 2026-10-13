// Demo data for the features video: a season's ranked table, a guild with its chat, and the
// demo player's invites. Written as the server's own store files (RANKS_FILE, SOCIAL_FILE,
// REFERRAL_FILE). Every name and number here is made up for the video.
import { writeFileSync, mkdirSync } from 'node:fs';
import { seasonAt } from '../../../shared/season.js';
const out = process.argv[2] ?? 'data';
mkdirSync(out, { recursive: true });
const sid = seasonAt(Date.now()).id;
const now = Date.now();
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hex = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');
const NAMES = ['NightFox', 'bag_goblin', 'sat_stacker', 'laser_eyes', 'rug_ranger', 'moon_mole', 'cold_wallet', 'dca_dino', 'paper_hands', 'utxo_uri', 'dust_dealer', 'ape_42', 'gm_ghost', 'fee_sniper', 'hodl_hana', 'zk_zoe', 'stark_storm', 'degen_dan', 'mempool_mo', 'rekt_ronin'];
const ME = 'demoplayer01';
const players = {}, ranks = {}, keys = [];
const rp = [2468, 2311, 2190, 2042, 1987, 1876, 1790, 1744, 1688, 1615, 1560, 1492, 1455, 1380, 1322, 1260, 1201, 1140, 1102, 1050];
NAMES.forEach((n, i) => {
  const key = `demo${hex(12)}`;
  keys.push(key);
  players[key] = { id: hex(10), name: n, created: now - (40 - i) * 86400000, seen: now - Math.floor(rnd() * 3600000), friends: [], out: [], in: [], unread: {}, purchases: i < 6 ? 1 : 0, guild: null };
  const games = 18 + Math.floor(rnd() * 60);
  const kills = Math.floor(games * (2 + rnd() * 3));
  const deaths = Math.floor(games * (0.6 + rnd() * 0.6));
  ranks[key] = { xp: 40000 + Math.floor(rnd() * 400000) - i * 15000, ranked: { sid, rp: rp[i], games, wins: Math.floor(games * (0.35 - i * 0.012)), kills, deaths, top3: Math.floor(games * 0.5), best: rp[i] + 40 } };
});
// the demo player: Diamond, mid-table
players[ME] = { id: hex(10), name: 'StacheLord', created: now - 30 * 86400000, seen: now, friends: [], out: [], in: [], unread: {}, purchases: 2, guild: null };
ranks[ME] = { xp: 186000, ranked: { sid, rp: 1734, games: 41, wins: 11, kills: 133, deaths: 38, top3: 22, best: 1762 } };
// a guild: Night Raiders, with the demo player and a dozen others, and a busy chat
const gid = hex(8);
const members = [players[keys[0]].id, players[ME].id, ...keys.slice(1, 13).map((k) => players[k].id)];
for (const k of [keys[0], ME, ...keys.slice(1, 13)]) players[k].guild = gid;
const guilds = { [gid]: { id: gid, name: 'Night Raiders', tag: 'NRD', desc: 'We drop at night. We get out with the bags. Ranked squad, EU evenings.', owner: players[keys[0]].id, members, created: now - 20 * 86400000 } };
const say = [
  [keys[0], 'squad up for ranked at 9, we need 2 more'],
  [keys[3], 'just hit Diamond 💎'],
  [ME, 'gg! saw your triple on the bridge'],
  [keys[5], 'season ends Nov 1, push now or never'],
  [keys[2], 'who has the Neon title? spin gave me Contender'],
  [keys[7], 'invite your friends, the bags add up'],
  [keys[1], 'Battle Royale 10 in 2 min, ready room open'],
];
const gchat = { [gid]: say.map(([k, text], i) => ({ f: players[k].id, text, at: now - (say.length - i) * 4 * 60000 })) };
writeFileSync(`${out}/ranks.json`, JSON.stringify(ranks));
writeFileSync(`${out}/social.json`, JSON.stringify({ players, dms: {}, guilds, gchat }));
// invites: seven friends came in through the demo player's link; five have played
const code = 'NIGHTFOX7';
const users = { [ME]: { code, by: null, at: now - 25 * 86400000, matches: 41, refs: keys.slice(13, 20), earned: 1840, frac: 0 } };
keys.slice(13, 20).forEach((k, i) => (users[k] = { code: `F${hex(6).toUpperCase()}`, by: ME, at: now - (20 - i) * 86400000, matches: i < 5 ? 3 + i * 4 : 0, refs: [], earned: 0, frac: 0 }));
const codes = Object.fromEntries(Object.entries(users).map(([k, u]) => [u.code, k]));
writeFileSync(`${out}/referrals.json`, JSON.stringify({ codes, users }));
console.log('seeded', sid, 'guild', gid, 'me', ME);
