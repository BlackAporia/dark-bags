// Limited gifts that must never be handed out twice or past their count (the STACHE gift:
// the first 100 players to stake STACHE online; the reward for following each of the game's
// channels, once per account). Kept on disk like the locker.
import { STACHE_GIFTS } from './stache.js';
import { COMMUNITY_IDS } from './community.js';

export class PromoBook {
  constructor({ data = {}, onChange = null, now = () => Date.now() } = {}) {
    this.stache = Array.isArray(data.stache) ? data.stache.slice(0, STACHE_GIFTS) : []; // [{ key, at }], in order
    this.mailed = Array.isArray(data.mailed) ? data.mailed : []; // keys whose STACHE letter went out
    this.community = data.community && typeof data.community === 'object' ? { ...data.community } : {}; // key → [channel ids claimed]
    this.onChange = onChange;
    this.now = now;
  }

  stacheLeft() {
    return Math.max(0, STACHE_GIFTS - this.stache.length);
  }

  // the next STACHE gift for this player: their place (1…100), or null (had one, or none left)
  claimStache(key) {
    if (!key || this.stache.some((x) => x.key === key) || this.stacheLeft() <= 0) return null;
    this.stache.push({ key, at: this.now() });
    this.onChange?.(this);
    return this.stache.length;
  }

  // who got the gift before it came as a letter (granted on the spot): sent once more by mail
  unmailed() {
    return this.stache.map((x) => x.key).filter((k) => !this.mailed.includes(k));
  }

  markMailed(key) {
    if (!this.mailed.includes(key)) this.mailed.push(key);
    this.onChange?.(this);
  }

  communityOf(key) {
    return key ? [...(this.community[key] ?? [])] : [];
  }

  // the reward for following one channel: true the first time for this account, false after
  claimCommunity(key, id) {
    if (!key || !COMMUNITY_IDS.includes(id)) return false;
    const had = this.community[key] ?? [];
    if (had.includes(id)) return false;
    this.community[key] = [...had, id];
    this.onChange?.(this);
    return true;
  }

  toJSON() {
    return { stache: this.stache, mailed: this.mailed, community: this.community };
  }
}
