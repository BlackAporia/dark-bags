import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { createRegionMain, createRegionEdge } from '../server/regions.js';

const SECRET = 'x'.repeat(40);
const quiet = { warn() {}, error() {}, log() {} };

test('diagnostics: a match server sends its stalls home once, named by region', async () => {
  let t = 1_000_000;
  const now = () => t;
  const main = new Lobby({ wallet: new MemoryWallet(), send: () => {}, newToken: () => 'tok12345' });
  const got = [];
  const rm = createRegionMain({ lobby: main, secret: SECRET, regions: [{ id: 'us', url: 'https://us.example' }], now, log: quiet, onStalls: (region, list) => got.push(...list.map((x) => ({ ...x, region }))) });
  const edge = new Lobby({ edge: true, wallet: new MemoryWallet({ faucet: [] }), send: () => {}, newToken: () => 'never', bots: false });
  const stalls = [];
  const sent = [];
  const fetchImpl = async (_url, { body }) => {
    sent.push(JSON.parse(body));
    rm.apply(JSON.parse(body));
    return { ok: true };
  };
  const re = createRegionEdge({ lobby: edge, secret: SECRET, region: 'us', mainUrl: 'https://main.example', journal: [], now, log: quiet, fetchImpl, stalls });
  await re.flush();
  assert.equal(sent.length, 0, 'nothing to say, nothing sent');
  t += 1000;
  stalls.unshift({ at: t, ms: 420, during: ['game tick', 'GC major 380 ms'] });
  await re.flush();
  assert.equal(sent.length, 1);
  assert.deepEqual(got, [{ at: t, ms: 420, during: ['game tick', 'GC major 380 ms'], region: 'us' }]);
  await re.flush();
  assert.equal(got.length, 1, 'the same stall is not sent twice');
  // a forged report's fields are trimmed to what a stall record holds
  rm.apply({ id: 'x2', region: 'us', stalls: [{ at: 'soon', ms: -5, during: ['a'.repeat(500), 1, 2, 3, 4, 5, 6, 7] }] });
  assert.equal(got[1].ms, 0);
  assert.equal(got[1].during.length, 6);
  assert.equal(got[1].during[0].length, 60);
});

test('diagnostics: players report how a match ran; the last ones are kept for the team page', () => {
  const lobby = new Lobby({ wallet: new MemoryWallet(), send: () => {}, newToken: () => 'tok12345' });
  lobby.connect(1, { ip: '1.2.3.4' });
  lobby.handle(1, { t: 'hello', name: 'Fox' });
  const warn = console.log;
  console.log = () => {};
  try {
    lobby.handle(1, { t: 'netlog', mode: 'team2', region: 'us', secs: 95, fps: 41, hangs: 3, worst: 640, gaps: 2, gapMax: 900, ping: 120, pingMax: 480, touch: true, w: 844, h: 390, gpu: 'Apple <b>GPU</b>' });
  } finally {
    console.log = warn;
  }
  const r = lobby.netReports[0];
  assert.equal(r.name, 'Fox');
  assert.equal(r.mode, 'team2');
  assert.equal(r.region, 'us');
  assert.equal(r.hangs, 3);
  assert.equal(r.pingMax, 480);
  assert.equal(r.screen, '844x390');
  assert.ok(!r.gpu.includes('<'), 'no markup from a device');
});
