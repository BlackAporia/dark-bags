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

import { normAddr } from './cashier.js';

export async function createStrk20({ cfg, account, provider, log = console }) {
  const s = cfg.strk20;
  if (!s.pool || !s.viewingKey) {
    log.warn('STRK20: set STRK20_VIEWING_KEY (and STRK20_POOL off mainnet) to take private deposits');
    return null;
  }
  let disc, sdk;
  try {
    disc = await import('strk20-discovery/node');
    sdk = await import('strk20-discovery/privacy-sdk');
  } catch (e) {
    log.warn(`STRK20: private pool off (${e?.code === 'ERR_MODULE_NOT_FOUND' ? 'install strk20-discovery on Node 24+' : e?.message})`);
    return null;
  }

  const discovery = new disc.NodeDiscoveryProvider({
    network: cfg.network,
    feedUrl: s.feedUrl,
    cacheDirectory: s.cacheDir,
    rpcUrl: cfg.rpcUrl ?? undefined,
  });
  await discovery.ready;
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
  async function submit(callAndProof) {
    const { call, proof } = callAndProof;
    const extra = proof?.proofFacts?.length ? { proof: proof.data, proofFacts: proof.proofFacts } : {};
    try {
      return await account.execute(call, { tip: 0n, ...extra });
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
    async invokeWithOpenNote({ token, to, contract, calldata }) {
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
      if (!transfers) throw new Error('needs HOUSE_PRIVATE_KEY and STRK20_PROVER_URL');
      const res = await transfers.build().register().execute({ provingBlockId: await provingBlock() });
      return submit(res.callAndProof);
    },

    close: () => discovery.close(),
  };
}

// AddressMap from the SDK iterates as [key, value]; plain objects too
function entriesOf(m) {
  if (!m) return [];
  if (typeof m.entries === 'function') return [...m.entries()];
  return Object.entries(m);
}
