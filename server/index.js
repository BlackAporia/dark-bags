// DARK BAGS game server: serves the client and runs raids over WebSocket.
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { CFG } from '../shared/config.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { createCashier } from './cashier/index.js';
import { RankBook } from '../shared/ranks.js';
import { Inventory } from '../shared/cosmetics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const ROUND_SECONDS = Number(process.env.ROUND_SECONDS || CFG.ROUND_SECONDS);
const PREP_SECONDS = Number(process.env.PREP_SECONDS || CFG.PREP_SECONDS);
const BOTS = process.env.BOTS !== '0';
const WALLET_FILE = process.env.WALLET_FILE || '';
const RANKS_FILE = process.env.RANKS_FILE || '';
const LOCKER_FILE = process.env.LOCKER_FILE || '';

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
      await writeFile(WALLET_FILE, JSON.stringify(w.toJSON())).catch((e) => console.error('wallet save failed', e));
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
      await writeFile(RANKS_FILE, JSON.stringify(r.toJSON())).catch((e) => console.error('ranks save failed', e));
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
      await writeFile(LOCKER_FILE, JSON.stringify(inv.toJSON())).catch((e) => console.error('locker save failed', e));
    }, 1000);
  },
});

// ------------------------------------------------------------------- lobby
const sockets = new Map(); // cid -> { ws, msgs, windowStart }
const send = (cid, msg) => {
  const s = sockets.get(cid);
  if (!s || s.ws.readyState !== 1) return;
  if (msg.t === 'snap' && s.ws.bufferedAmount > 512 * 1024) return; // slow link: drop frames, not the player
  s.ws.send(JSON.stringify(msg));
};
const lobby = new Lobby({
  wallet,
  cashier: real?.cashier ?? null,
  swap: !real || process.env.SWAP_INTERNAL === '1', // real money: in-game swaps only when the house rebalances on chain
  ranks,
  inventory,
  send,
  bots: BOTS,
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

wss.on('connection', (ws) => {
  const cid = nextCid++;
  const s = { ws, msgs: 0, windowStart: Date.now() };
  sockets.set(cid, s);
  lobby.connect(cid);

  ws.on('message', (data) => {
    const now = Date.now();
    if (now - s.windowStart > 1000) {
      s.windowStart = now;
      s.msgs = 0;
    }
    if (++s.msgs > 90) return; // inputs arrive at 30 Hz; far above that is noise or abuse
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    lobby.handle(cid, msg);
  });
  ws.on('close', () => {
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
  if (RANKS_FILE) await writeFile(RANKS_FILE, JSON.stringify(ranks.toJSON())).catch(() => {});
  if (LOCKER_FILE) await writeFile(LOCKER_FILE, JSON.stringify(inventory.toJSON())).catch(() => {});
  if (real) await real.stop().catch(() => {});
  else if (WALLET_FILE) await writeFile(WALLET_FILE, JSON.stringify(wallet.toJSON())).catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
