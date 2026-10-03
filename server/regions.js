// Regions: one main server (the money, accounts and everything else) and match servers near the
// players (US, Asia…). A match server only runs raids:
//
//   1. Playing in a region, the browser asks the main server for an entry ticket (who you are, your
//      look, rank and records, signed) and joins the region's table with it.
//   2. Ready: the main server takes the stake from your balance into the region's pot and signs a
//      stake ticket; the match server escrows exactly that (no prices, no wallets of its own).
//   3. What a match leaves behind goes back to the main server, signed: the coins each player
//      holds on the match server once nothing of theirs is at stake (payout, refund) and the
//      bookkeeping of the match (XP, achievements, battle pass, ranked, referral shares, fair play,
//      stats), replayed on the real books. The region's pot caps what can come back: a match server
//      can hand out only what was staked there.
//
// Both sides share REGION_SECRET; tickets and reports are HMAC-SHA256 signed.
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';

const TICKET_TTL = 10 * 60 * 1000;
const VOID_AFTER = 30 * 60 * 1000; // a stake ticket nobody redeemed by then goes back to its owner

export const sign = (secret, body) => crypto.createHmac('sha256', secret).update(body).digest('hex');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function makeTicket(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

export function readTicket(secret, ticket, now = Date.now()) {
  if (typeof ticket !== 'string' || ticket.length > 200_000) return null;
  const [body, sig] = ticket.split('.');
  if (!body || !sig || !safeEq(sig, sign(secret, body))) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!p || typeof p !== 'object' || !(p.exp > now)) return null;
  return p;
}

// REGIONS="us=https://dark-bags-us.up.railway.app,asia=https://dark-bags-asia.up.railway.app"
export function parseRegions(s = '') {
  const out = [];
  for (const part of String(s).split(',')) {
    const [id, url] = part.split('=').map((x) => x?.trim());
    if (!id || !/^[a-z0-9-]{1,16}$/.test(id) || !/^https:\/\/[^\s/]+$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url ?? '')) continue;
    out.push({ id, url });
  }
  return out;
}

// What the match server's books record and the main server replays. Only these, nothing else.
export const REPLAY = {
  ranks: ['add', 'progress', 'setTitle', 'rankedResult', 'addSeasonTitle', 'divisionPrizes'],
  inventory: ['give', 'passXp'],
  referrals: ['onStake', 'onMatch'],
  guard: ['aim'],
  stats: ['raid'],
  daily: ['raid', 'bonusXp'],
};

// ------------------------------------------------------------------ main side

