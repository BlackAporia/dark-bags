// The shop's fortune wheel: $0.05 a spin in any coin you hold. Shows the fortune bank filling
// towards its next mark (the spin that reaches it wins the bank in real coins), the odds, the last
// winners, and the wheel itself; a jackpot or a real skin can be shared as a card.
import { OUTFIT, WSKIN, RARITIES, usd } from '../shared/cosmetics.js';
import { formatUnits } from '../shared/assets.js';
import { figureStill } from './stickman.js';
import { weaponStill } from './locker.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const money = (mills) => `$${(mills / 1000).toFixed(2)}`;
const COLORS = { trial: '#7c3aed', wtrial: '#0ea5e9', outfit: '#f59e0b', wskin: '#ef4444' };

export function createFortune({ app, send, sfx, toast, share }) {
  const st = { view: null, asset: null, spinning: false, last: null };

  const slotLabel = (s) => (s.k === 'trial' ? `👕 ${t('fw.trial')}` : s.k === 'wtrial' ? `🔫 ${t('fw.wtrial')}` : `${s.k === 'outfit' ? '👕' : '🔫'} ${t('fw.real', { r: t(`r.${s.rarity}`) })}`);
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
    sec.innerHTML = `
      <div class="fw-head">
        <div><p class="eyebrow">${t('fw.kicker')}</p><h3 class="fw-title">${t('fw.title')}</h3><p class="fine">${t('fw.lead')}</p></div>
        <div class="fw-bank"><small>${t('fw.bank')}</small><b>${v ? money(v.pool) : '…'}</b><div class="fw-bar"><i style="width:${pct}%"></i></div><small>${v ? t('fw.next', { m: money(v.mark) }) : ''}</small></div>
      </div>
      <div class="fw-row">
        <select id="fw-coin" aria-label="${esc(t('fw.coin'))}">${list.map((a) => `<option value="${esc(a.id)}"${a.id === st.asset ? ' selected' : ''}>${esc(a.symbol)} · ${esc(formatUnits(app.balances?.[a.id] ?? '0', a.decimals, 4))}</option>`).join('')}</select>
        <button type="button" class="cta fw-go" id="fw-go" ${list.length && !st.spinning ? '' : 'disabled'}>🎰 ${t('fw.spin')} · $0.05</button>
      </div>
      ${list.length ? '' : `<p class="fine">${t('fw.noCoins')}</p>`}
      <details class="fw-odds"><summary>${t('fw.odds')}</summary><ul>${v ? v.slots.map((s, i) => `<li><span>${slotLabel(s)}</span></li>`).join('') : ''}</ul><p class="fine">${t('fw.rules')}</p></details>
      ${v?.wins?.length ? `<p class="fw-wins">🏆 ${v.wins.slice(0, 5).map((w) => `<b>${esc(w.name)}</b> ${money(w.mills)} ${esc(w.asset)}`).join(' · ')}</p>` : ''}`;
    $('fw-coin')?.addEventListener('change', (e) => (st.asset = e.target.value));
    $('fw-go')?.addEventListener('click', spin);
  }

  function overlay() {
    let ov = $('fw-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'fw-ov';
      ov.className = 'wheel-ov';
      document.body.append(ov);
    }
    return ov;
  }

  // a reel of slots that races past the marker and stops on the server's pick
  function spin() {
    if (st.spinning || !st.asset) return;
    st.spinning = true;
    sfx?.play('ready');
    const ov = overlay();
    ov.hidden = false;
    const slots = st.view?.slots ?? [];
    const strip = Array.from({ length: 48 }, (_, i) => slots[i % slots.length] ?? { k: 'trial' });
    ov.innerHTML = `<div class="wheel-box fw-box"><h2 class="ref-title">${t('fw.title')}</h2>
      <div class="fw-reel"><div class="fw-marker"></div><div class="fw-strip" id="fw-strip">${strip.map((s) => `<div class="fw-cell" style="--c:${COLORS[s.k]}">${slotLabel(s)}</div>`).join('')}</div></div>
      <div class="wheel-out" id="fw-out"></div>
      <div class="ap-row"><button type="button" class="ghost" id="fw-close" disabled>${t('share.close')}</button></div></div>`;
    $('fw-close').addEventListener('click', () => {
      if (!st.spinning) ov.hidden = true;
    });
    send({ t: 'fortune_spin', asset: st.asset });
  }

  function land(r) {
    const strip = $('fw-strip');
    const slots = st.view?.slots ?? [];
    const target = 40 - (40 % slots.length) + r.slot; // a cell late in the strip showing that slot
    const done = () => {
      st.spinning = false;
      reveal(r);
    };
    if (!strip) return done();
    const cell = strip.children[target];
    const off = cell.offsetLeft - strip.parentElement.clientWidth / 2 + cell.clientWidth / 2;
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0)';
    void strip.offsetWidth;
    strip.style.transition = 'transform 4.6s cubic-bezier(0.1, 0.75, 0.12, 1)';
    strip.style.transform = `translateX(${-off}px)`;
    setTimeout(done, 4700);
  }

  function reveal(r) {
    const p = r.prize;
    const item = p.k === 'trial' || p.k === 'outfit' ? OUTFIT[p.id] : p.k === 'wtrial' || p.k === 'wskin' ? WSKIN[p.id] : null;
    const real = p.k === 'outfit' || p.k === 'wskin';
    const img = item ? (OUTFIT[p.id] ? `<img alt="" src="${figureStill({ outfit: p.id, body: app.locker?.body ?? 'm' }, 90, 126)}">` : `<img alt="" class="wimg" src="${weaponStill(p.id, 180, 110)}">`) : `<b class="wheel-cash">${usd(p.v ?? 0)}</b>`;
    const jp = r.jackpot;
    const out = $('fw-out');
    if (out)
      out.innerHTML = `${jp ? `<div class="fw-jackpot"><small>${t('fw.jackpot')}</small><b>${money(jp.mills)}</b><span>${esc(formatUnits(jp.units, app.assets?.find((a) => a.id === jp.asset)?.decimals ?? 6, 6))} ${esc(jp.symbol)}</span><p class="fine">${jp.onchain ? t('fw.sentChain') : t('fw.inBalance')}</p></div>` : ''}
        <div class="wheel-prize" style="--r:${item ? RARITIES[item.rarity].color : '#4ade80'}">${img}<p><b>${esc(item ? item.name : usd(p.v ?? 0))}</b></p><p class="fine">${real ? t('fw.realKeep') : item ? t('mail.trial72') : t('mail.creditNote')}</p></div>
        ${jp || real ? `<button type="button" class="cta" id="fw-share">📣 ${t('fw.share')}</button>` : ''}`;
    $('fw-share')?.addEventListener('click', () => share('fortune', { jackpot: jp ? { usd: money(jp.mills), amount: formatUnits(jp.units, app.assets?.find((a) => a.id === jp.asset)?.decimals ?? 6, 4), symbol: jp.symbol } : null, item: real ? { name: item.name, rarity: item.rarity } : null, look: OUTFIT[p.id] && real ? { outfit: p.id } : null }));
    if ($('fw-close')) $('fw-close').disabled = false;
    sfx?.play(jp || real ? 'bag' : 'coin');
    if (jp) sfx?.sting?.(5);
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

  return { mount, onMessage, paint };
}
