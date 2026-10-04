// Adaptive soundtrack, synthesized live (no audio files, nothing to license). Several tracks
// in different styles: the raid gets one per match (techno, darksynth, phonk, drum & bass,
// hardstyle, trap, industrial, chiptune, dubstep, trance, war drums), picked to suit the map;
// the menus rotate their own chill ones (lo-fi with rain, late-night jazz, a music box, tape
// chillwave, ambient, bossa nova, dark pulse, slow synthwave). Every raid track has a
// ready-room build-up and gets faster and denser as the storm closes and danger rises.
// A short sting plays on the result: a win fanfare or a fall.

const N = (semi, base = 55) => base * 2 ** (semi / 12); // A1 = 55 Hz

// 16-step patterns
const ROLL = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
const OFFBEAT = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];

// ------------------------------------------------------------------ the tracks
// prog: bass roots (Hz) per chord, `bars` bars each; tempo maps the game's bpm (lobby 96,
// ready room ~124-150, raid 140 + 7 per storm stage) to the track's own feel.
export const TRACKS = {
  // ------------------------------------------------------------- raid tracks
  heist: {
    name: 'Night Heist',
    kind: 'raid',
    prog: [N(0), N(1), N(0), N(-2)], // A Bb A G: phrygian menace
    bars: 2,
    tempo: (mode, bpm) => bpm,
    prep(m, s, t, root) {
      if (s % 4 === 0) m.kick(t, 0.8);
      if (s % 2 === 1) m.hat(t, 0.25);
      if (ROLL[s] && s % 2 === 0) m.bass(t, root, 0.7);
      if (s === 0) m.pad(t, root, m.beat * 4);
    },
    raid(m, s, t, root, I) {
      if (s % 4 === 0) m.kick(t, 1);
      if (I >= 3 && s === 14) m.kick(t, 0.6);
      if (I >= 1 && (s === 4 || s === 12)) m.snare(t, 1);
      if (I >= 4 && (s === 7 || s === 15)) m.snare(t, 0.35);
      if (I >= 1 && s % 2 === 1) m.hat(t, 0.35);
      if (I >= 3 && s % 4 === 2) m.hat(t, 0.2);
      const pat = I >= 2 ? ROLL : OFFBEAT;
      if (pat[s]) m.bass(t, root * (s % 8 === 6 ? 2 : 1), 1);
      if (I >= 2 && s === 0) m.stab(t, root, 0.06, [0, 3, 7]);
      if (I >= 3 && (s % 2 === 0 || I >= 4)) {
        const n = [0, 3, 7, 12, 10, 7, 3, 1][(s + m.bar * 3) % 8];
        m.lead(t, root * 8 * 2 ** (n / 12));
      }
      if (I >= 4 && s === 0 && m.bar % 2 === 0) m.siren(t);
    },
  },
  neon: {
    name: 'Neon Chase',
    kind: 'raid',
    prog: [N(5), N(1), N(3), N(0)], // D Bb C A: darksynth minor
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 112 + (bpm - 140) * 0.8 : bpm * 0.88),
    prep(m, s, t, root) {
      if (s % 4 === 0) m.kick(t, 0.75);
      if (s % 2 === 0) m.bass(t, root * (s % 4 === 2 ? 2 : 1), 0.6, 1.6);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, [0, 3, 7, 12]);
      if (s % 2 === 1) m.pluck(t, root * 4 * 2 ** ([0, 7, 3, 10][(s >> 1) % 4] / 12), 0.03);
    },
    raid(m, s, t, root, I) {
      if (s % 4 === 0) m.kick(t, 1);
      if (s === 4 || s === 12) m.gatedSnare(t, I >= 1 ? 1 : 0.6);
      if (s % 4 === 2) m.hat(t, 0.3);
      if (I >= 3 && s % 2 === 1) m.hat(t, 0.15);
      // octave-bouncing eighths, the synthwave engine
      if (s % 2 === 0) m.bass(t, root * (s % 4 === 2 ? 2 : 1), 0.85, 1.7);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, [0, 3, 7, 12]);
      if (I >= 2) {
        const n = [0, 3, 7, 10, 12, 10, 7, 3][(s + m.bar) % 8];
        m.pluck(t, root * 4 * 2 ** (n / 12), 0.045);
      }
      if (I >= 3 && s % 8 === 0) {
        const mel = [12, 15, 14, 10, 12, 7, 10, 3][(m.bar * 2 + (s >> 3)) % 8];
        m.lead(t, root * 4 * 2 ** (mel / 12), 0.05, 0.4);
      }
      if (I >= 4 && s === 0 && m.bar % 4 === 0) m.riser(m.beat * 4);
    },
  },
  phonk: {
    name: 'Drift Vault',
    kind: 'raid',
    prog: [N(4), N(4), N(5), N(3)], // C# C# D C: phonk phrygian
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 138 + (bpm - 140) * 0.7 : bpm * 0.95),
    prep(m, s, t, root) {
      if (s === 0 || s === 10) m.kick808(t, root, m.beat * 1.5, 0.7);
      if (s === 8) m.clap(t, 0.7);
      if (s % 2 === 0) m.hat(t, 0.22);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, [0, 3, 7]);
    },
    raid(m, s, t, root, I) {
      // half-time: the clap on 3, the 808 sliding under it
      if (s === 0 || s === 10 || (I >= 2 && s === 7)) m.kick808(t, root, m.beat * (s === 0 ? 1.6 : 0.9), 1, s === 10 ? root * 1.5 : 0);
      if (s === 8) m.clap(t, 1);
      if (I >= 3 && s === 15) m.clap(t, 0.4);
      if (s % 2 === 0) m.hat(t, 0.28);
      if (I >= 2 && (s === 13 || s === 14 || s === 15) && m.bar % 2 === 1) m.hat(t, 0.22); // roll
      // the cowbell riff
      const bell = [0, -1, 7, -1, 5, -1, 3, 0, -1, 3, -1, 0, -1, -1, 3, -1];
      if (bell[s] >= 0 && I >= 1) m.cowbell(t, root * 8 * 2 ** (bell[s] / 12), I >= 3 ? 0.07 : 0.05);
      if (I >= 3 && s === 0 && m.bar % 2 === 0) m.stab(t, root, 0.05, [0, 3, 7]);
      if (I >= 4 && s === 0 && m.bar % 2 === 0) m.siren(t);
    },
  },
  dnb: {
    name: 'Storm Breaks',
    kind: 'raid',
    prog: [N(-2), N(-2), N(1), N(-4)], // G G Bb F
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 168 + (bpm - 140) * 0.45 : bpm * 1.05),
    prep(m, s, t, root) {
      if (s === 0 || s === 10) m.kick(t, 0.7);
      if (s === 4 || s === 12) m.snare(t, 0.6);
      if (s % 2 === 1) m.hat(t, 0.2);
      if (s === 0 && m.bar % 2 === 0) m.reese(t, root, m.beat * 8, 0.6);
    },
    raid(m, s, t, root, I) {
      // the two-step break
      if (s === 0 || s === 10 || (I >= 3 && s === 6)) m.kick(t, 1);
      if (s === 4 || s === 12) m.snare(t, 1);
      if (I >= 2 && (s === 7 || s === 15 || s === 9)) m.snare(t, 0.22); // ghosts
      if (s % 2 === 0) m.hat(t, 0.3);
      if (I >= 3) m.hat(t, 0.12);
      if (s === 0 && m.bar % 2 === 0) m.reese(t, root, m.beat * 8, 1);
      if (s === 0 && m.bar % 4 === 0) m.pad(t, root, m.beat * 16, [0, 3, 7, 10]);
      if (I >= 2 && s % 4 === 3) m.pluck(t, root * 8 * 2 ** ([0, 3, 7, 10][(s >> 2) % 4] / 12), 0.03);
      if (I >= 4 && s === 0 && m.bar % 2 === 0) m.siren(t);
    },
  },
  // ------------------------------------------------------------- menu tracks
  pulse: {
    name: 'Dark Pulse',
    kind: 'lobby',
    prog: [N(0), N(1), N(0), N(-2)],
    bars: 2,
    tempo: () => 96,
    lobby(m, s, t, root) {
      if (s === 0 || s === 10) m.kick(t, 0.55);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8);
      if (s % 4 === 2) m.hat(t, 0.12);
      if (s === 12 && m.bar % 4 === 3) m.stab(t, root, 0.035, [0, 3, 7]);
    },
  },
  lofi: {
    name: 'Safehouse',
    kind: 'lobby',
    prog: [N(0), N(-4), N(5), N(7)], // Am9 Fmaj7 Dm9 E7
    chords: [[0, 3, 7, 10, 14], [0, 4, 7, 11], [0, 3, 7, 10, 14], [0, 4, 7, 10]],
    bars: 1,
    swing: 0.22,
    crackle: true,
    tempo: () => 80,
    lobby(m, s, t, root, I, ch) {
      if (s === 0 || s === 7 || s === 10) m.kick(t, s === 0 ? 0.6 : 0.4);
      if (s === 4 || s === 12) m.snare(t, 0.35);
      if (s % 2 === 0) m.hat(t, s % 4 === 0 ? 0.14 : 0.09);
      if (s === 0) m.keys(t, root * 4, ch, m.beat * 3.6);
      if (s === 10 && m.bar % 2 === 1) m.keys(t, root * 4, ch.slice(1), m.beat * 1.4, 0.6);
      if (s === 0 || s === 6 || s === 10) m.sub(t, root * 2, m.beat * (s === 0 ? 1.4 : 0.9), 0.5);
    },
  },
  rain: {
    name: 'Neon Rain',
    kind: 'lobby',
    prog: [N(5), N(1), N(3), N(0)],
    bars: 2,
    tempo: () => 88,
    lobby(m, s, t, root) {
      if (s === 0 || s === 8) m.kick(t, 0.5);
      if (s === 4 || s === 12) m.gatedSnare(t, 0.45);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, [0, 3, 7, 12]);
      if (s % 4 === 0) m.bass(t, root * (s === 8 ? 2 : 1), 0.5, 3);
      if (s % 2 === 0) m.pluck(t, root * 4 * 2 ** ([0, 7, 12, 15, 12, 7, 3, 7][(s >> 1) % 8] / 12), 0.025);
    },
  },
  // ------------------------------------------------------------- more raid tracks
  hardstyle: {
    name: 'Overclock',
    kind: 'raid',
    prog: [N(0), N(-4), N(3), N(-2)], // Am F C G
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 150 + (bpm - 140) * 0.5 : bpm),
    prep(m, s, t, root) {
      if (s % 4 === 0) m.kick808(t, root, m.beat * 0.7, 0.6);
      if (s % 4 === 2) m.hat(t, 0.25);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, [0, 3, 7, 12]);
    },
    raid(m, s, t, root, I) {
      // the distorted kick with its tail on every beat
      if (s % 4 === 0) m.kick808(t, root, m.beat * 0.85, 1);
      if (s % 4 === 2) m.hat(t, 0.32);
      if (I >= 1 && (s === 4 || s === 12)) m.clap(t, 0.8);
      if (I >= 2 && s % 2 === 0) m.screech(t, root * 4 * 2 ** ([12, 12, 15, 12, 19, 17, 15, 12][(s >> 1) % 8] / 12), m.beat * 0.45, 0.04);
      if (I >= 3 && s === 0) m.supersaw(t, root * 2, m.beat * 3.5, 0.035, [0, 3, 7]);
      if (I >= 4 && s === 0 && m.bar % 4 === 0) m.riser(m.beat * 4);
      if (I >= 4 && s === 8 && m.bar % 2 === 1) m.siren(t);
    },
  },
  trap: {
    name: 'Bag Run',
    kind: 'raid',
    prog: [N(5), N(3), N(1), N(0)], // D C Bb A
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 142 + (bpm - 140) * 0.4 : bpm * 0.9),
    prep(m, s, t, root) {
      if (s === 0) m.kick808(t, root, m.beat * 2, 0.7);
      if (s % 2 === 0) m.hat(t, 0.18);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, [0, 3, 7]);
    },
    raid(m, s, t, root, I) {
      if (s === 0 || s === 6 || (I >= 2 && s === 11)) m.kick808(t, root, m.beat * (s === 0 ? 1.4 : 0.8), 1, s === 11 ? root * 0.75 : 0);
      if (s === 8) {
        m.clap(t, 1);
        m.snare(t, 0.6);
      }
      if (s % 2 === 0) m.hat(t, 0.26);
      // hi-hat rolls: triplets and thirty-seconds at the end of the bar
      if (I >= 1 && s >= 12 && m.bar % 2 === 1) for (let k = 1; k < 3; k++) m.hat(t + (m.beat / 12) * k, 0.18);
      if (I >= 3 && s % 4 === 3) m.hat(t + m.beat / 8, 0.14);
      // the bell melody
      const bell = [0, -1, -1, 7, -1, -1, 3, -1, 10, -1, -1, 7, -1, 3, -1, -1];
      if (I >= 1 && bell[s] >= 0) m.bell(t, root * 8 * 2 ** (bell[s] / 12), 0.05, 0.5);
      if (I >= 3 && s === 0 && m.bar % 2 === 0) m.lead(t, root * 4 * 2 ** (([0, 3, 5, 7][(m.bar >> 1) % 4]) / 12), 0.04, m.beat * 1.5);
      if (I >= 4 && s === 0 && m.bar % 2 === 0) m.siren(t);
    },
  },
  industrial: {
    name: 'Rust Engine',
    kind: 'raid',
    prog: [N(0), N(0), N(1), N(-1)], // A A Bb G#
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 128 + (bpm - 140) * 0.6 : bpm * 0.92),
    prep(m, s, t, root) {
      if (s % 4 === 0) m.kick(t, 0.75);
      if (s === 6 || s === 14) m.metal(t, 0.4);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, [0, 1, 7]);
    },
    raid(m, s, t, root, I) {
      if (s % 4 === 0) m.kick(t, 1.1);
      if (s === 4 || s === 12) {
        m.snare(t, 0.9);
        m.metal(t, 0.6);
      }
      if (I >= 1 && (s === 2 || s === 10 || s === 15)) m.metal(t, 0.45);
      if (I >= 1 && s % 2 === 1) m.hat(t, 0.2);
      if (I >= 2) m.bass(t, root * (s % 8 === 7 ? 2 : 1), s % 2 ? 0.55 : 0.9, 0.5);
      if (I >= 3 && (s === 0 || s === 3) && m.bar % 2 === 0) m.screech(t, root * 4 * 2 ** ((s ? 1 : 0) / 12), m.beat * 0.6, 0.035);
      if (I >= 4 && s === 0 && m.bar % 2 === 0) m.siren(t);
    },
  },
  chiptune: {
    name: '8-Bit Heist',
    kind: 'raid',
    prog: [N(0), N(-4), N(-2), N(3)], // A F G C
    chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]],
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 150 + (bpm - 140) * 0.6 : bpm),
    prep(m, s, t, root, I, ch) {
      if (s % 4 === 0) m.kick(t, 0.5);
      if (s % 2 === 0) m.chip(t, root * 8 * 2 ** (ch[(s >> 1) % ch.length] / 12), m.beat / 4, 0.02);
    },
    raid(m, s, t, root, I, ch) {
      if (s % 4 === 0) m.kick(t, 0.8);
      if (s === 4 || s === 12) m.chipNoise(t, 0.3, 0.12);
      if (I >= 1 && s % 2 === 1) m.chipNoise(t, 0.12, 0.03);
      // the bass bounces octaves, the arp runs the chord
      if (s % 2 === 0) m.chip(t, root * (s % 4 === 2 ? 4 : 2), (m.beat / 4) * 1.6, 0.035);
      if (I >= 2) m.chip(t, root * 8 * 2 ** ((ch[s % ch.length] + (s >= 8 ? 12 : 0)) / 12), m.beat / 5, 0.018);
      if (I >= 3 && s % 2 === 0) {
        const mel = [12, -1, 16, 19, 17, -1, 16, 12, 14, -1, 12, 11, 12, -1, 7, -1][((m.bar % 2) * 8 + (s >> 1)) % 16];
        if (mel >= 0) m.chip(t, root * 8 * 2 ** (mel / 12), m.beat * 0.45, 0.03, true);
      }
      if (I >= 4 && s === 0 && m.bar % 4 === 0) m.riser(m.beat * 4);
    },
  },
  dubstep: {
    name: 'Wobble Vault',
    kind: 'raid',
    prog: [N(0), N(-4), N(-2), N(-5)], // A F G E
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 140 + (bpm - 140) * 0.4 : bpm * 0.95),
    prep(m, s, t, root) {
      if (s === 0) m.kick(t, 0.7);
      if (s === 8) m.snare(t, 0.5);
      if (s === 0 && m.bar % 2 === 0) m.reese(t, root, m.beat * 8, 0.5);
    },
    raid(m, s, t, root, I) {
      // half-time: the kick on one, a huge snare on three
      if (s === 0 || (I >= 2 && s === 3)) m.kick(t, 1.1);
      if (s === 8) {
        m.snare(t, 1.1);
        m.clap(t, 0.6);
      }
      if (I >= 1 && s % 2 === 0) m.hat(t, 0.22);
      if (s === 0) m.wobble(t, root, m.beat * 2, 1, I >= 2 ? 4 : 2);
      if (s === 8 && I >= 1) m.wobble(t, root * (m.bar % 2 ? 1.5 : 1), m.beat * 1.5, 0.9, I >= 3 ? 6 : 3);
      if (I >= 3 && s === 14) m.wobble(t, root * 2, m.beat * 0.5, 0.8, 8);
      if (I >= 3 && s === 0 && m.bar % 2 === 0) m.supersaw(t, root * 2, m.beat * 2, 0.03, [0, 3, 7]);
      if (I >= 4 && s === 0 && m.bar % 2 === 0) m.siren(t);
    },
  },
  trance: {
    name: 'Ascend',
    kind: 'raid',
    prog: [N(0), N(-4), N(3), N(-2)], // Am F C G
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 138 + (bpm - 140) * 0.5 : bpm),
    prep(m, s, t, root) {
      if (s % 4 === 0) m.kick(t, 0.7);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, [0, 3, 7, 12]);
      if (s % 2 === 0) m.supersaw(t, root * 4 * 2 ** ([0, 7, 12, 15][(s >> 1) % 4] / 12), m.beat / 4, 0.012);
    },
    raid(m, s, t, root, I) {
      if (s % 4 === 0) m.kick(t, 1);
      if (s % 4 === 2) {
        m.bass(t, root * 2, 0.9, 1.6);
        m.hat(t, 0.32);
      }
      if (I >= 1 && (s === 4 || s === 12)) m.clap(t, 0.7);
      // the gated supersaw arp
      if (I >= 2) m.supersaw(t, root * 4 * 2 ** ([0, 7, 12, 15, 12, 7, 3, 7][s % 8] / 12), (m.beat / 4) * 0.8, 0.016);
      if (I >= 3 && s % 4 === 0) {
        const mel = [15, 14, 12, 10, 12, 15, 19, 17][(m.bar * 4 + (s >> 2)) % 8];
        m.lead(t, root * 4 * 2 ** (mel / 12), 0.045, m.beat * 0.9);
      }
      if (I >= 4 && s === 0 && m.bar % 4 === 0) m.riser(m.beat * 4);
    },
  },
  tribal: {
    name: 'War Drums',
    kind: 'raid',
    prog: [N(0), N(1), N(0), N(-2)], // A Bb A G
    bars: 2,
    tempo: (mode, bpm) => (mode === 'raid' ? 122 + (bpm - 140) * 0.5 : bpm * 0.9),
    prep(m, s, t, root) {
      if (s === 0 || s === 10) m.tom(t, 70, 0.8);
      if (s === 6) m.tom(t, 110, 0.5);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, [0, 7, 12]);
    },
    raid(m, s, t, root, I) {
      const toms = [90, 0, 0, 140, 0, 0, 110, 0, 0, 0, 90, 0, 160, 0, 120, 0];
      if (toms[s]) m.tom(t, toms[s], 0.9);
      if (s === 0 || s === 8) m.kick(t, 1);
      if (I >= 1) m.hat(t, s % 2 ? 0.08 : 0.14); // shakers
      if (I >= 2 && s === 0) m.brass(t, root, m.beat * 3.5, 0.06);
      if (I >= 3 && s % 4 === 0) m.lead(t, root * 4 * 2 ** ([0, 3, 5, 7, 10, 7, 5, 3][(m.bar * 4 + (s >> 2)) % 8] / 12), 0.035, m.beat * 0.8);
      if (I >= 4 && s % 2 === 1) m.tom(t, 200, 0.4);
    },
  },
  // ------------------------------------------------------------- more menu tracks (chill)
  rooftop: {
    name: 'Rooftop Rain',
    kind: 'lobby',
    prog: [N(5), N(-2), N(3), N(0)], // Dm9 G13 Cmaj9 A7b9
    chords: [[0, 3, 7, 10, 14], [0, 4, 10, 14], [0, 4, 7, 11, 14], [0, 4, 7, 10, 13]],
    bars: 1,
    swing: 0.25,
    crackle: true,
    rain: true,
    tempo: () => 74,
    lobby(m, s, t, root, I, ch) {
      if (s === 0 || s === 7 || s === 10) m.kick(t, s === 0 ? 0.55 : 0.35);
      if (s === 4 || s === 12) m.snare(t, 0.28);
      if (s % 2 === 0) m.hat(t, s % 4 === 0 ? 0.11 : 0.07);
      if (s === 0) m.keys(t, root * 4, ch, m.beat * 3.7);
      if (s === 0 || s === 10) m.sub(t, root * 2, m.beat * 1.2, 0.5);
      const mel = [[-1, 14, -1, 10], [12, -1, 7, -1], [-1, 11, 14, -1], [13, -1, 10, 7]][m.bar % 4];
      if (s % 4 === 2 && mel[s >> 2] >= 0) m.bell(t, root * 8 * 2 ** (mel[s >> 2] / 12), 0.03, 0.9);
    },
  },
  lateshift: {
    name: 'Late Shift',
    kind: 'lobby',
    prog: [N(7), N(0), N(5), N(2)], // Em7 A7 Dmaj7 Bm7
    chords: [[0, 3, 7, 10], [0, 4, 7, 10], [0, 4, 7, 11], [0, 3, 7, 10]],
    bars: 1,
    swing: 0.3,
    crackle: true,
    tempo: () => 82,
    lobby(m, s, t, root, I, ch) {
      // a walking bass, brushed snare, a ride, comping keys
      if (s % 4 === 0) m.sub(t, root * 2 * 2 ** ([0, 3, 7, 10][s >> 2] / 12), m.beat * 0.9, 0.55);
      if (s === 0 || s === 8) m.kick(t, 0.35);
      if (s === 4 || s === 12) m.noiseHit(t, { type: 'bandpass', f: 3000, q: 0.6, vol: 0.05, dur: 0.25 });
      if (s % 4 === 0 || s % 4 === 3) m.ride(t, s % 4 === 0 ? 0.6 : 0.35);
      if (s === 2 || (s === 11 && m.bar % 2 === 0)) m.keys(t, root * 4, ch, m.beat * 1.2, 0.8);
      if (m.bar % 4 === 3 && s % 2 === 0 && s >= 8) m.bell(t, root * 8 * 2 ** (ch[(s >> 1) % ch.length] / 12), 0.022, 0.5);
    },
  },
  cabin: {
    name: 'Snow Cabin',
    kind: 'lobby',
    prog: [N(3), N(-2), N(0), N(-4)], // C G Am F
    chords: [[0, 4, 7, 11], [0, 4, 7, 14], [0, 3, 7, 10], [0, 4, 7, 11]],
    bars: 2,
    crackle: true,
    tempo: () => 70,
    lobby(m, s, t, root, I, ch) {
      if (s === 0 && m.bar % 2 === 0) m.kick(t, 0.3);
      if (s === 0) m.keys(t, root * 2, ch, m.beat * 3.8, 1);
      if (s === 0 && m.bar % 2 === 0) m.pad(t, root, m.beat * 8, ch, 0.035);
      // the music box
      const box = [12, 7, 16, 7, 14, 7, 12, 11, 12, 7, 19, 16, 14, 12, 11, 7];
      if (s % 2 === 0) m.bell(t, root * 8 * 2 ** (box[((m.bar % 2) * 8 + (s >> 1)) % 16] / 12), 0.042, 1.1);
    },
  },
  sunset: {
    name: 'Sunset Tape',
    kind: 'lobby',
    prog: [N(3), N(-5), N(0), N(-4)], // C E Am F
    chords: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 3, 7, 10], [0, 4, 7, 11]],
    bars: 2,
    tempo: () => 90,
    lobby(m, s, t, root, I, ch) {
      if (s === 0 || s === 8) m.kick(t, 0.45);
      if (s === 4 || s === 12) m.gatedSnare(t, 0.3);
      if (s % 4 === 2) m.hat(t, 0.08);
      if (s === 0 && m.bar % 2 === 0) m.tapePad(t, root, m.beat * 8, ch);
      if (s % 4 === 0) m.sub(t, root * 2, m.beat * 0.9, 0.4);
      if (s % 2 === 0) m.pluck(t, root * 4 * 2 ** ([0, 7, 12, 16, 12, 7, 4, 7][(s >> 1) % 8] / 12), 0.018);
    },
  },
  drift: {
    name: 'Deep Drift',
    kind: 'lobby',
    prog: [N(0), N(-4), N(-7), N(-2)], // Am F D G
    chords: [[0, 3, 7, 14], [0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 14]],
    bars: 2,
    tempo: () => 60,
    lobby(m, s, t, root, I, ch) {
      // no drums: long pads, a low hum, wind chimes
      if (s === 0 && m.bar % 2 === 0) m.tapePad(t, root, m.beat * 8.5, ch);
      if (s === 0) m.sub(t, root, m.beat * 3.5, 0.35);
      const chime = (m.bar * 7 + s * 3) % 11;
      if (s % 4 === 1 && chime < 4) m.bell(t, root * 8 * 2 ** (ch[chime % ch.length] / 12 + 1), 0.018, 1.6);
    },
  },
  cafe: {
    name: 'Café Heist',
    kind: 'lobby',
    prog: [N(5), N(-2), N(3), N(0)], // Dm9 G7 Cmaj7 A7
    chords: [[0, 3, 7, 10, 14], [0, 4, 7, 10], [0, 4, 7, 11], [0, 4, 7, 10]],
    bars: 1,
    tempo: () => 86,
    lobby(m, s, t, root, I, ch) {
      // bossa nova: kick and bass on one and the and-of-two, the clave, nylon strings
      if (s === 0 || s === 6 || s === 8 || s === 14) m.kick(t, s % 8 === 0 ? 0.4 : 0.25);
      if (s === 0 || s === 8) m.sub(t, root * 2, m.beat * 1.2, 0.5);
      if (s === 6 || s === 14) m.sub(t, root * 2 * 2 ** (7 / 12), m.beat * 0.5, 0.4);
      if ([0, 3, 6, 10, 12].includes(s)) m.rim(t, 0.35);
      if ([0, 3, 6, 10, 12].includes(s) && m.bar % 2 === 0) m.nylon(t, root * 4, ch, 0.03);
      if ([2, 5, 8, 11, 14].includes(s) && m.bar % 2 === 1) m.nylon(t, root * 4, ch, 0.026);
      if (s % 2 === 0) m.hat(t, 0.05);
    },
  },
};
export const RAID_TRACKS = Object.keys(TRACKS).filter((k) => TRACKS[k].kind === 'raid');
const LOBBY_TRACKS = Object.keys(TRACKS).filter((k) => TRACKS[k].kind === 'lobby');
// the raid tracks that suit each map (auto mode picks from these most of the time)
const MAP_TRACKS = {
  docks: ['heist', 'industrial', 'phonk'],
  chain: ['dubstep', 'trance', 'neon'],
  lego: ['chiptune', 'trap'],
  dunes: ['tribal', 'phonk', 'trap'],
  snow: ['trance', 'dnb', 'neon'],
  lava: ['industrial', 'hardstyle', 'dubstep'],
  city: ['trap', 'phonk', 'heist'],
  neon: ['neon', 'trance', 'hardstyle'],
  blackout: ['heist', 'industrial', 'dnb'],
  fantasy: ['tribal', 'trance'],
  toon: ['chiptune', 'trap', 'hardstyle'],
  gravity: ['chiptune', 'dnb', 'hardstyle'],
  speedway: ['dnb', 'hardstyle', 'trap'],
  skate: ['phonk', 'trap', 'chiptune'],
  metro: ['dnb', 'industrial', 'heist'],
  factory: ['industrial', 'dubstep', 'hardstyle'],
  jungle: ['tribal', 'dnb'],
  junkyard: ['industrial', 'phonk', 'dubstep'],
  moon: ['trance', 'neon', 'dnb'],
  casino: ['heist', 'phonk', 'neon'],
};

