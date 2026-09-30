// Achievements and titles: the lobby button, the list, the result card and the title
// you wear. The server counts and decides; this renders it.
import { ACHIEVEMENT } from '../shared/achievements.js';
import { t } from './i18n.js';
import { esc, fmt } from './game.js';

const $ = (id) => document.getElementById(id);

export const achName = (id) => t(`ach.${id}`);

// "Get 25 kills", "Spend 1 h inside raids", …
export function achDesc(a) {
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
    if (c.title) $('pf-title').textContent = `« ${achName(c.title)} »`;
  }

  function renderList() {
    const c = C();
    if (!c) return;
    const done = c.achievements.filter((a) => a.done).length;
    const xp = c.achievements.filter((a) => a.done).reduce((s, a) => s + a.xp, 0);
    $('ach-sum').innerHTML = `<b>${done}</b> / ${c.achievements.length} · <b>+${fmt(xp)}</b> XP${c.title ? ` · ${esc(t('ach.wearing'))} <b>${esc(achName(c.title))}</b> <button type="button" class="link" data-off>${esc(t('ach.takeOff'))}</button>` : ''}`;
    $('ach-sum').querySelector('[data-off]')?.addEventListener('click', () => send({ t: 'title', id: null }));
    // done first (newest goals last), then the closest to done
    const list = [...c.achievements].sort((a, b) => b.done - a.done || b.have / b.goal - a.have / a.goal);
    $('ach-list').replaceChildren(
      ...list.map((a) => {
        const li = document.createElement('li');
        li.className = `ach${a.done ? ' done' : ''}${c.title === a.id ? ' worn' : ''}`;
        const pct = Math.round((a.have / a.goal) * 100);
        const have = a.stat === 'secs' ? `${Math.floor(a.have / 3600)}/${a.goal / 3600} h` : a.stat === 'bestReturn' ? `${(a.have / 100).toFixed(1)}×/${a.goal / 100}×` : `${fmt(a.have)}/${fmt(a.goal)}`;
        li.innerHTML = `<span class="ach-medal" aria-hidden="true">${a.done ? '★' : '☆'}</span>
          <div class="ach-body"><p class="ach-name"><b>${esc(achName(a.id))}</b>${a.xp ? `<span class="ach-xp">+${fmt(a.xp)} XP</span>` : ''}</p>
          <p class="ach-desc">${esc(achDesc(a))}</p>
          ${a.done ? '' : `<div class="ach-bar"><i style="width:${pct}%"></i></div><p class="ach-have">${have}</p>`}</div>
          ${a.done ? (c.title === a.id ? `<span class="ach-tag">${esc(t('ach.worn'))}</span>` : `<button type="button" class="ghost" data-wear="${a.id}">${esc(t('ach.wear'))}</button>`) : ''}`;
        li.querySelector('[data-wear]')?.addEventListener('click', () => send({ t: 'title', id: a.id }));
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
