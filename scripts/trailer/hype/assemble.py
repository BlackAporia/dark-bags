# frames.json + audio.webm → capture.mp4 (30 fps, audio on the same clock)
import json, subprocess, sys, os
d = sys.argv[1]
j = json.load(open(f'{d}/frames.json'))
fr = j['frames']
t0 = fr[0]['t']
with open(f'{d}/list.txt', 'w') as f:
    for a, b in zip(fr, fr[1:]):
        f.write(f"file '{os.path.abspath(a['file'])}'\nduration {max(0.001, b['t'] - a['t']):.4f}\n")
    f.write(f"file '{os.path.abspath(fr[-1]['file'])}'\nduration 0.1\nfile '{os.path.abspath(fr[-1]['file'])}'\n")
off = j['audioStart'] - t0  # audio starts this many seconds after the first frame
af = f"adelay={int(off*1000)}|{int(off*1000)}" if off >= 0 else f"atrim=start={-off}"
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'{d}/list.txt', '-i', f'{d}/audio.webm',
  '-filter_complex', f'[0:v]fps=30,format=yuv420p[v];[1:a]{af},aresample=48000[a]', '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-c:a', 'aac', '-b:a', '192k', '-shortest', f'{d}/capture.mp4'], check=True)
print(d, 'ok', f"{fr[-1]['t']-t0:.1f}s", 'audio offset', round(off, 3), 'result at', round(j['resultAt'] - t0, 1) if j['resultAt'] else None)
