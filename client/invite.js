// Invite friends: your code and link, what it pays, how many came, and a box for a code someone
// gave you. A ?ref=CODE link is remembered on this device and claimed once you are in online.
// The server owns the referral book and its fair-play checks; this page only shows and asks.
import { usd } from '../shared/cosmetics.js';
import { esc } from './game.js';
import { store } from './store.js';
import { t } from './i18n.js';
import { TG } from './telegram.js';
import { ACHIEVEMENTS } from '../shared/achievements.js';

const $ = (id) => document.getElementById(id);
const KEY = 'darkbags.ref';

// a link with ?ref= remembers its code (and leaves the address bar clean); inside Telegram the
// code rides in the start parameter (t.me/<bot>/<app>?startapp=ref_CODE)
export function captureRef() {
  const tg = /^ref_([A-Za-z0-9]{1,12})$/.exec(TG.startParam ?? '');
  if (tg) store.set(KEY, tg[1].toUpperCase());
  try {
    const u = new URL(location.href);
    const code = (u.searchParams.get('ref') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (!code) return;
    store.set(KEY, code);
    u.searchParams.delete('ref');
    history.replaceState(null, '', u.pathname + (u.search === '?' ? '' : u.search) + u.hash);
  } catch {}
}

// a device id: a random name for this browser, so one person is one seat at a staked table
export function deviceId() {
  let d = store.get('darkbags.dev', null);
  if (typeof d !== 'string' || !/^[a-z0-9]{16}$/.test(d)) {
    d = '';
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    for (const x of a) d += 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36];
    store.set('darkbags.dev', d);
  }
  return d;
}

