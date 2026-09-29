import { store } from './store.js';

// Tiny synthesized sound effects. No asset files.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = store.get('darkbags.muted', false);
  }

  unlock() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = AC ? new AC() : null;
        if (this.ctx) {
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.5;
          this.master.connect(this.ctx.destination);
        }
      } catch {
        this.ctx = null;
      }
    }
    this.ctx?.resume?.().catch(() => {});
  }

  toggle() {
    this.muted = !this.muted;
    store.set('darkbags.muted', this.muted);
    return this.muted;
  }

  tone(freq, dur, { type = 'square', vol = 0.06, to = null, delay = 0 } = {}) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.08, freq = 1800 } = {}) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  play(name, arg = 0) {
    switch (name) {
      case 'shoot':
        this.noise(0.07, { vol: 0.07, freq: 2600 });
        this.tone(220, 0.06, { vol: 0.03, to: 90 });
        break;
      case 'pickup':
        this.tone(740 + arg * 260, 0.07, { type: 'sine', vol: 0.05 });
        break;
      case 'loot':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.06, delay: i * 0.06 }));
        break;
      case 'hit':
        this.tone(1400, 0.04, { type: 'square', vol: 0.03 });
        break;
      case 'hurt':
        this.noise(0.12, { vol: 0.12, freq: 500 });
        this.tone(140, 0.12, { type: 'sawtooth', vol: 0.04, to: 70 });
        break;
      case 'kill':
        this.tone(330, 0.1, { type: 'square', vol: 0.05, to: 660 });
        break;
      case 'dash':
        this.noise(0.1, { vol: 0.04, freq: 900 });
        break;
      case 'tick':
        this.tone(1000, 0.03, { type: 'square', vol: 0.03 });
        break;
      case 'extract':
        this.tone(300, 0.6, { type: 'triangle', vol: 0.07, to: 1200 });
        break;
      case 'death':
        this.tone(400, 0.7, { type: 'sawtooth', vol: 0.06, to: 50 });
        break;
      default:
    }
  }
}
