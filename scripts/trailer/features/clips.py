# The features video's UI shots: cut from the screencasts (menu.mjs; the frames.py mp4s) and
# timed to the beat grid (one bar = 1.875 s at 128 BPM), silent: the score carries the sound.
# usage: python3 scripts/trailer/features/clips.py <capture dir> videos/darkbags-features/assets/clips
import subprocess, sys
src, out = sys.argv[1].rstrip('/'), sys.argv[2].rstrip('/')
BAR = 1.875
# name: (capture, from s, to s, length in bars)
CUTS = {
    'ui_modes': ('menu', 1.85, 5.95, 1),     # the mode cards, clicked one after another
    'ui_stake': ('menu', 6.2, 9.1, 1),       # the stake: coin, then amount
    'ui_room': ('match', 5.53, 9.53, 1),     # the ready room: seats fill, the pot; a count a beat
    'ui_drop': ('match', 9.5, 11.375, 1),    # the drop
    'ui_result': ('spin', 0.0, 1.25, 1),     # a ranked win: +52 RP, promoted to Master
    'ui_spin': ('spin', 1.9, 9.08, 2),       # the bonus spin: starts on beat 2, lands on bar 2 beat 3
    'pg_ranked': ('page-ranked', 0.0, 5.3, 2),
    'pg_guilds': ('page-guilds', 0.0, 4.5, 3),
    'pg_invite': ('page-invite', 0.0, 4.0, 3),
}
for name, (cap, a, b, bars) in CUTS.items():
    dur = bars * BAR
    speed = (b - a) / dur
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{a}', '-to', f'{b}', '-i', f'{src}/{cap}.mp4',
      '-vf', f'setpts=(PTS-STARTPTS)/{speed:.5f},fps=30,tpad=stop_mode=clone:stop_duration=1,format=yuv420p', '-t', f'{dur + 0.1:.3f}',
      '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-movflags', '+faststart', f'{out}/{name}.mp4'], check=True)
    print(f'{name}: {cap} {a}-{b}s × {speed:.2f} → {dur:.3f}s')
