// Community: the game's X and Telegram, and what following them pays (shared/community.js): a free
// spin of the fortune wheel per channel and, with the first, the Community Member title. The game
// can't see a follow, so a channel's claim opens once its link was opened on this device. The
// server keeps who claimed what (once per account and channel). A second tab holds the player
// white paper (site/whitepaper/): read it online or download the PDF.
import { COMMUNITY, COMMUNITY_SPINS, COMMUNITY_TITLE } from '../shared/community.js';
import { esc } from './game.js';
import { store } from './store.js';
import { t } from './i18n.js';
import { neonColor } from './ranked.js';

const $ = (id) => document.getElementById(id);
const OPENED = 'darkbags.cm.opened';
const TAB = 'darkbags.cm.tab';
// the server serves the landing site under /site/; the static build puts the game at play/, next to it
const WHITEPAPER = typeof window !== 'undefined' && window.DARK_BAGS_STATIC ? '../whitepaper/' : '/site/whitepaper/';
const WHITEPAPER_PDF = `${WHITEPAPER}DARK-BAGS-White-Paper.pdf`;

const ICONS = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.7 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.9zm-1.1 16.2h1.7L7.5 4.7H5.7z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M6 2.5h8l4.5 4.5v14.5H6z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M14 2.5V7h4.5M9 12h6M9 15.5h6M9 19h3.5"/></svg>',
  tg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3 18.7 19.5c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.4 1.8 12c-1-.3-1-1 .2-1.5L20.6 3.4c.9-.3 1.6.2 1.3.9z"/></svg>',
};

export function createCommunity({ app, send, toast, sfx, hasAccount, signIn }) {
  let claimed = [];
  let busy = null; // the channel whose claim is on its way
  const opened = () => store.get(OPENED, []) ?? [];

  // channels still to claim, for the menu's badge
  const open = () => (hasAccount() ? COMMUNITY.filter((c) => !claimed.includes(c.id)).length : 0);

  function onMessage(m) {
    if (m.t === 'welcome' || m.t === 'authed') claimed = Array.isArray(m.community) ? m.community : [];
    if (m.t === 'community') {
      claimed = m.claimed ?? claimed;
      if (m.career) app.career = m.career;
      busy = null;
      if (m.got) {
        sfx?.play('level');
        toast(t('cm.got', { n: m.got.spins }));
        if (m.got.title) setTimeout(() => toast(t('cm.gotTitle')), 1600);
      }
    }
    if (m.t === 'err' && m.code === 'community') busy = null;
    if (app.page === 'community') render();
  }

  function tabs(tab) {
    return `<div class="cm-tabs" role="tablist">${['ch', 'doc'].map((id) => `<button type="button" class="seg" role="tab" data-cmtab="${id}" aria-selected="${tab === id}">${esc(t(id === 'ch' ? 'cm.tCh' : 'cm.tDoc'))}</button>`).join('')}</div>`;
  }

  function renderDoc(root) {
    root.innerHTML = `${tabs('doc')}
      <article class="cm-doc">
        <span class="cm-ico cm-docico">${ICONS.doc}</span>
        <div class="cm-txt"><b>${esc(t('cm.docT'))}</b><small>${esc(t('cm.docMeta'))}</small><p>${esc(t('cm.docD'))}</p></div>
        <div class="cm-acts">
          <a class="cta cm-btn" href="${WHITEPAPER}" target="_blank" rel="noopener">${esc(t('cm.docOpen'))} ↗</a>
          <a class="ghost cm-btn" href="${WHITEPAPER_PDF}" target="_blank" rel="noopener" download>${esc(t('cm.docPdf'))}</a>
        </div>
      </article>`;
  }

  function render() {
    const root = $('community-root');
    if (!root) return;
    const tab = store.get(TAB, 'ch') === 'doc' ? 'doc' : 'ch';
    if (tab === 'doc') renderDoc(root);
    else renderChannels(root);
    for (const b of root.querySelectorAll('[data-cmtab]'))
      b.addEventListener('click', () => {
        store.set(TAB, b.dataset.cmtab);
        render();
      });
  }

  function renderChannels(root) {
    const acct = hasAccount();
    const seen = opened();
    const title = `<span class="cm-neon" style="--n:${neonColor(COMMUNITY_TITLE)}">◆ ${esc(t('st.community'))}</span>`;
    root.innerHTML = `${tabs('ch')}
      <div class="cm-hero">
        <h2 class="cm-title">${esc(t('cm.title'))}</h2>
        <p class="cm-sub">${esc(t('cm.sub'))}</p>
        <div class="cm-rewards"><span class="cm-chip">🎡 ${esc(t('cm.spin', { n: COMMUNITY_SPINS }))}</span><span class="cm-chip">${title}<small>${esc(t('cm.titleR'))}</small></span></div>
      </div>
      <div class="cm-list">${COMMUNITY.map((c) => {
        const done = claimed.includes(c.id);
        const ready = seen.includes(c.id);
        const act = !acct
          ? `<button type="button" class="ghost cm-btn" data-signin>${esc(t('cm.signin'))}</button>`
          : done
            ? `<span class="cm-done">✓ ${esc(t('cm.claimed'))}</span>`
            : `<button type="button" class="cta cm-btn" data-claim="${c.id}" ${ready && busy !== c.id ? '' : 'disabled'}>${busy === c.id ? '…' : `🎁 ${esc(t('cm.claim'))}`}</button>`;
        return `<article class="cm-card${done ? ' done' : ''}" style="--cc:${c.color}">
          <span class="cm-ico cm-${c.id}">${ICONS[c.id]}</span>
          <div class="cm-txt"><b>${esc(c.name)}</b><small>${esc(c.handle)}</small><p>${esc(t(`cm.${c.id}.d`))}</p></div>
          <div class="cm-acts">
            <a class="ghost cm-btn cm-open" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" data-open="${c.id}">${esc(t(c.id === 'tg' ? 'cm.join' : 'cm.follow'))} ↗</a>
            ${act}
          </div>
          ${acct && !done && !ready ? `<p class="cm-hint">${esc(t('cm.first'))}</p>` : ''}
        </article>`;
      }).join('')}</div>`;
    for (const a of root.querySelectorAll('[data-open]'))
      a.addEventListener('click', () => {
        const list = opened();
        if (!list.includes(a.dataset.open)) store.set(OPENED, [...list, a.dataset.open]);
        // the claim opens once they are back from the channel
        setTimeout(render, 600);
      });
    for (const b of root.querySelectorAll('[data-claim]'))
      b.addEventListener('click', () => {
        busy = b.dataset.claim;
        send({ t: 'community', id: b.dataset.claim });
        render();
      });
    for (const b of root.querySelectorAll('[data-signin]')) b.addEventListener('click', () => signIn());
  }

  return { onMessage, render, open };
}
