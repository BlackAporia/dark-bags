// Starknet side of the cashier, built on Starkzap (wallets, tokens, transfers,
// swap quotes, paymaster) with the STRK20 pool from ./strk20.js.
import { hash, num } from 'starknet';
import { normAddr } from './cashier.js';
import { resolveTokens } from './config.js';
import { createStrk20 } from './strk20.js';

const TRANSFER = normAddr(hash.getSelectorFromName('Transfer'));

export async function createStarknetChain({ cfg, starkzap, log = console }) {
  const { StarkZap, StarkSigner, Amount, fromAddress, EkuboSwapProvider, ChainId, mainnetTokens, sepoliaTokens, networks } = starkzap;
  const mainnet = cfg.network === 'mainnet';
  const chainId = mainnet ? ChainId.MAINNET : ChainId.SEPOLIA;
  // the first node that answers on the right chain; the rest stay as spares for the browser
  const nodes = [...new Set([cfg.rpcUrl || networks[cfg.network].rpcUrl, ...(cfg.rpcFallbacks ?? [])])];
  const rpcUrl = (await pickNode(nodes, mainnet ? 'SN_MAIN' : 'SN_SEPOLIA', log)) ?? nodes[0];
  cfg = { ...cfg, rpcUrl }; // the STRK20 pool and the prover use the same node
  const sdk = new StarkZap({
    network: cfg.network,
    rpcUrl,
    explorer: { provider: 'voyager' },
    ...(cfg.paymaster ? { paymaster: { nodeUrl: cfg.paymaster.url, headers: { 'x-paymaster-api-key': cfg.paymaster.apiKey } } } : {}),
  });
  const provider = sdk.getProvider();
  const tokens = resolveTokens(cfg, mainnet ? mainnetTokens : sepoliaTokens, normAddr);
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const house = normAddr(cfg.house);
  if (!house) throw new Error('HOUSE_ADDRESS is required when CHAIN is on');

  // the house wallet: signs payouts (and the gasless fee mode if a paymaster key is set)
  let wallet = null;
  if (cfg.houseKey) {
    wallet = await sdk.connectWallet({
      account: { signer: new StarkSigner(cfg.houseKey) },
      accountAddress: fromAddress(house), // an existing account (Ready, Braavos, OZ…), not a derived one
      ...(cfg.paymaster ? { feeMode: { type: 'paymaster' } } : {}),
    });
    if (normAddr(wallet.address) !== house) log.warn(`HOUSE_PRIVATE_KEY opens ${wallet.address}, not HOUSE_ADDRESS; payouts will come from ${wallet.address}`);
  } else log.warn('cashier: no HOUSE_PRIVATE_KEY, deposits only (cash-outs are off)');

  // the fortune wheel's wallet, apart from the house: jackpots go out from it
  let fortuneWallet = null;
  if (cfg.fortune) {
    try {
      fortuneWallet = await sdk.connectWallet({ account: { signer: new StarkSigner(cfg.fortune.key) }, accountAddress: fromAddress(normAddr(cfg.fortune.address)), ...(cfg.paymaster ? { feeMode: { type: 'paymaster' } } : {}) });
      log.log?.(`cashier: fortune wallet ${fortuneWallet.address}`);
    } catch (e) {
      log.error('fortune wallet failed to connect; jackpots will be credited in game', e?.message ?? e);
    }
  }

  const account = wallet?.getAccount();
  const strk20 = await createStrk20({ cfg, account: account ?? { address: house }, provider, log }).catch((e) => {
    log.error('STRK20 setup failed', e?.message ?? e);
    return null;
  });

  const routes = [];
  if (strk20) routes.push('private');
  routes.push('public');
  const ekubo = new EkuboSwapProvider();
  const feeMode = cfg.paymaster ? { type: 'paymaster' } : undefined;

  const chain = {
    tokens,
    sdk,
    wallet,
    strk20,
    fortuneAddress: cfg.fortune ? normAddr(cfg.fortune.address) : null,

    info: () => ({
      network: cfg.network,
      chainId: cfg.chainId,
      rpcUrl: cfg.clientRpcUrl || networks[cfg.network].rpcUrl,
      rpcUrls: [...new Set([cfg.clientRpcUrl || networks[cfg.network].rpcUrl, ...(cfg.rpcFallbacks ?? [])])],
      house,
      pool: strk20?.pool ?? null,
      routes,
      cashOut: { private: !!strk20?.canPay, public: !!wallet },
      paymaster: !!cfg.paymaster,
      explorer: mainnet ? 'https://voyager.online' : 'https://sepolia.voyager.online',
      tokens: tokens.map(({ id, symbol, decimals, color, name }) => ({ id, symbol, decimals, color, name })),
      login: { wallets: true, cartridge: cfg.cartridge, privy: cfg.privy ? { appId: cfg.privy.appId, clientId: cfg.privy.clientId } : null },
    }),

    async verifySignature(address, typedData, signature) {
      return provider.verifyMessageInStarknet(typedData, signature, address);
    },

    // ERC-20 Transfer events into the house inside one successful transaction
    async readPublicDeposit(tx) {
      let rc;
      try {
        rc = await provider.channel.getTransactionReceipt(tx);
      } catch (e) {
        if (/not found|25:|29:/i.test(String(e?.message))) return { status: 'pending', transfers: [] };
        throw e;
      }
      if (rc.execution_status === 'REVERTED') return { status: 'failed', transfers: [] };
      if (rc.finality_status !== 'ACCEPTED_ON_L2' && rc.finality_status !== 'ACCEPTED_ON_L1') return { status: 'pending', transfers: [] };
      const transfers = [];
      (rc.events ?? []).forEach((ev, i) => {
        const token = normAddr(ev.from_address);
        if (!byId.has(token) || normAddr(ev.keys?.[0]) !== TRANSFER) return;
        // Cairo 1 tokens index from/to as keys; legacy ones put everything in data
        const [from, to, lo, hi] = ev.keys.length >= 3 ? [ev.keys[1], ev.keys[2], ev.data[0], ev.data[1]] : [ev.data[0], ev.data[1], ev.data[2], ev.data[3]];
        if (normAddr(to) !== house) return;
        const amount = BigInt(lo ?? 0) + (BigInt(hi ?? 0) << 128n);
        if (amount > 0n) transfers.push({ id: `${num.toHex(tx)}:${i}`, token, from: normAddr(from), amount });
      });
      return { status: 'ok', transfers };
    },

    async scanPrivateDeposits() {
      return strk20 ? strk20.scan() : [];
    },

    async payPublic({ token, to, amount }) {
      if (!wallet) throw Object.assign(new Error('house key not configured'), { notSent: true });
      const t = byId.get(token);
      const transfers = [{ to: fromAddress(to), amount: Amount.fromRaw(amount, t) }];
      // simulate first: a payout that would fail is refunded instead of held for review
      const calls = [wallet.erc20(t).populateTransfer(transfers)].flat();
      const pre = await wallet.preflight({ calls, feeMode }).catch((e) => ({ ok: false, reason: e?.message }));
      if (!pre.ok) throw Object.assign(new Error(`preflight: ${pre.reason}`), { notSent: true });
      const tx = await wallet.transfer(t, transfers, feeMode ? { feeMode } : undefined);
      return { tx: tx.hash };
    },

    // a coin from the AVNU / Ekubo lists joins the table tokens (deposits, prices, stakes, cash-outs)
    addToken({ address, symbol, name, decimals }) {
      const id = normAddr(address);
      if (!id) return null;
      if (byId.has(id)) return byId.get(id);
      const t = { name: name || symbol, symbol, decimals, address: fromAddress(id), id, color: '#8d93a6', btc: /BTC/i.test(symbol), imported: true };
      tokens.push(t);
      byId.set(id, t);
      return t;
    },

    // a fortune jackpot straight from the fortune wallet to the winner's address
    ...(fortuneWallet
      ? {
          async payFortune({ token, to, amount }) {
            const t = byId.get(token);
            if (!t) throw new Error('unknown token');
            const transfers = [{ to: fromAddress(to), amount: Amount.fromRaw(amount, t) }];
            const calls = [fortuneWallet.erc20(t).populateTransfer(transfers)].flat();
            const pre = await fortuneWallet.preflight({ calls, feeMode }).catch((e) => ({ ok: false, reason: e?.message }));
            if (!pre.ok) throw new Error(`preflight: ${pre.reason}`);
            const tx = await fortuneWallet.transfer(t, transfers, feeMode ? { feeMode } : undefined);
            return { tx: tx.hash };
          },
        }
      : {}),

    async payPrivate(a) {
      if (!strk20) throw Object.assign(new Error('private pool off'), { notSent: true });
      return strk20.pay(a);
    },

    // amountOut in tokenOut base units for amountIn base units of tokenIn
    async quote({ tokenIn, tokenOut, amountIn }) {
      const q = await ekubo.getQuote({ chainId, tokenIn, tokenOut, amountIn: Amount.fromRaw(amountIn, tokenIn) });
      return q.amountOutBase;
    },

    async houseBalances() {
      if (!wallet) return {};
      const out = {};
      for (const t of tokens) out[t.id] = (await wallet.balanceOf(t)).toBase().toString();
      return out;
    },

    // what the fortune wallet holds (the analytics page); {} without one
    async fortuneBalances() {
      if (!fortuneWallet) return {};
      const out = {};
      for (const t of tokens) out[t.id] = (await fortuneWallet.balanceOf(t)).toBase().toString();
      return out;
    },
  };
  return chain;
}

// Ask each node for its chain id (5 s each) and take the first that answers with the right one.
const felt = (s) => `0x${[...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')}`;
export async function pickNode(nodes, chainId, log = console, fetchImpl = fetch) {
  for (const url of nodes) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'starknet_chainId', params: [] }),
        signal: AbortSignal.timeout(5000),
      });
      const id = (await res.json())?.result;
      if (id && BigInt(id) === BigInt(felt(chainId))) {
        if (url !== nodes[0]) log.warn(`cashier: ${nodes[0]} did not answer, using ${url}`);
        return url;
      }
      log.warn(`cashier: ${url} is on another chain (${id})`);
    } catch (e) {
      log.warn(`cashier: ${url} did not answer (${e?.message ?? e})`);
    }
  }
  log.error('cashier: no Starknet node answered; trying the first one anyway');
  return null;
}
