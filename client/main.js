import './polyfills.js'; // first: older phone browsers need it before anything draws
import './epoch.js'; // second: a new data epoch wipes old progress before anything reads it
import { createSocial } from './social.js';
import { CFG, SKINS } from '../shared/config.js';
import { WEAPONS } from '../shared/weapons.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sfx } from './sfx.js';
import { GameClient, Attract, fmt, mmss, esc } from './game.js';
import { WsTransport, LocalTransport } from './net.js';
import { store } from './store.js';
import { PriceBook, formatUnits, usdText } from '../shared/assets.js';
import { createCashierUi } from './cashier.js';
import { rankBadgeSvg } from './rankbadge.js';
import { createLocker, gunStill } from './locker.js';
import { figureStill } from './stickman.js';
import { openShare, wireShare } from './sharecard.js';
import { OUTFIT, OUTFITS, RARITIES, usd } from '../shared/cosmetics.js';
import { spinReel } from './reel.js';
import { createPass } from './pass.js';
import { createNews } from './news.js';
import { createRanked, neonText, neonColor } from './ranked.js';
import { createAchievements, achName, titleHtml } from './achievements.js';
import { titleTier } from '../shared/achievements.js';
import { createShop } from './shop.js';
import { createInventory } from './inventory.js';
import { createSwap } from './swap.js';
import { createChat } from './chat.js';
import { createSettingsUi } from './settingsui.js';
import { createTour } from './tour.js';
import { createIntro } from './intro.js';
import { createInvite, captureRef, deviceId } from './invite.js';
import { createMail } from './mail.js';
import { createFortune } from './fortune.js';
captureRef();
import { settings, setSetting, onSetting, QUALITY } from './settings.js';
import { MODE, MODES, ZOMBIE_WEAPONS } from '../shared/modes.js';
import { t, applyI18n, setLang, getLang, onLang, LANGS } from './i18n.js';

const $ = (id) => document.getElementById(id);
const STATIC = !!globalThis.DARK_BAGS_STATIC; // single-file build without its own server
const IN_ARTIFACT = !!globalThis.DARK_BAGS_ARTIFACT;

function normalizeServer(u) {
  let url = String(u).trim();
  if (!/^wss?:\/\//.test(url)) url = url.replace(/^http/, 'ws');
  if (!/^wss?:\/\//.test(url)) url = `wss://${url}`;
  if (!url.endsWith('/ws')) url = `${url.replace(/\/$/, '')}/ws`;
  return url;
}

// the public game server the GitHub Pages build plays on (override with ?server=…).
// Only list domains the project owns: an address listed here gets every player's session.
const DEFAULT_SERVER = 'wss://dark-bags-production.up.railway.app/ws';
const FALLBACK_SERVERS = [];

function onlineUrl() {
  let param = null;
  try {
    param = new URLSearchParams(location.search).get('server');
  } catch {
    /* no query string access */
  }
  if (param) return normalizeServer(param);
  if (globalThis.DARK_BAGS_SERVER) return normalizeServer(globalThis.DARK_BAGS_SERVER);
  // GitHub Pages has no game server behind it: it plays on the public one
  const staticHost = /\.github\.io$/.test(location.hostname);
  if (staticHost) return DEFAULT_SERVER;
  if (!STATIC && /^https?:$/.test(location.protocol)) return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return null;
}

// ------------------------------------------------------------------ setup
const renderer = new Renderer($('game'), $('minimap'));
const input = new Input($('game'));
const sfx = new Sfx();
const el = {
  hud: $('hud'),
  bag: $('bag'),
  pnl: $('pnl'),
  timer: $('timer'),
  storm: $('storm'),
  alive: $('alive'),
  golden: $('golden'),
  feed: $('feed'),
  banner: $('banner'),
  streak: $('streak'),
  extract: $('extract'),
  extName: $('ext-name'),
  extBar: $('ext-bar'),
  spect: $('spect'),
  ping: $('ping'),
  glShop: $('gl-shop'),
  glCr: $('gl-cr'),
  upHint: $('up-hint'),
  spText: $('sp-text'),
  coach: $('coach'),
  hpBar: $('hp-bar'),
  hpNum: $('hp-num'),
  dashChip: $('dash-chip'),
  bluffChip: $('bluff-chip'),
  weapon: $('weapon'),
  prestige: $('prestige'),
  ladder: (() => {
    // one notch per weapon on the arms-race ladder
    const l = $('ladder');
    l.innerHTML = WEAPONS.map(() => '<i></i>').join('');
    l.style.setProperty('--n', WEAPONS.length);
    return l;
  })(),
  ammo: $('ammo'),
  ammoNum: $('ammo-num'),
  ammoBar: $('ammo-bar'),
  xpBar: $('xp-bar'),
  nextWeapon: $('next-weapon'),
};
const SERVER = onlineUrl();
// stakes are in thousandths of a dollar: any whole number of cents from $0.10 to $10,000
const STAKE_MIN = 100;
const STAKE_MAX = 10_000_000;
const validStake = (v) => Number.isInteger(v) && v >= STAKE_MIN && v <= STAKE_MAX && v % 10 === 0;
const app = {
  mode: null,
  transport: null,
  status: 'connecting',
  token: null,
  balances: null, // { asset: units string } — private pool balances (test tokens in test mode)
  assets: [],
  prices: new PriceBook([]),
  asset: store.get('darkbags.asset', 'USDC'),
  tables: [],
  _stake: validStake(store.get('darkbags.stake', 1000)) ? store.get('darkbags.stake', 1000) : 1000,
  zweapon: ZOMBIE_WEAPONS.includes(store.get('darkbags.zweapon', 'rifle')) ? store.get('darkbags.zweapon', 'rifle') : 'rifle',
  name: store.get('darkbags.name', ''),
  skin: SKINS.includes(store.get('darkbags.skin', '')) ? store.get('darkbags.skin') : SKINS[Math.floor(Math.random() * SKINS.length)],
  gore: settings.gore,
  gameMode: store.get('darkbags.gmode', 'raid'),
  page: 'play',
  screen: 'lobby',
  prep: null,
  locker: null, // { marks, scrap, owned, outfit, body, pity }
  rank: null, // { rank, name, xp, into, need, toNext, max } for this mode (practice ranks live in the browser)
  lastCount: null,
  inRoom: false,
};
// the stake you play at: zombies and the gold rush take one flat entry, whatever you picked
Object.defineProperty(app, 'stake', {
  get: () => MODE[app.gameMode]?.fixed ?? app._stake,
  set: (v) => {
    app._stake = v;
  },
  enumerable: true,
});
const send = (m) => app.transport?.send(m);
const game = new GameClient({ renderer, input, sfx, send, el });
game.ping = () => (app.mode === 'online' && app.ping != null ? app.ping : null); // own round trip, online only
// share cards: everything that happens can be posted
// the runner as others see them: outfit, body and every weapon skin they have equipped
const myLook = () => {
  const L = app.locker;
  const ws = {};
  for (const [w, f] of Object.entries(L?.wequip ?? {})) if (!L.wowned || L.wowned.includes(`${w}.${f}`) || (L.wtrials?.[`${w}.${f}`] ?? 0) > Date.now()) ws[w] = f;
  return { outfit: L?.outfit ?? 'basic-0', body: L?.body ?? 'm', ws };
};
function shareMoment(kind, data = {}) {
  return openShare(kind, { look: myLook(), rank: app.rank?.rank ?? 1, player: (app.name || '').trim() || null, ...data });
}
wireShare();

// real-token mode (server started with CHAIN=…): sign-in, deposits, cash-outs
const cashier = createCashierUi({ app, send, toast: (m) => toast(m), onChange: () => renderLobby(), base: SERVER ? SERVER.replace(/^ws/, 'http').replace(/\/ws$/, '/') : location.href });
// the menu pages
const locker = createLocker({ app, send, sfx, toast: (m) => toast(m), openShop: () => go('shop') });
const ach = createAchievements({ app, send, sfx, toast: (m) => toast(m), open: () => go('achievements') });
const fortune = createFortune({ app, send, sfx, toast: (m) => toast(m), share: (kind, data) => shareMoment(kind, data) });
const shop = createShop({ app, send, sfx, toast: (m) => toast(m), share: (kind, data) => shareMoment(kind, data), equip: (r) => send({ t: r.kind === 'weapon' ? 'wequip' : 'equip', id: r.item }), onRender: (root) => fortune.mount(root) });
const inventory = createInventory({ app, send, openBox: (id) => shop.open(id), go: (p, fam) => go(p, fam), openLocker: () => locker.open('outfits'), openCashier: () => cashier.openCashier() });
const swap = createSwap({ app, send, toast: (m) => toast(m), cashier, signIn: () => $('connect').click() });
const chat = createChat({ app, send, isOpen: () => app.page === 'chat' && app.screen === 'lobby' });
const settingsUi = createSettingsUi();
// Nyx's first-run tour: on the first launch here, and the first time a wallet signs in
const tour = createTour({
  app,
  go: (p) => go(p),
  toast: (m) => toast(m),
  touch: () => input.touchOn,
  sfx,
  game,
  pickRaid: () => {
    app.gameMode = 'raid';
    store.set('darkbags.gmode', 'raid');
    // the guided raid is played for $1 of practice money
    if (app.stake !== 1000) app.stake = 1000;
    renderLobby();
  },
  // the guided raid: easy bots, only a few, and four minutes to find an exit (then back to
  // the player's own practice settings)
  tune: (on) => {
    if (app.mode !== 'practice') return;
    if (on) send({ t: 'practice_cfg', difficulty: 'easy', runners: 6, seconds: 240 });
    else sendPracticeCfg();
  },
  practice: () => {
    if (app.mode !== 'practice') setMode('practice');
    go('play');
    setTimeout(() => $('play').click(), 500);
  },
});
document.addEventListener('darkbags:tour', () => tour.start());

// ------------------------------------------------------------------ pages
// friends, messages, profiles, guilds and room invites
const social = createSocial({
  app,
  send,
  toast: (m) => toast(m),
  isOpen: (page) => app.screen === 'lobby' && app.page === page,
  joinRoom: (mode, stake) => {
    if (app.inRoom) {
      send({ t: 'unready' });
      send({ t: 'leave' });
    }
    app.gameMode = mode;
    app.stake = stake;
    store.set('darkbags.gmode', mode);
    store.set('darkbags.stake', stake);
    go('play');
    goToTable();
  },
});
const news = createNews();
document.addEventListener('darkbags:news', () => news.open());
const pass = createPass({ app, send, sfx, toast: (m) => toast(m), openBox: (id) => shop.open(id) });
const ranked = createRanked({ app, send, sfx, toast: (m) => toast(m), go: (p) => go(p), openBox: (id) => shop.open(id) });
const invite = createInvite({ app, send, sfx, toast: (m) => toast(m) });
const mail = createMail({
  app,
  send,
  sfx,
  toast: (m) => toast(m),
  onUnread: (n) => {
    const b = document.querySelector('.nav-btn[data-page="mail"] .nav-badge');
    if (b) {
      b.hidden = !n;
      b.textContent = n > 9 ? '9+' : String(n);
    }
  },
});
const PAGES = { shop, inventory, swap, chat, settings: settingsUi, friends: social, guilds: social.guildsPage, pass, ranked, invite, mail };
document.addEventListener('darkbags:mode', () => {
  store.set('darkbags.gmode', app.gameMode);
  renderLobby();
});
function go(page, extra) {
  if (!document.querySelector(`.page[data-page="${page}"]`)) page = 'play';
  app.page = page;
  store.set('darkbags.page', page);
  for (const p of document.querySelectorAll('.page')) p.hidden = p.dataset.page !== page;
  for (const b of document.querySelectorAll('.nav-btn')) b.setAttribute('aria-current', String(b.dataset.page === page));
  if (page === 'achievements') ach.renderList();
  if (page === 'shop' && extra) shop.family?.(extra);
  if (page === 'pass') {
    const b = document.querySelector('.nav-btn[data-page="pass"] .nav-badge');
    if (b) b.hidden = true;
  }
  PAGES[page]?.render();
  document.querySelector('.pages').scrollTo?.({ top: 0 });
  sfx.play('beep', { f: 990, dur: 0.02 });
}
for (const b of document.querySelectorAll('.nav-btn')) b.addEventListener('click', () => go(b.dataset.page));
app.go = go;
$('tb-wallet').addEventListener('click', () => go('inventory'));
$('tb-credit').addEventListener('click', () => go('shop'));
const attract = new Attract(renderer);

// ---------------------------------------------------------------- screens
function showScreen(name) {
  app.screen = name;
  tour.onScreen(name);
  if (name !== 'game' && !$('pause').hidden) closePause();
  $('lobby').hidden = name !== 'lobby';
  $('prep').hidden = name !== 'prep';
  $('result').hidden = name !== 'result';
  $('touch').hidden = !(name === 'game' && input.touchOn);
  updateRotate();
  if (name === 'lobby' || name === 'prep') {
    if (game.active) game.stop();
    if (!attract.world) attract.start();
    sfx.music?.set({ mode: name === 'prep' ? 'prep' : 'lobby', intensity: 0, bpm: name === 'prep' ? 124 : 96 });
  }
  if (name === 'result') el.hud.hidden = true;
  if (name === 'lobby') renderLobby();
  if (name === 'prep') renderPrep();
}

let toastT = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 3500);
}

