// Nyx, the raid handler who walks new players through the game: an illustrated portrait
// (inline SVG, no image files) that breathes, blinks and moves her lips with her voice.

export function nyxSvg() {
  // anime-style: big glossy eyes, sharp bangs, soft face; an adult handler in a tactical jacket
  return `<svg class="nyx-svg" viewBox="0 0 240 300" aria-hidden="true">
  <defs>
    <radialGradient id="nx-glow" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#f7931a" stop-opacity=".42"/><stop offset=".55" stop-color="#b06cff" stop-opacity=".08"/><stop offset="1" stop-color="#f7931a" stop-opacity="0"/></radialGradient>
    <linearGradient id="nx-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7d6"/><stop offset="1" stop-color="#f6c7ac"/></linearGradient>
    <linearGradient id="nx-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a3a6b"/><stop offset=".55" stop-color="#241a38"/><stop offset="1" stop-color="#0e0a18"/></linearGradient>
    <linearGradient id="nx-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c7b3ff" stop-opacity="0"/><stop offset=".5" stop-color="#e3d8ff" stop-opacity=".8"/><stop offset="1" stop-color="#c7b3ff" stop-opacity="0"/></linearGradient>
    <linearGradient id="nx-jacket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#252d40"/><stop offset="1" stop-color="#0a0d14"/></linearGradient>
    <linearGradient id="nx-iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2a08"/><stop offset=".45" stop-color="#d9741a"/><stop offset="1" stop-color="#ffd27a"/></linearGradient>
    <clipPath id="nx-eyeL"><path d="M88 110 C90 99 108 95 117 104 C116 115 106 121 95 119 C91 117 89 114 88 110Z"/></clipPath>
    <clipPath id="nx-eyeR"><path d="M152 110 C150 99 132 95 123 104 C124 115 134 121 145 119 C149 117 151 114 152 110Z"/></clipPath>
  </defs>
  <circle cx="120" cy="128" r="120" fill="url(#nx-glow)"/>
  <g class="nx-body">
    <!-- hair, back: long, falling past the shoulders -->
    <path d="M60 110 C52 52 88 24 122 24 C160 24 192 54 184 112 C182 150 198 190 188 222 L170 214 L160 236 L148 214 L92 214 L80 236 L70 214 L52 222 C42 190 58 150 60 110Z" fill="url(#nx-hair)"/>
    <!-- jacket and collar -->
    <path d="M18 300 C22 240 58 208 98 200 L142 200 C182 208 218 240 222 300Z" fill="url(#nx-jacket)"/>
    <path d="M98 200 L120 240 L142 200 L154 216 L120 272 L86 216Z" fill="#141a28"/>
    <path d="M56 238 C70 224 86 216 96 214" stroke="#f7931a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M184 238 C170 224 154 216 144 214" stroke="#f7931a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="152" y="240" width="32" height="11" rx="2" fill="#f7931a"/>
    <text x="168" y="248.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="#140b00" font-family="monospace">NYX</text>
    <!-- neck -->
    <path d="M108 160 L108 202 C114 210 126 210 132 202 L132 160Z" fill="#f2bfa2"/>
    <path d="M108 168 C114 178 126 178 132 168 L132 184 C126 192 114 192 108 184Z" fill="#d9967a" opacity=".5"/>
    <g class="nx-head">
      <!-- face: soft cheeks, a small pointed chin -->
      <path d="M84 102 C84 66 100 50 120 50 C140 50 156 66 156 102 C156 128 146 152 126 166 C122 169 118 169 114 166 C94 152 84 128 84 102Z" fill="url(#nx-skin)"/>
      <path d="M148 120 C146 140 138 154 124 165 C142 158 152 140 154 118Z" fill="#e9a98d" opacity=".45"/>
      <!-- headset -->
      <path d="M74 100 C70 54 96 32 122 32 C150 32 174 54 170 100" stroke="#3a4152" stroke-width="6" fill="none" stroke-linecap="round"/>
      <rect x="160" y="96" width="18" height="30" rx="8" fill="#232835"/>
      <rect x="164" y="102" width="10" height="18" rx="4" fill="#f7931a"/>
      <path d="M169 124 C170 146 158 154 140 154" stroke="#232835" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="138" cy="154" r="3.6" fill="#f7931a"/>
      <!-- brows: thin, a little arched -->
      <path d="M92 92 C98 87 107 86 113 89" stroke="#3a2a4a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M127 89 C133 86 142 87 148 92" stroke="#3a2a4a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <!-- eyes: big, glossy, two highlights each -->
      <g class="nx-eyes">
        <!-- each eye is drawn once at the centre line and moved into place -->
        <g transform="translate(-3 0)">
          <path d="M88 110 C90 99 108 95 117 104 C116 115 106 121 95 119 C91 117 89 114 88 110Z" fill="#fffaf5"/>
          <g class="nx-look"><g clip-path="url(#nx-eyeL)"><ellipse cx="104" cy="109" rx="9" ry="11" fill="url(#nx-iris)"/><ellipse cx="104" cy="110" rx="4.2" ry="5.6" fill="#2a1206"/><ellipse cx="100.5" cy="104" rx="3.2" ry="3.8" fill="#fff"/><circle cx="108" cy="114" r="1.6" fill="#fff" opacity=".9"/></g></g>
          <path d="M87 111 C89 99 108 94 118 104" stroke="#1a1020" stroke-width="3.4" fill="none" stroke-linecap="round"/>
          <path d="M88 107 L82 101" stroke="#1a1020" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M96 119.5 C102 121 110 119 115 115" stroke="#8a5560" stroke-width="1.1" fill="none" opacity=".7"/>
          <g class="nx-lids">
            <path d="M86 96 L118 96 L118 106 C112 116 96 118 87 110Z" fill="#fbdcc8"/>
            <path d="M87 110 C96 117 110 116 117 106" stroke="#1a1020" stroke-width="2.6" fill="none" stroke-linecap="round"/>
          </g>
        </g>
        <g transform="translate(3 0)">
          <path d="M152 110 C150 99 132 95 123 104 C124 115 134 121 145 119 C149 117 151 114 152 110Z" fill="#fffaf5"/>
          <g class="nx-look"><g clip-path="url(#nx-eyeR)"><ellipse cx="136" cy="109" rx="9" ry="11" fill="url(#nx-iris)"/><ellipse cx="136" cy="110" rx="4.2" ry="5.6" fill="#2a1206"/><ellipse cx="132.5" cy="104" rx="3.2" ry="3.8" fill="#fff"/><circle cx="140" cy="114" r="1.6" fill="#fff" opacity=".9"/></g></g>
          <path d="M153 111 C151 99 132 94 122 104" stroke="#1a1020" stroke-width="3.4" fill="none" stroke-linecap="round"/>
          <path d="M152 107 L158 101" stroke="#1a1020" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M144 119.5 C138 121 130 119 125 115" stroke="#8a5560" stroke-width="1.1" fill="none" opacity=".7"/>
          <g class="nx-lids">
            <path d="M122 96 L154 96 L153 110 C144 118 128 116 122 106Z" fill="#fbdcc8"/>
            <path d="M153 110 C144 117 130 116 123 106" stroke="#1a1020" stroke-width="2.6" fill="none" stroke-linecap="round"/>
          </g>
        </g>
      </g>
      <!-- nose: a tiny shadow; blush in anime hatching -->
      <path d="M121 124 C121.5 127 120.5 129 119 130" stroke="#d48e74" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <ellipse cx="97" cy="128" rx="8" ry="4" fill="#ff8f9a" opacity=".32"/>
      <ellipse cx="143" cy="128" rx="8" ry="4" fill="#ff8f9a" opacity=".32"/>
      <path d="M92 129 L95 125 M96 130 L99 126 M100 130 L103 126 M138 130 L141 126 M142 130 L145 126 M146 129 L149 125" stroke="#f07a87" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>
      <!-- mouth: a small confident smile that opens with her voice -->
      <g class="nx-mouth">
        <ellipse class="nx-open" cx="120" cy="142" rx="5" ry="1.2" fill="#7a1f33"/>
        <path d="M112 140 C116 143 124 143 128 140" stroke="#a8384d" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path class="nx-lower" d="M115.5 144.5 C118 146 122 146 124.5 144.5" stroke="#e98a96" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>
      </g>
      <!-- hair, front: sharp bangs, side locks, a gloss band and one orange strand -->
      <path d="M80 104 C72 62 94 36 122 36 C152 36 172 58 166 100 C162 92 158 84 152 80 L150 96 C146 86 140 78 132 74 L130 92 C126 82 120 76 112 74 L108 90 C104 82 100 78 94 78 L92 96 C88 92 86 92 84 96Z" fill="url(#nx-hair)"/>
      <path d="M84 96 C80 124 82 150 74 176 C70 150 72 124 78 100Z" fill="url(#nx-hair)"/>
      <path d="M158 96 C164 126 162 152 170 178 C176 150 172 122 164 98Z" fill="url(#nx-hair)"/>
      <path d="M92 58 C106 46 136 44 152 56" stroke="url(#nx-shine)" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M140 42 C152 50 160 62 160 80" stroke="#f7931a" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".95"/>
    </g>
  </g>
</svg>`;
}

