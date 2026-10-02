// The team's analytics page. The server only answers the admin wallets (ADMIN_WALLETS): this page
// sends the game session of this browser, so sign in to the game with one of them first.
import { BOX, PACK } from '../shared/cosmetics.js';
import { ADMIN_LANGS, LOCALE, tr, localize } from './admin-i18n.js';

// the page's language: picked in the header, remembered in this browser
const lang = (() => {
  try {
    const v = localStorage.getItem('darkbags.adminLang');
    if (v && LOCALE[v]) return v;
  } catch {}
  const n = (navigator.language || 'en').slice(0, 2);
  return LOCALE[n] ? n : 'en';
})();
document.documentElement.lang = lang;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const token = (() => {
  try {
    return JSON.parse(localStorage.getItem('darkbags.token') ?? 'null');
  } catch {
    return null;
  }
})();
// admin.html#key=<ADMIN_KEY> works too (a server without wallets); the key stays in this tab only
const adminKey = (() => {
  try {
    const m = location.hash.match(/key=([^&]+)/);
    if (m) {
      sessionStorage.setItem('darkbags.adminKey', decodeURIComponent(m[1]));
      history.replaceState(null, '', location.pathname);
    }
    return sessionStorage.getItem('darkbags.adminKey');
  } catch {
    return null;
  }
})();

// ------------------------------------------------------------ formatting
const nf = new Intl.NumberFormat(LOCALE[lang]);
const num = (n) => nf.format(Math.round(n ?? 0));
const usd = (mills, d = 2) => (mills == null ? '—' : `$${(mills / 1000).toLocaleString(LOCALE[lang], { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const cents = (c) => usd((c ?? 0) * 10);
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const units = (u, dec, max = 4) => {
  const v = Number(BigInt(u)) / 10 ** dec;
  return nf.format(+v.toFixed(v >= 1000 ? 0 : max));
};
const dt = (t) => (t ? new Date(t).toLocaleString(LOCALE[lang], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const dur = (s) => {
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} год ${m} хв` : `${m} хв ${s % 60} с`;
};
const ago = (t) => {
  if (!t) return '—';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'щойно';
  if (s < 3600) return `${Math.floor(s / 60)} хв тому`;
  if (s < 86400) return `${Math.floor(s / 3600)} год тому`;
  return `${Math.floor(s / 86400)} д тому`;
};

const MODE_UK = { raid: 'Рейд', br: 'Королівська битва', duel: 'Дуель', dm: 'Бій насмерть', gl: 'Guns + Lasers', hardcore: 'Хардкор', knives: 'Тільки ножі', pistols: 'Тільки пістолети', shotguns: 'Тільки дробовики', rifles: 'Тільки гвинтівки', snipers: 'Тільки снайперки', team2: 'Команди 2×2', team4: 'Команди 4×4', team8: 'Команди 8×8', ranked: 'Рейтингова', zombies: 'Зомбі', gold: 'Золота лихоманка' };
const KIND_UK = { topup: 'Поповнення shop $', box: 'Сумки та кейси', pass: 'Бойовий пропуск', fortune: 'Колесо фортуни' };
const CAREER = [
  ['raids', 'Матчів зіграно (усіма гравцями)'],
  ['kills', 'Вбивств'],
  ['extracts', 'Вдалих евакуацій'],
  ['wins', 'Перемог'],
  ['headshots', 'Хедшотів'],
  ['secs', 'Часу в боях', (v) => dur(v)],
  ['zKills', 'Вбито зомбі'],
  ['rankedGames', 'Рейтингових ігор'],
  ['golden', 'Золотих рейдів'],
  ['opened', 'Відкрито сумок'],
];
const itemName = (id) => {
  const [kind, x] = id.split(':');
  if (kind === 'box') return BOX[x]?.name ?? x;
  if (kind === 'topup') return PACK[x] ? `Пак ${cents(PACK[x].price)}` : x;
  if (kind === 'pass') return 'Бойовий пропуск';
  return x;
};