// ----------------------------------------------------------------- money
// Players see one unit: $. Every coin is shown at its $ value; stakes are $ amounts.
const money = (mills) => usdText(mills);

const units = (a) => BigInt(app.balances?.[a] ?? '0');
const assetInfo = (a) => app.prices.get(a) ?? { id: a, symbol: a.slice(0, 8), decimals: 18, color: '#8d93a6' };
// the whole wallet in $ (mills)
function walletValue() {
  let t = 0;
  for (const [a, u] of Object.entries(app.balances ?? {})) t += app.prices.value(a, BigInt(u));
  return t;
}
function quote(stake = app.stake, a = app.asset) {
  return app.prices.quote(a, stake);
}
function tokenAmount(a, u) {
  const info = assetInfo(a);
  const digits = info.decimals > 8 ? 4 : Math.min(info.decimals, 6);
  return `${formatUnits(u, info.decimals, digits)} ${info.symbol}`;
}
// "6.667 STRK ($1)" for coins, just "$1" for stablecoins
function coinAndUsd(a, u) {
  const v = money(app.prices.value(a, BigInt(u)));
  return assetInfo(a).stable ? v : `${tokenAmount(a, u)} (${v})`;
}
function pickUsableAsset() {
  if (app.prices.has(app.asset) && units(app.asset) >= (quote() ?? 0n) && units(app.asset) > 0n) return;
  const ok = app.assets.find((a) => app.prices.has(a.id) && units(a.id) >= quote(app.stake, a.id));
  if (ok) app.asset = ok.id;
}

function renderAssets() {
  const list = $('assets');
  // every coin the game prices, plus anything else the player holds; richest first
  const ids = [...new Set([...app.assets.map((a) => a.id), ...Object.keys(app.balances ?? {})])].sort(
    (x, y) => app.prices.value(y, units(y)) - app.prices.value(x, units(x)),
  );
  list.replaceChildren(
    ...ids.map((id) => {
      const info = assetInfo(id);
      const u = units(id);
      const priced = app.prices.has(id);
      const need = priced ? quote(app.stake, id) : null;
      const short = need !== null && u < need;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `asset${short ? ' short' : ''}`;
      b.disabled = !priced || u === 0n;
      b.setAttribute('aria-pressed', String(id === app.asset));
      b.title = priced ? `${info.symbol} ≈ ${usdText(app.prices.value(id, 10n ** BigInt(info.decimals)))}` : 'No price for this coin right now';
      const needText = need === null ? 'no price now' : info.stable ? `stake ${money(app.stake)}` : `stake ${tokenAmount(id, need)}`;
      b.innerHTML = `<span class="dot" style="background:${info.color}"></span><span class="sym">${esc(info.symbol)}</span><span class="amt">${priced ? money(app.prices.value(id, u)) : esc(formatUnits(u, info.decimals, 4))}</span><span class="need">${esc(needText)}</span>`;
      b.addEventListener('click', () => {
        app.asset = id;
        store.set('darkbags.asset', id);
        renderLobby();
      });
      return b;
    }),
  );
  const info = assetInfo(app.asset);
  $('paywith').hidden = app.balances === null || !ids.length;
  // one short line under Play: what the stake costs, or what's wrong
  const q = quote();
  const qEl = $('quote');
  qEl.classList.remove('bad');
  if (q === null) {
    qEl.textContent = t('q.pick');
  } else if (units(app.asset) < q) {
    qEl.textContent = t(cashier.active ? 'q.shortDeposit' : 'q.short', { c: info.symbol, s: money(app.stake) });
    qEl.classList.add('bad');
  } else if (info.stable) {
    qEl.textContent = t('q.stable', { s: money(app.stake), c: info.symbol });
  } else {
    qEl.textContent = t('q.coin', { a: tokenAmount(app.asset, q), s: money(app.stake), c: info.symbol });
  }
}

// ------------------------------------------------------------------ lobby
function tableInfo(stake) {
  return app.tables.find((x) => x.stake === stake && (x.mode ?? 'raid') === app.gameMode);
}

