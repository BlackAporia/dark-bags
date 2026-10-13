// The signed copy of the account's records the server sends now and then (server/backup.js), kept
// here per wallet address. It goes back with every hello and sign-in: if the server ever loses the
// account's records, they come back from it. The browser can't read or change what is in it.
import { store } from './store.js';

const KEY = 'darkbags.backups';
const MAX = 4; // accounts kept on one device

export function keepBackup(key, b) {
  if (typeof key !== 'string' || typeof b !== 'string') return;
  const all = store.get(KEY, {}) ?? {};
  delete all[key];
  all[key] = b; // newest last
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete all[k];
  store.set(KEY, all);
}

export const backups = () => Object.values(store.get(KEY, {}) ?? {}).slice(-MAX);
