import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ec } from 'starknet';
import { setupBefore, setupFile } from '../server/cashier/setup.js';

const quiet = { log() {}, warn() {}, error() {} };
const HOUSE = '0x' + '4a05e'.padStart(64, '0');

function base(dir, poolKey = 0n) {
  const cfg = { network: 'sepolia', file: join(dir, 'cashier.json'), houseKey: '0x1234', strk20: { pool: '0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91', viewingKey: null }, vault: { address: '0x7a017', fromBlock: 1 } };
  const provider = { callContract: async () => [poolKey.toString()] };
  return { cfg, provider, account: { address: HOUSE } };
}

test('VAULT_AUTO makes a viewing key once and keeps it private on the volume', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'db-setup-'));
  const { cfg, provider, account } = base(dir);
  const env = { VAULT_AUTO: '1' };
  const a = await setupBefore({ cfg, account, provider, env, log: quiet });
  assert.match(a.strk20.viewingKey, /^0x[0-9a-f]+$/);
  assert.ok(BigInt(a.strk20.viewingKey) < ec.starkCurve.CURVE.n / 2n);
  assert.equal(statSync(setupFile(cfg)).mode & 0o777, 0o600);
  const b = await setupBefore({ cfg, account, provider, env, log: quiet });
  assert.equal(b.strk20.viewingKey, a.strk20.viewingKey); // same key after a restart
  assert.equal(JSON.parse(readFileSync(setupFile(cfg), 'utf8')).network, 'sepolia');
});

test('a house already registered with a wallet key is not overwritten', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'db-setup-'));
  const { cfg, provider, account } = base(dir, 12345n);
  const r = await setupBefore({ cfg, account, provider, env: { VAULT_AUTO: '1' }, log: quiet });
  assert.equal(r.strk20.viewingKey, null);
});

test('without VAULT_AUTO nothing changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'db-setup-'));
  const { cfg, provider, account } = base(dir);
  assert.equal(await setupBefore({ cfg, account, provider, env: {}, log: quiet }), cfg);
});

test('PRIVATE_AUTO makes the viewing key but deploys no vault', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'db-setup-'));
  const { cfg, provider, account } = base(dir);
  const r = await setupBefore({ cfg: { ...cfg, network: 'mainnet', vault: null }, account, provider, env: { PRIVATE_AUTO: '1' }, log: quiet });
  assert.match(r.strk20.viewingKey, /^0x[0-9a-f]+$/);
  assert.equal(r.vault, null);
});
