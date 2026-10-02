// A fresh start for everyone: when the game's data epoch changes, this browser forgets its
// progress (account token, nickname, practice profile, tutorial, wallet choice, picks) and keeps
// only its language, sound and display settings. Runs before anything else reads storage.
import { CFG } from '../shared/config.js';

const KEEP = new Set(['darkbags.lang', 'darkbags.music', 'darkbags.muted', 'darkbags.settings', 'darkbags.gore', 'darkbags.epoch']);

try {
  if (localStorage.getItem('darkbags.epoch') !== JSON.stringify(CFG.EPOCH)) {
    for (const k of Object.keys(localStorage)) if (k.startsWith('darkbags.') && !KEEP.has(k)) localStorage.removeItem(k);
    localStorage.setItem('darkbags.epoch', JSON.stringify(CFG.EPOCH));
  }
} catch {
  /* storage unavailable: nothing kept, nothing to forget */
}
