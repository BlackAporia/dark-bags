// Real-token mode in the browser: sign-in (Starknet wallets, Cartridge, Privy),
// deposits and cash-outs. Only active when the server says a chain is on; the
// wallet libraries load from vendor/wallets.js on first use.
import { store } from './store.js';
import { formatUnits, parseUnits } from '../shared/assets.js';
import { esc, fmt } from './game.js';

const $ = (id) => document.getElementById(id);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const norm = (a) => {
  try {
    return `0x${BigInt(a).toString(16).padStart(64, '0')}`;
  } catch {
    return null;
  }
};

// base: the game server's http(s) origin (the page may be a static build elsewhere)
export function createCashierUi({ app, send, toast, onChange, base }) {
  const cs = {
    chain: null,
    account: null,
    facade: null,
    kind: store.get('darkbags.walletKind', null), // 'extension:<name>' | 'cartridge' | 'privy'
    privyWallet: null,
    waiter: null, // resolves with the login challenge
    vendor: null,
    tab: 'deposit',
    depRoute: 'private',
    wdRoute: 'private',
  };

  const vendor = async () => {
    if (!cs.vendor) {
      setStatus('connect-status', 'Loading wallets…');
      const url = new URL('vendor/wallets.js', base).href; // runtime URL: stays out of the single-file build
      cs.vendor = await import(/* @vite-ignore */ url).catch((e) => {
        cs.vendor = null;
        throw new Error(`Could not load the wallet code (${e?.message ?? e}). Is vendor/wallets.js built?`);
      });
      setStatus('connect-status', '');
    }
    return cs.vendor;
  };
  const setStatus = (id, msg, bad = false) => {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('bad', bad);
  };
  const token = (id) => cs.chain?.tokens.find((t) => t.id === id);
  const ledger = (id) => BigInt(app.balances?.[id] ?? '0');

  // --------------------------------------------------------------- render

  function render() {
    const on = !!cs.chain && app.mode === 'online';
    $('cashier').hidden = !on;
    if (!on) return;
    $('acct-label').innerHTML = cs.account
      ? `<b>${esc(short(cs.account))}</b> <span class="unit">${esc(kindLabel())} · ${esc(cs.chain.network)}</span>`
      : `Real tokens on Starknet ${esc(cs.chain.network)}. Sign in to play.`;
    $('connect').hidden = !!cs.account;
    $('open-cashier').hidden = !cs.account;
    $('logout').hidden = !cs.account;
    $('fine').textContent = `Real tokens on Starknet ${cs.chain.network}. The house holds deposits until you cash out; cash-outs go only to the address you signed in with.`;
  }

  function kindLabel() {
    if (!cs.kind) return 'wallet';
    if (cs.kind === 'cartridge') return 'Cartridge';
    if (cs.kind === 'privy') return 'Privy';
    return cs.kind.replace(/^extension:/, '');
  }

  // --------------------------------------------------------------- sign in

  async function openConnect() {
    const d = $('dlg-connect');
    $('login-cartridge').hidden = !cs.chain.login.cartridge;
    $('login-privy').hidden = !cs.chain.login.privy;
    setStatus('connect-status', '');
    d.showModal();
    try {
      const v = await vendor();
      renderWallets(v.listWallets());
      v.onWalletsChanged((l) => d.open && renderWallets(l));
    } catch (e) {
      setStatus('connect-status', e.message, true);
    }
  }

  function renderWallets(list) {
    const box = $('wallet-list');
    if (!list.length) {
      box.innerHTML = '<p class="fine">No Starknet wallet found in this browser.</p>';
      return;
    }
    box.replaceChildren(
      ...list.map((w) => {
        const el = document.createElement(w.installed ? 'button' : 'a');
        el.className = `opt wallet ${w.installed ? '' : 'missing'}`;
        const icon = w.icon && /^data:image\/|^https:\/\//.test(w.icon) ? `<img src="${esc(w.icon)}" alt="">` : '<span class="noicon"></span>';
        el.innerHTML = `${icon}<span class="opt-name">${esc(w.name)}</span><span class="opt-sub">${w.installed ? 'installed' : 'get it'}</span>`;
        if (w.installed) {
          el.type = 'button';
          el.addEventListener('click', () => signInWith(`extension:${w.name}`, () => cs.vendor.connectExtension(w)));
        } else if (w.download) {
          el.href = w.download;
          el.target = '_blank';
          el.rel = 'noopener';
        }
        return el;
      }),
    );
  }

  // wallet facade → server challenge → signature → session bound to the address
  async function signInWith(kind, connect) {
    try {
      setStatus('connect-status', 'Waiting for the wallet…');
      const f = await connect();
      setStatus('connect-status', 'Sign the login message in your wallet (it costs nothing).');
      const td = await new Promise((resolve, reject) => {
        cs.waiter = { resolve, reject };
        send({ t: 'auth_start' });
        setTimeout(() => reject(new Error('The server did not answer.')), 15000);
      });
      const sig = await f.signTypedData(td);
      cs.facade = f;
      cs.kind = kind;
      send({ t: 'auth', address: f.address, signature: (Array.isArray(sig) ? sig : sig?.signature ?? []).map(String) });
    } catch (e) {
      setStatus('connect-status', friendly(e), true);
    } finally {
      cs.waiter = null;
    }
  }

  async function privySend() {
    const email = $('privy-email').value.trim();
    if (!/.+@.+\..+/.test(email)) return setStatus('connect-status', 'Type your email first.', true);
    try {
      const v = await vendor();
      setStatus('connect-status', 'Sending a code…');
      await v.privyAuth.sendCode(cs.chain.login.privy, email);
      $('privy-code-row').hidden = false;
      $('privy-code').focus();
      setStatus('connect-status', `Code sent to ${email}.`);
    } catch (e) {
      setStatus('connect-status', friendly(e), true);
    }
  }

  async function privyVerify() {
    try {
      const v = await vendor();
      setStatus('connect-status', 'Checking the code…');
      const tok = await v.privyAuth.loginWithCode(cs.chain.login.privy, $('privy-email').value.trim(), $('privy-code').value.trim());
      cs.kind = 'privy';
      send({ t: 'auth_privy', token: tok });
    } catch (e) {
      setStatus('connect-status', friendly(e), true);
    }
  }

  async function privyOAuth(provider) {
    try {
      const v = await vendor();
      store.set('darkbags.walletKind', 'privy');
      await v.privyAuth.startOAuth(cs.chain.login.privy, provider);
    } catch (e) {
      setStatus('connect-status', friendly(e), true);
    }
  }

  // back from Google/X/Discord with ?privy_oauth_code
  async function finishOAuth() {
    if (!new URLSearchParams(location.search).has('privy_oauth_code') || !cs.chain?.login.privy) return;
    try {
      const v = await vendor();
      const tok = await v.privyAuth.finishOAuth(cs.chain.login.privy);
      if (tok) {
        cs.kind = 'privy';
        send({ t: 'auth_privy', token: tok });
      }
    } catch (e) {
      toast(friendly(e));
    }
  }

  // after a reload the server still knows the session; the wallet object is gone
  async function ensureFacade() {
    if (cs.facade && norm(cs.facade.address) === cs.account) return cs.facade;
    const v = await vendor();
    let f;
    if (cs.kind === 'privy') {
      if (!cs.privyWallet) throw new Error('Sign in with Privy again.');
      f = await v.connectPrivy(cs.chain, app.token, cs.privyWallet, base);
    } else if (cs.kind === 'cartridge') f = await v.connectCartridge(cs.chain, app.token, base);
    else {
      const name = (cs.kind ?? '').replace(/^extension:/, '');
      const w = v.listWallets().find((x) => x.installed && x.name === name) ?? v.listWallets().find((x) => x.installed);
      if (!w) throw new Error('No wallet found. Sign in again.');
      f = await v.connectExtension(w);
    }
    if (norm(f.address) !== cs.account) throw new Error(`The wallet is on ${short(f.address)}, not ${short(cs.account)}. Switch accounts or sign in again.`);
    cs.facade = f;
    return f;
  }

  // ---------------------------------------------------------------- cashier

  function openCashier(tab = cs.tab) {
    $('cash-acct').textContent = `${short(cs.account)} · ${kindLabel()} · house ${short(cs.chain.house)}`;
    fillTokens('dep-token');
    fillTokens('wd-token');
    setTab(tab);
    setStatus('cash-status', '');
    $('dlg-cashier').showModal();
  }

  function fillTokens(id) {
    const sel = $(id);
    const cur = sel.value;
    sel.replaceChildren(
      ...cs.chain.tokens.map((t) => {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = id === 'wd-token' ? `${t.symbol} · ${formatUnits(ledger(t.id), t.decimals, 4)}` : t.symbol;
        return o;
      }),
    );
    if (cur && cs.chain.tokens.some((t) => t.id === cur)) sel.value = cur;
    else if (app.asset && token(app.asset)) sel.value = app.asset;
  }

  function setTab(tab) {
    cs.tab = tab;
    for (const b of document.querySelectorAll('#dlg-cashier [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    for (const p of document.querySelectorAll('#dlg-cashier [data-pane]')) p.hidden = p.dataset.pane !== tab;
    if (tab === 'history') send({ t: 'history' });
    renderRoutes();
  }

  function routes(kind) {
    const i = cs.chain;
    const out = [];
    // Cartridge and Privy accounts are not registered in the STRK20 pool
    const privateOk = !/^(cartridge|privy)$/.test(cs.kind ?? '') && (kind === 'deposit' ? i.routes.includes('private') : i.cashOut.private);
    if (privateOk) out.push({ id: 'private', label: 'Private · STRK20', sub: kind === 'deposit' ? 'from your shielded balance; nobody sees the amount' : 'into your shielded balance; your address must be registered in the pool' });
    if (kind === 'deposit' || i.cashOut.public) out.push({ id: 'public', label: 'Public transfer', sub: kind === 'deposit' ? 'a plain token transfer to the house' : 'a plain token transfer to your address' });
    return out;
  }

  function renderRoutes() {
    for (const [kind, box, key] of [
      ['deposit', 'dep-route', 'depRoute'],
      ['withdraw', 'wd-route', 'wdRoute'],
    ]) {
      const list = routes(kind);
      if (!list.some((r) => r.id === cs[key])) cs[key] = list[0]?.id ?? null;
      $(box).replaceChildren(
        ...list.map((r) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'opt route-opt';
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(cs[key] === r.id));
          b.innerHTML = `<span class="opt-name">${esc(r.label)}</span><span class="opt-sub">${esc(r.sub)}</span>`;
          b.addEventListener('click', () => {
            cs[key] = r.id;
            renderRoutes();
          });
          return b;
        }),
      );
    }
    $('wd-go').disabled = !cs.wdRoute;
    $('wd-hint').textContent = cs.wdRoute ? `Minimum $${cs.chain.minWithdrawUsd ?? 1}. Paid to ${short(cs.account)}.` : 'Cash-outs are switched off on this server right now.';
    $('dep-hint').textContent = cs.depRoute === 'private' ? 'Your wallet builds a zero-knowledge proof; that can take a minute.' : 'Your balance updates once the transfer is accepted on Starknet.';
  }

  async function deposit() {
    const t = token($('dep-token').value);
    const units = t && parseUnits($('dep-amount').value, t.decimals);
    if (!units) return setStatus('cash-status', 'Type an amount.', true);
    $('dep-go').disabled = true;
    try {
      const f = await ensureFacade();
      setStatus('cash-status', 'Confirm the deposit in your wallet…');
      let tx;
      if (cs.depRoute === 'private') {
        if (!f.depositPrivate) throw new Error('This sign-in cannot make private transfers. Use a public deposit.');
        tx = await f.depositPrivate(t, units, cs.chain.house);
      } else tx = await f.depositPublic(t, units, cs.chain.house);
      setStatus('cash-status', `Sent (${short(tx)}). Waiting for Starknet…`);
      send({ t: 'deposit', route: cs.depRoute, tx });
      store.set('darkbags.lastDeposit', { tx, at: Date.now() });
    } catch (e) {
      setStatus('cash-status', friendly(e), true);
    } finally {
      $('dep-go').disabled = false;
    }
  }

  function withdraw() {
    const t = token($('wd-token').value);
    const units = t && parseUnits($('wd-amount').value, t.decimals);
    if (!units) return setStatus('cash-status', 'Type an amount.', true);
    if (units > ledger(t.id)) return setStatus('cash-status', `You have ${formatUnits(ledger(t.id), t.decimals, 6)} ${t.symbol}.`, true);
    $('wd-go').disabled = true;
    send({ t: 'withdraw', asset: t.id, units: units.toString(), route: cs.wdRoute });
  }

  function renderHistory(m) {
    const rows = [
      ...m.deposits.map((d) => ({ ...d, what: d.unsupported ? 'Deposit (token not accepted, contact support)' : 'Deposit' })),
      ...m.withdrawals.map((w) => ({ ...w, what: `Cash-out · ${w.status}` })),
    ].sort((a, b) => b.at - a.at);
    const link = (tx) => (tx && tx.startsWith('0x') ? ` · <a href="${esc(cs.chain.explorer)}/tx/${esc(tx)}" target="_blank" rel="noopener">${esc(short(tx))}</a>` : '');
    $('hist').innerHTML = rows.length
      ? rows
          .map((r) => {
            const t = token(r.asset);
            const amt = t ? `${formatUnits(r.units, t.decimals, 6)} ${t.symbol}` : `${r.units} units`;
            return `<li><span>${esc(r.what)} · ${esc(r.route)}</span><b class="num">${esc(amt)}</b><span class="fine">${new Date(r.at).toLocaleString()}${link(r.tx)}</span></li>`;
          })
          .join('')
      : '<li class="fine">Nothing yet.</li>';
  }

  // ------------------------------------------------------------- messages

  function onMessage(m) {
    switch (m.t) {
      case 'welcome':
        cs.chain = m.chain ?? null;
        cs.account = m.account ?? null;
        cs.privyWallet = m.privy ?? null;
        if (cs.account && m.privy) cs.kind = 'privy';
        render();
        finishOAuth();
        return true;
      case 'auth_challenge':
        cs.waiter?.resolve(m.typedData);
        return true;
      case 'authed':
        cs.account = m.account;
        if (m.privy) cs.privyWallet = m.privy;
        if (!m.account) {
          cs.facade = null;
          cs.kind = null;
        }
        store.set('darkbags.walletKind', cs.kind);
        if (m.balances) app.balances = m.balances;
        app.rank = m.rank ?? null;
        if (m.account) {
          $('dlg-connect').close();
          toast(`Signed in as ${short(m.account)}.`);
        }
        render();
        onChange();
        return true;
      case 'cashier': {
        if (m.op === 'deposit') {
          if (m.status === 'checking') setStatus('cash-status', 'The cashier is checking the chain…');
          else if (m.status === 'ok' && m.credited?.length) {
            const txt = m.credited.map((c) => (token(c.asset) ? `${formatUnits(c.units, token(c.asset).decimals, 6)} ${token(c.asset).symbol}` : 'an unsupported token')).join(', ');
            setStatus('cash-status', `Credited ${txt}.`);
            toast(`Deposit credited: ${txt}.`);
          } else if (m.status === 'failed') setStatus('cash-status', 'That transaction failed on chain. Nothing was taken.', true);
          else setStatus('cash-status', m.route === 'private' ? 'Sent. The note shows up for the house within a minute or two; your balance updates by itself.' : 'Waiting for Starknet to accept it. Your balance updates by itself.');
        } else if (m.op === 'withdraw') {
          if (m.status === 'sending') setStatus('cash-status', 'Paying out…');
          else {
            $('wd-go').disabled = false;
            if (m.status === 'sent') {
              setStatus('cash-status', `Paid. Transaction ${short(m.tx)}.`);
              toast('Cash-out sent.');
            } else if (m.status === 'failed') setStatus('cash-status', 'The payout could not be sent. Your balance is back.', true);
            else setStatus('cash-status', 'The payout is held for a manual check. Your funds are safe; it is in your history.', true);
          }
          fillTokens('wd-token');
        }
        return true;
      }
      case 'history':
        renderHistory(m);
        return true;
      case 'err':
        if ($('dlg-connect').open) setStatus('connect-status', m.msg, true);
        if ($('dlg-cashier').open) {
          setStatus('cash-status', m.msg, true);
          $('wd-go').disabled = false;
        }
        return $('dlg-connect').open || $('dlg-cashier').open; // shown in the dialog instead of a toast
      case 'balance':
        if ($('dlg-cashier').open) fillTokens('wd-token');
        return false;
      default:
        return false;
    }
  }

  // --------------------------------------------------------------- wiring
  $('connect').addEventListener('click', openConnect);
  $('open-cashier').addEventListener('click', () => openCashier());
  $('logout').addEventListener('click', async () => {
    send({ t: 'logout' });
    if (cs.kind === 'privy') cs.vendor?.privyAuth.logout(cs.chain.login.privy).catch(() => {});
    await cs.facade?.disconnect?.().catch(() => {});
  });
  $('btn-cartridge').addEventListener('click', () => signInWith('cartridge', () => cs.vendor.connectCartridge(cs.chain, app.token, base)));
  $('privy-send').addEventListener('click', privySend);
  $('privy-verify').addEventListener('click', privyVerify);
  $('privy-code').addEventListener('keydown', (e) => e.key === 'Enter' && privyVerify());
  for (const b of document.querySelectorAll('[data-oauth]')) b.addEventListener('click', () => privyOAuth(b.dataset.oauth));
  for (const b of document.querySelectorAll('#dlg-cashier [data-tab]')) b.addEventListener('click', () => setTab(b.dataset.tab));
  for (const b of document.querySelectorAll('.dlg [data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
  $('dep-go').addEventListener('click', deposit);
  $('wd-go').addEventListener('click', withdraw);
  $('wd-max').addEventListener('click', () => {
    const t = token($('wd-token').value);
    if (t) $('wd-amount').value = formatUnits(ledger(t.id), t.decimals, t.decimals).replace(/,/g, '');
  });

  return {
    onMessage,
    render,
    get active() {
      return !!cs.chain && app.mode === 'online';
    },
    get signedIn() {
      return !!cs.account;
    },
    reset() {
      cs.chain = null;
      cs.account = null;
      render();
    },
  };
}

function friendly(e) {
  const m = String(e?.message ?? e ?? 'Something went wrong.');
  if (/user (rejected|refused|abort)|USER_REFUSED|denied/i.test(m) || e?.code === 113) return 'Cancelled in the wallet.';
  return m.length > 220 ? `${m.slice(0, 220)}…` : m;
}
