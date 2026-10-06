// The house's side of the STRK20 privacy pool.
//
// Deposits: players send a private transfer to the house inside the pool. Only the
// house's viewing key can open those notes; each note carries its sender, which is
// who gets credited. Nobody watching the chain sees who paid the house, or how much.
//
// Withdrawals: the house builds a private transfer (Privacy SDK: note selection,
// channel setup and a STARK proof from the proving service), then submits the call
// with the proof from its own account. The player must be registered in the pool.
//
// Both need Node 24+ and the optional `strk20-discovery` package (it bundles the
// official @starkware-libs/starknet-privacy-sdk and verifies the pool state it
// downloads against the chain before trusting it).

import { Account, RpcProvider } from 'starknet';
import { normAddr } from './cashier.js';

export async function createStrk20({ cfg, account, provider, log = console }) {
  const s = cfg.strk20;
  if (!s.pool || !s.viewingKey) {
    log.warn('STRK20: set STRK20_VIEWING_KEY (and STRK20_POOL off mainnet) to take private deposits');
    return null;
  }
  let disc, sdk;
  try {
    ({ disc, sdk } = await loadPoolClient());
  } catch (e) {
    log.warn(`STRK20: private pool off (${e?.message ?? e})`);
    return null;
  }

  const discovery = new disc.NodeDiscoveryProvider({
    network: cfg.network,
    feedUrl: s.feedUrl,
    cacheDirectory: s.cacheDir,
    rpcUrl: cfg.rpcUrl ?? undefined,
  });
  // The first sync downloads and verifies the pool state: minutes on a cold volume. It runs in the
  // background so the server answers its health check; every pool operation waits for it.
  let synced = false;
  const ready = discovery.ready.then(
    () => {
      synced = true;
      log.log?.('STRK20: pool state verified and in sync');
    },
    (e) => {
      log.error(`STRK20: pool sync failed: ${e?.message ?? e}`);
      throw e;
    },
  );
  ready.catch(() => {});
  // a payout that cannot start because the pool is not in sync sent nothing: the player gets it back
  const inSync = () => ready.catch((e) => Promise.reject(Object.assign(new Error(`STRK20 pool not in sync: ${e?.message ?? e}`), { notSent: true })));
  // the SDK wants the viewing key as a bigint: a hex string silently derives the wrong channel keys
  const viewingKey = BigInt(s.viewingKey);
  const mine = discovery.forAccount({ address: account.address, viewingKey });

  const transfers =
    account.signer && s.proverUrl
      ? sdk.createPrivateTransfers({
          account: { address: account.address, signer: account.signer },
          viewingKeyProvider: { getViewingKey: async () => viewingKey },
          provingProvider: { url: s.proverUrl, chainId: cfg.chainId === 'SN_MAIN' ? '0x534e5f4d41494e' : '0x534e5f5345504f4c4941', nodeUrl: cfg.rpcUrl ?? undefined },
          discoveryProvider: discovery,
          poolContractAddress: s.pool,
        })
      : null;
  if (!transfers) log.warn('STRK20: set HOUSE_PRIVATE_KEY and STRK20_PROVER_URL for private cash-outs');

  // Prove against head - 10: notes mature 10 blocks after creation, and a proof at the head can be
  // undone by a reorg (strk20-by-example.org/sdk/proving-config).
  const provingBlock = async () => Math.max(0, (await provider.getBlockNumber()) - 10);
  // tip is required for v3; proof keys only when there are proof facts (empty ones make an
  // invalid transaction). After a failed submission the cached pool nonce is stale.
  // A transaction with proof facts gets fixed resource bounds instead of a fee estimate: public
  // nodes drop proof_facts from starknet_estimateFee, so the pool reverts the estimate with
  // EMPTY_PROOF_FACTS (the SDK's own devnet helper skips the estimate the same way).
  async function submit(callAndProof) {
    const { call, proof } = callAndProof;
    try {
      if (!proof?.proofFacts?.length) return await account.execute(call, { tip: 0n });
      const details = { tip: 0n, proof: proof.data, proofFacts: proof.proofFacts, resourceBounds: await proofBounds(provider) };
      return await submitProof({ account, call, details, nodes: proofNodes(cfg), log });
    } catch (e) {
      transfers?.invalidateProofNonceCache?.();
      throw e;
    }
  }
  const house = normAddr(account.address);

  return {
    pool: s.pool,
    canPay: !!transfers,

    // every note the house holds, as deposits; the cashier skips ids it has seen
    async scan() {
      await ready;
      const { notes } = await mine.discoverNotes();
      const out = [];
      for (const [token, list] of entriesOf(notes)) {
        for (const n of list) {
          const from = normAddr(n.sender);
          if (!from || from === house || n.open) continue; // change from our own payouts
          out.push({ id: `note:${BigInt(n.id).toString(16)}`, token: normAddr(token), from, amount: BigInt(n.amount) });
        }
      }
      return out;
    },

    async pay({ token, to, amount }) {
      await inSync();
      if (!transfers) throw Object.assign(new Error('private cash-outs are not configured'), { notSent: true });
      let res;
      try {
        res = await transfers.build().with(token).transfer({ recipient: to, amount: BigInt(amount) }).done().execute({ autoSetup: true, autoSelectNotes: 'naive', provingBlockId: await provingBlock() });
      } catch (e) {
        // building or proving failed: nothing was signed or sent
        throw Object.assign(new Error(/regist/i.test(String(e?.message)) ? 'recipient is not registered in the STRK20 pool' : `proof failed: ${e?.message ?? e}`), { notSent: true });
      }
      const r = await submit(res.callAndProof);
      provider.waitForTransaction?.(r.transaction_hash).catch(() => {});
      return { tx: r.transaction_hash };
    },

    // One private tx: an open note owned by `to` (the owner is encrypted on chain) and an invoke
    // of `contract`, whose returned deposit fills that note. `calldata({ noteId })` builds the
    // invoke's calldata once the note id is known (the vault's payout is signed over it).
    canInvoke: !!transfers,
    get synced() {
      return synced;
    },
    async invokeWithOpenNote({ token, to, contract, calldata }) {
      await inSync();
      if (!transfers) throw Object.assign(new Error('private cash-outs are not configured'), { notSent: true });
      let res;
      try {
        res = await transfers
          .build({ autoSetup: true })
          .with(token)
          .transfer({ recipient: to, amount: sdk.Open })
          .done()
          .invoke(({ openNotes }) => ({ contractAddress: contract, entrypoint: 'privacy_invoke', calldata: calldata({ noteId: BigInt(openNotes[0].noteId) }) }))
          .execute({ autoSetup: true, autoDiscover: { channels: 'missing' }, provingBlockId: await provingBlock() });
      } catch (e) {
        throw Object.assign(new Error(/regist/i.test(String(e?.message)) ? 'recipient is not registered in the STRK20 pool' : `proof failed: ${e?.message ?? e}`), { notSent: true });
      }
      const r = await submit(res.callAndProof);
      provider.waitForTransaction?.(r.transaction_hash).catch(() => {});
      return { tx: r.transaction_hash };
    },

    // one-time: publish the house viewing key so players can open channels to it
    async register() {
      await ready;
      if (!transfers) throw new Error('needs HOUSE_PRIVATE_KEY and STRK20_PROVER_URL');
      const res = await transfers.build().register().execute({ provingBlockId: await provingBlock() });
      return submit(res.callAndProof);
    },

    close: () => discovery.close(),
  };
}

