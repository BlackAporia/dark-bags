import { CFG, SKINS } from '../shared/config.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sfx } from './sfx.js';
import { GameClient, Attract, fmt, mmss, esc } from './game.js';
import { WsTransport, LocalTransport } from './net.js';
import { store } from './store.js';
import { PriceBook, formatUnits } from '../shared/assets.js';
import { createCashierUi } from './cashier.js';

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

function onlineUrl() {
  let param = null;
  try {
    param = new URLSearchParams(location.search).get('server');
  } catch {
    /* no query string access */
  }
  if (param) return normalizeServer(param);
  if (globalThis.DARK_BAGS_SERVER) return normalizeServer(globalThis.DARK_BAGS_SERVER);
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
  hpBar: $('hp-bar'),
  hpNum: $('hp-num'),
  dashChip: $('dash-chip'),
  bluffChip: $('bluff-chip'),
  weapon: $('weapon'),
  prestige: $('prestige'),
  ladder: $('ladder'),
  xpBar: $('xp-bar'),
  nextWeapon: $('next-weapon'),
};
const SERVER = onlineUrl();
const app = {
  mode: null,
  transport: null,
  status: 'connecting',
  token: null,
  balances: null, // { asset: units string } — private pool balances (test tokens in test mode)
  assets: [],
  prices: new PriceBook([]),
  asset: store.get('darkbags.asset', 'SATS'),
  tables: [],
  stake: CFG.TIERS.includes(store.get('darkbags.stake', 1000)) ? store.get('darkbags.stake', 1000) : 1000,
  name: store.get('darkbags.name', ''),
  skin: SKINS.includes(store.get('darkbags.skin', '')) ? store.get('darkbags.skin') : SKINS[Math.floor(Math.random() * SKINS.length)],
  gore: store.get('darkbags.gore', false),
  screen: 'lobby',
  prep: null,
  lastCount: null,
  inRoom: false,
};
const send = (m) => app.transport?.send(m);
const game = new GameClient({ renderer, input, sfx, send, el });
// real-token mode (server started with CHAIN=…): sign-in, deposits, cash-outs
const cashier = createCashierUi({ app, send, toast: (m) => toast(m), onChange: () => renderLobby(), base: SERVER ? SERVER.replace(/^ws/, 'http').replace(/\/ws$/, '/') : location.href });
const attract = new Attract(renderer);

