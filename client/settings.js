// Player settings, kept in this browser. Everything that reads them subscribes to
// changes, so a switch in the settings screen applies at once, mid-raid included.
import { store } from './store.js';

const DEFAULTS = {
  quality: 'auto', // auto | high | medium | low
  skins: 'all', // all | mine | none: whose outfits and weapon skins are drawn
  names: true, // name tags over other runners
  titles: true, // achievement titles over names
  shake: true, // screen shake
  gore: false, // 18+: limbs come off
  sound: 0.9, // 0..1
  music: 0.6, // 0..1
  track: 'auto', // the raid soundtrack: auto (a different track each match) or one track id
  voice: true, // the announcer (first blood, double kill, …) in your language
  vchat: true, // voice chat in the match (hear others; K for your own microphone)
  stick: 1, // touch stick size, 0.8..1.4
  lefty: false, // swap the touch sticks
  motion: true, // menu animations (off honours reduced motion)
};

const KEY = 'darkbags.settings';
const saved = store.get(KEY, {});
// the 18+ toggle used to live on its own key
if (saved.gore === undefined && store.get('darkbags.gore', null) !== null) saved.gore = store.get('darkbags.gore', false);
export const settings = { ...DEFAULTS, ...saved };
if (typeof matchMedia === 'function' && saved.motion === undefined && matchMedia('(prefers-reduced-motion: reduce)').matches) settings.motion = false;

const subs = new Set();
export function setSetting(k, v) {
  if (!(k in DEFAULTS)) return;
  settings[k] = v;
  store.set(KEY, settings);
  for (const f of subs) f(k, v);
}
export const onSetting = (f) => (subs.add(f), () => subs.delete(f));
export const QUALITY = { low: 0, medium: 1, high: 2 };