// the mode picker: a card per mode with what it is and how the money works
const MODE_ICON = { zombies: '🧟', gold: '💰', ranked: '🏆', raid: '🎒', br: '👑', duel: '⚔️', dm: '💀', gl: '🛰️', hardcore: '☠️', knives: '🔪', pistols: '🔫', shotguns: '💥', rifles: '🎯', snipers: '🔭', team2: '👥', team4: '🛡️', team8: '🏴' };
function renderModes() {
  const box = $('modes');
  // ranked is online only: practice never shows it
  const practice = app.mode === 'practice';
  if (practice && MODE[app.gameMode]?.ranked) app.gameMode = 'raid';
  box.replaceChildren(
    ...MODES.filter((m) => !(practice && m.ranked)).map((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mode-card k-${m.kind}`;
      b.dataset.mode = m.id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(m.id === app.gameMode));
      const rows = app.tables.filter((x) => x.mode === m.id);
      const waiting = rows.reduce((s, x) => s + (x.state === 'prep' ? x.ready ?? 0 : 0), 0);
      const live = rows.reduce((s, x) => s + (x.humans ?? 0), 0);
      const size = m.kind === 'zombie' ? `1–${m.size}` : m.kind === 'team' ? `${m.teamSize} v ${m.teamSize}` : m.id === 'duel' ? '1 v 1' : app.mode === 'practice' && m.kind !== 'team' ? `${pcfg.runners}` : `${m.size}`;
      b.innerHTML = `<span class="mc-ico" aria-hidden="true">${MODE_ICON[m.id] ?? '•'}</span><b>${esc(t(`mode.${m.id}`))}</b><span class="mc-sub">${esc(t(`mode.${m.id}.d`))}</span><span class="mc-meta">${esc(size)} · ${esc(t(`kind.${m.kind}`))}${m.rounds ? ` · ${esc(t('mc.rounds', { n: m.rounds * 2 - 1, w: m.rounds }))}` : ''}${live ? ` · <i class="live-dot"></i>${live}` : ''}</span>${waiting ? `<span class="mc-wait">⏳ ${esc(t('mc.waiting', { n: waiting }))}</span>` : ''}`;
      b.addEventListener('click', () => {
        if (document.body.classList.contains('tour-raid-only') && m.id !== 'raid') return; // Nyx's first raid is a Raid
        app.gameMode = m.id;
        store.set('darkbags.gmode', m.id);
        sfx.play('beep', { f: 1180, dur: 0.03 });
        renderLobby();
      });
      return b;
    }),
  );
}

// ------------------------------------------------------ getting started
// A four-step checklist for a new player on a real-token server: sign in, add funds,
// pick the coin to stake, play the first online match. One clear action at a time;
// it goes away once the first match is played.
function renderStarter() {
  const box = $('starter');
  const show = app.mode === 'online' && !!app.chain && app.status === 'open' && !store.get('darkbags.starterDone', false);
  box.hidden = !show;
  if (!show) return;
  const signed = cashier.signedIn;
  const funded = signed && walletValue() > 0;
  const q = quote();
  const coin = funded && q !== null && units(app.asset) >= q;
  const played = !!store.get('darkbags.firstOnline', false);
  const steps = [
    { id: 'signin', done: signed, act: () => $('connect').click() },
    { id: 'fund', done: funded, act: () => cashier.openCashier('deposit') },
    { id: 'coin', done: coin, act: () => $('paywith').scrollIntoView({ behavior: 'smooth', block: 'center' }) },
    { id: 'play', done: played, act: () => $('play').click() },
  ];
  const cur = steps.findIndex((s) => !s.done);
  if (cur === -1) {
    store.set('darkbags.starterDone', true);
    box.hidden = true;
    return;
  }
  $('starter-prog').textContent = `${steps.filter((s) => s.done).length}/4`;
  const ol = $('starter-steps');
  ol.replaceChildren(
    ...steps.map((s, i) => {
      const li = document.createElement('li');
      li.className = s.done ? 'done' : i === cur ? 'now' : 'next';
      const extra = s.id === 'fund' && app.chain?.network === 'sepolia' ? ` ${t('st.fundTest')}` : '';
      li.innerHTML = `<span class="st-dot" aria-hidden="true">${s.done ? '✓' : i + 1}</span><div class="st-body"><b>${esc(t(`st.${s.id}`))}</b><span>${esc(t(`st.${s.id}.d`))}${esc(extra)}</span></div>`;
      if (i === cur) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cta st-go';
        b.textContent = t(`st.${s.id}.go`);
        b.addEventListener('click', s.act);
        li.append(b);
      }
      return li;
    }),
  );
}

function renderLobby() {
  renderStarter();
  const onlineBtn = $('mode-online');
  onlineBtn.disabled = !SERVER;
  onlineBtn.title = SERVER ? '' : 'No game server configured for this build';
  onlineBtn.setAttribute('aria-selected', String(app.mode === 'online'));
  $('mode-practice').setAttribute('aria-selected', String(app.mode === 'practice'));

  const st = $('net-status');
  st.classList.toggle('bad', app.status === 'closed' || app.status === 'error');
  if (app.mode === 'practice') st.textContent = t('net.practice');
  else if (app.status === 'open') st.textContent = t('net.open');
  // how many people are on the server right now (online only)
  const on = $('tb-online');
  on.hidden = !(app.mode === 'online' && app.status === 'open' && app.online);
  if (!on.hidden) {
    // phones: just the number next to the live dot; the full label on wider screens
    on.querySelector('b').textContent = innerWidth < 560 ? String(app.online) : t('net.online', { n: app.online });
    on.title = t('net.online', { n: app.online });
  }
  // a free host sleeps when idle: the first connection can take up to a minute
  else if (!app.everOpen && performance.now() - (app.connectT ?? 0) > 4000) st.textContent = t('net.waking');
  else if (app.status === 'connecting') st.textContent = t('net.connecting');
  else st.textContent = t('net.down');

  const list = $('tables');
  const fixed = MODE[app.gameMode]?.fixed;
  list.classList.toggle('fixed', !!fixed);
  list.replaceChildren(
    ...(fixed ? [fixed] : CFG.TIERS).map((stake) => {
      const tb = tableInfo(stake);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'table-btn';
      b.setAttribute('aria-pressed', String(stake === app.stake));
      let state = '';
      let cls = '';
      if (tb?.state === 'live') {
        state = t('tb.live', { t: mmss(tb.tl) });
        cls = 'live';
      } else if (tb?.state === 'prep' && tb.count !== null && tb.count !== undefined) {
        state = t('tb.ready', { n: tb.ready, s: tb.count });
        cls = 'live';
      } else if (tb?.state === 'prep' && tb.ready) {
        // players sitting in this room waiting for more: the best reason to join it
        state = t('tb.readyWait', { n: tb.ready });
        cls = 'wait';
      } else if (tb?.state === 'prep' && tb.watching) state = t('tb.waiting', { n: tb.watching });
      if (tb?.nextGolden && tb.state !== 'live') {
        state = t('tb.golden');
        cls = 'gold';
      } else if (!state && tb?.jackpot > 0) state = t('tb.jackpot', { v: money(tb.jackpot) });
      if (fixed && !state) state = t(MODE[app.gameMode].kind === 'zombie' ? 'tb.zFee' : 'tb.goldFee');
      b.innerHTML = `<span class="stake">${money(stake)}</span>${state ? `<span class="state ${cls}">${esc(state)}</span>` : ''}`;
      b.addEventListener('click', () => {
        app.stake = stake;
        store.set('darkbags.stake', stake);
        renderLobby();
      });
      return b;
    }),
    ...(fixed ? [] : [customStake()]),
  );

  $('gore').checked = app.gore;

  cashier.render();
  const real = cashier.active;
  $('balance').textContent = app.balances === null ? '—' : money(walletValue());
  $('faucet').hidden = real || !(app.balances !== null && walletValue() < Math.max(...CFG.TIERS));
  pickUsableAsset();
  renderAssets();
  renderRankCard();
  renderModes();
  renderPracticeCfg();
  locker.renderTile();
  const play = $('play');
  const needSignIn = real && !cashier.signedIn;
  play.disabled = app.status !== 'open' || needSignIn;
  play.textContent = needSignIn ? t('lobby.signIn') : t('lobby.play', { s: money(app.stake) });
}

// ------------------------------------------------------- practice settings
const pcfg = {
  difficulty: ['easy', 'normal', 'hard'].includes(store.get('darkbags.pdiff', 'easy')) ? store.get('darkbags.pdiff', 'easy') : 'easy',
  runners: Math.min(16, Math.max(2, Number(store.get('darkbags.prunners', CFG.BOT_FILL)) || CFG.BOT_FILL)),
  seconds: Math.min(600, Math.max(60, Number(store.get('darkbags.ptime', CFG.ROUND_SECONDS)) || CFG.ROUND_SECONDS)),
};
function sendPracticeCfg() {
  if (app.mode === 'practice') send({ t: 'practice_cfg', ...pcfg });
}
function renderPracticeCfg() {
  $('pcfg').hidden = app.mode !== 'practice';
  for (const b of $('pcfg-diff').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === pcfg.difficulty));
  $('pcfg-runners').value = pcfg.runners;
  $('pcfg-runners-v').textContent = pcfg.runners;
  $('pcfg-time').value = pcfg.seconds;
  $('pcfg-time-v').textContent = mmss(pcfg.seconds);
  $('pcfg-sum').textContent = `${t(`pcfg.${pcfg.difficulty}`)} · ${pcfg.runners} · ${mmss(pcfg.seconds)}`;
}
for (const b of $('pcfg-diff').querySelectorAll('button'))
  b.addEventListener('click', () => {
    pcfg.difficulty = b.dataset.v;
    store.set('darkbags.pdiff', pcfg.difficulty);
    renderPracticeCfg();
    sendPracticeCfg();
  });
$('pcfg-runners').addEventListener('input', (e) => {
  pcfg.runners = Number(e.target.value);
  store.set('darkbags.prunners', pcfg.runners);
  renderPracticeCfg();
  sendPracticeCfg();
});
$('pcfg-time').addEventListener('input', (e) => {
  pcfg.seconds = Number(e.target.value);
  store.set('darkbags.ptime', pcfg.seconds);
  renderPracticeCfg();
  sendPracticeCfg();
});

// ------------------------------------------------------------------ rank
const pct = (r) => (r.max ? 100 : Math.max(0, Math.min(100, (r.into / r.need) * 100)));

function renderRankCard() {
  const el = $('rank-card');
  const r = app.rank;
  el.hidden = !r;
  if (!r) return;
  el.innerHTML = `${rankBadgeSvg(r.rank, 34)}<div class="rk-body"><p class="rk-title"><b>${esc(r.name)}</b><span class="rk-xp">${r.max ? t('rk.max') : t('rk.toNext', { x: fmt(r.toNext), r: r.rank + 1 })}</span></p><div class="rk-bar"><i style="width:${pct(r)}%"></i></div></div>`;
  el.title = t('rk.of', { r: r.rank });
}

// XP line labels come from the server in English; translate the known ones
function xpLabel(p) {
  if (p.ach) return `★ ${achName(p.ach)}`;
  const m = /^(\d+) kills?$/.exec(p.label);
  if (m) return t('xp.kills', { n: m[1] });
  const k = `xp.${p.label}`;
  const s = t(k);
  return s === k ? p.label : s;
}

// the result card: XP earned, what for, and the bar filling (twice on a rank-up)
function renderRankResult(res) {
  const el = $('res-rank');
  if (!res) {
    el.hidden = true;
    return;
  }
  const { before, after, gained, parts } = res;
  const up = after.rank > before.rank;
  el.hidden = false;
  // practice pays no XP or rewards: say so instead of a "+0"
  if (app.mode === 'practice') {
    el.classList.remove('up');
    el.innerHTML = `<div class="rr-head">${rankBadgeSvg(before.rank, 52)}<div class="rk-body"><p class="rk-title"><span class="eyebrow">${t('rk.rank')} ${before.rank}</span> <b>${esc(before.name)}</b></p><p class="rr-gain">${t('res.practiceNoXp')}</p></div></div>`;
    return;
  }
  el.classList.toggle('up', up);
  el.innerHTML = `<div class="rr-head">${rankBadgeSvg(before.rank, 52)}<div class="rk-body"><p class="rk-title"><span class="eyebrow">${t('rk.rank')} ${before.rank}</span> <b>${esc(before.name)}</b></p><div class="rk-bar"><i style="width:${pct(before)}%"></i></div><p class="rr-gain"><b>+${fmt(gained)}</b> ${t('rk.xp')}</p></div></div>
    <ul class="rr-parts">${parts.map((p) => `<li><span>${esc(xpLabel(p))}</span><b>${p.xp >= 0 ? '+' : '−'}${fmt(Math.abs(p.xp))}</b></li>`).join('')}</ul>`;
  const bar = el.querySelector('.rk-bar i');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      bar.style.width = up ? '100%' : `${pct(after)}%`;
      if (!up) return;
      setTimeout(() => {
        el.querySelector('.rr-head').innerHTML = `${rankBadgeSvg(after.rank, 52)}<div class="rk-body"><p class="rk-title"><span class="eyebrow rr-up">${t('rk.up')} · ${after.rank}</span> <b>${esc(after.name)}</b></p><div class="rk-bar"><i style="width:0%"></i></div><p class="rr-gain"><b>+${fmt(gained)}</b> ${t('rk.xp')}</p></div>`;
        sfx.play('beep', { f: 1480, dur: 0.25 });
        const b2 = el.querySelector('.rk-bar i');
        requestAnimationFrame(() => requestAnimationFrame(() => (b2.style.width = `${pct(after)}%`)));
      }, 900);
    }),
  );
}

// rank-up reward on the result card: a 72h trial outfit per rank gained
function renderRewards(m) {
  const el = $('res-rewards');
  const trials = (m.rewards ?? []).map((r) => r.trial).filter(Boolean);
  el.hidden = !(m.rewards ?? []).length;
  if (el.hidden) return;
  el.innerHTML = `<p class="eyebrow">${t('rw.title')}</p><ul>${trials
    .map((tr) => {
      const o = OUTFIT[tr.id];
      const c = RARITIES[o.rarity].color;
      return `<li style="--q:${c}"><img class="rw-fig" src="${figureStill({ outfit: tr.id, body: app.locker?.body ?? 'm' }, 56, 78)}" alt=""><div><b>${esc(o.name)}</b><span class="rw-rar">${esc(t(`r.${o.rarity}`))}</span><span class="fine">${t('rw.trial')}</span></div></li>`;
    })
    .join('')}</ul><div class="rw-actions"><button type="button" class="ghost" data-rw="locker">${t('rw.try')}</button><button type="button" class="ghost share" data-rw="share">${t('rw.share')}</button></div>`;
  el.querySelector('[data-rw="locker"]').addEventListener('click', () => locker.open('outfits'));
  el.querySelector('[data-rw="share"]').addEventListener('click', () => shareMoment('rankUp', { rank: m.rank.after.rank, rewards: m.rewards }));
}

// A new rank: the whole screen celebrates, then a case spins and lands on the outfit the
// rank pays (yours to wear for 72 hours). Tap anywhere after it lands to carry on.
function rankUpShow(m, next = () => {}) {
  const up = m.rank && m.rank.after.rank > m.rank.before.rank;
  if (!up) return next();
  const el = $('rankup');
  const after = m.rank.after;
  const trial = (m.rewards ?? []).map((r) => r.trial).filter(Boolean).at(-1);
  const confetti = Array.from({ length: 46 }, (_, i) => `<i style="--x:${Math.random() * 100}%;--d:${(Math.random() * 1.2).toFixed(2)}s;--c:${['#ffd166', '#ff3d7f', '#00f0ff', '#7dff9b', '#b37bff', '#f7931a'][i % 6]};--r:${Math.round(Math.random() * 360)}deg"></i>`).join('');
  el.innerHTML = `<div class="ru-rays"></div><div class="ru-confetti">${confetti}</div>
    <div class="ru-stage">
      <div class="ru-head"><div class="ru-badge">${rankBadgeSvg(after.rank, 150)}</div>
        <p class="ru-kicker">${t('rk.newRank')}</p>
        <p class="ru-name"><span>${after.rank}</span> ${esc(after.name)}</p></div>
      <div class="ru-reel" id="ru-reel"></div>
      <div class="ru-actions" id="ru-actions"></div>
    </div>`;
  el.hidden = false;
  el.className = 'rankup in';
  sfx.music?.sting(true);
  sfx.play('bag');
  const finish = () => {
    const acts = $('ru-actions');
    acts.innerHTML = `${trial ? `<p class="ru-won" style="--q:${RARITIES[OUTFIT[trial.id].rarity].color}"><b>${esc(OUTFIT[trial.id].name)}</b> · ${t('rw.trial')}</p>` : ''}
      <div class="ru-btns">${trial ? `<button type="button" class="cta" data-ru="try">${t('rw.try')}</button>` : ''}<button type="button" class="ghost share" data-ru="share">${t('rw.share')}</button><button type="button" class="ghost" data-ru="close">${t('rw.continue')}</button></div>`;
    const close = () => {
      el.hidden = true;
      el.className = 'rankup';
      next();
    };
    acts.querySelector('[data-ru="try"]')?.addEventListener('click', () => {
      close();
      locker.open('outfits');
    });
    acts.querySelector('[data-ru="share"]').addEventListener('click', () => shareMoment('rankUp', { rank: after.rank, rewards: m.rewards }));
    acts.querySelector('[data-ru="close"]').addEventListener('click', close);
  };
  if (!trial) return setTimeout(finish, 1600);
  // the case: rank-up odds, outfits you could have got, landing on the one you did
  const pool = OUTFITS.filter((o) => !o.basic && !o.limited && o.rarity !== 'exotic');
  const pick = [];
  for (const r of ['rare', 'epic', 'legendary', 'mythic']) {
    const of = pool.filter((o) => o.rarity === r);
    for (let k = 0; k < Math.min(8, of.length); k++) pick.push(of.splice(Math.floor(Math.random() * of.length), 1)[0]);
  }
  const tile = (o) => ({ id: o.id, name: o.name, rarity: o.rarity, img: figureStill({ outfit: o.id, body: app.locker?.body ?? 'm' }, 56, 78) });
  setTimeout(() => {
    el.classList.add('spin');
    spinReel($('ru-reel'), { pool: pick.map(tile), win: tile(OUTFIT[trial.id]), odds: { rare: 55, epic: 30, legendary: 12, mythic: 3 }, sfx, motion: settings.motion, secs: 5.2, label: t('rw.title') }).then(() => {
      sfx.play('beep', { f: 1600, dur: 0.15 });
      el.classList.add('landed');
      finish();
    });
  }, settings.motion ? 2300 : 0);
}

// your own stake: type any amount from $0.10 to $10,000
function customStake() {
  const own = !CFG.TIERS.includes(app.stake);
  const wrap = document.createElement('label');
  wrap.className = `table-btn stake-own${own ? ' on' : ''}`;
  wrap.setAttribute('aria-pressed', String(own));
  wrap.innerHTML = `<span class="stake-own-k">${esc(t('stake.own'))}</span><span class="stake-own-in">$<input type="number" inputmode="decimal" min="0.1" max="10000" step="0.01" value="${own ? (app.stake / 1000).toFixed(2).replace(/\.00$/, '') : ''}" placeholder="0.10 – 10 000" aria-label="${esc(t('stake.own'))}"></span>`;
  const input = wrap.querySelector('input');
  const apply = () => {
    if (!input.value) return;
    const v = Math.round(Number(String(input.value).replace(',', '.')) * 100) * 10; // whole cents
    if (!validStake(v)) {
      toast(t('stake.range'));
      return;
    }
    app.stake = v;
    store.set('darkbags.stake', v);
    renderLobby();
  };
  // re-render after the change event has finished (the input is replaced by the render)
  input.addEventListener('change', () => setTimeout(apply, 0));
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  return wrap;
}

// ------------------------------------------------------------- ready room
const figureSvg = (color) =>
  `<svg viewBox="0 0 40 56" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="10" r="7"/><path d="M20 17 V34 M20 22 L10 31 M20 22 L32 25 M20 34 L12 51 M20 34 L28 51"/></g></svg>`;

function renderPrep() {
  const p = app.prep;
  if (!p) return;
  const fixedMode = MODE[app.gameMode]?.fixed;
  $('prep-kicker').textContent = fixedMode ? `${t(`mode.${app.gameMode}`)} · ${t('prep.zFee', { v: money(p.stake) })}` : `${t('prep.raid', { n: p.round, s: money(p.stake) })}${p.golden ? ` · ${t('hud.golden')}` : ''}`;
  const count = $('prep-count');
  const status = $('prep-status');
  count.classList.remove('wait');
  if (p.state === 'live') {
    count.textContent = mmss(p.tl);
    status.textContent = t('prep.live');
  } else if (p.state === 'results') {
    count.textContent = `${p.resT}`;
    status.textContent = t('prep.over');
  } else if (p.waiting && p.slots.length) {
    // online: no timer and no bots. Wait for friends, start once enough players are in
    count.textContent = t('prep.waiting');
    count.classList.remove('tick');
    count.classList.add('wait');
    status.textContent = p.me?.ready ? t(p.min > 1 ? 'prep.waitingPeople' : 'prep.waitingMe', { n: p.slots.length, of: p.slotsTotal, min: p.min }) : t('prep.waitingJoin', { n: p.slots.length, of: p.slotsTotal });
  } else if (p.count === null) {
    count.textContent = t('prep.readyUp');
    status.textContent = t(p.waiting ? 'prep.firstWait' : 'prep.first');
  } else {
    const n = Math.ceil(p.count);
    if (count.textContent !== String(n)) {
      count.textContent = String(n);
      count.classList.remove('tick');
      void count.offsetWidth;
      count.classList.add('tick');
      if (n <= 5 && n > 0) sfx.play('beep', { f: n <= 3 ? 990 : 740 });
    }
    status.textContent = p.min > 1 ? t('prep.people') : p.slots.length > 1 ? t('prep.many') : t('prep.bots');
    sfx.music?.set({ mode: 'prep', intensity: 0, bpm: 124 + Math.max(0, 20 - p.count) * 1.5 });
  }

  // lineup: lit runners, then bots as they light up, then empty spots
  const lineup = $('lineup');
  const want = [...p.slots.map((s) => ({ ...s, kind: s.me ? 'me' : 'human' })), ...p.bots.map((b) => ({ ...b, kind: 'bot' }))];
  const total = Math.max(p.slotsTotal, want.length);
  const keys = want.map((s) => `${s.kind}:${s.n}:${s.wp ?? ''}`);
  const cur = [...lineup.children].map((c) => c.dataset.key || '');
  if (cur.join('|') !== [...keys, ...Array(total - keys.length).fill('')].join('|')) {
    lineup.replaceChildren(
      ...Array.from({ length: total }, (_, i) => {
        const s = want[i];
        const d = document.createElement('div');
        if (!s) {
          d.className = 'slot';
          d.innerHTML = `${figureSvg('#283042')}<span class="sn">${esc(t('prep.open'))}</span>`; // empty spot
          return d;
        }
        d.className = `slot lit ${s.kind === 'me' ? 'me' : ''} ${s.kind === 'bot' ? 'bot' : ''}`;
        d.style.color = s.c;
        d.dataset.key = `${s.kind}:${s.n}:${s.wp ?? ''}`;
        d.innerHTML = `<img class="fig" alt="" src="${figureStill({ outfit: s.o, body: s.g }, 60, 84)}"><span class="sn">${s.rk ? rankBadgeSvg(s.rk, 16) : ''}${esc(s.n)}</span>${s.tt ? titleHtml(s.tt, 'slot-tt') : ''}${s.wp ? `<span class="slot-wp">${esc(t(`w.${WEAPONS.find((w) => w.id === s.wp)?.name}`))}</span>` : ''}`;
        return d;
      }),
    );
  }
  const zed = MODE[app.gameMode]?.kind === 'zombie';
  $('pot').textContent = zed ? t('prep.zFee', { v: money(p.stake) }) : money(p.pot);
  $('pot-k').textContent = t(zed ? 'prep.zSquad' : MODE[app.gameMode]?.kind === 'gold' ? 'prep.goldPot' : 'prep.pot');
  renderZPick(MODE[app.gameMode]?.pick && p.state !== 'live', p.me?.weapon);
  $('prep-start').hidden = !(p.waiting && p.me?.ready);
  $('prep-start').disabled = p.slots.length < (p.min ?? 1); // online needs two players or more
  $('prep-invite').hidden = !(app.mode === 'online' && p.state === 'prep');
  const ready = $('ready');
  const me = p.me ?? {};
  const q = quote(p.stake);
  if (me.ready && me.escrow) {
    ready.textContent = t('prep.cancel', { v: coinAndUsd(me.escrow.asset, me.escrow.units) });
    ready.classList.add('armed');
  } else {
    ready.textContent = q === null ? t('q.pick') : t('prep.ready', { v: coinAndUsd(app.asset, q) });
    ready.classList.remove('armed');
  }
  ready.disabled = !me.ready && (q === null || units(app.asset) < q);
  $('prep-balance').textContent = `${assetInfo(app.asset).symbol}: ${coinAndUsd(app.asset, units(app.asset))}`;
}

// zombies: the weapon you take in, picked in the ready room (each with how hard and how
// fast it hits, so the choice means something)
function renderZPick(show, current) {
  const box = $('zpick');
  box.hidden = !show;
  if (!show) return;
  const cur = current ?? app.zweapon;
  const key = `${cur}|${getLang()}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const maxDps = Math.max(...WEAPONS.map((w) => (w.dmg * (w.pellets ?? 1)) / w.cd));
  box.innerHTML = `<p class="eyebrow">${esc(t('zp.title'))}</p><div class="zp-row">${ZOMBIE_WEAPONS.map((id) => {
    const w = WEAPONS.find((x) => x.id === id);
    const dps = (w.dmg * (w.pellets ?? 1)) / w.cd;
    return `<button type="button" class="zp${id === cur ? ' on' : ''}" data-zw="${id}" aria-pressed="${id === cur}"><img alt="" src="${gunStill(id, 120, 56)}"><b>${esc(t(`w.${w.name}`))}</b><span class="zp-bar" title="${esc(t('zp.power'))}"><i style="width:${Math.round((dps / maxDps) * 100)}%"></i></span><small>${w.melee ? esc(t('zp.melee')) : `${w.mag} · ${w.reload}s`}</small></button>`;
  }).join('')}</div>`;
  for (const b of box.querySelectorAll('[data-zw]'))
    b.addEventListener('click', () => {
      app.zweapon = b.dataset.zw;
      store.set('darkbags.zweapon', app.zweapon);
      send({ t: 'pick', weapon: app.zweapon });
      sfx.play('reload', { secs: 0.6 });
      box.dataset.key = '';
      renderZPick(true, app.zweapon);
    });
}

// ------------------------------------------------------------- transport
function setMode(mode) {
  if (mode === 'online' && !SERVER) mode = 'practice';
  if (app.transport) app.transport.close();
  app.mode = mode;
  app.tables = [];
  app.balances = null;
  app.rank = null;
  app.status = 'connecting';
  app.inRoom = false;
  cashier.reset();
  if (mode === 'practice') $('fine').textContent = t('lobby.fine');
  store.set('darkbags.mode', mode);
  app.connectT = performance.now();
  app.everOpen = false;
  if (mode === 'online') {
    // poke the server over plain HTTP too: a sleeping free host starts waking right away
    fetch(SERVER.replace(/^ws/, 'http').replace(/\/ws$/, '/healthz'), { mode: 'no-cors' }).catch(() => {});
    setTimeout(() => !app.everOpen && renderLobby(), 4100);
  }
  app.transport = mode === 'online' ? new WsTransport(SERVER === DEFAULT_SERVER ? [SERVER, ...FALLBACK_SERVERS] : SERVER, onMessage, onStatus) : new LocalTransport(onMessage, onStatus);
  if (app.screen !== 'lobby') showScreen('lobby');
  renderLobby();
}

function onStatus(st) {
  const wasOpen = app.status === 'open';
  app.status = st;
  if (st === 'open') {
    app.everOpen = true;
    const token = app.mode === 'online' ? store.get('darkbags.token', null) : 'practice';
    send({ t: 'hello', token, name: app.name, dev: deviceId() });
    sendPracticeCfg();
    intro.mark('connect');
  } else if (wasOpen && app.screen !== 'lobby') {
    toast(t('net.lost'));
    app.inRoom = false;
    showScreen('lobby');
  }
  renderLobby();
}

// the locker owns its own messages, and sees everything else after the app has updated
const SOCIAL_MSGS = new Set(['welcome', 'social', 'players', 'friends', 'inbox', 'dms', 'dm', 'friendReq', 'rel', 'profile', 'guilds', 'guild', 'guildDone', 'guildErr', 'guild_chat', 'guild_msg', 'invited', 'invSent']);
function onMessage(m) {
  if (SOCIAL_MSGS.has(m.t)) social.onMessage(m);
  // ping probe: echo the server's stamp straight back, before anything else
  if (m.t === 'probe') return send({ t: 'probe', s: m.s });
  if (m.t === 'ping') {
    app.ping = m.ms;
    return;
  }
  if (m.t !== 'locker') handleMessage(m);
  locker.onMessage(m);
  if (m.t === 'welcome' || m.t === 'authed' || m.t === 'result' || m.t === 'career') ach.onMessage(m);
  if (m.t === 'authed' && m.account) tour.maybeStart(String(m.account).toLowerCase()); // a wallet new to this device
  if (m.t === 'locker' || m.t === 'err') shop.onMessage(m);
  if (m.t === 'locker') pass.onMessage(m);
  if (m.t === 'leaderboard' || m.t === 'career' || m.t === 'result') ranked.onMessage(m);
  if (m.t === 'ref' || m.t === 'welcome' || m.t === 'authed') invite.onMessage(m);
  if (m.t === 'mailbox' || m.t === 'welcome' || m.t === 'authed' || m.t === 'locker') mail.onMessage(m);
  if (m.t === 'fortune' || m.t === 'err') fortune.onMessage(m);
  if (m.t === 'balance' && app.page === 'shop') fortune.paint();
  if (m.t === 'swapped' || m.t === 'err' || m.t === 'balance' || m.t === 'tables') swap.onMessage(m);
  if (m.t === 'chat' || m.t === 'welcome') chat.onMessage(m);
  if (app.screen === 'lobby' && (app.page === 'inventory' ? ['balance', 'locker', 'result', 'welcome', 'swapped', 'tables'].includes(m.t) : false)) inventory.render();
  if (app.page === 'shop' && (m.t === 'balance' || m.t === 'welcome')) shop.render();
}

function handleMessage(m) {
  if (cashier.onMessage(m) && m.t !== 'welcome') return;
  switch (m.t) {
    case 'welcome':
      intro.mark('profile');
      app.swap = m.swap ?? null;
      app.token = m.token;
      if (app.mode === 'online') store.set('darkbags.token', m.token);
      app.assets = m.assets ?? [];
      app.prices = new PriceBook(app.assets);
      app.balances = m.balances ?? {};
      app.tables = m.tables;
      app.online = m.online ?? null;
      app.rank = m.rank ?? null;
      app.chain = m.chain ?? null; // real-token server, or null for play money
      renderLobby();
      break;
    case 'tables':
      app.tables = m.tables;
      if (m.online != null) app.online = m.online;
      app.balances = m.balances ?? app.balances;
      if (m.assets) {
        app.assets = m.assets; // live prices in real-token mode
        app.prices = new PriceBook(m.assets);
      }
      if (app.screen === 'lobby') renderLobby();
      break;
    case 'balance':
      app.balances = m.balances ?? app.balances;
      renderLobby();
      break;
    case 'prep': {
      app.prep = m;
      app.balances = m.balances ?? app.balances;
      const wasReady = app.wasReady;
      app.wasReady = m.me?.ready;
      if (m.me?.ready && !wasReady) sfx.play('ready');
      if (app.screen === 'prep') renderPrep();
      if (app.pendingResult && m.state !== 'live') finishSpectating();
      break;
    }
    case 'start':
      app.balances = m.balances ?? app.balances;
      attract.stop();
      sfx.play('beep', { f: 1320, dur: 0.3 });
      game.coachOn = store.get('darkbags.raids', 0) < 3 && !tour.open; // hints for the first three raids (Nyx does it on the first)
      game.myName = app.name || 'runner';
      game.myRank = app.rank?.rank ?? 1;
      game.myTitle = app.career?.title ? achName(app.career.title) : null;
      game.myTitleTier = app.career?.title ? titleTier(app.career.title) : null;
      game.myNeon = app.career?.neon ?? null;
      game.begin(m, app.skin, app.gore, app.locker);
      renderer.prewarm(m.map.w / 2, m.map.h / 2);
      showScreen('game');
      break;
    case 'snap':
      if (game.active) game.onSnap(m);
      break;
    case 'ev':
      if (game.active) game.onEvents(m.l);
      break;
    case 'result':
      tour.onResult(m);
      pass.onResult(m);
      app.balances = m.balances ?? app.balances;
      if (app.mode === 'online') store.set('darkbags.firstOnline', true);
      store.set('darkbags.raids', store.get('darkbags.raids', 0) + 1);
      if (m.rank) app.rank = m.rank.after;
      // went down with others still inside: watch them first, results when you want them
      // (not during Nyx's tour: she takes you straight to the next try)
      if (tour.open && game.active && m.status === 'dead') send({ t: 'watch', d: 0 });
      else if (game.active && m.status === 'dead' && app.prep?.state === 'live' && !app.wantResult) {
        app.pendingResult = m;
        break;
      }
      app.wantResult = false;
      showResult(m);
      break;
    case 'err':
      // fair-play refusals carry a code, and read in the player's language
      toast(m.code && t(`err.${m.code}`) !== `err.${m.code}` ? t(`err.${m.code}`) : m.msg);
      break;
    default:
  }
}

// ------------------------------------------------------------- spectating
function finishSpectating() {
  const m = app.pendingResult;
  if (!m) {
    // pot modes settle at the end: show the result the moment it lands
    if (game.active && game.dead && !app.wantResult) {
      app.wantResult = true;
      send({ t: 'watch', d: 0 });
      toast(t('spect.settling'));
    }
    return;
  }
  app.pendingResult = null;
  send({ t: 'watch', d: 0 });
  showResult(m);
}
$('sp-prev').addEventListener('click', () => send({ t: 'watch', d: -1 }));
$('sp-next').addEventListener('click', () => send({ t: 'watch', d: 1 }));
$('sp-done').addEventListener('click', finishSpectating);
addEventListener('keydown', (e) => {
  if (!app.pendingResult || !game.active || pauseOpen()) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyQ') send({ t: 'watch', d: -1 });
  else if (e.code === 'ArrowRight' || e.code === 'KeyE') send({ t: 'watch', d: 1 });
  else if (e.code === 'Enter') finishSpectating();
});

// ------------------------------------------------------- in-match menu
// Esc (or the ❚❚ button on phones) in any mode: resume, settings, sound, leave. Online the
// match keeps going behind it; practice stops the clock. Leaving alive leaves the runner
// behind and the stake with the raid, so that asks twice; once you are down it is free.
const pauseEl = $('pause');
const pauseOpen = () => !pauseEl.hidden;
let leaveArmed = false;
function pauseState() {
  const alive = game.active && !game.dead;
  const practice = app.mode === 'practice';
  return { alive, practice, risky: alive && !practice };
}
function paintPause() {
  const { alive, practice, risky } = pauseState();
  const m = MODE[app.gameMode];
  $('pause-mode').textContent = m ? t(`mode.${app.gameMode}`) : '';
  $('pause-note').textContent = practice ? t(alive ? 'pause.practice' : 'pause.practiceDead') : t(alive ? 'pause.alive' : 'pause.dead');
  const leave = $('pause-leave');
  leave.textContent = leaveArmed ? t('pause.leaveSure') : t(risky ? 'pause.leaveLose' : 'pause.leave');
  leave.classList.toggle('armed', leaveArmed);
  const snd = $('pause-sound');
  snd.textContent = `${t('hud.sound')}: ${t(sfx.muted ? 'pause.off' : 'pause.on')}`;
  snd.setAttribute('aria-pressed', String(!sfx.muted));
  const mus = $('pause-music');
  mus.textContent = `${t('hud.music')}: ${t(sfx.musicOn ? 'pause.on' : 'pause.off')}`;
  mus.setAttribute('aria-pressed', String(!!sfx.musicOn));
  $('pause-track').textContent = sfx.music ? `♪ ${sfx.music.trackName}` : '';
  $('pause-next').hidden = !sfx.music || !sfx.musicOn;
}
function openPause() {
  if (app.screen !== 'game' || pauseOpen()) return;
  leaveArmed = false;
  input.release();
  input.blocked = true;
  if (app.mode === 'practice' && app.transport) app.transport.paused = true;
  $('pause-main').hidden = false;
  $('pause-set').hidden = true;
  paintPause();
  pauseEl.hidden = false;
  $('pause-resume').focus();
}
function closePause() {
  if (!pauseOpen()) return;
  pauseEl.hidden = true;
  input.blocked = false;
  if (app.transport) app.transport.paused = false;
}
function leaveMatch() {
  const { risky } = pauseState();
  if (risky && !leaveArmed) {
    leaveArmed = true;
    paintPause();
    return;
  }
  closePause();
  app.pendingResult = null;
  app.wantResult = false;
  send({ t: 'leave' });
  app.inRoom = false;
  showScreen('lobby');
  // practice: the bots' raid would run on without you and the next one would wait for it;
  // start a fresh local world (wallet, ranks and locker are saved, nothing is lost)
  if (app.mode === 'practice') setTimeout(() => app.mode === 'practice' && setMode('practice'), 60);
}
addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || app.screen !== 'game') return;
  e.preventDefault();
  if (!pauseOpen()) openPause();
  else if (!$('pause-set').hidden) {
    $('pause-set').hidden = true;
    $('pause-main').hidden = false;
  } else closePause();
});
$('pause-btn').addEventListener('click', openPause);
$('pause-resume').addEventListener('click', closePause);
$('pause-leave').addEventListener('click', leaveMatch);
$('pause-settings').addEventListener('click', () => {
  $('pause-main').hidden = true;
  $('pause-set').hidden = false;
  settingsUi.render($('pause-set-root'));
});
$('pause-back').addEventListener('click', () => {
  $('pause-set').hidden = true;
  $('pause-main').hidden = false;
  paintPause();
});
pauseEl.addEventListener('click', (e) => e.target === pauseEl && closePause());