// ---------------------------------------------------------------- screens
function showScreen(name) {
  app.screen = name;
  $('lobby').hidden = name !== 'lobby';
  $('prep').hidden = name !== 'prep';
  $('result').hidden = name !== 'result';
  $('touch').hidden = !(name === 'game' && input.touchOn);
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

// ----------------------------------------------------------------- tokens
const units = (a) => BigInt(app.balances?.[a] ?? '0');
const assetInfo = (a) => app.prices.get(a) ?? { id: a, symbol: a.slice(0, 8), decimals: 18, color: '#8d93a6' };
function totalSats() {
  let t = 0;
  for (const [a, u] of Object.entries(app.balances ?? {})) t += app.prices.value(a, BigInt(u));
  return t;
}
function quote(stake = app.stake, a = app.asset) {
  return app.prices.quote(a, stake);
}
function tokenAmount(a, u) {
  const info = assetInfo(a);
  return `${formatUnits(u, info.decimals, info.decimals > 8 ? 4 : info.decimals)} ${info.symbol}`;
}
function pickUsableAsset() {
  if (app.prices.has(app.asset) && units(app.asset) >= (quote() ?? 0n) && units(app.asset) > 0n) return;
  const ok = app.assets.find((a) => app.prices.has(a.id) && units(a.id) >= quote(app.stake, a.id));
  if (ok) app.asset = ok.id;
}

function renderAssets() {
  const list = $('assets');
  const ids = [...new Set([...app.assets.map((a) => a.id), ...Object.keys(app.balances ?? {})])];
  list.replaceChildren(
    ...ids.map((id) => {
      const info = assetInfo(id);
      const u = units(id);
      const priced = app.prices.has(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'asset';
      b.disabled = !priced || u === 0n;
      b.setAttribute('aria-pressed', String(id === app.asset));
      b.title = priced ? '' : 'No price for this token yet';
      b.innerHTML = `<span class="dot" style="background:${info.color}"></span><span class="sym">${esc(info.symbol)}</span><span class="amt">${esc(formatUnits(u, info.decimals, 4))}${priced ? ` · ≈${fmt(app.prices.value(id, u))} sats` : ''}</span>`;
      b.addEventListener('click', () => {
        app.asset = id;
        store.set('darkbags.asset', id);
        renderLobby();
      });
      return b;
    }),
  );
  const q = quote();
  const qEl = $('quote');
  if (q === null) qEl.textContent = 'Pick a token with a price to stake.';
  else {
    const short = units(app.asset) < q;
    qEl.innerHTML = `A ${fmt(app.stake)} sats stake is <b>${esc(tokenAmount(app.asset, q))}</b> right now${short ? ` · <span style="color:var(--blood)">not enough ${esc(assetInfo(app.asset).symbol)}</span>` : ''}. Payouts come back in the same token at the same rate.`;
  }
}

// ------------------------------------------------------------------ lobby
function tableInfo(stake) {
  return app.tables.find((t) => t.stake === stake);
}

function renderLobby() {
  const onlineBtn = $('mode-online');
  onlineBtn.disabled = !SERVER;
  onlineBtn.title = SERVER ? '' : 'No game server configured for this build';
  onlineBtn.setAttribute('aria-selected', String(app.mode === 'online'));
  $('mode-practice').setAttribute('aria-selected', String(app.mode === 'practice'));

  const st = $('net-status');
  st.classList.toggle('bad', app.status === 'closed' || app.status === 'error');
  if (app.mode === 'practice') st.textContent = 'Offline raids against bots. Separate practice balance.';
  else if (app.status === 'open') st.textContent = 'Connected. Humans and bots share each raid.';
  else if (app.status === 'connecting') st.textContent = 'Connecting to the raid server…';
  else st.textContent = 'Server unreachable. Retrying… Practice mode works offline.';

  const list = $('tables');
  list.replaceChildren(
    ...CFG.TIERS.map((stake) => {
      const t = tableInfo(stake);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'table-btn';
      b.setAttribute('aria-pressed', String(stake === app.stake));
      let state = 'Empty ready room';
      let cls = '';
      if (t?.state === 'live') {
        state = `Raid live · ${mmss(t.tl)}`;
        cls = 'live';
      } else if (t?.state === 'prep' && t.count !== null && t.count !== undefined) {
        state = `${t.ready} ready · ${t.count}s`;
        cls = 'live';
      } else if (t?.state === 'prep' && t.watching) state = `${t.watching} in the room`;
      if (t?.nextGolden && t.state !== 'live') {
        state = 'Golden raid next';
        cls = 'gold';
      }
      b.innerHTML = `<span class="stake">${fmt(stake)}</span><span class="unit">sats stake</span><span class="state ${cls}">${esc(state)}</span>`;
      b.addEventListener('click', () => {
        app.stake = stake;
        store.set('darkbags.stake', stake);
        renderLobby();
      });
      return b;
    }),
  );

  const skins = $('skins');
  if (!skins.children.length) {
    for (const c of SKINS.slice(0, 6)) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'skin';
      s.style.background = c;
      s.setAttribute('role', 'radio');
      s.setAttribute('aria-label', `Colour ${c}`);
      s.dataset.skin = c;
      s.addEventListener('click', () => {
        app.skin = c;
        store.set('darkbags.skin', c);
        renderLobby();
      });
      skins.append(s);
    }
  }
  for (const s of skins.children) s.setAttribute('aria-checked', String(s.dataset.skin === app.skin));
  $('gore').checked = app.gore;

  pickUsableAsset();
  renderAssets();
  cashier.render();
  const real = cashier.active;
  $('balance').textContent = app.balances === null ? '—' : `≈${fmt(totalSats())}`;
  $('faucet').hidden = real || !(app.balances !== null && totalSats() < Math.max(...CFG.TIERS));
  const play = $('play');
  const needSignIn = real && !cashier.signedIn;
  play.disabled = app.status !== 'open' || needSignIn;
  play.textContent = needSignIn ? 'Sign in to play' : `Go to the ${fmt(app.stake)} sats table`;
}

// ------------------------------------------------------------- ready room
const figureSvg = (color) =>
  `<svg viewBox="0 0 40 56" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="10" r="7"/><path d="M20 17 V34 M20 22 L10 31 M20 22 L32 25 M20 34 L12 51 M20 34 L28 51"/></g></svg>`;

function renderPrep() {
  const p = app.prep;
  if (!p) return;
  $('prep-kicker').textContent = `Raid ${p.round} · ${fmt(p.stake)} sats table${p.golden ? ' · golden raid' : ''}`;
  const count = $('prep-count');
  const status = $('prep-status');
  if (p.state === 'live') {
    count.textContent = mmss(p.tl);
    status.textContent = 'A raid is running. Ready up now and you drop into the next one together.';
  } else if (p.state === 'results') {
    count.textContent = `${p.resT}`;
    status.textContent = 'Raid over. The ready room opens in a moment.';
  } else if (p.count === null) {
    count.textContent = 'Ready up';
    status.textContent = 'The countdown starts when the first runner is ready.';
  } else {
    const n = Math.ceil(p.count);
    if (count.textContent !== String(n)) {
      count.textContent = String(n);
      count.classList.remove('tick');
      void count.offsetWidth;
      count.classList.add('tick');
      if (n <= 5 && n > 0) sfx.play('beep', { f: n <= 3 ? 990 : 740 });
    }
    status.textContent = p.slots.length > 1 ? 'Everyone here starts with a knife. Bots join in the last seconds.' : 'Bots fill the empty spots in the last seconds.';
    sfx.music?.set({ mode: 'prep', intensity: 0, bpm: 124 + Math.max(0, 20 - p.count) * 1.5 });
  }

  // lineup: lit runners, then bots as they light up, then empty spots
  const lineup = $('lineup');
  const want = [...p.slots.map((s) => ({ ...s, kind: s.me ? 'me' : 'human' })), ...p.bots.map((b) => ({ ...b, kind: 'bot' }))];
  const total = Math.max(p.slotsTotal, want.length);
  const keys = want.map((s) => `${s.kind}:${s.n}`);
  const cur = [...lineup.children].map((c) => c.dataset.key || '');
  if (cur.join('|') !== [...keys, ...Array(total - keys.length).fill('')].join('|')) {
    lineup.replaceChildren(
      ...Array.from({ length: total }, (_, i) => {
        const s = want[i];
        const d = document.createElement('div');
        if (!s) {
          d.className = 'slot';
          d.innerHTML = `${figureSvg('#283042')}<span class="sn">open</span>`;
          return d;
        }
        d.className = `slot lit ${s.kind === 'me' ? 'me' : ''} ${s.kind === 'bot' ? 'bot' : ''}`;
        d.style.color = s.c;
        d.dataset.key = `${s.kind}:${s.n}`;
        d.innerHTML = `${figureSvg(s.c)}<span class="sn">${esc(s.n)}</span>`;
        return d;
      }),
    );
  }
  $('pot').textContent = fmt(p.pot);
  const ready = $('ready');
  const me = p.me ?? {};
  const q = quote(p.stake);
  if (me.ready && me.escrow) {
    ready.textContent = `Cancel · refund ${tokenAmount(me.escrow.asset, me.escrow.units)}`;
    ready.classList.add('armed');
  } else {
    ready.textContent = q === null ? 'Pick a token in the lobby' : `Stake ${tokenAmount(app.asset, q)} & ready`;
    ready.classList.remove('armed');
  }
  ready.disabled = !me.ready && (q === null || units(app.asset) < q);
  $('prep-balance').textContent = `${assetInfo(app.asset).symbol} balance ${formatUnits(units(app.asset), assetInfo(app.asset).decimals, 4)} · ${fmt(p.stake)} sats stake`;
}

// ------------------------------------------------------------- transport
function setMode(mode) {
  if (mode === 'online' && !SERVER) mode = 'practice';
  if (app.transport) app.transport.close();
  app.mode = mode;
  app.tables = [];
  app.balances = null;
  app.status = 'connecting';
  app.inRoom = false;
  cashier.reset();
  if (mode === 'practice') $('fine').textContent = 'Test build. Tokens here are play money with fixed test prices: no deposits, no withdrawals.';
  store.set('darkbags.mode', mode);
  app.transport = mode === 'online' ? new WsTransport(SERVER, onMessage, onStatus) : new LocalTransport(onMessage, onStatus);
  if (app.screen !== 'lobby') showScreen('lobby');
  renderLobby();
}

function onStatus(st) {
  const wasOpen = app.status === 'open';
  app.status = st;
  if (st === 'open') {
    const token = app.mode === 'online' ? store.get('darkbags.token', null) : 'practice';
    send({ t: 'hello', token, name: app.name });
  } else if (wasOpen && app.screen !== 'lobby') {
    toast('Lost the connection. Back at the tables.');
    app.inRoom = false;
    showScreen('lobby');
  }
  renderLobby();
}

function onMessage(m) {
  if (cashier.onMessage(m) && m.t !== 'welcome') return;
  switch (m.t) {
    case 'welcome':
      app.token = m.token;
      if (app.mode === 'online') store.set('darkbags.token', m.token);
      app.assets = m.assets ?? [];
      app.prices = new PriceBook(app.assets);
      app.balances = m.balances ?? {};
      app.tables = m.tables;
      renderLobby();
      break;
    case 'tables':
      app.tables = m.tables;
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
      break;
    }
    case 'start':
      app.balances = m.balances ?? app.balances;
      attract.stop();
      sfx.play('beep', { f: 1320, dur: 0.3 });
      game.begin(m, app.skin, app.gore);
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
      app.balances = m.balances ?? app.balances;
      showResult(m);
      break;
    case 'err':
      toast(m.msg);
      break;
    default:
  }
}

