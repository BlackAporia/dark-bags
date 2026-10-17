// Lobby chat: everyone in the lobby, plain text, rate limited on the server. In
// practice the bots keep the room from feeling empty. The same chat runs in a match too:
// its last lines over the game, Enter to type (the 💬 button on phones).
import { rankBadgeSvg } from './rankbadge.js';
import { esc } from './game.js';
import { t } from './i18n.js';
import { achName, titleHtml } from './achievements.js';

const $ = (id) => document.getElementById(id);
const BANTER = ['gm raiders', 'who took my bag 😤', 'last exit or nothing', 'knife only run?', 'storm is cooked this round', 'duel me', 'just pulled an epic 👀', 'wagmi', 'bags packed, heading in', 'that sniper laser gives you away lol', 'team 4v4 anyone?', 'gg', 'rng hates me today', 'golden raid next!', 'never extract early', 'who has the Void crate skin?'];
const BOTS = ['utxo_uri', 'gm_ghost', 'satsuma', 'nonce_nina', 'rekt_rex', 'hodl_hana', 'mempool_mo', 'lambo_lu'];

export function createChat({ app, send, isOpen, release = () => {} }) {
  const st = { list: [], unread: 0, banter: 0 };

  function badge() {
    const b = document.querySelector('.nav-btn[data-page="chat"] .nav-badge');
    if (!b) return;
    b.hidden = !st.unread;
    b.textContent = st.unread > 9 ? '9+' : String(st.unread);
  }

  function line(m) {
    const title = m.tt ? titleHtml(m.tt, 'chat-tt') : '';
    const time = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<li class="${m.n === (app.name || 'runner') ? 'me' : ''}${m.bot ? ' bot' : ''}">${rankBadgeSvg(m.rk ?? 1, 18)}<div><p class="chat-who"><b>${esc(m.n)}</b>${title}<time>${time}</time></p><p class="chat-text">${esc(m.text)}</p></div></li>`;
  }

  function render() {
    const root = $('chat-root');
    if (!root) return;
    if (!root.firstChild) {
      root.innerHTML = `<h2 class="sec-h">${t('nav.chat')}</h2><p class="fine chat-note"></p><ul class="chat-list" aria-live="polite"></ul>
        <form class="chat-form"><input maxlength="200" autocomplete="off" placeholder="${esc(t('chat.ph'))}" aria-label="${esc(t('chat.ph'))}"><button type="submit" class="cta">${t('chat.send')}</button></form>`;
      root.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = root.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        send({ t: 'chat', text, name: app.name || 'runner' });
        input.value = '';
      });
    }
    root.querySelector('.chat-note').textContent = t(app.mode === 'practice' ? 'chat.practice' : 'chat.online');
    root.querySelector('input').placeholder = t('chat.ph');
    const ul = root.querySelector('.chat-list');
    ul.innerHTML = st.list.map(line).join('') || `<li class="empty">${t('chat.empty')}</li>`;
    ul.scrollTop = ul.scrollHeight;
    st.unread = 0;
    badge();
  }

  function push(m) {
    m.rx = Date.now(); // when it arrived here: a match shows only fresh lines
    st.list.push(m);
    if (st.list.length > 100) st.list.shift();
    if (app.screen === 'game') renderMatch();
    if (isOpen()) render();
    else {
      st.unread++;
      badge();
    }
  }

  function onMessage(m) {
    if (m.t === 'welcome') {
      st.list = [...(m.chat ?? [])];
      if (isOpen()) render();
    }
    if (m.t === 'chat') push(m.m);
    if (m.t === 'chats') for (const x of m.ms ?? []) push(x); // a busy minute: several at once
    // someone renamed: their earlier lines take the new name
    if (m.t === 'player_renamed') {
      let hit = false;
      for (const x of st.list) if (x.id === m.id) (x.n = m.n), (hit = true);
      if (hit && isOpen()) render();
    }
  }

  // practice: now and then a bot says something
  setInterval(() => {
    if (app.mode !== 'practice' || document.hidden) return;
    if (Math.random() > 0.35) return;
    push({ n: BOTS[Math.floor(Math.random() * BOTS.length)], text: BANTER[Math.floor(Math.random() * BANTER.length)], at: Date.now(), rk: 1 + Math.floor(Math.random() * 40), bot: 1 });
  }, 15000);

  // ------------------------------------------------------------ in a match
  // The last lines fade in at the left for a few seconds; Enter opens a line to type in, Enter
  // sends it, Esc (or an empty line, or tapping away) closes it. Open, it shows the recent past.
  const FRESH_MS = 10000;
  const mc = { el: null, open: false, fade: 0 };
  function matchEl() {
    if (mc.el) return mc.el;
    const hud = $('hud');
    if (!hud) return null;
    const el = document.createElement('div');
    el.className = 'mchat';
    el.innerHTML = `<ul class="mchat-list" aria-live="polite"></ul><form class="mchat-form" hidden><input maxlength="200" autocomplete="off" enterkeyhint="send"><button type="submit" class="mchat-send" aria-label="Send">➤</button></form>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mchat-btn';
    btn.innerHTML = '<span aria-hidden="true">💬</span>';
    btn.addEventListener('click', () => (mc.open ? closeMatch() : openMatch()));
    hud.append(el, btn);
    const form = el.querySelector('form');
    const inp = form.querySelector('input');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = inp.value.trim();
      if (text) send({ t: 'chat', text, name: app.name || 'runner' });
      closeMatch();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation(); // not the pause menu
      closeMatch();
    });
    // tapping back into the game closes it (the send button keeps it until it has sent)
    inp.addEventListener('blur', () => setTimeout(() => mc.open && !el.contains(document.activeElement) && closeMatch(), 150));
    mc.el = el;
    mc.btn = btn;
    return el;
  }

  function place() {
    // above the weapon panel at the bottom left (on phones that panel sits at the top)
    const el = mc.el;
    const hb = document.querySelector('.hud-bottom');
    const touch = document.body.classList.contains('touch-on');
    el.style.bottom = !touch && hb ? `${Math.max(16, innerHeight - hb.getBoundingClientRect().top + 12)}px` : '';
  }

  function renderMatch() {
    const el = matchEl();
    if (!el) return;
    const now = Date.now();
    const lines = st.list.filter((m) => mc.open || now - (m.rx ?? 0) < FRESH_MS).slice(mc.open ? -8 : -5);
    el.querySelector('.mchat-list').innerHTML = lines
      .map((m) => `<li class="${m.n === (app.name || 'runner') ? 'me' : ''}"><b>${esc(m.n)}</b> ${esc(m.text)}</li>`)
      .join('');
    el.classList.toggle('open', mc.open);
    el.hidden = !lines.length && !mc.open;
    place();
    // the lines go when they are old: look again when the oldest shown turns stale
    clearTimeout(mc.fade);
    if (!mc.open && lines.length) mc.fade = setTimeout(renderMatch, Math.max(200, FRESH_MS - (now - lines[0].rx) + 50));
  }

  function openMatch() {
    if (app.screen !== 'game') return;
    const el = matchEl();
    if (!el) return;
    release(); // the runner stops: no key stays held while you type
    mc.open = true;
    const form = el.querySelector('form');
    const inp = form.querySelector('input');
    form.hidden = false;
    inp.placeholder = t('chat.ph');
    inp.value = '';
    renderMatch();
    inp.focus();
  }

  function closeMatch() {
    if (!mc.el) return;
    mc.open = false;
    const inp = mc.el.querySelector('input');
    mc.el.querySelector('form').hidden = true;
    if (document.activeElement === inp) inp.blur();
    renderMatch();
  }

  return { render, onMessage, openMatch, closeMatch, matchOpen: () => mc.open, renderMatch };
}
