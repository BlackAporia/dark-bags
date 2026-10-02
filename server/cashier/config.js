// Env → cashier config. Nothing here talks to the network.
//
// CHAIN                 off (default: test tokens) | sepolia | mainnet
// RPC_URL               Starknet JSON-RPC for the server (default: Starkzap's preset)
// RPC_FALLBACKS         more RPC URLs, comma separated, tried in order when the first does not answer
//                       (built in: Cartridge's v0_10 endpoint on mainnet)
// CLIENT_RPC_URL        RPC the browser uses for Starkzap wallets (default: same preset)
// HOUSE_ADDRESS         the house account (receives deposits, pays withdrawals)
// HOUSE_PRIVATE_KEY     its Stark key; without it the cashier takes deposits but cannot pay out
// TOKENS                comma list of preset symbols (default STRK,ETH,USDC,USDT,WBTC)
// EXTRA_TOKENS          SYMBOL:0xaddress:decimals[:btc],... for tokens missing from the presets (e.g. strkBTC)
// FIXED_PRICES          SYMBOL=usdPerToken,... (e.g. STRK=0.15) overrides the swap-quote feed (handy on Sepolia)
// PRICE_SECONDS         feed refresh (60)
// MIN_WITHDRAW_USD      smallest cash-out in $ (1)
// CASHIER_FILE          JSON journal: ledger, sessions, deposits, withdrawals (required on real networks)
// STRK20 private pool:  STRK20_POOL (mainnet default below), STRK20_VIEWING_KEY, STRK20_PROVER_URL,
//                       STRK20_FEED_URL, STRK20_CACHE_DIR
// Paymaster (gasless):  PAYMASTER_URL (default AVNU), PAYMASTER_API_KEY
// Privy sign-in:        PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_CLIENT_ID (optional)
// Cartridge:            CARTRIDGE=0 hides the Cartridge button

export const STRK20_POOL_MAINNET = '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a';
export const STRK20_FEED = {
  mainnet: 'https://strk20.nullref.cc/mainnet/feed',
  sepolia: 'https://strk20.nullref.cc/sepolia/feed',
};
// spare nodes, tried after RPC_URL / the preset when they do not answer
export const RPC_SPARES = {
  mainnet: ['https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10'],
  sepolia: [],
};
export const AVNU_PAYMASTER = {
  mainnet: 'https://starknet.paymaster.avnu.fi',
  sepolia: 'https://sepolia.paymaster.avnu.fi',
};

const COLORS = { STRK: '#ec796b', ETH: '#8c93ff', USDC: '#2775ca', USDT: '#26a17b', WBTC: '#f7931a', STRKBTC: '#f2a900', LBTC: '#c9a227', TBTC: '#e7b53b', SOLVBTC: '#e99a2c' };
const BTC_PEGGED = new Set(['WBTC', 'STRKBTC', 'LBTC', 'TBTC', 'SOLVBTC']);

