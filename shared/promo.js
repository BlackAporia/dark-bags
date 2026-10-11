// Limited gifts that must never be handed out twice or past their count (the STACHE gift:
// the first 100 players to stake STACHE online). Kept on disk like the locker.
import { STACHE_GIFTS } from './stache.js';

export class PromoBook {
  constructor({ data = {}, onChange = null, now = () => Date.now() } = {}) {
    this.stache = Array.isArray(data.stache) ? data.stache.slice(0, STACHE_GIFTS) : []; // [{ key, at }], in order
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

  toJSON() {
    return { stache: this.stache };
  }
}
