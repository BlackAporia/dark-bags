// Wallet layer for real-token mode, bundled on its own (scripts/build-wallets.js →
// client/vendor/wallets.js) and loaded only when a player opens the cashier.
//
// Every way in ends up as the same small facade:
//   { kind, name, icon, address, strk20, signTypedData(td), depositPublic(t, units, house),
//     depositPrivate(t, units, house), balance(t), send(t, to, units), execute(calls), disconnect() }
// and swaps in the player's own wallet go through AVNU (Starkzap's AvnuSwapProvider):
//   avnuQuote(chain, facade, tIn, tOut, units)  avnuSwap(chain, facade, tIn, tOut, units, slippageBps)
//
//   extension  any Starknet wallet found by get-starknet v6: wallet-standard wallets
//              (Ready, Braavos, Xverse, OKX, Keplr, …), injected window.starknet_* and
//              MetaMask through its Starknet snap. Privacy-enabled wallets do STRK20.
//   cartridge  Cartridge Controller through Starkzap: passkeys or social login, gasless
//   privy      email / Google / X / Discord through Privy; the Starknet key sits in a
//              Privy server wallet that our server signs with (Starkzap PrivySigner)
import { createStore } from '@starknet-io/get-starknet-discovery';
import { wallets as KNOWN_WALLETS } from '@starknet-io/get-starknet-wallets';
import { StarkZap, OnboardStrategy, Amount, fromAddress, AvnuSwapProvider, ChainId } from 'starkzap';
import Privy, { LocalStorage } from '@privy-io/js-sdk-core';
import { RpcProvider } from 'starknet';

const hex = (v) => `0x${BigInt(v).toString(16)}`;
const tokenOf = (t) => ({ name: t.name ?? t.symbol, symbol: t.symbol, decimals: t.decimals, address: fromAddress(t.id) });

// What an address holds of a token, read straight from the chain (any sign-in kind), so
// the cashier can show "in your wallet" and stop a deposit the wallet cannot cover.
const providers = new Map();
export async function walletBalance(chain, t, address) {
  if (!providers.has(chain.rpcUrl)) providers.set(chain.rpcUrl, new RpcProvider({ nodeUrl: chain.rpcUrl }));
  const r = await providers.get(chain.rpcUrl).callContract({ contractAddress: t.id, entrypoint: 'balanceOf', calldata: [address] });
  return BigInt(r[0]) + (BigInt(r[1] ?? 0) << 128n);
}

// ------------------------------------------------------------ extensions

let store = null;
export function listWallets() {
  store ??= createStore();
  const found = store.getWallets().map((w) => ({ id: w.name, name: w.name, icon: typeof w.icon === 'string' ? w.icon : '', installed: true, wallet: w }));
  const have = new Set(found.map((w) => w.name.toLowerCase()));
  const missing = KNOWN_WALLETS.filter((k) => !have.has(k.name.toLowerCase()) && !have.has(k.id.toLowerCase())).map((k) => ({
    id: k.id,
    name: k.name,
    icon: k.icon,
    installed: false,
    download: Object.values(k.downloads ?? {})[0] ?? null,
  }));
  return [...found, ...missing];
}

export function onWalletsChanged(fn) {
  store ??= createStore();
  return store.subscribe(() => fn(listWallets()));
}

