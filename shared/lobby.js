import { CFG } from './config.js';
import { RoomCore } from './room.js';
import { cleanName } from './wallet.js';

/**
 * Session + table routing shared by the WebSocket server and offline mode.
 * Message protocol (client → lobby):
 *   hello {token?, name}  tables  faucet  join {stake, name, skin} (enter a table's ready room)
 *   ready {name, skin} (escrow the stake)  unready  leave
 *   in {s, mx, my, a, f, d}  bluff {v}  ping {c}
 */
export class Lobby {
  constructor({ wallet, send, newToken, bots = true, roundSeconds = CFG.ROUND_SECONDS, prepSeconds = CFG.PREP_SECONDS, tiers = CFG.TIERS }) {
    this.wallet = wallet;
    this.send = send;
    this.newToken = newToken;
    this.sessions = new Map();
    this.rooms = new Map(tiers.map((stake) => [stake, new RoomCore({ stake, wallet, send, bots, roundSeconds, prepSeconds })]));
    this.roundSeconds = roundSeconds;
  }

  tables() {
    return [...this.rooms.values()].map((r) => r.info());
  }

  connect(cid) {
    this.sessions.set(cid, { token: null, name: 'runner', room: null });
  }

  disconnect(cid) {
    const s = this.sessions.get(cid);
    if (s?.room) s.room.removeClient(cid);
    this.sessions.delete(cid);
  }

  handle(cid, msg) {
    const s = this.sessions.get(cid);
    if (!s || !msg || typeof msg.t !== 'string') return;

    if (msg.t === 'hello') {
      s.token = typeof msg.token === 'string' && /^[a-z0-9]{8,64}$/.test(msg.token) ? msg.token : this.newToken();
      s.name = cleanName(msg.name);
      this.wallet.ensure(s.token);
      this.send(cid, {
        t: 'welcome',
        token: s.token,
        balance: this.wallet.balance(s.token),
        tables: this.tables(),
        cfg: {
          ROUND_SECONDS: this.roundSeconds,
          RAKE: CFG.RAKE,
          BAG_SHARE: CFG.BAG_SHARE,
          TIERS: [...this.rooms.keys()],
        },
      });
      return;
    }
    if (!s.token) return;

    switch (msg.t) {
      case 'ping':
        this.send(cid, { t: 'pong', c: msg.c });
        return;
      case 'tables':
        this.send(cid, { t: 'tables', tables: this.tables(), balance: this.wallet.balance(s.token) });
        return;
      case 'faucet':
        this.wallet.faucet(s.token);
        this.send(cid, { t: 'balance', balance: this.wallet.balance(s.token) });
        return;
      case 'join': {
        const room = this.rooms.get(Number(msg.stake));
        if (!room) return;
        if (s.room && s.room !== room) {
          s.room.removeClient(cid);
          s.room = null;
        }
        if (!s.room) {
          room.addClient(cid, { token: s.token, name: msg.name || s.name, skin: msg.skin });
          s.room = room;
        } else room.handle(cid, msg);
        return;
      }
      case 'leave':
        if (s.room) s.room.removeClient(cid);
        s.room = null;
        this.send(cid, { t: 'tables', tables: this.tables(), balance: this.wallet.balance(s.token) });
        return;
      default:
        if (s.room) s.room.handle(cid, msg);
    }
  }

  tick() {
    for (const r of this.rooms.values()) r.tick();
  }

  // periodic refresh for people browsing tables
  broadcastTables() {
    const t = this.tables();
    for (const [cid, s] of this.sessions) {
      if (s.token && !s.room) this.send(cid, { t: 'tables', tables: t, balance: this.wallet.balance(s.token) });
    }
  }
}
