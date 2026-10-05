// Self-setup of the private side on first start, so nobody has to run scripts by hand.
// PRIVATE_AUTO=1 does steps 1 and 3 (private deposits and cash-outs through the house notes, no
// contract); VAULT_AUTO=1 does all three:
//
//   1. a viewing key for the house: generated once, kept in a 0600 file next to CASHIER_FILE
//   2. the DARK BAGS vault: declared and deployed from the house account (contracts/build/)
//   3. registration of the house in the STRK20 pool (needs the prover), once
//
// Everything it makes is saved in <dir of CASHIER_FILE>/strk20-setup.json and reused on every
// restart. Values set by hand (STRK20_VIEWING_KEY, VAULT_ADDRESS) always win.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { Account, ec, json, num } from 'starknet';
import { normAddr } from './cashier.js';

const ARTIFACTS = new URL('../../contracts/build/', import.meta.url);

export function setupFile(cfg) {
  return join(cfg.file ? dirname(cfg.file) : '.', 'strk20-setup.json');
}

function load(file, network) {
  if (!existsSync(file)) return { network };
  const s = JSON.parse(readFileSync(file, 'utf8'));
  if (s.network !== network) throw new Error(`${file} belongs to ${s.network}, not ${network}. Use a separate data volume per network.`);
  return s;
}

const save = (file, s) => writeFileSync(file, JSON.stringify(s, null, 2), { mode: 0o600 });

// a viewing key in [1, n/2): 31 random bytes is always below half the curve order
export const newViewingKey = (rand = crypto.randomBytes) => num.toHex(BigInt(`0x${rand(31).toString('hex')}`) || 1n);

// what the pool has on file for this address (0 = not registered)
async function poolKeyOf(provider, pool, address) {
  const r = await provider.callContract({ contractAddress: pool, entrypoint: 'get_public_key', calldata: [address] });
  return BigInt(r[0] ?? 0);
}

// The useful part of a starknet.js error. RPC errors print every param (the whole contract class
// for a declare) before the node's actual answer, so keep the code, message and data, or the tail.
export function rpcReason(e) {
  const b = e?.baseError;
  if (b && (b.code != null || b.message)) {
    const data = b.data == null ? '' : ` ${typeof b.data === 'string' ? b.data : JSON.stringify(b.data)}`;
    return `${b.code ?? ''} ${b.message ?? ''}${data}`.trim().slice(0, 800);
  }
  const m = String(e?.message ?? e);
  return m.length > 800 ? `…${m.slice(-800)}` : m;
}

const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const hint = (e, h) => Object.assign(e, { hint: h });

// Declare (if needed) and deploy the vault from the house account, checking the usual blockers first.
async function deployVault({ cfg, provider, house, pool, env, log }) {
  // the house must be a deployed account with STRK for fees
  try {
    await provider.getClassHashAt(house);
  } catch (e) {
    throw hint(e, `The house account ${house} is not deployed on ${cfg.network}: open it in its wallet and send one transaction (or deploy it), then restart.`);
  }
  const bal = await provider.callContract({ contractAddress: STRK, entrypoint: 'balance_of', calldata: [house] }).then((r) => BigInt(r[0]) + (BigInt(r[1] ?? 0) << 128n), () => null);
  if (bal !== null) log.log?.(`setup: house holds ${Number(bal / 10n ** 14n) / 1e4} STRK`);
  if (bal === 0n) throw hint(new Error('no STRK'), `The house ${house} has no STRK for fees: send it some (Sepolia faucet), then restart.`);

  const sierra = json.parse(readFileSync(new URL('dark_bags_DarkBagsVault.contract_class.json', ARTIFACTS), 'utf8'));
  const casm = json.parse(readFileSync(new URL('dark_bags_DarkBagsVault.compiled_contract_class.json', ARTIFACTS), 'utf8'));
  const owner = normAddr(env.VAULT_OWNER) ?? house;
  const treasury = normAddr(env.VAULT_TREASURY) ?? house;
  if (owner === house) log.warn('setup: VAULT_OWNER is not set, the house owns the vault (set a separate wallet before mainnet)');
  const deployer = new Account({ provider, address: house, signer: cfg.houseKey });

  log.log?.(`setup: declaring the DARK BAGS vault on ${cfg.network}…`);
  let classHash;
  try {
    const d = await deployer.declareIfNot({ contract: sierra, casm });
    classHash = d.class_hash;
    if (d.transaction_hash) await provider.waitForTransaction(d.transaction_hash);
  } catch (e) {
    // a node that hashes compiled classes the other way names the hash it expects: use that one
    const want = /expected[^0-9a-fx]*(0x[0-9a-f]+)/i.exec(rpcReason(e))?.[1];
    if (!want) throw e;
    log.warn(`setup: the node expects compiled class hash ${want}; declaring again with it`);
    const d = await deployer.declare({ contract: sierra, casm, compiledClassHash: want });
    classHash = d.class_hash;
    await provider.waitForTransaction(d.transaction_hash);
  }
  log.log?.(`setup: class ${classHash} declared, deploying…`);
  const r = await deployer.deployContract({ classHash, constructorCalldata: [pool, owner, house, ec.starkCurve.getStarkKey(cfg.houseKey), treasury] });
  const rc = await provider.waitForTransaction(r.transaction_hash);
  const address = normAddr(r.contract_address);
  const fromBlock = rc.block_number ?? (await provider.getBlockNumber());
  log.log?.(`setup: vault deployed at ${address} (block ${fromBlock})`);
  return { address, fromBlock };
}