export class Music {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.dest = dest;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.duckG = ctx.createGain();
    this.out.connect(this.filter).connect(this.duckG).connect(dest);
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
    this.gameBpm = 96;
    this.step = 0;
    this.bar = 0;
    this.enabled = true;
    this.choice = 'auto'; // 'auto' or a raid track id
    this.raidTrack = null; // picked for the next/current raid
    this.lobbyN = Math.floor(Math.random() * LOBBY_TRACKS.length);
    this.lobbyTrack = LOBBY_TRACKS[this.lobbyN];
    this.lastRaid = null;
    this.crackleG = null;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  get beat() {
    return 60 / this.bpm;
  }

  // what is playing now (the menu or the raid track)
  get track() {
    return this.mode === 'lobby' ? this.lobbyTrack : (this.raidTrack ?? this.pickRaid());
  }
  get trackName() {
    return TRACKS[this.track]?.name ?? '';
  }

  setEnabled(on) {
    this.enabled = on;
    this.out.gain.setTargetAtTime(on ? 0.55 * (this.volume ?? 1) : 0, this.ctx.currentTime, 0.2);
  }

  setVolume(v) {
    this.volume = v;
    this.setEnabled(this.enabled);
  }

  // 'auto' mixes the raid tracks match to match; a track id keeps that one
  choose(id) {
    this.choice = TRACKS[id]?.kind === 'raid' ? id : 'auto';
    if (this.mode !== 'lobby') this.switchTo(this.pickRaid(true));
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

  // the raid starts on a map: in auto mode, a track that suits it (most of the time)
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
    this.crackle(!!tr.crackle && this.mode === 'lobby');
    this.rainBed(!!tr.rain && this.mode === 'lobby');
  }

