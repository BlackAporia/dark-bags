// The soundtrack, synthesized live in the pixel style of an old console: no audio files, nothing
// to license. Every voice is one of the console's chips: pulse waves at 12.5, 25 and 50 % (leads,
// arpeggios, chords), a stepped 4-bit triangle (the bass, and the kick's pitch drop) and the LFSR
// noise channel (snares, hats, sweeps). The menus rotate calm tracks; the match gets one of the
// battle tracks (picked to suit the map, or the one chosen in Settings), with a ready-room
// build-up, and gets faster and denser as the storm closes and danger rises (intensity 0–4).
// A short fanfare or a falling phrase plays on the result.

const N = (semi, base = 55) => base * 2 ** (semi / 12); // A1 = 55 Hz: the chord roots
const A4 = (semi) => 440 * 2 ** (semi / 12); // the lead's notes, from A4

// ---------------------------------------------------------------- the 8-bit chips
// The tracks ask for 'square', 'sawtooth', 'sine' or 'triangle'; each becomes a console wave.
const CHIP_FOR = { square: 'pulse50', sawtooth: 'pulse25', sine: 'tri', triangle: 'tri' };
// a narrow pulse carries less of its fundamental: these bring the three to the same loudness
const WAVE_GAIN = { pulse12: 1.9, pulse25: 1.3, pulse50: 1 };
// the output's top: the pulses' highest harmonics rounded off, as on the console's speaker
const TOP = 5200;
function chipWaves(ctx) {
  // one period sampled, then its first harmonics as a PeriodicWave (band-limited, no aliasing)
  const make = (fn, harmonics = 64) => {
    const n = 1024;
    const re = new Float32Array(harmonics + 1);
    const im = new Float32Array(harmonics + 1);
    for (let k = 1; k <= harmonics; k++) {
      let a = 0;
      let b = 0;
      for (let i = 0; i < n; i++) {
        const v = fn(i / n);
        a += v * Math.cos((2 * Math.PI * k * i) / n);
        b += v * Math.sin((2 * Math.PI * k * i) / n);
      }
      re[k] = (2 * a) / n;
      im[k] = (2 * b) / n;
    }
    return ctx.createPeriodicWave(re, im);
  };
  const pulse = (d) => (x) => (x < d ? 1 : -1);
  // the console triangle: 32 steps, 16 levels
  const tri = (x) => {
    const step = Math.floor(x * 32);
    return (step < 16 ? 15 - step : step - 16) / 7.5 - 1;
  };
  return { pulse12: make(pulse(0.125)), pulse25: make(pulse(0.25)), pulse50: make(pulse(0.5)), tri: make(tri, 48) };
}
// the noise channel: a 15-bit LFSR, each value held for a few samples (coarse, crunchy hiss)
function lfsrNoise(ctx, hold = 3) {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  let r = 1;
  let v = 1;
  for (let i = 0; i < d.length; i++) {
    if (i % hold === 0) {
      const bit = (r ^ (r >> 1)) & 1;
      r = (r >> 1) | (bit << 14);
      v = r & 1 ? 1 : -1;
    }
    d[i] = v;
  }
  return b;
}

// a melody: per bar, [step, semitones from A4, length in steps] (16 steps a bar)
function play(m, t, s, notes, { vol = 0.045, wave = 'pulse25', vib = true, echo = true } = {}) {
  for (const [at, semi, len] of notes) if (at === s) m.pulse(t, A4(semi), (m.beat / 4) * len * 0.94, vol, wave, { vib: vib && len >= 3, echo });
}
// the same from the chord root (semitones from root * 4)
function line(m, t, s, root, notes, { vol = 0.04, harmony = 0 } = {}) {
  for (const [at, semi, len] of notes)
    if (at === s) {
      m.pulse(t, root * 4 * 2 ** (semi / 12), (m.beat / 4) * len * 0.94, vol, 'pulse25', { vib: len >= 4, echo: true });
      if (harmony) m.pulse(t, root * 4 * 2 ** ((semi - harmony) / 12), (m.beat / 4) * len * 0.94, vol * 0.55, 'pulse50');
    }
}
// the chord's tones from the root, n octaves up
const tones = (root, ch, oct) => ch.map((n) => root * 2 ** oct * 2 ** (n / 12));

