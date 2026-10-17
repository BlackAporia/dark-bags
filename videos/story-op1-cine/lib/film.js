// DARK BAGS, Operation 1 films: every frame is a pure function of time (seeded randomness only),
// so HyperFrames can seek anywhere and render deterministically.
//
// The look: a real night city in colour before the flash; after it, the world is single white
// lines that glow a little, with only the orange dust (and the runners' bags) in colour.
// Every shot is drawn into a full-res scene buffer, then graded: bloom (a blurred half-res copy
// added on top), a colour grade, vignette, film grain and the cut's transition.
(function () {
  const W = 1920;
  const H = 1080;
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    lin: (k) => k,
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    out: (k) => 1 - Math.pow(1 - k, 3),
    in: (k) => k * k * k,
    sine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
    expo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // a smooth wobble that is the same for the same inputs (hand-drawn lines that breathe)
  const wob = (x, y, t, a = 1) => a * (Math.sin(x * 0.013 + t * 2.1 + y * 0.007) * 0.6 + Math.sin(y * 0.019 - t * 1.7 + x * 0.004) * 0.4);

  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  // ------------------------------------------------------------- textures

  // film grain: a few tiles of noise, chosen by frame
  const GRAIN = [];
  for (let k = 0; k < 6; k++) {
    const c = mk(512, 512);
    const g = c.getContext('2d');
    const img = g.createImageData(512, 512);
    const r = rng(1000 + k);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    GRAIN.push(c);
  }

  // the wipe's body: grey erasure, rubbed and scratched
  const WIPE_TEX = (() => {
    const c = mk(1024, 1080);
    const g = c.getContext('2d');
    const r = rng(77);
    g.fillStyle = '#8b8f97';
    g.fillRect(0, 0, 1024, 1080);
    for (let i = 0; i < 2600; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '230,232,236' : '60,62,68'},${0.05 + r() * 0.12})`;
      g.lineWidth = 1 + r() * 5;
      g.beginPath();
      let x = r() * 1024;
      let y = r() * 1080;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 90;
        y += (r() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return c;
  })();

  // ------------------------------------------------------------- the world

  // a skyline layer: buildings with roofs, antennas and window grids
  function skyline(seed, { x0 = -600, x1 = 2600, base = 760, hMin = 160, hMax = 520, wMin = 70, wMax = 190 } = {}) {
    const r = rng(seed);
    const out = [];
    let x = x0;
    while (x < x1) {
      const w = wMin + r() * (wMax - wMin);
      const h = hMin + Math.pow(r(), 1.6) * (hMax - hMin);
      const roof = r();
      out.push({
        x,
        w,
        h,
        base,
        roof: roof < 0.18 ? 'antenna' : roof < 0.3 ? 'tank' : roof < 0.42 ? 'step' : roof < 0.5 ? 'spire' : 'flat',
        cols: Math.max(2, Math.floor(w / 22)),
        rows: Math.max(3, Math.floor(h / 30)),
        lit: rng(seed * 31 + Math.floor(x)),
        flick: r(),
      });
      x += w + 6 + r() * 26;
    }
    return out;
  }

  function buildingPath(g, b, wobT = null, amp = 0) {
    const L = b.x;
    const R = b.x + b.w;
    const T = b.base - b.h;
    const B = b.base + 400;
    const P = (x, y) => (wobT === null ? [x, y] : [x + wob(x, y, wobT, amp), y + wob(y, x, wobT, amp)]);
    g.beginPath();
    g.moveTo(...P(L, B));
    g.lineTo(...P(L, T));
    if (b.roof === 'step') {
      g.lineTo(...P(L + b.w * 0.2, T));
      g.lineTo(...P(L + b.w * 0.2, T - 40));
      g.lineTo(...P(R - b.w * 0.2, T - 40));
      g.lineTo(...P(R - b.w * 0.2, T));
    } else if (b.roof === 'spire') {
      g.lineTo(...P(L + b.w * 0.5, T - b.w * 0.6));
    }
    g.lineTo(...P(R, T));
    g.lineTo(...P(R, B));
  }

  function roofDetail(g, b, wobT = null, amp = 0) {
    const T = b.base - b.h;
    const cx = b.x + b.w * 0.6;
    const P = (x, y) => (wobT === null ? [x, y] : [x + wob(x, y, wobT, amp), y + wob(y, x, wobT, amp)]);
    if (b.roof === 'antenna') {
      g.beginPath();
      g.moveTo(...P(cx, T));
      g.lineTo(...P(cx, T - 90));
      g.moveTo(...P(cx - 14, T - 50));
      g.lineTo(...P(cx + 14, T - 50));
      g.stroke();
    } else if (b.roof === 'tank') {
      g.beginPath();
      g.moveTo(...P(cx - 18, T));
      g.lineTo(...P(cx - 14, T - 26));
      g.moveTo(...P(cx + 18, T));
      g.lineTo(...P(cx + 14, T - 26));
      g.stroke();
      g.strokeRect(cx - 22, T - 62, 44, 36);
    }
  }

  // the city before the flash: dark blocks against the dawn, warm windows
  function drawCityColour(g, layer, { fill, edge, win, winA = 1, t = 0, haze = 0 }) {
    for (const b of layer) {
      g.fillStyle = fill;
      buildingPath(g, b);
      g.closePath();
      g.fill();
      g.strokeStyle = edge;
      g.lineWidth = 2;
      roofDetail(g, b);
      if (b.roof === 'antenna' && Math.floor(t * 1.4 + b.flick * 5) % 2 === 0) {
        g.fillStyle = '#ff4d5e';
        g.beginPath();
        g.arc(b.x + b.w * 0.6, b.base - b.h - 90, 3.5, 0, TAU);
        g.fill();
      }
      // windows
      const r = rng(Math.floor(b.x * 7) + 3);
      const cw = b.w / b.cols;
      const rh = 30;
      for (let row = 0; row < b.rows; row++) {
        for (let col = 0; col < b.cols; col++) {
          const on = r();
          if (on > 0.42) continue;
          const tint = r();
          const flick = on < 0.02 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 9 + row)) : 1;
          g.globalAlpha = winA * flick * (0.55 + tint * 0.45);
          g.fillStyle = tint < 0.7 ? win : tint < 0.9 ? '#ffe6b0' : '#9ecbff';
          g.fillRect(b.x + col * cw + cw * 0.28, b.base - b.h + 14 + row * rh, cw * 0.44, rh * 0.42);
        }
      }
      g.globalAlpha = 1;
    }
    if (haze) {
      const gr = g.createLinearGradient(0, H * 0.45, 0, H);
      gr.addColorStop(0, `rgba(120,110,160,0)`);
      gr.addColorStop(1, `rgba(120,110,160,${haze})`);
      g.fillStyle = gr;
      g.fillRect(-2000, 0, 6000, H);
    }
  }

  // the city after the flash: outlines only, drawn on as `draw` goes 0 → 1 from (ox, oy)
  function drawCityLines(g, layer, { col = '#f4f1ea', lw = 2.2, t = 0, amp = 1.4, draw = 1, ox = W / 2, oy = H / 2, alpha = 1, windows = true, erase = null }) {
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const b of layer) {
      const d = Math.hypot(b.x + b.w / 2 - ox, b.base - b.h / 2 - oy) / 1500;
      let k = clamp((draw - d * 0.6) / 0.4);
      if (erase !== null) {
        const e = clamp((erase - b.x) / 140);
        if (e >= 1) continue;
        k *= 1 - e;
      }
      if (k <= 0) continue;
      g.globalAlpha = alpha * k;
      g.setLineDash(k < 1 ? [k * 900, 4000] : []);
      buildingPath(g, b, t, amp);
      g.stroke();
      g.setLineDash([]);
      roofDetail(g, b, t, amp);
      if (windows && k > 0.6) {
        g.globalAlpha = alpha * (k - 0.6) * 1.2;
        g.lineWidth = lw * 0.55;
        const r = rng(Math.floor(b.x * 7) + 3);
        const cw = b.w / b.cols;
        for (let row = 0; row < b.rows; row++) {
          for (let col2 = 0; col2 < b.cols; col2++) {
            if (r() > 0.32) {
              r();
              continue;
            }
            r();
            g.strokeRect(b.x + col2 * cw + cw * 0.28, b.base - b.h + 14 + row * 30, cw * 0.44, 12);
          }
        }
        g.lineWidth = lw;
      }
    }
    g.globalAlpha = 1;
  }

  // the OUTLINE satellite: a body, two long ribbed panels, a lens
  function satellite(g, x, y, s, { rot = 0, lens = 0, line = false, t = 0 } = {}) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(s, s);
    const stroke = line ? '#f4f1ea' : '#c7cbd6';
    g.lineWidth = 2 / s;
    // panels
    for (const d of [-1, 1]) {
      const px = d < 0 ? -230 : 40;
      if (!line) {
        const gr = g.createLinearGradient(px, -26, px + 190, 26);
        gr.addColorStop(0, '#1d2b52');
        gr.addColorStop(0.5, '#33508f');
        gr.addColorStop(1, '#1a2444');
        g.fillStyle = gr;
        g.fillRect(px, -24, 190, 48);
      }
      g.strokeStyle = stroke;
      g.strokeRect(px, -24, 190, 48);
      g.globalAlpha = 0.5;
      for (let i = 1; i < 8; i++) {
        g.beginPath();
        g.moveTo(px + i * 23.75, -24);
        g.lineTo(px + i * 23.75, 24);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(px, 0);
      g.lineTo(px + 190, 0);
      g.stroke();
      g.globalAlpha = 1;
      g.beginPath();
      g.moveTo(d < 0 ? -40 : 40, 0);
      g.lineTo(d < 0 ? -30 : 30, 0);
      g.stroke();
    }
    // body
    if (!line) {
      g.fillStyle = '#9aa1b1';
      g.fillRect(-30, -34, 60, 68);
      g.fillStyle = '#6b7280';
      g.fillRect(-30, 10, 60, 24);
    }
    g.strokeStyle = stroke;
    g.strokeRect(-30, -34, 60, 68);
    // dish
    g.beginPath();
    g.arc(0, -34, 16, Math.PI, 0);
    g.stroke();
    // lens: glows before it fires
    g.beginPath();
    g.arc(0, 34, 12, 0, TAU);
    g.fillStyle = lens > 0 ? `rgba(94,234,212,${0.4 + lens * 0.6})` : '#0f172a';
    g.fill();
    g.stroke();
    if (!line && Math.floor(t * 2) % 2 === 0) {
      g.fillStyle = '#ff4d5e';
      g.beginPath();
      g.arc(-26, -30, 3, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  // a scan beam: a cone of cyan light with scan lines running down it
  function beam(g, x, y, x2, y2, spread, a, t) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createLinearGradient(x, y, x2, y2);
    gr.addColorStop(0, `rgba(94,234,212,${0.55 * a})`);
    gr.addColorStop(1, `rgba(94,234,212,${0.05 * a})`);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x - 6, y);
    g.lineTo(x2 - spread, y2);
    g.lineTo(x2 + spread, y2);
    g.lineTo(x + 6, y);
    g.closePath();
    g.fill();
    g.strokeStyle = `rgba(167,255,243,${0.35 * a})`;
    g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.9 + i / 6) % 1;
      const yy = lerp(y, y2, k);
      const half = lerp(6, spread, k);
      const xx = lerp(x, x2, k);
      g.beginPath();
      g.moveTo(xx - half, yy);
      g.lineTo(xx + half, yy);
      g.stroke();
    }
    g.restore();
  }

  // ------------------------------------------------------------- people

  // a pose: hip position plus angles (torso from up; limbs from down), lengths in units of s
  const POSE = {
    stand: { tor: 0, head: 0, aL: [0.15, 0.1], aR: [-0.15, -0.1], lL: [0.08, 0], lR: [-0.08, 0] },
    lie: { tor: -1.52, head: -0.15, aL: [-2.6, 0.5], aR: [1.2, 0.25], lL: [1.5, 0.05], lR: [1.35, 0.35] },
    kneel: { tor: 0.25, head: 0.1, aL: [0.5, 0.6], aR: [-0.1, 0.3], lL: [-1.4, 1.5], lR: [0.4, 0] },
    look: { tor: -0.05, head: -0.25, aL: [0.2, 0.15], aR: [-0.2, -0.1], lL: [0.1, 0], lR: [-0.1, 0] },
    sit: { tor: -0.06, head: 0.1, aL: [0.9, -0.5], aR: [0.7, -0.3], lL: [1.5, -1.45], lR: [1.42, -1.4] },
  };
  function run(ph, lean = 0.32) {
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    return {
      tor: lean,
      head: 0.05,
      aL: [-1.1 * s + 0.2, -1.3 + 0.2 * c],
      aR: [1.1 * s + 0.2, -1.3 - 0.2 * c],
      lL: [0.95 * s, Math.max(0, 1.4 * c) + 0.15],
      lR: [-0.95 * s, Math.max(0, -1.4 * c) + 0.15],
      bob: Math.abs(c) * 0.08,
    };
  }
  function walk(ph, jit = 0) {
    const s = Math.sin(ph);
    return { tor: 0.05 + jit, head: jit * 2, aL: [0.35 * s, 0.2], aR: [-0.35 * s, 0.2], lL: [0.4 * s, Math.max(0, 0.5 * Math.cos(ph))], lR: [-0.4 * s, Math.max(0, -0.5 * Math.cos(ph))], bob: Math.abs(Math.cos(ph)) * 0.03 };
  }
  function mixPose(a, b, k) {
    const m = (x, y) => (Array.isArray(x) ? [lerp(x[0], y[0], k), lerp(x[1], y[1], k)] : lerp(x ?? 0, y ?? 0, k));
    const o = {};
    for (const key of ['tor', 'head', 'aL', 'aR', 'lL', 'lR', 'bob']) o[key] = m(a[key] ?? (key[0] === 'a' || key[0] === 'l' ? [0, 0] : 0), b[key] ?? (key[0] === 'a' || key[0] === 'l' ? [0, 0] : 0), k);
    return o;
  }

  // a stick figure: the game's runner, in white line (face: 1 right, -1 left)
  function stick(g, x, y, s, pose, { col = '#f4f1ea', lw = 3, face = 1, bag = false, scribble = 0, t = 0, glow = 0 } = {}) {
    g.save();
    g.translate(x, y - (pose.bob ?? 0) * s);
    g.scale(face, 1);
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const limb = (ox, oy, [a1, a2], l1, l2) => {
      const x1 = ox + Math.sin(a1) * l1;
      const y1 = oy + Math.cos(a1) * l1;
      const x2 = x1 + Math.sin(a1 + a2) * l2;
      const y2 = y1 + Math.cos(a1 + a2) * l2;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      return [x2, y2];
    };
    // torso
    const nx = Math.sin(pose.tor) * s;
    const ny = -Math.cos(pose.tor) * s;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(nx, ny);
    g.stroke();
    limb(0, 0, pose.lL, 0.52 * s, 0.5 * s);
    limb(0, 0, pose.lR, 0.52 * s, 0.5 * s);
    const sx = nx * 0.92;
    const sy = ny * 0.92;
    limb(sx, sy, pose.aL, 0.42 * s, 0.4 * s);
    limb(sx, sy, pose.aR, 0.42 * s, 0.4 * s);
    // the bag: an orange pack on the back
    if (bag) {
      g.save();
      g.translate(nx * 0.55 - Math.cos(pose.tor) * 0.16 * s, ny * 0.55 - Math.sin(pose.tor) * 0.16 * s);
      g.rotate(pose.tor);
      if (glow) {
        g.shadowColor = '#fb923c';
        g.shadowBlur = 16 * glow;
      }
      g.fillStyle = '#d9590f';
      g.strokeStyle = '#ffb067';
      g.lineWidth = lw * 0.55;
      const bw = 0.2 * s;
      const bh = 0.3 * s;
      g.beginPath();
      g.roundRect(-bw * 0.95, -bh / 2, bw, bh, bw * 0.35);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(-bw * 0.95 + bw * 0.25, -bh * 0.18);
      g.lineTo(-bw * 0.95 + bw * 0.75, -bh * 0.18);
      g.stroke();
      g.restore();
    }
    // head
    const hx = nx + Math.sin(pose.tor + pose.head) * 0.3 * s;
    const hy = ny - Math.cos(pose.tor + pose.head) * 0.3 * s;
    g.strokeStyle = col;
    g.lineWidth = lw;
    if (scribble) {
      const r = rng(Math.floor(scribble * 1000));
      g.lineWidth = lw * 0.7;
      g.beginPath();
      let a = r() * TAU;
      let px = hx + Math.cos(a) * 0.2 * s;
      let py = hy + Math.sin(a) * 0.2 * s;
      g.moveTo(px, py);
      for (let i = 0; i < 16; i++) {
        a += 1.7 + r() * 1.6 + Math.sin(t * 5 + i) * 0.12;
        const rr = 0.3 * s * (0.55 + r() * 0.5);
        const nx2 = hx + Math.cos(a) * rr;
        const ny2 = hy + Math.sin(a) * rr * 0.9;
        const ca = a - 0.9;
        g.quadraticCurveTo(hx + Math.cos(ca) * rr * 1.25, hy + Math.sin(ca) * rr * 1.1, nx2, ny2);
      }
      g.stroke();
    } else {
      g.beginPath();
      g.arc(hx, hy, 0.26 * s, 0, TAU);
      g.stroke();
    }
    g.restore();
  }

  // two eyes in the dark: hot cores, a tight glow, a long faint halo
  function eyes(g, x, y, gap, size, a) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const d of [-1, 1]) {
      const ex = x + d * gap;
      const halo = g.createRadialGradient(ex, y, 0, ex, y, size * 5);
      halo.addColorStop(0, `rgba(250,204,21,${0.35 * a})`);
      halo.addColorStop(1, 'rgba(250,204,21,0)');
      g.fillStyle = halo;
      g.fillRect(ex - size * 5, y - size * 5, size * 10, size * 10);
      g.fillStyle = `rgba(255,244,190,${a})`;
      g.beginPath();
      g.ellipse(ex, y, size, size * 0.42, d * 0.25, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  // ------------------------------------------------------------- particles

  // the orange dust: rising motes with a warm glow
  function dust(g, n, t, { seed = 5, x0 = 0, x1 = W, y0 = 0, y1 = H, rise = 30, size = 3, a = 1, cam = { x: 0, y: 0 }, par = 1 } = {}) {
    const r = rng(seed);
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const bx = x0 + r() * (x1 - x0);
      const by = y0 + r() * (y1 - y0);
      const sp = 0.5 + r();
      const ph = r() * TAU;
      const z = 0.4 + r() * 1.2;
      let y = by - t * rise * sp * z;
      y = ((((y - y0) % (y1 - y0)) + (y1 - y0)) % (y1 - y0)) + y0;
      const x = bx + Math.sin(t * 0.7 * sp + ph) * 26 * z - cam.x * par * z;
      const tw = 0.5 + 0.5 * Math.sin(t * 3 * sp + ph);
      const rad = size * z * (0.7 + tw * 0.5);
      const gr = g.createRadialGradient(x, y - cam.y * par * z, 0, x, y - cam.y * par * z, rad * 4);
      gr.addColorStop(0, `rgba(255,190,120,${0.9 * a * tw})`);
      gr.addColorStop(0.3, `rgba(251,146,60,${0.45 * a * tw})`);
      gr.addColorStop(1, 'rgba(251,146,60,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad * 4, y - cam.y * par * z - rad * 4, rad * 8, rad * 8);
    }
    g.restore();
  }

  // grey ash drifting (the world after the flash)
  function ash(g, n, t, { seed = 9, a = 0.5, fall = 20, wind = 30 } = {}) {
    const r = rng(seed);
    g.save();
    for (let i = 0; i < n; i++) {
      const z = 0.4 + r() * 1.4;
      const x = (((r() * W + t * wind * z) % (W + 40)) + W + 40) % (W + 40) - 20;
      const y = (((r() * H + t * fall * z) % (H + 40)) + H + 40) % (H + 40) - 20;
      g.fillStyle = `rgba(200,204,212,${a * (0.3 + r() * 0.7) * Math.min(1, z)})`;
      g.fillRect(x, y, 1.6 * z, 1.6 * z);
    }
    g.restore();
  }

  // ------------------------------------------------------------- grading

  const scene = mk(W, H);
  const half = mk(W / 2, H / 2);
  const S = scene.getContext('2d');
  const Hh = half.getContext('2d');

  function vignette(g, k = 0.75) {
    const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${k})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }

  function finish(g, t, { bloom = 0.55, grain = 0.07, vig = 0.7, tint = null, flash = 0, fadeIn = 1, shake = 0 } = {}) {
    // the scene, shaken
    const sx = shake ? Math.sin(t * 61) * shake + Math.sin(t * 37) * shake * 0.6 : 0;
    const sy = shake ? Math.cos(t * 53) * shake * 0.8 : 0;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.drawImage(scene, sx, sy);
    // bloom: a soft half-res copy laid over with "lighter"
    if (bloom > 0) {
      Hh.clearRect(0, 0, W / 2, H / 2);
      Hh.filter = 'blur(9px) brightness(1.2)';
      Hh.drawImage(scene, 0, 0, W / 2, H / 2);
      Hh.filter = 'none';
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = bloom;
      g.drawImage(half, sx, sy, W, H);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    if (tint) {
      g.globalCompositeOperation = 'soft-light';
      g.fillStyle = tint;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
    vignette(g, vig);
    // grain
    if (grain > 0) {
      const f = Math.floor(t * 24);
      const tile = GRAIN[f % GRAIN.length];
      const ox = (f * 137) % 512;
      const oy = (f * 251) % 512;
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = grain;
      for (let x = -ox; x < W; x += 512) for (let y = -oy; y < H; y += 512) g.drawImage(tile, x, y);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    if (flash > 0) {
      g.fillStyle = `rgba(255,255,255,${clamp(flash)})`;
      g.fillRect(0, 0, W, H);
    }
    if (fadeIn < 1) {
      g.fillStyle = `rgba(0,0,0,${1 - clamp(fadeIn)})`;
      g.fillRect(0, 0, W, H);
    }
  }

  // a camera over a 2D world: zoom about the frame centre, then pan
  function camera(g, cx, cy, zoom, rot = 0) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(W / 2, H / 2);
    g.rotate(rot);
    g.scale(zoom, zoom);
    g.translate(-cx, -cy);
  }

  function sky(g, top, mid, bottom) {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, top);
    gr.addColorStop(0.62, mid);
    gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }

  function stars(g, n, t, seed = 3, a = 1) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = r() * W;
      const y = r() * H * 0.55;
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + r() * 2) + i);
      g.fillStyle = `rgba(255,255,255,${a * (0.15 + r() * 0.5) * tw})`;
      g.fillRect(x, y, 1.6, 1.6);
    }
  }

  // ------------------------------------------------------------- shared sets

  const CITY = {
    far: skyline(11, { base: 700, hMin: 120, hMax: 320, wMin: 60, wMax: 140, x0: -900, x1: 2900 }),
    mid: skyline(23, { base: 760, hMin: 180, hMax: 460, wMin: 80, wMax: 170, x0: -900, x1: 2900 }),
    near: skyline(37, { base: 860, hMin: 260, hMax: 640, wMin: 120, wMax: 240, x0: -900, x1: 2900 }),
  };

  // a parallax pass of the colour city; camX moves the near layers more
  function colourCity(g, t, camX = 0, camY = 0, zoom = 1, { haze = 0.35, winA = 1 } = {}) {
    const layers = [
      [CITY.far, 0.25, '#151633', '#2b2d58', '#f6c56b', 0.55],
      [CITY.mid, 0.5, '#0d0e22', '#232548', '#ffb44c', 0.8],
      [CITY.near, 1, '#06070f', '#1a1c33', '#ffa53a', 1],
    ];
    for (const [L, p, fill, edge, win, wa] of layers) {
      g.save();
      g.translate(W / 2, H * 0.75);
      g.scale(lerp(1, zoom, p), lerp(1, zoom, p));
      g.translate(-W / 2 - camX * p, -H * 0.75 - camY * p);
      drawCityColour(g, L, { fill, edge, win, winA: winA * wa, t, haze: p < 1 ? haze * (1 - p) : 0 });
      g.restore();
    }
  }

  function lineCity(g, t, camX = 0, camY = 0, zoom = 1, { draw = 1, erase = null, alpha = 1, ox = W / 2, oy = H * 0.4 } = {}) {
    const layers = [
      [CITY.far, 0.25, 'rgba(244,241,234,0.35)', 1.4],
      [CITY.mid, 0.5, 'rgba(244,241,234,0.6)', 1.8],
      [CITY.near, 1, '#f4f1ea', 2.6],
    ];
    for (const [L, p, col, lw] of layers) {
      g.save();
      g.translate(W / 2, H * 0.75);
      g.scale(lerp(1, zoom, p), lerp(1, zoom, p));
      g.translate(-W / 2 - camX * p, -H * 0.75 - camY * p);
      const er = erase === null ? null : erase + camX * p;
      drawCityLines(g, L, { col, lw, t: t + p, draw, ox: ox + camX * p, oy, alpha, erase: er });
      g.restore();
    }
  }

  // the wipe wall: everything left of x is rubbed out; its edge is a live scribble
  function wipe(g, x, t, { top = -50, bottom = H + 50 } = {}) {
    if (x < -200) return;
    g.save();
    // body
    const off = (t * 120) % 1024;
    g.globalAlpha = 0.96;
    for (let xx = x - 1024 - off; xx < x + 40; xx += 1024) g.drawImage(WIPE_TEX, xx, top, 1024, bottom - top);
    g.globalAlpha = 1;
    // soft front
    const gr = g.createLinearGradient(x - 220, 0, x + 60, 0);
    gr.addColorStop(0, 'rgba(160,164,172,0)');
    gr.addColorStop(0.8, 'rgba(210,214,222,0.55)');
    gr.addColorStop(1, 'rgba(210,214,222,0)');
    g.fillStyle = gr;
    g.fillRect(x - 220, top, 280, bottom - top);
    // the scribbled edge
    const r = rng(Math.floor(t * 18));
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.shadowColor = '#ffffff';
    g.shadowBlur = 18;
    for (let pass = 0; pass < 3; pass++) {
      g.beginPath();
      for (let y = top; y < bottom; y += 18) {
        const xx = x + (r() - 0.5) * 70 + Math.sin(y * 0.02 + t * 6 + pass) * 24;
        if (y === top) g.moveTo(xx, y);
        else g.lineTo(xx, y);
      }
      g.globalAlpha = 0.5 - pass * 0.12;
      g.stroke();
    }
    g.shadowBlur = 0;
    g.globalAlpha = 1;
    // flakes torn off the edge
    const f = rng(91);
    for (let i = 0; i < 90; i++) {
      const life = (t * (0.6 + f() * 0.8) + f()) % 1;
      const fx = x + 10 + life * (120 + f() * 260);
      const fy = top + f() * (bottom - top) + Math.sin(t * 3 + i) * 20 - life * 60;
      g.fillStyle = `rgba(235,238,244,${(1 - life) * 0.8})`;
      g.fillRect(fx, fy, 3 + f() * 4, 2 + f() * 3);
    }
    g.restore();
  }

  // a street in one-point perspective, drawn in line: kerbs, lamps, a car or two
  function street(g, t, { vx = W / 2, vy = H * 0.44, col = 'rgba(244,241,234,0.85)', lw = 2.4, cars = true, lamps = true } = {}) {
    g.save();
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.lineCap = 'round';
    const lines = [
      [-900, H],
      [W + 900, H],
      [200, H],
      [W - 200, H],
    ];
    for (const [x, y] of lines) {
      g.beginPath();
      g.moveTo(vx + wob(x, y, t, 1), vy);
      g.lineTo(x, y);
      g.stroke();
    }
    // lane dashes
    g.setLineDash([40, 60]);
    g.lineDashOffset = -t * 30;
    g.beginPath();
    g.moveTo(vx, vy);
    g.lineTo(W / 2 + (W / 2 - vx) * 0.1, H);
    g.stroke();
    g.setLineDash([]);
    // building fronts
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const k = Math.pow(0.72, i);
        const x = vx + side * (W * 0.62) * k;
        const top = vy - H * 0.95 * k;
        const bot = vy + (H - vy) * k * 0.55;
        g.beginPath();
        g.moveTo(x, bot);
        g.lineTo(x + wob(x, top, t, 1.2), top);
        g.stroke();
        if (i < 5) {
          g.globalAlpha = 0.5;
          for (let r = 1; r < 6; r++) {
            const yy = lerp(top, bot, r / 6);
            g.beginPath();
            g.moveTo(x, yy);
            g.lineTo(x + side * -40 * k, yy);
            g.stroke();
          }
          g.globalAlpha = 1;
        }
      }
    }
    // lamps
    if (lamps) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const k = Math.pow(0.6, i);
          const x = vx + side * W * 0.45 * k;
          const bot = vy + (H - vy) * k * 0.6;
          const top = bot - 360 * k;
          g.beginPath();
          g.moveTo(x, bot);
          g.lineTo(x, top);
          g.lineTo(x - side * 50 * k, top);
          g.stroke();
          g.beginPath();
          g.arc(x - side * 50 * k, top + 10 * k, 8 * k, 0, TAU);
          g.stroke();
        }
      }
    }
    if (cars) {
      const car = (x, y, s) => {
        g.beginPath();
        g.moveTo(x - 110 * s, y);
        g.lineTo(x - 110 * s, y - 40 * s);
        g.lineTo(x - 60 * s, y - 44 * s);
        g.lineTo(x - 35 * s, y - 80 * s);
        g.lineTo(x + 45 * s, y - 80 * s);
        g.lineTo(x + 75 * s, y - 44 * s);
        g.lineTo(x + 110 * s, y - 40 * s);
        g.lineTo(x + 110 * s, y);
        g.closePath();
        g.stroke();
        for (const wx of [-62, 62]) {
          g.beginPath();
          g.arc(x + wx * s, y, 22 * s, 0, TAU);
          g.stroke();
        }
      };
      car(W * 0.2, H * 0.86, 1.15);
      car(W * 0.78, H * 0.66, 0.6);
    }
    g.restore();
  }

  // ======================================================================== THE FILMS

  // ---------------------------------------------------------------- op1-intro (34 s)
  function intro(t) {
    const g = S;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    let post = {};

    if (t < 4.7) {
      // A. Day zero, 06:12: the city before dawn. A slow push in; three satellites cross.
      const k = t / 4.7;
      sky(g, '#0b0b24', '#2b1f4f', '#6b3a4f');
      // the dawn behind the towers
      const sun = g.createRadialGradient(W * 0.62, H * 0.78, 10, W * 0.62, H * 0.78, H * 0.9);
      sun.addColorStop(0, 'rgba(255,170,110,0.45)');
      sun.addColorStop(1, 'rgba(255,170,110,0)');
      g.fillStyle = sun;
      g.fillRect(0, 0, W, H);
      stars(g, 160, t, 3, 1 - k * 0.3);
      for (let i = 0; i < 3; i++) satellite(g, -200 + (t * 70 + i * 620) % 2400, 120 + i * 70, 0.32 - i * 0.05, { rot: -0.08, t: t + i });
      g.save();
      g.translate(W / 2, H);
      g.scale(0.78, 0.78);
      g.translate(-W / 2, -H + 40);
      colourCity(g, t, k * 120, 0, 1 + E.sine(k) * 0.08, { haze: 0.45 });
      g.restore();
      post = { bloom: 0.45, grain: 0.06, vig: 0.75, fadeIn: seg(t, 0, 1.4), tint: 'rgba(120,90,200,0.18)' };
    } else if (t < 7) {
      // B. Close on one satellite: the lens wakes, the beams fire down.
      const lt = t - 4.7;
      sky(g, '#05060f', '#0b1028', '#141a3a');
      stars(g, 220, t, 8, 0.8);
      // the earth's rim, far below
      g.save();
      const rim = g.createRadialGradient(W * 0.5, H * 2.4, H * 1.5, W * 0.5, H * 2.4, H * 1.62);
      rim.addColorStop(0, 'rgba(70,90,180,0.5)');
      rim.addColorStop(0.5, 'rgba(120,150,255,0.25)');
      rim.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rim;
      g.fillRect(0, 0, W, H);
      g.restore();
      const lens = seg(lt, 0.6, 1.6);
      const x = 760 + lt * 60;
      const y = 400 - lt * 14;
      if (lt > 1.4) {
        const a = seg(lt, 1.4, 1.8);
        beam(g, x, y + 95, x - 180, H + 80, 260 + lt * 40, a, t);
        beam(g, x, y + 95, x + 260, H + 80, 200 + lt * 30, a * 0.8, t + 0.3);
      }
      satellite(g, x, y, 2.1 + lt * 0.06, { rot: -0.12 + lt * 0.01, lens, t });
      // lens flare
      if (lens > 0) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const fl = g.createRadialGradient(x, y + 72, 0, x, y + 72, 260 * lens);
        fl.addColorStop(0, `rgba(170,255,240,${0.7 * lens})`);
        fl.addColorStop(1, 'rgba(94,234,212,0)');
        g.fillStyle = fl;
        g.fillRect(0, 0, W, H);
        g.fillStyle = `rgba(150,255,240,${0.25 * lens})`;
        g.fillRect(0, y + 70, W, 3);
        g.restore();
      }
      post = { bloom: 0.7, grain: 0.06, vig: 0.8, fadeIn: seg(lt, 0, 0.25) };
    } else if (t < 8) {
      // C. The beams sweep the roofs; everything starts to hum and shake.
      const lt = t - 7;
      sky(g, '#0b0b24', '#2b1f4f', '#6b3a4f');
      stars(g, 120, t, 3, 0.6);
      colourCity(g, t, 140 + lt * 40, 0, 1.1 + lt * 0.05, { haze: 0.4 });
      for (let i = 0; i < 3; i++) {
        const sx = 300 + i * 650 + Math.sin(t * 2 + i) * 60;
        beam(g, sx, -40, sx + Math.sin(t * 3 + i * 2) * 300, H, 160 + lt * 220, 0.8 + lt * 0.6, t + i);
      }
      post = { bloom: 0.6 + lt * 0.9, grain: 0.07, vig: 0.7, shake: lt * 10, flash: Math.pow(seg(lt, 0.55, 1), 2) };
    } else if (t < 9.1) {
      // D. The flash: a white-out with a ring running through it.
      const lt = t - 8;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = `rgba(150,220,255,${0.6 * (1 - lt)})`;
      g.lineWidth = 30 * (1 - lt);
      g.beginPath();
      g.arc(W / 2, H * 0.45, lt * 1400, 0, TAU);
      g.stroke();
      post = { bloom: 0, grain: 0.04, vig: 0.2, flash: lt < 0.7 ? 1 - lt * 0.2 : lerp(0.86, 0.6, seg(lt, 0.7, 1.1)) };
    } else if (t < 13.1) {
      // E. One line: the skyline comes back as outlines, drawn from where the flash hit.
      const lt = t - 9.1;
      g.fillStyle = '#05060a';
      g.fillRect(0, 0, W, H);
      const hz = g.createLinearGradient(0, H * 0.4, 0, H);
      hz.addColorStop(0, 'rgba(60,62,70,0)');
      hz.addColorStop(1, 'rgba(60,62,70,0.35)');
      g.fillStyle = hz;
      g.fillRect(0, 0, W, H);
      lineCity(g, t, 120 - lt * 30, 0, 1.12 - lt * 0.025, { draw: E.out(seg(lt, 0, 3.2)) * 1.6, ox: W / 2, oy: H * 0.4 });
      ash(g, 160, t, { a: 0.45 });
      dust(g, 18, t, { seed: 4, rise: 20, size: 2.4, a: seg(lt, 2, 4) * 0.8 });
      post = { bloom: 0.75, grain: 0.09, vig: 0.8, flash: Math.max(0, 0.6 - lt * 0.8) };
    } else if (t < 18) {
      // F. Down in the street: the Scribbles wander; one turns to look at us.
      const lt = t - 13.1;
      g.fillStyle = '#05060a';
      g.fillRect(0, 0, W, H);
      const camx = lt * 18;
      g.save();
      g.translate(-camx * 0.4, 0);
      street(g, t, { vx: W / 2 + 40, vy: H * 0.42 });
      g.restore();
      // the wandering ones, far to near
      const crowd = [
        [0.38, 0.52, 0.25, 1, 0.7],
        [0.62, 0.5, 0.22, -1, 0.5],
        [0.47, 0.57, 0.32, 1, 0.9],
        [0.75, 0.6, 0.38, -1, 0.6],
        [0.25, 0.66, 0.46, 1, 0.8],
      ];
      for (const [fx, fy, s, face, sp] of crowd) {
        const x = fx * W + Math.sin(t * 0.5 * sp + fx * 9) * 40 - camx * s;
        const y = fy * H + 160 * s;
        stick(g, x, y, 260 * s, walk(t * 2.2 * sp + fx * 10, Math.sin(t * 7 + fx * 30) * 0.08), { lw: 2 + s * 3, face, scribble: fx + 0.1, t, col: 'rgba(225,228,236,0.9)' });
      }
      // the near one: it stops and turns its head of lines towards the camera
      const near = seg(lt, 2.8, 3.6);
      const nx = W * 0.7 - camx * 0.9;
      stick(g, nx, H * 1.05, 520, mixPose(walk(t * 1.6, Math.sin(t * 9) * 0.06), POSE.look, near), { lw: 7, face: near > 0.5 ? -1 : 1, scribble: 0.77, t, col: '#f4f1ea' });
      ash(g, 200, t, { a: 0.5, wind: 16, fall: 26 });
      dust(g, 14, t, { seed: 21, rise: 14, size: 2.2, a: 0.5 });
      post = { bloom: 0.6, grain: 0.1, vig: 0.85, fadeIn: seg(lt, 0, 0.4) };
    } else if (t < 23) {
      // G. The orange dust rises; the camera follows it down to someone lying in the street.
      const lt = t - 18;
      const k = E.inOut(seg(lt, 0.4, 4.2));
      g.fillStyle = '#06070b';
      g.fillRect(0, 0, W, H);
      g.save();
      g.translate(0, lerp(-500, 0, k));
      // asphalt and kerb in line
      g.strokeStyle = 'rgba(244,241,234,0.55)';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const y = H * 0.72 + i * i * 9;
        g.beginPath();
        g.moveTo(-50, y + wob(0, y, t, 2));
        g.lineTo(W + 50, y + wob(W, y, t, 2));
        g.globalAlpha = 0.35 - i * 0.04;
        g.stroke();
      }
      g.globalAlpha = 1;
      // a dropped street sign, a crack in the road
      g.strokeStyle = 'rgba(244,241,234,0.7)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(W * 0.15, H * 0.86);
      g.lineTo(W * 0.32, H * 0.82);
      g.lineTo(W * 0.36, H * 0.84);
      g.lineTo(W * 0.48, H * 0.81);
      g.stroke();
      g.strokeRect(W * 0.78, H * 0.76, 120, 70);
      g.beginPath();
      g.moveTo(W * 0.84, H * 0.86);
      g.lineTo(W * 0.9, H * 0.98);
      g.stroke();
      // the runner, lying, the bag glowing more as the dust gathers
      stick(g, W * 0.56, H * 0.83, 380, POSE.lie, { lw: 5.5, bag: true, glow: 0.3 + k * 0.6 });
      g.restore();
      // the dust is the subject: big motes close to the lens, small ones far
      dust(g, 70, t, { seed: 31, rise: 70, size: 3.4, a: 0.95, y0: -200, y1: H + 200 });
      dust(g, 12, t, { seed: 33, rise: 120, size: 9, a: 0.45, y0: -200, y1: H + 200 });
      ash(g, 120, t, { a: 0.35 });
      post = { bloom: 0.75, grain: 0.1, vig: 0.85, fadeIn: seg(lt, 0, 0.5), tint: 'rgba(251,146,60,0.06)' };
    } else if (t < 28.4) {
      // H. The runner gets up. The radio crackles (Tower); it looks west.
      const lt = t - 23;
      const up = E.inOut(seg(lt, 0.2, 2.2));
      g.fillStyle = '#06070b';
      g.fillRect(0, 0, W, H);
      // low angle: the outline skyline behind, the grey haze in the west
      lineCity(g, t, 300, 120, 1.25, { alpha: 0.75 });
      const west = g.createLinearGradient(0, 0, W * 0.6, 0);
      west.addColorStop(0, `rgba(150,154,162,${0.25 + seg(lt, 3, 5.4) * 0.45})`);
      west.addColorStop(1, 'rgba(150,154,162,0)');
      g.fillStyle = west;
      g.fillRect(0, 0, W, H);
      // ground
      g.fillStyle = '#05060a';
      g.fillRect(0, H * 0.82, W, H);
      g.strokeStyle = 'rgba(244,241,234,0.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, H * 0.82);
      g.lineTo(W, H * 0.82);
      g.stroke();
      const pose = up < 0.5 ? mixPose(POSE.lie, POSE.kneel, up * 2) : mixPose(POSE.kneel, POSE.stand, up * 2 - 1);
      const lookW = E.inOut(seg(lt, 3.2, 4));
      const p2 = mixPose(pose, POSE.look, lookW * 0.8);
      const hipY = lerp(H * 0.8, H * 0.82 - 0.98 * 290, up < 0.5 ? up * 0.6 : 0.3 + (up - 0.5) * 1.4);
      stick(g, W * 0.6, hipY, 290, p2, { lw: 6.5, bag: true, glow: 0.9, face: lookW > 0.5 ? -1 : 1 });
      // the radio: rings off the shoulder while Tower talks
      if (lt > 0.1) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const k2 = ((lt * 0.9 + i / 3) % 1);
          g.strokeStyle = `rgba(251,146,60,${(1 - k2) * 0.6})`;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(W * 0.6 + 26, hipY - 265, 30 + k2 * 120, -1.2, 0.2);
          g.stroke();
        }
        g.restore();
      }
      dust(g, 30, t, { seed: 41, rise: 30, size: 3, a: 0.75 });
      ash(g, 140, t, { a: 0.4, wind: -30 });
      post = { bloom: 0.7, grain: 0.1, vig: 0.8, fadeIn: seg(lt, 0, 0.4) };
    } else {
      // I. The wipe: a wall of erasure eats the city from the west. Run.
      const lt = t - 28.4;
      const camX = lt * 260; // the camera runs with the runner
      g.fillStyle = '#05060a';
      g.fillRect(0, 0, W, H);
      const wipeX = lerp(-240, W * 0.42, E.inOut(seg(lt, 0, 4.6)));
      lineCity(g, t, camX, 40, 1.05, { erase: wipeX });
      // the road racing by
      g.strokeStyle = 'rgba(244,241,234,0.7)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(0, H * 0.8);
      g.lineTo(W, H * 0.8);
      g.stroke();
      g.setLineDash([60, 90]);
      g.lineDashOffset = camX * 1.4;
      g.beginPath();
      g.moveTo(0, H * 0.9);
      g.lineTo(W, H * 0.9);
      g.stroke();
      g.setLineDash([]);
      // lamp posts whipping past
      for (let i = 0; i < 6; i++) {
        const x = ((i * 520 - camX * 1.6) % (W + 600) + W + 600) % (W + 600) - 300;
        if (x < wipeX) continue;
        g.beginPath();
        g.moveTo(x, H * 0.8);
        g.lineTo(x, H * 0.3);
        g.lineTo(x + 60, H * 0.3);
        g.stroke();
      }
      // the runner, sprinting east; at the end it runs past the lens
      const pass = E.in(seg(lt, 4.2, 5.2));
      const rx = lerp(W * 0.58, W * 1.3, pass);
      const rs = lerp(270, 900, pass);
      stick(g, rx, H * 0.8 - 0.98 * rs + lerp(0, 380, pass), rs, run(t * 15), { lw: lerp(6, 14, pass), bag: true, glow: 1 });
      // speed lines
      g.save();
      g.globalAlpha = 0.25;
      g.strokeStyle = '#f4f1ea';
      const r = rng(Math.floor(t * 30));
      for (let i = 0; i < 18; i++) {
        const y = r() * H;
        const x = r() * W;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 120 - r() * 200, y);
        g.stroke();
      }
      g.restore();
      wipe(g, wipeX, t);
      dust(g, 24, t, { seed: 51, rise: 20, size: 3, a: 0.7, cam: { x: camX, y: 0 }, par: 0.6 });
      post = { bloom: 0.65, grain: 0.1, vig: 0.75, shake: 3 + lt * 1.5, fadeIn: lt > 5.2 ? 1 - seg(lt, 5.2, 5.35) : seg(lt, 0, 0.2) };
    }
    return post;
  }

  // ---------------------------------------------------------------- op1-outro (24 s)

  // a tunnel in one-point perspective: rings rushing at the camera, rails converging
  function tunnel(g, t, { vx = W / 2, vy = H * 0.46, speed = 2.2, a = 1 } = {}) {
    g.save();
    g.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const z = ((i - t * speed) % 14 + 14) % 14; // 0 near … 14 far
      const k = 1 / (0.35 + z * 0.55);
      const rw = 980 * k;
      const rh = 760 * k;
      g.strokeStyle = `rgba(244,241,234,${a * clamp(0.9 - z * 0.06)})`;
      g.lineWidth = Math.max(1, 3.4 * k);
      g.beginPath();
      g.moveTo(vx - rw, vy + rh * 0.62);
      g.lineTo(vx - rw, vy - rh * 0.2);
      g.quadraticCurveTo(vx - rw, vy - rh, vx, vy - rh);
      g.quadraticCurveTo(vx + rw, vy - rh, vx + rw, vy - rh * 0.2);
      g.lineTo(vx + rw, vy + rh * 0.62);
      g.stroke();
      // a work light on every other ring
      if (i % 2 === 0 && z > 0.6) {
        g.fillStyle = `rgba(255,214,150,${0.8 * clamp(1 - z / 12)})`;
        g.beginPath();
        g.arc(vx - rw * 0.92, vy - rh * 0.25, 4 * k, 0, TAU);
        g.fill();
      }
    }
    // rails and sleepers
    g.strokeStyle = `rgba(244,241,234,${0.8 * a})`;
    g.lineWidth = 2.5;
    for (const d of [-1, 1]) {
      g.beginPath();
      g.moveTo(vx + d * 30, vy + 70);
      g.lineTo(vx + d * 560, H + 20);
      g.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const z = ((i - t * speed * 2) % 16 + 16) % 16;
      const k = 1 / (0.4 + z * 0.5);
      const y = vy + 70 + (H - vy - 50) * clamp(k / 2.5);
      const hw = 30 + 530 * clamp(k / 2.5) + 40 * clamp(k / 2.5);
      g.globalAlpha = 0.5 * clamp(k);
      g.beginPath();
      g.moveTo(vx - hw, y);
      g.lineTo(vx + hw, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.restore();
  }

  // the last train from behind: a rear car with lit windows full of faces, red tail lights
  function trainRear(g, x, y, s, t, faces = 6) {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.strokeStyle = '#f4f1ea';
    g.lineWidth = 3 / s;
    g.fillStyle = 'rgba(8,9,14,0.9)';
    g.beginPath();
    g.roundRect(-160, -240, 320, 260, 30);
    g.fill();
    g.stroke();
    // window with faces, warm
    g.fillStyle = 'rgba(255,196,120,0.22)';
    g.fillRect(-120, -200, 240, 100);
    g.strokeRect(-120, -200, 240, 100);
    for (let i = 0; i < faces; i++) {
      const fx = -100 + (i + 0.5) * (200 / faces);
      const fy = -150 + Math.sin(t * 3 + i) * 3;
      g.beginPath();
      g.arc(fx, fy, 14, 0, TAU);
      g.stroke();
      g.beginPath();
      g.moveTo(fx, fy + 14);
      g.lineTo(fx, fy + 40);
      g.stroke();
    }
    // door line, coupling
    g.beginPath();
    g.moveTo(0, -95);
    g.lineTo(0, 10);
    g.stroke();
    // tail lights
    g.restore();
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const d of [-1, 1]) {
      const lx = x + d * 120 * s;
      const ly = y - 30 * s;
      const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 120 * s);
      gr.addColorStop(0, 'rgba(255,90,90,1)');
      gr.addColorStop(0.15, 'rgba(239,68,68,0.6)');
      gr.addColorStop(1, 'rgba(239,68,68,0)');
      g.fillStyle = gr;
      g.fillRect(lx - 120 * s, ly - 120 * s, 240 * s, 240 * s);
    }
    g.restore();
  }

  function outro(t) {
    const g = S;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    let post = {};
    if (t < 5.3) {
      // A. The last train pulls away down the tunnel, its window full of faces.
      const lt = t;
      g.fillStyle = '#040508';
      g.fillRect(0, 0, W, H);
      tunnel(g, t, { speed: 1.6 });
      const k = E.out(seg(lt, 0, 5.3));
      trainRear(g, W / 2 + Math.sin(t * 2) * 6, H * 0.6 - k * 40, lerp(1.25, 0.6, k), t, 6);
      dust(g, 40, t, { seed: 61, rise: 10, size: 3, a: 0.7 });
      post = { bloom: 0.8, grain: 0.09, vig: 0.85, fadeIn: seg(lt, 0, 1.2), shake: 1.2 };
    } else if (t < 9.7) {
      // B. Inside the carriage: the squad and the people they brought out, lights strobing past.
      const lt = t - 5.3;
      g.fillStyle = '#07080d';
      g.fillRect(0, 0, W, H);
      const sway = Math.sin(t * 2.4) * 4;
      g.save();
      g.translate(0, sway);
      g.strokeStyle = 'rgba(244,241,234,0.8)';
      g.lineWidth = 2.5;
      // windows along the far wall, tunnel lights sliding through them
      for (let i = 0; i < 5; i++) {
        const x = 110 + i * 380;
        g.strokeRect(x, H * 0.18, 300, 200);
        const lx = x + ((t * 900 + i * 170) % 1100) - 400;
        if (lx > x - 60 && lx < x + 360) {
          g.save();
          g.beginPath();
          g.rect(x, H * 0.18, 300, 200);
          g.clip();
          g.globalCompositeOperation = 'lighter';
          const gr = g.createLinearGradient(lx - 80, 0, lx + 80, 0);
          gr.addColorStop(0, 'rgba(255,210,150,0)');
          gr.addColorStop(0.5, 'rgba(255,210,150,0.55)');
          gr.addColorStop(1, 'rgba(255,210,150,0)');
          g.fillStyle = gr;
          g.fillRect(lx - 80, H * 0.18, 160, 200);
          g.restore();
        }
      }
      // floor, seats, grab rail
      g.beginPath();
      g.moveTo(0, H * 0.86);
      g.lineTo(W, H * 0.86);
      g.moveTo(0, H * 0.1);
      g.lineTo(W, H * 0.1);
      g.stroke();
      for (let i = 0; i < 6; i++) {
        const x = 150 + i * 300;
        g.strokeRect(x, H * 0.62, 220, 30);
        g.beginPath();
        g.moveTo(x + 20, H * 0.65);
        g.lineTo(x + 20, H * 0.86);
        g.moveTo(x + 200, H * 0.65);
        g.lineTo(x + 200, H * 0.86);
        g.stroke();
      }
      // the passengers: four runners with bags, two survivors; heads nod with the train
      const who = [
        [260, true],
        [560, false],
        [860, true],
        [1160, true],
        [1460, false],
        [1760, true],
      ];
      for (const [x, bag] of who) {
        const nod = Math.sin(t * 2.4 + x) * 0.06;
        stick(g, x, H * 0.62, 250, { ...POSE.sit, head: 0.1 + nod }, { lw: 5, bag, glow: bag ? 0.6 : 0, col: bag ? '#f4f1ea' : 'rgba(225,228,236,0.85)' });
      }
      g.restore();
      // a strobe across the whole frame as each light passes
      const strobe = Math.pow(0.5 + 0.5 * Math.sin(t * 9), 8) * 0.12;
      post = { bloom: 0.6, grain: 0.1, vig: 0.85, flash: strobe, fadeIn: seg(lt, 0, 0.35), tint: 'rgba(255,190,120,0.06)' };
    } else if (t < 13.7) {
      // C. Out of the tunnel into grey day: a burst of light, then the viaduct.
      const lt = t - 9.7;
      if (lt < 1.6) {
        g.fillStyle = '#040508';
        g.fillRect(0, 0, W, H);
        tunnel(g, t, { speed: 3.2, a: 1 - seg(lt, 1, 1.6) });
        const portal = E.in(seg(lt, 0, 1.6));
        const pr = lerp(60, 1400, portal);
        const gr = g.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.46, pr);
        gr.addColorStop(0, 'rgba(235,236,240,1)');
        gr.addColorStop(0.7, 'rgba(210,212,218,0.9)');
        gr.addColorStop(1, 'rgba(210,212,218,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
        post = { bloom: 0.9, grain: 0.08, vig: 0.6, flash: Math.pow(portal, 3) * 0.7 };
      } else {
        const k = seg(lt, 1.6, 4);
        sky(g, '#9ea2aa', '#c3c6cc', '#a7aab2');
        // the grey plain in lines
        g.strokeStyle = 'rgba(40,42,48,0.5)';
        g.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          const y = H * 0.66 + i * i * 6;
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(W, y);
          g.stroke();
        }
        // the viaduct
        g.strokeStyle = 'rgba(30,32,38,0.85)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(-50, H * 0.58);
        g.lineTo(W + 50, H * 0.55);
        g.stroke();
        for (let i = 0; i < 9; i++) {
          const x = i * 260 - (k * 60);
          g.beginPath();
          g.moveTo(x, H * 0.585 - x * 0.0003 * 0);
          g.quadraticCurveTo(x + 130, H * 0.64, x + 260, H * 0.58);
          g.moveTo(x, H * 0.585);
          g.lineTo(x, H * 0.7);
          g.stroke();
        }
        // the train crossing
        const tx = lerp(W * 0.12, W * 0.55, E.out(k));
        g.fillStyle = 'rgba(20,22,28,0.9)';
        for (let c = 0; c < 4; c++) {
          g.fillRect(tx - c * 190, H * 0.535 - (tx - c * 190) * 0.0, 180, 46);
          g.fillStyle = 'rgba(255,196,120,0.75)';
          for (let w = 0; w < 5; w++) g.fillRect(tx - c * 190 + 12 + w * 34, H * 0.543, 22, 12);
          g.fillStyle = 'rgba(20,22,28,0.9)';
        }
        ash(g, 160, t, { a: 0.5, wind: 40, seed: 12 });
        post = { bloom: 0.35, grain: 0.09, vig: 0.55, flash: Math.max(0, 0.7 - (lt - 1.6) * 1.2), tint: 'rgba(120,130,150,0.1)' };
      }
    } else if (t < 19.2) {
      // D. On the horizon, the wipe: a grey wall rolling over the land, the train small below it.
      const lt = t - 13.7;
      sky(g, '#7f838c', '#a4a8b0', '#8d9099');
      // the wall: a band of erasure with a scribbled crest, slowly coming on
      const crest = H * lerp(0.22, 0.18, seg(lt, 0, 5.5));
      g.save();
      g.globalAlpha = 0.9;
      g.drawImage(WIPE_TEX, -((t * 40) % 1024), crest, 1024, H * 0.48);
      g.drawImage(WIPE_TEX, 1024 - ((t * 40) % 1024), crest, 1024, H * 0.48);
      g.drawImage(WIPE_TEX, 2048 - ((t * 40) % 1024), crest, 1024, H * 0.48);
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 2.5;
      const r = rng(Math.floor(t * 12));
      g.beginPath();
      for (let x = -20; x < W + 40; x += 22) {
        const y = crest + (r() - 0.5) * 30 + Math.sin(x * 0.01 + t * 2) * 14;
        if (x === -20) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      // the land in front, the viaduct line, the train tiny
      g.fillStyle = '#7c8089';
      g.fillRect(0, H * 0.66, W, H);
      g.strokeStyle = 'rgba(30,32,38,0.6)';
      g.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.moveTo(0, H * 0.68 + i * i * 7);
        g.lineTo(W, H * 0.68 + i * i * 7);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(0, H * 0.7);
      g.lineTo(W, H * 0.68);
      g.stroke();
      const tx = lerp(W * 0.2, W * 0.75, seg(lt, 0, 5.5));
      g.fillStyle = 'rgba(16,18,24,0.95)';
      g.fillRect(tx, H * 0.665, 120, 16);
      g.fillStyle = 'rgba(255,196,120,0.9)';
      for (let w = 0; w < 6; w++) g.fillRect(tx + 8 + w * 18, H * 0.669, 10, 5);
      ash(g, 220, t, { a: 0.55, wind: 55, seed: 14 });
      post = { bloom: 0.3, grain: 0.1, vig: 0.65, fadeIn: seg(lt, 0, 0.4), tint: 'rgba(110,120,140,0.12)' };
    } else {
      // E. The harbour to the south, in outlines: cranes, stacks, ships. Something moves.
      const lt = t - 19.2;
      const k = E.sine(seg(lt, 0, 4.8));
      g.fillStyle = '#06070b';
      g.fillRect(0, 0, W, H);
      g.save();
      g.translate(W / 2, H / 2);
      g.scale(1 + k * 0.12, 1 + k * 0.12);
      g.translate(-W / 2 - k * 60, -H / 2);
      g.strokeStyle = '#f4f1ea';
      g.lineWidth = 2.4;
      g.lineCap = 'round';
      // water
      for (let i = 0; i < 10; i++) {
        const y = H * 0.74 + i * 22;
        g.globalAlpha = 0.5 - i * 0.04;
        g.beginPath();
        for (let x = 0; x <= W; x += 30) g[x ? 'lineTo' : 'moveTo'](x, y + Math.sin(x * 0.02 + t * 2 + i) * 4);
        g.stroke();
      }
      g.globalAlpha = 1;
      // quay and containers
      g.beginPath();
      g.moveTo(0, H * 0.72);
      g.lineTo(W, H * 0.72);
      g.stroke();
      const r = rng(5);
      for (let s2 = 0; s2 < 5; s2++) {
        const bx = 120 + s2 * 330;
        const rows = 2 + Math.floor(r() * 3);
        for (let row = 0; row < rows; row++) for (let c = 0; c < 2; c++) g.strokeRect(bx + c * 130, H * 0.72 - (row + 1) * 46, 124, 44);
      }
      // cranes
      for (const cx of [380, 1120, 1600]) {
        g.beginPath();
        g.moveTo(cx - 40, H * 0.72);
        g.lineTo(cx - 40, H * 0.26);
        g.moveTo(cx + 40, H * 0.72);
        g.lineTo(cx + 40, H * 0.26);
        g.moveTo(cx - 180, H * 0.26);
        g.lineTo(cx + 260, H * 0.26);
        g.moveTo(cx - 40, H * 0.26);
        g.lineTo(cx, H * 0.17);
        g.lineTo(cx + 40, H * 0.26);
        g.stroke();
        for (let i = 0; i < 8; i++) {
          g.beginPath();
          g.moveTo(cx - 40, H * 0.72 - i * 55);
          g.lineTo(cx + 40, H * 0.72 - (i + 1) * 55);
          g.stroke();
        }
      }
      // a ship at the quay
      g.beginPath();
      g.moveTo(W * 0.62, H * 0.72);
      g.lineTo(W * 0.66, H * 0.8);
      g.lineTo(W * 0.96, H * 0.8);
      g.lineTo(W * 0.99, H * 0.72);
      g.closePath();
      g.stroke();
      g.strokeRect(W * 0.86, H * 0.6, 120, 90);
      // something big moves between the stacks: a mass of lines, two yellow eyes
      const mx = lerp(W * 0.3, W * 0.48, seg(lt, 0.8, 4.4));
      const r2 = rng(Math.floor(t * 14));
      g.strokeStyle = 'rgba(20,22,28,1)';
      g.lineWidth = 5;
      g.fillStyle = '#06070b';
      g.beginPath();
      g.ellipse(mx, H * 0.62, 150, 120, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(200,204,212,0.55)';
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < 40; i++) {
        const a = r2() * TAU;
        const rr = 60 + r2() * 90;
        g[i ? 'lineTo' : 'moveTo'](mx + Math.cos(a) * rr * 1.2, H * 0.62 + Math.sin(a) * rr);
      }
      g.stroke();
      const eye = seg(lt, 2.2, 2.6) * (1 - seg(lt, 3.6, 3.9));
      if (eye > 0) eyes(g, mx, H * 0.58, 30, 9, eye);
      g.restore();
      ash(g, 120, t, { a: 0.35, seed: 15 });
      post = { bloom: 0.6, grain: 0.1, vig: 0.85, fadeIn: Math.min(seg(lt, 0, 0.5), 1 - seg(lt, 3.8, 4.8)) };
    }
    return post;
  }

  // ---------------------------------------------------------------- stage cards (6 s each)
  // The game writes the stage's name and objective across the middle: subjects sit left and right.

  // S2, The Platform: the station platform, flickering tubes, the train waiting, two hiding.
  function s2(t) {
    const g = S;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#05060a';
    g.fillRect(0, 0, W, H);
    const k = E.sine(seg(t, 0, 6));
    const vx = W * 0.5 + k * 80;
    const vy = H * 0.45;
    g.strokeStyle = 'rgba(244,241,234,0.85)';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    // platform edge, ceiling, rails on the left
    const P = (x, y) => [x, y];
    const ray = (x, y) => {
      g.beginPath();
      g.moveTo(vx, vy);
      g.lineTo(...P(x, y));
      g.stroke();
    };
    ray(-200, H * 1.05);
    ray(W * 0.32, H * 1.1);
    ray(W + 300, H * 1.0);
    ray(-200, -100);
    ray(W + 300, -60);
    // pillars marching away
    for (let i = 0; i < 9; i++) {
      const z = ((i - t * 0.35) % 9 + 9) % 9;
      const s = 1 / (0.45 + z * 0.4);
      const x = vx + 760 * s * 0.55;
      const top = vy - 560 * s * 0.55;
      const bot = vy + 540 * s * 0.55;
      g.globalAlpha = clamp(1.1 - z * 0.1);
      g.strokeRect(x, top, 46 * s, bot - top);
      // the fluorescent tube above, flickering
      const fl = Math.sin(t * 40 + i * 7) > -0.6 || i % 3 ? 1 : 0.15;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(220,240,255,${0.8 * fl * g.globalAlpha})`;
      g.fillRect(vx - 180 * s, top - 10 * s, 300 * s, 6 * s);
      const gr = g.createRadialGradient(vx - 30 * s, top, 0, vx - 30 * s, top, 420 * s);
      gr.addColorStop(0, `rgba(200,230,255,${0.12 * fl})`);
      gr.addColorStop(1, 'rgba(200,230,255,0)');
      g.fillStyle = gr;
      g.fillRect(vx - 450 * s, top - 420 * s, 840 * s, 840 * s);
      g.restore();
    }
    g.globalAlpha = 1;
    // the waiting train on the left: open doors spilling warm light
    for (let c = 0; c < 6; c++) {
      const z = c;
      const s = 1 / (0.5 + z * 0.55);
      const x = vx - 980 * s * 0.6;
      const top = vy - 300 * s * 0.6;
      const bot = vy + 420 * s * 0.6;
      g.strokeRect(x, top, 320 * s, bot - top);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,196,120,${0.25 * clamp(1 - z / 6)})`;
      g.fillRect(x + 110 * s, top + 40 * s, 100 * s, bot - top - 40 * s);
      g.restore();
      g.strokeRect(x + 110 * s, top + 40 * s, 100 * s, bot - top - 40 * s);
    }
    // two survivors peeking out from behind the near pillars on the right
    const peek = E.inOut(seg(t, 1.5, 3));
    const hide = (px, py, s, pose, d) => {
      stick(g, px - peek * d, py, s, pose, { lw: 3.5, face: -1, col: 'rgba(230,232,238,0.9)' });
      g.fillStyle = '#05060a';
      g.fillRect(px - s * 0.05, py - s * 2.1, s * 0.42, s * 2.6);
      g.strokeRect(px - s * 0.05, py - s * 2.1, s * 0.42, s * 2.6);
    };
    hide(W * 0.8, H * 0.86, 170, mixPose(POSE.stand, POSE.look, 0.7), 34);
    hide(W * 0.68, H * 0.72, 110, { ...POSE.kneel, head: -0.3 }, 20);
    dust(g, 26, t, { seed: 71, rise: 18, size: 2.6, a: 0.7 });
    ash(g, 100, t, { a: 0.3, seed: 72, wind: -10 });
    // the band behind the card: a touch darker
    const band = g.createLinearGradient(0, H * 0.3, 0, H * 0.7);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    band.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = band;
    g.fillRect(0, 0, W, H);
    return { bloom: 0.7, grain: 0.1, vig: 0.85, fadeIn: Math.min(seg(t, 0, 0.5), 1 - seg(t, 5.4, 6)) };
  }

  // S3, The Breaker: the dead switch room; a red beacon turns; the cables spit sparks.
  function s3(t) {
    const g = S;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#060507';
    g.fillRect(0, 0, W, H);
    const k = E.sine(seg(t, 0, 6));
    g.save();
    g.translate(W / 2, H / 2);
    g.scale(1 + k * 0.06, 1 + k * 0.06);
    g.translate(-W / 2, -H / 2);
    g.strokeStyle = 'rgba(244,241,234,0.85)';
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    // the breaker cabinet, right third
    const bx = W * 0.64;
    const by = H * 0.12;
    g.strokeRect(bx, by, 520, 800);
    g.strokeRect(bx + 30, by + 30, 460, 260);
    // gauges, needles twitching
    for (let i = 0; i < 3; i++) {
      const gx = bx + 110 + i * 150;
      const gy = by + 160;
      g.beginPath();
      g.arc(gx, gy, 52, Math.PI, 0);
      g.stroke();
      const a = Math.PI + 0.3 + Math.abs(Math.sin(t * (3 + i) + i)) * 0.6 * (i === 1 ? 1 : 0.5);
      g.beginPath();
      g.moveTo(gx, gy);
      g.lineTo(gx + Math.cos(a) * 46, gy + Math.sin(a) * 46);
      g.stroke();
    }
    // the big lever, down (dead)
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(bx + 260, by + 520);
    g.lineTo(bx + 380, by + 640);
    g.stroke();
    g.beginPath();
    g.arc(bx + 392, by + 652, 26, 0, TAU);
    g.stroke();
    g.lineWidth = 2.6;
    g.strokeRect(bx + 180, by + 470, 160, 110);
    // cables down the wall, one torn and sparking
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(bx - 40 - i * 34, -20);
      g.bezierCurveTo(bx - 60 - i * 30, H * 0.4, bx - 10 - i * 20, H * 0.6, bx - 30 - i * 36, H * 0.72 + i * 10);
      g.stroke();
    }
    const spark = (Math.floor(t * 6) % 4 === 0 || Math.floor(t * 9) % 7 === 0) ? 1 : 0;
    if (spark) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const sx = bx - 100;
      const sy = H * 0.72;
      const r = rng(Math.floor(t * 30));
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI / 2 + (r() - 0.5) * 2.6;
        const l = 30 + r() * 140;
        g.strokeStyle = `rgba(255,${200 + Math.floor(r() * 55)},${120 + Math.floor(r() * 100)},${0.6 + r() * 0.4})`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l + l * 0.4);
        g.stroke();
      }
      const gr = g.createRadialGradient(sx, sy, 0, sx, sy, 300);
      gr.addColorStop(0, 'rgba(255,220,150,0.6)');
      gr.addColorStop(1, 'rgba(255,220,150,0)');
      g.fillStyle = gr;
      g.fillRect(sx - 300, sy - 300, 600, 600);
      g.restore();
    }
    // a runner coming in from the left, bag glowing
    const walkIn = E.out(seg(t, 0.3, 4));
    stick(g, lerp(-120, W * 0.2, walkIn), H * 0.94, 380, walkIn < 1 ? walk(t * 5) : POSE.stand, { lw: 6, bag: true, glow: 0.8 });
    g.restore();
    // the red beacon sweeping the room
    g.save();
    g.globalCompositeOperation = 'lighter';
    const a = t * 3.2;
    const cx = W * 0.5;
    const cy = -40;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 1500);
    gr.addColorStop(0, 'rgba(239,68,68,0.5)');
    gr.addColorStop(1, 'rgba(239,68,68,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, 1600, a % TAU, (a % TAU) + 0.45);
    g.closePath();
    g.fill();
    g.restore();
    dust(g, 20, t, { seed: 81, rise: 22, size: 2.6, a: 0.6 });
    const band = g.createLinearGradient(0, H * 0.3, 0, H * 0.7);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    band.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = band;
    g.fillRect(0, 0, W, H);
    return { bloom: 0.7, grain: 0.11, vig: 0.85, fadeIn: Math.min(seg(t, 0, 0.4), 1 - seg(t, 5.4, 6)), tint: 'rgba(239,68,68,0.06)' };
  }

  // S4, The Dispatcher: on the tracks, something huge rises behind the booth glass; its eyes light.
  function s4(t) {
    const g = S;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#040406';
    g.fillRect(0, 0, W, H);
    const rise = E.out(seg(t, 0.6, 3.4));
    const sh = t > 1.9 ? Math.max(0, 1 - (t - 1.9) * 0.8) * 8 : 0;
    // the tunnel mouth and tracks
    tunnel(g, t * 0.15, { vx: W * 0.5, vy: H * 0.5, speed: 0.2, a: 0.5 });
    // the thing: a mountain of scribble rising over the tracks
    const mx = W * 0.5;
    const my = lerp(H * 1.2, H * 0.52, rise);
    g.save();
    g.fillStyle = '#040406';
    g.beginPath();
    g.ellipse(mx, my + 120, 520, 440, 0, 0, TAU);
    g.fill();
    const r = rng(Math.floor(t * 12));
    g.strokeStyle = 'rgba(210,214,222,0.55)';
    g.lineWidth = 2.6;
    for (let pass = 0; pass < 3; pass++) {
      g.beginPath();
      for (let i = 0; i < 70; i++) {
        const a = r() * TAU;
        const rr = 150 + r() * 380;
        g[i ? 'lineTo' : 'moveTo'](mx + Math.cos(a) * rr * 1.15, my + 120 + Math.sin(a) * rr * 0.85);
      }
      g.globalAlpha = 0.5 - pass * 0.12;
      g.stroke();
    }
    g.globalAlpha = 1;
    // its arms: two long hooked lines reaching for the platform edges
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(230,232,238,0.75)';
    for (const d of [-1, 1]) {
      const reach = E.inOut(seg(t, 2, 4.5));
      g.beginPath();
      g.moveTo(mx + d * 300, my + 80);
      g.quadraticCurveTo(mx + d * (520 + reach * 200), my - 160, mx + d * (640 + reach * 260), my + 220 + Math.sin(t * 3) * 20);
      g.stroke();
    }
    g.restore();
    // the eyes
    const eye = seg(t, 1.9, 2.3);
    if (eye > 0) eyes(g, mx, my - 40, 95, 26, eye);
    // the dispatcher's booth window in the foreground: cracked glass, an old station clock
    g.strokeStyle = 'rgba(244,241,234,0.8)';
    g.lineWidth = 6;
    g.strokeRect(40, 40, W - 80, H - 80);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(W * 0.12, 40);
    g.lineTo(W * 0.18, H * 0.2);
    g.lineTo(W * 0.14, H * 0.28);
    g.moveTo(W * 0.18, H * 0.2);
    g.lineTo(W * 0.26, H * 0.24);
    g.stroke();
    // clock
    const ccx = W * 0.86;
    const ccy = H * 0.22;
    g.beginPath();
    g.arc(ccx, ccy, 70, 0, TAU);
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.beginPath();
      g.moveTo(ccx + Math.cos(a) * 58, ccy + Math.sin(a) * 58);
      g.lineTo(ccx + Math.cos(a) * 66, ccy + Math.sin(a) * 66);
      g.stroke();
    }
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(ccx, ccy);
    g.lineTo(ccx + Math.cos(-1.2) * 40, ccy + Math.sin(-1.2) * 40);
    g.moveTo(ccx, ccy);
    g.lineTo(ccx + Math.cos(0.4 + Math.sin(t * 20) * 0.04) * 56, ccy + Math.sin(0.4) * 56);
    g.stroke();
    // a warning lamp pulsing
    g.save();
    g.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    const gr = g.createRadialGradient(W * 0.1, H * 0.86, 0, W * 0.1, H * 0.86, 500);
    gr.addColorStop(0, `rgba(239,68,68,${0.35 * pulse})`);
    gr.addColorStop(1, 'rgba(239,68,68,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.restore();
    // grit falling from the roof as it rises
    ash(g, 260, t, { a: 0.5, seed: 91, fall: 160, wind: 6 });
    const band = g.createLinearGradient(0, H * 0.3, 0, H * 0.7);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    band.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = band;
    g.fillRect(0, 0, W, H);
    return { bloom: 0.75, grain: 0.11, vig: 0.9, shake: sh, fadeIn: Math.min(seg(t, 0, 0.4), 1 - seg(t, 5.5, 6)), flash: t > 1.9 && t < 2.1 ? 0.25 : 0 };
  }

  const FILMS = { 'op1-intro': intro, 'op1-outro': outro, 'op1-s2': s2, 'op1-s3': s3, 'op1-s4': s4 };

  // draw one frame of a film onto a canvas
  window.drawFilmFrame = function (canvas, id, t) {
    const g = canvas.getContext('2d');
    S.setTransform(1, 0, 0, 1, 0, 0);
    S.globalAlpha = 1;
    S.globalCompositeOperation = 'source-over';
    S.filter = 'none';
    S.shadowBlur = 0;
    S.setLineDash([]);
    const post = FILMS[id](t) ?? {};
    finish(g, t, post);
  };
})();
