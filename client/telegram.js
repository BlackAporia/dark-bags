// The Telegram Mini App. Opened from the bot, the game runs inside Telegram's own window: it
// says when it is ready, takes the whole screen on phones (landscape too), keeps the raid out of
// the swipe that would close the window, follows Telegram's safe areas and back button, buzzes
// with Telegram's haptics, and signs the player in with the launch data Telegram signs (the
// server checks it, server/telegram.js).
//
// No script from telegram.org: the launch data comes in the address fragment and the window
// talks through Telegram's documented bridge (core.telegram.org/api/web-events). Outside
// Telegram everything here is inert (TG.active is false).

const KEY = 'darkbags.tgLaunch';

function readLaunch() {
  let raw = '';
  try {
    raw = location.hash.slice(1);
  } catch {}
  let p = new URLSearchParams(raw);
  if (p.has('tgWebAppData') || p.has('tgWebAppPlatform')) {
    // a reload (or the turned layout's frame) has no fragment: keep the launch for this tab
    try {
      sessionStorage.setItem(KEY, raw);
    } catch {}
  } else {
    try {
      p = new URLSearchParams(sessionStorage.getItem(KEY) ?? '');
    } catch {
      p = new URLSearchParams('');
    }
  }
  if (!p.has('tgWebAppPlatform') && !p.has('tgWebAppData')) return null;
  const initData = p.get('tgWebAppData') ?? '';
  let user = null;
  try {
    user = JSON.parse(new URLSearchParams(initData).get('user') ?? 'null');
  } catch {}
  return {
    initData,
    platform: p.get('tgWebAppPlatform') ?? 'unknown',
    version: p.get('tgWebAppVersion') ?? '6.0',
    start: p.get('tgWebAppStartParam') ?? new URLSearchParams(initData).get('start_param') ?? '',
    user,
  };
}

const launch = readLaunch();
const verAtLeast = (v) => {
  const [a, b] = String(launch?.version ?? '0').split('.').map(Number);
  const [x, y] = v.split('.').map(Number);
  return a > x || (a === x && (b || 0) >= y);
};

// Telegram's bridge: the phone and desktop apps put a proxy on the window; the web app takes
// messages from its frame
function proxy() {
  for (const w of [window, window.parent, window.top]) {
    try {
      if (w?.TelegramWebviewProxy?.postEvent) return w.TelegramWebviewProxy;
    } catch {}
  }
  return null;
}
function post(type, data = {}) {
  if (!launch) return;
  try {
    const px = proxy();
    if (px) return px.postEvent(type, JSON.stringify(data));
    if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType: type, eventData: data }), 'https://web.telegram.org');
  } catch {}
}

const handlers = new Map();
function receive(type, data) {
  for (const f of handlers.get(type) ?? []) {
    try {
      f(data ?? {});
    } catch {}
  }
}
if (launch) {
  // the apps call window.Telegram.WebView.receiveEvent; the web app posts to the frame
  window.Telegram = window.Telegram ?? {};
  window.Telegram.WebView = { ...(window.Telegram.WebView ?? {}), receiveEvent: receive };
  addEventListener('message', (e) => {
    if (e.source !== window.parent || e.origin !== 'https://web.telegram.org') return;
    try {
      const m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (m?.eventType) receive(m.eventType, m.eventData);
    } catch {}
  });
}
const on = (type, f) => {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(f);
};

const MOBILE = new Set(['android', 'android_x', 'ios']);
const BG = '#05060a';

// a short, clean name from the Telegram profile (the server cleans it again)
function suggestedName(u) {
  const pick = [u?.username, u?.first_name].find((x) => typeof x === 'string' && x.trim()) ?? '';
  return pick.replace(/[^\p{L}\p{N}_\-. ]/gu, '').trim().slice(0, 16);
}

// safe areas: the phone's notch plus Telegram's own buttons over a fullscreen game
const insets = { s: { top: 0, bottom: 0, left: 0, right: 0 }, c: { top: 0, bottom: 0, left: 0, right: 0 } };
function applyInsets() {
  const r = document.documentElement.style;
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const px = (insets.s[side] ?? 0) + (insets.c[side] ?? 0);
    const v = px > 0 ? `${px}px` : `env(safe-area-inset-${side}, 0px)`;
    r.setProperty(`--safe-${side[0]}`, v);
  }
}

let lastBuzz = 0;
let backShown = null;
let closeAsk = null;
let backFn = null;
const invoices = new Map(); // slug → done(status)