// ------------------------------------------------------------------ the tracks
// prog: chord roots (Hz) for `bars` bars each; chords: each one's intervals. tempo maps the game's
// bpm (menus 96, ready room ~124–150, match 140 + 7 per storm stage) to the track's own pace.
export const TRACKS = {
  // ------------------------------------------------------------ menu tracks
  dawn: {
    name: 'Pixel Dawn',
    kind: 'lobby',
    prog: [N(3), N(5)], // C → D: the bright lift of a title screen
    chords: [[0, 4, 7, 11], [0, 4, 7, 9]],
    bars: 2,
    tempo: () => 94,
    lobby(m, s, t, root, I, ch) {
      // long triangle bass, a soft 12.5 % arpeggio, a wavering lead
      if (s === 0) m.tri(t, root * 2, m.beat * 2.6);
      if (s === 8) m.tri(t, root * (m.bar % 2 ? 3 : 2), m.beat * 1.6);
      if (s === 0) m.chord(t, tones(root, ch, 2).slice(0, 3), m.beat * 3.9, 0.011, 'pulse50'); // the held chord bed
      const arp = tones(root, ch, 2);
      m.pulse(t, arp[[0, 1, 2, 3, 2, 1, 2, 3][s % 8]] * (s >= 8 ? 2 : 1), (m.beat / 4) * 0.9, 0.024, 'pulse12', { echo: true });
      play(m, t, s, [
        [[0, 9, 6], [6, 5, 2], [8, 5, 2], [10, 7, 2], [12, 4, 4]],
        [[0, 0, 4], [4, 5, 4], [8, 2, 2], [10, -2, 2], [12, 2, 4]],
        [[0, 9, 4], [4, 9, 2], [6, 2, 2], [8, 4, 2], [10, 5, 2], [12, 7, 4]],
        [[0, 5, 3], [3, 4, 3], [6, 4, 2], [8, 0, 4], [12, 2, 4]],
      ][m.bar % 4]);
    },
  },
  night: {
    name: 'Pixel Night',
    kind: 'lobby',
    prog: [N(0), N(-4), N(3), N(-2)], // Am F C G
    chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]],
    bars: 1,
    tempo: () => 78,
    lobby(m, s, t, root, I, ch) {
      if (s === 0) m.kick(t, 0.28);
      if (s === 8) m.snare(t, 0.12);
      if (s === 0) m.tri(t, root * 2, m.beat * 1.4);
      if (s === 6) m.tri(t, root * 2, m.beat * 0.9);
      if (s === 10) m.tri(t, root * 3, m.beat * 1.4);
      if (s % 2 === 0) {
        const a = tones(root, ch, 2);
        m.pulse(t, [a[0], a[1], a[2], a[0] * 2, a[2], a[1], a[0] * 2, a[2]][s >> 1], (m.beat / 2) * 0.8, 0.02, 'pulse12', { echo: true });
      }
      play(m, t, s, [
        [[0, 7, 6], [8, 3, 4], [12, 0, 4]],
        [[0, 8, 8], [8, 5, 8]],
        [[0, 7, 4], [4, 3, 4], [8, 7, 8]],
        [[0, 2, 6], [8, 5, 4], [12, 10, 4]],
      ][m.bar % 4], { vol: 0.038, wave: 'pulse50' });
    },
  },
  snow: {
    name: 'Snow Cartridge',
    kind: 'lobby',
    prog: [N(5), N(10), N(2), N(0)], // D G Bm A
    chords: [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]],
    bars: 1,
    tempo: () => 100,
    lobby(m, s, t, root, I, ch) {
      // a music box on the 12.5 % pulse, sleigh-bell hats, a walking triangle
      if (s % 2 === 0) m.hat(t, 0.05);
      if (s % 4 === 0) m.tri(t, root * 2 * [1, 1.5, 2, 1.5][s >> 2], m.beat * 0.85);
      const a = tones(root, ch, 3);
      m.pulse(t, a[[0, 2, 1, 2][s % 4]], (m.beat / 4) * 0.7, 0.016, 'pulse12', { echo: true });
      play(m, t, s, [
        [[0, 9, 4], [4, 12, 4], [8, 9, 4], [12, 5, 4]],
        [[0, 10, 8], [8, 14, 8]],
        [[0, 9, 4], [4, 5, 4], [8, 2, 8]],
        [[0, 4, 6], [6, 7, 2], [8, 12, 8]],
      ][m.bar % 4]);
    },
  },
  save: {
    name: 'Save Point',
    kind: 'lobby',
    prog: [N(-4), N(-5), N(-7), N(3)], // Fmaj7 Em7 Dm7 Cmaj7
    chords: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 3, 7, 10], [0, 4, 7, 11]],
    bars: 2,
    swing: 0.12,
    tempo: () => 84,
    lobby(m, s, t, root, I, ch) {
      // the calm by the save crystal: whole-note bass, rolling chords, one long note at a time
      if (s === 0) m.tri(t, root * 2, m.beat * 3.8);
      if (s % 2 === 1) m.hat(t, 0.03);
      if (s % 2 === 0) {
        const a = tones(root, ch, 2);
        m.pulse(t, a[(s >> 1) % a.length] * (s >= 8 ? 2 : 1), (m.beat / 2) * 0.85, 0.017, 'pulse12', { echo: true });
      }
      play(m, t, s, [
        [[0, 7, 8], [8, 3, 8]],
        [[0, 0, 16]],
        [[0, 2, 8], [8, -2, 8]],
        [[0, -5, 16]],
        [[0, 5, 8], [8, 3, 8]],
        [[0, 0, 16]],
        [[0, 7, 6], [6, 3, 2], [8, 2, 8]],
        [[0, -2, 16]],
      ][m.bar % 8], { vol: 0.04, wave: 'pulse50' });
    },
  },
  arcade: {
    name: 'Arcade Lounge',
    kind: 'lobby',
    prog: [N(-5), N(0), N(-7), N(-2)], // Em7 A7 Dm7 G7
    chords: [[0, 3, 7, 10], [0, 4, 7, 10], [0, 3, 7, 10], [0, 4, 7, 10]],
    bars: 1,
    tempo: () => 104,
    lobby(m, s, t, root, I, ch) {
      // funk on a console: octave-jumping bass, chord stabs on the offbeats
      if (s === 0 || s === 7 || s === 10) m.kick(t, 0.35);
      if (s === 4 || s === 12) m.snare(t, 0.16);
      if (s % 2 === 0) m.hat(t, 0.04);
      const bass = [0, -1, 12, 0, -1, 0, 12, -1, 0, -1, 10, 12, -1, 0, 7, -1][s];
      if (bass >= 0) m.tri(t, root * 2 * 2 ** (bass / 12), (m.beat / 4) * 0.8);
      if (s === 2 || s === 6 || s === 14) m.chord(t, tones(root, ch, 2), (m.beat / 4) * 0.9, 0.02, 'pulse50');
      if (m.bar % 2 === 0) play(m, t, s, [[0, 7, 2], [3, 10, 2], [6, 7, 2], [8, 5, 4]], { vol: 0.036 });
      else play(m, t, s, [[0, 4, 2], [2, 7, 2], [4, 9, 4], [10, 7, 4]], { vol: 0.036 });
    },
  },

  // ----------------------------------------------------------- match tracks
  rush: {
    name: 'Pixel Rush',
    kind: 'raid',
    prog: [N(0), N(-4), N(-2), N(-5)], // Am F G Em
    chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 3, 7]],
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 150 + (bpm - 140) * 0.6 : bpm),
    prep(m, s, t, root, I, ch) {
      if (s % 4 === 0) m.kick(t, 0.5);
      if (s % 2 === 0) m.tri(t, root * (s % 4 === 2 ? 4 : 2), (m.beat / 2) * 0.8);
      if (s % 2 === 0) m.pulse(t, tones(root, ch, 3)[(s >> 1) % 3], (m.beat / 4) * 0.8, 0.016, 'pulse12');
    },
    raid(m, s, t, root, I, ch) {
      if (s % 4 === 0) m.kick(t, 0.8);
      if (I >= 1 && (s === 4 || s === 12)) m.snare(t, 0.9);
      if (I >= 1 && s % 2 === 1) m.hat(t, 0.1);
      if (I >= 3 && s % 2 === 0) m.hat(t, 0.06);
      if (s === 0) m.chord(t, tones(root, ch, 2), m.beat * 3.8, 0.012, 'pulse50'); // the held chord bed
      if (s % 2 === 0) m.tri(t, root * (s % 4 === 2 ? 4 : 2), (m.beat / 2) * 0.85);
      if (I >= 2) m.pulse(t, tones(root, ch, 3)[s % 3] * (s >= 8 ? 2 : 1), (m.beat / 4) * 0.8, 0.017, 'pulse12');
      if (I >= 3 && s % 2 === 0) {
        const mel = [12, -1, 15, 19, 17, -1, 15, 12, 14, -1, 12, 10, 12, -1, 7, -1][((m.bar % 2) * 8 + (s >> 1)) % 16];
        if (mel >= 0) {
          m.pulse(t, root * 8 * 2 ** (mel / 12), m.beat * 0.45, 0.04, 'pulse25', { vib: true, echo: true });
          if (I >= 4) m.pulse(t, root * 8 * 2 ** ((mel - 3) / 12), m.beat * 0.45, 0.022, 'pulse50');
        }
      }
      if (I >= 4 && s === 0 && m.bar % 4 === 0) m.riser(m.beat * 4);
    },
  },
  boss: {
    name: 'Boss Level',
    kind: 'raid',
    prog: [N(7), N(8), N(7), N(5)], // E F E D: phrygian dread
    chords: [[0, 3, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]],
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 158 + (bpm - 140) * 0.5 : bpm),
    prep(m, s, t, root) {
      if (s === 0 || s === 8) m.kick(t, 0.6);
      if (s % 4 === 0) m.tri(t, root * 2, (m.beat / 4) * 0.9);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, [0, 3, 7], 0.03);
    },
    raid(m, s, t, root, I) {
      if ([0, 3, 8, 11].includes(s)) m.kick(t, 0.85);
      if (s === 4 || s === 12) m.snare(t, 1);
      if (I >= 2 && s % 2 === 1) m.hat(t, 0.08);
      const b = [0, 0, 12, 0, 1, 0, 12, 0, 0, 0, 12, 0, 1, 0, 13, 12][s];
      m.tri(t, root * 2 * 2 ** (b / 12), (m.beat / 4) * 0.85);
      if (I >= 1 && s % 4 === 2) m.chord(t, tones(root, [0, 3, 6], 3), (m.beat / 4) * 0.7, 0.015, 'pulse12');
      if (I >= 2)
        line(m, t, s, root, [
          [[0, 12, 6], [6, 13, 2], [8, 15, 4], [12, 13, 4]],
          [[0, 12, 8], [8, 10, 4], [12, 8, 4]],
        ][m.bar % 2], { vol: 0.042, harmony: I >= 3 ? 3 : 0 });
      if (I >= 4 && s === 0 && m.bar % 2 === 0) m.siren(t);
    },
  },
  heist: {
    name: '8-Bit Heist',
    kind: 'raid',
    prog: [N(5), N(1), N(3), N(0)], // Dm Bb C A: sneaking past the guards
    chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]],
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 128 + (bpm - 140) * 0.6 : bpm * 0.9),
    prep(m, s, t, root) {
      if (s % 4 === 0) m.tri(t, root * 2 * [1, 1.5, 2 ** (3 / 12), 1.5][s >> 2], (m.beat / 4) * 1.4);
      if (s % 4 === 2) m.hat(t, 0.06);
    },
    raid(m, s, t, root, I, ch) {
      if (s === 0 || s === 10) m.kick(t, 0.7);
      if (I >= 1 && s === 12) m.snare(t, 0.6);
      if (s % 4 === 2) m.hat(t, 0.08);
      if (I >= 3 && s % 2 === 1) m.hat(t, 0.04);
      if (s % 4 === 0) m.tri(t, root * 2 * [1, 1.5, 2 ** (3 / 12), 1.5][s >> 2], (m.beat / 4) * 1.4);
      if (I >= 2) {
        // pizzicato steps on the 50 % pulse
        const n = [0, -1, 7, -1, 3, 5, -1, 7, 12, -1, 10, 7, -1, 5, 3, -1][s];
        if (n >= 0) m.pulse(t, root * 4 * 2 ** (n / 12), (m.beat / 4) * 0.45, 0.03, 'pulse50');
      }
      if (I >= 3 && s % 2 === 0) m.pulse(t, tones(root, ch, 3)[(s >> 1) % 3], (m.beat / 4) * 0.6, 0.014, 'pulse12', { echo: true });
      if (I >= 4 && s === 8 && m.bar % 2 === 1) m.pulse(t, root * 8, m.beat * 2, 0.035, 'pulse25', { vib: true, echo: true });
    },
  },
  speedrun: {
    name: 'Speedrun',
    kind: 'raid',
    prog: [N(3), N(-2), N(0), N(-4)], // C G Am F
    chords: [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]],
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 170 + (bpm - 140) * 0.4 : bpm),
    prep(m, s, t, root, I, ch) {
      if (s === 0 || s === 10) m.kick(t, 0.5);
      if (s % 2 === 0) m.tri(t, root * 2, (m.beat / 4) * 1.6);
      if (s % 4 === 0) m.chord(t, tones(root, ch, 2), (m.beat / 4) * 0.9, 0.015, 'pulse12');
    },
    raid(m, s, t, root, I, ch) {
      // a breakbeat on the noise channel, the run on top
      if (s === 0 || s === 10) m.kick(t, 0.85);
      if (s === 4 || s === 12) m.snare(t, 0.9);
      if (I >= 1) m.hat(t, s % 2 ? 0.05 : 0.08);
      if (I >= 3 && s === 7) m.snare(t, 0.35);
      if (s % 2 === 0) m.tri(t, root * 2 * (s % 8 === 6 ? 2 : 1), (m.beat / 4) * 1.7);
      if (I >= 2) m.pulse(t, tones(root, ch, 3)[s % 3] * (s % 6 >= 3 ? 2 : 1), (m.beat / 4) * 0.7, 0.015, 'pulse12');
      if (I >= 3)
        line(m, t, s, root, [
          [[0, 12, 2], [2, 16, 2], [4, 19, 4], [8, 17, 2], [10, 16, 2], [12, 12, 4]],
          [[0, 14, 4], [4, 12, 2], [6, 11, 2], [8, 12, 8]],
        ][m.bar % 2]);
      if (I >= 4 && s === 0 && m.bar % 4 === 0) m.riser(m.beat * 4);
    },
  },
  neon: {
    name: 'Neon Cartridge',
    kind: 'raid',
    prog: [N(5), N(1), N(3), N(0)], // Dm Bb C A
    chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]],
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 116 + (bpm - 140) * 0.7 : bpm * 0.88),
    prep(m, s, t, root, I, ch) {
      if (s % 4 === 0) m.kick(t, 0.55);
      if (s % 2 === 0) m.tri(t, root * (s % 4 === 2 ? 4 : 2), (m.beat / 2) * 0.8);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, ch, 0.03);
    },
    raid(m, s, t, root, I, ch) {
      // synthwave on a cartridge: octave bass, a long snare tail, slow chords
      if (s % 4 === 0) m.kick(t, 0.85);
      if (s === 4 || s === 12) m.snare(t, I >= 1 ? 1 : 0.6, 0.28);
      if (s % 4 === 2) m.hat(t, 0.08);
      if (s % 2 === 0) m.tri(t, root * (s % 4 === 2 ? 4 : 2), (m.beat / 2) * 0.85);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, ch, 0.032);
      if (I >= 2 && s % 2 === 1) m.pulse(t, tones(root, ch, 3)[(s >> 1) % 3], (m.beat / 4) * 0.7, 0.013, 'pulse12', { echo: true });
      if (I >= 3 && s % 8 === 0) {
        const mel = [12, 15, 14, 10, 12, 7, 10, 3][(m.bar * 2 + (s >> 3)) % 8];
        m.pulse(t, root * 4 * 2 ** (mel / 12), m.beat * 1.8, 0.04, 'pulse25', { vib: true, echo: true });
      }
      if (I >= 4 && s === 0 && m.bar % 4 === 0) m.riser(m.beat * 4);
    },
  },
  dungeon: {
    name: 'Dungeon Crawl',
    kind: 'raid',
    prog: [N(9), N(5), N(7), N(9)], // F#m D E F#m
    chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 3, 7]],
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 138 + (bpm - 140) * 0.6 : bpm * 0.95),
    prep(m, s, t, root) {
      if (s % 4 === 0) m.tri(t, root * 2, (m.beat / 4) * 1.8);
      if (s === 12) m.snare(t, 0.3);
    },
    raid(m, s, t, root, I, ch) {
      // a march: snare rolls, quarter-note triangle, minor arps, a lead that climbs
      if (s === 0 || s === 8) m.kick(t, 0.8);
      if (s === 4 || s === 12) m.snare(t, 0.8);
      if (I >= 2 && (s === 14 || s === 15)) m.snare(t, 0.35);
      if (s % 4 === 0) m.tri(t, root * 2 * (s === 8 ? 1.5 : 1), (m.beat / 4) * 1.8);
      if (s % 4 === 2) m.tri(t, root * 4, (m.beat / 4) * 0.8);
      if (I >= 1) m.pulse(t, tones(root, ch, 2)[s % 3] * (s >= 8 ? 2 : 1), (m.beat / 4) * 0.75, 0.015, 'pulse12');
      if (I >= 3)
        line(m, t, s, root, [
          [[0, 12, 4], [4, 14, 4], [8, 15, 4], [12, 19, 4]],
          [[0, 17, 6], [6, 15, 2], [8, 14, 8]],
        ][m.bar % 2]);
      if (I >= 4 && s === 0 && m.bar % 2 === 0) m.siren(t);
    },
  },
  final: {
    name: 'Final Stage',
    kind: 'raid',
    prog: [N(2), N(-2), N(5), N(0)], // Bm G D A
    chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]],
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 164 + (bpm - 140) * 0.5 : bpm),
    prep(m, s, t, root, I, ch) {
      if (s % 4 === 0) m.kick(t, 0.55);
      if (s % 2 === 0) m.tri(t, root * 2, (m.beat / 4) * 1.6);
      if (s === 0) m.chord(t, tones(root, ch, 2), m.beat * 2, 0.02, 'pulse12');
    },
    raid(m, s, t, root, I, ch) {
      if (s % 4 === 0) m.kick(t, 0.9);
      if (s === 4 || s === 12) m.snare(t, 1);
      if (I >= 1 && s % 2 === 1) m.hat(t, 0.08);
      m.tri(t, root * 2 * (s % 4 === 3 ? 2 : 1), (m.beat / 4) * 0.85);
      if (I >= 1 && s % 4 === 0) m.chord(t, tones(root, ch, 2), (m.beat / 4) * 1.6, 0.016, 'pulse12');
      // the heroic line, doubled a third below from intensity 3
      if (I >= 2)
        line(m, t, s, root, [
          [[0, 12, 6], [6, 14, 2], [8, 15, 4], [12, 19, 4]],
          [[0, 17, 4], [4, 15, 4], [8, 14, 6], [14, 12, 2]],
        ][m.bar % 2], { vol: 0.042, harmony: I >= 3 ? 4 : 0 });
      if (I >= 4 && s === 0 && m.bar % 4 === 0) m.riser(m.beat * 4);
    },
  },
  coins: {
    name: 'Coin Rush',
    kind: 'raid',
    prog: [N(-2), N(3), N(5), N(-2)], // G C D G: the cheerful one
    chords: [[0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]],
    bars: 1,
    tempo: (mode, bpm) => (mode === 'raid' ? 150 + (bpm - 140) * 0.5 : bpm),
    prep(m, s, t, root, I, ch) {
      if (s % 4 === 0) m.kick(t, 0.45);
      if (s % 4 === 0 || s % 4 === 2) m.tri(t, root * (s % 4 === 2 ? 3 : 2), (m.beat / 4) * 1.6);
      if (s % 4 === 2) m.chord(t, tones(root, ch, 2), (m.beat / 4) * 0.8, 0.016, 'pulse50');
    },
    raid(m, s, t, root, I, ch) {
      // bouncy bass, chord hops on the offbeat, a coin-pickup arpeggio every bar
      if (s % 4 === 0) m.kick(t, 0.75);
      if (I >= 1 && (s === 4 || s === 12)) m.snare(t, 0.7);
      if (I >= 1 && s % 2 === 1) m.hat(t, 0.07);
      if (s % 4 === 0 || s % 4 === 2) m.tri(t, root * (s % 4 === 2 ? 3 : 2), (m.beat / 4) * 1.6);
      if (s % 4 === 2) m.chord(t, tones(root, ch, 2), (m.beat / 4) * 0.8, 0.017, 'pulse50');
      if (I >= 2 && s === 14) for (let i = 0; i < 4; i++) m.pulse(t + i * 0.035, root * 8 * 2 ** ([0, 7, 12, 16][i] / 12), 0.05, 0.02, 'pulse12');
      if (I >= 3)
        line(m, t, s, root, [
          [[0, 16, 2], [2, 19, 2], [4, 24, 4], [8, 21, 2], [10, 19, 2], [12, 16, 4]],
          [[0, 14, 4], [4, 16, 2], [6, 14, 2], [8, 12, 8]],
        ][m.bar % 2]);
      if (I >= 4 && s === 0 && m.bar % 4 === 0) m.riser(m.beat * 4);
    },
  },
};
export const RAID_TRACKS = Object.keys(TRACKS).filter((k) => TRACKS[k].kind === 'raid');
export const LOBBY_TRACKS = Object.keys(TRACKS).filter((k) => TRACKS[k].kind === 'lobby');
// the match tracks that suit each map (auto mode picks from these most of the time)
const MAP_TRACKS = {
  docks: ['heist', 'dungeon', 'rush'],
  chain: ['neon', 'speedrun', 'final'],
  lego: ['coins', 'speedrun'],
  dunes: ['dungeon', 'rush', 'coins'],
  snow: ['final', 'speedrun', 'rush'],
  lava: ['boss', 'final', 'dungeon'],
  city: ['heist', 'rush', 'neon'],
  neon: ['neon', 'speedrun', 'final'],
  blackout: ['heist', 'boss', 'dungeon'],
  fantasy: ['dungeon', 'final'],
  toon: ['coins', 'speedrun'],
  gravity: ['speedrun', 'coins', 'neon'],
  speedway: ['speedrun', 'rush', 'final'],
  skate: ['coins', 'rush', 'speedrun'],
  metro: ['heist', 'rush', 'neon'],
  factory: ['boss', 'dungeon', 'heist'],
  jungle: ['dungeon', 'rush', 'coins'],
  junkyard: ['boss', 'heist', 'rush'],
  moon: ['neon', 'final', 'speedrun'],
  casino: ['heist', 'coins', 'neon'],
};

