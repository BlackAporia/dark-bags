#!/usr/bin/env python3
"""
The sound of the story films (videos/story-op1/BRIEF.md): the voice lines in the subtitle slots
of FILMS (client/story.js), the narrator plain, Tower through a radio, over a score and effects
synthesized here. Writes one WAV per film; scripts/story/render-films.mjs puts it under the
picture.

    python3 scripts/story/make-audio.py --model en-us-libritts-high.onnx --out /tmp/story-audio

Needs numpy and piper-tts (pip install numpy piper-tts) and the Piper LibriTTS voice
(github.com/rhasspy/piper releases, voice-en-us-libritts-high; LibriTTS, CC BY 4.0): the same
voice as the announcer, speaker 432 for the narrator, 60 for Tower.
"""
import argparse
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
NARRATOR, TOWER = 432, 60

# [from, to, speaker, text]: the English strings of client/strings/en.js, in the FILMS slots.
# outro.1 names how many were saved on screen only; the voice says it without the number.
FILMS = {
    'op1-intro': (34, [
        (0.8, 4.6, 'n', "Day zero, oh six twelve. The OUTLINE satellites came online to map the whole world."),
        (4.8, 8.2, 'n', "Someone pressed the button too early."),
        (9.2, 13.0, 'n', "One flash. One line. Everything that lived was redrawn."),
        (13.2, 17.8, 'n', "Most people became Scribbles: empty outlines that want to rub out whoever is left."),
        (18.0, 22.6, 'n', "Colour left the world. Only the orange dust stayed, and the few who kept their minds started carrying it in bags."),
        (23.0, 28.4, 'tower', "This is Tower. If you can hear me, you're one of us. Get to the metro. The wipe is coming."),
        (28.8, 33.2, 'tower', "Don't look back. Run."),
    ]),
    'op1-outro': (24, [
        (0.8, 5.2, 'n', "The last train out of Central Station left with the people you saved."),
        (5.4, 9.6, 'tower', "Good work, runners. Today you did the impossible."),
        (9.8, 13.6, 'n', "But the wipe didn't stop at the city limits."),
        (13.8, 19.0, 'tower', "There's a harbour to the south. Ships, people, and something the Erasers want."),
        (19.4, 23.4, 'n', "Operation two. The Harbour. Coming soon."),
    ]),
}

rng = np.random.default_rng(7)


# ------------------------------------------------------------------ tools

def t_axis(secs):
    return np.arange(int(secs * SR)) / SR


def env(n, a=0.01, r=0.2):
    """an attack-release envelope over n samples"""
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def fft_band(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))


