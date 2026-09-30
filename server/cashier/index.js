// Real-token mode: wires config, Starkzap, prices, the STRK20 pool, Privy and the
// journal file into one Cashier, plus the HTTP routes the browser needs.
import { readFileSync, existsSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { hash } from 'starknet';
import { PriceBook } from '../../shared/assets.js';
import { Cashier, normAddr, pauseFlag } from './cashier.js';
import { readConfig } from './config.js';
import { PriceFeed } from './prices.js';
import { createStarknetChain } from './starknet.js';
import { createPrivy, handlePrivySign } from './privy.js';

const TRANSFER_SELECTOR = normAddr(hash.getSelectorFromName('transfer'));

export async function createCashier(env = process.env, log = console) {
  const cfg = readConfig(env);
  if (!cfg) return null;
  if (!cfg.file && cfg.network === 'mainnet') throw new Error('CASHIER_FILE is required on mainnet (on a persistent disk): without it every restart forgets who owns the deposits.');
  if (!cfg.file) log.warn('CASHIER_FILE is not set: balances live in memory and vanish on restart. Never run real money like this.');

  const starkzap = await import('starkzap');
  const chain = await createStarknetChain({ cfg, starkzap, log });
  const privy = await createPrivy({ cfg, starkzap, log });
  const prices = new PriceBook([]);
  const usd = chain.tokens.find((t) => t.symbol.toUpperCase() === 'USDC') ?? null;
  const feed = new PriceFeed({ tokens: chain.tokens, prices, quoter: chain.quote, usd, fixed: cfg.fixedPrices, log });

  // journal: debounced atomic writes, plus an immediate flush before any payout
  const data = cfg.file && existsSync(cfg.file) ? JSON.parse(readFileSync(cfg.file, 'utf8')) : {};
  let timer = null;
  let writing = Promise.resolve();
  let cashier;
  const write = () => {
    if (!cfg.file) return Promise.resolve();
    const body = JSON.stringify(cashier.toJSON());
    writing = writing.then(async () => {
      const tmp = `${cfg.file}.tmp`;
      await writeFile(tmp, body, { mode: 0o600 });
      await rename(tmp, cfg.file);
    });
    return writing.catch((e) => log.error('cashier save failed', e));
  };
  const save = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      write();
    }, 500);
  };
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    return write();
  };
  const allow = new Set(cfg.allow.map(normAddr).filter(Boolean));
  cashier = new Cashier({ chain, prices, data, save, flush, privy, minWithdrawUsd: cfg.minWithdrawUsd, allow, maxBalanceUsd: cfg.maxBalanceUsd, maxTotalUsd: cfg.maxTotalUsd, paused: pauseFlag(cfg.pauseFile) });
  if (cfg.network === 'mainnet' && !allow.size && !cfg.maxBalanceUsd) log.warn('cashier: mainnet with no ALLOWLIST and no MAX_BALANCE_USD: anyone can deposit any amount.');

  // paymaster proxy budget: sponsored requests per signed-in account per day
  const sponsored = new Map();
  const tokenIds = new Set(chain.tokens.map((t) => t.id));

  const routes = {
    'POST /api/privy/sign': (req, res) => handlePrivySign(req, res, { privy, cashier, readJson }),

    // Gasless for players' Starkzap wallets (Privy, Cartridge-less extension users) without
    // shipping the paymaster key to browsers. Only signed-in sessions, only paymaster_*
    // methods, and a built invoke may only move our tokens to the house.
    'POST /api/paymaster': async (req, res) => {
      const reply = (code, body) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      if (!cfg.paymaster) return reply(404, { error: 'paymaster off' });
      const account = cashier.accountFor(String(req.headers['x-darkbags-session'] ?? ''));
      if (!account) return reply(401, { error: 'sign in first' });
      const body = await readJson(req).catch(() => null);
      if (!body || typeof body.method !== 'string' || !body.method.startsWith('paymaster_')) return reply(400, { error: 'paymaster methods only' });
      if (body.method === 'paymaster_buildTransaction' && !allowedBuild(body.params, account, chain.info().house, tokenIds)) return reply(403, { error: 'only deposits to the house are sponsored' });
      if (body.method === 'paymaster_executeTransaction') {
        const day = new Date().toISOString().slice(0, 10);
        const k = `${account}:${day}`;
        const n = (sponsored.get(k) ?? 0) + 1;
        if (n > 20) return reply(429, { error: 'daily gasless limit reached' });
        sponsored.set(k, n);
        if (sponsored.size > 50_000) sponsored.clear();
      }
      try {
        const r = await fetch(cfg.paymaster.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-paymaster-api-key': cfg.paymaster.apiKey },
          body: JSON.stringify(body),
        });
        res.writeHead(r.status, { 'content-type': 'application/json' }).end(await r.text());
      } catch (e) {
        reply(502, { error: `paymaster unreachable: ${e?.message ?? e}` });
      }
    },
  };

  return {
    cfg,
    cashier,
    chain,
    privy,
    feed,
    routes,
    start() {
      feed.start(cfg.priceSeconds);
      const poll = () => cashier.poll().catch((e) => log.error('cashier poll', e));
      this.poller = setInterval(poll, 20_000);
      this.poller.unref?.();
      poll();
      const i = chain.info();
      log.log(`cashier: ${i.network}, house ${i.house}, tokens ${chain.tokens.map((t) => t.symbol).join('/')}, deposits ${i.routes.join('+')}, cash-out ${Object.entries(i.cashOut).filter(([, v]) => v).map(([k]) => k).join('+') || 'off'}${privy ? ', Privy on' : ''}${cfg.paymaster ? ', gasless on' : ''}`);
    },
    async stop() {
      feed.stop();
      clearInterval(this.poller);
      await flush();
      await chain.strk20?.close?.();
    },
  };
}

// paymaster_buildTransaction params: { transaction: { type, invoke?: { user_address, calls: [{ to, selector, calldata }] } }, parameters }
export function allowedBuild(params, account, house, tokenIds) {
  const p = Array.isArray(params) ? params[0] : params;
  const tx = p?.transaction;
  if (!tx) return false;
  if (tx.type === 'deploy') return normAddr(tx.deployment?.address) === account;
  if (tx.type !== 'invoke' && tx.type !== 'deploy_and_invoke') return false;
  if (tx.type === 'deploy_and_invoke' && normAddr(tx.deployment?.address) !== account) return false;
  const inv = tx.invoke;
  if (!inv || normAddr(inv.user_address) !== account || !Array.isArray(inv.calls) || !inv.calls.length) return false;
  return inv.calls.every((c) => tokenIds.has(normAddr(c.to)) && normAddr(c.selector) === TRANSFER_SELECTOR && normAddr(c.calldata?.[0]) === house);
}

export function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
