// Nyx, the raid handler who walks new players through the game: an illustrated portrait
// (inline SVG, no image files) that breathes, blinks and moves her lips with her voice.

export function nyxSvg() {
  return `<svg class="nyx-svg" viewBox="0 0 240 300" aria-hidden="true">
  <defs>
    <radialGradient id="nx-glow" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#f7931a" stop-opacity=".42"/><stop offset=".55" stop-color="#f7931a" stop-opacity=".07"/><stop offset="1" stop-color="#f7931a" stop-opacity="0"/></radialGradient>
    <radialGradient id="nx-skin" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="#ffdcc2"/><stop offset=".6" stop-color="#f0bb98"/><stop offset="1" stop-color="#c98b6c"/></radialGradient>
    <linearGradient id="nx-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a2f47"/><stop offset=".5" stop-color="#1a1522"/><stop offset="1" stop-color="#08070c"/></linearGradient>
    <linearGradient id="nx-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a7aa6" stop-opacity="0"/><stop offset=".5" stop-color="#b9a9d6" stop-opacity=".55"/><stop offset="1" stop-color="#8a7aa6" stop-opacity="0"/></linearGradient>
    <linearGradient id="nx-jacket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#222a3a"/><stop offset="1" stop-color="#0a0d14"/></linearGradient>
    <linearGradient id="nx-lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d23c55"/><stop offset="1" stop-color="#8c1a31"/></linearGradient>
    <radialGradient id="nx-shadow" cx="50%" cy="60%" r="60%"><stop offset="0" stop-color="#7a3d8c" stop-opacity=".55"/><stop offset="1" stop-color="#e0882c" stop-opacity="0"/></radialGradient>
    <radialGradient id="nx-iris" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#ffe29a"/><stop offset=".5" stop-color="#f08d1f"/><stop offset="1" stop-color="#5c2e08"/></radialGradient>
  </defs>
  <circle cx="120" cy="128" r="120" fill="url(#nx-glow)"/>
  <g class="nx-body">
    <!-- hair, back: a long sleek bob -->
    <path d="M56 120 C48 60 84 26 124 26 C170 26 200 62 190 122 C188 158 196 186 184 206 L62 206 C48 186 60 156 56 120Z" fill="url(#nx-hair)"/>
    <!-- shoulders, jacket, collar -->
    <path d="M16 300 C20 238 56 206 98 198 L142 198 C184 206 220 238 224 300Z" fill="url(#nx-jacket)"/>
    <path d="M98 198 L120 244 L142 198 L152 214 L120 276 L88 214Z" fill="#131826"/>
    <path d="M58 236 C72 222 86 214 96 212" stroke="#f7931a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M182 236 C168 222 154 214 144 212" stroke="#f7931a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M40 300 C44 270 52 252 62 242" stroke="#2c3549" stroke-width="2" fill="none"/>
    <rect x="152" y="238" width="32" height="11" rx="2" fill="#f7931a"/>
    <text x="168" y="246.5" text-anchor="middle" font-size="7.5" font-weight="700" fill="#140b00" font-family="monospace">NYX</text>
    <!-- neck -->
    <path d="M104 168 L104 200 C112 210 128 210 136 200 L136 168Z" fill="#e2a585"/>
    <path d="M104 178 C112 190 128 190 136 178 L136 194 C128 204 112 204 104 194Z" fill="#b8795c" opacity=".55"/>
    <g class="nx-head">
      <!-- face -->
      <path d="M82 104 C82 70 99 50 121 50 C144 50 160 70 160 104 C160 136 146 162 121 172 C97 162 82 136 82 104Z" fill="url(#nx-skin)"/>
      <path d="M151 112 C151 140 141 158 123 170 C144 164 158 142 159 112Z" fill="#b87558" opacity=".35"/>
      <path d="M90 128 C94 146 104 160 118 168 C104 166 92 150 88 132Z" fill="#b87558" opacity=".2"/>
      <!-- ear + headset band and cup -->
      <ellipse cx="82" cy="110" rx="6" ry="10" fill="#e2a585"/>
      <path d="M74 98 C70 54 98 34 122 34 C150 34 174 56 170 98" stroke="#3a4152" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M78 70 C88 46 106 38 122 38" stroke="#5a6378" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <rect x="160" y="94" width="18" height="30" rx="8" fill="#232835"/>
      <rect x="164" y="100" width="10" height="18" rx="4" fill="#f7931a"/>
      <path d="M169 122 C170 146 158 158 140 158" stroke="#232835" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <circle cx="138" cy="158" r="4" fill="#f7931a"/>
      <!-- brows: high, arched -->
      <path d="M92 90 C98 83 108 82 115 86" stroke="#231a24" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M127 86 C135 81 146 83 151 90" stroke="#231a24" stroke-width="3" fill="none" stroke-linecap="round"/>
      <!-- smoky lids -->
      <ellipse cx="104" cy="99" rx="14" ry="7" fill="url(#nx-shadow)"/>
      <ellipse cx="139" cy="99" rx="14" ry="7" fill="url(#nx-shadow)"/>
      <!-- eyes: almond, a little heavy-lidded -->
      <g class="nx-eyes">
        <path d="M92 104 C97 98 109 97 116 103 C110 109 98 109 92 104Z" fill="#fff6ee"/>
        <path d="M127 103 C134 97 146 98 151 104 C145 109 133 109 127 103Z" fill="#fff6ee"/>
        <g class="nx-look"><circle cx="104.5" cy="103.5" r="4.8" fill="url(#nx-iris)"/><circle cx="138.5" cy="103.5" r="4.8" fill="url(#nx-iris)"/><circle cx="104.5" cy="103.5" r="2.1" fill="#1a0d05"/><circle cx="138.5" cy="103.5" r="2.1" fill="#1a0d05"/><circle cx="103" cy="102" r="1.2" fill="#fff"/><circle cx="137" cy="102" r="1.2" fill="#fff"/></g>
        <g class="nx-lids">
          <path d="M90 104 C96 95 110 95 118 103 L118 94 L90 94Z" fill="#e7ad8b"/>
          <path d="M125 103 C133 95 147 95 153 104 L153 94 L125 94Z" fill="#e7ad8b"/>
        </g>
        <!-- liner with a cat-eye wing, and lashes -->
        <path d="M91 103 C97 98 109 97 116 102" stroke="#120a10" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M92 103 L85 98" stroke="#120a10" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M127 102 C134 97 146 98 151 103 L158 98" stroke="#120a10" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M95 106 C100 108.5 108 108.5 113 106.5" stroke="#6b3b3a" stroke-width="1" fill="none" opacity=".6"/>
        <path d="M130 106.5 C135 108.5 143 108.5 148 106" stroke="#6b3b3a" stroke-width="1" fill="none" opacity=".6"/>
      </g>
      <!-- nose: just a tip and a shadow -->
      <path d="M123 110 C123 120 122 126 120 129" stroke="#c4836a" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="M115 131 C118 133.5 124 133.5 127 131" stroke="#a9654e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <!-- blush, highlight, beauty mark -->
      <ellipse cx="97" cy="124" rx="9" ry="5" fill="#f08a8a" opacity=".32"/>
      <ellipse cx="147" cy="124" rx="8" ry="5" fill="#f08a8a" opacity=".28"/>
      <ellipse cx="100" cy="116" rx="6" ry="2.5" fill="#fff" opacity=".22"/>
      <circle cx="141" cy="138" r="1.3" fill="#5a2c22"/>
      <!-- lips: full, a little shine; the dark inner mouth opens with her voice -->
      <g class="nx-mouth">
        <ellipse class="nx-open" cx="121" cy="145" rx="8.5" ry="2.5" fill="#3a0d17"/>
        <path d="M108 144 C112 139 117 140 121 142 C125 140 130 139 134 144 C128 145.5 124 146 121 146 C118 146 114 145.5 108 144Z" fill="url(#nx-lip)"/>
        <path class="nx-lower" d="M109 145 C114 146.5 128 146.5 133 145 C130 154 112 154 109 145Z" fill="url(#nx-lip)"/>
        <path class="nx-lower" d="M115 149 C118 150.5 124 150.5 127 149" stroke="#ff9eb0" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".75"/>
      </g>
      <!-- hair, front: side-swept bangs over one eye, a gloss line, one orange strand -->
      <path d="M80 108 C72 64 96 38 124 38 C154 38 172 60 166 98 C156 80 142 70 124 68 C112 68 100 76 94 88 C88 100 86 112 86 126 C86 140 86 152 90 164 C78 152 76 130 80 108Z" fill="url(#nx-hair)"/>
      <path d="M124 68 C144 66 162 78 166 98 C160 110 156 122 156 136 C150 118 144 100 132 88 C128 82 126 76 124 68Z" fill="url(#nx-hair)"/>
      <path d="M96 56 C108 46 130 44 146 52" stroke="url(#nx-shine)" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M134 44 C150 50 162 64 164 84 C164 96 160 106 156 116" stroke="#f7931a" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".95"/>
      <path d="M160 100 C172 128 168 164 180 190 C164 178 156 150 156 124Z" fill="url(#nx-hair)"/>
      <path d="M82 124 C78 150 82 176 70 196 C66 170 72 144 78 120Z" fill="url(#nx-hair)"/>
    </g>
  </g>
</svg>`;
}

