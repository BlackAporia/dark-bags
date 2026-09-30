// Lobby chat: everyone in the lobby, plain text, rate limited on the server. In
// practice the bots keep the room from feeling empty.
import { rankBadgeSvg } from './rankbadge.js';
import { esc } from './game.js';
import { t } from './i18n.js';
import { achName } from './achievements.js';

const $ = (id) => document.getElementById(id);
const BANTER = ['gm raiders', 'who took my bag 😤', 'last exit or nothing', 'knife only run?', 'storm is cooked this round', 'duel me', 'just pulled an epic 👀', 'wagmi', 'bags packed, heading in', 'that sniper laser gives you away lol', 'team 4v4 anyone?', 'gg', 'rng hates me today', 'golden raid next!', 'never extract early', 'who has the Void crate skin?'];
const BOTS = ['utxo_uri', 'gm_ghost', 'satsuma', 'nonce_nina', 'rekt_rex', 'hodl_hana', 'mempool_mo', 'lambo_lu'];

export function createChat({ app, send, isOpen }) {
  const st = { list: [], unread: 0, banter: 0 };

  function badge() {
    const b = document.querySelector('.nav-btn[data-page="chat"] .nav-badge');
    if (!b) return;
    b.hidden = !st.unread;
    b.textContent = st.unread > 9 ? '9+' : String(st.unread);
  }

  function line(m) {
    const title = m.tt ? `<span class="chat-tt">${esc(achName(m.tt))}</span>` : '';
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
    st.list.push(m);
    if (st.list.length > 100) st.list.shift();
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
  }

  // practice: now and then a bot says something
  setInterval(() => {
    if (app.mode !== 'practice' || document.hidden) return;
    if (Math.random() > 0.35) return;
    push({ n: BOTS[Math.floor(Math.random() * BOTS.length)], text: BANTER[Math.floor(Math.random() * BANTER.length)], at: Date.now(), rk: 1 + Math.floor(Math.random() * 40), bot: 1 });
  }, 15000);

  return { render, onMessage };
}
