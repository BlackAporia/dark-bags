import { CFG } from '../shared/config.js';
import { Lobby } from '../shared/lobby.js';
import { MemoryWallet } from '../shared/wallet.js';
import { RankBook } from '../shared/ranks.js';
import { Inventory } from '../shared/cosmetics.js';
import { store } from './store.js';

// Online: talks to the Node server over WebSocket. Reconnects on drop. Given several
// addresses, it tries the next one until one answers, then sticks with it.
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
    let ws;
    try {
      ws = new WebSocket(this.urls[this.at]);
    } catch {
      this.onStatus('error');
      return;
    }
    this.ws = ws;
    this.onStatus('connecting');
    ws.onopen = () => {
      this.everOpen = true;
      this.retry = 0;
      this.onStatus('open');
    };
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
      if (!this.everOpen) this.at = (this.at + 1) % this.urls.length;
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => !this.closed && this.connect(), 600 * this.retry);
    };
    ws.onerror = () => {};
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