// ----------------------------------------------------------------- result
function showResult(m) {
  const k = $('res-kicker');
  const amt = $('res-amount');
  const det = $('res-detail');
  const share = $('res-share');
  share.hidden = true;
  const inside = `${m.kills} ${m.kills === 1 ? 'kill' : 'kills'} · ${mmss(m.secs)} inside`;
  if (m.status === 'extracted') {
    const pnl = m.payout - m.stake;
    const pct = Math.round((pnl / m.stake) * 100);
    k.textContent = 'Extracted';
    k.className = 'res-kicker win';
    amt.textContent = `${fmt(m.payout)} sats`;
    amt.className = 'res-amount win';
    const paid = m.asset && m.asset !== 'SATS' ? ` Paid out <b>${esc(tokenAmount(m.asset, m.payoutUnits ?? '0'))}</b> at your entry rate.` : '';
    det.innerHTML = `Out with <b>${fmt(m.payout)}</b> sats on a <b>${fmt(m.stake)}</b> stake: <b>${pnl >= 0 ? '+' : '−'}${fmt(Math.abs(pnl))} (${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%)</b>.${paid} ${inside}.`;
    if (pnl > 0) {
      const text = `Walked out of the dark with ${fmt(m.payout)} sats on a ${fmt(m.stake)} stake (+${pct}%). Nobody saw what I was carrying. #DARKBAGS`;
      const url = !IN_ARTIFACT && /^https?:$/.test(location.protocol) ? `&url=${encodeURIComponent(location.origin + location.pathname)}` : '';
      share.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}${url}`;
      share.hidden = false;
    }
  } else if (m.status === 'dead') {
    k.textContent = m.cause === 'storm' ? 'Eaten by the storm' : 'Dropped';
    k.className = 'res-kicker loss';
    amt.textContent = `−${fmt(m.stake)}`;
    amt.className = 'res-amount';
    det.innerHTML = m.killer
      ? `<b>${esc(m.killer)}</b> has your bag now. It held <b>${fmt(m.lost)} sats</b>, and only the two of you will ever know. ${inside}.`
      : `Your bag, <b>${fmt(m.lost)} sats</b>, is lying in the storm for anyone brave enough. ${inside}.`;
  } else {
    k.textContent = 'Sealed inside';
    k.className = 'res-kicker loss';
    amt.textContent = `−${fmt(m.stake)}`;
    amt.className = 'res-amount';
    det.innerHTML = `The raid closed with you still in it. Your <b>${fmt(m.lost)} sats</b> rolled into the next raid's loot. ${inside}.`;
  }
  const q = quote(m.stake);
  $('res-again').textContent = q === null ? 'Ready for the next raid' : `Ready for the next raid · ${tokenAmount(app.asset, q)}`;
  $('res-again').disabled = q === null || units(app.asset) < q;
  showScreen('result');
}

