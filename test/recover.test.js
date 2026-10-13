import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { archiveTime, mergeRankRecs, mergeRanks, mergeSocial, recoverArchives } from '../server/recover.js';
import { SocialBook } from '../shared/social.js';
import { applyStats } from '../shared/achievements.js';

// a period as the server kept it: XP from play plus the XP of every achievement its counters finished
const period = (base, stats, extra = {}) => {
  const rec = { xp: base, stats: {}, done: {}, ...extra };
  rec.xp += applyStats(rec, stats).reduce((n, a) => n + a.xp, 0);
  return rec;
};
const achXp = (stats) => applyStats({}, stats).reduce((n, a) => n + a.xp, 0);

// Every deploy moved a live /data/ranks.json into archive/shared-<time>/: each archive is one
// period of play counted from zero. Merged, the periods give the record back.

test('archive folder names give their time', () => {
  assert.equal(archiveTime('shared-2026-10-05T12-30-01-250Z'), Date.parse('2026-10-05T12:30:01.250Z'));
  assert.equal(archiveTime('2026-10-04-pre'), null);
  assert.equal(archiveTime('recovery-2026-10-05T12-30-01-250Z'), null);
});

test('periods add up: XP, counters, ranked RP; repeated achievements pay once', () => {
  const sid = '2026-10';
  const a = period(1000, { raids: 12, kills: 30, bestKills: 7 }, { title: 'rookie', ranked: { sid, rp: 1100, games: 5, wins: 2, kills: 10, deaths: 3, top3: 3, best: 1120, prized: ['silver'] } });
  const b = period(400, { raids: 3, kills: 4, bestKills: 9 }, { ranked: { sid, rp: 1060, games: 2, wins: 1, kills: 4, deaths: 1, top3: 1, best: 1070, prized: [] } });
  const m = mergeRankRecs([a, b]);
  // the play XP of both, and every achievement once, as if it had all been one period
  assert.equal(m.xp, 1400 + achXp({ raids: 15, kills: 34, bestKills: 9 }));
  assert.equal(m.stats.raids, 15);
  assert.equal(m.stats.kills, 34);
  assert.equal(m.stats.bestKills, 9, 'a best is a best, not a sum');
  assert.ok(m.done.rookie && m.done.regular);
  assert.equal(m.title, 'rookie');
  assert.equal(m.ranked.rp, 1000 + 100 + 60);
  assert.equal(m.ranked.games, 7);
  assert.equal(m.ranked.wins, 3);
  assert.equal(m.ranked.best, 1160);
  assert.deepEqual(m.ranked.prized, ['silver']);
});

test('counters that reach an achievement only together pay it now', () => {
  const m = mergeRankRecs([period(450, { raids: 6 }), period(250, { raids: 5 })]);
  // Rookie (50) once, and Regular (150: 11 raids) that neither period reached
  assert.ok(m.done.regular);
  assert.equal(m.xp, 700 + 50 + 150);
});

test('a lone record comes through untouched; an older season gives way to the newer', () => {
  const lone = { xp: 77, stats: { raids: 1 }, done: { rookie: 1 } };
  assert.deepEqual(mergeRanks([{ k: lone }]).k, lone);
  const m = mergeRankRecs([{ xp: 1, ranked: { sid: '2026-09', rp: 1500, games: 9, prized: [] } }, { xp: 1, ranked: { sid: '2026-10', rp: 1040, games: 1, prized: [] } }]);
  assert.equal(m.ranked.sid, '2026-10');
  assert.equal(m.ranked.rp, 1040);
});

