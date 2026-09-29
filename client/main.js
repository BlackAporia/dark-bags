import { CFG, SKINS } from '../shared/config.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sfx } from './sfx.js';
import { GameClient, Attract, fmt, mmss, esc } from './game.js';
import { WsTransport, LocalTransport } from './net.js';
import { store } from './store.js';

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
  alive: $('alive'),
  golden: $('golden'),
  feed: $('feed'),
  banner: $('banner'),
  extract: $('extract'),
  extName: $('ext-name'),
  extBar: $('ext-bar'),
  spect: $('spect'),
  hpBar: $('hp-bar'),
  hpNum: $('hp-num'),
  dashChip: $('dash-chip'),
  bluffChip: $('bluff-chip'),
};
const SERVER = onlineUrl();
const app = {
  mode: null,
  transport: null,
  status: 'connecting',
  token: null,
  balance: null,
  tables: [],
  stake: CFG.TIERS.includes(store.get('darkbags.stake', 1000)) ? store.get('darkbags.stake', 1000) : 1000,
  name: store.get('darkbags.name', ''),
  skin: SKINS.includes(store.get('darkbags.skin', '')) ? store.get('darkbags.skin') : SKINS[Math.floor(Math.random() * SKINS.length)],
  screen: 'lobby',
};
const send = (m) => app.transport?.send(m);
const game = new GameClient({ renderer, input, sfx, send, el });
const attract = new Attract(renderer);

// ---------------------------------------------------------------- screens
function showScreen(name) {
  app.screen = name;
  $('lobby').hidden = name !== 'lobby';
  $('wait').hidden = name !== 'wait';
  $('result').hidden = name !== 'result';
  $('touch').hidden = !(name === 'game' && input.touchOn);
  if (name === 'lobby' || name === 'wait') {
    if (game.active) game.stop();
    if (!attract.world) attract.start();
  }
  if (name === 'result') el.hud.hidden = true;
  if (name === 'lobby') renderLobby();
}

let toastT = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 3500);
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
  if (app.mode === 'practice') st.textContent = 'Offline raid against bots. Separate practice balance.';
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
      let state = 'Bots waiting';
      let cls = '';
      if (t?.state === 'live') {
        state = `Live ${mmss(t.tl)}${app.mode === 'online' ? ` · ${t.humans} ${t.humans === 1 ? 'human' : 'humans'}` : ''}`;
        cls = 'live';
      } else if (t?.state === 'intermission') {
        state = 'Next raid soon';
        cls = 'live';
      }
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
      s.setAttribute('aria-label', `Skin ${c}`);
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

  $('balance').textContent = app.balance === null ? '—' : fmt(app.balance);
  const poor = app.balance !== null && app.balance < Math.min(...CFG.TIERS);
  $('faucet').hidden = !poor;
  const play = $('play');
  const cant = app.balance !== null && app.balance < app.stake;
  play.disabled = app.status !== 'open' || cant;
  play.textContent = cant ? `Need ${fmt(app.stake)} sats` : `Enter raid · ${fmt(app.stake)} sats`;
}