// The pool client: from the game's own node_modules if it is there, else from vendor/strk20, where
// the Docker image installs it apart (see vendor/strk20/package.json for why).
const VENDOR = new URL('../../vendor/strk20/node_modules/strk20-discovery/dist/', import.meta.url);
export async function loadPoolClient() {
  try {
    return { disc: await import('strk20-discovery/node'), sdk: await import('strk20-discovery/privacy-sdk') };
  } catch (first) {
    try {
      return { disc: await import(new URL('node.js', VENDOR).href), sdk: await import(new URL('privacy-sdk.js', VENDOR).href) };
    } catch (e) {
      const why = e?.code === 'ERR_MODULE_NOT_FOUND' && /strk20-discovery\/dist/.test(String(e?.message)) ? first : e;
      throw new Error(`strk20-discovery did not load on Node ${process.versions.node}: ${String(why?.message ?? why).slice(0, 300)}`);
    }
  }
}

// Nodes for a proof transaction: PROOF_RPC_URL, the built-in ones, then the server's own node.
export function proofNodes(cfg) {
  return [...new Set([...(cfg.proofRpcUrls ?? []), cfg.rpcUrl].filter(Boolean))];
}

// Send a transaction with proof facts through each node in turn until one takes it. A node that
// does not know proof_facts validates the account signature against a hash without them and
// rejects it ('invalid owner sig'). Every try signs the same nonce, so at most one can land.
export async function submitProof({ account, call, details, nodes, log = console, makeAccount = defaultAccount }) {
  let last;
  for (const url of nodes) {
    try {
      const res = await makeAccount(account, url).execute(call, details);
      log.log?.(`STRK20: proof transaction ${res?.transaction_hash ?? ''} sent through ${url}`);
      return res;
    } catch (e) {
      last = e;
      log.warn?.(`STRK20: ${url} did not take the proof transaction: ${shortError(e)}`);
    }
  }
  throw last ?? new Error('STRK20: no node for proof transactions');
}
const defaultAccount = (account, nodeUrl) => new Account({ provider: new RpcProvider({ nodeUrl }), address: account.address, signer: account.signer });
// RPC errors repeat the whole request (the proof is megabytes): keep the node's answer
export function shortError(e) {
  const m = String(e?.message ?? e);
  const tail = m.slice(m.lastIndexOf('\n}') + 2).trim();
  return (tail || m).replace(/\s+/g, ' ').slice(0, 300);
}

// Resource bounds for a pool transaction: twice the current gas prices, and amounts that cover a
// register, a transfer or an invoke with room to spare (the fee charged is what was used).
export const PROOF_TX_GAS = { l1_gas: 0n, l2_gas: 200_000_000n, l1_data_gas: 30_000n };
export async function proofBounds(provider) {
  const b = await provider.getBlockWithTxHashes('latest');
  const price = (p, floor) => {
    const v = BigInt(p?.price_in_fri ?? 0);
    return (v > 0n ? v : floor) * 2n;
  };
  return {
    l1_gas: { max_amount: PROOF_TX_GAS.l1_gas, max_price_per_unit: price(b.l1_gas_price, 10n ** 14n) },
    l2_gas: { max_amount: PROOF_TX_GAS.l2_gas, max_price_per_unit: price(b.l2_gas_price, 10n ** 10n) },
    l1_data_gas: { max_amount: PROOF_TX_GAS.l1_data_gas, max_price_per_unit: price(b.l1_data_gas_price, 10n ** 12n) },
  };
}

// AddressMap from the SDK iterates as [key, value]; plain objects too
function entriesOf(m) {
  if (!m) return [];
  if (typeof m.entries === 'function') return [...m.entries()];
  return Object.entries(m);
}
