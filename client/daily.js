// Coming back every day (shared/daily.js counts and decides): the 30-day calendar, the day's
// and the week's tasks, and the rewards waiting on achievements, all on the Tasks page with the
// achievements under them. A badge on the menu counts what is ready to claim, and the first
// visit of a day opens the calendar by itself.
import { BOX } from '../shared/cosmetics.js';
import { BIG_DAYS } from '../shared/daily.js';
import { t } from './i18n.js';
import { esc, fmt } from './game.js';
import { store } from './store.js';

const $ = (id) => document.getElementById(id);
const usd = (c) => `$${(c / 100).toFixed(2)}`;

// one gift as a chip: icon + words
export function giftHtml(g, big = false) {
  const ico = { credit: '$', box: '🎁', spin: '🎡', pass: '★', xp: '⬆', boost: '×2' }[g.k] ?? '•';
  let label;
  if (g.k === 'credit') label = t('dl.g.credit', { v: usd(g.v) });
  else if (g.k === 'box') label = `${BOX[g.id]?.name ?? g.id}${(g.n ?? 1) > 1 ? ` ×${g.n}` : ''}`;
  else if (g.k === 'spin') label = t('dl.g.spin', { n: g.n ?? 1 });
  else if (g.k === 'pass') label = t('dl.g.pass', { n: fmt(g.v) });
  else if (g.k === 'xp') label = t('dl.g.xp', { n: fmt(g.v) });
  else if (g.k === 'boost') label = t('dl.g.boost', { n: g.n });
  else label = g.k;
  return `<span class="gift g-${g.k}${big ? ' big' : ''}"><i>${ico}</i>${esc(label)}</span>`;
}

const hms = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h >= 24 ? t('dl.days', { d: Math.floor(h / 24), h: h % 24 }) : `${h}:${String(m).padStart(2, '0')}`;
};

// "Play 3 matches", "Get 5 kills", …: the task text by its counter
export function taskText(x) {
  const n = x.stat === 'secs' ? Math.round(x.goal / 60) : x.goal;
  return t(`dl.t.${x.stat}`, { n: fmt(n) });
}