test('social: one profile per key, ids mapped, the oldest keeps its name, guilds join up', () => {
  const p1 = {
    players: {
      A: { id: 'a1', name: 'Fox', created: 1, seen: 10, friends: ['b1'], out: [], in: [], unread: {}, purchases: 1, guild: 'g1' },
      B: { id: 'b1', name: 'Bear', created: 2, seen: 10, friends: ['a1'], out: [], in: [], unread: {}, purchases: 0, guild: 'g1' },
    },
    guilds: { g1: { id: 'g1', name: 'Night', tag: 'NRD', owner: 'a1', members: ['a1', 'b1'], created: 1 } },
    gchat: { g1: [{ f: 'b1', text: 'hi', at: 5 }] },
    dms: { 'a1|b1': [{ f: 'a1', text: 'yo', at: 3 }] },
  };
  const p2 = {
    players: {
      A: { id: 'a2', name: 'Fox2', created: 20, seen: 30, friends: [], out: [], in: [], unread: {}, purchases: 0, guild: 'g2' },
      C: { id: 'c2', name: 'Fox', created: 21, seen: 30, friends: [], out: [], in: [], unread: {}, purchases: 0, guild: 'g2' },
    },
    guilds: { g2: { id: 'g2', name: 'Night', tag: 'NRD', owner: 'a2', members: ['a2', 'c2'], created: 20 } },
    gchat: { g2: [{ f: 'a2', text: 'back', at: 25 }] },
    dms: {},
  };
  const m = mergeSocial([p1, p2]);
  assert.equal(m.players.A.id, 'a1');
  assert.equal(m.players.A.created, 1);
  assert.equal(m.players.A.purchases, 1);
  assert.equal(m.players.A.guild, 'g1');
  assert.equal(m.players.C.guild, 'g1');
  assert.deepEqual(m.guilds.g1.members.sort(), ['a1', 'b1', 'c2']);
  assert.equal(m.guilds.g2, undefined);
  assert.deepEqual(m.gchat.g1.map((x) => [x.f, x.text]), [['b1', 'hi'], ['a1', 'back']]);
  // the oldest Fox keeps the name; the later one gets a free variant when the book loads
  const book = new SocialBook({ data: m });
  assert.equal(book.get('A').name, 'Fox');
  assert.equal(book.get('C').name, 'Fox2');
});

function dataDir() {
  const d = mkdtempSync(path.join(tmpdir(), 'dbrec-'));
  mkdirSync(path.join(d, 'archive'));
  return d;
}
const put = (d, dir, file, obj) => {
  mkdirSync(path.join(d, 'archive', dir), { recursive: true });
  writeFileSync(path.join(d, 'archive', dir, file), JSON.stringify(obj));
};

test('recovery merges archives after the epoch into a live file at the old path, once', () => {
  const d = dataDir();
  const epochAt = Date.parse('2026-10-04T10:00:00Z');
  put(d, 'shared-2026-10-04T09-59-59-000Z', 'ranks.json', { k: { xp: 99999 } }); // before the epoch: not ours
  put(d, 'shared-2026-10-05T10-00-00-000Z', 'ranks.json', { k: period(250, { raids: 3 }) });
  put(d, 'shared-2026-10-08T10-00-00-000Z', 'ranks.json', { k: period(150, { raids: 2 }), j: { xp: 10 } });
  writeFileSync(path.join(d, 'ranks.json'), JSON.stringify({ k: period(50, { raids: 1 }) }));
  const done = recoverArchives({ dataDir: d, files: { ranks: path.join(d, 'ranks.json'), social: path.join(d, 'mainnet-social.json') }, epochAt, log: { warn() {} } });
  assert.equal(done.length, 1);
  assert.equal(done[0].periods, 3);
  const live = JSON.parse(readFileSync(path.join(d, 'ranks.json'), 'utf8'));
  assert.equal(live.k.xp, 450 + 50);
  assert.equal(live.k.stats.raids, 6);
  assert.equal(live.j.xp, 10);
  // the live file as it was is kept
  assert.ok(readdirSync(path.join(d, 'archive')).some((n) => n.startsWith('recovery-')));
  // a restart adds nothing twice
  assert.deepEqual(recoverArchives({ dataDir: d, files: { ranks: path.join(d, 'ranks.json') }, epochAt, log: { warn() {} } }), []);
  assert.equal(JSON.parse(readFileSync(path.join(d, 'ranks.json'), 'utf8')).k.xp, 500);
});

test('a live file at its per-network path gets the lost periods too; nothing older than the epoch', () => {
  const d = dataDir();
  const epochAt = Date.parse('2026-10-04T10:00:00Z');
  put(d, 'shared-2026-10-04T09-00-00-000Z', 'ranks.json', { k: { xp: 99999 } });
  put(d, 'shared-2026-10-05T10-00-00-000Z', 'ranks.json', { k: { xp: 300 } });
  const live = path.join(d, 'mainnet-ranks.json');
  writeFileSync(live, JSON.stringify({ k: { xp: 5 } }));
  const done = recoverArchives({ dataDir: d, files: { ranks: live }, epochAt, log: { warn() {} } });
  assert.equal(done.length, 1);
  assert.equal(JSON.parse(readFileSync(live, 'utf8')).k.xp, 305);
  assert.ok(existsSync(path.join(d, 'recovered.json')));
  // no archives: nothing happens, no marker
  const e = dataDir();
  assert.deepEqual(recoverArchives({ dataDir: e, files: { ranks: path.join(e, 'mainnet-ranks.json') }, epochAt, log: { warn() {} } }), []);
  assert.equal(existsSync(path.join(e, 'recovered.json')), false);
});
