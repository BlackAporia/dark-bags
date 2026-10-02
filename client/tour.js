// Nyx, the raid handler: walks a new player (and every newly signed-in wallet) through the
// menu by having them DO each thing (name, Practice, a mode, Play, Ready), then rides along
// in their first practice raid, calling out what matters as it happens. Her voice is English
// (Piper); the line she says is shown word for word, with a translation underneath when the
// game is in another language. Voice goes through the game's own AudioContext (unlocked by
// the intro tap), decoded once per line: reliable on phones, and it drives her lips.
import { createNyx } from './nyx.js';
import { settings } from './settings.js';
import { store } from './store.js';
import { t, getLang } from './i18n.js';

const $ = (id) => document.getElementById(id);

// what she says, exactly (the voice clips in voice/nyx/<key>.mp3)
export const NYX_LINES = {
  hello: "Hiii, runner! I'm Nyx, your guide tonight! Stick with me, and you'll walk out of your very first raid... rich!",
  name: "Okay, first things first! Type a name. Everyone will see it, right above your head!",
  nameOk: "Ooh, cute name! I like it!",
  practice: "Now tap Practice! It's free, it's just bots. Perfect for your first run!",
  practiceOk: "Yesss! Good call!",
  modes: "These are the game modes! Today we play Raid, the classic one. Loot, fight, and get out! Tap Raid!",
  modeOk: "Raid it is! Let's go!",
  bag: "Here's the deal! Your stake goes in your bag. Take someone down, and their bag is yours! Go down... and yours is theirs. Eek!",
  shop: "Outfits and weapon skins come from bags and crates, right here in the shop! And psst... there's a free one waiting for you!",
  social: "Friends, messages, guilds! Bring your squad. Everything's more fun together!",
  wallet: "Want real stakes? Sign in with a wallet, or just an email! Cash-outs only ever go back to your own address. Safe and sound!",
  play: "Ready? Hit Play!",
  ready: "This is the ready room! Press Ready, and we drop in! Woo!",
  start: "We're in! Move with W, A, S, D. Aim with the mouse, and click to shoot! Space to dash!",
  startTouch: "We're in! Your left thumb moves you. Hold Fire, on the right, and it aims for you!",
  loot: "See that orange glow? That's money! Run right over it!",
  pickup: "Yay! Your bag just got heavier!",
  kill: "First blood! Nice shot! Grab what they dropped. Ooh, and a better gun!",
  hurt: "Ouch, you're hurt! Health doesn't come back in a fight, so play it safe!",
  storm: "The storm is coming! Stay inside the circle, quick!",
  exit: "Ooh, that bag looks good on you! Find a green exit ring, and stand in it!",
  extracting: "Hold still! Three seconds! Don't get hit!",
  won: "You made it out! I knew you could do it! See you next raid, runner!",
  dead: "Aww, it happens! Practice is free, so let's run it back!",
};

// the menu part: `wait` is what the player has to do (the step moves on by itself when they
// do it); `ok` is her reaction. `when` skips a step that does not apply.
const LOBBY = [
  { key: 'hello' },
  { key: 'name', target: ['#name'], wait: 'name', ok: 'nameOk' },
  { key: 'practice', target: ['#mode-practice'], wait: 'practice', ok: 'practiceOk' },
  { key: 'modes', target: ['#modes .mode-card[data-mode="raid"]', '#modes'], wait: 'mode', ok: 'modeOk' },
  { key: 'bag', target: ['#play'] },
  { key: 'shop', target: ['.nav-btn[data-page="shop"]'] },
  { key: 'social', target: ['.nav-btn[data-page="friends"]', '.nav-btn[data-page="guilds"]'] },
  { key: 'wallet', target: ['#connect', '#tb-wallet'] },
  { key: 'play', target: ['#play'], wait: 'play' },
  { key: 'ready', target: ['#ready'], wait: 'game' },
];