// Mounts Nyx into `el` and returns controls: talk(level 0..1) moves the lips; she blinks
// and breathes on her own.
export function createNyx(el) {
  el.innerHTML = nyxSvg();
  const svg = el.querySelector('svg');
  const lids = svg.querySelectorAll('.nx-lids');
  const open = svg.querySelector('.nx-open');
  const lower = svg.querySelectorAll('.nx-lower');
  const look = svg.querySelectorAll('.nx-look');
  let alive = true;
  let mouth = 0;
  const blink = () => {
    if (!alive) return;
    for (const l of lids) l.classList.add('shut');
    setTimeout(() => lids.forEach((l) => l.classList.remove('shut')), 140);
    setTimeout(blink, 2200 + Math.random() * 3200);
  };
  setTimeout(blink, 1200);
  const glance = () => {
    if (!alive) return;
    const x = (Math.random() - 0.5) * 3;
    const y = (Math.random() - 0.5) * 1.5;
    for (const l of look) l.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    setTimeout(glance, 1500 + Math.random() * 2500);
  };
  setTimeout(glance, 900);
  return {
    talk(level) {
      mouth += (Math.max(0, Math.min(1, level)) - mouth) * 0.5;
      open.setAttribute('ry', (1.2 + mouth * 5.2).toFixed(2));
      open.setAttribute('rx', (5 + mouth * 1.8).toFixed(2));
      open.setAttribute('cy', (142 + mouth * 2.2).toFixed(2));
      for (const l of lower) l.setAttribute('transform', `translate(0 ${(mouth * 4.4).toFixed(2)})`);
    },
    destroy() {
      alive = false;
    },
  };
}
