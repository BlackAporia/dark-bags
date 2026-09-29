// Rank insignia, drawn as SVG from the rank number (no image files).
// Chevrons for the enlisted grades, then bars, leaves, wings and stars for officers,
// in bronze → silver → gold → platinum → ruby → black-and-gold; pips count the step
// (I–V) inside a grade. Rank 90 is the legendary badge: a laurel-wrapped star.
import { RANKS, MAX_RANK } from '../shared/ranks.js';

const METALS = [
  { fill: '#c07a45', dark: '#5a3418' }, // bronze: grades 1-3
  { fill: '#c9d1dc', dark: '#4a5566' }, // silver: 4-7
  { fill: '#f2c14e', dark: '#7a5510' }, // gold: 8-11
  { fill: '#9fe3ff', dark: '#1f5a78' }, // platinum: 12-14
  { fill: '#ff6b86', dark: '#6e1024' }, // ruby: generals 15-17
  { fill: '#ffd166', dark: '#0b0b0b' }, // black and gold: General
];
const metalOf = (g) => METALS[g < 3 ? 0 : g < 7 ? 1 : g < 11 ? 2 : g < 14 ? 3 : g < 17 ? 4 : 5];

const SHIELD = 'M24 3 L43 10 V24 C43 35 34 42 24 46 C14 42 5 35 5 24 V10 Z';
const chevron = (y) => `<path d="M13 ${y + 6} L24 ${y} L35 ${y + 6}" fill="none" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>`;
const rocker = (y) => `<path d="M13 ${y} Q24 ${y + 6} 35 ${y}" fill="none" stroke-width="2.6" stroke-linecap="round"/>`;
const bar = (y, w = 20) => `<rect x="${24 - w / 2}" y="${y}" width="${w}" height="4" rx="1"/>`;
const star = (cx, cy, r) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}"/>`;
};
const leaf = (cy) => `<path d="M24 ${cy - 9} C31 ${cy - 4} 31 ${cy + 4} 24 ${cy + 9} C17 ${cy + 4} 17 ${cy - 4} 24 ${cy - 9} Z"/><path d="M24 ${cy - 6} V${cy + 7}" fill="none" stroke-width="1.2" stroke-opacity=".6"/>`;
const wings = (cy) => `<path d="M24 ${cy + 3} L10 ${cy - 5} L14 ${cy + 2} L8 ${cy + 1} L24 ${cy + 9} L40 ${cy + 1} L34 ${cy + 2} L38 ${cy - 5} Z"/><circle cx="24" cy="${cy - 1}" r="3"/>`;

function emblem(g) {
  switch (g) {
    case 0: return chevron(16);
    case 1: return chevron(12) + chevron(19);
    case 2: return chevron(9) + chevron(16) + chevron(23);
    case 3: return chevron(8) + chevron(14) + chevron(20) + rocker(28);
    case 4: return chevron(7) + chevron(13) + chevron(19) + rocker(26) + rocker(31);
    case 5: return chevron(6) + chevron(11) + chevron(16) + rocker(23) + rocker(28) + rocker(33);
    case 6: return chevron(6) + chevron(11) + chevron(16) + rocker(26) + rocker(31) + star(24, 23, 3.4);
    case 7: return `<rect x="12" y="17" width="24" height="9" rx="2"/><rect x="21" y="18.5" width="6" height="6" transform="rotate(45 24 21.5)" fill="#0b0f18"/>`;
    case 8: return bar(19, 18);
    case 9: return bar(15, 18) + bar(23, 18);
    case 10: return bar(12, 18) + bar(19, 18) + bar(26, 18);
    case 11: return leaf(21);
    case 12: return leaf(19) + bar(31, 16);
    case 13: return wings(20);
    case 14: return star(24, 21, 8);
    case 15: return star(17, 21, 6) + star(31, 21, 6);
    case 16: return star(14, 22, 5) + star(24, 17, 5.4) + star(34, 22, 5);
    case 17: return star(16, 16, 5) + star(32, 16, 5) + star(16, 27, 5) + star(32, 27, 5);
    default: return '';
  }
}

const pips = (n, color) =>
  Array.from({ length: n }, (_, i) => `<circle cx="${24 + (i - (n - 1) / 2) * 5}" cy="38.5" r="1.6" fill="${color}"/>`).join('');

function legend(id) {
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const t = 0.35 + i * 0.36;
    for (const side of [-1, 1]) {
      const a = Math.PI / 2 + side * t;
      const x = 24 + Math.cos(a) * 15;
      const y = 24 + Math.sin(a) * 15;
      const rot = ((a * 180) / Math.PI + (side > 0 ? 60 : 120)).toFixed(0);
      leaves.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4.4" ry="1.9" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
    }
  }
  return `<defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe29a"/><stop offset=".45" stop-color="#f7931a"/><stop offset="1" stop-color="#ff3d7f"/></linearGradient>
    <radialGradient id="${id}r" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#3a1206"/><stop offset="1" stop-color="#07090f"/></radialGradient>
  </defs>
  <path d="${SHIELD}" fill="url(#${id}r)" stroke="url(#${id}g)" stroke-width="2.4"/>
  <g fill="url(#${id}g)">${leaves.join('')}${star(24, 22, 9.5)}</g>
  <path d="M15 37 H33" stroke="url(#${id}g)" stroke-width="2" stroke-linecap="round"/>`;
}

let uid = 0;
export function rankBadgeSvg(rank, size = 32) {
  const r = RANKS[Math.max(1, Math.min(MAX_RANK, rank | 0)) - 1];
  const id = `rb${uid++}`;
  const body =
    r.rank === MAX_RANK
      ? legend(id)
      : (() => {
          const m = metalOf(r.grade);
          return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2232"/><stop offset="1" stop-color="#0b0f18"/></linearGradient></defs>
  <path d="${SHIELD}" fill="url(#${id})" stroke="${m.fill}" stroke-width="2"/>
  <path d="M9 12 L24 6.5 L39 12" fill="none" stroke="${m.fill}" stroke-opacity=".35" stroke-width="1"/>
  <g fill="${m.fill}" stroke="${m.fill}">${emblem(r.grade)}</g>
  ${pips(r.step + 1, m.fill)}`;
        })();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" role="img" aria-label="Rank ${r.rank}: ${r.name}">${body}</svg>`;
}

// canvas: one cached image per rank for name tags
const images = new Map();
export function rankImage(rank) {
  const r = Math.max(1, Math.min(MAX_RANK, rank | 0));
  let img = images.get(r);
  if (!img && typeof Image !== 'undefined') {
    img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rankBadgeSvg(r, 48))}`;
    images.set(r, img);
  }
  return img?.complete && img.naturalWidth ? img : null;
}