export class Music {
  constructor(ctx, dest) {
    this.waves = chipWaves(ctx);
    // the tracks build their voices from this.ctx: its oscillators play console waves
    this.ctx = this.chipContext(ctx);
    this.dest = dest;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = TOP; // the console's own soft top end
    this.duckG = ctx.createGain();
    this.out.connect(this.filter).connect(this.duckG).connect(dest);
    // a short echo, the one luxury modern chiptune allows itself
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    this.delay.connect(fb).connect(this.delay);
    this.delayOut = ctx.createGain();
    this.delayOut.gain.value = 0.22;
    this.delay.connect(this.delayOut).connect(this.out);
    this.noiseBuf = lfsrNoise(ctx);
    this.mode = 'lobby';
    this.intensity = 0;
    this.bpm = 96;
    this.targetBpm = 96;
    this.gameBpm = 96;
    this.step = 0;
    this.bar = 0;
    this.enabled = true;
    this.choice = 'auto'; // the match track: 'auto' or a track id
    this.lobbyChoice = 'auto'; // the menu track: 'auto' (they take turns) or a track id
    this.raidTrack = null; // picked for the next/current match
    this.lobbyN = Math.floor(Math.random() * LOBBY_TRACKS.length);
    this.lobbyTrack = LOBBY_TRACKS[this.lobbyN];
    this.lastRaid = null;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  get beat() {
    return 60 / this.bpm;
  }

  // what is playing now (the menu or the match track)
  get track() {
    return this.mode === 'lobby' ? this.lobbyTrack : (this.raidTrack ?? this.pickRaid());
  }
  get trackName() {
    return TRACKS[this.track]?.name ?? '';
  }

  // The audio context the tracks see: the same one, except that a new oscillator plays a console
  // wave, and setting its type (square, sawtooth, sine, triangle, pulse12…) picks the chip wave.
  chipContext(real) {
    const waves = this.waves;
    const chipOsc = () => {
      const o = real.createOscillator();
      let type = 'sine';
      o.setPeriodicWave(waves.tri);
      Object.defineProperty(o, 'type', {
        get: () => type,
        set: (v) => {
          type = v;
          o.setPeriodicWave(waves[CHIP_FOR[v] ?? v] ?? waves.pulse50);
        },
      });
      return o;
    };
    return new Proxy(real, {
      get(t, p) {
        if (p === 'createOscillator') return chipOsc;
        const v = t[p];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  }

  setEnabled(on) {
    this.enabled = on;
    this.out.gain.setTargetAtTime(on ? 0.55 * (this.volume ?? 1) : 0, this.ctx.currentTime, 0.2);
  }

  setVolume(v) {
    this.volume = v;
    this.setEnabled(this.enabled);
  }

  // the match track: 'auto' mixes them match to match; a track id keeps that one
  choose(id) {
    this.choice = TRACKS[id]?.kind === 'raid' ? id : 'auto';
    if (this.mode !== 'lobby') this.switchTo(this.pickRaid(true));
  }

  // the menu track: 'auto' takes turns; a track id keeps that one (it starts right away)
  chooseLobby(id) {
    this.lobbyChoice = TRACKS[id]?.kind === 'lobby' ? id : 'auto';
    if (this.lobbyChoice !== 'auto') this.lobbyTrack = this.lobbyChoice;
    if (this.mode === 'lobby') {
      this.announce();
      this.retempo(true);
    }
  }

  pickRaid(force = false) {
    if (this.raidTrack && !force) return this.raidTrack;
    let id = this.choice;
    if (id === 'auto') {
      const pool = RAID_TRACKS.filter((k) => k !== this.lastRaid);
      id = pool[Math.floor(Math.random() * pool.length)];
    }
    this.raidTrack = id;
    this.lastRaid = id;
    this.announce();
    return id;
  }

  // the match starts on a map: in auto mode, a track that suits it (most of the time)
  forMap(theme) {
    const fits = MAP_TRACKS[theme];
    if (this.choice !== 'auto' || !fits || Math.random() < 0.25) return;
    const pool = fits.filter((k) => TRACKS[k] && k !== this.raidTrack);
    if (fits.includes(this.raidTrack) || !pool.length) return;
    this.switchTo(pool[Math.floor(Math.random() * pool.length)]);
  }

  // skip to another track (the pause menu); in the menus, the next menu track
  next() {
    if (this.mode === 'lobby') {
      this.lobbyTrack = LOBBY_TRACKS[(LOBBY_TRACKS.indexOf(this.lobbyTrack) + 1) % LOBBY_TRACKS.length];
      this.announce();
    } else {
      const i = RAID_TRACKS.indexOf(this.raidTrack);
      this.switchTo(RAID_TRACKS[(i + 1) % RAID_TRACKS.length]);
    }
    this.retempo(true);
    return this.trackName;
  }

  switchTo(id) {
    this.raidTrack = id;
    this.lastRaid = id;
    this.announce();
    this.retempo(true);
  }

  announce() {
    try {
      dispatchEvent(new CustomEvent('darkbags:track', { detail: { id: this.track, name: this.trackName } }));
    } catch {
      /* no window (tests) */
    }
  }

  // a new track starts on its own tempo; within a track (the storm closing) it eases over
  retempo(snap = false) {
    const tr = TRACKS[this.track];
    this.targetBpm = Math.round(tr.tempo(this.mode, this.gameBpm));
    if (snap) this.bpm = this.targetBpm;
  }

  set({ mode, intensity, bpm }) {
    if (mode && mode !== this.mode) {
      const was = this.mode;
      this.mode = mode;
      // back in the menus after a match: the next menu track (or the chosen one), a fresh match pick next time
      if (mode === 'lobby' && (was === 'raid' || was === 'calm')) {
        this.raidTrack = null;
        this.lobbyN++;
        this.lobbyTrack = this.lobbyChoice !== 'auto' ? this.lobbyChoice : LOBBY_TRACKS[this.lobbyN % LOBBY_TRACKS.length];
        this.announce();
      }
      if (mode === 'prep' || mode === 'raid') this.pickRaid();
      if (bpm) this.gameBpm = bpm;
      this.retempo(true);
    }
    if (intensity !== undefined) this.intensity = Math.max(0, Math.min(4, intensity));
    if (bpm && bpm !== this.gameBpm) {
      this.gameBpm = bpm;
      this.retempo();
    }
  }

  // the announcer speaks: the music steps back for that long
  duck(secs) {
    const g = this.duckG.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.35, t, 0.04);
    g.setTargetAtTime(1, t + secs, 0.25);
  }

  // taking a hit: the music drops out for a moment, like your ears ringing
  muffle() {
    const f = this.filter.frequency;
    const t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(650, t);
    f.exponentialRampToValueAtTime(TOP, t + 0.9);
  }

  // the result: a level-clear fanfare on a win, a game-over phrase on a loss
  sting(won) {
    if (!this.enabled || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.05;
    this.duck(won ? 2.6 : 2.4);
    // the sting rides its own bus, past the duck that quiets the track under it
    if (!this.stingBus) {
      this.stingBus = this.ctx.createGain();
      this.stingBus.connect(this.dest);
    }
    this.stingBus.gain.value = 0.9 * (this.volume ?? 1);
    const main = this.out;
    this.out = this.stingBus;
    const notes = won ? [0, 4, 7, 12, 16, 19, 24] : [12, 11, 10, 9, 8, 7, 3, 0];
    const step = won ? 0.08 : 0.12;
    const base = N(won ? 3 : 0, 220); // C major / A minor
    notes.forEach((n, i) => this.pulse(t + i * step, base * 2 ** (n / 12), won && i === notes.length - 1 ? 0.7 : step * 0.9, won ? 0.09 : 0.07, 'pulse25', { vib: won && i === notes.length - 1 }));
    const end = t + notes.length * step;
    this.tri(end, base / (won ? 2 : 4), won ? 0.8 : 1.1, 0.16);
    if (won) {
      this.chord(end, [0, 4, 7].map((n) => base * 2 * 2 ** (n / 12)), 0.8, 0.04, 'pulse12');
      this.kick(end, 0.8);
    } else this.noiseHit(end, { type: 'lowpass', f: 900, vol: 0.18, dur: 0.6 });
    this.out = main;
  }

  // the storm's last stage: a noise sweep climbing into the next bar
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
    g.gain.exponentialRampToValueAtTime(0.12, t + secs);
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
      const tr = TRACKS[this.track];
      const sw = tr.swing && this.step % 2 === 1 ? tr.swing * (this.beat / 4) : 0;
      this.playStep(this.step, this.nextTime + sw, tr);
      this.nextTime += this.beat / 4;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        this.bpm += (this.targetBpm - this.bpm) * 0.5;
        if (Math.abs(this.targetBpm - this.bpm) < 0.5) this.bpm = this.targetBpm;
      }
    }
  }

  playStep(s, t, tr) {
    const k = Math.floor(this.bar / (tr.bars ?? 2)) % tr.prog.length;
    const root = tr.prog[k];
    const ch = tr.chords?.[k] ?? [0, 3, 7];
    if (this.mode === 'lobby') return tr.lobby?.(this, s, t, root, 0, ch);
    if (this.mode === 'prep') return tr.prep?.(this, s, t, root, 0, ch);
    if (this.mode === 'calm') {
      // spectating: the track's bones only
      if (s === 0 || s === 10) this.kick(t, 0.4);
      if (s === 0 && this.bar % 2 === 0) this.pad(t, root, this.beat * 8, ch, 0.03);
      return;
    }
    tr.raid?.(this, s, t, root, this.intensity, ch);
  }

  // ------------------------------------------------------------ instruments
  osc(type, f, t, dur, to) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.connect(to);
    o.start(t);
    o.stop(t + dur + 0.03);
    return o;
  }

