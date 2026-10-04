// The Mail page: letters from the team and from the game (the welcome bonus), each maybe with a gift
// to claim (shop $, a bag, a trial skin, wheel spins); a claimed bag opens and a spin turns the shop's
// fortune wheel right from the letter. The server owns the mailbox; this page only shows it and asks.
import { OUTFIT, WSKIN, usd } from '../shared/cosmetics.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createMail({ app, send, sfx, toast, openBox = () => {}, openWheel = () => {}, onUnread = () => {} }) {
  const st = { list: null, open: null, unread: 0, spins: 0, spinning: false };
  const signedIn = () => app.mode === 'online' && !!app.token;

  const titleOf = (m) => (m.i18n ? t(`mail.${m.i18n}.t`) : m.title);
  const bodyOf = (m) => (m.i18n ? t(`mail.${m.i18n}.b`) : m.body);
  function giftText(g) {
    if (!g) return '';
    if (g.k === 'credit') return t('mail.g.credit', { v: usd(g.v) });
    if (g.k === 'spin') return t('mail.g.spin', { n: g.n });
    if (g.k === 'box') return `${t(`box.${g.id}`)}${g.n > 1 ? ` ×${g.n}` : ''}`;
    if (g.k === 'trial') return t('mail.g.trial', { n: OUTFIT[g.id]?.name ?? g.id });
    if (g.k === 'wtrial') return t('mail.g.trial', { n: WSKIN[g.id]?.name ?? g.id });
    return '';
  }

  function setUnread(n) {
    st.unread = n ?? 0;
    onUnread(st.unread);
  }

  function onMessage(m) {
    if (m.t === 'welcome' || m.t === 'authed') {
      st.list = null;
      if (m.locker) st.spins = m.locker.spins ?? 0;
      setUnread(m.mail ?? 0);
      return;
    }
    if (m.t === 'locker' && m.locker) st.spins = m.locker.spins ?? 0;
    if (m.t !== 'mailbox') return;
    if (m.news?.k === 'welcome') {
      toast(t('mail.welcomeToast'));
      sfx?.play('coin');
    } else if (m.news?.k === 'mail') toast(t('mail.newToast'));
    if (m.list) st.list = m.list;
    if (m.locker) {
      st.spins = m.locker.spins ?? 0;
      app.locker = m.locker;
    }
    setUnread(m.unread);
    if (m.claimed) {
      toast(t('mail.claimed', { g: giftText(m.claimed) }));
      sfx?.play('coin');
    }
    if (app.page === 'mail') render();
  }

  function render() {
    const root = $('mail-root');
    if (!root) return;
    if (!signedIn()) {
      root.innerHTML = `<div class="ref-card"><h2 class="ref-title">${t('nav.mail')}</h2><p class="muted">${app.mode === 'online' ? t('mail.signin') : t('online.only')}</p></div>`;
      return;
    }
    if (!st.list) {
      send({ t: 'mail_list' });
      root.innerHTML = `<div class="ref-card"><h2 class="ref-title">${t('nav.mail')}</h2><p class="muted">…</p></div>`;
      return;
    }
    const open = st.list.find((m) => m.id === st.open) ?? null;
    const row = (m) => `<button type="button" class="mail-row${m.read ? '' : ' unread'}${m.id === st.open ? ' on' : ''}" data-id="${esc(m.id)}">
        <span class="mail-ico">${m.gift && !m.claimed ? '🎁' : m.kind === 'gift' ? '✉️' : '📰'}</span>
        <span class="mail-head"><b>${esc(titleOf(m))}</b><small>${new Date(m.at).toLocaleDateString()}</small></span>
      </button>`;
    root.innerHTML = `
      <div class="mail-top"><h2 class="ref-title">${t('nav.mail')}</h2>
        ${st.spins > 0 ? `<button type="button" class="cta mail-spin" id="mail-spin">🎡 ${t('mail.spinBtn', { n: st.spins })}</button>` : ''}</div>
      <div class="mail">
        <div class="mail-list">${st.list.length ? st.list.map(row).join('') : `<p class="muted">${t('mail.empty')}</p>`}</div>
        <article class="mail-view">${
          open
            ? `<h3>${esc(titleOf(open))}</h3><p class="fine">${new Date(open.at).toLocaleString()}</p><div class="mail-body">${esc(bodyOf(open)).replace(/\n/g, '<br>')}</div>
              ${open.gift ? `<div class="mail-gift"><span>🎁 ${esc(giftText(open.gift))}</span>${open.claimed ? `<b class="ok">✓ ${t('mail.taken')}</b>${useBtn(open.gift)}` : `<button type="button" class="cta" id="mail-claim">${t('mail.claim')}</button>`}</div>` : ''}`
            : `<p class="muted">${t('mail.pick')}</p>`
        }</article>
      </div>`;
    for (const b of root.querySelectorAll('.mail-row'))
      b.addEventListener('click', () => {
        st.open = b.dataset.id;
        const m = st.list.find((x) => x.id === st.open);
        if (m && !m.read) {
          m.read = true;
          send({ t: 'mail_read', id: m.id });
        }
        render();
      });
    $('mail-claim')?.addEventListener('click', () => send({ t: 'mail_claim', id: st.open }));
    $('mail-spin')?.addEventListener('click', openWheel);
    $('mail-use')?.addEventListener('click', (e) => (e.currentTarget.dataset.box ? openBox(e.currentTarget.dataset.box) : openWheel()));
  }

  // a claimed bag opens and a claimed spin turns right from the letter
  function useBtn(g) {
    if (g?.k === 'box' && (app.locker?.boxes?.[g.id] || app.locker?.gboxes?.[g.id])) return `<button type="button" class="cta" id="mail-use" data-box="${esc(g.id)}">🎁 ${t('inv.open')}</button>`;
    if (g?.k === 'spin' && st.spins > 0) return `<button type="button" class="cta" id="mail-use">🎡 ${t('dl.spinNow')}</button>`;
    return '';
  }

  return { render, onMessage, get unread() {
    return st.unread;
  } };
}
