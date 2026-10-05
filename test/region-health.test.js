import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegionMain, checkTicket, makeTicket } from '../server/regions.js';

const SECRET = 'x'.repeat(40);
const quiet = { log() {}, warn() {}, error() {} };
const lobby = { ranks: { recs: new Map() }, inventory: { data: new Map() }, referrals: { users: new Map() }, social: {}, prices: {}, wallet: {} };

test('a broken match server is named and left out of the list', async () => {
  const regions = [
    { id: 'us', url: 'https://us.example' },
    { id: 'asia', url: 'https://asia.example' },
    { id: 'sa', url: 'https://sa.example' },
  ];
  const main = createRegionMain({ lobby, secret: SECRET, regions, log: quiet });
  const fake = async (url) => {
    if (url.startsWith('https://us')) return { ok: true, status: 200, json: async () => ({ ok: true, region: 'us' }) };
    if (url.startsWith('https://asia')) return { ok: false, status: 403, json: async () => ({ error: 'bad signature' }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, region: 'region' }) };
  };
  const h = await main.checkAll(fake);
  assert.equal(h.us, 'ok');
  assert.match(h.asia, /REGION_SECRET differs/);
  assert.match(h.sa, /REGION=region; set REGION=sa/);
  assert.deepEqual(main.list().map((r) => r.id), ['eu', 'us']);
});

test('a refused ticket says why', () => {
  const tk = makeTicket(SECRET, { k: 'entry', region: 'us', exp: Date.now() + 1000 });
  assert.equal(checkTicket(SECRET, tk).why, null);
  assert.equal(checkTicket('y'.repeat(40), tk).why, 'signature');
  assert.equal(checkTicket(SECRET, tk, Date.now() + 5000).why, 'expired');
  assert.equal(checkTicket(SECRET, '').why, 'missing');
});