// ----------------------------------------------------------------- result
function showResult(m) {
  sfx.music?.sting(m.status === 'extracted' || !!m.won);
  const k = $('res-kicker');
  const amt = $('res-amount');
  const det = $('res-detail');
  const inside = t('res.inside', { k: m.kills, t: mmss(m.secs) });
  const pot = MODE[m.mode]?.kind && MODE[m.mode].kind !== 'raid';
  // the announcer calls the big endings
  if (m.won) sfx.say('victory', getLang());
  else if (m.status === 'extracted') sfx.say('extracted', getLang());
  if (MODE[m.mode]?.kind === 'zombie') {
    const w = m.zWave ?? 0;
    k.textContent = m.won ? t('res.zCleared') : t('res.zFell', { n: Math.min(m.waves ?? 10, w + 1) });
    k.className = `res-kicker ${m.won ? 'win' : 'loss'}`;
    amt.textContent = t('res.zWaves', { n: w, of: m.waves ?? 10 });
    amt.className = `res-amount${m.won ? ' win' : ''}`;
    det.innerHTML = `${t(m.won ? 'res.zWonText' : 'res.zText', { k: `<b>${m.zk ?? 0}</b>`, s: `<b>${m.squad ?? 1}</b>` })} ${t('res.zTime', { t: mmss(m.secs) })}.`;
  } else if (MODE[m.mode]?.kind === 'gold') {
    k.textContent = m.won ? t('res.goldWon') : t('res.goldLost', { p: m.place ?? '?' });
    k.className = `res-kicker ${m.won ? 'win' : 'loss'}`;
    amt.textContent = m.won ? `+${usd(m.credit ?? 0)}` : `−${money(m.stake)}`;
    amt.className = `res-amount${m.won ? ' win' : ''}`;
    det.innerHTML = m.won ? t('res.goldWonText', { b: `<b>${m.gb ?? 0}</b>`, c: `<b>${usd(m.credit ?? 0)}</b>` }) : t('res.goldText', { b: `<b>${m.gb ?? 0}</b>`, top: `<b>${m.top ?? 0}</b>` });
  } else if (pot && m.won) {
    k.textContent = t(MODE[m.mode].kind === 'team' ? 'res.teamWon' : 'res.victory');
    k.className = 'res-kicker win';
    amt.textContent = money(m.payout);
    amt.className = 'res-amount win';
    det.innerHTML = `${t('res.wonText', { p: `<b>${money(m.payout)}</b>`, s: `<b>${money(m.stake)}</b>` })} ${inside}.`;
  } else if (pot && MODE[m.mode].kind === 'dm') {
    k.textContent = t('res.dmLost', { p: m.place ?? '?' });
    k.className = 'res-kicker loss';
    amt.textContent = `−${money(m.stake)}`;
    amt.className = 'res-amount';
    det.innerHTML = `${t('res.dmText', { k: `<b>${m.kills}</b>`, d: `<b>${m.deaths ?? 0}</b>`, top: `<b>${m.top ?? 0}</b>` })}`;
  } else if (pot) {
    k.textContent = t(m.cause === 'storm' ? 'res.storm' : 'res.defeated');
    k.className = 'res-kicker loss';
    amt.textContent = `−${money(m.stake)}`;
    amt.className = 'res-amount';
    det.innerHTML = `${t(MODE[m.mode].kind === 'team' ? 'res.teamLost' : 'res.lostPot')} ${inside}.`;
  } else if (m.status === 'extracted') {
    const pnl = m.payout - m.stake;
    const pct = Math.round((pnl / m.stake) * 100);
    k.textContent = t('res.extracted');
    k.className = 'res-kicker win';
    amt.textContent = money(m.payout);
    amt.className = 'res-amount win';
    const paid = m.asset && !assetInfo(m.asset).stable ? ` ${t('res.paid', { v: `<b>${esc(tokenAmount(m.asset, m.payoutUnits ?? '0'))}</b>` })}` : '';
    det.innerHTML = `${t('res.out', { p: `<b>${money(m.payout)}</b>`, s: `<b>${money(m.stake)}</b>`, d: `<b>${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))} (${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%)</b>` })}${paid} ${inside}.`;
  } else if (m.status === 'dead') {
    k.textContent = m.cause === 'storm' ? t('res.storm') : t('res.dropped');
    k.className = 'res-kicker loss';
    amt.textContent = `−${money(m.stake)}`;
    amt.className = 'res-amount';
    det.innerHTML = m.killer
      ? `${t('res.killer', { n: `<b>${esc(m.killer)}</b>`, v: `<b>${money(m.lost)}</b>` })} ${inside}.`
      : `${t('res.inStorm', { v: `<b>${money(m.lost)}</b>` })} ${inside}.`;
  } else {
    k.textContent = t('res.sealed');
    k.className = 'res-kicker loss';
    amt.textContent = `−${money(m.stake)}`;
    amt.className = 'res-amount';
    det.innerHTML = `${t('res.sealedText', { v: `<b>${money(m.lost)}</b>` })} ${inside}.`;
  }
  renderRankResult(m.rank);
  renderRewards(m);
  ranked.resultLine(m);
  // the shows after a match, one after the other: a new rank, then the ranked bonus spin
  setTimeout(() => rankUpShow(m, () => ranked.spin(m, $('rankup'))), settings.motion ? 1300 : 200);
  app.lastResult = m;
  const q = quote(m.stake);
  $('res-again').textContent = q === null ? t('res.again') : `${t('res.again')} · ${money(m.stake)}`;
  $('res-again').disabled = q === null || units(app.asset) < q;
  showScreen('result');
}

