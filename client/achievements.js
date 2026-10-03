// Achievements and titles: the lobby button, the list, the result card and the title
// you wear. The server counts and decides; this renders it.
import { ACHIEVEMENT, titleTier } from '../shared/achievements.js';
import { DIVISIONS } from '../shared/ranked.js';
import { t } from './i18n.js';
import { esc, fmt } from './game.js';
import { achGifts } from '../shared/daily.js';
import { giftHtml } from './daily.js';

const $ = (id) => document.getElementById(id);

export const achName = (id) => t(`ach.${id}`);

// A worn title, styled by its tier: plain, rare, epic, legendary (gold, a sweep of light),
// mythic (a rainbow aura) or mystery (the secret ones: violet smoke and a flicker).
export function titleHtml(id, cls = '') {
  if (!id || !ACHIEVEMENT[id]) return '';
  const tier = titleTier(id);
  return `<span class="ttl t-${tier}${cls ? ` ${cls}` : ''}" title="${esc(t(`r.${tier}`))}">${tier === 'premium' ? '♛ ' : tier === 'mystery' ? '◈ ' : tier === 'mythic' ? '✦ ' : tier === 'legendary' ? '★ ' : ''}${esc(achName(id))}</span>`;
}

// "Get 25 kills", "Spend 1 h inside raids", …
export function achDesc(a) {
  if (a.stat === 'bestDiv') return t('achd.bestDiv', { n: t(`rd.div.${DIVISIONS[a.goal]?.id ?? 'gold'}`) });
  const n = a.stat === 'secs' ? Math.round(a.goal / 3600) : a.stat === 'bestReturn' ? a.goal / 100 : a.goal;
  return t(`achd.${a.stat}`, { n: fmt(n) });
}

export function createAchievements({ app, send, toast, sfx, open: openPage }) {
  const C = () => app.career;

  function renderProfile() {
    const c = C();
    $('open-ach').hidden = !c;
    $('pf-title').hidden = !c?.title;
    if (!c) return;
    const done = c.achievements.filter((a) => a.done).length;
    $('open-ach').textContent = `${t('ach.button')} · ${done}/${c.achievements.length}`;
    if (c.title) $('pf-title').innerHTML = titleHtml(c.title, 'big');
    // the player card wears the aura of the title
    document.querySelector('.hero')?.setAttribute('data-tier', c.title ? titleTier(c.title) : '');
  }

  function renderList() {
    const c = C();
    if (!c) return;
    const done = c.achievements.filter((a) => a.done).length;
    const xp = c.achievements.filter((a) => a.done).reduce((s, a) => s + a.xp, 0);
    $('ach-sum').innerHTML = `<b>${done}</b> / ${c.achievements.length} · <b>+${fmt(xp)}</b> XP${c.title ? ` · ${esc(t('ach.wearing'))} ${titleHtml(c.title)} <button type="button" class="link" data-off>${esc(t('ach.takeOff'))}</button>` : ''}`;
    $('ach-sum').querySelector('[data-off]')?.addEventListener('click', () => send({ t: 'title', id: null }));
    // a reward to take first, then done, then the closest to done
    const claimable = (id) => !!app.daily?.achClaim?.includes(id);
    const list = [...c.achievements].sort((a, b) => claimable(b.id) - claimable(a.id) || b.done - a.done || b.have / b.goal - a.have / a.goal);
    $('ach-list').replaceChildren(
      ...list.map((a) => {
        const li = document.createElement('li');
        const tier = titleTier(a.id);
        const hidden = ACHIEVEMENT[a.id]?.secret && !a.done; // secret ones stay a mystery until earned
        li.className = `ach tier-${tier}${a.done ? ' done' : ''}${c.title === a.id ? ' worn' : ''}`;
        const pct = Math.round((a.have / a.goal) * 100);
        const have = hidden ? '?' : a.stat === 'secs' ? `${Math.floor(a.have / 3600)}/${a.goal / 3600} h` : a.stat === 'bestReturn' ? `${(a.have / 100).toFixed(1)}×/${a.goal / 100}×` : a.stat === 'bestDiv' ? `${a.have}/${a.goal}` : `${fmt(a.have)}/${fmt(a.goal)}`;
        li.innerHTML = `<span class="ach-medal" aria-hidden="true">${hidden ? '◈' : a.done ? '★' : '☆'}</span>
          <div class="ach-body"><p class="ach-name">${hidden ? `<b>${esc(t('ach.secret'))}</b>` : a.done ? titleHtml(a.id) : `<b>${esc(achName(a.id))}</b>`}<span class="ach-tier t-${tier}">${esc(t(`r.${tier}`))}</span>${a.xp ? `<span class="ach-xp">+${fmt(a.xp)} XP</span>` : ''}</p>
          <p class="ach-desc">${esc(hidden ? t('ach.secretDesc') : achDesc(a))}</p>
          ${a.done ? '' : `<div class="ach-bar"><i style="width:${pct}%"></i></div><p class="ach-have">${have}</p>`}</div>
          <div class="ach-acts">${claimable(a.id) ? `<button type="button" class="cta" data-take="${a.id}">${esc(t('dl.claim'))}</button>` : ''}${a.done ? (c.title === a.id ? `<span class="ach-tag">${esc(t('ach.worn'))}</span>` : `<button type="button" class="ghost" data-wear="${a.id}">${esc(t('ach.wear'))}</button>`) : ''}</div>`;
        if (!hidden) li.querySelector('.ach-body').insertAdjacentHTML('beforeend', `<p class="task-gifts">${achGifts(a.id).map((g) => giftHtml(g)).join('')}${a.done && !claimable(a.id) && app.daily ? `<span class="fine">✓ ${esc(t('dl.done'))}</span>` : ''}</p>`);
        li.querySelector('[data-wear]')?.addEventListener('click', () => send({ t: 'title', id: a.id }));
        li.querySelector('[data-take]')?.addEventListener('click', () => app.claimAch?.(a.id));
        return li;
      }),
    );
  }

  // newly unlocked ones on the result card
  function renderResult(m) {
    const el = $('res-ach');
    const ids = m.achievements ?? [];
    el.hidden = !ids.length;
    if (!ids.length) return;
    el.innerHTML = `<p class="eyebrow">${esc(t('ach.unlocked'))}</p><ul>${ids
      .map((id) => {
        const a = ACHIEVEMENT[id];
        return `<li><span class="ach-medal">★</span><b>${esc(achName(id))}</b><span class="fine">${esc(achDesc(a))}${a.xp ? ` · +${fmt(a.xp)} XP` : ''}</span></li>`;
      })
      .join('')}</ul><button type="button" class="ghost" data-ach-open>${esc(t('ach.seeAll'))}</button>`;
    el.querySelector('[data-ach-open]').addEventListener('click', open);
    sfx?.play('beep', { f: 1760, dur: 0.2 });
  }

  const isOpen = () => !document.querySelector('.page[data-page="achievements"]')?.hidden;
  function open() {
    openPage();
  }

  function onMessage(m) {
    if (m.career !== undefined) app.career = m.career;
    if (m.t === 'result') renderResult(m);
    if (m.t === 'career' && isOpen()) renderList();
    if (m.t === 'career') toast?.(m.career.title ? `${t('ach.wearing')} ${achName(m.career.title)}` : t('ach.noTitle'));
    renderProfile();
  }

  $('open-ach').addEventListener('click', open);
  return { onMessage, renderProfile, renderList, open };
}
