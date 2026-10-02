// Bridges in and out of Starknet through NEAR Intents' 1Click API: ~35 chains (Bitcoin, Ethereum and
// its L2s, Solana, BNB, Tron, TON, Doge, XRP, Cardano, …). The player gets a deposit address on the
// chain they send from; solvers deliver on the other side. Our server only proxies the API, adds
// our fee (appFees, paid out inside Intents to BRIDGE_FEE_RECIPIENT) and makes sure a bridge into
// Starknet pays the signed-in player's own address, and one out of it refunds to it.
//
//   GET  /api/bridge/info      what is on: fee, chains
//   GET  /api/bridge/tokens    the token list (cached)
//   POST /api/bridge/quote     { dir: 'in'|'out', originAsset, destinationAsset, amount, refundTo?, recipient?, dry? }
//   GET  /api/bridge/status?depositAddress=…[&depositMemo=…]
//   POST /api/bridge/submit    { txHash, depositAddress }  (speeds things up after sending)
//
// Env: ONECLICK_URL (default https://1click.chaindefuser.com), ONECLICK_JWT (partner key: no 1Click
// fee on top), BRIDGE_FEE_RECIPIENT (an account inside NEAR Intents, e.g. yourname.near),
// BRIDGE_FEE_BPS (our fee in basis points, default 25 = 0.25%, at most 100), BRIDGE=0 turns it off.
export function createBridge({ env = process.env, accountFor, fetchImpl = fetch, now = () => Date.now(), log = console } = {}) {
  if (env.BRIDGE === '0') return null;
  const base = (env.ONECLICK_URL || 'https://1click.chaindefuser.com').replace(/\/$/, '');
  const jwt = env.ONECLICK_JWT || null;
  const feeTo = env.BRIDGE_FEE_RECIPIENT || null;
  const feeBps = feeTo ? Math.max(0, Math.min(100, Math.round(Number(env.BRIDGE_FEE_BPS ?? 25)))) : 0;
  let tokens = null;
  let tokensAt = 0;

  async function call(path, { method = 'GET', body = null, query = null } = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== '') url.searchParams.set(k, v);
    const res = await fetchImpl(url.href, {
      method,
      headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 200) };
    }
    if (!res.ok) throw Object.assign(new Error(data?.message || `bridge ${res.status}`), { status: res.status, user: true });
    return data;
  }

  async function tokenList() {
    if (tokens && now() - tokensAt < 10 * 60 * 1000) return tokens;
    tokens = await call('/v0/tokens');
    tokensAt = now();
    return tokens;
  }

  const byId = async (id) => (await tokenList()).find((t) => t.assetId === id) ?? null;

  // the request a player may make: their own address on the Starknet side, our fee on top
  async function quote(account, q) {
    const dir = q.dir === 'out' ? 'out' : 'in';
    const from = await byId(String(q.originAsset ?? ''));
    const to = await byId(String(q.destinationAsset ?? ''));
    if (!from || !to) throw Object.assign(new Error('Unknown token.'), { user: true });
    if (dir === 'in' && to.blockchain !== 'starknet') throw Object.assign(new Error('A bridge in lands on Starknet.'), { user: true });
    if (dir === 'out' && from.blockchain !== 'starknet') throw Object.assign(new Error('A bridge out starts on Starknet.'), { user: true });
    const amount = String(q.amount ?? '');
    if (!/^[1-9][0-9]{0,40}$/.test(amount)) throw Object.assign(new Error('Type an amount.'), { user: true });
    const other = String(dir === 'in' ? q.refundTo ?? '' : q.recipient ?? '').trim();
    if (!other || other.length > 200) throw Object.assign(new Error(dir === 'in' ? 'Type your address on the chain you send from (for refunds).' : 'Type the address that receives it.'), { user: true });
    const body = {
      dry: !!q.dry,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100, // 1%
      originAsset: from.assetId,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: to.assetId,
      amount,
      refundTo: dir === 'in' ? other : account,
      refundType: 'ORIGIN_CHAIN',
      recipient: dir === 'in' ? account : other,
      recipientType: 'DESTINATION_CHAIN',
      deadline: new Date(now() + (from.blockchain === 'btc' ? 3 : 1) * 3600 * 1000).toISOString(),
      referral: 'darkbags',
      quoteWaitingTimeMs: 3000,
      ...(feeBps ? { appFees: [{ recipient: feeTo, fee: feeBps }] } : {}),
    };
    const r = await call('/v0/quote', { method: 'POST', body });
    const qt = r.quote ?? {};
    return {
      dir,
      from: { assetId: from.assetId, symbol: from.symbol, chain: from.blockchain, decimals: from.decimals, contractAddress: from.contractAddress ?? null },
      to: { assetId: to.assetId, symbol: to.symbol, chain: to.blockchain, decimals: to.decimals, contractAddress: to.contractAddress ?? null },
      depositAddress: qt.depositAddress ?? null,
      depositMemo: qt.depositMemo ?? null,
      amountIn: qt.amountIn,
      amountInFormatted: qt.amountInFormatted,
      amountInUsd: qt.amountInUsd,
      amountOut: qt.amountOut,
      amountOutFormatted: qt.amountOutFormatted,
      amountOutUsd: qt.amountOutUsd,
      minAmountOut: qt.minAmountOut,
      deadline: qt.deadline ?? null,
      timeEstimate: qt.timeEstimate ?? null,
      feeBps,
      recipient: body.recipient,
      refundTo: body.refundTo,
    };
  }

  const routes = {
    'GET /api/bridge/info': async (req, res, { reply }) => reply(200, { on: true, feeBps }),
    'GET /api/bridge/tokens': async (req, res, { reply }) => reply(200, { tokens: (await tokenList()).map(({ assetId, symbol, blockchain, decimals, price, contractAddress }) => ({ assetId, symbol, blockchain, decimals, price, contractAddress })) }),
    'POST /api/bridge/quote': async (req, res, { reply, json, session }) => {
      const account = accountFor(session);
      if (!account) return reply(401, { error: 'Sign in first.' });
      reply(200, await quote(account, await json()));
    },
    'GET /api/bridge/status': async (req, res, { reply, url }) => {
      const depositAddress = url.searchParams.get('depositAddress');
      if (!depositAddress) return reply(400, { error: 'depositAddress' });
      const r = await call('/v0/status', { query: { depositAddress, depositMemo: url.searchParams.get('depositMemo') } });
      reply(200, { status: r.status, updatedAt: r.updatedAt ?? null, details: r.swapDetails ?? null });
    },
    'POST /api/bridge/submit': async (req, res, { reply, json, session }) => {
      if (!accountFor(session)) return reply(401, { error: 'Sign in first.' });
      const b = await json();
      if (!b?.txHash || !b?.depositAddress) return reply(400, { error: 'txHash, depositAddress' });
      await call('/v0/deposit/submit', { method: 'POST', body: { txHash: String(b.txHash), depositAddress: String(b.depositAddress) } }).catch((e) => log.warn('bridge submit', e?.message));
      reply(200, { ok: true });
    },
  };

  // one entry point for the HTTP server: returns true when it handled the request
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    const reply = (code, body) => res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }).end(JSON.stringify(body));
    const json = () =>
      new Promise((resolve, reject) => {
        let s = '';
        req.on('data', (c) => {
          s += c;
          if (s.length > 20000) req.destroy();
        });
        req.on('end', () => {
          try {
            resolve(JSON.parse(s || '{}'));
          } catch (e) {
            reject(Object.assign(e, { user: true }));
          }
        });
      });
    try {
      await route(req, res, { reply, json, url, session: String(req.headers['x-darkbags-session'] ?? '') });
    } catch (e) {
      if (!e?.user) log.error('bridge', e);
      reply(e?.status && e.status < 500 ? 400 : e?.user ? 400 : 502, { error: e?.user ? e.message : 'The bridge did not answer. Try again in a minute.' });
    }
    return true;
  }

  return { handle, quote, feeBps };
}
