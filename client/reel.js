// The case reel: a strip of prizes races past a marker, slows, and stops on what the
// server already rolled. Purely a show: the item is decided before the strip is built.
// The filler is drawn at the box's own odds, so most tiles are common, and the tile
// right after the winner is often a big one: so close.
import { RARITIES, RARITY_ORDER } from '../shared/cosmetics.js';
import { esc } from './game.js';

const rankOf = (r) => RARITY_ORDER.indexOf(r);
const TILE = 132; // px, tile width including the gap
const WIN_AT = 46; // index of the winning tile in the strip
const STRIP = 54;

// pick a rarity at the given odds (percent), then an item of it from the pool
function filler(pool, odds, rnd = Math.random) {
  let r = rnd() * 100;
  let rarity = 'common';
  for (const k of RARITY_ORDER) {
    const p = odds?.[k] ?? 0;
    if (p <= 0) continue;
    rarity = k;
    if (r < p) break;
    r -= p;
  }
  const of = pool.filter((i) => i.rarity === rarity);
  const from = of.length ? of : pool;
  return from[Math.floor(rnd() * from.length)];
}

/**
 * host: an element to fill. pool: [{ id, name, rarity, img }] what could come out;
 * win: the item that did. odds: rarity → percent for the filler. Resolves when it stops.
 */
export function spinReel(host, { pool, win, odds, sfx, motion = true, secs = 6.2, label = '' }) {
  const items = [];
  for (let i = 0; i < STRIP; i++) items.push(filler(pool, odds));
  items[WIN_AT] = win;
  // the near miss: a jackpot-grade tile just past the winner (and now and then just before)
  const big = pool.filter((i) => rankOf(i.rarity) >= Math.max(4, rankOf(win.rarity) + 2));
  if (big.length && Math.random() < 0.7) items[WIN_AT + 1] = big[Math.floor(Math.random() * big.length)];
  if (big.length && Math.random() < 0.35) items[WIN_AT - 1] = big[Math.floor(Math.random() * big.length)];
  host.innerHTML = `<div class="reel">
    ${label ? `<p class="reel-label">${esc(label)}</p>` : ''}
    <div class="reel-window"><div class="reel-strip">${items
      .map((it, i) => `<div class="reel-tile r-${it.rarity}${i === WIN_AT ? ' win' : ''}" style="--q:${RARITIES[it.rarity].color}"><img src="${it.img}" alt=""><span>${esc(it.name)}</span></div>`)
      .join('')}</div><i class="reel-mark"></i><i class="reel-shade l"></i><i class="reel-shade r"></i></div></div>`;
  const strip = host.querySelector('.reel-strip');
  const win_ = host.querySelector('.reel-window');
  return new Promise((done) => {
    const w = win_.clientWidth;
    // where it stops: somewhere in the winning tile, often near its far edge (the next
    // tile, the big one, almost under the marker)
    const into = Math.random() < 0.55 ? 0.78 + Math.random() * 0.17 : 0.15 + Math.random() * 0.6;
    const end = WIN_AT * TILE + into * (TILE - 8) - w / 2;
    if (!motion) {
      strip.style.transform = `translateX(${-end}px)`;
      host.querySelector('.reel-tile.win').classList.add('hit');
      return done();
    }
    const t0 = performance.now();
    const dur = secs * 1000;
    // fast start, a long glide, a creeping finish
    const ease = (x) => 1 - (1 - x) ** 4.2;
    let lastTile = -1;
    const tick = (now) => {
      const x = Math.min(1, (now - t0) / dur);
      const pos = ease(x) * end;
      strip.style.transform = `translateX(${-pos}px)`;
      const speed = (1 - x) ** 3.2;
      strip.style.filter = speed > 0.25 ? `blur(${Math.min(3, speed * 3.5).toFixed(2)}px)` : '';
      // a click every tile that crosses the marker, rising in pitch as it slows
      const under = Math.floor((pos + w / 2) / TILE);
      if (under !== lastTile) {
        lastTile = under;
        sfx?.play('beep', { f: 520 + (1 - speed) * 700, dur: 0.018 });
        if (navigator.vibrate && speed < 0.4) navigator.vibrate(4);
      }
      if (x < 1) return requestAnimationFrame(tick);
      strip.style.filter = '';
      // a last little settle back, then the winner lights up
      strip.animate([{ transform: `translateX(${-pos}px)` }, { transform: `translateX(${-pos + 3}px)` }, { transform: `translateX(${-pos}px)` }], { duration: 260 });
      setTimeout(() => {
        host.querySelector('.reel-tile.win').classList.add('hit');
        host.querySelector('.reel').classList.add('stopped');
        done();
      }, 320);
    };
    requestAnimationFrame(tick);
  });
}