// ------------------------------------------------------------------ wiring
function goToTable() {
  sfx.unlock();
  app.name = $('name').value.trim();
  store.set('darkbags.name', app.name);
  send({ t: 'join', stake: app.stake, mode: app.gameMode, name: app.name || 'runner', skin: app.skin });
  app.inRoom = true;
  showScreen('prep');
}

function toggleReady() {
  sfx.unlock();
  if (app.prep?.me?.ready) send({ t: 'unready' });
  else send({ t: 'ready', name: app.name || 'runner', skin: app.skin, asset: app.asset, weapon: app.zweapon });
}

$('name').value = app.name;
$('name').addEventListener('change', () => store.set('darkbags.name', $('name').value.trim()));
$('name').addEventListener('keydown', (e) => e.key === 'Enter' && !$('play').disabled && goToTable());
$('play').addEventListener('click', goToTable);
$('gore').addEventListener('change', (e) => setSetting('gore', e.target.checked));
// settings apply the moment they change
function applySetting(k) {
  if (k === 'quality') renderer.setQuality(settings.quality === 'auto' ? null : QUALITY[settings.quality]);
  if (k === 'sound') sfx.setVolume(settings.sound);
  if (k === 'voice') sfx.voiceOff = !settings.voice;
  if (k === 'music') sfx.setMusicVolume(settings.music);
  if (k === 'track') {
    sfx.trackChoice = settings.track;
    sfx.music?.choose(settings.track);
  }
  if (k === 'gore') {
    app.gore = settings.gore;
    game.gore = settings.gore;
    $('gore').checked = settings.gore;
  }
  if (k === 'stick') document.documentElement.style.setProperty('--stick', settings.stick);
  if (k === 'lefty') $('touch').classList.toggle('lefty', settings.lefty);
  if (k === 'motion') document.documentElement.classList.toggle('no-motion', !settings.motion);
}
onSetting(applySetting);
for (const k of ['quality', 'sound', 'music', 'track', 'voice', 'gore', 'stick', 'lefty', 'motion']) applySetting(k);
$('faucet').addEventListener('click', () => send({ t: 'faucet' }));
$('mode-online').addEventListener('click', () => app.mode !== 'online' && setMode('online'));
$('mode-practice').addEventListener('click', () => app.mode !== 'practice' && setMode('practice'));
$('ready').addEventListener('click', toggleReady);
$('prep-invite').addEventListener('click', () => social.openInvite());
$('prep-start').addEventListener('click', () => {
  send({ t: 'start' });
  sfx.play('ready');
});
$('prep-back').addEventListener('click', () => {
  send({ t: 'unready' });
  send({ t: 'leave' });
  app.inRoom = false;
  showScreen('lobby');
});
$('res-share').addEventListener('click', () => {
  const m = app.lastResult;
  if (!m) return;
  const kind = MODE[m.mode]?.kind;
  shareMoment(kind === 'zombie' ? 'zombie' : kind === 'gold' ? 'goldRush' : m.status === 'extracted' || m.won ? 'win' : 'loss', { ...m, rank: m.rank?.after.rank ?? app.rank?.rank ?? 1, weapon: game.you?.w ?? 3 });
});
$('res-again').addEventListener('click', () => {
  sfx.unlock();
  send({ t: 'ready', name: app.name || 'runner', skin: app.skin, asset: app.asset, weapon: app.zweapon });
  showScreen('prep');
});
$('res-tables').addEventListener('click', () => {
  send({ t: 'leave' });
  app.inRoom = false;
  showScreen('lobby');
});
$('bluff-chip').addEventListener('click', () => game.cycleBluff());
$('dash-chip').addEventListener('click', () => (input.dashQueued = true));
const muteChip = $('mute-chip');
const musicChip = $('music-chip');
const syncAudio = () => {
  muteChip.setAttribute('aria-pressed', String(sfx.muted));
  musicChip.setAttribute('aria-pressed', String(!sfx.musicOn));
  if (pauseOpen()) paintPause();
};
const toggleMute = () => {
  sfx.toggle();
  syncAudio();
};
const toggleMusic = () => {
  sfx.unlock();
  sfx.toggleMusic();
  syncAudio();
};
muteChip.addEventListener('click', toggleMute);
$('pause-sound').addEventListener('click', toggleMute);
$('pause-music').addEventListener('click', toggleMusic);
$('pause-next').addEventListener('click', () => {
  sfx.music?.next();
  paintPause();
});
// a new track: its name, briefly, like a radio
let trackT = 0;
addEventListener('darkbags:track', (e) => {
  const n = $('now-playing');
  if (!n || !sfx.musicOn) return;
  n.textContent = `♪ ${e.detail.name}`;
  n.classList.remove('on');
  void n.offsetWidth;
  n.classList.add('on');
  clearTimeout(trackT);
  trackT = setTimeout(() => n.classList.remove('on'), 3200);
});
musicChip.addEventListener('click', toggleMusic);
syncAudio();
input.onBluff = () => game.cycleBluff();
input.onBuy = (item) => game.buy(item);
input.onSpace = () => game.tryUpgrade();
for (const b of $('gl-shop').querySelectorAll('[data-buy]')) b.addEventListener('click', () => game.buy(b.dataset.buy));
for (const b of document.querySelectorAll('#touch [data-buy]'))
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    game.buy(b.dataset.buy);
  });