export function createRegionMain({ lobby, secret, regions, self = 'eu', file = '', now = () => Date.now(), log = console }) {
  const data = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const st = {
    pots: data.pots ?? {}, // region -> { asset: units (string) }: what is at stake there
    tickets: data.tickets ?? {}, // id -> { key, region, asset, units, at, redeemed }
    batches: data.batches ?? [], // report ids already applied (newest last)
  };
  let saving = null;
  const save = () => {
    if (!file || saving) return;
    saving = setTimeout(async () => {
      saving = null;
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(st)).catch(() => {});
      await rename(tmp, file).catch((e) => log.error('regions save failed', e));
    }, 300);
  };
  const byId = new Map(regions.map((r) => [r.id, r]));
  const pot = (region, asset) => BigInt(st.pots[region]?.[asset] ?? 0);
  const setPot = (region, asset, v) => ((st.pots[region] ??= {})[asset] = v.toString());

  // what the match server needs to show you as you are (look, rank, titles, records)
  function seeds(key) {
    return {
      ranks: lobby.ranks.recs.get(key) ?? null,
      inventory: lobby.inventory.data.get(key) ?? null,
      referrals: lobby.referrals.users.get(key) ?? null,
      daily: lobby.daily?.users.get(key) ?? null,
      name: lobby.social.get?.(key)?.name ?? null,
    };
  }

  function entryTicket(key, region, name) {
    return makeTicket(secret, { k: 'entry', key, region, name, seeds: seeds(key), exp: now() + TICKET_TTL });
  }

  // take the stake into the region's pot; null + reason if not
  function stakeTicket(key, region, { asset, mills }) {
    const units = lobby.prices.quote(asset, mills);
    if (units === null) return { error: 'That token has no price right now, so it cannot be staked.' };
    if (!lobby.wallet.debit(key, asset, units)) return { error: `Not enough ${lobby.prices.get(asset)?.symbol ?? 'coins'} for this table.` };
    const id = crypto.randomUUID();
    st.tickets[id] = { key, region, asset, units: units.toString(), at: now(), redeemed: false };
    setPot(region, asset, pot(region, asset) + units);
    save();
    return { ticket: makeTicket(secret, { k: 'stake', id, key, region, asset, units: units.toString(), mills, seeds: seeds(key), exp: now() + TICKET_TTL }) };
  }

  // stake tickets that never reached a table go back
  function sweep() {
    const t = now();
    for (const [id, x] of Object.entries(st.tickets)) {
      if (x.redeemed) {
        if (t - x.at > 24 * 3600 * 1000) delete st.tickets[id];
        continue;
      }
      if (t - x.at < VOID_AFTER) continue;
      const units = BigInt(x.units);
      lobby.wallet.credit(x.key, x.asset, units);
      setPot(x.region, x.asset, pot(x.region, x.asset) - units);
      x.redeemed = 'void';
      lobby.pushBalance?.(x.key);
      log.warn(`region ${x.region}: stake ticket ${id} never redeemed, refunded to ${x.key}`);
      save();
    }
  }

  // a signed report from a match server
  function apply(report) {
    if (!byId.has(report.region)) return { error: 'unknown region' };
    if (st.batches.includes(report.id)) return { ok: true, dup: true };
    const region = report.region;
    const touched = new Set();
    for (const id of report.redeemed ?? []) {
      const x = st.tickets[id];
      if (!x || x.region !== region) continue;
      if (x.redeemed === 'void') {
        // refunded already (the match server was out of reach): take it back if the balance allows
        const units = BigInt(x.units);
        if (lobby.wallet.debit(x.key, x.asset, units)) setPot(region, x.asset, pot(region, x.asset) + units);
        else log.error(`region ${region}: ticket ${id} was voided and also played; ${x.key} could not cover it back`);
      }
      x.redeemed = true;
    }
    for (const c of report.credits ?? []) {
      let units;
      try {
        units = BigInt(c.units);
      } catch {
        continue;
      }
      if (units <= 0n || typeof c.key !== 'string' || typeof c.asset !== 'string') continue;
      // a match server hands back only what was staked in its region
      if (pot(region, c.asset) < units) {
        log.error(`region ${region}: report wants ${units} ${c.asset} for ${c.key}, pot holds ${pot(region, c.asset)}; capped`);
        units = pot(region, c.asset);
        if (units <= 0n) continue;
      }
      setPot(region, c.asset, pot(region, c.asset) - units);
      lobby.wallet.credit(c.key, c.asset, units);
      touched.add(c.key);
    }
    const books = { ranks: lobby.ranks, inventory: lobby.inventory, referrals: lobby.referrals, guard: lobby.guard, stats: lobby.stats, daily: lobby.daily };
    for (const j of report.journal ?? []) {
      const [book, method, args] = j;
      if (!REPLAY[book]?.includes(method) || !books[book] || !Array.isArray(args)) continue;
      try {
        books[book][method](...args);
        if (typeof args[0] === 'string') touched.add(args[0]);
      } catch (e) {
        log.warn(`region ${region}: replay ${book}.${method} failed: ${e?.message ?? e}`);
      }
    }
    st.batches.push(report.id);
    if (st.batches.length > 5000) st.batches.splice(0, st.batches.length - 5000);
    save();
    for (const key of touched) lobby.refreshPlayer?.(key);
    return { ok: true };
  }

  // HTTP: POST /api/region/report  (x-region-sig: hmac of the body)
  async function handle(req, res) {
    const reply = (code, body) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    let raw = '';
    for await (const c of req) {
      raw += c;
      if (raw.length > 4_000_000) return reply(413, { error: 'too large' });
    }
    const sig = String(req.headers['x-region-sig'] ?? '');
    if (!sig || !safeEq(sig, sign(secret, raw))) return reply(403, { error: 'bad signature' });
    let report;
    try {
      report = JSON.parse(raw);
    } catch {
      return reply(400, { error: 'json' });
    }
    reply(200, apply(report));
  }

  const timer = setInterval(sweep, 60_000);
  timer.unref?.();
  return {
    regions,
    self,
    list: () => [{ id: self, url: null }, ...regions],
    url: (id) => byId.get(id)?.url ?? null,
    entryTicket,
    stakeTicket,
    apply,
    handle,
    sweep,
    pots: () => st.pots,
    pending: () => Object.entries(st.tickets).filter(([, x]) => !x.redeemed).length,
  };
}

// ----------------------------------------------------------------- match side

// A book whose writes are journaled for the main server (and still applied here, so the match
// shows the same numbers the main server will reach).
export function journaled(name, book, journal) {
  const keep = new Set(REPLAY[name] ?? []);
  return new Proxy(book, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof v !== 'function') return v;
      if (name === 'inventory' && prop === 'rankUp') {
        // random rewards: the main server gets the outcome, not a fresh roll
        return (key, ...rest) => {
          const out = v.call(target, key, ...rest);
          for (const r of out) if (r.trial) journal.push(['inventory', 'give', [key, { k: 'trial', id: r.trial.id }]]);
          return out;
        };
      }
      if (!keep.has(prop)) return v.bind(target);
      return (...args) => {
        journal.push([name, prop, JSON.parse(JSON.stringify(args, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))]);
        return v.apply(target, args);
      };
    },
  });
}

