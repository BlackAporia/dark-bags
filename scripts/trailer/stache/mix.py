#!/usr/bin/env python3
# The STACHE partnership video's sound (videos/darkbags-stache/assets/score.wav): the hype cut's
# 128 BPM score, its break into the drop (bars 3-11) then its end card (bars 20-23), with hits on
# the cuts and the real game sound of The Stache's first blood under bar 9.
import subprocess
BAR = 60 / 128 * 4
HYPE = 'videos/darkbags-hype/assets'
OUT = 'videos/darkbags-stache/assets'
A = BAR * 9            # where the end-card half of the score comes in
END = A + 44 - BAR * 20  # the score runs out here
# (file, at seconds, volume)
SFX = [
    ('glitch-1', BAR * 0.5, 0.45),
    ('whoosh-cinematic', 0.0, 0.5),
    ('impact-bass-1', BAR * 1, 0.9),
    ('whoosh-short', BAR * 2 - 0.12, 0.6),
    ('whoosh-short', BAR * 3 - 0.12, 0.6),
    ('chime', BAR * 3.5, 0.55),
    ('whoosh-short', BAR * 4 - 0.12, 0.6),
    ('whoosh-short', BAR * 5 - 0.12, 0.6),
    ('click', BAR * 6 - 0.05, 0.6),
    ('sparkle', BAR * 6 + BAR * 2 / 3, 0.75),
    ('impact-bass-2', BAR * 6 + BAR * 2 / 3, 0.6),
    ('whoosh-short', BAR * 7 - 0.12, 0.6),
    ('whoosh-short', BAR * 8 - 0.12, 0.6),
    ('impact-bass-1', BAR * 10, 0.85),
]
inputs = ['-i', f'{HYPE}/score.wav', '-i', f'{HYPE}/score.wav', '-i', f'{OUT}/clips/firstblood.mp4']
for f, _, _ in SFX:
    inputs += ['-i', f'{HYPE}/sfx/{f}.mp3']
fl = [
    f'[0:a]atrim=start={BAR * 3}:end={BAR * 12},asetpts=PTS-STARTPTS,afade=t=out:st={BAR * 9 - 0.02}:d=0.02[s1]',
    f'[1:a]atrim=start={BAR * 20},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={END - A - 1.2}:d=1.2,adelay={int(A * 1000)}:all=1[s2]',
    # the clip starts 0.8 s in, the same as on screen (index.html)
    f'[2:a]atrim=start=0.8:end={0.8 + BAR},asetpts=PTS-STARTPTS,volume=0.9,afade=t=out:st={BAR - 0.15}:d=0.15,adelay={int(BAR * 9 * 1000)}:all=1[g]',
]
mix = ['[s1]', '[s2]', '[g]']
for k, (f, at, v) in enumerate(SFX):
    fl.append(f'[{k + 3}:a]aresample=48000,volume={v},adelay={int(at * 1000)}:all=1[x{k}]')
    mix.append(f'[x{k}]')
fl.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0:duration=longest,atrim=end={END},loudnorm=I=-14:TP=-1.2:LRA=9[out]")
subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(fl), '-map', '[out]', '-ar', '48000', '-ac', '2', f'{OUT}/score.wav'], check=True)
print('score', round(END, 3), 's')
