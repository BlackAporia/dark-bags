// The Tab table, as in Counter-Strike: everyone in the match with kills, deaths, K/D, status and
// ping, your side first in team modes. Hold Tab on a keyboard, tap ☰ on a phone.
import { t } from './i18n.js';
import { nameHtml } from './flair.js';
import { rankBadgeSvg } from './rankbadge.js';

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createScoreboard({ game, app }) {
  let open = false;
  let timer = null;

  function render() {
    const el = $('sb');
    const rows = game.board ?? [];
    const me = game.pid;
    const teams = rows.some((r) => r[6] >= 0);
    const zed = game.zombieMode;
    const head = `<tr><th>#</th><th class="sb-n">${t('sb.player')}</th><th>${t('sb.k')}</th><th>${t('sb.d')}</th><th>${t('rd.kd')}</th>${zed || game.goldMode ? `<th>${t(zed ? 'sb.zk' : 'sb.gb')}</th>` : ''}<th>${t('sb.ping')}</th></tr>`;
    let side = null;
    const body = rows
      .map((r, i) => {
        const [id, name, k, d, st, rk, tm, bot, pg, nf, extra] = r;
        const div = teams && tm !== side ? `<tr class="sb-side"><td colspan="7">${t(tm === rows[0][6] ? 'sb.yours' : 'sb.theirs')}</td></tr>` : '';
        side = tm;
        const status = st === 1 ? `<span class="sb-st dead">✝</span>` : st === 2 ? `<span class="sb-st out">⇪</span>` : '';
        return `${div}<tr class="${id === me ? 'me' : ''}${st === 1 ? ' dead' : ''}"><td>${i + 1}</td><td class="sb-n">${rankBadgeSvg(rk, 16)}${nf ? nameHtml(name, nf) : esc(name)}${bot ? ` <small>${t('sb.bot')}</small>` : ''}${status}</td><td class="num">${k}</td><td class="num">${d}</td><td class="num">${(k / Math.max(1, d)).toFixed(2)}</td>${zed || game.goldMode ? `<td class="num">${extra}</td>` : ''}<td class="num ${pg < 0 ? '' : pg < 90 ? 'good' : pg < 180 ? 'ok' : 'bad'}">${pg < 0 ? '—' : pg}</td></tr>`;
      })
      .join('');
    el.innerHTML = `<div class="sb-card"><header><h3 id="sb-h">${t('sb.title')}</h3><span class="fine">${t('sb.hint')}</span></header><table>${head}${body || `<tr><td colspan="7" class="fine">…</td></tr>`}</table></div>`;
  }

  function show(on) {
    if (on === open) return;
    open = on;
    $('sb').hidden = !on;
    clearInterval(timer);
    if (on) {
      render();
      timer = setInterval(render, 500);
    }
  }

  const playing = () => game.active && app.screen === 'game';
  addEventListener('keydown', (e) => {
    if (e.code !== 'Tab' || !playing()) return;
    e.preventDefault();
    show(true);
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'Tab') show(false);
  });
  addEventListener('blur', () => show(false));
  $('sb-btn').addEventListener('click', () => show(!open));
  $('sb').addEventListener('click', () => show(false));
  return { show, hide: () => show(false) };
}