export function createInvite({ app, send, toast, sfx, goOnline = null }) {
  let info = null;
  let asked = 0;
  let fetched = 0;
  let account = null; // with real tokens the code belongs to the signed-in address
  const online = () => app.mode === 'online';
  const signedIn = () => online() && (app.chain ? !!account : !!app.token);

  // inside Telegram the friend gets a link that opens the game in Telegram
  const link = () => (info?.code ? (TG.active && TG.startLink(`ref_${info.code}`)) || `${location.origin}${location.pathname}?ref=${info.code}` : '');

  // once in: a code from a link is claimed (only works before the first match)
  function maybeClaim() {
    const code = store.get(KEY, null);
    if (!code || !signedIn()) return;
    send({ t: 'ref_claim', code });
  }

  function onMessage(m) {
    if (m.t === 'welcome' || m.t === 'authed') {
      account = m.account ?? null;
      info = null;
      maybeClaim();
      if (app.page === 'invite') render();
      return;
    }
    if (m.t !== 'ref') return;
    if (m.supportError) toast(t(`sup.err.${m.supportError}`));
    else if (m.supported && m.support) toast(t('sup.done', { c: m.support }));
    if (m.signedOut) {
      info = { signedOut: true };
    } else {
      info = m;
      if (m.claimed) {
        store.set(KEY, null);
        toast(t('ref.claimedToast'));
        sfx?.play('coin');
      } else if (m.error) {
        if (m.error !== 'busy') store.set(KEY, null); // a code that will never work is forgotten
        if (asked) toast(t(`ref.err.${m.error}`));
      }
    }
    asked = 0;
    if (app.page === 'invite') render();
  }

  function render() {
    const root = $('invite-root');
    if (!root) return;
    if (!online()) {
      // practice runs offline in the page: one button takes you online, right here
      // inside Telegram: share the game with friends there, and the invite code lives on the site
      const tgShare = TG.active && TG.link ? `<button type="button" class="cta ref-tg">${t('tg.share')}</button>` : '';
      root.innerHTML = `<div class="ref-card"><h2 class="ref-title">${t('ref.title')}</h2>${tgShare}<p class="muted">${t('ref.online')}</p>${goOnline ? `<button type="button" class="${tgShare ? 'ghost' : 'cta'} ref-go">${t(TG.active ? 'tg.ctaGo' : 'ref.goOnline')}</button>` : ''}</div>`;
      root.querySelector('.ref-tg')?.addEventListener('click', () => TG.share(TG.link, t('tg.shareText')));
      root.querySelector('.ref-go')?.addEventListener('click', () => {
        goOnline();
        render();
      });
      return;
    }
    // fresh numbers each time the page opens (the reply renders again, within the window)
    if (!info || Date.now() - fetched > 3000) {
      fetched = Date.now();
      send({ t: 'ref_info' });
      info ??= { loading: true };
    }
    if (info.loading) {
      root.innerHTML = `<div class="ref-card"><h2 class="ref-title">${t('ref.title')}</h2><p class="muted">…</p></div>`;
      return;
    }
    if (info.signedOut) {
      root.innerHTML = `<div class="ref-card"><h2 class="ref-title">${t('ref.title')}</h2><p class="muted">${t('ref.signin')}</p></div>`;
      return;
    }
    const pct = Math.round(info.share * 100);
    const cr = info.creator;
    // the next recruiter title, and what each friend's matches bring
    const next = ACHIEVEMENTS.filter((a) => a.stat === 'recruits').find((a) => a.goal > (info.recruits ?? 0));
    const giftName = (g) => t(g.k === 'spin' ? 'ref.g.spin' : `ref.g.${g.id}`);
    const tierName = (id) => t(`cr.t.${id}`);
    const shares = [null, 0.3, 0.5]; // the creator tiers' lowest and highest share (shared/referrals.js CREATOR)
    root.innerHTML = `
      <div class="ref-card ref-hero">
        <div class="ref-hero-txt">
          <h2 class="ref-title">${t('ref.title')}</h2>
          <p class="ref-lead">${cr ? t('cr.lead', { p: Math.round(cr.share * 100), d: cr.days }) : t('ref.lead', { p: pct, d: info.days })}</p>
        </div>
        <div class="ref-code" aria-label="${esc(t('ref.yourCode'))}"><small>${t(cr ? 'cr.code' : 'ref.yourCode')}</small><b>${esc(info.code)}</b></div>
      </div>
      <div class="ref-card">
        <label class="ref-lbl" for="ref-link">${t('ref.link')}</label>
        <div class="ref-row"><input id="ref-link" class="ref-in" readonly value="${esc(link())}"><button type="button" class="cta" id="ref-copy">${t('ref.copy')}</button><button type="button" class="ghost" id="ref-share">${t('ref.share')}</button></div>
        <div class="ref-nets"><button type="button" class="ghost sm" data-net="x">X</button><button type="button" class="ghost sm" data-net="tg">Telegram</button><button type="button" class="ghost sm" data-net="wa">WhatsApp</button></div>
      </div>
      <div class="ref-stats">
        <div class="ref-stat"><b>${info.invited}</b><small>${t('ref.invited')}</small></div>
        <div class="ref-stat" title="${esc(t('ref.recruitsHint', { n: info.needed }))}"><b>${info.recruits ?? 0}</b><small>${t('ref.recruits')}</small></div>
        <div class="ref-stat"><b>${usd(cr ? cr.owed + cr.paid : info.earned)}</b><small>${t('ref.earned')}</small></div>
      </div>
      <div class="ref-card">
        <h3 class="ref-h">${t('ref.rewards')}</h3>
        <div class="ref-two">
          <div><p class="eyebrow">${t('ref.friendGets')}</p><ul class="ref-list"><li>🎁 ${t('ref.friendGift')}</li><li>🎁🎁 ${t('ref.friendGiftFan')}</li></ul></div>
          <div><p class="eyebrow">${t('ref.youGet')}</p><ul class="ref-list">${(info.ladder ?? []).map((s) => `<li>✓ ${t('ref.lad', { n: s.at, g: giftName(s.gift) })}</li>`).join('')}<li>💵 ${cr ? t('cr.cut', { p: Math.round(cr.share * 100), d: cr.days }) : t('ref.cut', { p: pct, d: info.days })}</li></ul></div>
        </div>
        <p class="ref-next">🏅 ${next ? t('ref.nextTitle', { n: next.goal - (info.recruits ?? 0), t: t(`ach.${next.id}`) }) : t('ref.allTitles')}</p>
        <p class="ref-fair">🛡 ${t('ref.fair')}</p>
      </div>
      ${
        cr
          ? `<div class="ref-card ref-cr">
        <h3 class="ref-h">${t('cr.title')} · <span class="cr-tier">${esc(tierName(cr.tier))}</span></h3>
        <p class="muted">${t('cr.tier', { t: tierName(cr.tier), p: Math.round(cr.share * 100) })}</p>
        ${cr.next ? `<div class="cr-bar"><i style="width:${Math.min(100, Math.round(((info.recruits ?? 0) / ((info.recruits ?? 0) + cr.next.need)) * 100))}%"></i></div><p class="fine">${t('cr.next', { n: cr.next.need, t: tierName(cr.next.tier), p: Math.round(cr.next.share * 100) })}</p>` : `<p class="fine">${t('cr.top')}</p>`}
        <div class="ref-stats"><div class="ref-stat"><b>${usd(cr.owed)}</b><small>${t('cr.owed')}</small></div><div class="ref-stat"><b>${usd(cr.paid)}</b><small>${t('cr.paid')}</small></div><div class="ref-stat"><b>${cr.supporters}</b><small>${t('cr.supporters')}</small></div></div>
        <p class="fine">${t('cr.payNote')}</p>
      </div>`
          : `<div class="ref-card ref-cr">
        <h3 class="ref-h">${t('cr.title')}</h3>
        <p class="muted">${t('cr.pitch', { a: Math.round(shares[1] * 100), b: Math.round(shares[2] * 100), s: Math.round((info.supportShare ?? 0.05) * 100) })}</p>
        <button type="button" class="ghost" id="cr-apply">${t('cr.apply')}</button>
      </div>`
      }
      <div class="ref-card">
        <h3 class="ref-h">${t('sup.title')}</h3>
        ${
          info.support
            ? `<p class="muted">${t('sup.current', { c: `<b>${esc(info.support)}</b>` })}</p><button type="button" class="ghost sm" id="sup-stop">${t('sup.stop')}</button>`
            : `<p class="muted">${t('sup.note', { s: Math.round((info.supportShare ?? 0.05) * 100) })}</p><div class="ref-row"><input id="sup-in" class="ref-in" maxlength="12" autocomplete="off" spellcheck="false" placeholder="NYXTV"><button type="button" class="cta" id="sup-go">${t('sup.set')}</button></div>`
        }
      </div>
      ${
        info.by
          ? `<div class="ref-card"><p class="muted">${t('ref.by', { c: esc(info.by) })}</p></div>`
          : info.canClaim
            ? `<div class="ref-card"><label class="ref-lbl" for="ref-code-in">${t('ref.have')}</label><div class="ref-row"><input id="ref-code-in" class="ref-in" maxlength="12" autocomplete="off" spellcheck="false" placeholder="ABC123"><button type="button" class="cta" id="ref-claim">${t('ref.apply')}</button></div></div>`
            : ''
      }`;
    const text = () => t('ref.shareText', { c: info.code });
    for (const b of root.querySelectorAll('[data-net]'))
      b.addEventListener('click', () => {
        const u = encodeURIComponent(link());
        const tx = encodeURIComponent(text());
        const url = b.dataset.net === 'x' ? `https://x.com/intent/tweet?text=${tx}&url=${u}` : b.dataset.net === 'tg' ? `https://t.me/share/url?url=${u}&text=${tx}` : `https://wa.me/?text=${encodeURIComponent(`${text()} ${link()}`)}`;
        if (!TG.open(url)) window.open(url, '_blank', 'noopener');
      });
    $('cr-apply')?.addEventListener('click', () => {
      const url = 'https://x.com/play_dark_bags';
      if (!TG.open(url)) window.open(url, '_blank', 'noopener');
    });
    $('sup-go')?.addEventListener('click', () => {
      const code = $('sup-in').value.trim();
      if (code) send({ t: 'ref_support', code });
    });
    $('sup-stop')?.addEventListener('click', () => send({ t: 'ref_support', code: '' }));
    $('ref-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link());
      } catch {
        $('ref-link').select();
        document.execCommand?.('copy');
      }
      toast(t('ref.copied'));
    });
    $('ref-share')?.addEventListener('click', async () => {
      const text = t('ref.shareText', { c: info.code });
      if (TG.share(link(), text)) return; // Telegram's own share sheet: pick a chat
      if (navigator.share) {
        try {
          await navigator.share({ title: 'DARK BAGS', text, url: link() });
          return;
        } catch {}
      }
      window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link())}`, '_blank', 'noopener');
    });
    $('ref-claim')?.addEventListener('click', () => {
      const code = $('ref-code-in').value.trim();
      if (!code) return;
      asked = 1;
      send({ t: 'ref_claim', code });
    });
  }

  return { render, onMessage, maybeClaim };
}