// ------------------------------------------------------------- transport
function setMode(mode) {
  if (mode === 'online' && !SERVER) mode = 'practice';
  if (app.transport) app.transport.close();
  app.mode = mode;
  app.tables = [];
  app.balance = null;
  app.status = 'connecting';
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
    showScreen('lobby');
  }
  renderLobby();
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome':
      app.token = m.token;
      if (app.mode === 'online') store.set('darkbags.token', m.token);
      app.balance = m.balance;
      app.tables = m.tables;
      renderLobby();
      break;
    case 'tables':
      app.tables = m.tables;
      app.balance = m.balance;
      if (app.screen === 'lobby') renderLobby();
      break;
    case 'balance':
      app.balance = m.balance;
      renderLobby();
      break;
    case 'room': {
      app.balance = m.balance;
      const i = app.tables.findIndex((t) => t.stake === m.stake);
      if (i >= 0) app.tables[i] = { ...app.tables[i], ...m };
      if (m.queued) {
        const secs = m.state === 'intermission' ? m.interT : m.state === 'live' ? m.tl + CFG.INTERMISSION : 0;
        $('wait-text').textContent = secs > 0 ? `Next raid in ${secs}s` : 'Opening a raid…';
        if (app.screen !== 'wait') showScreen('wait');
      } else if (app.screen === 'wait') showScreen('lobby');
      break;
    }
    case 'start':
      app.balance = m.balance;
      attract.stop();
      game.begin(m, app.skin);
      showScreen('game');
      break;
    case 'snap':
      if (game.active) game.onSnap(m);
      break;
    case 'ev':
      if (game.active) game.onEvents(m.l);
      break;
    case 'result':
      app.balance = m.balance;
      showResult(m);
      break;
    case 'err':
      toast(m.msg);
      if (app.screen === 'wait') showScreen('lobby');
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
    det.innerHTML = `Out with <b>${fmt(m.payout)}</b> on a <b>${fmt(m.stake)}</b> stake: <b>${pnl >= 0 ? '+' : '−'}${fmt(Math.abs(pnl))} (${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%)</b>. ${inside}. Balance ${fmt(m.balance)}.`;
    if (pnl > 0) {
      const text = `Walked out of the dark with ${fmt(m.payout)} sats on a ${fmt(m.stake)} stake (+${pct}%). Nobody saw what I was carrying. #DARKBAGS`;
      const url = !IN_ARTIFACT && /^https?:$/.test(location.protocol) ? `&url=${encodeURIComponent(location.origin + location.pathname)}` : '';
      share.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}${url}`;
      share.hidden = false;
    }
  } else if (m.status === 'dead') {
    k.textContent = 'Dropped';
    k.className = 'res-kicker loss';
    amt.textContent = `−${fmt(m.stake)}`;
    amt.className = 'res-amount';
    det.innerHTML = m.killer
      ? `<b>${esc(m.killer)}</b> has your bag now. It held <b>${fmt(m.lost)} sats</b>, and only the two of you will ever know. ${inside}.`
      : `You went down carrying <b>${fmt(m.lost)} sats</b>. ${inside}.`;
  } else {
    k.textContent = 'Sealed inside';
    k.className = 'res-kicker loss';
    amt.textContent = `−${fmt(m.stake)}`;
    amt.className = 'res-amount';
    det.innerHTML = `The raid closed with you still in it. Your <b>${fmt(m.lost)} sats</b> rolled into the next raid's loot. ${inside}.`;
  }
  $('res-again').textContent = m.canRejoin ? `Re-enter now · ${fmt(m.stake)} sats` : `Queue next raid · ${fmt(m.stake)} sats`;
  $('res-again').disabled = m.balance < m.stake;
  showScreen('result');
}

// ------------------------------------------------------------------ wiring
function play() {
  sfx.unlock();
  app.name = $('name').value.trim();
  store.set('darkbags.name', app.name);
  send({ t: 'join', stake: app.stake, name: app.name || 'runner', skin: app.skin });
}

$('name').value = app.name;
$('name').addEventListener('change', () => store.set('darkbags.name', $('name').value.trim()));
$('name').addEventListener('keydown', (e) => e.key === 'Enter' && !$('play').disabled && play());
$('play').addEventListener('click', play);
$('faucet').addEventListener('click', () => send({ t: 'faucet' }));
$('mode-online').addEventListener('click', () => app.mode !== 'online' && setMode('online'));
$('mode-practice').addEventListener('click', () => app.mode !== 'practice' && setMode('practice'));
$('res-again').addEventListener('click', play);
$('res-tables').addEventListener('click', () => {
  send({ t: 'leave' });
  showScreen('lobby');
});
$('wait-cancel').addEventListener('click', () => {
  send({ t: 'unqueue' });
  send({ t: 'leave' });
  showScreen('lobby');
});
$('bluff-chip').addEventListener('click', () => game.cycleBluff());
$('dash-chip').addEventListener('click', () => (input.dashQueued = true));
const muteChip = $('mute-chip');
const syncMute = () => muteChip.setAttribute('aria-pressed', String(sfx.muted));
muteChip.addEventListener('click', () => {
  sfx.toggle();
  syncMute();
});
syncMute();
input.onBluff = () => game.cycleBluff();
input.onMute = () => {
  sfx.toggle();
  syncMute();
};
input.onAnyInput = () => sfx.unlock();

const enableTouch = () => {
  input.enableTouch($('touch'));
  $('touch').hidden = app.screen !== 'game';
};
if (matchMedia('(pointer: coarse)').matches) enableTouch();
addEventListener('touchstart', enableTouch, { once: true, passive: true });

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
globalThis.__darkbags = { app, game, input };

attract.start();
showScreen('lobby');
setMode(SERVER && store.get('darkbags.mode', 'online') === 'online' ? 'online' : 'practice');
requestAnimationFrame(loop);
