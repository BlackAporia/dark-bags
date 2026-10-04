// The very first visit: before anything else, Nyx asks for a runner name and a region (every
// match server with its ping, players online and whether it answers; the closest one is
// recommended). The language is already picked from the player's country (main.js), and can be
// changed right here. Then her tour of the whole game starts (tour.js).
import { createNyx } from './nyx.js';
import { t, getLang, setLang, LANGS, onLang } from './i18n.js';
import { store } from './store.js';
import { esc } from './game.js';

const $ = (id) => document.getElementById(id);
const DONE = 'darkbags.welcome.done';
const PARTS = [['Night', 'Neon', 'Ghost', 'Rogue', 'Silent', 'Lucky', 'Crypto', 'Shadow', 'Iron', 'Wild', 'Frost', 'Hex'], ['Fox', 'Raven', 'Wolf', 'Viper', 'Runner', 'Hawk', 'Tiger', 'Bandit', 'Jackal', 'Lynx', 'Cobra', 'Mantis']];
const valid = (v) => v.length >= 3 && v.length <= 16 && /^[\p{L}\p{N}_. -]+$/u.test(v);

export function createWelcome({ app, regions, onDone, sfx }) {
  let el = null;
  let nyx = null;
  let step = 'name';
  let offs = []; // listeners to remove when the welcome closes
  const hasRegions = () => app.mode === 'online' && regions.info().list.length > 1;
  const steps = () => (hasRegions() ? ['name', 'region'] : ['name']);

  function build() {
    el = document.createElement('div');
    el.id = 'welcome';
    el.className = 'welcome';
    el.innerHTML = `<div class="wel-card" role="dialog" aria-modal="true" aria-labelledby="wel-t">
        <div class="wel-nyx" id="wel-nyx"></div>
        <div class="wel-main">
          <div class="wel-top"><span class="wel-who"><b>NYX</b> · <span data-k="tour.who"></span></span><span class="wel-dots" id="wel-dots"></span>
            <label class="wel-lang">🌐 <select id="wel-lang" aria-label="Language">${LANGS.map((l) => `<option value="${l.id}"${l.id === getLang() ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label></div>
          <div id="wel-body"></div>
        </div>
      </div>`;
    document.body.append(el);
    nyx = createNyx($('wel-nyx'));
    $('wel-lang').addEventListener('change', (e) => setLang(e.target.value));
    offs.push(onLang(() => el && paint()));
    requestAnimationFrame(() => el?.classList.add('in'));
  }

  function dots() {
    const s = steps();
    $('wel-dots').innerHTML = s.map((k) => `<i class="${k === step ? 'on' : s.indexOf(k) < s.indexOf(step) ? 'past' : ''}"></i>`).join('');
  }

  function paint() {
    if (!el) return;
    for (const n of el.querySelectorAll('[data-k]')) n.textContent = t(n.dataset.k);
    dots();
    const body = $('wel-body');
    if (step === 'name') {
      const v = $('wel-name')?.value ?? app.name ?? '';
      body.innerHTML = `<h2 class="wel-t" id="wel-t">${esc(t('wel.name.t'))}</h2><p class="wel-b">${esc(t('wel.name.b'))}</p>
        <div class="wel-namebox"><input id="wel-name" maxlength="16" autocomplete="off" spellcheck="false" placeholder="${esc(t('wel.name.ph'))}" value="${esc(v)}"><button type="button" class="ghost wel-dice" id="wel-dice" title="${esc(t('wel.name.dice'))}">🎲</button></div>
        <p class="wel-hint" id="wel-hint">${esc(t('wel.name.rules'))}</p>
        <div class="wel-acts"><span></span><button type="button" class="cta" id="wel-next">${esc(t('wel.next'))} →</button></div>`;
      const input = $('wel-name');
      const check = () => {
        const ok = valid(input.value.trim());
        $('wel-next').disabled = !ok;
        $('wel-hint').classList.toggle('bad', !!input.value.trim() && !ok);
      };
      input.addEventListener('input', check);
      input.addEventListener('keydown', (e) => e.key === 'Enter' && !$('wel-next').disabled && nameNext());
      $('wel-dice').addEventListener('click', () => {
        input.value = `${PARTS[0][Math.floor(Math.random() * PARTS[0].length)]}${PARTS[1][Math.floor(Math.random() * PARTS[1].length)]}${Math.floor(Math.random() * 90 + 10)}`;
        check();
        nyx?.mood('wink', 900);
        sfx?.play?.('beep', { f: 1300, dur: 0.03 });
      });
      $('wel-next').addEventListener('click', nameNext);
      check();
      setTimeout(() => input.focus({ preventScroll: true }), 250);
      nyx?.chatter(1600);
    } else {
      const info = regions.info();
      const pinged = info.list.filter((r) => r.ping != null);
      const best = pinged.length ? pinged.reduce((a, b) => (b.ping < a.ping ? b : a)).id : null;
      const cls = (ms) => (ms == null ? '' : ms < 90 ? 'good' : ms < 180 ? 'ok' : 'bad');
      body.innerHTML = `<h2 class="wel-t" id="wel-t">${esc(t('wel.region.t'))}</h2><p class="wel-b">${esc(t('wel.region.b'))}</p>
        <div class="wel-regs">${info.list
          .map((r) => {
            const off = r.ping === null && !info.probing;
            const on = (info.pick ?? '') === r.id;
            return `<button type="button" class="wel-reg${on ? ' on' : ''}${off ? ' off' : ''}" data-reg="${esc(r.id)}" ${off ? 'disabled' : ''}>
              <span class="wr-flag">${r.flag}</span><span class="wr-n"><b>${esc(r.name)}</b>${r.id === best ? `<i class="wr-best">★ ${esc(t('wel.region.best'))}</i>` : ''}</span>
              <span class="wr-ms ${cls(r.ping)}">${r.ping == null ? (off ? esc(t('wel.region.off')) : '…') : `${r.ping} ms`}</span>
              <span class="wr-pl">${r.online != null ? esc(t('wel.region.players', { n: r.online })) : ''}</span></button>`;
          })
          .join('')}
          <button type="button" class="wel-reg auto${info.pick ? '' : ' on'}" data-reg=""><span class="wr-flag">⚡</span><span class="wr-n"><b>${esc(t('wel.region.auto'))}</b><small>${esc(t('wel.region.autoD'))}</small></span></button></div>
        <p class="wel-hint">${esc(t('wel.region.note'))}</p>
        <div class="wel-acts"><button type="button" class="ghost" id="wel-back">← ${esc(t('wel.back'))}</button><button type="button" class="cta" id="wel-go">${esc(t('wel.go'))} 🚀</button></div>`;
      for (const b of body.querySelectorAll('[data-reg]'))
        b.addEventListener('click', () => {
          regions.choose(b.dataset.reg);
          sfx?.play?.('beep', { f: 1180, dur: 0.03 });
          nyx?.mood('happy', 700);
        });
      $('wel-back').addEventListener('click', () => {
        step = 'name';
        paint();
      });
      $('wel-go').addEventListener('click', finish);
    }
  }

  function nameNext() {
    const v = $('wel-name').value.trim();
    if (!valid(v)) return;
    const input = $('name');
    if (input) {
      input.value = v;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    app.name = v;
    store.set('darkbags.name', v);
    store.set('darkbags.tour.named', true);
    nyx?.mood('happy', 900);
    sfx?.play?.('beep', { f: 1500, dur: 0.05 });
    if (!hasRegions()) return finish();
    step = 'region';
    regions.probe();
    offs.push(regions.onChange(() => el && step === 'region' && paint()));
    paint();
  }

  function finish() {
    store.set(DONE, true);
    nyx?.mood('happy');
    el?.classList.remove('in');
    setTimeout(() => {
      for (const f of offs) f();
      offs = [];
      nyx?.destroy();
      el?.remove();
      el = null;
      onDone?.();
    }, 300);
  }

  function start() {
    if (el) return;
    step = 'name';
    build();
    paint();
  }

  // the first visit on this device (or the name is still missing)
  function maybeStart() {
    if (store.get(DONE, false) && (app.name || '').trim()) return false;
    start();
    return true;
  }

  return { start, maybeStart, get open() {
    return !!el;
  } };
}