input.onMute = toggleMute;
input.onMusic = toggleMusic;
input.onAnyInput = () => sfx.unlock();

// ---------------------------------------------------------- landscape
// Phones play sideways. On Play we ask for fullscreen and lock landscape (Android);
// where that is not possible (iPhone) a raid held upright shows a "turn your phone" card.
const portrait = matchMedia('(orientation: portrait)');
let uprightOk = false;
function updateRotate() {
  $('rotate').hidden = !(input.touchOn && app.screen === 'game' && portrait.matches && !uprightOk);
}
portrait.addEventListener?.('change', updateRotate);
$('rot-anyway').addEventListener('click', () => {
  uprightOk = true;
  updateRotate();
});
function goLandscape() {
  if (!input.touchOn) return;
  const el = document.documentElement;
  const lock = () => screen.orientation?.lock?.('landscape').catch(() => {});
  if (document.fullscreenElement || !el.requestFullscreen) return lock();
  el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
}
$('play').addEventListener('click', goLandscape);
$('ready').addEventListener('click', goLandscape);

const enableTouch = () => {
  input.enableTouch($('touch'));
  $('touch').hidden = app.screen !== 'game';
};
if (matchMedia('(pointer: coarse)').matches) enableTouch();
addEventListener('touchstart', enableTouch, { once: true, passive: true });
addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// ------------------------------------------------------------------- loop
let lastFrame = performance.now();
// The next frame is booked first: whatever goes wrong in this one, the loop (input, HUD,
// drawing) keeps running. A frame error is reported once, not a frozen black screen.
let loopErr = false;
let attractSkip = false;
// nobody sees the live map behind a full-screen dialog or show: skip drawing it (that
// time goes to the locker, the case reel and the rank-up instead)
const backdropHidden = () => !!document.querySelector('dialog[open]') || !$('opening').hidden || !$('rankup').hidden || app.screen === 'result';
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  try {
    if (game.active) game.frame(now, dt);
    else if (!backdropHidden()) {
      // the live map behind the menus: full rate on a desktop, every other frame on a phone
      attractSkip = !attractSkip;
      if (!input.touchOn || attractSkip) attract.frame(now, input.touchOn ? dt * 2 : dt);
    }
  } catch (e) {
    if (!loopErr) console.error('frame failed', e);
    loopErr = true;
  }
}

