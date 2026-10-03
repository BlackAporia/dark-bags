// The settings page: graphics, what to show, controls, audio, language. Every change
// applies immediately (see settings.js subscribers).
import { settings, setSetting } from './settings.js';
import { LANGS, getLang, setLang } from './i18n.js';
import { t } from './i18n.js';
import { TRACKS, RAID_TRACKS } from './music.js';

const $ = (id) => document.getElementById(id);

export function createSettingsUi() {
  function seg(key, opts) {
    return `<div class="seg-row" role="radiogroup">${opts.map(([v, label]) => `<button type="button" data-set="${key}" data-v="${v}" aria-pressed="${String(settings[key]) === String(v)}">${t(label)}</button>`).join('')}</div>`;
  }
  const toggle = (key) => `<label class="switch"><input type="checkbox" data-tog="${key}" ${settings[key] ? 'checked' : ''}><i></i></label>`;
  const slider = (key, min, max, step) => `<input type="range" data-rng="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}">`;
  // the raid soundtrack: a mix, or one track every match (track names are titles: not translated)
  const tracks = () =>
    `<div class="track-grid" role="radiogroup">${[['auto', t('set.trackAuto')], ...RAID_TRACKS.map((k) => [k, TRACKS[k].name])].map(([v, label]) => `<button type="button" data-set="track" data-v="${v}" aria-pressed="${settings.track === v}">${label}</button>`).join('')}</div>`;
  const row = (label, ctl, note = '') => `<div class="set-row"><div><p>${t(label)}</p>${note ? `<p class="fine">${t(note)}</p>` : ''}</div>${ctl}</div>`;

  // the settings page, or the same controls inside the in-match menu
  function render(root = $('settings-root')) {
    if (!root) return;
    root.innerHTML = `
      <h2 class="sec-h">${t('nav.settings')}</h2>
      <section class="set-card"><p class="eyebrow">${t('set.graphics')}</p>
        ${row('set.quality', seg('quality', [['auto', 'set.auto'], ['high', 'set.high'], ['medium', 'set.medium'], ['low', 'set.low']]), 'set.qualityNote')}
        ${row('set.shake', toggle('shake'))}
        ${row('set.motion', toggle('motion'))}
      </section>
      <section class="set-card"><p class="eyebrow">${t('set.display')}</p>
        ${row('set.skins', seg('skins', [['all', 'set.skinsAll'], ['mine', 'set.skinsMine'], ['none', 'set.skinsNone']]), 'set.skinsNote')}
        ${row('set.names', toggle('names'))}
        ${row('set.titles', toggle('titles'))}
      </section>
      <section class="set-card"><p class="eyebrow">${t('set.controls')}</p>
        <p class="keys" >${t('how.keys')}</p>
        ${row('set.stick', slider('stick', 0.8, 1.4, 0.1))}
        ${row('set.lefty', toggle('lefty'), 'set.leftyNote')}
      </section>
      <section class="set-card"><p class="eyebrow">${t('set.audio')}</p>
        ${row('set.sound', slider('sound', 0, 1, 0.05))}
        ${row('set.music', slider('music', 0, 1, 0.05))}
        ${row('set.track', tracks(), 'set.trackNote')}
        ${row('set.voice', toggle('voice'), 'set.voiceNote')}
        ${row('set.vchat', toggle('vchat'), 'set.vchatNote')}
      </section>
      <section class="set-card"><p class="eyebrow">${t('news.title')}</p>
        <div class="set-row"><div><p>${t('news.note')}</p></div><button type="button" class="ghost" data-news>${t('news.open')}</button></div>
      </section>
      <section class="set-card"><p class="eyebrow">${t('set.tour')}</p>
        <div class="set-row"><div><p>${t('set.tourNote')}</p></div><button type="button" class="ghost" data-tour>${t('set.tourBtn')}</button></div>
      </section>
      <section class="set-card"><p class="eyebrow">${t('set.language')}</p>
        <div class="lang-grid">${LANGS.map((l) => `<button type="button" data-lang="${l.id}" aria-pressed="${l.id === getLang()}">${l.name}</button>`).join('')}</div>
      </section>`;
    root.querySelector('.keys').innerHTML = t('how.keys');
    for (const b of root.querySelectorAll('[data-set]'))
      b.addEventListener('click', () => {
        setSetting(b.dataset.set, b.dataset.v);
        render(root);
      });
    for (const i of root.querySelectorAll('[data-tog]')) i.addEventListener('change', () => setSetting(i.dataset.tog, i.checked));
    for (const i of root.querySelectorAll('[data-rng]')) i.addEventListener('input', () => setSetting(i.dataset.rng, Number(i.value)));
    for (const b of root.querySelectorAll('[data-lang]')) b.addEventListener('click', () => setLang(b.dataset.lang));
    root.querySelector('[data-news]')?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('darkbags:news')));
    root.querySelector('[data-tour]')?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('darkbags:tour')));
  }
  return { render };
}
