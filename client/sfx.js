import { store } from './store.js';
import { Music } from './music.js';
import { VOICE } from './voice-data.js';

// Synthesized, spatial sound effects. No audio files: every sound is built from
// oscillators and noise, then placed in stereo by where it happens on screen and
// sent through a generated room reverb.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = store.get('darkbags.muted', false);
    this.musicOn = store.get('darkbags.music', true);
    this.listener = { x: 0, y: 0 };
    this.music = null;
    this.stormLevel = 0;
  }

  unlock() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const c = new AC();
        this.ctx = c;
        this.master = c.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9 * (this.volume ?? 1);
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        this.master.connect(comp).connect(c.destination);
        this.bus = c.createGain();
        this.bus.gain.value = 0.8;
        this.bus.connect(this.master);
        this.verb = c.createConvolver();
        this.verb.buffer = impulse(c, 1.9);
        this.verbIn = c.createGain();
        this.verbIn.gain.value = 0.9;
        this.verbIn.connect(this.verb).connect(this.master);
        this.white = noiseBuffer(c, 2, false);
        this.brown = noiseBuffer(c, 3, true);
        this.music = new Music(c, this.master);
        this.music.setEnabled(this.musicOn);
        this.music.setVolume(this.musicVolume ?? 1);
        this.music.choose(this.trackChoice ?? 'auto');
        this.startStormBed();
      } catch {
        this.ctx = null;
        return;
      }
    }
    this.ctx.resume?.().catch(() => {});
  }

  // 0..1 master volume for effects (music has its own)
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9 * this.volume, this.ctx.currentTime, 0.05);
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    this.music?.setVolume?.(this.musicVolume);
  }

  toggle() {
    this.muted = !this.muted;
    store.set('darkbags.muted', this.muted);
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9 * (this.volume ?? 1), this.ctx.currentTime, 0.05);
    return this.muted;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    store.set('darkbags.music', this.musicOn);
    this.music?.setEnabled(this.musicOn);
    return this.musicOn;
  }

  setListener(x, y) {
    this.listener.x = x;
    this.listener.y = y;
  }

  // ------------------------------------------------------------ building blocks

  // A voice placed in the world: pan by horizontal offset, quieter and duller with distance.
  voice(o = {}, vol = 1, send = 0.25) {
    const c = this.ctx;
    const g = c.createGain();
    let out = g;
    let far = 0;
    if (o.x !== undefined) {
      const dx = o.x - this.listener.x;
      const dy = o.y - this.listener.y;
      const d = Math.hypot(dx, dy);
      far = Math.min(1, d / 900);
      vol *= 1 / (1 + d / 380);
      if (c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, dx / 520));
        g.connect(p);
        out = p;
      }
      if (far > 0.25) {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 9000 - far * 7500;
        out.connect(lp);
        out = lp;
      }
    }
    g.gain.value = vol * (o.v ?? 1);
    out.connect(this.bus);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send * (0.6 + far);
      out.connect(s).connect(this.verbIn);
    }
    return g;
  }

  osc(dest, { type = 'sine', f, to = null, dur, vol = 0.3, at = 0, attack = 0.002 }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dest, { dur, vol = 0.3, at = 0, type = 'bandpass', f = 1000, to = null, q = 0.8, brown = false, attack = 0.002 }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = brown ? this.brown : this.white;
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f, t);
    if (to) flt.frequency.exponentialRampToValueAtTime(to, t + dur);
    flt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(dest);
    const off = Math.random() * (src.buffer.duration - dur - 0.1);
    src.start(t, Math.max(0, off), dur + 0.05);
  }

  // ------------------------------------------------------------------- sounds

  play(name, o = {}) {
    if (!this.ctx || this.muted) return;
    const r = (1 + (Math.random() - 0.5) * 0.08) * (o.pitch ?? 1); // tiny pitch variation so repeats don't drone; o.pitch: each gun its own voice
    switch (name) {
      case 'knife': {
        const v = this.voice(o, 0.9, 0.1);
        this.noise(v, { dur: 0.14, vol: 0.35, f: 1200 * r, to: 5000, q: 2 });
        break;
      }
      case 'pistol': {
        const v = this.voice(o, 1, 0.35);
        this.noise(v, { dur: 0.012, vol: 0.5, type: 'highpass', f: 3000 });
        this.noise(v, { dur: 0.13, vol: 0.6, f: 1300 * r, q: 0.9 });
        this.osc(v, { f: 150 * r, to: 48, dur: 0.12, vol: 0.55 });
        break;
      }
      case 'shotgun': {
        const v = this.voice(o, 1.1, 0.5);
        this.noise(v, { dur: 0.015, vol: 0.6, type: 'highpass', f: 2500 });
        this.noise(v, { dur: 0.38, vol: 0.8, type: 'lowpass', f: 2600 * r, to: 400 });
        this.osc(v, { f: 95 * r, to: 32, dur: 0.28, vol: 0.8 });
        this.noise(v, { dur: 0.04, vol: 0.25, f: 2200, q: 3, at: 0.36 });
        this.noise(v, { dur: 0.05, vol: 0.3, f: 1600, q: 3, at: 0.46 });
        break;
      }
      case 'smg': {
        const v = this.voice(o, 0.75, 0.15);
        this.noise(v, { dur: 0.06, vol: 0.5, f: 1900 * r, q: 1.2 });
        this.osc(v, { f: 130 * r, to: 60, dur: 0.05, vol: 0.35 });
        break;
      }
      case 'rifle': {
        const v = this.voice(o, 0.95, 0.35);
        this.noise(v, { dur: 0.02, vol: 0.55, type: 'highpass', f: 3500 });
        this.noise(v, { dur: 0.15, vol: 0.6, f: 1000 * r, q: 0.8 });
        this.osc(v, { f: 115 * r, to: 42, dur: 0.12, vol: 0.55 });
        break;
      }
      case 'sniper': {
        const v = this.voice(o, 1.3, 0.8);
        this.noise(v, { dur: 0.03, vol: 0.8, type: 'highpass', f: 4000 });
        this.noise(v, { dur: 0.7, vol: 0.8, type: 'lowpass', f: 900, to: 150 });
        this.osc(v, { f: 75, to: 28, dur: 0.45, vol: 0.9 });
        this.noise(v, { dur: 0.05, vol: 0.2, f: 2500, q: 4, at: 0.55 });
        this.noise(v, { dur: 0.06, vol: 0.22, f: 1800, q: 4, at: 0.72 });
        break;
      }
      // magazine out, magazine in, the slide: spread over the reload
      case 'reload': {
        const v = this.voice(o, 0.55, 0.1);
        const L = Math.max(0.8, o.secs ?? 1.6);
        this.noise(v, { dur: 0.03, vol: 0.35, f: 2400 * r, q: 4 });
        this.osc(v, { type: 'square', f: 900 * r, to: 500, dur: 0.03, vol: 0.06 });
        this.noise(v, { dur: 0.05, vol: 0.3, f: 1500 * r, q: 3, at: L * 0.55 });
        this.noise(v, { dur: 0.025, vol: 0.4, type: 'highpass', f: 3000, at: L * 0.62 });
        this.noise(v, { dur: 0.04, vol: 0.35, f: 2800 * r, q: 5, at: L * 0.92 });
        this.osc(v, { type: 'square', f: 1300 * r, to: 700, dur: 0.025, vol: 0.06, at: L * 0.92 });
        break;
      }
      case 'dry': {
        const v = this.voice(o, 0.4, 0);
        this.noise(v, { dur: 0.02, vol: 0.3, type: 'highpass', f: 3500 });
        break;
      }
      case 'impact': {
        const v = this.voice(o, 0.5, 0.2);
        this.noise(v, { dur: 0.03, vol: 0.4, type: 'highpass', f: 2500 });
        if (Math.random() < 0.3) this.osc(v, { type: 'sine', f: 2600 * r, to: 1100, dur: 0.2, vol: 0.12 });
        break;
      }
      case 'flesh': {
        const v = this.voice(o, 0.9, 0.1);
        this.noise(v, { dur: 0.14, vol: 0.5, f: 350 * r, to: 900, q: 1.5 });
        this.osc(v, { f: 95, to: 50, dur: 0.09, vol: 0.4 });
        break;
      }
      case 'armor': {
        const v = this.voice(o, 0.7, 0.2);
        this.osc(v, { f: 1850 * r, dur: 0.12, vol: 0.12 });
        this.osc(v, { f: 2780 * r, dur: 0.09, vol: 0.08 });
        this.noise(v, { dur: 0.02, vol: 0.3, type: 'highpass', f: 3000 });
        break;
      }
      case 'hitmark':
        this.osc(this.voice({}, 0.6, 0), { type: 'square', f: 1500, dur: 0.035, vol: 0.12 });
        break;
      case 'headshot': {
        // a bright metal ping over a short crack: you know it was the head
        const v = this.voice({}, 0.8, 0.1);
        this.noise(v, { dur: 0.03, vol: 0.5, type: 'highpass', f: 3000 });
        this.osc(v, { type: 'sine', f: 2400, to: 2300, dur: 0.35, vol: 0.18 });
        this.osc(v, { type: 'sine', f: 3600, dur: 0.22, vol: 0.08, at: 0.01 });
        break;
      }
      case 'bone': {
        const v = this.voice(o, 1, 0.15);
        for (const at of [0, 0.022, 0.05]) this.noise(v, { dur: 0.012, vol: 0.55, type: 'highpass', f: 2200, at });
        this.noise(v, { dur: 0.16, vol: 0.45, type: 'lowpass', f: 500, at: 0.01 });
        this.noise(v, { dur: 0.18, vol: 0.35, f: 300, to: 800, q: 1.2, at: 0.04 });
        break;
      }
      case 'pop': {
        const v = this.voice(o, 1, 0.2);
        this.osc(v, { f: 320, to: 70, dur: 0.1, vol: 0.5 });
        this.noise(v, { dur: 0.2, vol: 0.4, f: 400, to: 1200, q: 1.5 });
        break;
      }
      case 'grave': {
        const v = this.voice(o, 1, 0.6);
        this.noise(v, { dur: 1.6, vol: 0.55, type: 'lowpass', f: 180, brown: true, attack: 0.3 });
        this.noise(v, { dur: 0.9, vol: 0.18, f: 1600, to: 180, q: 1.5, at: 0.35 });
        for (let i = 0; i < 12; i++) this.noise(v, { dur: 0.012, vol: 0.12 + Math.random() * 0.1, type: 'highpass', f: 1800, at: 0.2 + Math.random() * 1.3 });
        this.osc(v, { f: 60, to: 35, dur: 0.4, vol: 0.5, at: 1.55 });
        break;
      }
      case 'coin': {
        const v = this.voice(o, 0.7, 0.2);
        const base = 2093 * (1 + (o.tier ?? 0) * 0.12) * r;
        const n = o.tier === 1 ? 3 : o.tier === 2 ? 5 : 1;
        for (let i = 0; i < n; i++) {
          this.osc(v, { f: base, dur: 0.18, vol: 0.12, at: i * 0.045 });
          this.osc(v, { f: base * 1.5, dur: 0.12, vol: 0.07, at: i * 0.045 });
        }
        break;
      }
      case 'bag': {
        const v = this.voice({}, 0.8, 0.25);
        for (let i = 0; i < 9; i++) this.noise(v, { dur: 0.012, vol: 0.2, f: 3000, q: 2, at: i * 0.014 });
        for (let i = 0; i < 8; i++) this.osc(v, { f: 1900 + Math.random() * 900, dur: 0.16, vol: 0.09, at: 0.16 + i * 0.05 });
        break;
      }
      case 'level': {
        const v = this.voice({}, 0.8, 0.3);
        [523, 659, 784, 1047].forEach((f, i) => this.osc(v, { type: 'square', f, dur: 0.14, vol: 0.08, at: i * 0.07 }));
        this.noise(v, { dur: 0.04, vol: 0.3, f: 2000, q: 3, at: 0.34 });
        this.noise(v, { dur: 0.05, vol: 0.3, f: 1400, q: 3, at: 0.42 });
        break;
      }
      case 'dash': {
        const v = this.voice(o, 0.6, 0.1);
        this.noise(v, { dur: 0.2, vol: 0.3, f: 600, to: 2400, q: 1.2 });
        break;
      }
      case 'step': {
        const v = this.voice({}, 0.4, 0);
        this.noise(v, { dur: 0.05, vol: 0.12, type: 'lowpass', f: 380 * r });
        break;
      }
      case 'heart': {
        const v = this.voice({}, 1, 0);
        this.osc(v, { f: 60, to: 40, dur: 0.14, vol: 0.5 });
        this.osc(v, { f: 55, to: 38, dur: 0.16, vol: 0.4, at: 0.2 });
        break;
      }
      case 'hurt': {
        const v = this.voice({}, 0.9, 0.1);
        this.noise(v, { dur: 0.12, vol: 0.4, type: 'lowpass', f: 600 });
        this.osc(v, { type: 'sawtooth', f: 150, to: 70, dur: 0.12, vol: 0.1 });
        this.music?.muffle();
        break;
      }
      case 'extract': {
        const v = this.voice({}, 0.9, 0.5);
        this.noise(v, { dur: 0.7, vol: 0.3, f: 300, to: 5000, q: 1 });
        [784, 988, 1175, 1568].forEach((f, i) => this.osc(v, { type: 'triangle', f, dur: 0.9, vol: 0.08, at: 0.35 + i * 0.03 }));
        break;
      }
      case 'death': {
        const v = this.voice({}, 1, 0.5);
        this.osc(v, { type: 'sawtooth', f: 220, to: 40, dur: 0.9, vol: 0.14 });
        this.noise(v, { dur: 1.2, vol: 0.4, type: 'lowpass', f: 400, to: 60, brown: true });
        break;
      }
      case 'beep':
        this.osc(this.voice({}, 0.7, 0.1), { type: 'square', f: o.f ?? 880, dur: o.dur ?? 0.08, vol: 0.1 });
        break;
      case 'ready': {
        const v = this.voice({}, 0.8, 0.3);
        [659, 988].forEach((f, i) => this.osc(v, { type: 'triangle', f, dur: 0.25, vol: 0.12, at: i * 0.08 }));
        break;
      }
      case 'boom': {
        // tripmine: a crack, a deep body and a rolling tail
        const v = this.voice(o, 1.4, 0.8);
        this.noise(v, { dur: 0.03, vol: 0.9, type: 'highpass', f: 2500 });
        this.osc(v, { f: 90 * r, to: 24, dur: 0.7, vol: 1 });
        this.noise(v, { dur: 1.3, vol: 0.9, type: 'lowpass', f: 1800, to: 90, brown: true });
        this.noise(v, { dur: 0.5, vol: 0.4, f: 700, to: 200, q: 0.7, at: 0.05 });
        break;
      }
      case 'storm':
        this.noise(this.voice({}, 0.8, 0.6), { dur: 1.4, vol: 0.4, type: 'lowpass', f: 900, to: 120, brown: true, attack: 0.1 });
        break;
      default:
    }
  }

  // Kill-streak stings: each tier has its own sound.
  sting(tier) {
    if (!this.ctx || this.muted) return;
    const v = this.voice({}, 1.1, 0.6);
    switch (tier) {
      case 1: // first blood: reversed swell into a deep hit, then a drip
        this.noise(v, { dur: 0.5, vol: 0.35, type: 'highpass', f: 3000, attack: 0.45 });
        this.osc(v, { f: 70, to: 30, dur: 0.6, vol: 0.9, at: 0.45 });
        this.noise(v, { dur: 0.4, vol: 0.5, type: 'lowpass', f: 600, at: 0.45 });
        this.osc(v, { f: 1200, to: 500, dur: 0.12, vol: 0.12, at: 0.9 });
        break;
      case 2: // double kill: two power hits
        for (const at of [0, 0.17]) {
          this.osc(v, { type: 'sawtooth', f: 110, to: 70, dur: 0.22, vol: 0.25, at });
          this.noise(v, { dur: 0.2, vol: 0.5, f: 800, q: 1, at });
          this.osc(v, { f: 60, to: 35, dur: 0.25, vol: 0.6, at });
        }
        break;
      case 3: // triple kill: three rising hits and a zap
        [110, 147, 196].forEach((f, i) => {
          const at = i * 0.12;
          this.osc(v, { type: 'square', f, to: f * 0.7, dur: 0.18, vol: 0.18, at });
          this.noise(v, { dur: 0.14, vol: 0.4, f: 1500, q: 1.2, at });
        });
        this.osc(v, { type: 'square', f: 2400, to: 180, dur: 0.35, vol: 0.12, at: 0.36 });
        break;
      case 4: // rampage: riser into a sub drop
        this.noise(v, { dur: 0.35, vol: 0.4, f: 400, to: 6000, q: 1.5, attack: 0.3 });
        this.osc(v, { f: 130, to: 28, dur: 1.1, vol: 0.9, at: 0.35 });
        [110, 131, 165].forEach((f) => this.osc(v, { type: 'sawtooth', f, dur: 0.7, vol: 0.09, at: 0.35 }));
        break;
      case 5: {
        // godlike: a choir-ish chord with vibrato, a boom and shimmer
        const c = this.ctx;
        const t = c.currentTime;
        const lfo = c.createOscillator();
        lfo.frequency.value = 5.5;
        const lfoGain = c.createGain();
        lfoGain.gain.value = 6;
        lfo.connect(lfoGain);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.1, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2400;
        for (const f of [220, 261.6, 329.6, 440, 523.3]) {
          for (const det of [-9, 9]) {
            const o = c.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.detune.value = det;
            lfoGain.connect(o.detune);
            o.connect(lp);
            o.start(t);
            o.stop(t + 2.05);
          }
        }
        lp.connect(g).connect(v);
        lfo.start(t);
        lfo.stop(t + 2.05);
        this.osc(v, { f: 55, to: 25, dur: 1.2, vol: 1 });
        [2093, 2637, 3136].forEach((f, i) => this.osc(v, { f, dur: 0.6, vol: 0.05, at: 0.2 + i * 0.08 }));
        break;
      }
      default:
    }
  }

  // Announcer: recorded lines (voice-data.js), one English voice for every language. Played through the effects bus with a little extra punch
  // and a hall tail, so it follows the sound volume and mute. Keys: s1..s5 (kill streaks),
  // victory, extracted, final, lead, lostLead, headshot.
  say(key, _lang = 'en', delay = 0.15) {
    if (this.muted || this.voiceOff || !this.ctx) return;
    const src = VOICE.en[key];
    if (!src) return;
    this.voiceBufs ??= new Map();
    const id = `en:${key}`;
    const play = (buf) => {
      const c = this.ctx;
      const t = c.currentTime + delay;
      // one line at a time: a new call cuts the previous one
      try {
        this.voiceNow?.stop();
      } catch {
        /* already ended */
      }
      const n = c.createBufferSource();
      n.buffer = buf;
      const lo = c.createBiquadFilter();
      lo.type = 'lowshelf';
      lo.frequency.value = 180;
      lo.gain.value = 5;
      const pres = c.createBiquadFilter();
      pres.type = 'peaking';
      pres.frequency.value = 2800;
      pres.Q.value = 0.8;
      pres.gain.value = 3;
      const g = c.createGain();
      g.gain.value = 1.35;
      const wet = c.createGain();
      wet.gain.value = 0.22;
      n.connect(lo).connect(pres).connect(g);
      g.connect(this.master);
      g.connect(wet).connect(this.verbIn);
      // duck the music under the voice
      this.music?.duck?.(buf.duration + 0.2);
      n.start(t);
      this.voiceNow = n;
    };
    const cached = this.voiceBufs.get(id);
    if (cached) return play(cached);
    const bin = Uint8Array.from(atob(src), (ch) => ch.charCodeAt(0));
    this.ctx.decodeAudioData(bin.buffer).then(
      (buf) => {
        this.voiceBufs.set(id, buf);
        play(buf);
      },
      () => {},
    );
  }

  // Continuous storm bed; level 0..1 follows how close you are to (or deep in) the storm.
  startStormBed() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    this.stormGain = c.createGain();
    this.stormGain.gain.value = 0;
    src.connect(lp).connect(this.stormGain).connect(this.bus);
    src.start();
  }

  setStorm(level) {
    if (!this.stormGain) return;
    this.stormLevel = level;
    this.stormGain.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.3);
  }
}

function noiseBuffer(c, secs, brown) {
  const len = Math.floor(c.sampleRate * secs);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function impulse(c, secs) {
  const len = Math.floor(c.sampleRate * secs);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
  }
  return buf;
}
