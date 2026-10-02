// The battle pass page: this season's theme and its armour on show, the 50 tiers on two
// tracks (free and premium) to claim from, the premium upgrade, and turret skins to equip.
// The server owns the pass; this page only shows it and sends claims.
import { BOX, OUTFIT, WSKIN, RARITIES, TURRET_SKIN, PASS_TIERS, PASS_STEP, PASS_PRICE, passRewards, seasonItems, usd } from '../shared/cosmetics.js';
import { seasonInfo, seasonAt } from '../shared/season.js';
import { boxArt, weaponStill } from './locker.js';
import { figureStill, drawPreview } from './stickman.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export function createPass({ app, send, sfx, toast, openBox = () => {} }) {
  const L = () => app.locker;
  let raf = 0;

  const turretSvg = (sk, size = 54) =>
    `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><g stroke="#05070b" stroke-width="1.2"><path d="M20 24 L9 36 M20 24 L20 37 M20 24 L31 36" stroke="#3a4253" stroke-width="2.4" stroke-linecap="round"/><rect x="20" y="13" width="15" height="3" fill="${sk.trim}"/><rect x="20" y="19" width="15" height="3" fill="${sk.trim}"/><rect x="9" y="9" width="16" height="16" rx="4" fill="${sk.body}" stroke="${sk.trim}"/><circle cx="17" cy="17" r="3.2" fill="${sk.eye}"/></g></svg>`;

  function rewardArt(rw) {
    if (rw.k === 'credit') return `<span class="bp-coin">$${(rw.v / 100).toFixed(2)}</span>`;
    if (rw.k === 'box') return boxArt(BOX[rw.id], 58);
    if (rw.k === 'outfit') return `<img src="${figureStill({ outfit: rw.id, body: L()?.body ?? 'm' }, 48, 66)}" alt="">`;
    if (rw.k === 'wskin') return `<img class="wimg" src="${weaponStill(rw.id, 96, 56)}" alt="">`;
    return turretSvg(TURRET_SKIN[rw.id]);
  }
  function rewardName(rw) {
    if (rw.k === 'credit') return t('bp.credit', { v: usd(rw.v) });
    if (rw.k === 'box') return t(`box.${rw.id}`);
    if (rw.k === 'outfit') return OUTFIT[rw.id].name;
    if (rw.k === 'wskin') return WSKIN[rw.id].name;
    return TURRET_SKIN[rw.id].name;
  }
  const rarityOf = (rw) => (rw.k === 'outfit' ? OUTFIT[rw.id].rarity : rw.k === 'wskin' ? WSKIN[rw.id].rarity : rw.k === 'turret' ? TURRET_SKIN[rw.id].rarity : null);

  function cell(rw, track, tier, ps) {
    if (!rw) return `<div class="bp-cell empty"></div>`;
    const claimed = ps.claimed[track].includes(tier);
    const reached = ps.tier >= tier;
    const locked = track === 'p' && !ps.premium;
    const can = reached && !claimed && !locked;
    const r = rarityOf(rw);
    const col = r ? RARITIES[r].color : '#8a93a6';
    const seasonal = rw.k === 'outfit' || rw.k === 'wskin' || rw.k === 'turret';
    return `<div class="bp-cell ${track}${can ? ' can' : ''}${claimed ? ' got' : ''}${!reached ? ' far' : ''}${locked ? ' locked' : ''}" style="--q:${col}" title="${esc(rewardName(rw))}">
      <div class="bp-art">${rewardArt(rw)}</div>
      <p class="bp-name">${esc(rewardName(rw))}</p>
      ${seasonal ? `<span class="bp-ltd">${t('bp.limited')}</span>` : ''}
      ${can ? `<button type="button" class="cta bp-claim" data-claim="${track}:${tier}">${t('bp.claim')}</button>` : claimed && rw.k === 'box' && (L().boxes?.[rw.id] ?? 0) > 0 ? `<button type="button" class="cta bp-claim" data-open="${rw.id}">${t('inv.open')}</button>` : claimed ? `<span class="bp-ok">✓ ${t('bp.claimed')}</span>` : locked ? `<span class="bp-lock">🔒</span>` : ''}
    </div>`;
  }

  function render() {
    const root = $('pass-root');
    if (!root || !L()) return;
    const ps = L().pass ?? { sid: seasonAt().id, xp: 0, tier: 0, premium: false, claimed: { f: [], p: [] } };
    const S = seasonInfo(ps.sid);
    const T = S.theme;
    const items = seasonItems(ps.sid);
    const R = passRewards(ps.sid);
    const left = Math.max(0, S.end - Date.now());
    const d = Math.floor(left / 86400000);
    const h = Math.floor((left % 86400000) / 3600000);
    const inTier = ps.tier >= PASS_TIERS ? PASS_STEP : ps.xp - ps.tier * PASS_STEP;
    const avail = [];
    for (let k = 1; k <= ps.tier; k++) {
      if (R.f[k] && !ps.claimed.f.includes(k)) avail.push(`f:${k}`);
      if (ps.premium && R.p[k] && !ps.claimed.p.includes(k)) avail.push(`p:${k}`);
    }
    root.innerHTML = `
      <header class="bp-hero" style="--c1:${T.c1};--c2:${T.c2};--dk:${T.dark}">
        <div class="bp-hero-txt">
          <p class="eyebrow">${t('bp.season', { n: S.n })} · ${t('bp.ends', { d, h })}</p>
          <h2 class="bp-title">${esc(T.name)}</h2>
          <p class="fine">${t('bp.how')}</p>
          <div class="bp-prog"><b>${t('bp.tier', { n: ps.tier, m: PASS_TIERS })}</b><div class="bp-bar"><i style="width:${(inTier / PASS_STEP) * 100}%"></i></div><span class="fine">${ps.tier >= PASS_TIERS ? t('bp.maxed') : t('bp.xp', { a: inTier, b: PASS_STEP })}</span></div>
          <div class="bp-cta">${ps.premium ? `<span class="bp-prem-on">★ ${t('bp.owned')}</span>` : `<button type="button" class="cta bp-buy" data-buy>${t('bp.buy', { v: usd(PASS_PRICE) })}</button><p class="fine">${t('bp.perks')}</p>`}
            ${avail.length ? `<button type="button" class="ghost bp-all" data-all>${t('bp.claimAll', { n: avail.length })}</button>` : ''}</div>
        </div>
        <div class="bp-show"><canvas id="bp-live" aria-label="${esc(OUTFIT[items.apex].name)}"></canvas><p class="bp-show-name">${esc(OUTFIT[items.apex].name)} · <span style="color:${RARITIES.mythic.color}">${t('r.mythic')}</span></p></div>
      </header>
      <div class="bp-legend"><span>${t('bp.free')}</span><span>★ ${t('bp.premium')}</span></div>
      <div class="bp-track" id="bp-track">${Array.from({ length: PASS_TIERS }, (_, i) => {
        const k = i + 1;
        return `<div class="bp-col${ps.tier >= k ? ' done' : ''}${ps.tier + 1 === k ? ' next' : ''}"><p class="bp-num">${k}</p>${cell(R.f[k], 'f', k, ps)}${cell(R.p[k], 'p', k, ps)}</div>`;
      }).join('')}</div>
      <section class="bp-turrets"><p class="eyebrow">${t('bp.turrets')}</p><p class="fine">${t('bp.turretsNote')}</p>
        <div class="bp-trow">${[null, ...(L().towned ?? [])].map((id) => {
          const sk = id ? TURRET_SKIN[id] : { body: '#12161f', trim: '#12161f', eye: '#3ddc97', name: t('bp.none') };
          const on = (L().tequip ?? null) === id;
          return `<button type="button" class="bp-tsk${on ? ' on' : ''}" data-tequip="${id ?? ''}">${turretSvg(sk, 46)}<span>${esc(sk.name)}</span><small>${on ? t('bp.equipped') : t('bp.equip')}</small></button>`;
        }).join('')}</div></section>`;
    // scroll the track to where you are
    const track = $('bp-track');
    const next = track.querySelector('.bp-col.next') ?? track.querySelector('.bp-col.done:last-child');
    if (next) track.scrollLeft = Math.max(0, next.offsetLeft - track.clientWidth / 3);
    for (const b of root.querySelectorAll('[data-claim]'))
      b.addEventListener('click', () => {
        const [track_, tier] = b.dataset.claim.split(':');
        b.disabled = true;
        send({ t: 'pass_claim', track: track_, tier: Number(tier) });
      });
    root.querySelector('[data-all]')?.addEventListener('click', () => {
      for (const a of avail) {
        const [track_, tier] = a.split(':');
        send({ t: 'pass_claim', track: track_, tier: Number(tier) });
      }
    });
    root.querySelector('[data-buy]')?.addEventListener('click', () => send({ t: 'pass_buy' }));
    for (const b of root.querySelectorAll('[data-open]')) b.addEventListener('click', () => openBox(b.dataset.open));
    for (const b of root.querySelectorAll('[data-tequip]')) b.addEventListener('click', () => send({ t: 'tequip', id: b.dataset.tequip || null }));
    live(items.apex);
  }

  // the season's top armour, alive: turning, shouldering a seasonal weapon
  function live(id) {
    cancelAnimationFrame(raf);
    const cv = $('bp-live');
    if (!cv) return;
    const draw = (now) => {
      if (!cv.isConnected || app.page !== 'pass') return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cyc = Math.floor(now / 2600);
      const ws = { knife: seasonItems(L()?.pass?.sid ?? seasonAt().id).relic, carbine: seasonItems(L()?.pass?.sid ?? seasonAt().id).relic };
      drawPreview(ctx, { outfit: id, body: L()?.body ?? 'm', ws }, { x: w / 2, y: h * 0.9, scale: (h * 0.82) / 70, t: now, w: cyc % 2 ? 8 : 0, aim: Math.sin(now / 1700) * 0.4 - 0.1 + (cyc % 3 === 2 ? Math.PI : 0) });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  }

  function onMessage(m) {
    if (m.t !== 'locker') return;
    if (m.op === 'pass_claim') {
      const rw = m.result.reward;
      sfx.play(rw.k === 'credit' || rw.k === 'box' ? 'coin' : 'bag');
      if (rw.k === 'box') gotBox(rw.id);
      else toast(t('bp.got', { x: rewardName(rw) }));
    }
    if (m.op === 'pass_buy') {
      sfx.music?.sting(true);
      toast(t('bp.owned'));
    }
    if (app.page === 'pass') render();
  }

  // a bag or crate from the pass: show it, and offer to open it right away
  function gotBox(id) {
    document.getElementById('bp-got')?.remove();
    const d = document.createElement('div');
    d.id = 'bp-got';
    d.className = 'bp-got';
    d.innerHTML = `<div class="bp-got-card">${boxArt(BOX[id], 110)}<p class="eyebrow">${t('bp.claimed')}</p><b>${esc(t(`box.${id}`))}</b><div class="bp-got-btns"><button type="button" class="cta" data-o>${t('inv.open')}</button><button type="button" class="ghost" data-l>${t('bp.later')}</button></div></div>`;
    document.body.append(d);
    const close = () => d.remove();
    d.querySelector('[data-o]').addEventListener('click', () => {
      close();
      openBox(id);
    });
    d.querySelector('[data-l]').addEventListener('click', close);
    d.addEventListener('click', (e) => e.target === d && close());
  }

  // after a raid: the pass moved up a tier (or more)
  function onResult(m) {
    const p = m.pass;
    if (!p || p.after <= p.before) return;
    setTimeout(() => toast(t('bp.up', { n: p.after })), 2500);
    const b = document.querySelector('.nav-btn[data-page="pass"] .nav-badge');
    if (b) {
      b.hidden = false;
      b.textContent = '!';
    }
  }

  return { render, onMessage, onResult };
}
