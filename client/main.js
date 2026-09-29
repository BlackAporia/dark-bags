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
  balance: null,
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

  $('balance').textContent = app.balance === null ? '—' : fmt(app.balance);
  $('faucet').hidden = !(app.balance !== null && app.balance < Math.min(...CFG.TIERS));
  const play = $('play');
  play.disabled = app.status !== 'open';
  play.textContent = `Go to the ${fmt(app.stake)} sats table`;
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
  if (me.ready) {
    ready.textContent = `Cancel · refund ${fmt(p.stake)}`;
    ready.classList.add('armed');
  } else {
    ready.textContent = `Stake ${fmt(p.stake)} & ready`;
    ready.classList.remove('armed');
  }
  ready.disabled = !me.ready && p.balance < p.stake;
  $('prep-balance').textContent = `Balance ${fmt(p.balance)} test sats`;
}

// ------------------------------------------------------------- transport
function setMode(mode) {
  if (mode === 'online' && !SERVER) mode = 'practice';
  if (app.transport) app.transport.close();
  app.mode = mode;
  app.tables = [];
  app.balance = null;
  app.status = 'connecting';
  app.inRoom = false;
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
    case 'prep': {
      app.prep = m;
      app.balance = m.balance;
      const wasReady = app.wasReady;
      app.wasReady = m.me?.ready;
      if (m.me?.ready && !wasReady) sfx.play('ready');
      if (app.screen === 'prep') renderPrep();
      break;
    }
    case 'start':
      app.balance = m.balance;
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
      app.balance = m.balance;
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
    det.innerHTML = `Out with <b>${fmt(m.payout)}</b> on a <b>${fmt(m.stake)}</b> stake: <b>${pnl >= 0 ? '+' : '−'}${fmt(Math.abs(pnl))} (${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%)</b>. ${inside}. Balance ${fmt(m.balance)}.`;
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
  $('res-again').textContent = `Ready for the next raid · ${fmt(m.stake)} sats`;
  $('res-again').disabled = m.balance < m.stake;
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
  else send({ t: 'ready', name: app.name || 'runner', skin: app.skin });
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
  send({ t: 'ready', name: app.name || 'runner', skin: app.skin });
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
globalThis.__darkbags = { app, game, input, renderer, sfx };

attract.start();
showScreen('lobby');
setMode(SERVER && store.get('darkbags.mode', 'online') === 'online' ? 'online' : 'practice');
requestAnimationFrame(loop);
