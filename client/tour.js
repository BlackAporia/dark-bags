// Nyx, the raid handler: after the welcome (name and region, welcome.js) she walks a new player
// through the whole game in text, page by page (what every part is for and how it works), and
// ends by playing their first match with them: Practice, Raid, Play, Ready, then the raid
// itself with her calling out what matters as it happens. No voice: every line is written in
// the player's language, typed out while she "talks", big enough to read at a glance.
import { createNyx } from './nyx.js';
import { settings } from './settings.js';
import { store } from './store.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

// The whole first session, in order. The player can only press what the step asks for: everything
// else on the screen is locked until the tour is over.
//   page: the page to show; target: what she points at (and the only thing that can be pressed);
//   wait: what has to happen for the step to move on (by itself); ok: her reaction; mood: her face;
//   raid: the guided match; hold: hide the card until the target shows up.
const FLOW = [
  { key: 'hello', mood: 'happy' },
  // the menu and the Play page
  { key: 'menu', target: ['#menu-nav'], page: 'play' },
  { key: 'profile', target: ['.page-play .hero'], page: 'play' },
  { key: 'goals', target: ['#goals'], page: 'play' },
  { key: 'modes', target: ['#mode-cats', '#modes'], page: 'play' },
  { key: 'modeInfo', target: ['#mode-info'], page: 'play' },
  { key: 'stake', target: ['#tables'], page: 'play' },
  { key: 'coins', target: ['#paywith'], page: 'play' },
  { key: 'wallet', target: ['.topbar .tb-right', '#tb-wallet', '.tb-chip'], page: 'play' },
  // the store
  { key: 'shop', target: ['#offers-root', '.shop-tabs', '#shop-root'], page: 'shop' },
  { key: 'cases', target: ['.box-group', '.shop-tabs'], page: 'shop' },
  { key: 'wheel', target: ['#fortune-root', '.fortune'], page: 'shop' },
  { key: 'inventory', target: ['#inv-root'], page: 'inventory' },
  { key: 'swap', target: ['.nav-btn[data-page="swap"]', '.page[data-page="swap"] > :not([hidden])'], page: 'swap' },
  // play more, earn more
  { key: 'pass', target: ['.bp-hero', '#pass-root', '.nav-btn[data-page="pass"]'], page: 'pass' },
  { key: 'ranked', target: ['.nav-btn[data-page="ranked"]', '.page[data-page="ranked"] > :not([hidden])'], page: 'ranked' },
  { key: 'tasks', target: ['.nav-btn[data-page="achievements"]', '.page[data-page="achievements"] > :not([hidden])'], page: 'achievements' },
  // together
  { key: 'social', target: ['.nav-btn[data-page="friends"]', '.nav-btn[data-page="chat"]', '.page[data-page="friends"] > :not([hidden])'], page: 'friends' },
  { key: 'mail', target: ['.nav-btn[data-page="mail"]', '.nav-btn[data-page="invite"]', '.page[data-page="invite"] > :not([hidden])'], page: 'invite' },
  { key: 'settings', target: ['.nav-btn[data-page="settings"]', '.page[data-page="settings"] > :not([hidden])'], page: 'settings' },
  // the first match, together
  { key: 'match', page: 'play', mood: 'wow' },
  { key: 'practice', target: ['#mode-practice'], wait: 'practice', ok: 'practiceOk', page: 'play' },
  { key: 'raidPick', target: ['#modes .mode-card[data-mode="raid"]', '#modes'], wait: 'mode', ok: 'modeOk', page: 'play' },
  { key: 'bag', target: ['#tables'], page: 'play' },
  { key: 'play', target: ['#play'], wait: 'play', page: 'play' },
  { key: 'ready', target: ['#ready'], wait: 'game' },
  { key: 'raid', raid: true },
  { key: 'resultWon', target: ['#res-tables'], wait: 'lobby', mood: 'happy' },
  { key: 'bye', mood: 'happy' },
];

