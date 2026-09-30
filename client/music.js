// Adaptive soundtrack, synthesized live: a dark pulse in the lobby, a build-up in
// the ready room, and techno/drum & bass in the raid that gets faster and denser as
// the storm closes and as danger rises. Phrygian minor for the menace.
const PROG = [55, 58.27, 55, 49]; // A, Bb, A, G (bass roots, Hz)
const ARP = [0, 3, 7, 12, 10, 7, 3, 1];
const ROLL = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
const OFFBEAT = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];

export class Music {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.out.connect(this.filter).connect(dest);
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    this.delay.connect(fb).connect(this.delay);
    this.delayOut = ctx.createGain();
    this.delayOut.gain.value = 0.3;
    this.delay.connect(this.delayOut).connect(this.out);
    this.noiseBuf = (() => {
      const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    })();
    this.mode = 'lobby';
    this.intensity = 0;
    this.bpm = 96;
    this.targetBpm = 96;
    this.step = 0;
    this.bar = 0;
    this.enabled = true;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setEnabled(on) {
    this.enabled = on;
    this.out.gain.setTargetAtTime(on ? 0.55 * (this.volume ?? 1) : 0, this.ctx.currentTime, 0.2);
  }

  setVolume(v) {
    this.volume = v;
    this.setEnabled(this.enabled);
  }

  set({ mode, intensity, bpm }) {
    if (mode) this.mode = mode;
    if (intensity !== undefined) this.intensity = Math.max(0, Math.min(4, intensity));
    if (bpm) this.targetBpm = bpm;
  }

  // taking a hit: the music drops out for a moment, like your ears ringing
  muffle() {
    const f = this.filter.frequency;
    const t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(650, t);
    f.exponentialRampToValueAtTime(18000, t + 0.9);
  }

  riser(secs) {
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + secs);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + secs);
    g.gain.exponentialRampToValueAtTime(0.0001, t + secs + 0.1);
    src.connect(bp).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + secs + 0.15);
  }

  schedule() {
    const c = this.ctx;
    if (c.state !== 'running' || !this.enabled) {
      this.nextTime = Math.max(this.nextTime, c.currentTime + 0.05);
      return;
    }
    while (this.nextTime < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.bpm / 4;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        this.bpm += (this.targetBpm - this.bpm) * 0.5;
        if (Math.abs(this.targetBpm - this.bpm) < 0.5) this.bpm = this.targetBpm;
      }
    }
  }

  playStep(s, t) {
    const root = PROG[Math.floor(this.bar / 2) % 4];
    const I = this.intensity;
    if (this.mode === 'lobby') {
      if (s === 0 || s === 10) this.kick(t, 0.55);
      if (s === 0 && this.bar % 2 === 0) this.pad(t, root, (60 / this.bpm) * 8);
      if (s % 4 === 2) this.hat(t, 0.12);
      if (s === 12 && this.bar % 4 === 3) this.stab(t, root, 0.035);
      return;
    }
    if (this.mode === 'prep') {
      if (s % 4 === 0) this.kick(t, 0.8);
      if (s % 2 === 1) this.hat(t, 0.25);
      if (ROLL[s] && s % 2 === 0) this.bass(t, root, 0.7);
      if (s === 0) this.pad(t, root, (60 / this.bpm) * 4);
      return;
    }
    // raid
    if (s % 4 === 0) this.kick(t, 1);
    if (I >= 3 && s === 14) this.kick(t, 0.6);
    if (I >= 1 && (s === 4 || s === 12)) this.snare(t, 1);
    if (I >= 4 && (s === 7 || s === 15)) this.snare(t, 0.35);
    if (I >= 1 && s % 2 === 1) this.hat(t, 0.35);
    if (I >= 3 && s % 4 === 2) this.hat(t, 0.2);
    const pat = I >= 2 ? ROLL : OFFBEAT;
    if (pat[s]) this.bass(t, root * (s % 8 === 6 ? 2 : 1), 1);
    if (I >= 2 && s === 0) this.stab(t, root, 0.06);
    if (I >= 3 && (s % 2 === 0 || I >= 4)) {
      const n = ARP[(s + this.bar * 3) % ARP.length];
      this.lead(t, root * 8 * 2 ** (n / 12));
    }
    if (I >= 4 && s === 0 && this.bar % 2 === 0) this.siren(t);
  }

  env(g, t, vol, dur, attack = 0.002) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  kick(t, v) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.9 * v, 0.3);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.32);
  }

  noiseHit(t, { type, f, q = 1, vol, dur }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = c.createGain();
    this.env(g, t, vol, dur);
    src.connect(flt).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  snare(t, v) {
    this.noiseHit(t, { type: 'bandpass', f: 1900, q: 0.8, vol: 0.32 * v, dur: 0.17 });
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = 190;
    this.env(g, t, 0.14 * v, 0.1);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.12);
  }

  hat(t, v) {
    this.noiseHit(t, { type: 'highpass', f: 7600, vol: 0.14 * v, dur: 0.04 });
  }

  bass(t, f, v) {
    const c = this.ctx;
    const dur = (60 / this.bpm / 4) * 0.95;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.frequency.value = f / 2;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 6;
    flt.frequency.setValueAtTime(180, t);
    flt.frequency.exponentialRampToValueAtTime(700 + this.intensity * 320, t + 0.02);
    flt.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.24 * v, dur);
    o.connect(flt);
    o2.connect(flt);
    flt.connect(g).connect(this.out);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.02);
    o2.stop(t + dur + 0.02);
  }

  lead(t, f) {
    const c = this.ctx;
    const g = c.createGain();
    this.env(g, t, 0.045, 0.13);
    for (const det of [-6, 6]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(g);
      o.start(t);
      o.stop(t + 0.15);
    }
    g.connect(this.out);
    g.connect(this.delay);
  }

  stab(t, root, vol) {
    const c = this.ctx;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 2200;
    const g = c.createGain();
    this.env(g, t, vol, 0.22);
    for (const mul of [4, 4 * 1.189, 4 * 1.498]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = root * mul;
      o.connect(flt);
      o.start(t);
      o.stop(t + 0.25);
    }
    flt.connect(g).connect(this.out);
    g.connect(this.delay);
  }

  pad(t, root, dur) {
    const c = this.ctx;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 520;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [mul, det] of [[2, -7], [2, 7], [3, 0]]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = root * mul;
      o.detune.value = det;
      o.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    flt.connect(g).connect(this.out);
  }

  siren(t) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(620, t);
    o.frequency.linearRampToValueAtTime(930, t + 0.45);
    o.frequency.linearRampToValueAtTime(620, t + 0.9);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 1);
  }
}