// handle for automated smoke tests and console poking
globalThis.__darkbags = { app, game, input, renderer, sfx, cashier };

attract.start();
showScreen('lobby');
go(store.get('darkbags.page', 'play'));
// language: picker in the lobby header, everything re-renders on a switch
const langSel = $('lang');
langSel.replaceChildren(...LANGS.map((l) => Object.assign(document.createElement('option'), { value: l.id, textContent: l.name })));
langSel.value = getLang();
langSel.addEventListener('change', () => setLang(langSel.value));
onLang(() => {
  renderLobby();
  ach.renderProfile();
  PAGES[app.page]?.render();
  if (app.page === 'achievements') ach.renderList();
  if (app.screen === 'prep') renderPrep();
  langSel.value = getLang();
});
applyI18n();

// intro: a real loading bar over what the game waits for
const intro = createIntro({
  onDone: () => {
    document.body.classList.add('ready');
    // a new player gets Nyx (the update notes would mean nothing yet); everyone else, once
    // after an update, the notes
    if (tour.maybeStart('device')) news.markSeen();
    else news.maybeShow();
  },
});
for (const s of ['fonts', 'world', 'connect', 'profile']) intro.need(s);
(document.fonts?.ready ?? Promise.resolve()).then(() => intro.mark('fonts'));
requestAnimationFrame(() => requestAnimationFrame(() => intro.mark('world')));
globalThis.__darkbags.intro = intro;

setMode(SERVER && store.get('darkbags.mode', 'online') === 'online' ? 'online' : 'practice');
requestAnimationFrame(loop);
