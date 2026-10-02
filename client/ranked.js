// Ranked on the client: the season table page, the RP line on the result card, the bonus
// spin (a reel of cases, skins and neon season titles), and the neon title text.
import { DIVISIONS, divisionOf, seasonTitle, titleBonus, TITLE_TIERS } from '../shared/ranked.js';
import { seasonInfo, seasonAt } from '../shared/season.js';
import { BOX, BOXES, WSKIN, WEAPON_SKINS, RARITIES } from '../shared/cosmetics.js';
import { boxArt, weaponStill } from './locker.js';
import { spinReel } from './reel.js';
import { esc } from './game.js';
import { t } from './i18n.js';
import { settings } from './settings.js';

const $ = (id) => document.getElementById(id);
const DIV = Object.fromEntries(DIVISIONS.map((d) => [d.id, d]));
const TITLE_RARITY = { contender: 'legendary', elite: 'mythic', champion: 'exotic' };

// "Neon Uprising Champion": the season's name and the tier, for name tags and lists
export function neonText(id) {
  const st = seasonTitle(id);
  return st ? `${seasonInfo(st.sid).theme.name} ${t(`st.${st.key}`)}` : '';
}
export const neonColor = (id) => seasonTitle(id)?.color ?? '#00f5ff';

const svgUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const titleImg = (id) => {
  const c = neonColor(id);
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70" width="120" height="70"><defs><filter id="g"><feGaussianBlur stdDeviation="2.4"/></filter></defs><g font-family="system-ui,sans-serif" font-weight="900" text-anchor="middle"><text x="60" y="30" font-size="13" fill="${c}" filter="url(#g)">${esc(t(`st.${seasonTitle(id).key}`).toUpperCase())}</text><text x="60" y="30" font-size="13" fill="#fff">${esc(t(`st.${seasonTitle(id).key}`).toUpperCase())}</text><text x="60" y="50" font-size="10" fill="${c}">+${Math.round(seasonTitle(id).bonus * 100)}% XP</text></g><rect x="6" y="8" width="108" height="54" rx="10" fill="none" stroke="${c}" stroke-width="2"/></svg>`);
};

export function createRanked({ app, send, sfx, toast, go, openBox = () => {} }) {
  let board = null;

  function render() {
    const root = $('ranked-root');
    if (!root) return;
    if (!board) send({ t: 'leaderboard' });
    const S = seasonInfo(seasonAt().id);
    const me = board?.me ?? app.career?.ranked ?? null;
    const left = Math.max(0, S.end - Date.now());
    const d = Math.floor(left / 86400000);
    const h = Math.floor((left % 86400000) / 3600000);
    const div = me ? DIV[me.div ?? divisionOf(me.rp).id] : null;
    const stat = (k, v) => `<div class="rd-stat"><b class="num">${v}</b><span>${t(k)}</span></div>`;
    const owned = app.career?.stitles ?? [];
    root.innerHTML = `
      <header class="rd-hero" style="--c1:${S.theme.c1};--c2:${S.theme.c2}">
        <p class="eyebrow">${t('rd.title', { n: S.n })} · ${t('bp.ends', { d, h })}</p>
        <h2 class="rd-h">${esc(S.theme.name)}</h2>
        ${me && me.games ? `<div class="rd-me" style="--d:${div.color}">
          <div class="rd-div"><span class="rd-gem"></span><b>${t(`rd.div.${div.id}`)}</b><span class="num">${me.rp} RP</span></div>
          ${board?.me?.pos ? `<p class="rd-pos">${t('rd.pos', { n: board.me.pos, m: board.total })}</p>` : ''}
          <div class="rd-stats">${stat('rd.games', me.games)}${stat('rd.wins', me.wins)}${stat('rd.top3', me.top3)}${stat('rd.kills', me.kills)}${stat('rd.winrate', `${me.games ? Math.round((me.wins / me.games) * 100) : 0}%`)}</div>
        </div>` : `<p class="rd-none">${t('rd.unranked')}</p>`}
        <button type="button" class="cta" data-play>${t('rd.play')}</button>
        <div class="rd-ladder">${DIVISIONS.map((x) => `<span style="--d:${x.color}" class="${div?.id === x.id ? 'on' : ''}"><i></i>${t(`rd.div.${x.id}`)}<small>${x.min}+</small></span>`).join('')}</div>
      </header>
      <section class="rd-titles"><p class="eyebrow">${t('rd.titles')}</p><p class="fine">${t('rd.titlesNote')}</p>
        <div class="rd-trow">${owned.length ? owned.map((id) => {
          const on = app.career?.neon === id;
          const live = titleBonus(id) > 0;
          return `<button type="button" class="rd-tt${on ? ' on' : ''}" style="--n:${neonColor(id)}" data-neon="${on ? '' : esc(id)}"><b>${esc(neonText(id))}</b><small>${live ? t('rd.bonus', { p: Math.round(seasonTitle(id).bonus * 100) }) : t('rd.expired')} · ${on ? t('rd.off') : t('rd.wear')}</small></button>`;
        }).join('') : `<p class="fine">—</p>`}</div>
        <div class="rd-tiers">${TITLE_TIERS.map((x) => `<span style="--n:${x.color}">${t(`st.${x.key}`)} · +${Math.round(x.bonus * 100)}% XP · ${x.odds}%</span>`).join('')}</div>
      </section>
      <section class="rd-board"><p class="eyebrow">${t('rd.board')}</p>
        ${board ? (board.rows.length ? `<table class="rd-table"><thead><tr><th>#</th><th>${t('rd.player')}</th><th>${t('rd.div')}</th><th>RP</th><th>${t('rd.games')}</th><th>${t('rd.wins')}</th><th>${t('rd.top3')}</th><th>${t('rd.kills')}</th></tr></thead><tbody>${board.rows
          .map((r) => `<tr class="${r.me ? 'me' : ''}${r.pos <= 3 ? ` p${r.pos}` : ''}"><td>${r.pos <= 3 ? ['🥇', '🥈', '🥉'][r.pos - 1] : r.pos}</td><td><b>${esc(r.n)}</b>${r.nt ? `<span class="rd-nt" style="--n:${neonColor(r.nt)}">${esc(neonText(r.nt))}</span>` : ''}</td><td><span class="rd-chip" style="--d:${DIV[r.div].color}">${t(`rd.div.${r.div}`)}</span></td><td class="num">${r.rp}</td><td class="num">${r.games}</td><td class="num">${r.wins}</td><td class="num">${r.top3}</td><td class="num">${r.kills}</td></tr>`)
          .join('')}</tbody></table>` : `<p class="fine">${t('rd.empty')}</p>`) : `<p class="fine">…</p>`}
      </section>`;
    root.querySelector('[data-play]').addEventListener('click', () => {
      app.gameMode = 'ranked';
      go('play');
      document.dispatchEvent(new CustomEvent('darkbags:mode'));
    });
    for (const b of root.querySelectorAll('[data-neon]')) b.addEventListener('click', () => send({ t: 'neon', id: b.dataset.neon || null }));
  }

  function onMessage(m) {
    if (m.t === 'leaderboard') {
      board = m;
      if (app.page === 'ranked') render();
    }
    if (m.t === 'career' && app.page === 'ranked') render();
  }

  // the RP line on the result card
  function resultLine(m) {
    const el = $('res-ranked');
    if (!el) return;
    const r = m.ranked;
    el.hidden = !r && !(m.mode === 'ranked' && app.mode === 'practice');
    if (el.hidden) return;
    if (!r) {
      el.innerHTML = `<p class="fine">${t('rd.practice')}</p>`;
      return;
    }
    board = null; // the table changed
    const d = DIV[r.div];
    const up = r.div !== r.divBefore;
    el.innerHTML = `<div class="rr-ranked" style="--d:${d.color}"><span class="rd-gem"></span><div><p class="eyebrow">${t('rd.place', { p: r.place, n: m.size ?? '' })}</p><b class="${r.delta >= 0 ? 'plus' : 'minus'}">${r.delta >= 0 ? '+' : '−'}${Math.abs(r.delta)} RP</b> <span>${t(`rd.div.${r.div}`)} · ${r.after} RP${up ? ` · ${t(r.after > r.before ? 'rd.promoted' : 'rd.demoted')}` : ''}</span></div></div>`;
  }

  // the bonus spin: a reel of what it could have paid, landing on what it did
  function spin(m, overlay, done) {
    const sp = m.ranked?.spin;
    if (!sp) return done?.();
    const sid = seasonAt().id;
    const titleTile = (key) => {
      const id = `${sid}.${key}`;
      return { id, name: neonText(id), rarity: TITLE_RARITY[key], img: titleImg(id) };
    };
    const cases = BOXES.filter((b) => b.group !== 'tier' && b.id !== 'c-knife');
    const caseTile = (b) => ({ id: b.id, name: t(`box.${b.id}`), rarity: 'rare', img: svgUri(boxArt(b, 90).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')) });
    const skins = WEAPON_SKINS.filter((x) => !x.limited && ['epic', 'legendary'].includes(x.rarity));
    const skinTile = (s) => ({ id: s.id, name: s.name, rarity: s.rarity, img: weaponStill(s.id, 120, 70) });
    const pool = [...TITLE_TIERS.map((x) => titleTile(x.key)), ...cases.slice(0, 8).map(caseTile), ...Array.from({ length: 8 }, () => skinTile(skins[Math.floor(Math.random() * skins.length)]))];
    const win = sp.k === 'title' ? titleTile(seasonTitle(sp.id).key) : sp.k === 'wskin' ? skinTile(WSKIN[sp.id]) : caseTile(BOX[sp.id]);
    overlay.hidden = false;
    overlay.className = 'rankup in lottery';
    overlay.innerHTML = `<div class="ru-rays"></div><div class="ru-stage"><div class="ru-head"><p class="ru-kicker">${t('rd.spin')}</p><p class="ru-name">${t('rd.spinWhy', { p: m.ranked.place })}</p></div><div class="ru-reel" id="lt-reel"></div><div class="ru-actions" id="lt-actions"></div></div>`;
    sfx.play('ready');
    setTimeout(() => {
      spinReel($('lt-reel'), { pool, win, odds: { rare: 60, epic: 13, legendary: 18, mythic: 6, exotic: 3 }, sfx, motion: settings.motion, secs: 5.6, label: '' }).then(() => {
        const big = sp.k === 'title';
        if (big) sfx.music?.sting(true);
        else sfx.play('bag');
        const name = sp.k === 'title' ? neonText(sp.id) : win.name;
        const col = sp.k === 'title' ? neonColor(sp.id) : RARITIES[win.rarity].color;
        $('lt-actions').innerHTML = `<p class="ru-won" style="--q:${col}">${t('rd.won')} <b>${esc(name)}</b>${big ? ` · ${t('rd.bonus', { p: Math.round(seasonTitle(sp.id).bonus * 100) })}` : ''}</p><div class="ru-btns">${sp.k === 'box' ? `<button type="button" class="cta" data-lt="open">${t('inv.open')}</button>` : ''}<button type="button" class="${sp.k === 'box' ? 'ghost' : 'cta'}" data-lt="ok">${t('rw.continue')}</button></div>`;
        $('lt-actions').querySelector('[data-lt="open"]')?.addEventListener('click', () => {
          overlay.hidden = true;
          overlay.className = 'rankup';
          done?.();
          openBox(sp.id);
        });
        $('lt-actions').querySelector('[data-lt="ok"]').addEventListener('click', () => {
          overlay.hidden = true;
          overlay.className = 'rankup';
          if (big) toast(t('rd.wornNow'));
          done?.();
        });
      });
    }, settings.motion ? 1400 : 0);
  }

  return { render, onMessage, resultLine, spin };
}
