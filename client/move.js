// The game moved from the railway.app address to dark-bags.com. A browser keeps storage per
// site, so on the new address a returning player looked brand new (no token, no name: "create a
// new runner"), while their ranks, stats and items wait on the server under their old token.
//
// So the old address hands the profile over: opened at the top level, it packs this browser's
// darkbags.* keys into the URL fragment (never sent to any server) and goes to the new address,
// which stores them (the old profile wins over a fresh one made there) and wipes the fragment from
// the address bar and history. ?stay on the old address skips the move. Runs before anything
// else reads storage.

const OLD_HOSTS = new Set(['dark-bags-production.up.railway.app']);
const NEW_HOME = 'https://dark-bags.com/';
const MOVE = '#move=';

const enc = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

try {
  const qs = new URLSearchParams(location.search);
  if (OLD_HOSTS.has(location.hostname) && window.top === window && !qs.has('stay') && !qs.has('server')) {
    // the old address: carry this browser's profile to the new one
    const keep = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = k?.startsWith('darkbags.') && !k.startsWith('darkbags.admin') ? localStorage.getItem(k) : null;
      if (v != null && v.length < 100000) keep[k] = v; // the admin key never rides in an address
    }
    const search = location.search; // ?ref= and the like come along
    location.replace(`${NEW_HOME}${search}${Object.keys(keep).length ? MOVE + enc(JSON.stringify(keep)) : ''}`);
  } else if (location.hash.startsWith(MOVE)) {
    // the new address: take the profile in, then forget it was ever in the address
    const keep = JSON.parse(dec(location.hash.slice(MOVE.length)));
    if (keep && typeof keep === 'object' && keep['darkbags.token']) {
      for (const k of Object.keys(localStorage)) if (k.startsWith('darkbags.')) localStorage.removeItem(k);
    }
    for (const [k, v] of Object.entries(keep ?? {})) if (k.startsWith('darkbags.') && typeof v === 'string') localStorage.setItem(k, v);
    history.replaceState(null, '', location.pathname + location.search);
  }
} catch {
  /* storage blocked or a broken fragment: the game starts as it would have */
}
