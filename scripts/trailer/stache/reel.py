# <outdir>/reel/frames.json (from shots.mjs) → <outdir>/reel.mp4: the case opening at 30 fps, silent
import json, os, subprocess, sys
d = sys.argv[1]
fr = json.load(open(f'{d}/reel/frames.json'))
with open(f'{d}/reel/list.txt', 'w') as f:
    for a, b in zip(fr, fr[1:]):
        f.write(f"file '{os.path.abspath(a['file'])}'\nduration {max(0.001, b['t'] - a['t']):.4f}\n")
    f.write(f"file '{os.path.abspath(fr[-1]['file'])}'\nduration 0.1\nfile '{os.path.abspath(fr[-1]['file'])}'\n")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'{d}/reel/list.txt', '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '16', f'{d}/reel.mp4'], check=True)
print(d, 'reel', round(fr[-1]['t'] - fr[0]['t'], 1), 's')