// Mounts Nyx into `el` and returns controls: talk(level 0..1) moves the lips; she blinks
// and breathes on her own.
export function createNyx(el) {
  el.innerHTML = nyxSvg();
  const svg = el.querySelector('svg');
  const lids = svg.querySelector('.nx-lids');
  const open = svg.querySelector('.nx-open');
  const lower = svg.querySelectorAll('.nx-lower');
  const look = svg.querySelector('.nx-look');
  let alive = true;
  let mouth = 0;
  const blink = () => {
    if (!alive) return;
    lids.classList.add('shut');
    setTimeout(() => lids.classList.remove('shut'), 140);
    setTimeout(blink, 2200 + Math.random() * 3200);
  };
  setTimeout(blink, 1200);
  const glance = () => {
    if (!alive) return;
    const x = (Math.random() - 0.5) * 3;
    const y = (Math.random() - 0.5) * 1.5;
    look.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    setTimeout(glance, 1500 + Math.random() * 2500);
  };
  setTimeout(glance, 900);
  return {
    talk(level) {
      mouth += (Math.max(0, Math.min(1, level)) - mouth) * 0.5;
      open.setAttribute('ry', (2.5 + mouth * 6.5).toFixed(2));
      open.setAttribute('cy', (145 + mouth * 2.5).toFixed(2));
      for (const l of lower) l.setAttribute('transform', `translate(0 ${(mouth * 5).toFixed(2)})`);
    },
    destroy() {
      alive = false;
    },
  };
}