const SEEN = 'darkbags.tour.seen'; // who has had the tour on this device: 'device', wallet addresses

export function createTour({ app, go, practice, touch = () => false, sfx = null, game = null, pickRaid = () => {} }) {
  let el = null;
  let nyx = null;
  let steps = [];
  let i = 0;
  let typeT = 0;
  let pollT = 0;
  let dock = null; // the in-raid companion
  let raid = null; // { said: Set, t0, bag0, k0 }
  let raidT = 0;

  // ------------------------------------------------------------------ voice
  const buffers = new Map();
  let src = null;
  let analyser = null;
  let raf = 0;
  let mouthOf = null; // the Nyx currently on screen
  let queue = [];
  let speaking = false;
  const voiceOn = () => settings.voice && !store.get('darkbags.tour.mute', false);
  const ctxOf = () => sfx?.ctx ?? null;

  async function load(key) {
    if (buffers.has(key)) return buffers.get(key);
    const ctx = ctxOf();
    if (!ctx) return null;
    const p = fetch(new URL(`voice/nyx/${key}.mp3`, document.baseURI).href)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
      .catch(() => null);
    buffers.set(key, p);
    return p;
  }
  const preload = (keys) => keys.forEach((k) => load(k));

  function stopVoice() {
    try {
      src?.stop();
    } catch {
      /* already stopped */
    }
    src = null;
    speaking = false;
    cancelAnimationFrame(raf);
    mouthOf?.talk(0);
  }

  // say a line: shows it at once, plays the voice when it is decoded
  // `then` runs once the line has been heard (or after a short read when there is no voice)
  async function say(key, { show, interrupt = true, then = null } = {}) {
    show?.(key);
    if (interrupt) {
      queue = [];
      stopVoice();
    }
    const silent = () => then && setTimeout(then, 1400);
    if (!voiceOn()) return silent();
    const ctx = ctxOf();
    if (!ctx) return silent();
    ctx.resume?.();
    const buf = await load(key);
    if (!buf) return silent();
    if (interrupt) stopVoice();
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1.2, (settings.sound ?? 0.9) * 1.15));
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    s.connect(gain).connect(analyser).connect(ctx.destination);
    src = s;
    speaking = true;
    s.onended = () => {
      if (src !== s) return;
      speaking = false;
      mouthOf?.talk(0);
      cancelAnimationFrame(raf);
      if (then) setTimeout(then, 250);
      const next = queue.shift();
      if (next) next();
    };
    s.start();
    const data = new Uint8Array(256);
    const tick = () => {
      if (src !== s || !analyser) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) ** 2;
      mouthOf?.talk(Math.min(1, Math.sqrt(sum / data.length) / 26));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // subtitles: the English she speaks, the translation under it in another language
  function subtitle(box, key) {
    const en = NYX_LINES[key] ?? '';
    const tr = getLang() === 'en' ? '' : t(`nyx.${key}`);
    const main = box.querySelector('.nyx-en');
    const sub = box.querySelector('.nyx-tr');
    clearInterval(typeT);
    sub.textContent = tr;
    sub.hidden = !tr;
    if (!settings.motion) {
      main.textContent = en;
      return;
    }
    let k = 0;
    main.textContent = '';
    typeT = setInterval(() => {
      k += 2;
      main.textContent = en.slice(0, k);
      if (k >= en.length) clearInterval(typeT);
    }, 20);
  }

  // ----------------------------------------------------------------- lobby
  const visible = (sel) => {
    for (const s of sel ?? []) {
      const n = document.querySelector(s);
      if (!n) continue;
      const r = n.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return n;
    }
    return null;
  };

  function build() {
    el = document.createElement('div');
    el.id = 'tour';
    el.className = 'tour';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'tour-name');
    el.innerHTML = `
      <div class="tour-spot" id="tour-spot"></div>
      <div class="tour-card" id="tour-card">
        <button type="button" class="tour-nyx" id="tour-nyx" aria-label="${t('tour.again')}"></button>
        <div class="tour-body">
          <p class="tour-who"><b id="tour-name">NYX</b> <span>${t('tour.who')}</span><button type="button" class="tour-voice" id="tour-voice" title="${t('tour.voice')}"></button></p>
          <p class="tour-text nyx-en" id="tour-text" aria-live="polite"></p>
          <p class="nyx-tr" hidden></p>
          <p class="tour-move" id="tour-move" hidden>👆 ${t('tour.yourMove')}</p>
          <div class="tour-dots" id="tour-dots" aria-hidden="true"></div>
          <div class="tour-actions">
            <button type="button" class="link tour-skip" id="tour-skip">${t('tour.skip')}</button>
            <span class="tour-grow"></span>
            <button type="button" class="cta" id="tour-next">${t('tour.next')}</button>
          </div>
        </div>
      </div>`;
    document.body.append(el);
    nyx = createNyx($('tour-nyx'));
    mouthOf = nyx;
    $('tour-skip').addEventListener('click', () => end(true));
    $('tour-next').addEventListener('click', () => advance());
    $('tour-nyx').addEventListener('click', () => say(steps[i].key, { show: (k) => subtitle(el, k) }));
    $('tour-voice').addEventListener('click', toggleVoice);
    paintVoice();
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') end(true);
    });
    addEventListener('resize', place);
  }

  function paintVoice() {
    const b = $('tour-voice') ?? dock?.querySelector('.tour-voice');
    for (const x of [$('tour-voice'), dock?.querySelector('.tour-voice')]) if (x) x.textContent = voiceOn() ? '🔊' : '🔇';
    return b;
  }
  function toggleVoice() {
    store.set('darkbags.tour.mute', voiceOn());
    if (!voiceOn()) stopVoice();
    paintVoice();
  }

  function place() {
    if (!el || !steps[i]) return;
    const spot = $('tour-spot');
    const card = $('tour-card');
    const n = visible(steps[i].target);
    card.classList.remove('top');
    if (!n) {
      spot.className = 'tour-spot none';
      return;
    }
    // once per step: bring the target into view (a step that asks you to act puts it at the top,
    // clear of the card)
    if (!steps[i].scrolled) {
      steps[i].scrolled = true;
      n.scrollIntoView?.({ block: steps[i].wait ? 'start' : 'nearest', behavior: settings.motion ? 'smooth' : 'auto' });
    }
    const r = n.getBoundingClientRect();
    const pad = 8;
    spot.className = `tour-spot${steps[i].wait ? ' act' : ''}`;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // the card goes where it hides less of the target (on a phone held sideways neither side is
    // fully clear)
    const cr = card.getBoundingClientRect();
    const hideBelow = Math.max(0, r.bottom + pad - (innerHeight - cr.height - 18));
    const hideAbove = Math.max(0, 18 + cr.height - (r.top - pad));
    if (hideBelow > 0 && hideAbove < hideBelow) card.classList.add('top');
  }

  // is what this step asks for already done?
  function done(wait) {
    if (wait === 'name') return !!$('name')?.value.trim() && store.get('darkbags.tour.named', false);
    if (wait === 'practice') return app.mode === 'practice';
    if (wait === 'mode') return store.get('darkbags.tour.picked', false);
    if (wait === 'play') return app.screen === 'prep' || app.screen === 'game';
    if (wait === 'game') return app.screen === 'game';
    return false;
  }

  function show(n) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    const s = steps[i];
    el.dataset.step = s.key;
    // the menu steps live on the Play page; the ready room is its own screen
    if (s.wait !== 'game' && app.screen === 'lobby' && app.page !== 'play') go('play');
    if (s.wait === 'play' && app.gameMode !== 'raid') pickRaid();
    el.classList.toggle('acting', !!s.wait);
    $('tour-move').hidden = !s.wait;
    $('tour-next').hidden = !!s.wait && s.wait !== 'name';
    $('tour-next').textContent = s.wait === 'name' ? t('tour.skipStep') : t('tour.next');
    $('tour-dots').innerHTML = steps.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'past' : ''}"></i>`).join('');
    say(s.key, { show: (k) => subtitle(el, k) });
    requestAnimationFrame(place);
    setTimeout(place, 400);
    if (!s.wait) $('tour-next').focus({ preventScroll: true });
  }

  function advance() {
    if (!el) return;
    const s = steps[i];
    if (i >= steps.length - 1) return end(false);
    show(i + 1);
    return s;
  }

  // the player did what the step asked: a short reaction, then on
  function acted() {
    const s = steps[i];
    if (!s?.wait) return;
    if (s.ok) {
      // let her finish the reaction before the next line cuts in
      let moved = false;
      const go = () => {
        if (moved || !el || steps[i] !== s) return;
        moved = true;
        advance();
      };
      say(s.ok, { show: (k) => subtitle(el, k), then: go });
      setTimeout(go, 4000); // never stuck if the clip never ends
    } else advance();
  }

  function watch() {
    clearInterval(pollT);
    pollT = setInterval(() => {
      if (!el || !steps[i]) return;
      const s = steps[i];
      if (s.wait && done(s.wait) && !s.fired) {
        s.fired = true;
        if (s.wait === 'game') return startRaid();
        acted();
      }
      if (el && steps[i]?.target) place();
    }, 250);
  }

  // events the waits listen for
  document.addEventListener('change', (e) => {
    if (e.target?.id === 'name' && e.target.value.trim()) store.set('darkbags.tour.named', true);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target?.id === 'name' && e.key === 'Enter' && e.target.value.trim()) store.set('darkbags.tour.named', true);
  });
  document.addEventListener('click', (e) => {
    if (e.target?.closest?.('#modes .mode-card[data-mode="raid"]')) store.set('darkbags.tour.picked', true);
  }, true);

  function start() {
    if (el || dock) return;
    if (app.screen !== 'lobby') return;
    go('play');
    store.set('darkbags.tour.named', false);
    store.set('darkbags.tour.picked', false);
    steps = LOBBY.filter((s) => !s.when || s.when(app)).map((s) => ({ ...s }));
    preload(steps.flatMap((s) => [s.key, s.ok].filter(Boolean)));
    preload(['start', 'startTouch', 'loot', 'pickup', 'kill']);
    build();
    // the guided match is a Raid (the loot, the bags, the exits she talks about): the other
    // modes wait until the tour is over
    pickRaid();
    document.body.classList.add('touring', 'tour-raid-only');
    requestAnimationFrame(() => el?.classList.add('in'));
    show(0);
    watch();
  }

  function closeCard() {
    clearInterval(typeT);
    clearInterval(pollT);
    nyx?.destroy();
    nyx = null;
    removeEventListener('resize', place);
    el?.remove();
    el = null;
    document.body.classList.remove('touring', 'tour-raid-only');
  }

  // skipped: everything closes; finished: the raid companion takes over if a raid is starting
  function end(skipped) {
    stopVoice();
    closeCard();
    closeDock();
    if (skipped) store.set('darkbags.tour.done', true);
  }

  // -------------------------------------------------------------- the raid
  function startRaid() {
    closeCard();
    dock = document.createElement('div');
    dock.className = 'nyx-dock';
    dock.innerHTML = `<div class="nyx-face" id="nyx-face"></div><div class="nyx-says"><p class="nyx-who"><b>NYX</b><button type="button" class="tour-voice" title="${t('tour.voice')}"></button><button type="button" class="nyx-x" aria-label="${t('tour.skip')}">✕</button></p><p class="nyx-en"></p><p class="nyx-tr" hidden></p></div>`;
    document.body.append(dock);
    document.body.classList.add('nyx-on');
    const face = createNyx(dock.querySelector('#nyx-face'));
    mouthOf = face;
    dock._face = face;
    dock.querySelector('.tour-voice').addEventListener('click', toggleVoice);
    dock.querySelector('.nyx-x').addEventListener('click', () => end(true));
    paintVoice();
    raid = { said: new Set(), t0: performance.now(), bag0: null, k0: null };
    preload(['hurt', 'storm', 'exit', 'extracting', 'won', 'dead']);
    callout(touch() ? 'startTouch' : 'start', true);
    clearInterval(raidT);
    raidT = setInterval(raidTick, 250);
  }

  // one line per moment, once; the big ones cut in, the rest wait their turn
  function callout(key, urgent = false) {
    if (!dock || raid.said.has(key)) return;
    raid.said.add(key);
    const play = () => say(key, { show: (k) => subtitle(dock, k), interrupt: true });
    if (speaking && !urgent) {
      if (queue.length < 2) queue.push(play);
    } else play();
    dock.classList.remove('pop');
    void dock.offsetWidth;
    dock.classList.add('pop');
  }

  function raidTick() {
    if (!dock || !raid || raid.over) return;
    if (app.screen !== 'game' && app.screen !== 'result') return;
    const you = game?.you;
    if (!you) return;
    raid.bag0 ??= you.bag;
    raid.k0 ??= you.k ?? 0;
    const since = (performance.now() - raid.t0) / 1000;
    if (you.st === 'alive') {
      const raidMode = !game?.potMode && !game?.dmMode; // loot on the map, bags, exits
      if ((you.k ?? 0) > raid.k0) callout('kill', true);
      else if (raidMode && you.bag > raid.bag0) callout('pickup'); // the first coins, however they came
      if (raidMode && since > 7 && you.bag <= raid.bag0) callout('loot');
      if (you.ext > 0) callout('extracting', true);
      else if (you.hp < 40) callout('hurt'); // not over "hold still" while extracting
      if (you.storm && !(you.ext > 0)) callout('storm', true);
      const tl = game?.recvTl ? game.recvTl.tl : 999;
      // where to go: once the bag is worth it, when time runs low, or after a while anyway
      if (raidMode && since > 20 && (you.bag >= (you.stake || 1) * 1.2 || tl < 100 || since > 50)) callout('exit');
    } else if (you.st === 'extracted' || you.st === 'won') {
      finishRaid('won');
    } else if (you.st === 'dead' && !game?.dmMode) {
      finishRaid('dead');
    }
  }

  function finishRaid(key) {
    if (raid.over) return;
    raid.over = true;
    queue = [];
    callout(key, true);
    store.set('darkbags.tour.done', true);
    // and where to find her again
    const hint = document.createElement('p');
    hint.className = 'nyx-replay';
    hint.textContent = t('tour.replayHint');
    dock?.querySelector('.nyx-says')?.append(hint);
    setTimeout(() => closeDock(), 10000);
  }

  function closeDock() {
    clearInterval(raidT);
    dock?._face?.destroy();
    dock?.remove();
    dock = null;
    raid = null;
    document.body.classList.remove('nyx-on');
  }

  // the screen changed under the tour: the ready room keeps the card; a raid hands over to the
  // companion; anything else ends the menu part
  function onScreen(name) {
    if (dock && name === 'lobby') return closeDock();
    if (!el) return;
    if (name === 'prep' || name === 'game') return;
    if (name !== 'lobby') closeCard();
  }

  function maybeStart(who = 'device') {
    const seen = store.get(SEEN, []);
    if (seen.includes(who)) return false;
    store.set(SEEN, [...seen, who].slice(-50));
    setTimeout(start, who === 'device' ? 600 : 300);
    return true;
  }

  function onResult(m) {
    if (dock && raid) finishRaid(m.status === 'extracted' || m.won ? 'won' : 'dead');
  }

  return {
    start,
    onResult,
    close: () => end(false),
    onScreen,
    maybeStart,
    get open() {
      return !!el || !!dock;
    },
  };
}
