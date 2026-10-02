// Privy sign-in (email or social login, no extension needed).
//
// The player logs in with Privy in the browser and hands us the access token. We
// verify it, create (once) a Privy server wallet on Starknet for that user, and
// derive the account address the same way Starkzap does on the client
// (ArgentXV050 preset over the wallet's public key). The browser then drives that
// wallet through Starkzap's PrivySigner, which calls POST /api/privy/sign here; we
// only sign for the wallet that belongs to the bearer of the token.

export async function createPrivy({ cfg, starkzap, log = console }) {
  if (!cfg.privy) {
    log.info?.('Privy: off (set PRIVY_APP_ID and PRIVY_APP_SECRET in the server variables to show email / Google / X / Discord sign-in)');
    return null;
  }
  let PrivyClient;
  try {
    ({ PrivyClient } = await import('@privy-io/node'));
  } catch (e) {
    log.warn(`Privy: off (${e?.message})`);
    return null;
  }
  const client = new PrivyClient({ appId: cfg.privy.appId, appSecret: cfg.privy.appSecret });
  const { AccountProvider, ArgentXV050Preset } = starkzap;

  const addressOf = async (publicKey) => {
    const p = new AccountProvider({ getPubKey: async () => publicKey, signRaw: async () => [] }, ArgentXV050Preset);
    return String(await p.getAddress());
  };

  return {
    appId: cfg.privy.appId,
    clientId: cfg.privy.clientId,

    async verify(accessToken) {
      if (!accessToken) return null;
      const claims = await client.utils().auth().verifyAccessToken(accessToken);
      return claims?.user_id ?? null;
    },

    // one Starknet wallet per Privy user, owned by the app (the server signs for it)
    async createWallet(userId) {
      const w = await client.wallets().create({ chain_type: 'starknet', display_name: 'DARK BAGS', idempotency_key: `darkbags-${userId}`.slice(0, 64) });
      const publicKey = w.public_key ?? w.publicKey;
      if (!publicKey) throw new Error('Privy returned a Starknet wallet without a public key');
      return { walletId: w.id, publicKey, account: await addressOf(publicKey) };
    },

    async sign(walletId, hash) {
      const r = await client.wallets().rawSign(walletId, { params: { hash } });
      return r.signature;
    },

    addressOf,
  };
}

// POST /api/privy/sign  { walletId, hash }  Authorization: Bearer <privy access token>
export async function handlePrivySign(req, res, { privy, cashier, readJson }) {
  const send = (code, body) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  if (!privy) return send(404, { error: 'privy off' });
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const userId = await privy.verify(token).catch(() => null);
  if (!userId) return send(401, { error: 'sign in again' });
  const body = await readJson(req).catch(() => null);
  const mine = cashier.privyWalletOf(userId);
  if (!body || !mine || body.walletId !== mine.walletId) return send(403, { error: 'not your wallet' });
  if (typeof body.hash !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(body.hash)) return send(400, { error: 'bad hash' });
  try {
    return send(200, { signature: await privy.sign(mine.walletId, body.hash) });
  } catch (e) {
    console.error('privy sign failed', e?.message ?? e);
    return send(502, { error: 'signing failed' });
  }
}
