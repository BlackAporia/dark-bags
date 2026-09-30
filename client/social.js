// Friends, players, private messages, profiles, guilds and room invites.
// Everything here talks to the server by public player id; tokens never show up.
import { t } from './i18n.js';
import { esc } from './game.js';
import { rankBadgeSvg } from './rankbadge.js';
import { achName } from './achievements.js';
import { figureStill } from './stickman.js';
import { MODE } from '../shared/modes.js';
import { usdText } from '../shared/assets.js';

const $ = (id) => document.getElementById(id);
const ago = (ms) => {
  const m = Math.floor(ms / 60000);
  if (m < 1) return t('so.now');
  if (m < 60) return t('so.min', { n: m });
  const h = Math.floor(m / 60);
  if (h < 48) return t('so.hr', { n: h });
  return t('so.day', { n: Math.floor(h / 24) });
};

export function createSocial({ app, send, toast, joinRoom, isOpen }) {
  const st = {
    tab: 'players',
    q: '',
    players: null,
    friends: null,
    inbox: null,
    thread: null, // { with: card, list }
    guilds: null,
    guild: null,
    me: null, // my public id
    unread: 0,
    requests: 0,
    gchat: null, // { gid, list } your guild's chat
    gUnread: 0,
    gtab: 'chat', // chat | members (your own guild)
    sent: new Set(), // invites sent from this prep screen
  };

  const online = () => app.mode === 'online' && app.status === 'open';
  const statusText = (c) => (c.st === 'off' ? t('so.seen', { t: ago(Date.now() - c.seen) }) : t(`so.st.${c.st}`));

  function badge() {
    const set = (page, n) => {
      const b = document.querySelector(`.nav-btn[data-page="${page}"] .nav-badge`);
      if (!b) return;
      b.hidden = !n;
      b.textContent = n > 9 ? '9+' : String(n);
    };
    set('friends', st.unread + st.requests);
    set('guilds', st.gUnread);
  }

  // one row for a player, with the actions that make sense for them
  function row(c, { invite = false } = {}) {
    if (!c) return '';
    const rel = c.rel;
    const add =
      rel === 'friend' ? `<span class="so-tag ok">${t('so.friend')}</span>`
      : rel === 'sent' ? `<span class="so-tag">${t('so.sent')}</span>`
      : rel === 'incoming' ? `<button type="button" class="ghost sm" data-act="friend" data-id="${c.id}">${t('so.accept')}</button>`
      : `<button type="button" class="ghost sm" data-act="friend" data-id="${c.id}">${t('so.add')}</button>`;
    const inv = invite && c.st !== 'off' && c.st !== 'raid' ? `<button type="button" class="cta sm" data-act="invite" data-id="${c.id}" ${st.sent.has(c.id) ? 'disabled' : ''}>${st.sent.has(c.id) ? t('so.invited') : t('so.invite')}</button>` : '';
    return `<li class="so-row">
      <button type="button" class="so-who" data-act="profile" data-id="${c.id}">
        <i class="so-dot ${c.st}" aria-hidden="true"></i>${rankBadgeSvg(c.rk ?? 1, 18)}
        <span class="so-name"><b>${esc(c.n)}</b>${c.g ? `<em class="so-g">[${esc(c.g)}]</em>` : ''}${c.tt ? `<span class="so-tt">${esc(achName(c.tt))}</span>` : ''}<small>${esc(statusText(c))}</small></span>
      </button>
      <span class="so-acts">${inv}${invite ? '' : add}${invite ? '' : `<button type="button" class="ghost sm" data-act="msg" data-id="${c.id}">${t('so.message')}</button>`}</span>
    </li>`;
  }

  function wire(root) {
    for (const b of root.querySelectorAll('[data-act]')) {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        if (b.dataset.act === 'profile') send({ t: 'profile', id });
        else if (b.dataset.act === 'friend') send({ t: 'friend', id });
        else if (b.dataset.act === 'unfriend') send({ t: 'unfriend', id });
        else if (b.dataset.act === 'msg') openThread(id);
        else if (b.dataset.act === 'invite') {
          send({ t: 'invite', id });
          st.sent.add(id);
          b.disabled = true;
          b.textContent = t('so.invited');
        } else if (b.dataset.act === 'guild') send({ t: 'guild', id });
        else if (b.dataset.act === 'join-guild') send({ t: 'guild_join', id });
      });
    }
  }

  function openThread(id) {
    st.tab = 'messages';
    st.thread = { with: { id, n: '…' }, list: [] };
    send({ t: 'dms', with: id });
    if (app.page !== 'friends') app.go?.('friends');
    render();
    $('dlg-profile')?.close?.();
  }

  // ------------------------------------------------------------ friends page

  function render() {
    const root = $('friends-root');
    if (!root) return;
    if (!online()) {
      root.innerHTML = `<h2 class="sec-h">${t('nav.friends')}</h2><p class="so-empty">${t('so.onlineOnly')}</p>`;
      return;
    }
    const tabs = [
      ['players', t('so.players')],
      ['friends', `${t('so.friends')}${st.requests ? ` <i class="so-n">${st.requests}</i>` : ''}`],
      ['messages', `${t('so.messages')}${st.unread ? ` <i class="so-n">${st.unread}</i>` : ''}`],
    ];
    let body = '';
    if (st.tab === 'players') {
      const list = st.players?.list ?? [];
      body = `<form class="so-search"><input id="so-q" type="search" placeholder="${esc(t('so.search'))}" value="${esc(st.q)}" autocomplete="off"></form>
        <p class="fine">${st.players ? t('so.count', { n: st.players.total, on: list.filter((c) => c.st !== 'off').length }) : ''}</p>
        <ul class="so-list">${list.map((c) => row(c)).join('') || `<li class="so-empty">${st.players ? t('so.none') : '…'}</li>`}</ul>`;
    } else if (st.tab === 'friends') {
      const f = st.friends;
      const req = (f?.incoming ?? []).map((c) => `<li class="so-row"><button type="button" class="so-who" data-act="profile" data-id="${c.id}">${rankBadgeSvg(c.rk ?? 1, 18)}<span class="so-name"><b>${esc(c.n)}</b><small>${t('so.wants')}</small></span></button><span class="so-acts"><button type="button" class="cta sm" data-act="friend" data-id="${c.id}">${t('so.accept')}</button><button type="button" class="ghost sm" data-act="unfriend" data-id="${c.id}">${t('so.decline')}</button></span></li>`).join('');
      body = `${req ? `<p class="eyebrow">${t('so.requests')}</p><ul class="so-list">${req}</ul>` : ''}
        <p class="eyebrow">${t('so.friends')}</p>
        <ul class="so-list">${(f?.friends ?? []).map((c) => row(c)).join('') || `<li class="so-empty">${f ? t('so.noFriends') : '…'}</li>`}</ul>
        ${f?.outgoing?.length ? `<p class="eyebrow">${t('so.pending')}</p><ul class="so-list">${f.outgoing.map((c) => `<li class="so-row"><span class="so-who"><b>${esc(c.n)}</b></span><span class="so-acts"><button type="button" class="ghost sm" data-act="unfriend" data-id="${c.id}">${t('so.cancel')}</button></span></li>`).join('')}</ul>` : ''}`;
    } else if (st.thread) {
      const w = st.thread.with;
      body = `<div class="so-thread">
        <div class="so-th-head"><button type="button" class="link" id="so-back">← ${t('so.messages')}</button><button type="button" class="so-who" data-act="profile" data-id="${w.id}">${w.rk ? rankBadgeSvg(w.rk, 18) : ''}<b>${esc(w.n)}</b>${w.st ? `<small>${esc(statusText(w))}</small>` : ''}</button></div>
        <ul class="so-msgs" id="so-msgs">${st.thread.list.map((m) => `<li class="${m.f === st.me ? 'me' : ''}"><p>${esc(m.text)}</p><time>${new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></li>`).join('') || `<li class="so-empty">${t('so.sayHi')}</li>`}</ul>
        <form class="chat-form" id="so-dm-form"><input id="so-dm" maxlength="300" autocomplete="off" placeholder="${esc(t('chat.ph'))}"><button type="submit" class="cta">${t('chat.send')}</button></form>
      </div>`;
    } else {
      const list = st.inbox?.list ?? [];
      body = `<ul class="so-list">${list.map((c) => `<li class="so-row conv"><button type="button" class="so-who" data-act="msg" data-id="${c.id}">${c.card ? rankBadgeSvg(c.card.rk ?? 1, 18) : ''}<span class="so-name"><b>${esc(c.card?.n ?? '?')}</b><small>${esc(c.last.text)}</small></span>${c.unread ? `<i class="so-n">${c.unread}</i>` : ''}</button></li>`).join('') || `<li class="so-empty">${st.inbox ? t('so.noMsgs') : '…'}</li>`}</ul>`;
    }
    root.innerHTML = `<h2 class="sec-h">${t('nav.friends')}</h2>
      <div class="seg-row so-tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-pressed="${st.tab === id}">${label}</button>`).join('')}</div>
      <div class="so-body">${body}</div>`;
    for (const b of root.querySelectorAll('[data-tab]'))
      b.addEventListener('click', () => {
        st.tab = b.dataset.tab;
        st.thread = null;
        load();
        render();
      });
    wire(root);
    const q = $('so-q');
    if (q) {
      let timer = null;
      q.addEventListener('input', () => {
        st.q = q.value;
        clearTimeout(timer);
        timer = setTimeout(() => send({ t: 'players', q: st.q }), 250);
      });
      root.querySelector('.so-search').addEventListener('submit', (e) => e.preventDefault());
    }
    $('so-back')?.addEventListener('click', () => {
      st.thread = null;
      send({ t: 'inbox' });
      render();
    });
    const form = $('so-dm-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = $('so-dm');
        const text = input.value.trim();
        if (!text) return;
        send({ t: 'dm', to: st.thread.with.id, text });
        input.value = '';
      });
      const ul = $('so-msgs');
      ul.scrollTop = ul.scrollHeight;
      $('so-dm').focus({ preventScroll: true });
    }
  }

  function load() {
    if (!online()) return;
    if (st.tab === 'players') send({ t: 'players', q: st.q });
    else if (st.tab === 'friends') send({ t: 'friends' });
    else if (st.thread) send({ t: 'dms', with: st.thread.with.id });
    else send({ t: 'inbox' });
  }

  // --------------------------------------------------------------- guilds page

  const hhmm = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const gmsg = (m) =>
    `<li class="${m.f === st.me ? 'me' : ''}">${m.f === st.me ? '' : `<button type="button" class="gd-from" data-act="profile" data-id="${esc(m.f)}">${rankBadgeSvg(m.rk ?? 1, 14)}<b>${esc(m.n ?? '?')}</b></button>`}<p>${esc(m.text)}</p><time>${hhmm(m.at)}</time></li>`;

  // a new guild message: add it in place (keeps what you are typing), or count it as unread
  function guildMsg(m) {
    const here = isOpen('guilds') && st.guild?.mine && st.gtab === 'chat' && st.gchat?.gid === m.gid;
    if (st.gchat?.gid === m.gid) {
      st.gchat.list.push(m.m);
      if (st.gchat.list.length > 150) st.gchat.list.shift();
    }
    const ul = $('gd-msgs');
    if (here && ul) {
      ul.querySelector('.so-empty')?.remove();
      ul.insertAdjacentHTML('beforeend', gmsg(m.m));
      for (const b of ul.lastElementChild.querySelectorAll('[data-act="profile"]')) b.addEventListener('click', () => send({ t: 'profile', id: b.dataset.id }));
      ul.scrollTop = ul.scrollHeight;
      if (m.m.f !== st.me) send({ t: 'guild_read' });
      return;
    }
    if (m.m.f === st.me) return;
    st.gUnread = m.gUnread ?? st.gUnread + 1;
    badge();
    toast(`🛡 ${m.m.n}: ${m.m.text}`);
  }

  function renderGuilds() {
    const root = $('guilds-root');
    if (!root) return;
    if (!online()) {
      root.innerHTML = `<h2 class="sec-h">${t('nav.guilds')}</h2><p class="so-empty">${t('so.onlineOnly')}</p>`;
      return;
    }
    const G = st.guilds;
    const mine = st.guild;
    let top = '';
    if (mine) {
      const g = mine.guild;
      // your own guild opens on its chat; any other guild shows its members
      const chat = mine.mine && st.gtab === 'chat';
      top = `<section class="gd-card">
        <div class="gd-head"><span class="gd-tag">${esc(g.tag)}</span><div><h3>${esc(g.name)}</h3><p class="fine">${esc(g.desc || '')}</p></div></div>
        ${mine.mine ? `<div class="seg-row so-tabs gd-tabs" role="tablist"><button type="button" role="tab" data-gtab="chat" aria-pressed="${chat}">${t('gd.chat')}</button><button type="button" role="tab" data-gtab="members" aria-pressed="${!chat}">${t('gd.members', { n: mine.members.length })}</button></div>` : `<p class="eyebrow">${t('gd.members', { n: mine.members.length })}</p>`}
        ${chat ? `<div class="gd-chat">
          <ul class="so-msgs" id="gd-msgs">${st.gchat?.gid === g.id ? st.gchat.list.map(gmsg).join('') || `<li class="so-empty">${t('gd.chatEmpty')}</li>` : '<li class="so-empty">…</li>'}</ul>
          <form class="chat-form" id="gd-say-form"><input id="gd-say" maxlength="300" autocomplete="off" placeholder="${esc(t('gd.chatPh'))}"><button type="submit" class="cta">${t('chat.send')}</button></form>
        </div>` : `<ul class="so-list">${mine.members.map((c) => row(c)).join('')}</ul>`}
        ${mine.mine ? `<button type="button" class="ghost" id="gd-leave">${t('gd.leave')}</button>` : G?.mine ? '' : `<button type="button" class="cta" data-act="join-guild" data-id="${g.id}">${t('gd.join')}</button>`}
        <button type="button" class="link" id="gd-back">← ${t('gd.all')}</button>
      </section>`;
    }
    const can = G?.can ?? { ok: false };
    const req = G ? `<ul class="gd-req"><li class="${G.rank >= G.need.rank ? 'ok' : ''}">${t('gd.needRank', { n: G.need.rank, have: G.rank })}</li><li class="${G.purchases >= 1 ? 'ok' : ''}">${t('gd.needBuy')}</li></ul>` : '';
    // founding: the requirements are always in view; the form appears once they are met
    const create = G && !G.mine
      ? `<section class="gd-create"><p class="gd-create-h">${t('gd.create')}</p>
          ${req}
          ${can.ok ? `<form id="gd-form" class="gd-form">
            <input id="gd-name" maxlength="24" placeholder="${esc(t('gd.name'))}">
            <input id="gd-tag" maxlength="5" placeholder="${esc(t('gd.tag'))}">
            <input id="gd-desc" maxlength="140" placeholder="${esc(t('gd.desc'))}">
            <button type="submit" class="cta">${t('gd.found')}</button>
          </form>` : ''}</section>`
      : '';
    const list = (G?.list ?? []).map((g) => `<li class="so-row"><button type="button" class="so-who" data-act="guild" data-id="${g.id}"><span class="gd-tag sm">${esc(g.tag)}</span><span class="so-name"><b>${esc(g.name)}</b><small>${t('gd.count', { n: g.n, on: g.on })}${g.desc ? ` · ${esc(g.desc)}` : ''}</small></span></button><span class="so-acts">${G.mine === g.id ? `<span class="so-tag ok">${t('gd.yours')}</span>` : G.mine ? '' : `<button type="button" class="ghost sm" data-act="join-guild" data-id="${g.id}">${t('gd.join')}</button>`}</span></li>`).join('');
    root.innerHTML = `<h2 class="sec-h">${t('nav.guilds')}</h2>${top}${create}
      <p class="eyebrow">${t('gd.list')}</p>
      <ul class="so-list">${list || `<li class="so-empty">${G ? t('gd.none') : '…'}</li>`}</ul>`;
    wire(root);
    for (const b of root.querySelectorAll('[data-gtab]'))
      b.addEventListener('click', () => {
        st.gtab = b.dataset.gtab;
        if (st.gtab === 'chat') send({ t: 'guild_chat' });
        renderGuilds();
      });
    const ul = $('gd-msgs');
    if (ul) ul.scrollTop = ul.scrollHeight;
    $('gd-say-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('gd-say');
      const text = input.value.trim();
      if (!text) return;
      send({ t: 'guild_say', text });
      input.value = '';
    });
    $('gd-leave')?.addEventListener('click', () => send({ t: 'guild_leave' }));
    $('gd-back')?.addEventListener('click', () => {
      st.guild = null;
      renderGuilds();
    });
    $('gd-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      send({ t: 'guild_create', name: $('gd-name').value, tag: $('gd-tag').value, desc: $('gd-desc').value });
    });
  }

  // ------------------------------------------------------------------ profile

  function showProfile(m) {
    const c = m.card;
    const s = m.stats ?? {};
    const secs = s.secs ?? 0;
    const stat = (k, v) => `<div><b class="num">${v}</b><span>${t(k)}</span></div>`;
    $('pf-body').innerHTML = `
      <div class="pf-top">
        <img class="pf-fig" alt="" src="${figureStill({ outfit: m.look?.outfit, body: m.look?.body }, 90, 124)}">
        <div class="pf-id">
          <p class="pf-name">${rankBadgeSvg(c.rk ?? 1, 26)}<b>${esc(c.n)}</b>${c.g ? `<em class="so-g">[${esc(c.g)}]</em>` : ''}</p>
          ${c.tt ? `<p class="so-tt">${esc(achName(c.tt))}</p>` : ''}
          <p class="fine"><i class="so-dot ${c.st}"></i> ${esc(statusText(c))} · ${t('pf.rank', { n: c.rk })}</p>
          ${m.guild ? `<p class="fine">${t('pf.guild', { g: `${m.guild.name} [${m.guild.tag}]` })}</p>` : ''}
        </div>
      </div>
      <div class="pf-stats">
        ${stat('pf.raids', s.raids ?? 0)}${stat('pf.wins', s.wins ?? 0)}${stat('pf.kills', s.kills ?? 0)}
        ${stat('pf.extracts', s.extracts ?? 0)}${stat('pf.best', s.bestKills ?? 0)}${stat('pf.time', `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`)}
        ${stat('pf.ach', m.done ?? 0)}${stat('pf.multi', s.bestMulti ?? 0)}${stat('pf.since', new Date(m.created).toLocaleDateString())}
      </div>
      ${c.rel === 'me' ? '' : `<div class="pf-acts">
        ${c.rel === 'friend' ? `<button type="button" class="ghost" data-act="unfriend" data-id="${c.id}">${t('so.remove')}</button>` : c.rel === 'sent' ? `<span class="so-tag">${t('so.sent')}</span>` : `<button type="button" class="cta" data-act="friend" data-id="${c.id}">${c.rel === 'incoming' ? t('so.accept') : t('so.add')}</button>`}
        <button type="button" class="ghost" data-act="msg" data-id="${c.id}">${t('so.message')}</button>
        ${app.screen === 'prep' && c.st !== 'off' && c.st !== 'raid' ? `<button type="button" class="ghost" data-act="invite" data-id="${c.id}">${t('so.invite')}</button>` : ''}
      </div>`}`;
    wire($('pf-body'));
    const d = $('dlg-profile');
    if (!d.open) d.showModal();
  }

  // ------------------------------------------------------------ invite dialog

  function openInvite() {
    st.sent.clear();
    $('inv-list').innerHTML = `<li class="so-empty">…</li>`;
    $('dlg-invite').showModal();
    send({ t: 'friends' });
    send({ t: 'players' });
    st.inviting = true;
  }
  function renderInvite() {
    if (!st.inviting || !$('dlg-invite').open) return;
    const friends = (st.friends?.friends ?? []).filter((c) => c.st !== 'off');
    const ids = new Set(friends.map((c) => c.id));
    const others = (st.players?.list ?? []).filter((c) => c.st !== 'off' && !ids.has(c.id));
    const html = `${friends.length ? `<li class="eyebrow">${t('so.friends')}</li>${friends.map((c) => row(c, { invite: true })).join('')}` : ''}
      ${others.length ? `<li class="eyebrow">${t('so.onlineNow')}</li>${others.map((c) => row(c, { invite: true })).join('')}` : ''}`;
    $('inv-list').innerHTML = html.trim() || `<li class="so-empty">${t('so.nobody')}</li>`;
    wire($('inv-list'));
  }

  // an invite from someone else: a card that stays until you join or close it
  function showInvited(m) {
    const box = $('invites');
    const el = document.createElement('div');
    el.className = 'inv-card';
    el.innerHTML = `<p><b>${esc(m.from.n)}</b> ${t('so.invitesYou')}</p><p class="fine">${esc(t(`mode.${m.mode}`))} · ${usdText(m.stake)} · ${t('so.waitingN', { n: m.waiting })}</p>
      <div class="inv-acts"><button type="button" class="cta sm">${t('so.join')}</button><button type="button" class="ghost sm">${t('so.later')}</button></div>`;
    const [join, later] = el.querySelectorAll('button');
    join.addEventListener('click', () => {
      el.remove();
      joinRoom(m.mode, m.stake);
    });
    later.addEventListener('click', () => el.remove());
    box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => el.remove(), 60000);
  }

  // ---------------------------------------------------------------- messages

  function onMessage(m) {
    switch (m.t) {
      case 'welcome':
      case 'social': {
        const sm = m.t === 'welcome' ? m.social : m;
        if (sm) {
          st.me = sm.me;
          st.unread = sm.unread ?? 0;
          st.requests = sm.requests ?? 0;
          st.gUnread = sm.gUnread ?? 0;
          badge();
        }
        break;
      }
      case 'players':
        st.players = m;
        if (st.tab === 'players' && isOpen('friends')) render();
        renderInvite();
        break;
      case 'friends':
        st.friends = m;
        st.requests = m.incoming.length;
        badge();
        if (isOpen('friends')) render();
        renderInvite();
        break;
      case 'inbox':
        st.inbox = m;
        st.unread = m.unread;
        badge();
        if (isOpen('friends')) render();
        break;
      case 'dms':
        st.thread = { with: m.with, list: m.list };
        st.unread = m.unread;
        badge();
        if (isOpen('friends')) render();
        break;
      case 'dm': {
        const other = m.m.f === st.me ? m.m.to : m.m.f;
        if (st.thread && st.thread.with.id === other && isOpen('friends')) {
          st.thread.list.push(m.m);
          render();
          if (m.m.f !== st.me) send({ t: 'dms', with: other }); // mark read
        } else if (m.m.f !== st.me) {
          st.unread = m.unread ?? st.unread + 1;
          badge();
          toast(`✉ ${m.from?.n ?? ''}: ${m.m.text}`);
        }
        break;
      }
      case 'friendReq':
        if (m.rel === 'incoming') {
          st.requests++;
          badge();
          toast(t('so.reqToast', { n: m.from.n }));
        } else if (m.rel === 'friend') toast(t('so.nowFriends', { n: m.from.n }));
        if (isOpen('friends')) load();
        break;
      case 'rel':
        if (isOpen('friends')) load();
        if ($('dlg-profile').open) send({ t: 'profile', id: m.id });
        break;
      case 'profile':
        showProfile(m);
        break;
      case 'guilds':
        st.guilds = m;
        if (m.mine && !st.guild) send({ t: 'guild', id: m.mine });
        if (isOpen('guilds')) renderGuilds();
        break;
      case 'guild':
        st.guild = m;
        if (m.mine && st.gtab === 'chat') send({ t: 'guild_chat' });
        if (isOpen('guilds')) renderGuilds();
        break;
      case 'guild_chat':
        st.gchat = { gid: m.gid, list: m.list };
        st.gUnread = 0;
        badge();
        if (isOpen('guilds')) renderGuilds();
        break;
      case 'guild_msg':
        guildMsg(m);
        break;
      case 'guildDone':
        st.guild = null;
        st.gchat = null;
        st.gtab = 'chat';
        if (!m.id) {
          st.gUnread = 0;
          badge();
        }
        send({ t: 'guilds' });
        if (m.id) send({ t: 'guild', id: m.id });
        break;
      case 'guildErr':
        toast(t(`gd.err.${m.why}`));
        break;
      case 'invited':
        showInvited(m);
        break;
      case 'invSent':
        toast(t('so.invSent'));
        break;
      default:
    }
  }

  $('dlg-profile-x')?.addEventListener('click', () => $('dlg-profile').close());
  $('inv-x')?.addEventListener('click', () => {
    st.inviting = false;
    $('dlg-invite').close();
  });

  return {
    onMessage,
    render: () => {
      render();
      load();
    },
    guildsPage: {
      render: () => {
        renderGuilds();
        if (!online()) return;
        send({ t: 'guilds' });
        if (st.guild?.mine && st.gtab === 'chat') send({ t: 'guild_chat' }); // fresh, and read
      },
    },
    openInvite,
    profile: (id) => send({ t: 'profile', id }),
  };
}
