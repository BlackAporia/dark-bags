// The settings page: graphics, what to show, controls, audio, language. Every change
// applies immediately (see settings.js subscribers).
import { settings, setSetting } from './settings.js';
import { LANGS, getLang, setLang } from './i18n.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createSettingsUi() {
  function seg(key, opts) {
    return `<div class="seg-row" role="radiogroup">${opts.map(([v, label]) => `<button type="button" data-set="${key}" data-v="${v}" aria-pressed="${String(settings[key]) === String(v)}">${t(label)}</button>`).join('')}</div>`;
  }
  const toggle = (key) => `<label class="switch"><input type="checkbox" data-tog="${key}" ${settings[key] ? 'checked' : ''}><i></i></label>`;
  const slider = (key, min, max, step) => `<input type="range" data-rng="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}">`;
  const row = (label, ctl, note = '') => `<div class="set-row"><div><p>${t(label)}</p>${note ? `<p class="fine">${t(note)}</p>` : ''}</div>${ctl}</div>`;

  function render() {
    const root = $('settings-root');
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
        ${row('set.voice', toggle('voice'), 'set.voiceNote')}
      </section>
      <section class="set-card"><p class="eyebrow">${t('set.language')}</p>
        <div class="lang-grid">${LANGS.map((l) => `<button type="button" data-lang="${l.id}" aria-pressed="${l.id === getLang()}">${l.name}</button>`).join('')}</div>
      </section>`;
    root.querySelector('.keys').innerHTML = t('how.keys');
    for (const b of root.querySelectorAll('[data-set]'))
      b.addEventListener('click', () => {
        setSetting(b.dataset.set, b.dataset.v);
        render();
      });
    for (const i of root.querySelectorAll('[data-tog]')) i.addEventListener('change', () => setSetting(i.dataset.tog, i.checked));
    for (const i of root.querySelectorAll('[data-rng]')) i.addEventListener('input', () => setSetting(i.dataset.rng, Number(i.value)));
    for (const b of root.querySelectorAll('[data-lang]')) b.addEventListener('click', () => setLang(b.dataset.lang));
  }
  return { render };
}