export const TG = {
  active: !!launch,
  initData: launch?.initData ?? '',
  platform: launch?.platform ?? null,
  mobile: !!launch && MOBILE.has(launch.platform),
  startParam: launch?.start ?? '',
  user: launch?.user ?? null,
  lang: String(launch?.user?.language_code ?? '').slice(0, 2).toLowerCase(),
  name: suggestedName(launch?.user),
  link: null, // https://t.me/<bot>/<app>, from the server (TELEGRAM_BOT_USERNAME, TELEGRAM_APP_NAME)

  // haptics: impact (light, medium, heavy, rigid, soft) or a notification (success, warning, error)
  buzz(kind) {
    if (!launch || !verAtLeast('6.1')) return;
    const now = performance.now();
    if (now - lastBuzz < 80) return;
    lastBuzz = now;
    if (kind === 'success' || kind === 'warning' || kind === 'error') post('web_app_trigger_haptic_feedback', { type: 'notification', notification_type: kind });
    else post('web_app_trigger_haptic_feedback', { type: 'impact', impact_style: kind || 'light' });
  },
  // Telegram's back button: shown while there is somewhere to go back to
  back(visible) {
    if (!launch || !verAtLeast('6.1') || backShown === !!visible) return;
    backShown = !!visible;
    post('web_app_setup_back_button', { is_visible: backShown });
  },
  onBack(f) {
    backFn = f;
  },
  // ask before closing the window (in a raid, a stray swipe would end it)
  confirmClose(on) {
    if (!launch || !verAtLeast('6.2') || closeAsk === !!on) return;
    closeAsk = !!on;
    post('web_app_setup_closing_behavior', { need_confirmation: closeAsk });
  },
  // a link outside the game: t.me links stay in Telegram, the rest open in the browser
  open(url) {
    if (!launch) return false;
    let u;
    try {
      u = new URL(url, location.href);
    } catch {
      return false;
    }
    if (u.origin === location.origin) return false;
    if (/^(t\.me|telegram\.me)$/.test(u.hostname) && verAtLeast('6.1')) post('web_app_open_tg_link', { path_full: u.pathname + u.search });
    else post('web_app_open_link', { url: u.href });
    return true;
  },
  // Telegram's share sheet: pick a chat, the link and the text go there
  share(url, text = '') {
    return this.open(`https://t.me/share/url?url=${encodeURIComponent(url)}${text ? `&text=${encodeURIComponent(text)}` : ''}`);
  },
  // Telegram's payment sheet for an invoice link (t.me/$slug or t.me/invoice/slug); done(status)
  // hears paid, cancelled, failed or pending
  openInvoice(link, done = () => {}) {
    if (!launch || !verAtLeast('6.1')) return false;
    let slug = '';
    try {
      const u = new URL(link);
      const path = u.pathname.replace(/^\//, '');
      slug = path.startsWith('$') ? path.slice(1) : path.startsWith('invoice/') ? path.slice('invoice/'.length) : '';
    } catch {}
    if (!slug) return false;
    invoices.set(slug, done);
    post('web_app_open_invoice', { slug });
    return true;
  },
  // the link that opens the game in Telegram with a start parameter (letters, digits, _ and -)
  startLink(param) {
    if (!this.link) return null;
    const p = String(param ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    return p ? `${this.link}?startapp=${p}` : this.link;
  },
};

if (launch) {
  document.documentElement.classList.add('tg', `tg-${launch.platform}`);
  on('back_button_pressed', () => backFn?.());
  on('invoice_closed', (d) => {
    const done = invoices.get(d.slug);
    invoices.delete(d.slug);
    done?.(d.status);
  });
  on('safe_area_changed', (d) => {
    insets.s = { ...insets.s, ...d };
    applyInsets();
  });
  on('content_safe_area_changed', (d) => {
    insets.c = { ...insets.c, ...d };
    applyInsets();
  });
  if (window.parent !== window && !proxy()) post('iframe_ready', { reload_supported: false }); // Telegram Web hosts the game in a frame
  post('web_app_ready');
  post('web_app_expand');
  if (verAtLeast('6.1')) {
    post('web_app_set_header_color', { color: BG });
    post('web_app_set_background_color', { color: BG });
  }
  if (verAtLeast('7.10')) post('web_app_set_bottom_bar_color', { color: BG });
  // a downward swipe in a raid is a move, not "close the game"
  if (verAtLeast('7.7')) post('web_app_setup_swipe_behavior', { allow_vertical_swipe: false });
  if (verAtLeast('8.0')) {
    if (TG.mobile) post('web_app_request_fullscreen');
    post('web_app_request_safe_area');
    post('web_app_request_content_safe_area');
  }
  // links to other sites (the X account, the channel, docs) leave through Telegram
  addEventListener(
    'click',
    (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!a || a.target !== '_blank' || e.defaultPrevented) return;
      if (TG.open(a.href)) e.preventDefault();
    },
    true,
  );
}