// ------------------------------------------------------------------ wiring
function goToTable() {
  sfx.unlock();
  app.name = $('name').value.trim();
  store.set('darkbags.name', app.name);
  send({ t: 'join', stake: app.stake, name: app.name || 'runner', skin: app.skin });
  app.inRoom = true;
  showScreen('prep');
}

function toggleReady() {
  sfx.unlock();
  if (app.prep?.me?.ready) send({ t: 'unready' });
  else send({ t: 'ready', name: app.name || 'runner', skin: app.skin, asset: app.asset });
}

$('name').value = app.name;
$('name').addEventListener('change', () => store.set('darkbags.name', $('name').value.trim()));
$('name').addEventListener('keydown', (e) => e.key === 'Enter' && !$('play').disabled && goToTable());
$('play').addEventListener('click', goToTable);
$('gore').addEventListener('change', (e) => {
  app.gore = e.target.checked;
  store.set('darkbags.gore', app.gore);
});
$('faucet').addEventListener('click', () => send({ t: 'faucet' }));
$('mode-online').addEventListener('click', () => app.mode !== 'online' && setMode('online'));
$('mode-practice').addEventListener('click', () => app.mode !== 'practice' && setMode('practice'));
$('ready').addEventListener('click', toggleReady);
$('prep-back').addEventListener('click', () => {
  send({ t: 'unready' });
  send({ t: 'leave' });
  app.inRoom = false;
  showScreen('lobby');
});
$('res-again').addEventListener('click', () => {
  sfx.unlock();
  send({ t: 'ready', name: app.name || 'runner', skin: app.skin, asset: app.asset });
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
musicChip.addEventListener('click', toggleMusic);
syncAudio();
input.onBluff = () => game.cycleBluff();
input.onMute = toggleMute;
input.onMusic = toggleMusic;
input.onAnyInput = () => sfx.unlock();

const enableTouch = () => {
  input.enableTouch($('touch'));
  $('touch').hidden = app.screen !== 'game';
};
if (matchMedia('(pointer: coarse)').matches) enableTouch();
addEventListener('touchstart', enableTouch, { once: true, passive: true });
addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// ------------------------------------------------------------------- loop
let lastFrame = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (game.active) game.frame(now, dt);
  else attract.frame(now, dt);
  requestAnimationFrame(loop);
}

// handle for automated smoke tests and console poking
globalThis.__darkbags = { app, game, input, renderer, sfx, cashier };

attract.start();
showScreen('lobby');
setMode(SERVER && store.get('darkbags.mode', 'online') === 'online' ? 'online' : 'practice');
requestAnimationFrame(loop);
