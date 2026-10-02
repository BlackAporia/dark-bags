// Bring a coin to the table: a compact picker under the stake coins that searches the AVNU verified
// list and Ekubo's list and imports one. Once imported it can be deposited, staked and cashed out
// like any preset coin (the server prices it from Ekubo quotes).
import { esc } from './game.js';
import { t } from './i18n.js';

export function createCoinImport({ app, send, toast }) {
  const st = { open: false, list: null, q: '', busy: null };
  const on = () => app.mode === 'online' && !!app.chain;

  function attach(listEl) {
    if (!on() || !listEl) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'asset coin-add';
    b.innerHTML = `<span class="sym">＋ ${esc(t('coin.import'))}</span><span class="need">AVNU · Ekubo</span>`;
    b.addEventListener('click', () => {
      st.open = !st.open;
      if (st.open && !st.list) send({ t: 'coin_list' });
      paint();
    });
    listEl.append(b);
    let pop = document.getElementById('coin-pop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'coin-pop';
      pop.className = 'coin-pop';
      listEl.after(pop);
    }
    paint();
  }

  function paint() {
    const pop = document.getElementById('coin-pop');
    if (!pop) return;
    pop.hidden = !st.open;
    if (!st.open) return;
    const q = st.q.trim().toLowerCase();
    const rows = (st.list ?? []).filter((c) => !q || c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.address.includes(q)).slice(0, 30);
    pop.innerHTML = `<input id="coin-q" placeholder="${esc(t('coin.search'))}" value="${esc(st.q)}" autocomplete="off" spellcheck="false">
      <div class="coin-rows">${
        !st.list
          ? `<p class="fine">…</p>`
          : rows.length
            ? rows
                .map(
                  (c) => `<div class="coin-row">${c.logo && /^https:\/\//.test(c.logo) ? `<img alt="" src="${esc(c.logo)}" loading="lazy">` : '<span class="coin-dot"></span>'}<b>${esc(c.symbol)}</b><span class="fine">${esc(c.name)} · ${esc(c.src.join(' + '))}</span>${
                    c.added ? `<span class="coin-ok">✓ ${t('coin.added')}</span>` : `<button type="button" class="ghost" data-addr="${esc(c.address)}" ${st.busy ? 'disabled' : ''}>${st.busy === c.address ? '…' : t('coin.add')}</button>`
                  }</div>`,
                )
                .join('')
            : `<p class="fine">${t('coin.none')}</p>`
      }</div><p class="fine">${t('coin.note')}</p>`;
    const inp = document.getElementById('coin-q');
    inp.addEventListener('input', () => {
      st.q = inp.value;
      const pos = inp.selectionStart;
      paint();
      const again = document.getElementById('coin-q');
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    for (const b of pop.querySelectorAll('[data-addr]'))
      b.addEventListener('click', () => {
        st.busy = b.dataset.addr;
        send({ t: 'coin_import', address: b.dataset.addr });
        paint();
      });
  }

  function onMessage(m) {
    if (m.t === 'err' && st.busy) {
      st.busy = null;
      paint();
      return;
    }
    if (m.t !== 'coins') return;
    if (m.list) st.list = m.list;
    if (m.imported) {
      st.busy = null;
      const c = st.list?.find((x) => x.address === m.imported.id);
      if (c) c.added = true;
      toast(m.imported.priced ? t('coin.done', { s: m.imported.symbol }) : t('coin.noPrice', { s: m.imported.symbol }));
      app.asset = m.imported.id;
    }
    paint();
  }

  return { attach, onMessage };
}