  // a pulse channel: the console's instant attack, a volume that steps down while held
  pulse(t, f, dur, vol, wave = 'pulse25', { vib = false, echo = false } = {}) {
    vol *= WAVE_GAIN[wave] ?? 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.linearRampToValueAtTime(vol * 0.62, t + Math.max(0.02, dur * 0.7));
    g.gain.setValueAtTime(vol * 0.62, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    const o = this.osc(wave, f, t, dur + 0.02, g);
    if (vib && dur > 0.18) this.vibrato(o, t + Math.min(0.12, dur * 0.3), t + dur);
    g.connect(this.out);
    if (echo) g.connect(this.delay);
    return o;
  }

  // the console vibrato: a wobble that sets in a moment after the note starts
  vibrato(o, from, to, cents = 26, rate = 5.5) {
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = rate;
    const d = this.ctx.createGain();
    d.gain.setValueAtTime(0, from);
    d.gain.linearRampToValueAtTime(cents, from + 0.08);
    lfo.connect(d).connect(o.detune);
    lfo.start(from);
    lfo.stop(to + 0.05);
  }

  // a few pulses at once (a chord stab)
  chord(t, freqs, dur, vol, wave = 'pulse12') {
    for (const f of freqs) this.pulse(t, f, dur, vol, wave);
  }

  // the triangle channel: no volume control on the console, so it is on or off (a tiny release
  // keeps it from clicking)
  tri(t, f, dur, vol = 0.05) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.015);
    this.osc('triangle', f, t, dur + 0.015, g);
    g.connect(this.out);
  }

  // a slow chord swell on the thin pulse (spectating, the boss intro)
  pad(t, root, dur, chord = [0, 3, 7], vol = 0.03) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol * WAVE_GAIN.pulse12, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const n of chord) this.osc('pulse12', root * 4 * 2 ** (n / 12), t, dur, g);
    g.connect(this.out);
    g.connect(this.delay);
  }

  // the kick: the triangle dropping in pitch, the console way
  kick(t, v) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    const g = c.createGain();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    g.gain.setValueAtTime(0.24 * v, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.18);
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
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5, dur + 0.05);
    return g;
  }

  // the snare: a noise burst over a falling triangle blip (tail: how long the noise rings)
  snare(t, v, tail = 0.13) {
    this.noiseHit(t, { type: 'bandpass', f: 2200, q: 0.7, vol: 0.2 * v, dur: tail });
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.05);
    g.gain.setValueAtTime(0.16 * v, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.08);
  }

  hat(t, v) {
    this.noiseHit(t, { type: 'highpass', f: 7000, vol: 0.14 * v, dur: 0.035 });
  }

  // the alarm at full danger: a triangle sweeping up and down
  siren(t) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(620, t);
    o.frequency.linearRampToValueAtTime(930, t + 0.45);
    o.frequency.linearRampToValueAtTime(620, t + 0.9);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.95);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 1);
  }
}
