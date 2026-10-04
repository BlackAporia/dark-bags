// The map vote in the ready room: a card per map with a real thumbnail of it (the same
// drawing code as the raid, shrunk), how many at the table want it, and "any map".
import { MAP_THEMES, generateMap } from '../shared/map.js';
import { canvas, pattern, textures } from './textures.js';
import { THEME, floorTex, drawThemeWall, drawPit, drawUnder } from './themes.js';
import { esc } from './game.js';
import { t } from './i18n.js';

const thumbs = new Map();

// a 1100 x 700 window of the map, around its middle, at 0.16 scale
export function mapThumb(theme) {
  if (thumbs.has(theme)) return thumbs.get(theme);
  const W = 176;
  const H = 112;
  const c = canvas(W * 2, H * 2);
  const x = c.getContext('2d');
  const map = generateMap(4242, theme);
  const k = (W * 2) / 1100;
  const ox = map.w / 2 - 550;
  const oy = map.h / 2 - 350;
  x.scale(k, k);
  x.translate(-ox, -oy);
  const view = { x: ox, y: oy, w: 1100, h: 700 };
  const near = (r) => r.x < view.x + view.w && r.x + r.w > view.x && r.y < view.y + view.h && r.y + r.h > view.y;
  const tex = textures();
  x.fillStyle = pattern(x, floorTex(theme) ?? tex.concrete);
  x.fillRect(ox, oy, 1100, 700);
  if (THEME[theme]) drawUnder(theme, x, map, near);
  for (const v of map.vaults) {
    if (!near(v)) continue;
    x.fillStyle = pattern(x, tex.plate);
    x.fillRect(v.x, v.y, v.w, v.h);
  }
  for (const r of map.pits ?? []) if (near(r)) {
    x.save();
    drawPit(x, r, map.seed);
    x.restore();
  }
  for (const w of map.walls) {
    if (!near(w)) continue;
    x.save();
    const ok = w.k && drawThemeWall(x, w, { kind: w.k, themed: true }, map.seed);
    x.restore();
    if (!ok) {
      x.fillStyle = w.k ? '#555' : pattern(x, w.w <= 24 || w.h <= 24 ? tex.steel : tex.planks);
      x.fillRect(w.x, w.y, w.w, w.h);
    }
  }
  // every map at night, like the docks
  x.setTransform(1, 0, 0, 1, 0, 0);
  if (THEME[theme]?.night) {
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = THEME[theme].night;
    x.fillRect(0, 0, W * 2, H * 2);
    x.globalCompositeOperation = 'source-over';
  }
  const g = x.createRadialGradient(W, H, 30, W, H, W * 1.1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  x.fillStyle = g;
  x.fillRect(0, 0, W * 2, H * 2);
  const url = c.toDataURL('image/jpeg', 0.82);
  thumbs.set(theme, url);
  return url;
}

export function renderMapPick(box, { show, votes = {}, mine = null, onVote }) {
  box.hidden = !show;
  if (!show) return;
  const key = `${mine}|${JSON.stringify(votes)}|${t('map.any')}`;
  if (box.dataset.key === key) return;
  const first = !box.dataset.key;
  box.dataset.key = key;
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  const card = (id) => {
    const n = id ? votes[id] ?? 0 : 0;
    const on = (mine ?? null) === id;
    return `<button type="button" class="mp${on ? ' on' : ''}" data-map="${id ?? ''}" aria-pressed="${on}">
      ${id ? `<img alt="" src="${mapThumb(id)}" loading="lazy">` : '<span class="mp-any">?</span>'}
      <b>${esc(t(id ? `map.${id}` : 'map.any'))}</b>${n ? `<i class="mp-n">${n}</i>` : ''}</button>`;
  };
  const scroll = box.querySelector('.mp-row')?.scrollLeft ?? 0;
  box.innerHTML = `<p class="eyebrow">${esc(t('map.title'))}<span class="fine"> · ${esc(t(total ? 'map.hint' : 'map.hintNone'))}</span></p>
    <div class="mp-row">${[null, ...MAP_THEMES].map(card).join('')}</div>`;
  const row = box.querySelector('.mp-row');
  row.scrollLeft = scroll;
  if (first && mine) box.querySelector('.mp.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  for (const b of box.querySelectorAll('[data-map]')) b.addEventListener('click', () => onVote(b.dataset.map || null));
}