def put(mix, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(mix):
        return
    n = min(len(sig), len(mix) - i)
    mix[i:i + n] += sig[:n] * gain


def ramp(secs, points):
    """a piecewise-linear curve over the film: [(t, v), ...]"""
    t = t_axis(secs)
    ts, vs = zip(*points)
    return np.interp(t, ts, vs)


def tone(hz, secs, kind='sine', detune=0.0):
    t = t_axis(secs)
    ph = 2 * np.pi * hz * t
    s = np.sin(ph)
    if kind == 'saw':  # soft saw: a few harmonics
        s = sum(np.sin(ph * k) / k for k in range(1, 7))
    if detune:
        s = 0.5 * s + 0.5 * np.sin(2 * np.pi * hz * (1 + detune) * t)
    return s


def pad(freqs, secs, kind='sine'):
    return sum(tone(f, secs, kind, 0.003) for f in freqs) / len(freqs)


def noise(secs, color='white'):
    n = rng.standard_normal(int(secs * SR))
    if color == 'brown':
        n = np.cumsum(n)
        n -= np.convolve(n, np.ones(SR // 20) / (SR // 20), 'same')
        n /= np.max(np.abs(n)) + 1e-9
    return n


def kick(gain=1.0):
    t = t_axis(0.5)
    f = 45 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * gain


def pluck(hz, secs=1.6):
    t = t_axis(secs)
    return (np.sin(2 * np.pi * hz * t) + 0.3 * np.sin(4 * np.pi * hz * t)) * np.exp(-t * 3.2)


# ------------------------------------------------------------------ voice

def synth(model, speaker, text, slot, out_dir):
    """the line, as slow as fits its slot (never slower than natural, never much faster)"""
    def run(scale):
        path = os.path.join(out_dir, f'v{abs(hash((speaker, text, scale)))}.wav')
        subprocess.run([sys.executable, '-m', 'piper', '-m', model, '-s', str(speaker), '--length-scale', f'{scale:.3f}', '-f', path], input=text.encode(), check=True, capture_output=True)
        with wave.open(path) as w:
            x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
            sr = w.getframerate()
        # to the mix's rate
        n = int(len(x) * SR / sr)
        return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
    base = 1.06 if speaker == NARRATOR else 1.0
    v = run(base)
    room = slot - 0.15
    if len(v) / SR > room:
        v = run(max(0.72, base * room / (len(v) / SR) * 0.98))
    return v / (np.max(np.abs(v)) + 1e-9)


def radio(v):
    """Tower: a handheld radio, band-limited, a little crunch, static and the squelch clicks"""
    x = fft_band(v, 320, 3200)
    x = np.tanh(x * 2.2) / np.tanh(2.2)
    st = fft_band(noise(len(x) / SR + 0.3), 1200, 6000) * 0.05
    out = np.zeros(len(x) + int(0.3 * SR))
    out[int(0.12 * SR):int(0.12 * SR) + len(x)] += x
    out += st[:len(out)] * env(len(out), 0.02, 0.05)
    for at in (0.0, len(out) / SR - 0.06):
        put(out, noise(0.05) * env(int(0.05 * SR), 0.001, 0.04) * 0.5, at)
    return out


# ------------------------------------------------------------------ scores

def score_intro(secs):
    mix = np.zeros(int(secs * SR))
    # the city before: a low drone and a minor pad, scan beams singing from 5 s
    city = (tone(55, secs, 'saw') * 0.18 + pad([220, 261.6, 329.6], secs) * 0.16) * ramp(secs, [(0, 0), (1.5, 1), (8.4, 1), (8.6, 0), (secs, 0)])
    beam = tone(1320, secs) * 0.05 * ramp(secs, [(0, 0), (5.2, 0), (8.4, 1), (8.6, 0), (secs, 0)]) * (0.6 + 0.4 * np.sin(2 * np.pi * 6 * t_axis(secs)))
    riser = fft_band(noise(secs), 400, 9000) * ramp(secs, [(0, 0), (6.6, 0), (8.55, 0.35), (8.6, 0), (secs, 0)])
    mix += city + beam + riser
    # the flash: a boom, a burst and the ringing in the ears
    put(mix, kick(1.4), 8.6)
    put(mix, tone(38, 3) * np.exp(-t_axis(3) * 1.4) * 0.9, 8.6)
    put(mix, noise(1.2) * np.exp(-t_axis(1.2) * 5) * 0.5, 8.6)
    put(mix, tone(3100, 4) * np.exp(-t_axis(4) * 0.9) * 0.08, 8.7)
    # after: a hollow, detuned pad, and the scribbles' little scratches
    after = pad([110, 130.8, 164.8, 196], secs) * 0.17 * ramp(secs, [(0, 0), (10.5, 0), (13, 1), (25, 1), (27, 0.5), (secs, 0.4)])
    mix += after
    for i in range(26):
        at = 12 + i * 0.37 + rng.random() * 0.2
        put(mix, fft_band(noise(0.06), 2000, 8000) * env(int(0.06 * SR), 0.002, 0.05) * 0.12, at)
    # the orange: a few plucked notes (A minor pentatonic)
    for at, hz in [(17.6, 440), (18.4, 523.3), (19.2, 659.3), (20.4, 587.3), (21.2, 523.3), (22.0, 440), (22.8, 392)]:
        put(mix, pluck(hz) * 0.16, at)
    # a heartbeat as the runner gets up
    for at in np.arange(22.2, 26, 0.9):
        put(mix, kick(0.45), at)
        put(mix, kick(0.3), at + 0.22)
    # the wipe: a swelling rumble, the run on a pulse that speeds up, a hit on the cut
    mix += noise(secs, 'brown') * 0.55 * ramp(secs, [(0, 0), (25.5, 0), (33.4, 1), (33.6, 0), (secs, 0)])
    at, step = 28.5, 0.5
    while at < 33.4:
        put(mix, kick(0.8), at)
        at += step
        step = max(0.24, step * 0.93)
    put(mix, kick(1.3), 33.5)
    put(mix, noise(0.8) * np.exp(-t_axis(0.8) * 6) * 0.4, 33.5)
    return mix


def score_outro(secs):
    mix = np.zeros(int(secs * SR))
    # the tunnel: a rumble and the wheels over the rail joints, going away
    away = ramp(secs, [(0, 1), (12, 0.25), (14, 0), (secs, 0)])
    mix += fft_band(noise(secs, 'brown'), 30, 400) * 0.6 * away
    at = 0.2
    while at < 13:
        for d in (0, 0.12):
            put(mix, fft_band(noise(0.08), 200, 2500) * env(int(0.08 * SR), 0.002, 0.07) * 0.35 * float(np.interp(at, [0, 13], [1, 0.1])), at + d)
        at += 0.62 + at * 0.02
    # up into the daylight: a wider, warmer pad
    mix += pad([130.8, 196, 261.6, 329.6], secs) * 0.2 * ramp(secs, [(0, 0.3), (9, 0.35), (12, 0.8), (18.5, 1), (19.5, 0.3), (secs, 0)])
    # the harbour: a low horn far off, and a low note that does not resolve
    put(mix, tone(73.4, 3.5, 'saw') * env(int(3.5 * SR), 0.5, 1.5) * 0.22, 19.6)
    mix += tone(41.2, secs) * 0.25 * ramp(secs, [(0, 0), (19.2, 0), (21, 1), (23.8, 1), (secs, 0)])
    put(mix, kick(1.0), 23.2)
    return mix


# ------------------------------------------------------------------ mix

def make(film, model, out_dir, tmp):
    secs, lines = FILMS[film]
    music = score_intro(secs) if film == 'op1-intro' else score_outro(secs)
    voice = np.zeros_like(music)
    for a, b, who, text in lines:
        v = synth(model, NARRATOR if who == 'n' else TOWER, text, b - a, tmp)
        if who == 'tower':
            v = radio(v)
        put(voice, v * (0.8 if who == 'n' else 0.72), a)
    # the music steps back under the voice
    talk = np.convolve((np.abs(voice) > 0.02).astype(float), np.ones(int(0.25 * SR)) / int(0.25 * SR), 'same')
    music *= 1 - 0.45 * np.clip(talk * 3, 0, 1)
    mix = music / (np.max(np.abs(music)) + 1e-9) * 0.55 + voice
    mix = np.tanh(mix * 1.1) / np.tanh(1.1) * 0.9
    fade = int(0.4 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)
    stereo = np.stack([mix, mix], 1)
    # a little width on the music only
    stereo[:, 0] += np.roll(music, 300) * 0.04
    stereo[:, 1] += np.roll(music, -300) * 0.04
    pcm = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)
    path = os.path.join(out_dir, f'{film}.wav')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(path)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--model', required=True, help='Piper voice: en-us-libritts-high.onnx')
    p.add_argument('--out', required=True)
    p.add_argument('films', nargs='*', default=list(FILMS))
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for f in a.films:
            make(f, a.model, a.out, tmp)


if __name__ == '__main__':
    main()