const list = (s) =>
  String(s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function readConfig(env = process.env) {
  const network = String(env.CHAIN || 'off').toLowerCase();
  if (network === 'off' || network === '0' || network === '') return null;
  if (network !== 'mainnet' && network !== 'sepolia') throw new Error(`CHAIN must be off, sepolia or mainnet (got ${env.CHAIN})`);
  const fixedPrices = {};
  for (const kv of list(env.FIXED_PRICES)) {
    const [k, v] = kv.split('=');
    if (k && Number(v) > 0) fixedPrices[k.trim().toUpperCase()] = Number(v);
  }
  const extraTokens = list(env.EXTRA_TOKENS).map((spec) => {
    const [symbol, address, decimals, flag] = spec.split(':');
    if (!symbol || !address || !(Number(decimals) >= 0)) throw new Error(`EXTRA_TOKENS entry "${spec}" should be SYMBOL:0xaddress:decimals[:btc]`);
    return { symbol, address, decimals: Number(decimals), btc: flag === 'btc' };
  });
  return {
    network,
    chainId: network === 'mainnet' ? 'SN_MAIN' : 'SN_SEPOLIA',
    rpcUrl: env.RPC_URL || null,
    rpcFallbacks: [...list(env.RPC_FALLBACKS), ...RPC_SPARES[network]],
    clientRpcUrl: env.CLIENT_RPC_URL || null,
    house: env.HOUSE_ADDRESS || null,
    houseKey: env.HOUSE_PRIVATE_KEY || null,
    // the fortune wheel's own wallet: jackpots are sent from it on chain (else credited in game)
    fortune: env.FORTUNE_ADDRESS && env.FORTUNE_PRIVATE_KEY ? { address: env.FORTUNE_ADDRESS, key: env.FORTUNE_PRIVATE_KEY } : null,
    tokens: list(env.TOKENS || 'STRK,ETH,USDC,USDT,WBTC').map((s) => s.toUpperCase()),
    extraTokens,
    fixedPrices,
    priceSeconds: Number(env.PRICE_SECONDS || 60),
    minWithdrawUsd: Number(env.MIN_WITHDRAW_USD || 1),
    file: env.CASHIER_FILE || null,
    // launch guards: closed-beta address list, $ caps per player and for the whole house,
    // and the pause switch file (defaults to <CASHIER_FILE>.paused)
    allow: list(env.ALLOWLIST),
    // the $ caps guard real money: Sepolia test tokens are worth nothing, so there deposits
    // are never capped (set SEPOLIA_CAPS=1 to rehearse the mainnet caps on testnet)
    maxBalanceUsd: network === 'sepolia' && env.SEPOLIA_CAPS !== '1' ? 0 : Number(env.MAX_BALANCE_USD || 0),
    maxTotalUsd: network === 'sepolia' && env.SEPOLIA_CAPS !== '1' ? 0 : Number(env.MAX_TOTAL_USD || 0),
    pauseFile: env.PAUSE_FILE || (env.CASHIER_FILE ? `${env.CASHIER_FILE}.paused` : null),
    strk20: {
      pool: env.STRK20_POOL || (network === 'mainnet' ? STRK20_POOL_MAINNET : null),
      viewingKey: env.STRK20_VIEWING_KEY || null,
      proverUrl: env.STRK20_PROVER_URL || null,
      feedUrl: env.STRK20_FEED_URL || STRK20_FEED[network],
      cacheDir: env.STRK20_CACHE_DIR || '.strk20-cache',
    },
    paymaster: env.PAYMASTER_API_KEY ? { url: env.PAYMASTER_URL || AVNU_PAYMASTER[network], apiKey: env.PAYMASTER_API_KEY } : null,
    privy: env.PRIVY_APP_ID && env.PRIVY_APP_SECRET ? { appId: env.PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET, clientId: env.PRIVY_CLIENT_ID || null } : null,
    cartridge: env.CARTRIDGE !== '0',
  };
}

// Token list from Starkzap's presets plus EXTRA_TOKENS. Returns Starkzap Token objects
// with our display fields; id is the normalized address.
export function resolveTokens(cfg, presets, norm) {
  const out = [];
  const byUpper = new Map(Object.entries(presets).map(([k, t]) => [k.toUpperCase(), t]));
  for (const sym of cfg.tokens) {
    const t = byUpper.get(sym);
    if (!t) {
      console.warn(`cashier: no ${cfg.network} preset for ${sym}; add it with EXTRA_TOKENS`);
      continue;
    }
    out.push({ ...t, id: norm(t.address), color: COLORS[sym] ?? '#8d93a6', btc: BTC_PEGGED.has(sym) });
  }
  for (const e of cfg.extraTokens) {
    const up = e.symbol.toUpperCase();
    out.push({ name: e.symbol, symbol: e.symbol, address: norm(e.address), decimals: e.decimals, id: norm(e.address), color: COLORS[up] ?? '#8d93a6', btc: e.btc || BTC_PEGGED.has(up) });
  }
  const seen = new Set();
  return out.filter((t) => t.id && !seen.has(t.id) && seen.add(t.id));
}