export function createRegionEdge({ lobby, secret, region, mainUrl, journal, file = '', now = () => Date.now(), log = console, fetchImpl = fetch }) {
  const used = new Set(); // stake tickets redeemed here
  const redeemed = [];
  let outbox = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  let sending = false;

  const persist = () => {
    if (!file) return;
    writeFile(file, JSON.stringify(outbox)).catch(() => {});
  };

  // bring the main server's records for this player in (the match shows their real look and rank)
  // (never while that player is in a live raid here: the raid's own bookkeeping is on these)
  function seed(key, s) {
    if (!s || locked().has(key)) return;
    if (s.ranks) lobby.ranks.recs.set(key, structuredClone(s.ranks));
    else lobby.ranks.recs.delete(key);
    if (s.inventory) lobby.inventory.data.set(key, structuredClone(s.inventory));
    if (s.referrals) lobby.referrals.users.set(key, structuredClone(s.referrals));
    if (s.daily && lobby.daily) lobby.daily.users.set(key, structuredClone(s.daily));
  }

  // hello with an entry ticket: the session plays as that account
  function admit(cid, msg) {
    const s = lobby.sessions.get(cid);
    const tk = readTicket(secret, msg.ticket, now());
    if (!s || !tk || tk.k !== 'entry' || tk.region !== region) {
      lobby.send(cid, { t: 'err', code: 'edge_ticket', msg: 'This match server only takes players coming from the game. Reload the game.' });
      return;
    }
    s.token = tk.key;
    s.name = String(tk.name ?? msg.name ?? 'runner').slice(0, 16);
    s.dev = lobby.guard.dev(msg.dev);
    lobby.guard.see(tk.key, s.net, s.dev);
    seed(tk.key, tk.seeds);
    lobby.send(cid, { t: 'edge_ok', region, key: tk.key });
  }

  // ready with a stake ticket: escrow exactly what the main server took
  function ready(cid, msg) {
    const s = lobby.sessions.get(cid);
    const tk = readTicket(secret, msg.ticket, now());
    if (!s?.token || !tk || tk.k !== 'stake' || tk.region !== region || tk.key !== s.token || used.has(tk.id)) {
      lobby.send(cid, { t: 'err', msg: 'That stake could not be checked. Try Ready again.' });
      return;
    }
    if (!s.room || s.room.stake !== tk.mills) {
      lobby.send(cid, { t: 'err', msg: 'That stake is for another table.' });
      return;
    }
    used.add(tk.id);
    redeemed.push(tk.id);
    const room = s.room;
    // records may have moved on the main server since the entry ticket
    seed(tk.key, tk.seeds);
    lobby.wallet.credit(tk.key, tk.asset, BigInt(tk.units));
    lobby.handle(cid, { ...msg, t: 'ready', asset: tk.asset, _units: tk.units, ticket: undefined });
  }

  // keys with something at stake right now (escrowed in a ready room, or in a live raid unpaid)
  function locked() {
    const out = new Set();
    for (const room of lobby.rooms.values()) {
      for (const c of room.clients.values()) if (c.escrow) out.add(c.token);
      if (room.state === 'live') for (const a of room.accounts.values()) if (a?.units && a.paidUnits == null && a.credit == null) out.add(a.token);
    }
    return out;
  }

  // every couple of seconds: coins nobody has at stake go home, with the match bookkeeping
  async function flush() {
    const busy = locked();
    const credits = [];
    for (const [key, bal] of Object.entries(lobby.wallet.toJSON())) {
      if (busy.has(key)) continue;
      for (const [asset, u] of Object.entries(bal)) {
        const units = BigInt(u);
        if (units <= 0n) continue;
        if (lobby.wallet.debit(key, asset, units)) credits.push({ key, asset, units: units.toString() });
      }
    }
    const j = journal.splice(0, journal.length);
    const r = redeemed.splice(0, redeemed.length);
    if (credits.length || j.length || r.length) {
      outbox.push({ id: crypto.randomUUID(), region, at: now(), credits, journal: j, redeemed: r });
      persist();
    }
    await send();
  }

  async function send() {
    if (sending || !outbox.length) return;
    sending = true;
    try {
      while (outbox.length) {
        const body = JSON.stringify(outbox[0]);
        const res = await fetchImpl(`${mainUrl}/api/region/report`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-region-sig': sign(secret, body) }, body, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        outbox.shift();
        persist();
      }
    } catch (e) {
      log.warn(`region ${region}: report to the main server failed (${e?.message ?? e}); will retry`);
    } finally {
      sending = false;
    }
  }

  const timer = setInterval(() => flush().catch(() => {}), 2000);
  timer.unref?.();
  return { admit, ready, flush, send, locked, outbox: () => outbox };
}
