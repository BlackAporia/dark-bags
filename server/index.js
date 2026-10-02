// DARK BAGS game server: serves the client and runs raids over WebSocket.
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { readFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { CFG } from '../shared/config.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { createCashier } from './cashier/index.js';
import { RankBook } from '../shared/ranks.js';
import { Inventory } from '../shared/cosmetics.js';
import { SocialBook } from '../shared/social.js';
import { ReferralBook } from '../shared/referrals.js';
import { Guard } from '../shared/guard.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const ROUND_SECONDS = Number(process.env.ROUND_SECONDS || CFG.ROUND_SECONDS);
const PREP_SECONDS = Number(process.env.PREP_SECONDS || CFG.PREP_SECONDS);
// bots play only in practice (in the browser): online every seat is a real player
const BOTS = false;
// with a data volume (/data on Railway) everything is kept there by default; the locker (skins
// and shop $ bought with real money) gets one file per network so test and real never mix
const DATA = existsSync('/data') ? '/data' : '';
const NET = process.env.CHAIN && process.env.CHAIN !== 'off' ? process.env.CHAIN : 'test';
const WALLET_FILE = process.env.WALLET_FILE || '';
const RANKS_FILE = process.env.RANKS_FILE || (DATA ? `${DATA}/ranks.json` : '');
const LOCKER_FILE = process.env.LOCKER_FILE || (DATA ? `${DATA}/${NET}-locker.json` : '');
const REFERRAL_FILE = process.env.REFERRAL_FILE || (DATA ? `${DATA}/${NET}-referrals.json` : '');
const GUARD_FILE = process.env.GUARD_FILE || (DATA ? `${DATA}/${NET}-guard.json` : '');
const SOCIAL_FILE = process.env.SOCIAL_FILE || (existsSync('/data') ? '/data/social.json' : '');
if (NET === 'mainnet' && (!LOCKER_FILE || !REFERRAL_FILE)) {
  console.error('On mainnet the locker (shop $ and skins bought with real money) and the referral book must live on a persistent disk: mount /data or set LOCKER_FILE and REFERRAL_FILE.');
  process.exit(1);
}

// A new data epoch (CFG.EPOCH) starts every player over: the game files (ranks, locker, friends,
// referrals, fair-play records, play money) move to <data>/archive/<old epoch>-<time>/ and the
// server boots empty. The cashier journal (real deposits) is never moved. On mainnet the locker
// and referrals hold things bought with real money, so there it only happens with
// EPOCH_RESET_MAINNET=1.
const EPOCH_FILE = process.env.EPOCH_FILE || (DATA ? `${DATA}/epoch.json` : '');
if (EPOCH_FILE) {
  const was = existsSync(EPOCH_FILE) ? JSON.parse(readFileSync(EPOCH_FILE, 'utf8')).epoch ?? null : null;
  if (was !== CFG.EPOCH) {
    const files = [WALLET_FILE, RANKS_FILE, LOCKER_FILE, REFERRAL_FILE, GUARD_FILE, SOCIAL_FILE].filter((f) => f && existsSync(f));
    if (NET === 'mainnet' && files.length && process.env.EPOCH_RESET_MAINNET !== '1') {
      console.warn(`data epoch ${was} → ${CFG.EPOCH}: mainnet keeps its files (set EPOCH_RESET_MAINNET=1 to start over)`);
    } else if (files.length) {
      const dir = path.join(path.dirname(EPOCH_FILE), 'archive', `${was ?? 'pre'}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      mkdirSync(dir, { recursive: true });
      for (const f of files) renameSync(f, path.join(dir, path.basename(f)));
      console.warn(`data epoch ${was ?? 'none'} → ${CFG.EPOCH}: every player starts over; old files are in ${dir}`);
    }
    writeFileSync(EPOCH_FILE, JSON.stringify({ epoch: CFG.EPOCH, at: new Date().toISOString() }));
  }
}

// a save never leaves a half-written file behind: write a temp file, then swap it in
async function saveJSON(file, obj) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(obj));
  await rename(tmp, file);
}
// players, friends, messages, guilds: on the data volume when there is one

// ------------------------------------------------------------------ wallet
// CHAIN=sepolia|mainnet: real tokens through the cashier (server/cashier). Otherwise test tokens.
const real = await createCashier().catch((e) => {
  console.error(`cashier failed to start: ${e?.message ?? e}`);
  process.exit(1);
});
let saveTimer = null;
const initial = WALLET_FILE && existsSync(WALLET_FILE) ? JSON.parse(readFileSync(WALLET_FILE, 'utf8')) : {};
const wallet = new MemoryWallet({
  data: initial,
  onChange: (w) => {
    if (!WALLET_FILE || saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      await saveJSON(WALLET_FILE, w.toJSON()).catch((e) => console.error('wallet save failed', e));
    }, 2000);
  },
});

// ------------------------------------------------------------------- ranks
// Career rank XP per player key (session token, or Starknet address with a cashier).
let rankTimer = null;
const ranks = new RankBook({
  data: RANKS_FILE && existsSync(RANKS_FILE) ? JSON.parse(readFileSync(RANKS_FILE, 'utf8')) : {},
  onChange: (r) => {
    if (!RANKS_FILE || rankTimer) return;
    rankTimer = setTimeout(async () => {
      rankTimer = null;
      await saveJSON(RANKS_FILE, r.toJSON()).catch((e) => console.error('ranks save failed', e));
    }, 2000);
  },
});

// ------------------------------------------------------------------ locker
// Outfits, marks and luck-box pity per player key. Boxes are rolled here, never in the browser.
let lockerTimer = null;
const inventory = new Inventory({
  data: LOCKER_FILE && existsSync(LOCKER_FILE) ? JSON.parse(readFileSync(LOCKER_FILE, 'utf8')) : {},
  onChange: (inv) => {
    if (!LOCKER_FILE || lockerTimer) return;
    lockerTimer = setTimeout(async () => {
      lockerTimer = null;
      await saveJSON(LOCKER_FILE, inv.toJSON()).catch((e) => console.error('locker save failed', e));
    }, 1000);
  },
});

// ------------------------------------------------------------------ social
let socialTimer = null;
const social = new SocialBook({
  data: SOCIAL_FILE && existsSync(SOCIAL_FILE) ? JSON.parse(readFileSync(SOCIAL_FILE, 'utf8')) : {},
  onChange: (sb) => {
    if (!SOCIAL_FILE || socialTimer) return;
    socialTimer = setTimeout(async () => {
      socialTimer = null;
      await saveJSON(SOCIAL_FILE, sb.toJSON()).catch((e) => console.error('social save failed', e));
    }, 1500);
  },
});

// -------------------------------------------------------------- referrals
let refTimer = null;
const referrals = new ReferralBook({
  data: REFERRAL_FILE && existsSync(REFERRAL_FILE) ? JSON.parse(readFileSync(REFERRAL_FILE, 'utf8')) : {},
  onChange: (rb) => {
    if (!REFERRAL_FILE || refTimer) return;
    refTimer = setTimeout(async () => {
      refTimer = null;
      await saveJSON(REFERRAL_FILE, rb.toJSON()).catch((e) => console.error('referrals save failed', e));
    }, 1500);
  },
});

// -------------------------------------------------------------- fair play
// Networks and devices are kept as salted hashes. The salt stays with the file (or GUARD_SALT), so
// the hashes still match after a restart. GUARD_CLEAR=key1,key2 lifts an aim review on boot;
// GUARD_SHARED_IP=1 lets one network seat several accounts at a table (a LAN cafe).
const guardData = GUARD_FILE && existsSync(GUARD_FILE) ? JSON.parse(readFileSync(GUARD_FILE, 'utf8')) : {};
const guardSalt = process.env.GUARD_SALT || guardData.salt || crypto.randomBytes(16).toString('hex');
let guardTimer = null;
const saveGuard = (g) => saveJSON(GUARD_FILE, { ...g.toJSON(), salt: process.env.GUARD_SALT ? undefined : guardSalt });
const guard = new Guard({
  data: guardData,
  salt: guardSalt,
  sharedIp: process.env.GUARD_SHARED_IP === '1',
  log: (m, a) => console.warn(m, JSON.stringify(a)),
  onChange: (g) => {
    if (!GUARD_FILE || guardTimer) return;
    guardTimer = setTimeout(async () => {
      guardTimer = null;
      await saveGuard(g).catch((e) => console.error('guard save failed', e));
    }, 3000);
  },
});
for (const k of (process.env.GUARD_CLEAR ?? '').split(',').map((x) => x.trim()).filter(Boolean)) guard.clear(k);
if (guard.flags.size) console.warn(`guard: ${guard.flags.size} account(s) under fair-play review (withdrawals held):`, [...guard.flags.keys()].join(', '));

// ------------------------------------------------------------------- lobby
const sockets = new Map(); // cid -> { ws, msgs, windowStart }
const send = (cid, msg) => {
  const s = sockets.get(cid);
  if (!s || s.ws.readyState !== 1) return;
  // a slow link: drop stale frames instead of queueing them (a queue is lag); ~4 s of snapshots
  if (msg.t === 'snap' && s.ws.bufferedAmount > 48 * 1024) return;
  s.ws.send(JSON.stringify(msg));
};
const lobby = new Lobby({
  wallet,
  cashier: real?.cashier ?? null,
  // in-game swaps: always with test tokens and on Sepolia; on mainnet only when the house
  // rebalances on chain (SWAP_INTERNAL=1). SWAP_INTERNAL=0 turns them off anywhere.
  swap: process.env.SWAP_INTERNAL === '0' ? false : !real || real.cfg.network === 'sepolia' || process.env.SWAP_INTERNAL === '1',
  ranks,
  inventory,
  social,
  referrals,
  guard,
  send,
  bots: BOTS,
  minPlayers: 2,
  roundSeconds: ROUND_SECONDS,
  prepSeconds: PREP_SECONDS,
  // online rooms wait for the players (no timer) until someone presses Start or it fills up
  waitForStart: process.env.WAIT_FOR_START !== '0',
  newToken: () => crypto.randomBytes(16).toString('hex'),
});

// ------------------------------------------------------------------ static
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  let base = path.join(ROOT, 'client');
  if (rel.startsWith('/shared/')) {
    base = path.join(ROOT, 'shared');
    rel = rel.slice('/shared'.length);
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (req.url === '/api/stats') {
    const totals = Object.fromEntries([...lobby.rooms].map(([k, r]) => [k, r.totals]));
    const body = JSON.stringify({ online: sockets.size, tables: lobby.tables(), totals }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }).end(body);
    return;
  }
  const pathOnly = req.url.split('?')[0];
  // the static single-file build may live on another origin: let it reach the API and the wallet bundle
  if (pathOnly.startsWith('/api/') || pathOnly.startsWith('/vendor/')) {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type, authorization, x-darkbags-session');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
  }
  const route = real?.routes[`${req.method} ${pathOnly}`];
  if (route) {
    route(req, res).catch((e) => {
      console.error('route failed', e);
      if (!res.headersSent) res.writeHead(500).end();
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  serveStatic(req, res);
});

// --------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
let nextCid = 1;

// behind Railway's proxy the player's address is the hop the proxy appended to x-forwarded-for
// (the last one: anything before it the client could have written itself)
const TRUST_PROXY = process.env.TRUST_PROXY !== '0';
const ipOf = (req) => (TRUST_PROXY ? String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1).trim() : '') || req.socket.remoteAddress || '';

wss.on('connection', (ws, req) => {
  const ip = ipOf(req);
  const net = guard.net(ip);
  // fair play: so many sockets per network, no more
  if (!guard.open(net)) return ws.close(1008, 'too many connections');
  const cid = nextCid++;
  const s = { ws, msgs: 0, windowStart: Date.now(), floods: 0 };
  sockets.set(cid, s);
  lobby.connect(cid, { ip });

  ws.on('message', (data) => {
    const now = Date.now();
    if (now - s.windowStart > 1000) {
      if (s.msgs > 90) s.floods++;
      else s.floods = Math.max(0, s.floods - 1);
      s.windowStart = now;
      s.msgs = 0;
    }
    // inputs arrive at 30 Hz; far above that is noise or abuse, and a socket that keeps at it goes
    if (++s.msgs > 90) {
      if (s.floods >= 5) ws.close(1008, 'flood');
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    lobby.handle(cid, msg);
  });
  ws.on('close', () => {
    guard.close(net);
    lobby.disconnect(cid);
    sockets.delete(cid);
  });
  ws.on('error', () => {});
});

// -------------------------------------------------------------- game loop
const STEP = 1000 / CFG.TICK_RATE;
let last = performance.now();
let acc = 0;
function loop() {
  const now = performance.now();
  acc += now - last;
  last = now;
  let n = 0;
  while (acc >= STEP && n < 5) {
    try {
      lobby.tick();
    } catch (e) {
      console.error('tick failed', e);
    }
    acc -= STEP;
    n++;
  }
  if (n === 5) acc = 0; // fell behind: skip ahead instead of spiralling
  setTimeout(loop, Math.max(1, STEP - acc - 1));
}
loop();
setInterval(() => lobby.broadcastTables(), 2000);
setInterval(() => lobby.probe(), 2000);

server.listen(PORT, () => {
  console.log(`DARK BAGS on http://localhost:${PORT}  (bots ${BOTS ? 'on' : 'off'}, raid ${ROUND_SECONDS}s, ${real ? `${real.cfg.network} tokens` : 'test tokens'})`);
  real?.start();
});

const shutdown = async () => {
  if (RANKS_FILE) await saveJSON(RANKS_FILE, ranks.toJSON()).catch(() => {});
  if (LOCKER_FILE) await saveJSON(LOCKER_FILE, inventory.toJSON()).catch(() => {});
  if (REFERRAL_FILE) await saveJSON(REFERRAL_FILE, referrals.toJSON()).catch(() => {});
  if (GUARD_FILE) await saveGuard(guard).catch(() => {});
  if (SOCIAL_FILE) await saveJSON(SOCIAL_FILE, social.toJSON()).catch(() => {});
  if (real) await real.stop().catch(() => {});
  else if (WALLET_FILE) await saveJSON(WALLET_FILE, wallet.toJSON()).catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
