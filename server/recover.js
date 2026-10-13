// Bringing back progress that the per-network move put away by mistake.
//
// From 2 October the server moved the old shared files (/data/ranks.json, /data/social.json) into
// /data/archive/shared-<time>/ at every start, so test wallets would leave the mainnet tables. A
// server whose RANKS_FILE (or SOCIAL_FILE) was set to that very path (docs/LAUNCH.md said so) lost
// its live file on every deploy: everyone's rank XP, achievements, career stats and ranked RP
// started over, while skins and shop $ (another file) stayed. Each archive holds what was earned
// between two deploys, from zero, so the true record is the sum of them all.
//
// recoverArchives() runs at start: it merges every such archive made after the data epoch began
// into the live file (a copy of the live file first goes to archive/recovery-<time>/), and notes
// what it merged in <data>/recovered.json so a restart never adds the same period twice.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { ACHIEVEMENTS, MAX_STATS, applyStats } from '../shared/achievements.js';
import { START_RP } from '../shared/ranked.js';

const ACH_XP = new Map(ACHIEVEMENTS.map((a) => [a.id, a.xp ?? 0]));

// archive/shared-2026-10-05T12-00-00-000Z → its time in ms (null for other folders)
export function archiveTime(name) {
  const m = /^shared-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(name);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null;
}

// One player's rank records from several periods, oldest first, each counted from zero.
export function mergeRankRecs(list) {
  if (list.length === 1) return structuredClone(list[0]);
  const out = { xp: 0 };
  const doneCount = new Map();
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    out.xp += Math.max(0, Math.floor(Number(r.xp) || 0));
    for (const [k, v] of Object.entries(r.stats ?? {})) {
      if (!Number.isFinite(v)) continue;
      out.stats ??= {};
      out.stats[k] = MAX_STATS.has(k) ? Math.max(out.stats[k] ?? 0, v) : (out.stats[k] ?? 0) + v;
    }
    for (const id of Object.keys(r.done ?? {})) {
      doneCount.set(id, (doneCount.get(id) ?? 0) + 1);
      (out.done ??= {})[id] = 1;
    }
    for (const id of r.stitles ?? []) if (!(out.stitles ??= []).includes(id)) out.stitles.push(id);
    if (r.title) out.title = r.title;
    if (r.neon) out.neon = r.neon;
    if (r.ranked?.sid) {
      const q = r.ranked;
      const m = out.ranked;
      if (!m || q.sid > m.sid) out.ranked = { ...structuredClone(q), prized: [...(q.prized ?? [])] };
      else if (q.sid === m.sid) {
        // the same season in two periods: both started at START_RP, so their moves add up
        m.rp = Math.max(0, m.rp + (q.rp - START_RP));
        for (const k of ['games', 'wins', 'kills', 'deaths', 'top3']) m[k] = (m[k] ?? 0) + (q[k] ?? 0);
        m.best = Math.max(m.best ?? START_RP, q.best ?? START_RP, m.rp);
        for (const id of q.prized ?? []) if (!m.prized.includes(id)) m.prized.push(id);
      }
    }
    // anything else a record carries: the newest period's value
    for (const [k, v] of Object.entries(r)) if (!['xp', 'stats', 'done', 'stitles', 'title', 'neon', 'ranked'].includes(k)) out[k] = structuredClone(v);
  }
  // an achievement finished again after a reset paid its XP again: take the repeats back
  for (const [id, n] of doneCount) if (n > 1) out.xp = Math.max(0, out.xp - (n - 1) * (ACH_XP.get(id) ?? 0));
  // the counters added together may finish achievements no single period reached: pay them now
  const fresh = applyStats(out, {});
  out.xp += fresh.reduce((s, a) => s + (a.xp ?? 0), 0);
  if (out.ranked) out.ranked.best = Math.max(out.ranked.best ?? START_RP, out.ranked.rp);
  return out;
}

// Rank files from several periods (oldest first, each a { key: record } object) → one.
export function mergeRanks(periods) {
  const byKey = new Map();
  for (const p of periods) for (const [k, v] of Object.entries(p ?? {})) (byKey.get(k) ?? byKey.set(k, []).get(k)).push(typeof v === 'object' && v ? v : { xp: Number(v) || 0 });
  return Object.fromEntries([...byKey].map(([k, list]) => [k, mergeRankRecs(list)]));
}