export function createDaily({ app, send, toast, sfx, go }) {
  const st = { view: null, at: 0, popped: store.get('darkbags.dailyPop', -1), busy: false };
  app.daily = null;

  const online = () => app.mode === 'online';

  function badge() {
    const b = document.querySelector('.nav-btn[data-page="achievements"] .nav-badge');
    const n = st.view?.ready ?? 0;
    if (b) {
      b.hidden = !n;
      b.textContent = n ? String(n) : '';
    }
  }

  const left = () => (st.view ? st.view.dayEnds - (Date.now() - st.at) : 0);

  function calendarHtml(v) {
    const c = v.cal;
    const cells = v.calendar
      .map((gifts, i) => {
        const d = i + 1;
        const got = c.claimed ? d <= c.day : d < c.day;
        const today = d === c.day && !c.claimed;
        const big = BIG_DAYS.includes(d);
        return `<li class="cal-d${got ? ' got' : ''}${today ? ' today' : ''}${big ? ' big' : ''}" title="${esc(gifts.map((g) => giftHtml(g).replace(/<[^>]+>/g, ' ').trim()).join(' + '))}">
          <span class="cal-n">${d}</span><span class="cal-ico">${got ? '✓' : big ? '🎁' : giftIcon(gifts[0])}</span></li>`;
      })
      .join('');
    const today = v.calendar[c.day - 1] ?? [];
    return `<section class="dl-card dl-cal">
      <header><div><p class="eyebrow">${esc(t('dl.calendar'))}</p>
        <h3>${esc(t('dl.dayOf', { d: c.day }))}</h3>
        <p class="fine">${c.lost ? `<b class="warn">${esc(t('dl.lost'))}</b> ` : ''}${esc(t('dl.calNote'))}${c.best ? ` · ${esc(t('dl.best', { n: c.best }))}` : ''}</p></div>
        <div class="dl-today">${today.map((g) => giftHtml(g, true)).join('')}
        ${c.claimed ? `<p class="fine">${esc(t('dl.next', { t: hms(left()) }))}</p>` : `<button type="button" class="cta" data-claim="day">${esc(t('dl.claim'))}</button>`}</div></header>
      <ol class="cal-grid">${cells}</ol></section>`;
  }

  const giftIcon = (g) => ({ credit: '$', box: '🎁', spin: '🎡', pass: '★', xp: '⬆', boost: '×2' })[g?.k] ?? '•';

  function taskHtml(x, weekly) {
    const ready = !x.claimed && x.have >= x.goal;
    const pct = Math.round((x.have / x.goal) * 100);
    const have = x.stat === 'secs' ? `${Math.floor(x.have / 60)}/${Math.round(x.goal / 60)} min` : `${fmt(x.have)}/${fmt(x.goal)}`;
    const band = weekly ? 'w' : ['e', 'm', 'h'][x.band ?? 0];
    return `<li class="task b-${band}${x.claimed ? ' claimed' : ready ? ' ready' : ''}">
      <span class="task-dot" aria-hidden="true">${x.claimed ? '✓' : ready ? '!' : weekly ? 'W' : ['I', 'II', 'III'][x.band ?? 0]}</span>
      <div class="task-body"><p class="task-name">${esc(taskText(x))}</p>
        <div class="ach-bar"><i style="width:${pct}%"></i></div>
        <p class="task-gifts">${x.gifts.map((g) => giftHtml(g)).join('')}<span class="fine">${have}</span></p></div>
      ${x.claimed ? `<span class="ach-tag">${esc(t('dl.done'))}</span>` : ready ? `<button type="button" class="cta" data-claim="task" data-id="${x.id}">${esc(t('dl.claim'))}</button>` : ''}</li>`;
  }

  function render() {
    const root = $('daily-root');
    if (!root) return;
    if (!online()) {
      root.innerHTML = `<p class="dl-off fine">${esc(t('dl.offline'))}</p>`;
      return;
    }
    const v = st.view;
    if (!v) {
      root.innerHTML = st.signedOut ? `<p class="dl-off fine">${esc(t('dl.signIn'))}</p>` : '<p class="fine">…</p>';
      return;
    }
    const allDaily = v.daily.every((x) => x.claimed);
    root.innerHTML = `${calendarHtml(v)}
      <div class="dl-row">
        <section class="dl-card"><header><p class="eyebrow">${esc(t('dl.today'))}</p><span class="fine">${esc(t('dl.resets', { t: hms(left()) }))}</span></header>
          <ul class="tasks">${v.daily.map((x) => taskHtml(x, false)).join('')}</ul>
          <p class="dl-sweep${v.sweep ? ' got' : ''}">${esc(t(v.sweep ? 'dl.sweepGot' : 'dl.sweep'))} ${v.sweepGifts.map((g) => giftHtml(g)).join('')}</p></section>
        <section class="dl-card"><header><p class="eyebrow">${esc(t('dl.week'))}</p><span class="fine">${esc(t('dl.resets', { t: hms(v.weekEnds - (Date.now() - st.at)) }))}</span></header>
          <ul class="tasks">${v.weekly.map((x) => taskHtml(x, true)).join('')}</ul></section>
      </div>
      <div class="dl-perks">
        <span class="perk${v.boost ? ' on' : ''}"><b>×2 XP</b> ${esc(v.boost ? t('dl.boostLeft', { n: v.boost }) : t('dl.boostNone'))}</span>
        <span class="perk${v.firstWin ? '' : ' on'}"><b>+300 XP</b> ${esc(t(v.firstWin ? 'dl.fwDone' : 'dl.fwReady'))}</span>
        ${allDaily ? '' : `<span class="perk"><b>${v.daily.filter((x) => x.claimed).length}/3</b> ${esc(t('dl.todayDone'))}</span>`}
      </div>`;
    for (const b of root.querySelectorAll('[data-claim]')) b.addEventListener('click', () => claim(b.dataset.claim, b.dataset.id));
  }

  function claim(what, id) {
    if (st.busy) return;
    st.busy = true;
    setTimeout(() => (st.busy = false), 1500);
    send({ t: 'daily_claim', what, ...(id ? { id } : {}) });
  }

  // the reward pops up big in the middle of the screen
  function celebrate(c) {
    const el = $('dl-pop');
    if (!el) return;
    const title = c.what === 'day' ? t('dl.dayGot', { d: c.day }) : c.what === 'ach' ? t('dl.achGot') : c.sweep ? t('dl.sweepGot') : t('dl.taskGot');
    el.innerHTML = `<div class="dl-pop-card" role="dialog" aria-label="${esc(title)}"><p class="eyebrow">${esc(t('dl.reward'))}</p><h3>${esc(title)}</h3>
      <div class="dl-pop-gifts">${c.gifts.map((g) => giftHtml(g, true)).join('')}</div>
      ${c.achievements?.length ? `<p class="fine">${esc(t('ach.unlocked'))}: ${c.achievements.map((a) => esc(t(`ach.${a}`))).join(', ')}</p>` : ''}
      <button type="button" class="cta" data-ok>${esc(t('dl.nice'))}</button></div>`;
    el.hidden = false;
    el.querySelector('[data-ok]').addEventListener('click', () => (el.hidden = true));
    sfx?.play('beep', { f: 1320, dur: 0.12 });
    setTimeout(() => sfx?.play('beep', { f: 1760, dur: 0.18 }), 120);
  }

  // the first visit of the day: the calendar opens by itself with today's gift
  function maybePop() {
    const v = st.view;
    if (!v || v.cal.claimed || app.screen !== 'lobby' || app.inRoom) return;
    // one thing at a time: wait for the intro, the news, Nyx's tour or another dialog to close
    if (document.querySelector('dialog[open], .tour') || ($('intro') && !$('intro').hidden) || !$('dl-pop').hidden) {
      clearTimeout(st.popT);
      st.popT = setTimeout(maybePop, 2500);
      return;
    }
    const today = Math.floor(Date.now() / 86400000);
    if (st.popped === today) return;
    st.popped = today;
    store.set('darkbags.dailyPop', today);
    const el = $('dl-pop');
    const gifts = v.calendar[v.cal.day - 1];
    el.innerHTML = `<div class="dl-pop-card" role="dialog"><p class="eyebrow">${esc(t('dl.calendar'))}</p><h3>${esc(t('dl.dayOf', { d: v.cal.day }))}</h3>
      ${v.cal.lost ? `<p class="warn">${esc(t('dl.lost'))}</p>` : v.cal.streak ? `<p class="fine">${esc(t('dl.streak', { n: v.cal.streak }))}</p>` : ''}
      <div class="dl-pop-gifts">${gifts.map((g) => giftHtml(g, true)).join('')}</div>
      <div class="dl-pop-row"><button type="button" class="cta" data-take>${esc(t('dl.claim'))}</button><button type="button" class="ghost" data-see>${esc(t('dl.seeAll'))}</button></div></div>`;
    el.hidden = false;
    el.querySelector('[data-take]').addEventListener('click', () => {
      el.hidden = true;
      claim('day');
    });
    el.querySelector('[data-see]').addEventListener('click', () => {
      el.hidden = true;
      go('achievements');
    });
  }

  function refresh() {
    if (online()) send({ t: 'daily' });
  }

  function onMessage(m) {
    if (m.t === 'welcome' || m.t === 'authed') {
      st.view = null;
      st.signedOut = false;
      refresh();
    }
    if (m.t === 'result' && m.tasks?.length) {
      toast?.(t('dl.taskDone', { n: m.tasks.length }));
      refresh();
    } else if (m.t === 'result') refresh();
    if (m.t !== 'daily') return;
    if (m.career) app.career = m.career;
    if (m.signedOut || m.offline) {
      st.view = null;
      st.signedOut = !!m.signedOut;
    } else if (m.view) {
      st.view = m.view;
      st.at = Date.now();
    }
    app.daily = st.view;
    badge();
    if (!document.querySelector('.page[data-page="achievements"]')?.hidden) {
      render();
      app.renderAch?.();
    }
    if (m.claimed) celebrate(m.claimed);
    else maybePop();
  }

  // a new day while the game stays open: fresh tasks and a new calendar day
  setInterval(() => {
    if (st.view && left() <= 0) refresh();
  }, 30_000);

  return { onMessage, render, refresh, claimAch: (id) => claim('ach', id) };
}
