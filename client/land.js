// The turned layout. Some phone browsers never rotate: the one inside a wallet app (Braavos,
// Ready, Xverse) keeps the page upright, and the raid is built for landscape. There the game
// runs inside land.html, in a frame turned a quarter round: the frame itself is landscape, so the
// game lays out and takes touches exactly as on a phone held sideways.
export const LAND_KEY = 'darkbags.land';

const top0 = () => {
  try {
    return window.top;
  } catch {
    return window;
  }
};

// inside land.html's frame
export function inLandFrame() {
  try {
    return window !== window.top && !!window.parent.__darkbagsLand;
  } catch {
    return false;
  }
}

export function landOn() {
  try {
    return JSON.parse(localStorage.getItem(LAND_KEY) ?? 'false') === true;
  } catch {
    return false;
  }
}

// switch it on or off: the whole page reloads (the top window), with the same link
export function setLand(on) {
  try {
    localStorage.setItem(LAND_KEY, JSON.stringify(!!on));
  } catch {}
  const q = location.search.replace(/([?&])inframe=1&?/, '$1').replace(/[?&]$/, '');
  top0().location.replace(`${on ? '/land.html' : '/'}${q}${location.hash}`);
}

// A wallet app puts its wallet on the top window only. In the frame the game borrows it from
// there (same site, so the frame may reach it); the wallet code then finds it as usual.
export function adoptParentWallets() {
  if (window === top0()) return;
  try {
    for (const k of Object.keys(window.parent)) if (/^(starknet|braavos|argent|xverse|ready)/i.test(k) && !(k in window)) window[k] = window.parent[k];
  } catch {}
}
