// The medals over the centre of the screen when you pull something off: first blood, the
// multi-kills, a headshot, a long shot, a knife kill. Each is a metal badge with its own icon,
// colour, wings for the bigger ones and a ribbon; game.js shows one at a time with its title.

// [main colour, dark edge, light metal, icon colour, wings]
const KIND = {
  s1: ['#e0182c', '#4a0309', '#ff6b78', '#fff2f2', false],
  s2: ['#ff8a1f', '#5a2600', '#ffc27a', '#fff6e8', false],
  s3: ['#ffd166', '#6b4b00', '#fff0b8', '#3a2600', true],
  s4: ['#b14dff', '#2e0657', '#e2b3ff', '#fff', true],
  s5: ['#ffd166', '#5a3c00', '#fff6d0', '#3a2600', true],
  hs: ['#ff3b5c', '#4d0614', '#ffb3c0', '#fff', true],
  long: ['#3ce6ff', '#03384a', '#b8f6ff', '#022633', false],
  knife: ['#c9d1e0', '#2b3140', '#ffffff', '#1b2030', false],
};

const ICON = {
  // a blood drop
  s1: (c) => `<path d="M100 58 C 84 84 76 98 76 112 a24 24 0 0 0 48 0 c0-14-8-28-24-54z" fill="${c}"/><path d="M90 104 a10 12 0 0 0 4 16" stroke="rgba(255,255,255,.7)" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  // two crossed blades
  s2: (c) =>
    [-1, 1]
      .map((k) => `<g transform="rotate(${k * 40} 100 100)"><rect x="96" y="56" width="8" height="64" rx="2" fill="${c}"/><path d="M96 56 l4 -10 l4 10z" fill="${c}"/><rect x="86" y="118" width="28" height="6" rx="3" fill="${c}"/><rect x="97" y="124" width="6" height="16" rx="2" fill="${c}"/></g>`)
      .join(''),
  // three stars
  s3: (c) => [[100, 78, 17], [72, 116, 13], [128, 116, 13]].map(([x, y, r]) => `<path d="${star(x, y, r)}" fill="${c}"/>`).join(''),
  // a skull
  s4: (c) => skull(c),
  // a crown
  s5: (c) => `<path d="M64 128 L58 78 L82 98 L100 66 L118 98 L142 78 L136 128 Z" fill="${c}"/><rect x="62" y="130" width="76" height="10" rx="3" fill="${c}"/><circle cx="100" cy="66" r="6" fill="${c}"/><circle cx="58" cy="78" r="5" fill="${c}"/><circle cx="142" cy="78" r="5" fill="${c}"/>`,
  // crosshairs over a skull
  hs: (c) => `${skull(c, 0.78)}<circle cx="100" cy="100" r="40" fill="none" stroke="${c}" stroke-width="5"/>${[0, 90, 180, 270].map((a) => `<rect x="97" y="48" width="6" height="18" fill="${c}" transform="rotate(${a} 100 100)"/>`).join('')}`,
  // a scope reticle with range marks
  long: (c) => `<circle cx="100" cy="100" r="38" fill="none" stroke="${c}" stroke-width="5"/><circle cx="100" cy="100" r="5" fill="${c}"/>${[0, 90, 180, 270].map((a) => `<rect x="98" y="54" width="4" height="28" fill="${c}" transform="rotate(${a} 100 100)"/>`).join('')}${[112, 122, 132].map((y) => `<rect x="92" y="${y}" width="16" height="3" fill="${c}"/>`).join('')}`,
  // a single blade
  knife: (c) => `<g transform="rotate(-35 100 100)"><path d="M94 48 L106 48 L106 118 L100 128 L94 118Z" fill="${c}"/><path d="M100 52 L100 116" stroke="rgba(255,255,255,.6)" stroke-width="2"/><rect x="82" y="118" width="36" height="7" rx="3" fill="${c}"/><rect x="95" y="125" width="10" height="24" rx="3" fill="${c}"/></g>`,
};

function star(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }
  return `${d}Z`;
}

function skull(c, k = 1) {
  return `<g transform="translate(100 100) scale(${k}) translate(-100 -100)"><path d="M100 60 c-24 0-38 16-38 36 c0 12 6 20 12 24 v14 h52 v-14 c6-4 12-12 12-24 c0-20-14-36-38-36z" fill="${c}"/><circle cx="86" cy="98" r="9" fill="#111"/><circle cx="114" cy="98" r="9" fill="#111"/><path d="M100 108 l-5 9 h10z" fill="#111"/>${[86, 96, 106].map((x) => `<rect x="${x}" y="124" width="6" height="10" fill="#111"/>`).join('')}</g>`;
}

const hex = (r) => Array.from({ length: 6 }, (_, i) => `${(100 + Math.cos(-Math.PI / 2 + (i * Math.PI) / 3) * r).toFixed(1)},${(100 + Math.sin(-Math.PI / 2 + (i * Math.PI) / 3) * r).toFixed(1)}`).join(' ');

let uid = 0;
export function medalSvg(kind) {
  const [main, dark, light, ico, wings] = KIND[kind] ?? KIND.s2;
  const id = `md${++uid}`;
  const wing = (k) =>
    `<g transform="translate(100 0) scale(${k} 1) translate(-100 0)"><path d="M62 92 C 36 80 16 82 4 92 C 20 94 26 98 30 104 C 16 104 10 110 6 118 C 22 116 30 118 36 122 C 26 126 22 132 20 140 C 36 134 50 128 64 118Z" fill="url(#${id}w)" stroke="${dark}" stroke-width="2"/></g>`;
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.5" stop-color="${main}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${main}"/></linearGradient>
    <radialGradient id="${id}g"><stop offset="0" stop-color="${main}" stop-opacity="0.55"/><stop offset="1" stop-color="${main}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${id}c"><polygon points="${hex(62)}"/></clipPath>
  </defs>
  <circle cx="100" cy="100" r="96" fill="url(#${id}g)" class="md-glow"/>
  ${wings ? wing(1) + wing(-1) : ''}
  <path d="M70 150 L62 186 L80 176 L92 190 L100 156 L108 190 L120 176 L138 186 L130 150Z" fill="${main}" stroke="${dark}" stroke-width="2"/>
  <polygon points="${hex(66)}" fill="${dark}"/>
  <polygon points="${hex(62)}" fill="url(#${id}m)"/>
  <polygon points="${hex(50)}" fill="${dark}" opacity="0.55"/>
  <polygon points="${hex(50)}" fill="none" stroke="${light}" stroke-opacity="0.6" stroke-width="2"/>
  <g class="md-ico">${(ICON[kind] ?? ICON.s2)(ico)}</g>
  <g clip-path="url(#${id}c)"><rect class="md-shine" x="-60" y="20" width="40" height="160" fill="url(#${id}s)" transform="skewX(-20)"/></g>
</svg>`;
}