export async function connectExtension(entry) {
  const w = entry.wallet;
  const api = w.features['starknet:walletApi'];
  const request = (type, params) => api.request(params === undefined ? { type } : { type, params });
  // wallet-standard connect takes an input object; some wallets (Ready X) destructure it
  // without a default and throw on a bare connect()
  await w.features['standard:connect'].connect({ silent: false });
  const [address] = await request('wallet_requestAccounts', {});
  if (!address) throw new Error('The wallet shared no account.');
  let strk20 = null; // unknown until tried; set on first use
  const facade = {
    kind: 'extension',
    name: w.name,
    icon: entry.icon,
    address,
    get strk20() {
      return strk20;
    },
    signTypedData: (td) => request('wallet_signTypedData', td),
    async depositPublic(t, units, house) {
      const r = await request('wallet_addInvokeTransaction', {
        calls: [{ contract_address: t.id, entry_point: 'transfer', calldata: [house, hex(units & ((1n << 128n) - 1n)), hex(units >> 128n)] }],
      });
      return r.transaction_hash;
    },
    // a private transfer inside the STRK20 pool: amount and sender stay hidden on chain
    async depositPrivate(t, units, house) {
      try {
        const r = await request('wallet_strk20InvokeTransaction', { actions: [{ type: 'transfer', token: t.id, amount: hex(units), recipient: house }] });
        strk20 = true;
        return r.transaction_hash;
      } catch (e) {
        if (e?.code === 118) throw new Error('Register this wallet in the STRK20 privacy pool first (the wallet does it on your first shield).');
        if (e?.code === 119) throw new Error(`Not enough private ${t.symbol}. Shield some first.`);
        if (e?.code === -32601 || /not (supported|found)|unknown method/i.test(String(e?.message))) {
          strk20 = false;
          throw new Error(`${w.name} does not do STRK20 private transfers. Use a public deposit or a privacy wallet (Ready, Xverse).`);
        }
        throw e;
      }
    },
    async privateBalances() {
      const r = await request('wallet_strk20Balances', { tokens: [] });
      strk20 = true;
      return Object.fromEntries(r.map((b) => [b.token, BigInt(b.balance)]));
    },
    balance: null, // extensions show balances themselves
    send: null,
    async execute(calls) {
      const r = await request('wallet_addInvokeTransaction', {
        calls: calls.map((c) => ({ contract_address: c.contractAddress, entry_point: c.entrypoint, calldata: (c.calldata ?? []).map((x) => hex(x)) })),
      });
      return r.transaction_hash;
    },
    disconnect: async () => w.features['standard:disconnect']?.disconnect?.(),
  };
  return facade;
}

// --------------------------------------------------------------- Starkzap

function sdkFor(chain, session, base) {
  return new StarkZap({
    network: chain.network,
    rpcUrl: chain.rpcUrl,
    explorer: { provider: 'voyager' },
    // our server proxies the paymaster (key stays server-side, only deposits are sponsored)
    ...(chain.paymaster ? { paymaster: { nodeUrl: new URL('/api/paymaster', base).href, headers: { 'x-darkbags-session': session } } } : {}),
  });
}

function starkzapFacade(kind, name, wallet, chain) {
  const feeMode = chain.paymaster ? { type: 'paymaster' } : undefined;
  return {
    kind,
    name,
    icon: '',
    address: String(wallet.address),
    strk20: false,
    signTypedData: (td) => wallet.signMessage(td),
    async depositPublic(t, units, house) {
      await wallet.ensureReady({ deploy: 'if_needed', ...(feeMode ? { feeMode } : {}) });
      const tx = await wallet.transfer(tokenOf(t), [{ to: fromAddress(house), amount: Amount.fromRaw(units, tokenOf(t)) }], feeMode ? { feeMode } : undefined);
      return tx.hash;
    },
    depositPrivate: null,
    balance: async (t) => (await wallet.balanceOf(tokenOf(t))).toBase(),
    async send(t, to, units) {
      await wallet.ensureReady({ deploy: 'if_needed' });
      const tx = await wallet.transfer(tokenOf(t), [{ to: fromAddress(to), amount: Amount.fromRaw(units, tokenOf(t)) }]);
      return tx.hash;
    },
    async execute(calls) {
      await wallet.ensureReady({ deploy: 'if_needed', ...(feeMode ? { feeMode } : {}) });
      const tx = await wallet.execute(calls, feeMode ? { feeMode } : undefined);
      return tx.hash;
    },
    disconnect: async () => wallet.disconnect?.(),
  };
}