  set({ mode, intensity, bpm }) {
    if (mode && mode !== this.mode) {
      const was = this.mode;
      this.mode = mode;
      // back in the menus after a match: the next menu track, and a fresh raid pick next time
      if (mode === 'lobby' && (was === 'raid' || was === 'calm')) {
        this.raidTrack = null;
        this.lobbyN++;
        this.lobbyTrack = LOBBY_TRACKS[this.lobbyN % LOBBY_TRACKS.length];
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
    f.exponentialRampToValueAtTime(18000, t + 0.9);
  }

  // the result: a short fanfare on a win, a falling phrase on a loss
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
    const notes = won ? [0, 4, 7, 12, 16, 19] : [12, 10, 7, 3, 0];
    const base = N(won ? 3 : 0, 220); // C major / A minor
    notes.forEach((n, i) => this.lead(t + i * (won ? 0.09 : 0.16), base * 2 ** (n / 12), won ? 0.13 : 0.08, won ? 0.3 : 0.45));
    const end = t + notes.length * (won ? 0.09 : 0.16);
    this.pad(end, base / 4, won ? 1.8 : 2.2, won ? [0, 4, 7, 12] : [0, 3, 7], 0.12);
    if (won) {
      this.kick(end, 0.8);
      this.noiseHit(end, { type: 'highpass', f: 5000, vol: 0.12, dur: 1.2 }); // cymbal
    } else this.kick808(end, base / 4, 1.4, 0.7, base / 8);
    this.out = main;
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
      if (s === 0 || s === 10) this.kick(t, 0.45);
      if (s === 0 && this.bar % 2 === 0) this.pad(t, root, this.beat * 8);
      return;
    }
    tr.raid?.(this, s, t, root, this.intensity, ch);
  }