export function createTour({ app, go, touch = () => false, sfx = null, game = null, pickRaid = () => {}, tune = () => {}, toast = null }) {
  let el = null;
  let nyx = null;
  let steps = [];
  let i = 0;
  let typeT = 0;
  let pollT = 0;
  let dock = null; // the in-raid companion
  let raid = null; // { said: Set, t0, bag0, k0 }
  let active = false; // the tour is running: everything but the step's target is locked
  let raidT = 0;
  let face = null; // the Nyx that is talking now (the card or the raid dock)

  // her line, typed out while her lips move: a title and the text (paragraphs on blank lines)
  function write(box, key) {
    const title = box.querySelector('.tut-title');
    const text = box.querySelector('.tut-text');
    const head = t(`tut.${key}.t`);
    const body = t(`tut.${key}`);
    const plain = body === `tut.${key}` ? t(`nyx.${key}`) : body;
    if (title) {
      title.textContent = head === `tut.${key}.t` ? '' : head;
      title.hidden = !title.textContent;
    }
    clearInterval(typeT);
    const html = (s) => s.split(/\n+/).map((p) => `<p>${p.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*\*?/g, '')}</p>`).join('');
    face?.chatter(Math.min(4000, plain.length * 22));
    if (!settings.motion) {
      text.innerHTML = html(plain);
      return;
    }
    let k = 0;
    text.innerHTML = '';
    typeT = setInterval(() => {
      k += 3;
      text.innerHTML = html(plain.slice(0, k));
      if (k >= plain.length) {
        clearInterval(typeT);
        text.innerHTML = html(plain);
      }
    }, 16);
  }

  // ----------------------------------------------------------------- lobby
  // a target is a selector, or a function that finds the element
  const resolve = (sel) => (typeof sel === 'function' ? sel() : document.querySelector(sel));
  const visible = (sel) => {
    for (const s of sel ?? []) {
      const n = resolve(s);
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
        <div class="tour-nyx" id="tour-nyx"></div>
        <div class="tour-body">
          <p class="tour-who"><b id="tour-name">NYX</b> <span>${t('tour.who')}</span><span class="tour-count" id="tour-count"></span></p>
          <h3 class="tut-title" id="tour-title"></h3>
          <div class="tut-text" id="tour-text" aria-live="polite"></div>
          <p class="tour-move" id="tour-move" hidden>👆 ${t('tour.yourMove')}</p>
          <div class="tour-dots" id="tour-dots" aria-hidden="true"></div>
          <div class="tour-actions">
            <button type="button" class="ghost tour-skip" id="tour-skip">${t('tour.skip')}</button>
            <span class="tour-grow"></span>
            <button type="button" class="ghost" id="tour-back">← ${t('wel.back')}</button>
            <button type="button" class="cta" id="tour-next">${t('tour.next')}</button>
          </div>
        </div>
      </div>`;
    document.body.append(el);
    nyx = createNyx($('tour-nyx'));
    face = nyx;
    $('tour-next').addEventListener('click', () => {
      if (!steps[i]?.wait && !more(true)) advance();
    });
    $('tour-back').addEventListener('click', back);
    $('tour-skip').addEventListener('click', skip);
    addEventListener('resize', place);
  }

  function place() {
    if (!el || !steps[i]) return;
    const s = steps[i];
    const spot = $('tour-spot');
    const card = $('tour-card');
    const n = visible(s.target);
    // out of the way during the raid, behind a rank-up show, or until the target turns up
    const rk = $('rankup');
    const hold = s.raid || (rk && !rk.hidden) || (s.hold && !n);
    el.classList.toggle('hold', !!hold);
    card.classList.remove('top');
    // on phones the menu is a bar at the bottom: the card sits just above it
    const nav = $('menu-nav')?.getBoundingClientRect();
    card.style.bottom = nav && nav.height && nav.top > innerHeight / 2 && nav.top < innerHeight ? `${Math.round(innerHeight - nav.top + 8)}px` : '';
    if (!n) {
      spot.className = 'tour-spot none';
      return;
    }
    const card0 = card.getBoundingClientRect();
    if (s.scrolled !== n) {
      s.scrolled = n;
      // bring the target to the top of the page, so the card at the bottom covers none of it
      const sc = n.closest('.pages');
      if (sc) {
        const r0 = n.getBoundingClientRect();
        sc.scrollTo({ top: Math.max(0, sc.scrollTop + r0.top - sc.getBoundingClientRect().top - 14), behavior: 'instant' });
      } else n.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    }
    const r = n.getBoundingClientRect();
    const pad = 8;
    const sc = n.closest('.pages');
    const top = Math.max(sc ? sc.getBoundingClientRect().top : 0, r.top - pad);
    const bottom = Math.min(innerHeight, r.bottom + pad);
    spot.className = `tour-spot${s.wait ? ' act' : ''}`;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${top}px`, width: `${r.width + pad * 2}px`, height: `${Math.max(0, bottom - top)}px` });
    // the card stays at the bottom unless the target sits there (the phone menu, the end of a
    // page): then it goes to the top
    const free = innerHeight - card0.height - 18;
    const hidBottom = Math.max(0, Math.min(bottom, innerHeight) - free);
    const hidTop = Math.max(0, Math.min(bottom, card0.height + 18) - top);
    if (hidBottom > 0 && hidTop < hidBottom && top > free - 40) card.classList.add('top');
    if (!s.wait) $('tour-next').textContent = i === steps.length - 1 ? t('tour.finish') : `${t('tour.next')} ${more(false) ? '↓' : '→'}`;
  }

  // A section taller than the room above the card (the shop, the cases, the inventory): Next
  // first scrolls the rest of it into view, then moves on. go=false only asks.
  function more(go) {
    const s = steps[i];
    if (!s || s.wait || s.raid || (s.pans ?? 0) >= 4) return false;
    const n = visible(s.target);
    const sc = n?.closest('.pages');
    const card = $('tour-card');
    if (!sc || card.classList.contains('top')) return false;
    const free = card.getBoundingClientRect().top - 14;
    const r = n.getBoundingClientRect();
    if (r.bottom <= free + 6) return false;
    const room = free - sc.getBoundingClientRect().top - 70;
    const want = Math.min(r.bottom - free + 14, Math.max(80, room));
    const max = sc.scrollHeight - sc.clientHeight - sc.scrollTop;
    if (max < 20) return false;
    if (go) {
      s.pans = (s.pans ?? 0) + 1;
      sc.scrollTo({ top: sc.scrollTop + Math.min(want, max), behavior: 'smooth' });
    }
    return true;
  }

  // is what this step asks for already done?
  function done(wait) {
    if (wait === 'practice') return app.mode === 'practice';
    if (wait === 'mode') return store.get('darkbags.tour.picked', false);
    if (wait === 'play') return app.screen === 'prep' || app.screen === 'game';
    if (wait === 'game') return app.screen === 'game';
    if (wait === 'lobby') return app.screen === 'lobby';
    return false;
  }

  function show(n) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    const s = steps[i];
    el.dataset.step = s.key;
    if (s.raid) {
      el.classList.add('hold');
      if (app.screen === 'game') startRaid();
      return;
    }
    closeDock();
    face = nyx;
    if (s.page && app.screen === 'lobby' && app.page !== s.page) go(s.page);
    if (['bag', 'play'].includes(s.key)) pickRaid();
    if (s.key === 'play') tune(true); // the guided raid: easy bots, a few of them, a little more time
    el.classList.toggle('acting', !!s.wait);
    $('tour-move').hidden = !s.wait;
    $('tour-next').hidden = !!s.wait;
    $('tour-back').hidden = !!s.wait || i === 0 || steps[i - 1]?.wait || steps[i - 1]?.raid;
    $('tour-next').textContent = i === steps.length - 1 ? t('tour.finish') : `${t('tour.next')} →`;
    const dots = steps.filter((x) => !x.extra);
    const at = dots.indexOf(s.extra ? steps[i + 1] : s);
    $('tour-count').textContent = `${Math.max(1, at + 1)} / ${dots.length}`;
    $('tour-dots').innerHTML = dots.map((_, k) => `<i class="${k === at ? 'on' : k < at ? 'past' : ''}"></i>`).join('');
    nyx?.mood(s.mood ?? null);
    write(el, s.key);
    s.scrolled = null;
    s.pans = 0;
    requestAnimationFrame(place);
    setTimeout(place, 450);
    if (!s.wait) $('tour-next').focus({ preventScroll: true });
  }

  function advance() {
    if (!el) return;
    if (i >= steps.length - 1) return end();
    sfx?.play?.('beep', { f: 1100, dur: 0.02 });
    show(i + 1);
  }
  function back() {
    if (!el || i === 0) return;
    show(i - 1);
  }

  // the player did what the step asked: a short reaction, then on
  function acted() {
    const s = steps[i];
    if (!s?.wait) return;
    nyx?.mood('happy', 1400);
    if (s.ok) {
      write(el, s.ok);
      setTimeout(() => el && steps[i] === s && advance(), 1500);
    } else advance();
  }

  function watch() {
    clearInterval(pollT);
    pollT = setInterval(() => {
      if (!el || !steps[i]) return;
      const s = steps[i];
      if (s.raid) {
        if (app.screen === 'game' && !dock) startRaid();
        return;
      }
      if (s.wait && done(s.wait) && !s.fired) {
        s.fired = true;
        acted();
      }
      place();
    }, 250);
  }

  // ------------------------------------------------------------------ the lock
  // While the tour runs only the highlighted thing (and Nyx's own card) can be pressed. In the
  // raid you play freely, but cannot open the menu to leave. The language picker always works.
  function allowed(node) {
    if (!active || !node?.closest) return true;
    if (node.closest('#tour-card, .nyx-dock, .lang-pick, #dl-pop')) return true;
    if (node.closest('#rankup [data-ru="close"], #rankup [data-lt="ok"]')) return true;
    const s = steps[i];
    if (!s) return true;
    if (s.raid) return !node.closest('#pause-btn, #pause, .pause-btn');
    if (!s.wait) return false; // an explaining step: read, then Next
    for (const sel of s.target ?? []) {
      const n = resolve(sel);
      if (n && (n === node || n.contains(node))) return true;
    }
    return false;
  }
  function nudge() {
    const card = $('tour-card');
    if (!card) return;
    card.classList.remove('nudge');
    void card.offsetWidth;
    card.classList.add('nudge');
    $('tour-spot')?.classList.add('flash');
    setTimeout(() => $('tour-spot')?.classList.remove('flash'), 600);
    sfx?.play?.('beep', { f: 240, dur: 0.07 });
  }
  function block(e) {
    if (allowed(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type === 'pointerdown' || e.type === 'keydown') nudge();
  }
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'contextmenu', 'change', 'input'])
    document.addEventListener(type, (e) => active && (type !== 'change' && type !== 'input' ? block(e) : !allowed(e.target) && e.stopImmediatePropagation()), { capture: true, passive: false });
  document.addEventListener(
    'keydown',
    (e) => {
      if (!active) return;
      if (steps[i]?.raid) {
        // play freely, but no menu (and no leaving) during the guided raid
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          nudge();
        }
        return;
      }
      if (e.key === 'Tab') return; // moving focus is fine
      if (!steps[i]?.wait && (e.key === 'ArrowRight' || e.key === 'Enter') && !e.target?.closest?.('#tour-card')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return advance();
      }
      if (!steps[i]?.wait && e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        return back();
      }
      block(e);
    },
    true,
  );

  // events the waits listen for
  document.addEventListener(
    'click',
    (e) => {
      if (e.target?.closest?.('#modes .mode-card[data-mode="raid"]')) store.set('darkbags.tour.picked', true);
    },
    true,
  );

  function start() {
    if (el || dock) return;
    if (app.screen !== 'lobby') return;
    go('play');
    store.set('darkbags.tour.picked', false);
    store.set('darkbags.tour.active', true);
    store.set('darkbags.tour.done', false);
    steps = FLOW.map((s) => ({ ...s }));
    build();
    active = true;
    document.body.classList.add('touring');
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

  // the player knows the game already: stop here, unlock everything (Settings can call her again)
  function skip() {
    end();
    toast?.(t('tour.skipped'));
  }

  // the end of the tour: everything unlocks
  function end() {
    active = false;
    closeCard();
    closeDock();
    tune(false);
    store.set('darkbags.tour.done', true);
    store.set('darkbags.tour.active', false);
  }

  // -------------------------------------------------------------- the raid
  function startRaid() {
    if (dock) return;
    dock = document.createElement('div');
    dock.className = 'nyx-dock';
    dock.innerHTML = `<div class="nyx-face" id="nyx-face"></div><div class="nyx-says"><p class="nyx-who"><b>NYX</b><button type="button" class="tour-skip dock-skip">${t('tour.skip')}</button></p><div class="tut-text"></div></div>`;
    document.body.append(dock);
    document.body.classList.add('nyx-on');
    face = createNyx(dock.querySelector('#nyx-face'));
    dock._face = face;
    dock.querySelector('.tour-skip').addEventListener('click', skip);
    raid = { said: new Set(), t0: performance.now(), bag0: null, k0: null, last: 0 };
    callout(touch() ? 'startTouch' : 'start', true);
    clearInterval(raidT);
    raidT = setInterval(raidTick, 250);
  }

  // one line per moment, once; a new line waits until the last one had time to be read
  function callout(key, urgent = false) {
    if (!dock || raid.said.has(key)) return;
    const now = performance.now();
    if (!urgent && now - raid.last < 3500) return; // try again on a later tick
    raid.said.add(key);
    raid.last = now;
    write(dock, key);
    if (key === 'kill' || key === 'extracting') face?.mood('wow', 1500);
    else if (key === 'pickup') face?.mood('happy', 1200);
    dock.classList.remove('pop');
    void dock.offsetWidth;
    dock.classList.add('pop');
  }

  function raidTick() {
    if (!dock || !raid) return;
    if (app.screen !== 'game') return;
    const you = game?.you;
    if (!you || you.st !== 'alive') return;
    raid.bag0 ??= you.bag;
    raid.k0 ??= you.k ?? 0;
    const since = (performance.now() - raid.t0) / 1000;
    if ((you.k ?? 0) > raid.k0) callout('kill', true);
    else if (you.bag > raid.bag0) callout('pickup');
    if (since > 9 && you.bag <= raid.bag0) callout('loot');
    if (you.ext > 0) callout('extracting', true);
    else if (you.hp < 40) callout('hurt');
    if (you.storm && !(you.ext > 0)) callout('storm', true);
    const tl = game?.recvTl ? game.recvTl.tl : 999;
    if (since > 20 && (you.bag >= (you.stake || 1) * 1.2 || tl < 100 || since > 50)) callout('exit');
  }

  function closeDock() {
    clearInterval(raidT);
    dock?._face?.destroy();
    dock?.remove();
    dock = null;
    raid = null;
    face = nyx;
    document.body.classList.remove('nyx-on');
  }

  // the raid is over: a win moves the tour on; a loss sends you back in until you get out
  function onResult(m) {
    if (!active || !steps[i]?.raid) return;
    closeDock();
    const won = m.status === 'extracted' || !!m.won;
    if (!won) steps.splice(i + 1, 0, { key: 'retry', target: ['#res-again'], wait: 'game', extra: true }, { key: 'raid', raid: true, extra: true });
    setTimeout(() => active && show(i + 1), 600);
  }

  function onScreen(name) {
    if (!active) return;
    if (name === 'game' && steps[i]?.raid) startRaid();
  }

  // a tour cut short (a reload) starts over until finished
  function maybeStart() {
    if (active) return false;
    const unfinished = store.get('darkbags.tour.active', false) && !store.get('darkbags.tour.done', false);
    if (store.get('darkbags.tour.done', false) && !unfinished) return false;
    setTimeout(start, 400);
    return true;
  }

  return {
    start,
    onResult,
    close: () => end(),
    onScreen,
    maybeStart,
    get open() {
      return active;
    },
  };
}