export async function connectCartridge(chain, session, base) {
  const sdk = sdkFor(chain, session, base);
  // pre-approve deposits so they go through without a popup each time
  const policies = chain.tokens.map((t) => ({ target: t.id, method: 'transfer' }));
  const { wallet } = await sdk.onboard({ strategy: OnboardStrategy.Cartridge, cartridge: { policies }, deploy: 'if_needed' });
  const name = (await wallet.username?.().catch(() => null)) || 'Cartridge';
  return starkzapFacade('cartridge', name, wallet, chain);
}

// ------------------------------------------------------------------ Privy

let privy = null;
function privyClient(cfg) {
  privy ??= new Privy({ appId: cfg.appId, ...(cfg.clientId ? { clientId: cfg.clientId } : {}), storage: new LocalStorage() });
  return privy;
}

export const privyAuth = {
  async sendCode(cfg, email) {
    await privyClient(cfg).auth.email.sendCode(email);
  },
  async loginWithCode(cfg, email, code) {
    await privyClient(cfg).auth.email.loginWithCode(email, code);
    return privyClient(cfg).getAccessToken();
  },
  // Google / X / Discord / … : full-page redirect back here with ?privy_oauth_code
  async startOAuth(cfg, provider) {
    const back = location.origin + location.pathname;
    const { url } = await privyClient(cfg).auth.oauth.generateURL(provider, back);
    location.assign(url);
  },
  async finishOAuth(cfg) {
    const q = new URLSearchParams(location.search);
    const code = q.get('privy_oauth_code');
    const state = q.get('privy_oauth_state');
    const provider = q.get('privy_oauth_provider') ?? undefined;
    if (!code || !state) return null;
    history.replaceState(null, '', location.pathname);
    await privyClient(cfg).auth.oauth.loginWithCode(code, state, provider);
    return privyClient(cfg).getAccessToken();
  },
  token: (cfg) => privyClient(cfg).getAccessToken(),
  logout: async (cfg) => privyClient(cfg).auth.logout?.(),
};

export async function connectPrivy(chain, session, { walletId, publicKey }, base) {
  const cfg = chain.login.privy;
  const sdk = sdkFor(chain, session, base);
  const { wallet } = await sdk.onboard({
    strategy: OnboardStrategy.Privy,
    deploy: 'never', // deployed on the first deposit (gasless when the server has a paymaster)
    privy: {
      resolve: async () => ({
        walletId,
        publicKey,
        serverUrl: new URL('/api/privy/sign', base).href,
        headers: async () => ({ authorization: `Bearer ${await privyAuth.token(cfg)}` }),
      }),
    },
  });
  return starkzapFacade('privy', 'Privy', wallet, chain);
}

// ------------------------------------------------------------------ AVNU
// Swaps between tokens in the player's own wallet, routed by AVNU across Starknet DEXs.
let avnu = null;
const avnuRequest = (chain, facade, tIn, tOut, units, slippageBps = 50n) => ({
  chainId: chain.network === 'mainnet' ? ChainId.MAINNET : ChainId.SEPOLIA,
  takerAddress: fromAddress(facade.address),
  tokenIn: tokenOf(tIn),
  tokenOut: tokenOf(tOut),
  amountIn: Amount.fromRaw(BigInt(units), tokenOf(tIn)),
  slippageBps: BigInt(slippageBps),
});

export async function avnuQuote(chain, facade, tIn, tOut, units) {
  avnu ??= new AvnuSwapProvider();
  const q = await avnu.getQuote(avnuRequest(chain, facade, tIn, tOut, units));
  return { in: q.amountInBase, out: q.amountOutBase, impactBps: q.priceImpactBps ?? null };
}

export async function avnuSwap(chain, facade, tIn, tOut, units, slippageBps = 50n) {
  avnu ??= new AvnuSwapProvider();
  const prepared = await avnu.prepareSwap(avnuRequest(chain, facade, tIn, tOut, units, slippageBps));
  return { tx: await facade.execute(prepared.calls), out: prepared.quote.amountOutBase };
}
