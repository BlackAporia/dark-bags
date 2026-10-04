// Languages: the seven most spoken in the world plus Ukrainian, Russian, Turkish and Swahili.
// A new player gets the language of their country (by IP, see /api/geo), English otherwise.
// t('key', {vars}) for strings built in code; data-i18n="key" (text), data-i18n-ph
// (placeholder) and data-i18n-title (tooltip) for the HTML. English is the fallback.
import { STRINGS } from './strings.js';

export const LANGS = [
  { id: 'en', name: 'English' },
  { id: 'zh', name: '中文' },
  { id: 'hi', name: 'हिन्दी' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'ar', name: 'العربية', rtl: true },
  { id: 'pt', name: 'Português' },
  { id: 'uk', name: 'Українська' },
  { id: 'ru', name: 'Русский' },
  { id: 'tr', name: 'Türkçe' },
  { id: 'sw', name: 'Kiswahili' },
];

const KEY = 'darkbags.lang';
function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && STRINGS[saved]) return saved;
  } catch {}
  // no choice yet: English until the player's country answers (main.js asks /api/geo)
  return 'en';
}
// has the player (or the country lookup) picked a language on this device yet?
export function langChosen() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

let lang = typeof navigator === 'undefined' ? 'en' : initial();
const listeners = new Set();

export const getLang = () => lang;

export function t(key, vars) {
  let s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

export function applyI18n(root = document) {
  const meta = LANGS.find((l) => l.id === lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = meta?.rtl ? 'rtl' : 'ltr';
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}

export function setLang(id) {
  if (!STRINGS[id]) return;
  lang = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  applyI18n();
  for (const f of listeners) f(id);
}

export const onLang = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
