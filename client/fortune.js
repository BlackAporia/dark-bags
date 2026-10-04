// The shop's fortune wheel: $0.05 a spin in any coin you hold, or free with the spins from tasks,
// the calendar and mail. Shows the fortune bank filling towards its next mark (the paid spin that
// reaches it wins the bank in real coins), the wheel with every prize and its chance, and the last
// winners. A spin turns a big wheel full screen: lights chase round the rim, the pointer clicks
// over each segment, and the prize pops out where it stops; a jackpot or a real skin can be shared.
import { OUTFIT, WSKIN, BOX, RARITIES, usd } from '../shared/cosmetics.js';
import { STYLE } from '../shared/style.js';
import { formatUnits } from '../shared/assets.js';
import { figureStill } from './stickman.js';
import { weaponStill } from './locker.js';
import { styleStill } from './flair.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const money = (mills) => `$${(mills / 1000).toFixed(2)}`;
const R = (r) => RARITIES[r]?.color ?? '#9aa3b5';

// how each kind of slot looks on the wheel: colour, icon, a short tag
function face(s) {
  switch (s.k) {
    case 'trial':
      return { c: '#6d28d9', i: '👕', tag: '1H' };
    case 'wtrial':
      return { c: '#0369a1', i: '🔫', tag: '1H' };
    case 'credit':
      return { c: s.v >= 25 ? '#15803d' : '#166534', i: '💵', tag: usd(s.v) };
    case 'pass':
      return { c: '#b45309', i: '★', tag: `+${s.v}` };
    case 'boost':
      return { c: '#be123c', i: '⚡', tag: '×2' };
    case 'spin':
      return { c: '#a21caf', i: '🎡', tag: '+1' };
    case 'box':
      return { c: '#9a3412', i: '🎁', tag: BOX[s.id]?.family === 'weapon' ? 'CRATE' : 'BAG' };
    case 'style':
      return { c: R(s.rarity), i: '✦', tag: t(`r.${s.rarity}`).slice(0, 8).toUpperCase(), rare: s.rarity };
    case 'outfit':
      return { c: R(s.rarity), i: '👕', tag: '★', rare: s.rarity };
    case 'wskin':
      return { c: R(s.rarity), i: '🔫', tag: '★', rare: s.rarity };
    default:
      return { c: '#334155', i: '?', tag: '' };
  }
}

// the long name of a slot (the odds list)
function slotLabel(s) {
  switch (s.k) {
    case 'trial':
      return `👕 ${t('fw.trial')}`;
    case 'wtrial':
      return `🔫 ${t('fw.wtrial')}`;
    case 'outfit':
    case 'wskin':
      return `${s.k === 'outfit' ? '👕' : '🔫'} ${t('fw.real', { r: t(`r.${s.rarity}`) })}`;
    case 'credit':
      return `💵 ${t('fw.k.credit', { v: usd(s.v) })}`;
    case 'pass':
      return `★ ${t('fw.k.pass', { v: s.v })}`;
    case 'boost':
      return `⚡ ${t('fw.k.boost', { n: s.n ?? 1 })}`;
    case 'spin':
      return `🎡 ${t('fw.k.spin')}`;
    case 'box':
      return `🎁 ${t('fw.k.box', { name: BOX[s.id]?.name ?? s.id })}`;
    case 'style':
      return `✦ ${t('fw.k.style', { r: t(`r.${s.rarity}`) })}`;
    default:
      return s.k;
  }
}

