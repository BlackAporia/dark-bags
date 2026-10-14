#!/usr/bin/env python3
# Cuts the modes video's clips (shots.py: CLIPS) into videos/darkbags-modes/assets/clips.
# usage: python3 cut.py <captures dir> <clips dir> [only,these]
# <captures dir>/<name>/capture.mp4 for every cap:<name> source.
import os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shots import CLIPS

caps, out = sys.argv[1], sys.argv[2]
only = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else None
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
os.makedirs(out, exist_ok=True)
for name, (src, start, dur) in CLIPS.items():
    if only and name not in only:
        continue
    kind, ref = src.split(':', 1)
    path = {
        'hype': f'{root}/videos/darkbags-hype/assets/clips/{ref}.mp4',
        'feat': f'{root}/videos/darkbags-features/assets/clips/{ref}.mp4',
        'cap': f'{caps}/{ref}/capture.mp4',
    }[kind]
    dst = f'{out}/{name}.mp4'
    if kind == 'hype' and start == 0:
        subprocess.run(['cp', path, dst], check=True)
    else:
        # 1080p30, the game's sound kept; keyframes every half second for clean seeks
        # (a page capture of the features video has no sound: it stays silent)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', path, '-t', str(dur),
                        '-vf', 'fps=30,scale=1920:1080,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                        '-g', '15', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', dst], check=True)
    print(name, src, start, dur)
