// The team's analytics page: one snapshot of the whole game (live, players, matches and modes, the
// shop, the fortune wheel, referrals, fair play, and on a real chain the cashier journal and what the
// house and fortune wallets hold on chain). Only for the admin wallets (ADMIN_WALLETS) or ADMIN_KEY.
import crypto from 'node:crypto';
import { dayOf } from '../shared/stats.js';
import { MODES } from '../shared/modes.js';

// the two team wallets from the closed beta; ADMIN_WALLETS=0x…,0x… replaces them
export const DEFAULT_ADMINS = ['0x03b318c215e22262cd9a5accf8a97bfefa0805dfe03ddfd370ed4db2f5f50e82', '0x04c5a81396849724434ca58bdccdc68177ac6db5ef219823361795fa877c043a'];
// the first commit of the game; GAME_LAUNCH_AT=<ISO time> sets another start for the timer
export const GAME_BORN = '2026-09-29T21:55:28Z';
const norm = (a) => {
  try {
    return `0x${BigInt(a).toString(16).padStart(64, '0')}`;
  } catch {
    return null;
  }
};

export function adminSet(env = process.env) {
  const list = (env.ADMIN_WALLETS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return new Set((list.length ? list : DEFAULT_ADMINS).map(norm).filter(Boolean));
}

export function createAnalytics({ stats, lobby, sockets, real = null, ranks, inventory, social, referrals, mail, fortune, guard, network = 'test', env = process.env, now = () => Date.now(), startedAt = Date.now() }) {
  const admins = adminSet(env);
  const isAdmin = (account) => !!account && admins.has(norm(account));
  const prices = lobby.prices;
  const sym = (id) => prices.get(id)?.symbol ?? real?.chain.tokens.find((t) => t.id === id)?.symbol ?? String(id).slice(0, 8);
  const dec = (id) => prices.get(id)?.decimals ?? real?.chain.tokens.find((t) => t.id === id)?.decimals ?? 18;
  const usdOf = (id, units) => (prices.has(id) ? prices.value(id, BigInt(units)) : null);

  // { token: units } → [{ id, symbol, decimals, units, mills }] and the $ total
  function basket(map) {
    const rows = [];
    let mills = 0;
    let unpriced = false;
    for (const [id, u] of Object.entries(map ?? {})) {
      if (BigInt(u) === 0n) continue;
      const m = usdOf(id, u);
      if (m === null) unpriced = true;
      else mills += m;
      rows.push({ id, symbol: sym(id), decimals: dec(id), units: String(u), mills: m });
    }
    rows.sort((a, b) => (b.mills ?? 0) - (a.mills ?? 0));
    return { rows, mills, unpriced };
  }

  // on-chain balances take a few RPC calls: kept for a minute
  let chainCache = null;
  async function onchainBalances() {
    if (!real) return null;
    if (chainCache && now() - chainCache.at < 60_000) return chainCache.v;
    const [house, fw] = await Promise.all([real.chain.houseBalances?.().catch((e) => ({ error: String(e?.message ?? e) })) ?? {}, real.chain.fortuneBalances?.().catch((e) => ({ error: String(e?.message ?? e) })) ?? {}]);
    const v = { house: house.error ? { error: house.error } : basket(house), fortune: fw.error ? { error: fw.error } : basket(fw) };
    chainCache = { at: now(), v };
    return v;
  }

  function cashierPart(series) {
    const c = real.cashier;
    const sum = (list, pick = () => true) => {
      const by = {};
      for (const x of list) if (pick(x)) by[x.token] = (BigInt(by[x.token] ?? 0) + BigInt(x.amount)).toString();
      return basket(by);
    };
    const okDep = (d) => !d.unsupported && !d.held;
    const deps = c.deposits;
    const wds = c.withdrawals;
    const byStatus = {};
    for (const w of wds) byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
    const depositors = new Set(deps.filter(okDep).map((d) => d.account));
    const withdrawers = new Set(wds.filter((w) => w.status === 'sent').map((w) => w.account));
    for (const d of deps) {
      if (!okDep(d)) continue;
      const row = series[dayOf(d.at)];
      if (row) row.dep += usdOf(d.token, d.amount) ?? 0;
    }
    for (const w of wds) {
      if (w.status !== 'sent') continue;
      const row = series[dayOf(w.at)];
      if (row) row.wd += usdOf(w.token, w.amount) ?? 0;
    }
    const tx = (x, kind) => ({ kind, at: x.at, account: x.account, symbol: sym(x.token), decimals: dec(x.token), units: String(x.amount), mills: usdOf(x.token, x.amount), status: x.status ?? (x.held ? `held:${x.held}` : x.unsupported ? 'unsupported' : 'ok'), route: x.route, tx: x.tx ?? x.id ?? null });
    const recent = [...deps.slice(-30).map((d) => tx(d, 'deposit')), ...wds.slice(-30).map((w) => tx(w, 'withdraw'))].sort((a, b) => b.at - a.at).slice(0, 40);
    const liab = basket(c.liabilities());
    const info = c.info();
    return {
      house: info.house,
      fortuneWallet: real.chain.fortuneAddress ?? null,
      explorer: info.explorer,
      routes: info.routes,
      cashOut: info.cashOut,
      paymaster: info.paymaster,
      paused: info.paused,
      beta: info.beta,
      allowlist: c.allow ? c.allow.size : 0,
      maxBalanceUsd: c.maxBalanceUsd || 0,
      maxTotalUsd: c.maxTotalUsd || 0,
      minWithdrawUsd: c.minWithdrawUsd,
      tokens: real.chain.tokens.map((t) => ({ id: t.id, symbol: t.symbol, usd: prices.has(t.id) ? prices.value(t.id, 10n ** BigInt(t.decimals)) / 1000 : null })),
      imported: c.imported.length,
      sessions: c.sessions.size,
      deposits: { n: deps.filter(okDep).length, held: deps.filter((d) => d.held).length, unsupported: deps.filter((d) => d.unsupported).length, depositors: depositors.size, total: sum(deps, okDep) },
      withdrawals: { n: wds.length, byStatus, withdrawers: withdrawers.size, sent: sum(wds, (w) => w.status === 'sent'), review: wds.filter((w) => w.status === 'review').map((w) => tx(w, 'withdraw')) },
      liabilities: liab,
      recent,
    };
  }

  async function snapshot() {
    const t = now();
    const DAY = 86_400_000;
    // ----- live
    let signedIn = 0;
    let inRooms = 0;
    for (const s of lobby.sessions.values()) {
      if (s.account) signedIn++;
      if (s.room) inRooms++;
    }
    const tables = lobby.tables().filter((r) => r.watching > 0 || r.state === 'live');
    let jackpots = 0;
    for (const r of lobby.rooms.values()) jackpots += r.jackpot ?? 0;

    // ----- players
    let wallets = 0;
    for (const p of stats.players.values()) if (p.w) wallets++;
    const rankDist = {};
    const career = {};
    const top = [];
    for (const [k, r] of ranks.recs) {
      const rk = ranks.get(k);
      rankDist[rk.rank] = (rankDist[rk.rank] ?? 0) + 1;
      for (const [s, v] of Object.entries(r.stats ?? {})) if (Number.isFinite(v)) career[s] = (career[s] ?? 0) + v;
      top.push({ key: k, xp: r.xp, rank: rk.rank });
    }
    top.sort((a, b) => b.xp - a.xp);
    const name = (k) => social.get?.(k)?.name ?? social.players.get(k)?.name ?? 'runner';

    // ----- locker / shop
    let credit = 0;
    let bought = 0;
    let spent = 0;
    let opened = 0;
    let skins = 0;
    let wskins = 0;
    let passes = 0;
    let buyers = 0;
    for (const r of inventory.data.values()) {
      credit += r.credit ?? 0;
      bought += r.bought ?? 0;
      spent += r.spent ?? 0;
      opened += r.opened ?? 0;
      skins += r.owned?.length ?? 0;
      wskins += r.wowned?.length ?? 0;
      if (r.pass?.premium) passes++;
      if ((r.bought ?? 0) > 0 || (r.spent ?? 0) > 0) buyers++;
    }
    const items = Object.entries(stats.items).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.cents - a.cents).slice(0, 15);

    // ----- referrals
    let invited = 0;
    let inviters = 0;
    let refEarned = 0;
    for (const r of referrals.users.values()) {
      if (r.by) invited++;
      if (r.refs?.length) inviters++;
      refEarned += r.earned ?? 0;
    }

    // ----- days (the last 60) with deposits and cash-outs folded in
    const series = {};
    for (let i = 59; i >= 0; i--) {
      const k = dayOf(t - i * DAY);
      series[k] = { day: k, ...(stats.days[k] ?? { active: 0, fresh: 0, wallets: 0, raids: 0, humans: 0, stakes: 0, rake: 0, paid: 0, shop: 0, buys: 0, spins: 0, peak: 0 }), dep: 0, wd: 0 };
    }
    const chain = real ? cashierPart(series) : null;
    const onchain = real ? await onchainBalances() : null;
    if (chain && onchain?.house?.rows) chain.coverage = onchain.house.mills - chain.liabilities.mills; // what the house holds over what it owes

    // ----- matches
    const modes = MODES.map((m) => ({ id: m.id, kind: m.kind, size: m.size, ...(stats.modes[m.id] ?? { raids: 0, humans: 0, stakes: 0, rake: 0, paid: 0, seconds: 0, last: 0 }) })).sort((a, b) => b.raids - a.raids);
    const totals = modes.reduce((a, m) => ({ raids: a.raids + m.raids, humans: a.humans + m.humans, stakes: a.stakes + m.stakes, rake: a.rake + m.rake, paid: a.paid + m.paid, seconds: a.seconds + m.seconds }), { raids: 0, humans: 0, stakes: 0, rake: 0, paid: 0, seconds: 0 });

    const mem = process.memoryUsage();
    return {
      at: t,
      network,
      game: { born: Date.parse(env.GAME_LAUNCH_AT || GAME_BORN) || Date.parse(GAME_BORN), statsSince: stats.born, serverUp: startedAt, boots: stats.boots, commit: (env.RAILWAY_GIT_COMMIT_SHA ?? '').slice(0, 7) || null, node: process.version, memMb: Math.round(mem.rss / 1048576) },
      live: { online: sockets.size, sessions: lobby.sessions.size, signedIn, inRooms, tables, jackpots, peak: stats.peak, hours: stats.hours.slice(-72) },
      players: {
        visitors: stats.players.size,
        wallets,
        profiles: social.players.size,
        active: { d1: stats.activeWithin(DAY), d7: stats.activeWithin(7 * DAY), d30: stats.activeWithin(30 * DAY) },
        fresh: { d1: Object.values(series).slice(-1)[0].fresh, d7: Object.values(series).slice(-7).reduce((n, d) => n + d.fresh, 0) },
        ranked: ranks.recs.size,
        rankDist,
        top: top.slice(0, 10).map((x) => ({ name: name(x.key), rank: x.rank, xp: x.xp, raids: ranks.recs.get(x.key)?.stats?.raids ?? 0 })),
        career,
        guilds: social.guilds.size,
        flagged: [...guard.flags].map(([k, v]) => ({ key: k, name: name(k), why: v.why, at: v.at })),
      },
      matches: { totals, modes, stakes: Object.entries(stats.stakesBy).map(([s, n]) => ({ stake: Number(s), n })).sort((a, b) => b.n - a.n), recent: stats.recent.slice(0, 25) },
      shop: { kinds: stats.shop, items, credit, bought, spent, opened, skins, wskins, passes, buyers, minted: inventory.supply?.() ?? {} },
      fortune: { ...fortune.toJSON(), mark: fortune.mark(), wins: fortune.wins.slice(0, 10) },
      referrals: { codes: referrals.codes.size, invited, inviters, earned: refEarned },
      mail: { broadcasts: mail.all.length, boxes: mail.users.size },
      chain,
      onchain,
      days: Object.values(series),
    };
  }

  // the request may come with a signed-in session (x-darkbags-session) or the team key (x-admin-key)
  function allowed(req) {
    const key = env.ADMIN_KEY;
    const given = String(req.headers['x-admin-key'] ?? '');
    if (key && key.length >= 16 && given.length === key.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key))) return true;
    const session = String(req.headers['x-darkbags-session'] ?? '');
    const account = real?.cashier.accountFor(session) ?? null;
    return isAdmin(account);
  }

  async function handle(req, res) {
    const reply = (code, body) => res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    if (!allowed(req)) return reply(403, { error: 'forbidden' });
    reply(200, await snapshot());
  }

  return { isAdmin, snapshot, handle };
}
