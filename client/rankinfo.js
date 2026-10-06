// The ranks window: where you stand (rank, total XP, the bar to the next one), the whole ladder
// of 90 ranks with the XP each one takes, and what pays rank XP. Opened from your name at the
// bottom of the menu and from the rank card in the lobby.
import { t } from './i18n.js';
import { rankBadgeSvg } from './rankbadge.js';
import { RANKS, RANK_XP, MAX_RANK } from '../shared/ranks.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
const HOW = ['raid', 'kill', 'extract', 'pve', 'daily', 'ach'];

export function createRankInfo({ app }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg dlg-ranks';
  dlg.setAttribute('aria-labelledby', 'rki-title');
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('.x')) dlg.close();
  });

  function render() {
    const r = app.rank ?? { rank: 1, name: RANKS[0].name, xp: 0, into: 0, need: RANK_XP[1], toNext: RANK_XP[1], max: false };
    const next = r.max ? null : RANKS[r.rank]; // RANKS is 0-based: the next rank sits at index r.rank
    const pct = r.max ? 100 : Math.max(0, Math.min(100, (r.into / r.need) * 100));
    const toLegend = Math.max(0, RANK_XP[MAX_RANK - 1] - r.xp);
    // the ladder: one row per grade (I–V), Legend on its own
    const rows = [];
    for (let i = 0; i < MAX_RANK; i += 5) {
      const grade = RANKS.slice(i, Math.min(MAX_RANK, i + 5));
      rows.push(
        `<li class="rki-grade${grade.some((x) => x.rank === r.rank) ? ' here' : ''}">${grade
          .map((x) => {
            const st = x.rank < r.rank ? 'got' : x.rank === r.rank ? 'now' : 'next';
            return `<span class="rki-r ${st}" title="${esc(x.name)} · ${num(x.xp)} XP">${rankBadgeSvg(x.rank, 34)}<b>${esc(x.name)}</b><small>${x.rank === 1 ? t('rki.start') : `${num(x.xp)} XP`}</small>${st === 'now' ? `<i>${esc(t('rki.you'))}</i>` : ''}</span>`;
          })
          .join('')}</li>`,
      );
    }
    dlg.innerHTML = `<div class="dlg-inner">
      <header class="dlg-head"><h2 id="rki-title">${esc(t('rki.title'))}</h2><button type="button" class="x" aria-label="${esc(t('rki.close'))}">×</button></header>
      <section class="rki-me">
        <span class="rki-badge">${rankBadgeSvg(r.rank, 72)}</span>
        <div class="rki-main">
          <p class="eyebrow">${esc(t('rk.of', { r: r.rank }))}</p>
          <h3>${esc(r.name)}</h3>
          <div class="rki-bar"><i style="width:${pct}%"></i></div>
          <p class="rki-line">${r.max ? esc(t('rk.max')) : `<b>${num(r.into)}</b> / ${num(r.need)} XP · ${esc(t('rki.left', { x: num(r.toNext) }))}`}</p>
        </div>
      </section>
      <div class="rki-stats">
        <div><small>${esc(t('rki.total'))}</small><b>${num(r.xp)} XP</b></div>
        <div><small>${esc(t('rki.next'))}</small><b>${next ? `${rankBadgeSvg(next.rank, 18)} ${esc(next.name)}` : '—'}</b></div>
        <div><small>${esc(t('rki.legend'))}</small><b>${toLegend ? `${num(toLegend)} XP` : '✓'}</b></div>
      </div>
      <section class="rki-how"><p class="eyebrow">${esc(t('rki.how'))}</p><ul>${HOW.map((k) => `<li>${esc(t(`rki.how.${k}`))}</li>`).join('')}</ul></section>
      <section><p class="eyebrow">${esc(t('rki.ladder', { n: MAX_RANK }))}</p><ol class="rki-ladder">${rows.join('')}</ol></section>
    </div>`;
  }

  function open() {
    render();
    if (!dlg.open) dlg.showModal();
    // the ladder opens on your own grade
    // (inside the ladder's own scroll: the window itself stays at the top)
    requestAnimationFrame(() => {
      const list = dlg.querySelector('.rki-ladder');
      const here = dlg.querySelector('.rki-grade.here');
      if (list && here) list.scrollTop = here.offsetTop - list.offsetTop - list.clientHeight / 2 + here.clientHeight / 2;
    });
  }

  return { open, refresh: () => dlg.open && render() };
}
