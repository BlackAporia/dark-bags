// The Mail page: letters from the team and from the game (the welcome bonus), each maybe with a gift
// to claim (shop $, a bag, a trial skin, wheel spins), and the fortune wheel for the spins you hold.
// The server owns the mailbox and the wheel; this page only shows them and asks.
import { OUTFIT, WSKIN, WHEEL, RARITIES, usd } from '../shared/cosmetics.js';
import { figureStill } from './stickman.js';
import { weaponStill } from './locker.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createMail({ app, send, sfx, toast, onUnread = () => {} }) {
  const st = { list: null, open: null, unread: 0, spins: 0, spinning: false };
  const signedIn = () => app.mode === 'online' && !!app.token;

  const titleOf = (m) => (m.i18n ? t(`mail.${m.i18n}.t`) : m.title);
  const bodyOf = (m) => (m.i18n ? t(`mail.${m.i18n}.b`) : m.body);
  function giftText(g) {
    if (!g) return '';
    if (g.k === 'credit') return t('mail.g.credit', { v: usd(g.v) });
    if (g.k === 'spin') return t('mail.g.spin', { n: g.n });
    if (g.k === 'box') return `${t(`box.${g.id}`)}${g.n > 1 ? ` ×${g.n}` : ''}`;
    if (g.k === 'trial') return t('mail.g.trial', { n: OUTFIT[g.id]?.name ?? g.id });
    if (g.k === 'wtrial') return t('mail.g.trial', { n: WSKIN[g.id]?.name ?? g.id });
    return '';
  }

  function setUnread(n) {
    st.unread = n ?? 0;
    onUnread(st.unread);
  }

  function onMessage(m) {
    if (m.t === 'welcome' || m.t === 'authed') {
      st.list = null;
      if (m.locker) st.spins = m.locker.spins ?? 0;
      setUnread(m.mail ?? 0);
      return;
    }
    if (m.t === 'locker' && m.locker) st.spins = m.locker.spins ?? 0;
    if (m.t !== 'mailbox') return;
    if (m.news?.k === 'welcome') {
      toast(t('mail.welcomeToast'));
      sfx?.play('coin');
    } else if (m.news?.k === 'mail') toast(t('mail.newToast'));
    if (m.list) st.list = m.list;
    if (m.locker) {
      st.spins = m.locker.spins ?? 0;
      app.locker = m.locker;
    }
    setUnread(m.unread);
    if (m.claimed) {
      toast(t('mail.claimed', { g: giftText(m.claimed) }));
      sfx?.play('coin');
    }
    if (m.spin) return showPrize(m.spin);
    if (app.page === 'mail') render();
  }

  function render() {
    const root = $('mail-root');
    if (!root) return;
    if (!signedIn()) {
      root.innerHTML = `<div class="ref-card"><h2 class="ref-title">${t('nav.mail')}</h2><p class="muted">${app.mode === 'online' ? t('mail.signin') : t('online.only')}</p></div>`;
      return;
    }
    if (!st.list) {
      send({ t: 'mail_list' });
      root.innerHTML = `<div class="ref-card"><h2 class="ref-title">${t('nav.mail')}</h2><p class="muted">…</p></div>`;
      return;
    }
    const open = st.list.find((m) => m.id === st.open) ?? null;
    const row = (m) => `<button type="button" class="mail-row${m.read ? '' : ' unread'}${m.id === st.open ? ' on' : ''}" data-id="${esc(m.id)}">
        <span class="mail-ico">${m.gift && !m.claimed ? '🎁' : m.kind === 'gift' ? '✉️' : '📰'}</span>
        <span class="mail-head"><b>${esc(titleOf(m))}</b><small>${new Date(m.at).toLocaleDateString()}</small></span>
      </button>`;
    root.innerHTML = `
      <div class="mail-top"><h2 class="ref-title">${t('nav.mail')}</h2>
        ${st.spins > 0 ? `<button type="button" class="cta mail-spin" id="mail-spin">🎡 ${t('mail.spinBtn', { n: st.spins })}</button>` : ''}</div>
      <div class="mail">
        <div class="mail-list">${st.list.length ? st.list.map(row).join('') : `<p class="muted">${t('mail.empty')}</p>`}</div>
        <article class="mail-view">${
          open
            ? `<h3>${esc(titleOf(open))}</h3><p class="fine">${new Date(open.at).toLocaleString()}</p><div class="mail-body">${esc(bodyOf(open)).replace(/\n/g, '<br>')}</div>
              ${open.gift ? `<div class="mail-gift"><span>🎁 ${esc(giftText(open.gift))}</span>${open.claimed ? `<b class="ok">✓ ${t('mail.taken')}</b>` : `<button type="button" class="cta" id="mail-claim">${t('mail.claim')}</button>`}</div>` : ''}`
            : `<p class="muted">${t('mail.pick')}</p>`
        }</article>
      </div>`;
    for (const b of root.querySelectorAll('.mail-row'))
      b.addEventListener('click', () => {
        st.open = b.dataset.id;
        const m = st.list.find((x) => x.id === st.open);
        if (m && !m.read) {
          m.read = true;
          send({ t: 'mail_read', id: m.id });
        }
        render();
      });
    $('mail-claim')?.addEventListener('click', () => send({ t: 'mail_claim', id: st.open }));
    $('mail-spin')?.addEventListener('click', openWheel);
  }

  // ------------------------------------------------------------------ the wheel
  const SEG_ICON = (seg) => (seg.k === 'trial' ? '👕' : seg.k === 'wtrial' ? '🔫' : `$${(seg.v / 100).toFixed(seg.v % 100 ? 2 : 0)}`);
  const SEG_COLORS = ['#7c3aed', '#16a34a', '#0ea5e9', '#16a34a', '#db2777', '#ca8a04', '#2563eb', '#f59e0b'];
  function wheelSvg() {
    const n = WHEEL.length;
    const R = 150;
    const seg = (i) => {
      const a0 = ((i - 0.5) / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
      const p = (a) => `${(R * Math.cos(a)).toFixed(1)} ${(R * Math.sin(a)).toFixed(1)}`;
      const am = (i / n) * Math.PI * 2 - Math.PI / 2;
      return `<path d="M0 0 L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z" fill="${SEG_COLORS[i % SEG_COLORS.length]}" stroke="#0b0d14" stroke-width="3"/>
        <text x="${(R * 0.66 * Math.cos(am)).toFixed(1)}" y="${(R * 0.66 * Math.sin(am)).toFixed(1)}" font-size="${WHEEL[i].k === 'credit' ? 22 : 30}" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">${SEG_ICON(WHEEL[i])}</text>`;
    };
    return `<svg viewBox="-160 -160 320 320" class="wheel-svg" id="wheel-svg"><circle r="157" fill="#0b0d14" stroke="#ffd34d" stroke-width="5"/>${WHEEL.map((_, i) => seg(i)).join('')}<circle r="26" fill="#0b0d14" stroke="#ffd34d" stroke-width="4"/><text font-size="18" text-anchor="middle" dominant-baseline="central" fill="#ffd34d">★</text></svg>`;
  }

  function openWheel() {
    let ov = $('wheel');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'wheel';
      ov.className = 'wheel-ov';
      document.body.append(ov);
    }
    ov.hidden = false;
    ov.innerHTML = `<div class="wheel-box"><h2 class="ref-title">${t('mail.wheel')}</h2><p class="fine">${t('mail.wheelNote')}</p>
      <div class="wheel-wrap"><div class="wheel-pin">▼</div><div class="wheel-rot" id="wheel-rot">${wheelSvg()}</div></div>
      <div class="wheel-out" id="wheel-out"></div>
      <div class="ap-row"><button type="button" class="cta" id="wheel-go">${t('mail.spinNow')}</button><button type="button" class="ghost" id="wheel-close">${t('share.close')}</button></div></div>`;
    $('wheel-close').addEventListener('click', () => !st.spinning && (ov.hidden = true));
    $('wheel-go').addEventListener('click', () => {
      if (st.spinning || st.spins <= 0) return;
      st.spinning = true;
      $('wheel-go').disabled = true;
      sfx?.play('ready');
      send({ t: 'spin' });
    });
  }

  // the server picked the slot: turn the wheel so the pin lands on it, then show the prize
  function showPrize(spin) {
    const rot = $('wheel-rot');
    const n = WHEEL.length;
    const done = () => {
      st.spinning = false;
      const p = spin.prize;
      const img = p.k === 'trial' ? `<img alt="" src="${figureStill({ outfit: p.id, body: app.locker?.body ?? 'm' }, 90, 126)}">` : p.k === 'wtrial' ? `<img alt="" class="wimg" src="${weaponStill(p.id, 180, 110)}">` : `<b class="wheel-cash">${usd(p.v)}</b>`;
      const item = p.k === 'trial' ? OUTFIT[p.id] : p.k === 'wtrial' ? WSKIN[p.id] : null;
      const out = $('wheel-out');
      if (out)
        out.innerHTML = `<div class="wheel-prize" style="--r:${item ? RARITIES[item.rarity].color : '#4ade80'}">${img}<p><b>${esc(item ? item.name : t('mail.g.credit', { v: usd(p.v) }))}</b></p><p class="fine">${item ? t('mail.trial72') : t('mail.creditNote')}</p></div>`;
      if ($('wheel-go')) {
        $('wheel-go').disabled = st.spins <= 0;
        $('wheel-go').textContent = st.spins > 0 ? t('mail.spinNow') : t('mail.noSpins');
      }
      sfx?.play('bag');
      if (app.page === 'mail') render();
    };
    if (!rot) return done();
    const turns = 6 + Math.random();
    const target = 360 * Math.round(turns) - (spin.slot / n) * 360 + (Math.random() - 0.5) * (300 / n);
    rot.style.transition = 'none';
    rot.style.transform = 'rotate(0deg)';
    void rot.offsetWidth;
    rot.style.transition = 'transform 5.2s cubic-bezier(0.12, 0.8, 0.12, 1)';
    rot.style.transform = `rotate(${target}deg)`;
    setTimeout(done, 5300);
  }

  return { render, onMessage, openWheel, get unread() {
    return st.unread;
  } };
}