  // ------------------------------------------------------------ instruments
  env(g, t, vol, dur, attack = 0.002) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  osc(type, f, t, dur, to) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.connect(to);
    o.start(t);
    o.stop(t + dur + 0.03);
    return o;
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

  // the long, slightly distorted 808, optionally sliding to another note
  kick808(t, f, dur, v, slideTo = 0) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 3, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur * 0.8);
    const sh = c.createWaveShaper();
    sh.curve = this.driveCurve ??= (() => {
      const k = new Float32Array(256);
      for (let i = 0; i < 256; i++) k[i] = Math.tanh(((i / 128 - 1) * 2.6));
      return k;
    })();
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26 * v, t + 0.004);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.18);
    o.connect(sh).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.1);
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
    return g;
  }

  snare(t, v) {
    this.noiseHit(t, { type: 'bandpass', f: 1900, q: 0.8, vol: 0.32 * v, dur: 0.17 });
    const g = this.ctx.createGain();
    this.env(g, t, 0.14 * v, 0.1);
    this.osc('triangle', 190, t, 0.1, g);
    g.connect(this.out);
  }

  // the big 80s snare: a body and a long noise tail into the echo
  gatedSnare(t, v) {
    this.snare(t, v * 0.9);
    const g = this.noiseHit(t, { type: 'bandpass', f: 2600, q: 0.5, vol: 0.16 * v, dur: 0.32 });
    g.connect(this.delay);
  }

  clap(t, v) {
    for (const d of [0, 0.011, 0.023]) this.noiseHit(t + d, { type: 'bandpass', f: 1300, q: 1.2, vol: 0.26 * v, dur: d ? 0.03 : 0.16 });
  }

  hat(t, v) {
    this.noiseHit(t, { type: 'highpass', f: 7600, vol: 0.14 * v, dur: 0.04 });
  }

  cowbell(t, f, vol) {
    const c = this.ctx;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 1.2;
    bp.Q.value = 3;
    const g = c.createGain();
    this.env(g, t, vol, 0.2);
    this.osc('square', f, t, 0.2, bp);
    this.osc('square', f * 1.48, t, 0.2, bp);
    bp.connect(g).connect(this.out);
    g.connect(this.delay);
  }

  bass(t, f, v, len = 0.95) {
    const c = this.ctx;
    const dur = (this.beat / 4) * len;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 6;
    flt.frequency.setValueAtTime(180, t);
    flt.frequency.exponentialRampToValueAtTime(700 + this.intensity * 320, t + 0.02);
    flt.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.24 * v, dur);
    this.osc('sawtooth', f, t, dur, flt);
    this.osc('square', f / 2, t, dur, flt);
    flt.connect(g).connect(this.out);
  }

  // a clean low sine under the lo-fi keys
  sub(t, f, dur, v) {
    const g = this.ctx.createGain();
    this.env(g, t, 0.3 * v, dur, 0.01);
    this.osc('sine', f, t, dur, g);
    g.connect(this.out);
  }

  // drum & bass: two detuned saws, a slowly opening filter
  reese(t, f, dur, v) {
    const c = this.ctx;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 3;
    flt.frequency.setValueAtTime(240, t);
    flt.frequency.linearRampToValueAtTime(520 + this.intensity * 140, t + dur * 0.5);
    flt.frequency.linearRampToValueAtTime(240, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.03);
    g.gain.setValueAtTime(0.16 * v, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const det of [-14, 14]) this.osc('sawtooth', f, t, dur, flt).detune.value = det;
    this.osc('sine', f / 2, t, dur, g);
    flt.connect(g).connect(this.out);
  }

  lead(t, f, vol = 0.045, dur = 0.13) {
    const g = this.ctx.createGain();
    this.env(g, t, vol, dur);
    for (const det of [-6, 6]) this.osc('square', f, t, dur, g).detune.value = det;
    g.connect(this.out);
    g.connect(this.delay);
  }

  pluck(t, f, vol) {
    const c = this.ctx;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(4200, t);
    flt.frequency.exponentialRampToValueAtTime(500, t + 0.16);
    const g = c.createGain();
    this.env(g, t, vol, 0.2);
    this.osc('sawtooth', f, t, 0.2, flt).detune.value = -5;
    this.osc('sawtooth', f, t, 0.2, flt).detune.value = 5;
    flt.connect(g).connect(this.out);
    g.connect(this.delay);
  }

  // electric-piano-ish chord: sines with a soft bell partial and a slow tremolo
  keys(t, root, chord, dur, v = 1) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const trem = c.createGain();
    const lfo = c.createOscillator();
    lfo.frequency.value = 4.5;
    const depth = c.createGain();
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(trem.gain);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    for (const n of chord) {
      const f = root * 2 ** (n / 12);
      this.osc('sine', f, t, dur, g);
      const bell = c.createGain();
      this.env(bell, t, 0.25, 0.35);
      this.osc('sine', f * 4, t, 0.35, bell);
      bell.connect(g);
    }
    g.connect(trem).connect(this.out);
  }

  stab(t, root, vol, chord = [0, 3, 7]) {
    const c = this.ctx;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 2200;
    const g = c.createGain();
    this.env(g, t, vol, 0.22);
    for (const n of chord) this.osc('sawtooth', root * 4 * 2 ** (n / 12), t, 0.25, flt);
    flt.connect(g).connect(this.out);
    g.connect(this.delay);
  }

  pad(t, root, dur, chord = null, vol = 0.06) {
    const c = this.ctx;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 520;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const parts = chord ? chord.flatMap((n) => [[2 * 2 ** (n / 12), -7], [2 * 2 ** (n / 12), 7]]) : [[2, -7], [2, 7], [3, 0]];
    for (const [mul, det] of parts) this.osc('sawtooth', root * mul, t, dur, flt).detune.value = det;
    flt.connect(g).connect(this.out);
  }

  // vinyl crackle under the lo-fi track
  crackle(on) {
    if (on && !this.crackleG) {
      const c = this.ctx;
      const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.5 : (Math.random() * 2 - 1) * 0.015;
      const src = c.createBufferSource();
      src.buffer = b;
      src.loop = true;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      this.crackleG = c.createGain();
      this.crackleG.gain.value = 0.0001;
      this.crackleG.gain.setTargetAtTime(0.35, c.currentTime, 0.5);
      src.connect(hp).connect(this.crackleG).connect(this.out);
      src.start();
      this.crackleSrc = src;
    } else if (!on && this.crackleG) {
      const g = this.crackleG;
      const src = this.crackleSrc;
      g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
      setTimeout(() => src.stop(), 1500);
      this.crackleG = null;
    }
  }

  // rain on the window under the lo-fi (a filtered noise bed)
  rainBed(on) {
    if (on && !this.rainG) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 400;
      this.rainG = c.createGain();
      this.rainG.gain.value = 0.0001;
      this.rainG.gain.setTargetAtTime(0.05, c.currentTime, 1);
      src.connect(lp).connect(hp).connect(this.rainG).connect(this.out);
      src.start();
      this.rainSrc = src;
    } else if (!on && this.rainG) {
      const src = this.rainSrc;
      this.rainG.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4);
      setTimeout(() => src.stop(), 2000);
      this.rainG = null;
    }
  }

  // a tom: a sine falling in pitch
  tom(t, f, v) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(f * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = c.createGain();
    this.env(g, t, 0.55 * v, 0.35);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.4);
    this.noiseHit(t, { type: 'lowpass', f: 900, vol: 0.08 * v, dur: 0.05 });
  }

  // five detuned saws: the trance / hardstyle chord
  supersaw(t, f, dur, vol, chord = [0]) {
    const c = this.ctx;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 2600 + this.intensity * 500;
    const g = c.createGain();
    this.env(g, t, vol, dur, 0.008);
    for (const n of chord) for (const det of [-22, -11, 0, 11, 22]) this.osc('sawtooth', f * 2 ** (n / 12), t, dur, flt).detune.value = det;
    flt.connect(g).connect(this.out);
    g.connect(this.delay);
  }

  // the dubstep bass: a filter swept by an LFO at `rate` wobbles per beat
  wobble(t, f, dur, v, rate = 2) {
    const c = this.ctx;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 9;
    flt.frequency.value = 420;
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate / this.beat;
    const depth = c.createGain();
    depth.gain.value = 380 + this.intensity * 120;
    lfo.connect(depth).connect(flt.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    const sh = c.createWaveShaper();
    sh.curve = this.driveCurve ??= (() => {
      const k = new Float32Array(256);
      for (let i = 0; i < 256; i++) k[i] = Math.tanh((i / 128 - 1) * 2.6);
      return k;
    })();
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * v, t + 0.01);
    g.gain.setValueAtTime(0.2 * v, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    this.osc('sawtooth', f, t, dur, flt);
    this.osc('square', f * 1.005, t, dur, flt);
    this.osc('sine', f / 2, t, dur, g);
    flt.connect(sh).connect(g).connect(this.out);
  }

  // a square-wave game-console voice; vib: a little vibrato for melodies
  chip(t, f, dur, vol, vib = false) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.85);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const o = this.osc('square', f, t, dur, g);
    if (vib) {
      const lfo = c.createOscillator();
      lfo.frequency.value = 6;
      const d = c.createGain();
      d.gain.value = f * 0.012;
      lfo.connect(d).connect(o.frequency);
      lfo.start(t + 0.08);
      lfo.stop(t + dur);
    }
    g.connect(this.out);
  }

  chipNoise(t, vol, dur) {
    this.noiseHit(t, { type: 'highpass', f: 2500, vol, dur });
  }

  // industrial: a clang of metal
  metal(t, v) {
    this.noiseHit(t, { type: 'bandpass', f: 3400, q: 9, vol: 0.2 * v, dur: 0.18 });
    const g = this.ctx.createGain();
    this.env(g, t, 0.05 * v, 0.22);
    for (const f of [540, 813, 1179]) this.osc('square', f, t, 0.22, g);
    g.connect(this.out);
    g.connect(this.delay);
  }

  // a distorted, bending saw lead
  screech(t, f, dur, vol) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const sh = c.createWaveShaper();
    sh.curve = this.driveCurve ??= (() => {
      const k = new Float32Array(256);
      for (let i = 0; i < 256; i++) k[i] = Math.tanh((i / 128 - 1) * 2.6);
      return k;
    })();
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = f * 2;
    flt.Q.value = 1.5;
    const g = c.createGain();
    this.env(g, t, vol, dur, 0.005);
    o.connect(sh).connect(flt).connect(g).connect(this.out);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // a music-box / glass bell: a sine with an inharmonic partial
  bell(t, f, vol, dur = 0.8) {
    const g = this.ctx.createGain();
    this.env(g, t, vol, dur, 0.003);
    this.osc('sine', f, t, dur, g);
    const p = this.ctx.createGain();
    this.env(p, t, vol * 0.4, dur * 0.4, 0.002);
    this.osc('sine', f * 2.76, t, dur * 0.4, p);
    p.connect(this.out);
    g.connect(this.out);
    g.connect(this.delay);
  }

  // low brass: saws through a slowly opening filter
  brass(t, root, dur, vol) {
    const c = this.ctx;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(300, t);
    flt.frequency.linearRampToValueAtTime(1400, t + 0.25);
    flt.frequency.linearRampToValueAtTime(600, t + dur);
    const g = c.createGain();
    this.env(g, t, vol, dur, 0.06);
    for (const n of [0, 7, 12]) this.osc('sawtooth', root * 2 * 2 ** (n / 12), t, dur, flt).detune.value = n ? 4 : -4;
    flt.connect(g).connect(this.out);
  }

  // jazz ride and bossa rim click
  ride(t, v) {
    this.noiseHit(t, { type: 'highpass', f: 6000, vol: 0.06 * v, dur: 0.35 });
  }

  rim(t, v) {
    this.noiseHit(t, { type: 'bandpass', f: 1700, q: 6, vol: 0.18 * v, dur: 0.04 });
  }

  // a nylon-string strum: soft plucks rolled across the chord
  nylon(t, root, chord, vol) {
    chord.forEach((n, i) => {
      const c = this.ctx;
      const tt = t + i * 0.012;
      const flt = c.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(2400, tt);
      flt.frequency.exponentialRampToValueAtTime(700, tt + 0.4);
      const g = c.createGain();
      this.env(g, tt, vol, 0.7, 0.003);
      this.osc('triangle', root * 2 ** (n / 12), tt, 0.7, flt);
      flt.connect(g).connect(this.out);
    });
  }

  // a warm pad with a slow tape wobble in its pitch
  tapePad(t, root, dur, chord) {
    const c = this.ctx;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.35;
    const d = c.createGain();
    d.gain.value = 9; // cents
    lfo.connect(d);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    for (const n of chord)
      for (const det of [-5, 5]) {
        const o = this.osc('triangle', root * 2 * 2 ** (n / 12), t, dur, flt);
        o.detune.value = det;
        d.connect(o.detune);
      }
    flt.connect(g).connect(this.out);
    g.connect(this.delay);
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
