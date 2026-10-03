// Regions: the lobby, the wallet, the shop and everything else stay on the main server; a raid can
// be played on a match server near you (server/regions.js). This picks the region (the closest by
// ping unless you choose), opens the match server's socket when you sit at a table there, and
// routes the table's messages to it. Stakes: the main server takes them and signs a ticket.
import { WsTransport } from './net.js';
import { esc } from './game.js';
import { t } from './i18n.js';
import { store } from './store.js';

const $ = (id) => document.getElementById(id);
// what a table is made of: these go to the match server while you sit at one there
const ROOM_MSGS = new Set(['join', 'ready', 'unready', 'start', 'leave', 'in', 'watch', 'buy', 'upgrade', 'bluff', 'pick']);
const FLAG = { eu: '🇪🇺', us: '🇺🇸', asia: '🌏' };

export function createRegions({ app, mainSend, onMessage, toast, deviceId }) {
  const st = {
    list: null, // [{ id, url }] (url null: the main server itself)
    pick: store.get('darkbags.region', null), // null: the closest
    ping: {}, // id -> ms
    online: {}, // id -> players
    edge: null, // { region, url, transport, ok, queue: [] }
    readyMsg: null, // a Ready waiting for its stake ticket
    probing: false,
  };
  const here = () => st.list?.[0]?.id ?? 'eu';
  const current = () => {
    if (!st.list || st.list.length < 2) return here();
    if (st.pick && st.list.some((r) => r.id === st.pick)) return st.pick;
    // the closest one we have a ping for
    let best = here();
    let bestMs = st.ping[best] ?? Infinity;
    for (const r of st.list) if ((st.ping[r.id] ?? Infinity) < bestMs - 15) (best = r.id), (bestMs = st.ping[r.id]);
    return best;
  };
  const remote = () => app.mode === 'online' && current() !== here();
  const statsUrl = (r) => (r.url ? `${r.url}/api/stats` : '/api/stats');
  const wsUrl = (url) => `${url.replace(/^http/, 'ws')}/ws`;

  // ping and players in each region (the best of three tries, over plain HTTP)
  async function probe() {
    if (st.probing || !st.list || st.list.length < 2) return;
    st.probing = true;
    try {
      await Promise.all(
        st.list.map(async (r) => {
          let best = Infinity;
          for (let i = 0; i < 3; i++) {
            const t0 = performance.now();
            try {
              const res = await fetch(statsUrl(r), { cache: 'no-store', signal: AbortSignal.timeout(4000) });
              const ms = performance.now() - t0;
              if (res.ok) {
                const j = await res.json().catch(() => null);
                if (j?.online != null) st.online[r.id] = j.online;
                best = Math.min(best, ms);
              }
            } catch {
              /* that region did not answer */
            }
          }
          st.ping[r.id] = Number.isFinite(best) ? Math.round(best) : null;
        }),
      );
    } finally {
      st.probing = false;
    }
    render();
  }

  function setList(list) {
    st.list = Array.isArray(list) && list.length > 1 ? list : null;
    render();
    if (st.list) probe();
  }

  function render() {
    const box = $('regions');
    if (!box) return;
    box.hidden = !st.list || app.mode !== 'online';
    if (box.hidden) return;
    const cur = current();
    box.innerHTML = `<span class="eyebrow">${t('reg.title')}</span>${st.list
      .map((r) => {
        const ms = st.ping[r.id];
        const cls = ms == null ? '' : ms < 90 ? 'good' : ms < 180 ? 'ok' : 'bad';
        return `<button type="button" class="reg${r.id === cur ? ' on' : ''}" data-reg="${esc(r.id)}" ${app.inRoom ? 'disabled' : ''}>
          <span class="reg-n">${FLAG[r.id] ?? '🌐'} ${esc(t(`reg.${r.id}`) === `reg.${r.id}` ? r.id.toUpperCase() : t(`reg.${r.id}`))}</span>
          <span class="reg-m ${cls}">${ms == null ? '…' : `${ms} ms`}${st.online[r.id] != null ? ` · ${st.online[r.id]}` : ''}</span></button>`;
      })
      .join('')}<button type="button" class="reg auto${st.pick ? '' : ' on'}" data-reg="" ${app.inRoom ? 'disabled' : ''}>${t('reg.auto')}</button>`;
    for (const b of box.querySelectorAll('[data-reg]'))
      b.addEventListener('click', () => {
        st.pick = b.dataset.reg || null;
        store.set('darkbags.region', st.pick);
        render();
      });
  }

  // ------------------------------------------------------------ the match server

  function openEdge(region, url, ticket) {
    closeEdge();
    const e = { region, url, ticket, ok: false, queue: [] };
    st.edge = e;
    e.transport = new WsTransport(
      wsUrl(url),
      (m) => onEdge(e, m),
      (s) => {
        if (st.edge !== e) return;
        if (s === 'open') {
          // every (re)connect introduces itself again; a fresh ticket if the old one is stale
          e.ok = false;
          if (e.ticket) {
            e.transport.send({ t: 'hello', ticket: e.ticket, name: app.name, dev: deviceId() });
            e.ticket = null;
          } else mainSend({ t: 'edge_ticket', region });
        }
      },
    );
  }

  function closeEdge() {
    const e = st.edge;
    st.edge = null;
    st.readyMsg = null;
    try {
      e?.transport.close();
    } catch {
      /* gone already */
    }
  }

  function onEdge(e, m) {
    if (st.edge !== e) return;
    if (m.t === 'probe') return e.transport.send({ t: 'probe', s: m.s });
    if (m.t === 'ping') {
      app.ping = m.ms;
      return;
    }
    if (m.t === 'edge_ok') {
      e.ok = true;
      for (const q of e.queue.splice(0)) e.transport.send(q);
      return;
    }
    if (m.t === 'welcome' || m.t === 'tables' || m.t === 'chain' || m.t === 'balance') return; // the main server owns these
    if (m.t === 'err' && m.code === 'edge_ticket') {
      toast(m.msg);
      closeEdge();
      return;
    }
    // balances on a match server are only the stake: the real ones come from the main server
    if (m.balances) {
      m = { ...m };
      delete m.balances;
    }
    onMessage(m);
  }

  function edgeSend(m) {
    const e = st.edge;
    if (!e) return;
    if (e.ok) e.transport.send(m);
    else e.queue.push(m);
  }

  // the client's send: true when the message went to (or is waiting for) the match server
  function route(m) {
    if (!ROOM_MSGS.has(m.t)) return false;
    if (m.t === 'join') {
      if (!remote()) {
        closeEdge();
        return false;
      }
      const region = current();
      const r = st.list.find((x) => x.id === region);
      if (!st.edge || st.edge.region !== region) {
        openEdge(region, r.url, null);
        // the socket opens, asks the main server for an entry ticket, then says hello
      }
      edgeSend(m);
      return true;
    }
    if (!st.edge) return false;
    if (m.t === 'ready') {
      // the main server takes the stake and signs it; the match server escrows that
      st.readyMsg = m;
      mainSend({ t: 'stake_ticket', region: st.edge.region, mode: app.gameMode, stake: app.stake, asset: m.asset });
      return true;
    }
    edgeSend(m);
    if (m.t === 'leave') setTimeout(() => !app.inRoom && closeEdge(), 400);
    return true;
  }

  // the main server's answers about regions
  function onMain(m) {
    if (m.t === 'welcome') setList(m.regions);
    if (m.t === 'edge_ticket') {
      const e = st.edge;
      if (e && e.region === m.region) e.transport.send({ t: 'hello', ticket: m.ticket, name: app.name, dev: deviceId() });
      return true;
    }
    if (m.t === 'stake_ticket') {
      if (m.balances) app.balances = m.balances;
      const r = st.readyMsg;
      st.readyMsg = null;
      if (r && st.edge && st.edge.region === m.region) edgeSend({ ...r, ticket: m.ticket });
      return true;
    }
    if (m.t === 'err' && m.code === 'region') st.readyMsg = null;
    return false;
  }

  // the ready room: where this table is played, and a closer server if there is one
  function prepLine() {
    if (!st.list || app.mode !== 'online') return null;
    const id = st.edge?.region ?? current();
    const name = (r) => `${FLAG[r] ?? '🌐'} ${t(`reg.${r}`)}`;
    const ms = st.ping[id];
    let best = null;
    for (const r of st.list) if (st.ping[r.id] != null && (best === null || st.ping[r.id] < st.ping[best])) best = r.id;
    const hint = best && best !== id && ms != null && ms - st.ping[best] > 60 ? t('reg.closer', { r: name(best), ms: st.ping[best] }) : '';
    return `${t('reg.table', { r: name(id) })}${ms != null ? ` · <b class="${ms < 90 ? 'good' : ms < 180 ? 'ok' : 'bad'}">${ms} ms</b>` : ''}${hint ? `<br><span class="fine">${hint}</span>` : ''}`;
  }

  setInterval(() => app.mode === 'online' && !app.inRoom && !document.hidden && probe(), 30_000);
  return { route, onMain, render, remote, current, closeEdge, probe, prepLine, inEdge: () => !!st.edge };
}
