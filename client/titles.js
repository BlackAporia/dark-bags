// Titles from the main menu: what is worn now (the achievement title and the neon one) under the
// name, and a picker with every title the player owns: the neon titles (ranked seasons, the
// forever ones like Moustache Holder) and the achievement titles. One tap wears or takes off.
import { t } from './i18n.js';
import { esc } from './game.js';
import { titleHtml } from './achievements.js';
import { neonText, neonColor } from './ranked.js';
import { seasonTitle, titleBonus } from '../shared/ranked.js';

const $ = (id) => document.getElementById(id);

export function createTitles({ app, send }) {
  const C = () => app.career;

  // the hero card: the neon title worn, and the button that opens the picker
  function renderHero() {
    const c = C();
    const on = app.mode === 'online' && !!c;
    const neon = $('pf-neon');
    const pick = $('pf-title-pick');
    if (!neon || !pick) return;
    neon.hidden = !on || !c.neon;
    if (on && c.neon) {
      neon.style.setProperty('--n', neonColor(c.neon));
      neon.textContent = `◆ ${neonText(c.neon)} ◆`;
    }
    const owned = on ? (c.stitles?.length ?? 0) + (c.achievements?.filter((a) => a.done).length ?? 0) : 0;
    pick.hidden = !on;
    pick.textContent = `✎ ${t(owned ? 'tt.change' : 'tt.title')}`;
    if ($('dlg-titles')?.open) renderList();
  }

  function renderList() {
    const c = C();
    const body = $('tt-body');
    if (!c || !body) return;
    const neon = (c.stitles ?? []).filter((id) => seasonTitle(id));
    const ach = (c.achievements ?? []).filter((a) => a.done);
    const neonRows = neon
      .map((id) => {
        const on = c.neon === id;
        const bonus = titleBonus(id);
        return `<li class="tt-row${on ? ' on' : ''}"><span class="tt-neon" style="--n:${neonColor(id)}">◆ ${esc(neonText(id))}</span><small>${bonus > 0 ? t('rd.bonus', { p: Math.round(bonus * 100) }) : t('rd.expired')}</small><button type="button" class="${on ? 'ghost' : 'cta'} sm" data-neon="${on ? '' : esc(id)}">${t(on ? 'rd.off' : 'rd.wear')}</button></li>`;
      })
      .join('');
    const achRows = ach
      .map((a) => {
        const on = c.title === a.id;
        return `<li class="tt-row${on ? ' on' : ''}">${titleHtml(a.id)}<small></small><button type="button" class="${on ? 'ghost' : 'cta'} sm" data-title="${on ? '' : esc(a.id)}">${t(on ? 'rd.off' : 'rd.wear')}</button></li>`;
      })
      .join('');
    body.innerHTML = `
      <section><p class="eyebrow">${t('tt.neon')}</p>${neonRows ? `<ul class="tt-list">${neonRows}</ul>` : `<p class="fine">${t('tt.noneNeon')}</p>`}</section>
      <section><p class="eyebrow">${t('tt.ach')}</p>${achRows ? `<ul class="tt-list">${achRows}</ul>` : `<p class="fine">${t('tt.noneAch')}</p>`}</section>`;
    for (const b of body.querySelectorAll('[data-neon]')) b.addEventListener('click', () => send({ t: 'neon', id: b.dataset.neon || null }));
    for (const b of body.querySelectorAll('[data-title]')) b.addEventListener('click', () => send({ t: 'title', id: b.dataset.title || null }));
  }

  function open() {
    let d = $('dlg-titles');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'dlg-titles';
      d.className = 'dlg dlg-titles';
      d.innerHTML = `<div class="dlg-inner"><header class="dlg-head"><h2>${esc(t('tt.title'))}</h2><button type="button" class="x" aria-label="Close">×</button></header><div id="tt-body"></div></div>`;
      d.querySelector('.x').addEventListener('click', () => d.close());
      d.addEventListener('click', (e) => e.target === d && d.close());
      document.body.append(d);
    }
    renderList();
    if (!d.open) d.showModal();
  }

  $('pf-title-pick')?.addEventListener('click', open);
  return { renderHero, open };
}