// the wheel as one SVG: segments, rim, bulbs (lit by CSS), a hub
function wheelSvg(slots, id) {
  const n = slots.length || 1;
  const Rr = 150;
  const pt = (a, r) => `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  const segs = slots
    .map((s, i) => {
      const f = face(s);
      const a0 = ((i - 0.5) / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
      const deg = (i / n) * 360;
      return `<g class="fw-seg${f.rare ? ` fw-rare r-${f.rare}` : ''}" data-i="${i}">
        <path d="M0 0 L${pt(a0, Rr)} A${Rr} ${Rr} 0 0 1 ${pt(a1, Rr)} Z" fill="url(#${id}-g${i})" stroke="#07080d" stroke-width="2"/>
        <g transform="rotate(${deg})"><text y="-128" class="fw-ico" text-anchor="middle" dominant-baseline="central">${f.i}</text><text transform="translate(0 -76) rotate(-90)" class="fw-tag" text-anchor="middle" dominant-baseline="central">${esc(f.tag)}</text></g></g>`;
    })
    .join('');
  const grads = slots
    .map((s, i) => {
      const c = face(s).c;
      return `<radialGradient id="${id}-g${i}" cx="0" cy="0" r="150" gradientUnits="userSpaceOnUse"><stop offset="0.15" stop-color="#07080d"/><stop offset="0.55" stop-color="${c}" stop-opacity="0.75"/><stop offset="1" stop-color="${c}"/></radialGradient>`;
    })
    .join('');
  const bulbs = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    return `<circle class="fw-bulb${i % 2 ? ' b2' : ''}" cx="${(162 * Math.cos(a)).toFixed(1)}" cy="${(162 * Math.sin(a)).toFixed(1)}" r="3.6"/>`;
  }).join('');
  return `<svg viewBox="-175 -175 350 350" class="fw-svg"><defs>${grads}</defs>
    <circle r="172" fill="#0b0d14" stroke="#ffd34d" stroke-width="3"/><circle r="153" fill="#07080d"/>
    <g class="fw-bulbs">${bulbs}</g>
    <g class="fw-rot">${segs}</g>
    <circle r="34" fill="#0b0d14" stroke="#ffd34d" stroke-width="4"/><text class="fw-hub" text-anchor="middle" dominant-baseline="central">$</text></svg>`;
}

export function createFortune({ app, send, sfx, toast, share }) {
  const st = { view: null, asset: null, spinning: false, angle: 0, free: false };

  const spins = () => app.locker?.spins ?? 0;
  const coins = () => {
    const b = app.balances ?? {};
    return (app.assets ?? []).filter((a) => a.usd > 0 && BigInt(b[a.id] ?? '0') > 0n);
  };

  function mount(root) {
    if (app.mode !== 'online' || !app.token) return;
    if (!st.view) send({ t: 'fortune_info' });
    const sec = document.createElement('section');
    sec.className = 'fortune';
    sec.id = 'fortune-root';
    root.prepend(sec);
    paint();
  }

  function paint() {
    const sec = $('fortune-root');
    if (!sec) return;
    const v = st.view;
    const list = coins();
    if (!st.asset || !list.some((a) => a.id === st.asset)) st.asset = list.find((a) => a.symbol === 'STRK')?.id ?? list[0]?.id ?? null;
    const pct = v ? Math.min(100, (v.pool / v.mark) * 100) : 0;
    const n = spins();
    sec.innerHTML = `
      <div class="fw-mini" id="fw-mini" role="button" tabindex="0" aria-label="${esc(t('fw.title'))}">${v ? wheelSvg(v.slots, 'fwm') : ''}<i class="fw-pointer"></i></div>
      <div class="fw-side">
        <div class="fw-head">
          <div><p class="eyebrow">${t('fw.kicker')}</p><h3 class="fw-title">${t('fw.title')}</h3><p class="fine">${t('fw.lead')}</p></div>
          <div class="fw-bank"><small>${t('fw.bank')}</small><b>${v ? money(v.pool) : '…'}</b><div class="fw-bar"><i style="width:${pct}%"></i></div><small>${v ? t('fw.next', { m: money(v.mark) }) : ''}</small></div>
        </div>
        ${n > 0 ? `<div class="fw-row"><button type="button" class="cta fw-free" id="fw-free" ${st.spinning ? 'disabled' : ''}>🎁 ${t('fw.free', { n })}</button>${n > 1 ? `<button type="button" class="cta fw-free" id="fw-all" ${st.spinning ? 'disabled' : ''}>🎡 ${t('fw.all', { n: Math.min(50, n) })}</button>` : ''}</div>` : ''}
        <div class="fw-row">
          <select id="fw-coin" aria-label="${esc(t('fw.coin'))}">${list.map((a) => `<option value="${esc(a.id)}"${a.id === st.asset ? ' selected' : ''}>${esc(a.symbol)} · ${esc(formatUnits(app.balances?.[a.id] ?? '0', a.decimals, 4))}</option>`).join('')}</select>
          <button type="button" class="${n > 0 ? 'ghost' : 'cta'} fw-go" id="fw-go" ${list.length && !st.spinning ? '' : 'disabled'}>🎰 ${t('fw.spin')} · $0.05</button>
        </div>
        ${list.length ? '' : `<p class="fine">${t('fw.noCoins')}</p>`}
        <p class="fine fw-freenote">${t('fw.freeNote')}</p>
        <details class="fw-odds"><summary>${t('fw.odds')}</summary><ul>${v ? v.slots.map((s) => `<li style="--c:${face(s).c}"><span>${slotLabel(s)}</span><b>${s.p}%</b></li>`).join('') : ''}</ul><p class="fine">${t('fw.rules')}</p></details>
        ${v?.wins?.length ? `<p class="fw-wins">🏆 ${v.wins.slice(0, 5).map((w) => `<b>${esc(w.name)}</b> ${money(w.mills)} ${esc(w.asset)}`).join(' · ')}</p>` : ''}
      </div>`;
    $('fw-coin')?.addEventListener('change', (e) => (st.asset = e.target.value));
    $('fw-go')?.addEventListener('click', () => spin(false));
    $('fw-free')?.addEventListener('click', () => spin(true));
    $('fw-all')?.addEventListener('click', () => spin(true, spins()));
    const mini = $('fw-mini');
    const go = () => spin(spins() > 0);
    mini?.addEventListener('click', go);
    mini?.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
  }

  function overlay() {
    let ov = $('fw-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'fw-ov';
      ov.className = 'wheel-ov fw-ov';
      document.body.append(ov);
    }
    return ov;
  }

  // the big wheel: open it (or keep it open for another spin) and ask the server to spin
  function spin(free, many = 1) {
    if (st.spinning) return;
    if (free && spins() <= 0) free = false;
    if (!free && !st.asset) return toast?.(t('fw.noCoins'));
    if (!st.view) return;
    st.spinning = true;
    st.free = free;
    sfx?.play('ready');
    const ov = overlay();
    if (ov.hidden !== false || !$('fw-big')) {
      ov.hidden = false;
      st.angle = 0;
      ov.innerHTML = `<div class="wheel-box fw-box"><h2 class="ref-title fw-otitle">${t('fw.title')}</h2>
        <div class="fw-big" id="fw-big">${wheelSvg(st.view.slots, 'fwb')}<i class="fw-pointer" id="fw-pointer"></i></div>
        <div class="wheel-out" id="fw-out"></div>
        <div class="ap-row" id="fw-acts"></div></div>`;
    }
    $('fw-big').classList.add('spinning');
    $('fw-big').classList.remove('landed');
    for (const g of document.querySelectorAll('#fw-big .fw-seg.win')) g.classList.remove('win');
    $('fw-out').innerHTML = '';
    acts();
    send(free ? { t: 'fortune_spin', free: Math.max(1, Math.min(50, many)) } : { t: 'fortune_spin', asset: st.asset });
    paint();
  }

  // the buttons under the big wheel: spin again (free first) and close
  function acts() {
    const el = $('fw-acts');
    if (!el) return;
    const n = spins();
    const again = st.spinning ? '' : n > 0 ? `<button type="button" class="cta" id="fw-again-free">🎁 ${t('fw.free', { n })}</button>${n > 1 ? `<button type="button" class="cta" id="fw-again-all">🎡 ${t('fw.all', { n: Math.min(50, n) })}</button>` : ''}` : st.asset ? `<button type="button" class="cta" id="fw-again">🎰 ${t('fw.again')} · $0.05</button>` : '';
    el.innerHTML = `${again}<button type="button" class="ghost" id="fw-close" ${st.spinning ? 'disabled' : ''}>${t('share.close')}</button>`;
    $('fw-again-free')?.addEventListener('click', () => spin(true));
    $('fw-again-all')?.addEventListener('click', () => spin(true, spins()));
    $('fw-again')?.addEventListener('click', () => spin(false));
    $('fw-close')?.addEventListener('click', () => {
      if (!st.spinning) overlay().hidden = true;
    });
  }

  // turn the wheel to the server's slot: fast, then slower and slower, the pointer clicking over
  // every segment; a few last-second creeps keep it tense
  function land(r) {
    const big = $('fw-big');
    const rot = big?.querySelector('.fw-rot');
    const n = st.view?.slots?.length ?? 1;
    const seg = 360 / n;
    const done = () => {
      st.spinning = false;
      reveal(r);
    };
    if (!rot) return done();
    const from = st.angle;
    const jitter = (Math.random() - 0.5) * seg * 0.7;
    const base = Math.ceil(from / 360) * 360 + 360 * (6 + Math.floor(Math.random() * 2));
    const to = base - r.slot * seg + jitter;
    const dur = 5600 + Math.random() * 900;
    const t0 = performance.now();
    const ptr = $('fw-pointer');
    let lastSeg = Math.floor((from + seg / 2) / seg);
    const ease = (x) => 1 - Math.pow(1 - x, 4.2);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const a = from + (to - from) * ease(k);
      rot.setAttribute('transform', `rotate(${a.toFixed(2)})`);
      const s = Math.floor((a + seg / 2) / seg);
      if (s !== lastSeg) {
        lastSeg = s;
        sfx?.play('beep', { f: 1400 + Math.random() * 200, dur: 0.012 });
        if (ptr) {
          ptr.classList.remove('kick');
          void ptr.offsetWidth;
          ptr.classList.add('kick');
        }
      }
      if (k < 1) requestAnimationFrame(step);
      else {
        st.angle = to;
        big.classList.remove('spinning');
        big.classList.add('landed');
        big.querySelector(`.fw-seg[data-i="${r.slot}"]`)?.classList.add('win');
        done();
      }
    };
    requestAnimationFrame(step);
  }

  // confetti from the pointer, in the prize's colour
  function burst(color, many) {
    const big = $('fw-big');
    if (!big) return;
    const box = document.createElement('div');
    box.className = 'fw-burst';
    const cols = [color, '#ffd34d', '#ffffff', '#ff6bd5', '#3ce6ff'];
    box.innerHTML = Array.from({ length: many ? 70 : 28 }, () => {
      const a = Math.random() * Math.PI * 2;
      const d = 80 + Math.random() * (many ? 260 : 160);
      return `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d - 60).toFixed(0)}px;--r:${Math.floor(Math.random() * 720)}deg;--d:${(0.7 + Math.random() * 0.8).toFixed(2)}s;background:${cols[Math.floor(Math.random() * cols.length)]}"></i>`;
    }).join('');
    big.append(box);
    setTimeout(() => box.remove(), 1800);
  }

  // what the prize looks like in the card under the wheel
  function prizeCard(p) {
    const body = app.locker?.body ?? 'm';
    switch (p.k) {
      case 'trial':
      case 'outfit': {
        const o = OUTFIT[p.id];
        return { color: R(o?.rarity), img: `<img alt="" src="${figureStill({ outfit: p.id, body }, 90, 126)}">`, name: o?.name ?? p.id, note: p.k === 'outfit' ? t('fw.realKeep') : t('mail.trial72'), big: p.k === 'outfit', share: p.k === 'outfit' ? { name: o?.name, rarity: o?.rarity } : null };
      }
      case 'wtrial':
      case 'wskin': {
        const o = WSKIN[p.id];
        return { color: R(o?.rarity), img: `<img alt="" class="wimg" src="${weaponStill(p.id, 180, 110)}">`, name: o?.name ?? p.id, note: p.k === 'wskin' ? t('fw.realKeep') : t('mail.trial72'), big: p.k === 'wskin', share: p.k === 'wskin' ? { name: o?.name, rarity: o?.rarity } : null };
      }
      case 'style': {
        const o = STYLE[p.id];
        return { color: R(o?.rarity), img: `<img alt="" src="${styleStill(p.id, 180, 100)}">`, name: o?.name ?? p.id, note: t('fw.styleNote'), big: o?.rarity === 'epic' };
      }
      case 'box':
        return { color: '#fb923c', img: '<b class="wheel-cash fw-emo">🎁</b>', name: BOX[p.id]?.name ?? p.id, note: t('fw.boxNote') };
      case 'pass':
        return { color: '#f59e0b', img: `<b class="wheel-cash fw-gold">★ ${p.v}</b>`, name: t('fw.k.pass', { v: p.v }), note: t('fw.passNote') };
      case 'boost':
        return { color: '#fb7185', img: '<b class="wheel-cash fw-red">⚡×2</b>', name: t('fw.k.boost', { n: p.n ?? 1 }), note: t('fw.boostNote') };
      case 'spin':
        return { color: '#e879f9', img: '<b class="wheel-cash fw-emo">🎡</b>', name: t('fw.k.spin'), note: t('fw.spinNote') };
      default:
        return { color: '#4ade80', img: `<b class="wheel-cash">${usd(p.v ?? 0)}</b>`, name: t('fw.k.credit', { v: usd(p.v ?? 0) }), note: t('mail.creditNote') };
    }
  }

  function reveal(r) {
    const card = prizeCard(r.prize);
    const jp = r.jackpot;
    const dec = (id) => app.assets?.find((a) => a.id === id)?.decimals ?? 6;
    const out = $('fw-out');
    if (out)
      out.innerHTML = `${jp ? `<div class="fw-jackpot"><small>${t('fw.jackpot')}</small><b>${money(jp.mills)}</b><span>${esc(formatUnits(jp.units, dec(jp.asset), 6))} ${esc(jp.symbol)}</span><p class="fine">${jp.onchain ? t('fw.sentChain') : t('fw.inBalance')}</p></div>` : ''}
        <div class="wheel-prize${card.big ? ' fw-bigwin' : ''}" style="--r:${card.color}">${card.img}<p><b>${esc(card.name)}</b></p><p class="fine">${card.note}</p></div>
        ${r.all ? `<p class="fine">${t('fw.allGot', { n: r.all.length })}</p><div class="fw-list">${r.all.map((x) => { const c = prizeCard(x.prize); return `<span class="fw-chip" style="--r:${c.color}">${esc(c.name)}</span>`; }).join('')}</div>` : ''}
        ${jp || card.share ? `<button type="button" class="cta" id="fw-share">📣 ${t('fw.share')}</button>` : ''}`;
    $('fw-share')?.addEventListener('click', () => share('fortune', { jackpot: jp ? { usd: money(jp.mills), amount: formatUnits(jp.units, dec(jp.asset), 4), symbol: jp.symbol } : null, item: card.share, look: r.prize.k === 'outfit' ? { outfit: r.prize.id } : null }));
    burst(card.color, !!(jp || card.big));
    sfx?.play(jp || card.big ? 'bag' : 'coin');
    if (jp) sfx?.sting?.(5);
    else if (card.big) sfx?.sting?.(3);
    acts();
    paint();
  }

  function onMessage(m) {
    if (m.t === 'err' && st.spinning) {
      st.spinning = false;
      const ov = $('fw-ov');
      if (ov) ov.hidden = true;
      paint();
      return;
    }
    if (m.t !== 'fortune') return;
    if (m.view) st.view = m.view;
    if (m.balances) app.balances = m.balances;
    if (m.locker) app.locker = m.locker;
    if (m.spun) return land(m.spun);
    paint();
  }

  // open the shop at the wheel (the mail's and the calendar's "spin" buttons); all: spin every
  // free spin at once
  function open(all = false) {
    app.go?.('shop');
    setTimeout(() => $('fortune-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    if (all && spins() > 0) setTimeout(() => spin(true, spins()), 400);
  }

  return { mount, onMessage, paint, open };
}