// ------------------------------------------------------------ charts
// One series over the days: an area with a 2px line, a crosshair and a tooltip on hover.
function lineChart(rows, { key, fmt = num, color = 'var(--s1)', h = 170 }) {
  const W = 640;
  const pad = { l: 44, r: 10, t: 10, b: 22 };
  const vals = rows.map((r) => (typeof key === 'function' ? key(r) : r[key]) ?? 0);
  const max = Math.max(1, ...vals);
  const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, rows.length - 1);
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const ticks = [0, 0.5, 1].map((f) => ({ v: max * f, y: y(max * f) }));
  const lab = (d) => d.slice(5).split('-').reverse().join('.');
  const xl = [0, Math.floor(rows.length / 2), rows.length - 1].filter((i, k, a) => a.indexOf(i) === k && rows[i]);
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  return `<div class="chart" data-vals='${JSON.stringify(vals)}' data-days='${JSON.stringify(rows.map((r) => r.day))}' data-fmt="${fmt === usd ? 'usd' : 'num'}">
    <svg viewBox="0 0 ${W} ${h}" role="img">
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${t.y}" y2="${t.y}" stroke="rgba(255,255,255,0.06)"/><text x="${pad.l - 6}" y="${t.y + 4}" fill="#7d8497" font-size="11" text-anchor="end" font-family="IBM Plex Mono">${esc(fmt(t.v))}</text>`).join('')}
      <polygon points="${pad.l},${y(0)} ${pts.join(' ')} ${x(rows.length - 1)},${y(0)}" fill="url(#${id})"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${xl.map((i) => `<text x="${x(i)}" y="${h - 4}" fill="#7d8497" font-size="11" text-anchor="${i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}" font-family="IBM Plex Mono">${lab(rows[i].day)}</text>`).join('')}
      <line class="xh" x1="0" x2="0" y1="${pad.t}" y2="${h - pad.b}" stroke="rgba(255,255,255,0.35)" stroke-dasharray="3 3" visibility="hidden"/>
      <circle class="dot" r="4.5" fill="${color}" stroke="#0d0f18" stroke-width="2" visibility="hidden"/>
      <rect class="hit" x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${h}" fill="transparent" data-l="${pad.l}" data-w="${W - pad.l - pad.r}" data-max="${max}" data-t="${pad.t}" data-ph="${h - pad.t - pad.b}" data-vw="${W}"/>
    </svg></div>`;
}

// Deposits and cash-outs side by side per day (blue / orange, CVD-safe), with a legend and tooltips.
function pairChart(rows, h = 170) {
  const W = 640;
  const pad = { l: 52, r: 10, t: 10, b: 22 };
  const max = Math.max(1, ...rows.flatMap((r) => [r.dep, r.wd]));
  const bw = (W - pad.l - pad.r) / rows.length;
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const base = y(0);
  const bar = (x, v, c, tip) => (v > 0 ? `<path d="M${x},${base} V${Math.min(base - 1, y(v) + 2)} q0,-2 2,-2 h${Math.max(0.5, bw * 0.36 - 4)} q2,0 2,2 V${base} Z" fill="${c}" data-tip="${esc(tip)}"/>` : '');
  const ticks = [0, 0.5, 1].map((f) => ({ v: max * f, y: y(max * f) }));
  return `<div class="legend"><span><i style="background:var(--dep)"></i>Депозити</span><span><i style="background:var(--wd)"></i>Виводи</span></div>
    <div class="chart tipped"><svg viewBox="0 0 ${W} ${h}">
    ${ticks.map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${t.y}" y2="${t.y}" stroke="rgba(255,255,255,0.06)"/><text x="${pad.l - 6}" y="${t.y + 4}" fill="#7d8497" font-size="11" text-anchor="end" font-family="IBM Plex Mono">${usd(t.v, 0)}</text>`).join('')}
    ${rows
      .map((r, i) => {
        const x0 = pad.l + i * bw + bw * 0.12;
        const tip = `${r.day}: депозити ${usd(r.dep)} · виводи ${usd(r.wd)}`;
        return `<rect x="${pad.l + i * bw}" y="0" width="${bw}" height="${h}" fill="transparent" data-tip="${esc(tip)}"/>${bar(x0, r.dep, 'var(--dep)', tip)}${bar(x0 + bw * 0.38, r.wd, 'var(--wd)', tip)}`;
      })
      .join('')}
    <text x="${pad.l}" y="${h - 4}" fill="#7d8497" font-size="11" font-family="IBM Plex Mono">${rows[0]?.day.slice(5).split('-').reverse().join('.') ?? ''}</text>
    <text x="${W - pad.r}" y="${h - 4}" fill="#7d8497" font-size="11" text-anchor="end" font-family="IBM Plex Mono">${rows.at(-1)?.day.slice(5).split('-').reverse().join('.') ?? ''}</text>
    </svg></div>`;
}

// online by the hour (last 72 h): columns
function hourChart(hours, h = 150) {
  const W = 640;
  const pad = { l: 34, r: 10, t: 10, b: 22 };
  if (!hours.length) return '<p class="mut">Ще немає замірів (сервер пише їх щохвилини).</p>';
  const max = Math.max(1, ...hours.map((x) => x.n));
  const bw = (W - pad.l - pad.r) / hours.length;
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  return `<div class="chart tipped"><svg viewBox="0 0 ${W} ${h}">
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(max)}" y2="${y(max)}" stroke="rgba(255,255,255,0.06)"/><text x="${pad.l - 6}" y="${y(max) + 4}" fill="#7d8497" font-size="11" text-anchor="end" font-family="IBM Plex Mono">${max}</text>
    <text x="${pad.l - 6}" y="${y(0) + 4}" fill="#7d8497" font-size="11" text-anchor="end" font-family="IBM Plex Mono">0</text>
    ${hours
      .map((x, i) => {
        const tip = `${new Date(x.h).toLocaleString(LOCALE[lang], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}: пік ${x.n} онлайн`;
        return `<rect x="${pad.l + i * bw}" y="0" width="${bw}" height="${h}" fill="transparent" data-tip="${esc(tip)}"/>${x.n ? `<rect x="${pad.l + i * bw + 1}" y="${y(x.n)}" width="${Math.max(1, bw - 2)}" height="${y(0) - y(x.n)}" rx="2" fill="var(--s1)" data-tip="${esc(tip)}"/>` : ''}`;
      })
      .join('')}
    </svg></div>`;
}

function hbars(rows, fmt = num) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return `<div class="bars">${rows.map((r) => `<div class="bar" title="${esc(r.tip ?? '')}"><span class="lab">${esc(r.label)}</span><span class="trk"><span class="fill" style="width:${(r.v / max) * 100}%;${r.color ? `background:${r.color}` : ''}"></span></span><span class="val">${esc(fmt(r.v))}${r.extra ? ` <span class="mut">${esc(r.extra)}</span>` : ''}</span></div>`).join('')}</div>`;
}

const tile = (label, value, sub = '', hl = false) => `<div class="tile${hl ? ' hl' : ''}"><small>${esc(label)}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
const card = (title, body, sub = '') => `<div class="card"><h3>${esc(title)}${sub ? `<small>${sub}</small>` : ''}</h3>${body}</div>`;
const table = (head, rows) => `<div class="tbl"><table><thead><tr>${head.map((h) => `<th${h.startsWith('>') ? ' class="r"' : ''}>${esc(h.replace(/^>/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="mut">Поки порожньо</td></tr>`}</tbody></table></div>`;

// ------------------------------------------------------------ views
const TABS = [
  ['over', 'Огляд'],
  ['players', 'Гравці'],
  ['matches', 'Матчі й режими'],
  ['shop', 'Покупки'],
  ['chain', 'Ончейн'],
  ['sys', 'Система'],
];
let tab = (() => {
  try {
    return sessionStorage.getItem('darkbags.adminTab') || 'over';
  } catch {
    return 'over';
  }
})();
let D = null;

function overview() {
  const p = D.players;
  const m = D.matches.totals;
  const c = D.chain;
  const shopTotal = Object.values(D.shop.kinds).reduce((n, k) => n + k.cents, 0);
  const days = D.days.slice(-30);
  return `
  <section><h2>Зараз</h2><div class="tiles">
    ${tile('Онлайн зараз', num(D.live.online), `${num(D.live.signedIn)} з гаманцем · ${num(D.live.inRooms)} у кімнатах`, true)}
    ${tile('Пік онлайну', num(D.live.peak.n), D.live.peak.at ? dt(D.live.peak.at) : '')}
    ${tile('Активні столи', num(D.live.tables.length), `${num(D.live.tables.filter((t) => t.state === 'live').length)} матчів іде`)}
    ${tile('Джекпоти столів', usd(D.live.jackpots), 'на золоті рейди')}
  </div></section>
  <section><h2>Головне</h2><div class="tiles">
    ${tile('Гравців з гаманцем', num(p.wallets), `${num(p.visitors)} відвідувачів усього`, true)}
    ${tile('Активні за 24 год', num(p.active.d1), `7 д: ${num(p.active.d7)} · 30 д: ${num(p.active.d30)}`)}
    ${tile('Нові за 24 год', num(p.fresh.d1), `за 7 д: ${num(p.fresh.d7)}`)}
    ${tile('Ігор зіграно', num(m.raids), `${num(m.humans)} місць гравців`, true)}
    ${tile('Обсяг ставок', usd(m.stakes), `виплачено ${usd(m.paid)}`)}
    ${tile('Комісія гри (рейк)', usd(m.rake), `${pct(m.rake, m.stakes)} від ставок`, true)}
    ${tile('Покупки в магазині', cents(shopTotal), `${num(Object.values(D.shop.kinds).reduce((n, k) => n + k.n, 0))} покупок`)}
    ${tile('Фортуна: банк', usd(D.fortune.pool), `до ${usd(D.fortune.mark)} · ${num(D.fortune.spins)} обертів`)}
    ${c ? tile('Депозити', usd(c.deposits.total.mills), `${num(c.deposits.n)} шт · ${num(c.deposits.depositors)} гаманців`, true) : ''}
    ${c ? tile('Виводи', usd(c.withdrawals.sent.mills), `${num(c.withdrawals.byStatus.sent ?? 0)} надіслано`) : ''}
    ${c ? tile('Борг гравцям', usd(c.liabilities.mills), 'баланси в грі') : ''}
    ${c && c.coverage != null ? tile('Покриття хаусу', `<span class="${c.coverage >= 0 ? 'ok' : 'bad'}">${usd(c.coverage)}</span>`, 'ончейн мінус борг') : ''}
  </div></section>
  <section><h2>30 днів</h2><div class="grid2">
    ${card('Активні гравці за день', lineChart(days, { key: 'active' }))}
    ${card('Ігор за день', lineChart(days, { key: 'raids' }))}
    ${card('Дохід гри за день (рейк + магазин)', lineChart(days, { key: (r) => r.rake + r.shop * 10, fmt: usd }))}
    ${c ? card('Депозити та виводи', pairChart(days)) : card('Нові гравці за день', lineChart(days, { key: 'fresh' }))}
  </div></section>
  <section><h2>Популярні режими</h2><div class="card">${hbars(D.matches.modes.filter((x) => x.raids).map((x) => ({ label: MODE_UK[x.id] ?? x.id, v: x.raids, extra: pct(x.raids, m.raids) })))}${m.raids ? '' : '<p class="mut">Ще не зіграно жодного онлайн-матчу.</p>'}</div></section>`;
}

function players() {
  const p = D.players;
  const ranks = Object.entries(p.rankDist).map(([r, n]) => ({ label: `Ранг ${r}`, v: n, r: +r })).sort((a, b) => a.r - b.r);
  return `
  <section><h2>Гравці</h2><div class="tiles">
    ${tile('З гаманцем', num(p.wallets), 'увійшли на мейнеті', true)}
    ${tile('Відвідувачі', num(p.visitors), 'усі, хто відкривав гру')}
    ${tile('Профілі', num(p.profiles), 'у списку гравців')}
    ${tile('З рангом', num(p.ranked), 'зіграли хоч раз')}
    ${tile('Активні 24 год / 7 д / 30 д', `${num(p.active.d1)} / ${num(p.active.d7)} / ${num(p.active.d30)}`)}
    ${tile('Гільдії', num(p.guilds))}
    ${tile('Запрошені за рефкодом', num(D.referrals.invited), `${num(D.referrals.inviters)} запрошувачів · ${cents(D.referrals.earned)} зароблено`)}
    ${tile('На перевірці fair play', `<span class="${p.flagged.length ? 'warn' : 'ok'}">${num(p.flagged.length)}</span>`, 'виводи заморожено')}
  </div></section>
  <section><div class="grid2">
    ${card('Нові гравці за день', lineChart(D.days.slice(-30), { key: 'fresh' }))}
    ${card('Нові гаманці за день', lineChart(D.days.slice(-30), { key: 'wallets' }))}
  </div></section>
  <section><div class="grid2">
    ${card('Топ-10 за досвідом', table(['#', 'Гравець', '>Ранг', '>XP', '>Матчів'], p.top.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td class="r">${x.rank}</td><td class="r">${num(x.xp)}</td><td class="r">${num(x.raids)}</td></tr>`)))}
    ${card('Ранги гравців', ranks.length ? hbars(ranks) : '<p class="mut">Поки порожньо</p>')}
  </div></section>
  <section>${card('Кар’єра всіх гравців разом', `<div class="tiles">${CAREER.map(([k, l, f]) => tile(l, f ? f(p.career[k] ?? 0) : num(p.career[k] ?? 0))).join('')}</div>`)}</section>
  ${p.flagged.length ? `<section>${card('Fair play: на перевірці', table(['Гравець', 'Акаунт', 'Причина', 'Коли'], p.flagged.map((f) => `<tr><td>${esc(f.name)}</td><td class="mono">${esc(short(f.key))}</td><td>${esc(f.why)}</td><td>${dt(f.at)}</td></tr>`)))}</section>` : ''}`;
}

function matches() {
  const m = D.matches;
  const t = m.totals;
  return `
  <section><h2>Матчі</h2><div class="tiles">
    ${tile('Ігор зіграно', num(t.raids), '', true)}
    ${tile('Місць гравців', num(t.humans), t.raids ? `≈ ${(t.humans / t.raids).toFixed(1)} на матч` : '')}
    ${tile('Обсяг ставок', usd(t.stakes))}
    ${tile('Виплачено гравцям', usd(t.paid))}
    ${tile('Комісія гри (рейк)', usd(t.rake), pct(t.rake, t.stakes), true)}
    ${tile('Час у матчах', dur(t.seconds), t.raids ? `≈ ${dur(t.seconds / t.raids)} на матч` : '')}
  </div></section>
  <section><div class="grid2">
    ${card('Ігор за день', lineChart(D.days.slice(-30), { key: 'raids' }))}
    ${card('Ставки за день', lineChart(D.days.slice(-30), { key: 'stakes', fmt: usd }))}
  </div></section>
  <section>${card(
    'Режими',
    table(
      ['Режим', '>Ігор', '>Частка', '>Гравців', '>Ставки', '>Рейк', '>Сер. тривалість', 'Остання'],
      m.modes.map((x) => `<tr><td>${esc(MODE_UK[x.id] ?? x.id)}</td><td class="r">${num(x.raids)}</td><td class="r">${pct(x.raids, t.raids)}</td><td class="r">${num(x.humans)}</td><td class="r">${usd(x.stakes)}</td><td class="r">${usd(x.rake)}</td><td class="r">${x.raids ? dur(x.seconds / x.raids) : '—'}</td><td class="mut">${ago(x.last)}</td></tr>`),
    ),
  )}</section>
  <section><div class="grid2">
    ${card('Популярні ставки', m.stakes.length ? hbars(m.stakes.slice(0, 10).map((s) => ({ label: usd(s.stake), v: s.n }))) : '<p class="mut">Поки порожньо</p>')}
    ${card('Столи зараз', table(['Режим', '>Ставка', 'Стан', '>Гравців'], D.live.tables.map((x) => `<tr><td>${esc(MODE_UK[x.mode] ?? x.mode)}</td><td class="r">${usd(x.stake)}</td><td>${x.state === 'live' ? '<span class="ok">● бій</span>' : esc(x.state)}</td><td class="r">${num(x.watching)}</td></tr>`)))}
  </div></section>
  <section>${card('Останні матчі', table(['Коли', 'Режим', '>Ставка', '>Гравців', '>Банк', '>Виплачено', '>Рейк'], m.recent.map((r) => `<tr><td>${dt(r.at)}</td><td>${esc(MODE_UK[r.mode] ?? r.mode)}${r.golden ? ' <span class="warn">★</span>' : ''}</td><td class="r">${usd(r.stake)}</td><td class="r">${r.humans}</td><td class="r">${usd(r.stakes)}</td><td class="r">${usd(r.paid)}</td><td class="r">${usd(r.rake)}</td></tr>`)))}</section>`;
}

function shop() {
  const s = D.shop;
  const f = D.fortune;
  const kinds = Object.entries(s.kinds);
  const total = kinds.reduce((n, [, k]) => n + k.cents, 0);
  const minted = Object.entries(s.minted ?? {}).filter(([, v]) => v.minted > 0);
  return `
  <section><h2>Покупки</h2><div class="tiles">
    ${tile('Усього покупок', cents(total), `${num(kinds.reduce((n, [, k]) => n + k.n, 0))} шт`, true)}
    ${kinds.map(([k, v]) => tile(KIND_UK[k] ?? k, cents(v.cents), `${num(v.n)} шт`)).join('')}
    ${tile('Куплено shop $ за USDC/USDT', cents(s.bought), 'реальні гроші', true)}
    ${tile('Витрачено shop $', cents(s.spent), 'сумки, пропуск')}
    ${tile('Залишок shop $ у гравців', cents(s.credit), 'не виводиться')}
    ${tile('Покупців', num(s.buyers))}
    ${tile('Відкрито сумок', num(s.opened))}
    ${tile('Скінів у власності', num(s.skins), `зброя: ${num(s.wskins)}`)}
    ${tile('Преміум-пропусків', num(s.passes), 'цього сезону')}
  </div></section>
  <section><div class="grid2">
    ${card('Покупки за день', lineChart(D.days.slice(-30), { key: (r) => r.shop * 10, fmt: usd }))}
    ${card('Топ товарів', s.items.length ? hbars(s.items.map((i) => ({ label: itemName(i.id), v: i.cents, extra: `${i.n} шт` })), cents) : '<p class="mut">Поки порожньо</p>')}
  </div></section>
  <section><h2>Колесо фортуни</h2><div class="tiles">
    ${tile('Банк зараз', usd(f.pool), `виплата на ${usd(f.mark)}`, true)}
    ${tile('Обертів', num(f.spins))}
    ${tile('Прийнято', usd(f.taken))}
    ${tile('Виплачено джекпотами', usd(f.paid))}
    ${tile('Чистий дохід колеса', `<span class="ok">${usd(f.taken - f.paid)}</span>`, pct(f.taken - f.paid, f.taken), true)}
  </div>
  <div class="card" style="margin-top:12px">${table(['Коли', 'Гравець', '>Виграш', 'Монета'], f.wins.map((w) => `<tr><td>${dt(w.at)}</td><td>${esc(w.name)}</td><td class="r">${usd(w.mills)}</td><td>${esc(w.asset)}</td></tr>`))}</div></section>
  ${minted.length ? `<section>${card('Лімітовані скіни', table(['Скін', '>Видано', '>З'], minted.map(([id, v]) => `<tr><td>${esc(id)}</td><td class="r">${v.minted}</td><td class="r">${v.of}</td></tr>`)))}</section>` : ''}`;
}

function basketTable(b) {
  if (!b) return '<p class="mut">—</p>';
  if (b.error) return `<p class="bad">Не вдалося прочитати: ${esc(b.error)}</p>`;
  return table(['Монета', '>Кількість', '>У $'], b.rows.map((r) => `<tr><td>${esc(r.symbol)}</td><td class="r">${units(r.units, r.decimals)}</td><td class="r">${r.mills == null ? '<span class="mut">без ціни</span>' : usd(r.mills)}</td></tr>`)) + `<p class="note">Разом: <b>${usd(b.mills)}</b>${b.unpriced ? ' (без монет без ціни)' : ''}</p>`;
}

function chain() {
  const c = D.chain;
  if (!c) return `<section>${card('Ончейн', '<p class="mut">Цей сервер працює на тестових токенах (CHAIN не задано): ончейн-даних немає.</p>')}</section>`;
  const o = D.onchain;
  const link = (a) => `<a href="${esc(c.explorer)}/contract/${esc(a)}" target="_blank" rel="noopener" class="addr">${esc(a)}</a>`;
  const txl = (x) => (x.tx && /^0x/.test(x.tx) ? `<a href="${esc(c.explorer)}/tx/${esc(x.tx)}" target="_blank" rel="noopener">${esc(short(x.tx))}</a>` : '<span class="mut">—</span>');
  const st = (s) => (s === 'ok' || s === 'sent' ? `<span class="ok">${esc(s)}</span>` : s === 'review' || String(s).startsWith('held') ? `<span class="warn">${esc(s)}</span>` : s === 'failed' ? `<span class="bad">${esc(s)}</span>` : esc(s));
  return `
  <section><h2>Каса · ${esc(D.network)}</h2><div class="tiles">
    ${tile('Депозити', usd(c.deposits.total.mills), `${num(c.deposits.n)} шт · ${num(c.deposits.depositors)} гаманців`, true)}
    ${tile('Виводи (надіслано)', usd(c.withdrawals.sent.mills), `${num(c.withdrawals.byStatus.sent ?? 0)} шт · ${num(c.withdrawals.withdrawers)} гаманців`)}
    ${tile('Чистий приплив', usd(c.deposits.total.mills - c.withdrawals.sent.mills), 'депозити мінус виводи', true)}
    ${tile('Борг гравцям', usd(c.liabilities.mills), 'баланси в грі')}
    ${tile('Хаус ончейн', o?.house?.rows ? usd(o.house.mills) : '—', 'оновлюється раз на хвилину')}
    ${tile('Покриття', c.coverage != null ? `<span class="${c.coverage >= 0 ? 'ok' : 'bad'}">${usd(c.coverage)}</span>` : '—', 'хаус мінус борг', true)}
    ${tile('Гаманець фортуни', o?.fortune?.rows ? usd(o.fortune.mills) : '—', c.fortuneWallet ? 'на джекпоти' : 'не задано')}
    ${tile('На ручній перевірці', `<span class="${c.withdrawals.review.length ? 'warn' : 'ok'}">${num(c.withdrawals.review.length)}</span>`, 'виводи review')}
    ${tile('Затримані депозити', num(c.deposits.held), 'ліміти / allowlist')}
    ${tile('Активних сесій', num(c.sessions))}
  </div></section>
  <section>${card('Депозити та виводи за день', pairChart(D.days.slice(-30)))}</section>
  <section><div class="grid2">
    ${card('Хаус-гаманець', `<p>${link(c.house)}</p>${basketTable(o?.house)}`)}
    ${card('Борг гравцям по монетах', basketTable(c.liabilities))}
    ${card('Усього депозитів по монетах', basketTable(c.deposits.total))}
    ${card('Усього виводів по монетах', basketTable(c.withdrawals.sent))}
    ${c.fortuneWallet ? card('Гаманець фортуни', `<p>${link(c.fortuneWallet)}</p>${basketTable(o?.fortune)}`) : ''}
    ${card('Налаштування каси', `<div class="tbl"><table><tbody>
      <tr><td>Пауза</td><td class="r">${c.paused ? '<span class="warn">так</span>' : '<span class="ok">ні</span>'}</td></tr>
      <tr><td>Закрита бета (allowlist)</td><td class="r">${c.beta ? `так · ${c.allowlist} адрес` : 'ні'}</td></tr>
      <tr><td>Ліміт на гравця</td><td class="r">${c.maxBalanceUsd ? `$${c.maxBalanceUsd}` : '—'}</td></tr>
      <tr><td>Ліміт на всю гру</td><td class="r">${c.maxTotalUsd ? `$${c.maxTotalUsd}` : '—'}</td></tr>
      <tr><td>Мінімальний вивід</td><td class="r">$${c.minWithdrawUsd}</td></tr>
      <tr><td>Депозити</td><td class="r">${esc(c.routes.join(' + '))}</td></tr>
      <tr><td>Виводи</td><td class="r">${esc(Object.entries(c.cashOut).filter(([, v]) => v).map(([k]) => k).join(' + ') || 'вимкнено')}</td></tr>
      <tr><td>Gasless (paymaster)</td><td class="r">${c.paymaster ? 'так' : 'ні'}</td></tr>
      <tr><td>Імпортовано монет</td><td class="r">${c.imported}</td></tr>
    </tbody></table></div>`)}
  </div></section>
  <section>${card('Ціни монет', table(['Монета', '>Ціна'], c.tokens.map((t) => `<tr><td>${esc(t.symbol)}</td><td class="r">${t.usd == null ? '<span class="mut">немає</span>' : `$${nf.format(t.usd)}`}</td></tr>`)))}</section>
  ${c.withdrawals.review.length ? `<section>${card('Виводи на ручній перевірці', table(['Коли', 'Гаманець', 'Монета', '>Сума', '>$'], c.withdrawals.review.map((x) => `<tr><td>${dt(x.at)}</td><td class="mono">${esc(short(x.account))}</td><td>${esc(x.symbol)}</td><td class="r">${units(x.units, x.decimals)}</td><td class="r">${usd(x.mills)}</td></tr>`)))}</section>` : ''}
  <section>${card('Останні транзакції', table(['Коли', 'Тип', 'Гаманець', 'Монета', '>Сума', '>$', 'Статус', 'Tx'], c.recent.map((x) => `<tr><td>${dt(x.at)}</td><td>${x.kind === 'deposit' ? '⬇ депозит' : '⬆ вивід'}</td><td class="mono">${esc(short(x.account))}</td><td>${esc(x.symbol)}</td><td class="r">${units(x.units, x.decimals)}</td><td class="r">${usd(x.mills)}</td><td>${st(x.status)}</td><td class="mono">${txl(x)}</td></tr>`)))}</section>`;
}

function sys() {
  const g = D.game;
  return `
  <section><h2>Онлайн по годинах (72 год)</h2>${card('Пік онлайну за годину', hourChart(D.live.hours))}</section>
  <section><h2>Система</h2><div class="tiles">
    ${tile('Мережа', esc(D.network), '', true)}
    ${tile('Перший коміт гри', dt(g.born))}
    ${tile('Статистика з', dt(g.statsSince))}
    ${tile('Сервер працює', dur((D.at - g.serverUp) / 1000), `з ${dt(g.serverUp)}`)}
    ${tile('Перезапусків', num(g.boots))}
    ${tile('Версія', esc(g.commit ?? '—'), esc(g.node))}
    ${tile('Пам’ять', `${num(g.memMb)} МБ`)}
    ${tile('Розсилок у пошті', num(D.mail.broadcasts), `${num(D.mail.boxes)} скриньок`)}
    ${tile('Рефкодів', num(D.referrals.codes))}
    ${tile('Зависання сервера', `<span class="${(D.stalls ?? []).some((x) => x.ms > 500) ? 'bad' : (D.stalls ?? []).length ? 'warn' : 'ok'}">${num((D.stalls ?? []).length)}</span>`, 'паузи понад 150 мс з запуску')}
  </div></section>
  ${D.regions ? `<section>${card('Регіони', table(['Регіон', 'Адреса', '>У грі зараз ($)'], D.regions.list.map((r) => `<tr><td>${esc(r.id.toUpperCase())}</td><td class="mono">${esc(r.url ?? 'головний сервер')}</td><td class="r">${r.url ? usd(D.regions.pots[r.id]?.mills ?? 0) : '—'}</td></tr>`)) + `<p class="note">Незакритих квитків на ставку: ${num(D.regions.pending)}</p>`)}</section>` : ''}
  <section>${card('Помилки в браузерах гравців', table(['Коли', 'Гравець', 'Де', 'Режим', 'Помилка'], (D.clientErrors ?? []).map((x) => `<tr><td>${dt(x.at)}</td><td>${esc(x.name)}</td><td>${esc(x.where)}</td><td>${esc(x.mode ?? 'лобі')}</td><td title="${esc(x.st + '\n' + x.ua)}" style="white-space:normal;max-width:520px">${esc(x.m)}</td></tr>`)))}</section>
  <section>${card('Зависання сервера (гра стоїть у всіх)', table(['Коли', '>Тривалість', 'Що працювало'], (D.stalls ?? []).map((x) => `<tr><td>${dt(x.at)}</td><td class="r ${x.ms > 500 ? 'bad' : 'warn'}">${num(x.ms)} мс</td><td>${esc(x.during.join(', ') || 'невідомо')}</td></tr>`)))}</section>`;
}

const VIEWS = { over: overview, players, matches, shop, chain, sys };

function langPicker() {
  return `<span class="pill langs" role="group" aria-label="Language">${ADMIN_LANGS.map(([id, label]) => `<button type="button" data-lang="${id}" class="${id === lang ? 'on' : ''}">${label}</button>`).join('')}</span>`;
}
function wireLang() {
  for (const b of document.querySelectorAll('[data-lang]'))
    b.onclick = () => {
      if (b.dataset.lang === lang) return;
      try {
        localStorage.setItem('darkbags.adminLang', b.dataset.lang);
      } catch {}
      location.reload();
    };
}

function render() {
  $('tabs').innerHTML = TABS.map(([id, l]) => `<button type="button" data-t="${id}" class="${id === tab ? 'on' : ''}">${l}</button>`).join('');
  for (const b of $('tabs').querySelectorAll('button'))
    b.onclick = () => {
      tab = b.dataset.t;
      try {
        sessionStorage.setItem('darkbags.adminTab', tab);
      } catch {}
      render();
    };
  $('view').innerHTML = VIEWS[tab]();
  $('meta').innerHTML = `<span class="pill net${D.network === 'mainnet' ? '' : ' test'}">${esc(D.network)}</span><span class="pill"><span class="dot"></span>${num(D.live.online)} онлайн</span><span class="pill">оновлено ${new Date(D.at).toLocaleTimeString(LOCALE[lang])}</span>${langPicker()}`;
  localize($('app'), lang);
  localize($('meta'), lang);
  wireLang();
  wire();
}

// hover: a crosshair on the line charts, a tooltip on every column
function wire() {
  for (const ch of document.querySelectorAll('.chart')) {
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    ch.append(tip);
    const svg = ch.querySelector('svg');
    const show = (html, px, py) => {
      tip.innerHTML = html;
      tip.hidden = false;
      const r = ch.getBoundingClientRect();
      tip.style.left = `${Math.min(r.width - 70, Math.max(70, px))}px`;
      tip.style.top = `${py}px`;
    };
    const hit = svg.querySelector('.hit');
    if (hit) {
      const vals = JSON.parse(ch.dataset.vals);
      const days = JSON.parse(ch.dataset.days);
      const fmt = ch.dataset.fmt === 'usd' ? usd : num;
      const L = +hit.dataset.l, Wd = +hit.dataset.w, max = +hit.dataset.max, T = +hit.dataset.t, PH = +hit.dataset.ph, VW = +hit.dataset.vw;
      const xh = svg.querySelector('.xh');
      const dot = svg.querySelector('.dot');
      svg.addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect();
        const sx = ((e.clientX - r.left) / r.width) * VW;
        const i = Math.max(0, Math.min(vals.length - 1, Math.round(((sx - L) / Wd) * (vals.length - 1))));
        const x = L + (i * Wd) / Math.max(1, vals.length - 1);
        const y = T + PH * (1 - vals[i] / max);
        xh.setAttribute('x1', x);
        xh.setAttribute('x2', x);
        xh.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        dot.setAttribute('visibility', 'visible');
        show(`${days[i].split('-').reverse().join('.')}: <b>${fmt(vals[i])}</b>`, (x / VW) * r.width, (y / VW) * r.width - 6);
      });
      svg.addEventListener('pointerleave', () => {
        tip.hidden = true;
        xh.setAttribute('visibility', 'hidden');
        dot.setAttribute('visibility', 'hidden');
      });
    } else {
      svg.addEventListener('pointermove', (e) => {
        const t = e.target.closest('[data-tip]');
        if (!t) return void (tip.hidden = true);
        const r = ch.getBoundingClientRect();
        show(esc(tr(t.dataset.tip, lang)), e.clientX - r.left, e.clientY - r.top - 6);
      });
      svg.addEventListener('pointerleave', () => (tip.hidden = true));
    }
  }
}

// the game's age, ticking
function tick() {
  if (!D) return;
  const s = Math.max(0, Math.floor((Date.now() - D.game.born) / 1000));
  const d = Math.floor(s / 86400);
  const p2 = (n) => String(n).padStart(2, '0');
  $('age').innerHTML = `${d}<i>${tr('д', lang)}</i>${p2(Math.floor((s % 86400) / 3600))}<i>${tr('год', lang)}</i>${p2(Math.floor((s % 3600) / 60))}<i>${tr('хв', lang)}</i>${p2(s % 60)}<i>${tr('с', lang)}</i>`;
}

function gate(kind) {
  $('app').hidden = true;
  $('gate').hidden = false;
  $('gate').innerHTML =
    kind === 'forbidden'
      ? `<h2>Доступ закрито</h2><p>Ця сторінка відкривається лише двом адмін-гаманцям. Увійдіть у гру одним із них (у цьому ж браузері), потім поверніться сюди.</p><p><a class="cta" href="/">До гри</a></p><p class="note">${token ? 'Сесію знайдено, але гаманець не адмінський або вхід застарів.' : 'У цьому браузері ще немає сесії гри.'}</p>`
      : `<h2>Сервер не відповів</h2><p>Спробуйте ще раз за хвилину.</p><p><button type="button" class="cta" id="retry">Оновити</button></p>`;
  $('retry')?.addEventListener('click', load);
  $('gate').insertAdjacentHTML('beforeend', `<p>${langPicker()}</p>`);
  localize($('gate'), lang);
  wireLang();
}

async function load() {
  try {
    const headers = {};
    if (token) headers['x-darkbags-session'] = token;
    if (adminKey) headers['x-admin-key'] = adminKey;
    const r = await fetch('/api/admin/stats', { headers, cache: 'no-store' });
    if (r.status === 403) return gate('forbidden');
    if (!r.ok) throw new Error(String(r.status));
    D = await r.json();
    $('gate').hidden = true;
    $('app').hidden = false;
    // keep the scroll and the open tab while the numbers refresh
    const y = scrollY;
    render();
    scrollTo(0, y);
    tick();
  } catch {
    if (!D) gate('down');
  }
}

// the static header and the tab title, once
localize(document.querySelector('header.top'), lang);
document.title = tr(document.title, lang);
load();
setInterval(load, 30_000);
setInterval(tick, 1000);
