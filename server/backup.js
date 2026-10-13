// A copy of every player's progress in their own browser, signed by the server.
//
// The server's files are the record, but a disk can be lost (a deploy without a volume, a bad
// mount, a file moved by mistake). So every signed-in player's browser keeps the latest copy of
// their own records, under their wallet address: rank XP, achievements, stats and ranked RP, the
// locker (skins, shop $, cases), Descent tickets, the invite book, the daily calendar and the
// profile's name. The copy is HMAC-signed with a server secret, so it can't be made up or edited;
// it only ever brings back what this server once wrote for that same address.
//
// It comes back when the server has lost the records:
//   - ranks: when none are here, or when the ones here were started after the copy's (a new life of
//     the file, see RankBook.since): the copy and what was earned since are added up;
//   - every other part: only when the server has nothing for that address.
import crypto from 'node:crypto';
import { mergeRankRecs } from './recover.js';

const MAX_BLOB = 256 * 1024;
const MAX_BLOBS = 4;

export function createBackups({ secret, lobby, now = () => Date.now(), log = console, every = 20_000 }) {
  const k = crypto.createHmac('sha256', String(secret)).update('darkbags-backup-v1').digest();
  const mac = (body) => crypto.createHmac('sha256', k).update(body).digest('base64url');
  const sent = new Map(); // cid → digest of the copy it holds
  let made = 0;
  let restored = 0;

  function parts(key) {
    const prof = lobby.social.get(key);
    const ref = lobby.referrals.users.get(key);
    return {
      ranks: lobby.ranks.recs.get(key) ?? null,
      locker: lobby.inventory.data.get(key) ?? null,
      descent: lobby.descent?.users?.get(key) ?? null,
      ref: ref ?? null,
      daily: lobby.daily?.users?.get(key) ?? null,
      prof: prof ? { name: prof.name, created: prof.created ?? null, purchases: prof.purchases ?? 0 } : null,
    };
  }

  // the signed copy of one account's records
  function snapshot(key, at = now()) {
    const body = Buffer.from(JSON.stringify({ v: 1, key, at, ...parts(key) })).toString('base64url');
    return `${body}.${mac(body)}`;
  }

  function read(blob) {
    if (typeof blob !== 'string' || blob.length > MAX_BLOB) return null;
    const [body, sig] = blob.split('.');
    if (!body || !sig) return null;
    const want = mac(body);
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return p?.v === 1 && typeof p.key === 'string' ? p : null;
    } catch {
      return null;
    }
  }

  // a locker nobody has touched yet (made by the visit itself): nothing in it to keep
  const untouched = (r) => !r || (!(r.owned?.length || r.wowned?.length || r.towned?.length || r.sowned?.length) && !(r.credit > 0) && !(r.spent > 0) && !(r.opened > 0) && !(r.bought > 0));

  // Bring back what the server lost for this account from the copies a browser sent. Returns the
  // parts it restored ([] when the server's own records stand).
  function restore(key, blobs) {
    if (!key || !Array.isArray(blobs)) return [];
    const mine = blobs.slice(0, MAX_BLOBS).map(read).filter((p) => p && p.key === key);
    if (!mine.length) return [];
    const p = mine.sort((a, b) => b.at - a.at)[0];
    const did = [];
    if (p.ranks) {
      const cur = lobby.ranks.recs.get(key);
      if (!cur) {
        lobby.ranks.recs.set(key, structuredClone(p.ranks));
        did.push('ranks');
      } else if (p.ranks.since && cur.since !== p.ranks.since && (p.ranks.xp ?? 0) > 0) {
        // the file here started over after this copy was made: the copy, plus what came since
        lobby.ranks.recs.set(key, { ...mergeRankRecs([p.ranks, cur]), since: p.ranks.since });
        did.push('ranks');
      }
      if (did.includes('ranks')) lobby.ranks.onChange?.(lobby.ranks);
    }
    if (p.locker && !untouched(p.locker) && untouched(lobby.inventory.data.get(key))) {
      lobby.inventory.data.set(key, structuredClone(p.locker));
      lobby.inventory.onChange?.(lobby.inventory);
      did.push('locker');
    }
    if (p.descent && lobby.descent?.users && !lobby.descent.users.has(key)) {
      lobby.descent.users.set(key, structuredClone(p.descent));
      lobby.descent.onChange?.(lobby.descent);
      did.push('descent');
    }
    if (p.ref && !lobby.referrals.users.has(key)) {
      const r = structuredClone(p.ref);
      // the invite code comes back with it, unless someone else holds it now
      if (r.code && lobby.referrals.codes.has(r.code) && lobby.referrals.codes.get(r.code) !== key) r.code = null;
      lobby.referrals.users.set(key, r);
      if (r.code) lobby.referrals.codes.set(r.code, key);
      lobby.referrals.changed?.();
      did.push('ref');
    }
    if (p.daily && lobby.daily?.users && !lobby.daily.users.has(key)) {
      lobby.daily.users.set(key, structuredClone(p.daily));
      lobby.daily.onChange?.(lobby.daily);
      did.push('daily');
    }
    if (p.prof?.name) {
      const cur = lobby.social.get(key);
      // a profile made after the copy is one the server made again: it takes the old name back
      if (!cur || (cur.created ?? 0) > p.at) {
        const prof = lobby.social.touch(key, p.prof.name);
        if (prof) {
          prof.created = Math.min(prof.created ?? Infinity, p.prof.created ?? Infinity);
          prof.purchases = Math.max(prof.purchases ?? 0, p.prof.purchases ?? 0);
          lobby.social.changed();
          did.push('prof');
        }
      }
    }
    if (did.length) {
      restored++;
      log.warn(`backup: ${key} restored ${did.join(', ')} from the copy of ${new Date(p.at).toISOString()}`);
    }
    return did;
  }

  // every signed-in session gets its copy when its records change
  function tick() {
    for (const [cid, s] of lobby.sessions) {
      const key = lobby.key(s);
      if (!key) continue;
      const digest = crypto.createHash('sha256').update(JSON.stringify(parts(key))).digest('base64url');
      if (sent.get(cid) === `${key}:${digest}`) continue;
      sent.set(cid, `${key}:${digest}`);
      lobby.send(cid, { t: 'backup', key, b: snapshot(key) });
      made++;
    }
    for (const cid of sent.keys()) if (!lobby.sessions.has(cid)) sent.delete(cid);
  }

  const timer = every ? setInterval(tick, every) : null;
  timer?.unref?.();
  return { snapshot, read, restore, tick, stats: () => ({ made, restored }) };
}
