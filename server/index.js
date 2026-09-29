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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const ROUND_SECONDS = Number(process.env.ROUND_SECONDS || CFG.ROUND_SECONDS);
const PREP_SECONDS = Number(process.env.PREP_SECONDS || CFG.PREP_SECONDS);
const BOTS = process.env.BOTS !== '0';
const WALLET_FILE = process.env.WALLET_FILE || '';

// ------------------------------------------------------------------ wallet
// Test sats only. Swap MemoryWallet for a real adapter before any money moves.
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
  send,
  bots: BOTS,
  roundSeconds: ROUND_SECONDS,
  prepSeconds: PREP_SECONDS,
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
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  serveStatic(req, res);
});

// --------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
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

server.listen(PORT, () => {
  console.log(`DARK BAGS on http://localhost:${PORT}  (bots ${BOTS ? 'on' : 'off'}, raid ${ROUND_SECONDS}s)`);
});

const shutdown = async () => {
  if (WALLET_FILE) await writeFile(WALLET_FILE, JSON.stringify(wallet.toJSON())).catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