// Before the chain is built: viewing key and vault address. Returns the updated cfg.
const autoOn = (env) => env.VAULT_AUTO === '1' || env.PRIVATE_AUTO === '1';

export async function setupBefore({ cfg, account, provider, env = process.env, log = console }) {
  if (!autoOn(env)) return cfg;
  if (!account) {
    log.warn('setup: PRIVATE_AUTO / VAULT_AUTO needs HOUSE_PRIVATE_KEY');
    return cfg;
  }
  if (!cfg.file) {
    log.warn('setup: PRIVATE_AUTO / VAULT_AUTO needs CASHIER_FILE on a persistent volume (the setup is saved next to it)');
    return cfg;
  }
  const file = setupFile(cfg);
  const s = load(file, cfg.network);
  const house = normAddr(account.address);
  const pool = cfg.strk20.pool;
  let strk20 = cfg.strk20;
  let vault = cfg.vault;

  // 1. viewing key
  if (!strk20.viewingKey && pool) {
    const onPool = await poolKeyOf(provider, pool, house).catch(() => null);
    if (s.viewingKey) {
      if (onPool && onPool !== BigInt(ec.starkCurve.getStarkKey(s.viewingKey))) log.error('setup: the house is registered in the pool with another viewing key; set STRK20_VIEWING_KEY to that one');
      else strk20 = { ...strk20, viewingKey: s.viewingKey };
    } else if (onPool) {
      log.error('setup: the house address is already registered in the STRK20 pool (a wallet did it). Export that viewing key and set STRK20_VIEWING_KEY, or use a fresh house account.');
    } else {
      s.viewingKey = newViewingKey();
      save(file, s);
      log.log?.('setup: made a viewing key for the house (kept in strk20-setup.json)');
      strk20 = { ...strk20, viewingKey: s.viewingKey };
    }
  }

  // 2. the vault (VAULT_AUTO only)
  if (env.VAULT_AUTO !== '1') return { ...cfg, strk20, vault };
  if (!vault && s.vault) vault = { address: s.vault, fromBlock: s.vaultFromBlock ?? 0 };
  if (!vault && pool) {
    try {
      vault = await deployVault({ cfg, provider, house, pool, env, log });
      s.vault = vault.address;
      s.vaultFromBlock = vault.fromBlock;
      save(file, s);
    } catch (e) {
      vault = null;
      log.error(`setup: vault deploy failed, retrying on next start. ${e?.hint ?? ''}${e?.hint ? ' ' : ''}Reason: ${rpcReason(e)}`);
    }
  }
  return { ...cfg, strk20, vault };
}

// After the chain is built: register the house in the pool once (needs the prover).
export async function setupAfter({ cfg, chain, provider, env = process.env, log = console }) {
  if (!autoOn(env) || !cfg.file || !chain.strk20 || !cfg.strk20.pool) return;
  const file = setupFile(cfg);
  const s = load(file, cfg.network);
  if (s.registered) return;
  const onPool = await poolKeyOf(provider, cfg.strk20.pool, chain.info().house).catch(() => null);
  if (onPool) {
    s.registered = true;
    save(file, s);
    return;
  }
  if (!chain.strk20.canInvoke) {
    log.warn('setup: set STRK20_PROVER_URL so the house can register in the STRK20 pool (needed for private cash-outs)');
    return;
  }
  try {
    const r = await chain.strk20.register();
    s.registered = true;
    s.registeredTx = r.transaction_hash;
    save(file, s);
    log.log?.(`setup: house registered in the STRK20 pool (${r.transaction_hash}); private cash-outs work in a few minutes`);
  } catch (e) {
    log.error('setup: pool registration failed; retrying on next start', e?.message ?? e);
  }
}
