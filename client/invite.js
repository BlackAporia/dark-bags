// Invite friends: your code and link, what it pays, how many came, and a box for a code someone
// gave you. A ?ref=CODE link is remembered on this device and claimed once you are in online.
// The server owns the referral book and its fair-play checks; this page only shows and asks.
import { usd } from '../shared/cosmetics.js';
import { esc } from './game.js';
import { store } from './store.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const KEY = 'darkbags.ref';

// a link with ?ref= remembers its code (and leaves the address bar clean)
export function captureRef() {
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

export function createInvite({ app, send, toast, sfx }) {
  let info = null;
  let asked = 0;
  let fetched = 0;
  let account = null; // with real tokens the code belongs to the signed-in address
  const online = () => app.mode === 'online';
  const signedIn = () => online() && (app.chain ? !!account : !!app.token);

  const link = () => (info?.code ? `${location.origin}${location.pathname}?ref=${info.code}` : '');

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
      root.innerHTML = `<div class="ref-card"><h2 class="ref-title">${t('ref.title')}</h2><p class="muted">${t('ref.online')}</p></div>`;
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
    root.innerHTML = `
      <div class="ref-card ref-hero">
        <div class="ref-hero-txt">
          <h2 class="ref-title">${t('ref.title')}</h2>
          <p class="ref-lead">${t('ref.lead', { p: pct, d: info.days })}</p>
        </div>
        <div class="ref-code" aria-label="${esc(t('ref.yourCode'))}"><small>${t('ref.yourCode')}</small><b>${esc(info.code)}</b></div>
      </div>
      <div class="ref-card">
        <label class="ref-lbl" for="ref-link">${t('ref.link')}</label>
        <div class="ref-row"><input id="ref-link" class="ref-in" readonly value="${esc(link())}"><button type="button" class="cta" id="ref-copy">${t('ref.copy')}</button><button type="button" class="ghost" id="ref-share">${t('ref.share')}</button></div>
      </div>
      <div class="ref-stats">
        <div class="ref-stat"><b>${info.invited}</b><small>${t('ref.invited')}</small></div>
        <div class="ref-stat"><b>${info.active}</b><small>${t('ref.active')}</small></div>
        <div class="ref-stat"><b>${usd(info.earned)}</b><small>${t('ref.earned')}</small></div>
      </div>
      <div class="ref-card">
        <h3 class="ref-h">${t('ref.how')}</h3>
        <ol class="ref-steps">
          <li>${t('ref.step1')}</li>
          <li>${t('ref.step2', { m: 1 })}</li>
          <li>${t('ref.step3', { p: pct, d: info.days })}</li>
          <li>${t('ref.step4', { m: info.milestone })}</li>
        </ol>
        <p class="ref-fair">🛡 ${t('ref.fair')}</p>
      </div>
      ${
        info.by
          ? `<div class="ref-card"><p class="muted">${t('ref.by', { c: esc(info.by) })}</p></div>`
          : info.canClaim
            ? `<div class="ref-card"><label class="ref-lbl" for="ref-code-in">${t('ref.have')}</label><div class="ref-row"><input id="ref-code-in" class="ref-in" maxlength="12" autocomplete="off" spellcheck="false" placeholder="ABC123"><button type="button" class="cta" id="ref-claim">${t('ref.apply')}</button></div></div>`
            : ''
      }`;
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