// Social files from several periods (oldest first) → one. The same key got a new public id in
// every period, so its oldest id wins and every friend list, guild and message is mapped to it; the
// oldest profile keeps its name (SocialBook dedupes names by age on load).
export function mergeSocial(periods) {
  const players = {};
  const alias = new Map(); // any public id → the id the merged profile keeps
  for (const p of periods) {
    for (const [key, rec] of Object.entries(p?.players ?? {})) {
      const had = players[key];
      if (!had) {
        players[key] = structuredClone(rec);
        alias.set(rec.id, rec.id);
        continue;
      }
      alias.set(rec.id, had.id);
      had.created = Math.min(had.created ?? Infinity, rec.created ?? Infinity);
      had.seen = Math.max(had.seen ?? 0, rec.seen ?? 0);
      had.purchases = Math.max(had.purchases ?? 0, rec.purchases ?? 0);
      if (rec.guild) had.guild = rec.guild;
      for (const f of ['friends', 'out', 'in']) had[f] = [...new Set([...(had[f] ?? []), ...(rec[f] ?? [])])];
      had.unread = { ...(had.unread ?? {}), ...(rec.unread ?? {}) };
    }
  }
  const id = (x) => alias.get(x) ?? x;
  for (const rec of Object.values(players)) {
    for (const f of ['friends', 'out', 'in']) rec[f] = [...new Set((rec[f] ?? []).map(id))].filter((x) => x !== rec.id);
    rec.unread = Object.fromEntries(Object.entries(rec.unread ?? {}).map(([k, v]) => [id(k), v]));
  }
  const guilds = {};
  const gchat = {};
  const dms = {};
  // a guild founded again after a reset (same tag) is the same guild: the oldest id keeps it
  const gAlias = new Map();
  const byTag = new Map();
  for (const p of periods) {
    for (const [gid0, g] of Object.entries(p?.guilds ?? {})) {
      const tag = String(g.tag ?? '').toLowerCase();
      const gid = byTag.get(tag) ?? gid0;
      if (!byTag.has(tag)) byTag.set(tag, gid0);
      gAlias.set(gid0, gid);
      const had = guilds[gid];
      const members = (g.members ?? []).map(id);
      guilds[gid] = had ? { ...had, members: [...new Set([...had.members, ...members])] } : { ...structuredClone(g), id: gid, owner: id(g.owner), members: [...new Set(members)] };
    }
    for (const [gid, list] of Object.entries(p?.gchat ?? {})) {
      const g = gAlias.get(gid) ?? gid;
      gchat[g] = [...(gchat[g] ?? []), ...list.map((m) => ({ ...m, f: id(m.f) }))];
    }
    for (const [pair, list] of Object.entries(p?.dms ?? {})) {
      const k = pair.split('|').map(id).sort().join('|');
      dms[k] = [...(dms[k] ?? []), ...list.map((m) => ({ ...m, f: id(m.f) }))];
    }
  }
  // a player sits in the guild their newest period had them in, and only there
  for (const rec of Object.values(players)) {
    rec.guild = rec.guild ? gAlias.get(rec.guild) ?? rec.guild : null;
    if (rec.guild && !guilds[rec.guild]) rec.guild = null;
  }
  const keyOfId = new Map(Object.entries(players).map(([k, r]) => [r.id, k]));
  for (const [gid, g] of Object.entries(guilds)) {
    g.members = g.members.filter((m) => players[keyOfId.get(m)]?.guild === gid);
    if (!g.members.length) {
      delete guilds[gid];
      delete gchat[gid];
    } else if (!g.members.includes(g.owner)) g.owner = g.members[0];
  }
  for (const list of [...Object.values(gchat), ...Object.values(dms)]) list.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return { players, dms, guilds, gchat };
}

const MERGE = { ranks: mergeRanks, social: mergeSocial };
const ARCHIVED = { ranks: 'ranks.json', social: 'social.json' };

// Merge the archived periods into the live files ({ ranks: RANKS_FILE, social: SOCIAL_FILE }).
// The first move (when the per-network files came in, at the same start as the data epoch) took
// the old shared test data and is older than the epoch; every archive after it can only be a live
// file the move took by mistake, whatever path the live file has now. Returns what it did.
export function recoverArchives({ dataDir, files, epochAt = 0, now = () => Date.now(), log = console }) {
  const done = [];
  if (!dataDir) return done;
  const marker = path.join(dataDir, 'recovered.json');
  const seen = existsSync(marker) ? JSON.parse(readFileSync(marker, 'utf8')) : { merged: [] };
  const archive = path.join(dataDir, 'archive');
  const dirs = existsSync(archive) ? readdirSync(archive).map((name) => ({ name, at: archiveTime(name) })).filter((d) => d.at !== null && d.at > epochAt) : [];
  dirs.sort((a, b) => a.at - b.at);
  for (const [store, file] of Object.entries(files ?? {})) {
    const base = ARCHIVED[store];
    if (!file || !base) continue;
    const todo = dirs.filter((d) => existsSync(path.join(archive, d.name, base)) && !seen.merged.includes(`${d.name}/${base}`));
    if (!todo.length) continue;
    const periods = todo.map((d) => JSON.parse(readFileSync(path.join(archive, d.name, base), 'utf8')));
    if (existsSync(file)) periods.push(JSON.parse(readFileSync(file, 'utf8')));
    const merged = MERGE[store](periods);
    const keep = path.join(archive, `recovery-${new Date(now()).toISOString().replace(/[:.]/g, '-')}`);
    mkdirSync(keep, { recursive: true });
    if (existsSync(file)) copyFileSync(file, path.join(keep, path.basename(file)));
    writeFileSync(`${file}.tmp`, JSON.stringify(merged));
    renameSync(`${file}.tmp`, file);
    seen.merged.push(...todo.map((d) => `${d.name}/${base}`));
    const count = store === 'ranks' ? Object.keys(merged).length : Object.keys(merged.players).length;
    done.push({ store, file: path.basename(file), periods: periods.length, players: count, from: todo.map((d) => d.name) });
    log.warn(`recovery: ${store}: merged ${todo.length} archived period(s) into ${file} (${count} players); the file as it was is in ${keep}`);
  }
  if (done.length) {
    seen.at = new Date(now()).toISOString();
    seen.runs = [...(seen.runs ?? []), { at: seen.at, done }];
    writeFileSync(marker, JSON.stringify(seen, null, 2));
  }
  return done;
}

// what the recovery did so far (for the admin page)
export function recoveryLog(dataDir) {
  const marker = dataDir && path.join(dataDir, 'recovered.json');
  if (!marker || !existsSync(marker)) return null;
  try {
    return JSON.parse(readFileSync(marker, 'utf8')).runs ?? null;
  } catch {
    return null;
  }
}
