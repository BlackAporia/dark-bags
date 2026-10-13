# frames.json (timestamped screencast frames, no sound) → <dir>.mp4 at 30 fps
import json, subprocess, sys, os
d = sys.argv[1].rstrip('/')
j = json.load(open(f'{d}/frames.json'))
fr = j['frames']
k = j.get('slow', 1)  # recorded in slow motion: played back k times faster
base = fr[0]['t']
for x in fr:
    x['t'] = base + (x['t'] - base) / k
with open(f'{d}/list.txt', 'w') as f:
    for a, b in zip(fr, fr[1:]):
        f.write(f"file '{os.path.abspath(a['file'])}'\nduration {max(0.001, b['t'] - a['t']):.4f}\n")
    f.write(f"file '{os.path.abspath(fr[-1]['file'])}'\nduration 0.5\nfile '{os.path.abspath(fr[-1]['file'])}'\n")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'{d}/list.txt',
  '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-an', f'{d}.mp4'], check=True)
t0 = fr[0]['t']
print(d, f"{fr[-1]['t'] - t0:.1f}s", ' '.join(f"{m['label']}@{(m['t'] - t0) / k:.2f}" for m in j.get('marks', [])))
