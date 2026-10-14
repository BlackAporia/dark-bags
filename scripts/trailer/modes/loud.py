#!/usr/bin/env python3
# Where a captured match is busiest: the game's own sound (shots, hits, kills, the announcer) per
# window. usage: python3 loud.py <capture.mp4> [window secs] [skip secs] [top n]
# prints the loudest non-overlapping windows as "start energy"; the ready room (skip) and the
# result screen (the last 8 s) are left out.
import subprocess, sys
import numpy as np

src = sys.argv[1]
win = float(sys.argv[2]) if len(sys.argv) > 2 else 1.875
skip = float(sys.argv[3]) if len(sys.argv) > 3 else 10
top = int(sys.argv[4]) if len(sys.argv) > 4 else 4
SR = 8000
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
a = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768
hop = SR // 10
e = np.array([np.sqrt(np.mean(a[i:i + hop] ** 2)) for i in range(0, len(a) - hop, hop)])
n = int(win * 10)
s = np.convolve(e, np.ones(n), 'valid')
lo, hi = int(skip * 10), len(s) - 80
picks = []
order = np.argsort(-s[lo:hi]) + lo
for i in order:
    if all(abs(i - p) >= n for p in picks):
        picks.append(i)
    if len(picks) >= top:
        break
for p in sorted(picks):
    print(f'{p / 10:.1f} {s[p]:.2f}')
