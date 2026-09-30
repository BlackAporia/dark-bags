import { CFG } from '../shared/config.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { RankBook } from '../shared/ranks.js';
import { Inventory } from '../shared/cosmetics.js';
import { store } from './store.js';

// Online: talks to the Node server over WebSocket. Reconnects on drop. Given several
// addresses (the game's domain and the host's own), the first connection races them all
// and keeps whichever answers first, so a domain whose DNS is not ready (or a slow route)
// never makes a player wait; every attempt gives up after CONNECT_TIMEOUT_MS.
const CONNECT_TIMEOUT_MS = 8000;

export class WsTransport {
  constructor(url, onMessage, onStatus) {
    this.urls = Array.isArray(url) ? url : [url];
    this.at = 0;
    this.everOpen = false;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.closed = false;
    this.retry = 0;
    this.connect();
  }

  connect() {
    this.onStatus('connecting');
    // once one address has answered, reconnects go straight back to it
    const urls = this.everOpen ? [this.urls[this.at]] : this.urls;
    let won = false;
    let left = urls.length;
    const socks = [];
    const failed = () => {
      if (won || this.closed || --left > 0) return;
      this.onStatus('closed');
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => !this.closed && this.connect(), 600 * this.retry);
    };
    for (const url of urls) {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        failed();
        continue;
      }
      socks.push(ws);
      const timer = setTimeout(() => ws.readyState !== 1 && ws.close(), CONNECT_TIMEOUT_MS);
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(timer);
        failed();
      };
      ws.onopen = () => {
        clearTimeout(timer);
        if (won || this.closed) {
          ws.onclose = null;
          ws.close();
          return;
        }
        won = true;
        for (const o of socks) {
          if (o === ws) continue;
          o.onclose = null;
          o.onopen = null;
          try {
            o.close();
          } catch {
            /* never opened */
          }
        }
        this.adopt(ws, url);
      };
    }
  }

  adopt(ws, url) {
    this.ws = ws;
    this.at = this.urls.indexOf(url);
    this.everOpen = true;
    this.retry = 0;
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this.onMessage(m);
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.onStatus('closed');
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => !this.closed && this.connect(), 600 * this.retry);
    };
    this.onStatus('open');
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
  }
}

// Practice: the exact same lobby/room/world code, running in this tab.
export class LocalTransport {
  constructor(onMessage, onStatus) {
    const KEY = 'darkbags.practiceWallet';
    this.wallet = new MemoryWallet({ data: store.get(KEY, {}), onChange: (w) => store.set(KEY, w.toJSON()) });
    const RANKS = 'darkbags.practiceRank';
    this.lobby = new Lobby({
      wallet: this.wallet,
      ranks: new RankBook({ data: store.get(RANKS, {}), onChange: (r) => store.set(RANKS, r.toJSON()) }),
      inventory: new Inventory({ data: store.get('darkbags.practiceLocker', {}), onChange: (i) => store.set('darkbags.practiceLocker', i.toJSON()) }),
      practice: true, // every bot for itself, softer bots, the raid ends when you're out
      send: (_cid, msg) => queueMicrotask(() => !this.closed && onMessage(msg)),
      newToken: () => 'practice',
      bots: true,
      prepSeconds: 8, // solo practice: short ready-room countdown
    });
    this.lobby.connect(1);
    this.closed = false;
    this.last = performance.now();
    this.acc = 0;
    const STEP = 1000 / CFG.TICK_RATE;
    this.pump = setInterval(() => {
      const now = performance.now();
      this.acc += now - this.last;
      this.last = now;
      let n = 0;
      while (this.acc >= STEP && n < 4) {
        this.lobby.tick();
        this.acc -= STEP;
        n++;
      }
      if (n === 4) this.acc = 0;
    }, 8);
    this.tables = setInterval(() => this.lobby.broadcastTables(), 2000);
    queueMicrotask(() => onStatus('open'));
  }

  send(msg) {
    if (!this.closed) this.lobby.handle(1, msg);
  }

  close() {
    this.closed = true;
    clearInterval(this.pump);
    clearInterval(this.tables);
  }
}
