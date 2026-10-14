#!/usr/bin/env python3
# Writes videos/darkbags-modes/index.html from index.tpl.html and the shot list (shots.py).
# usage: python3 build.py index.tpl.html ../../../videos/darkbags-modes/index.html
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shots import BAR, BEAT, LEN, at, SHOTS, MODES, LABELS, CHAPTERS

videos = '\n'.join(
    f'''      <div class="vw" id="w-{s['id']}"><video id="v-{s['id']}" class="clip" src="assets/clips/{s['f']}.mp4" playsinline {'muted' if not s['vol'] else f'data-has-audio="true" data-volume="{s["vol"]}"'} data-start="{s['start']}" data-duration="{s['dur']}" data-track-index="2"></video></div>'''
    for s in SHOTS)
labels = '\n'.join(
    f'''      <div class="mlabel{' half' if half else ''}" id="ml-{lab}"><span class="mnum mono">{'Plus · co-op PvE' if MODES[lab][0] == '+' else f'Mode {MODES[lab][0]} / 17'}</span><span class="mname stencil{' pve' if MODES[lab][0] == '+' else ''}">{MODES[lab][1]}</span><span class="msub">{MODES[lab][2]}</span></div>'''
    for lab, _, _, half in LABELS)
chapters = '\n'.join(
    f'''      <div class="bar-top" id="ch-{k}" style="display: none; opacity: 0"><span class="pill {cls}">{name} <b>·</b> {sub}</span></div>'''
    for k, (name, sub, _, _, cls) in enumerate(CHAPTERS))

anim = []
A = anim.append
for s in SHOTS:
    A(f"tl.fromTo('#w-{s['id']}', {{ scale: {s['z0']}, transformOrigin: '{s['org']}' }}, {{ scale: {s['z1']}, duration: {s['dur']}, ease: 'none' }}, {s['start']});")
# a flash on every cut between modes (not inside the bar-1 montage or the kills)
cuts = sorted(set(round(s['start'], 4) for s in SHOTS if s['start'] >= at(3) and not s['id'].startswith('k')) | {at(1), at(2), at(3), at(14)})
for c in cuts:
    A(f"tl.fromTo('#flash', {{ opacity: 0.5 }}, {{ opacity: 0, duration: 0.16, immediateRender: false }}, {c});")
for lab, t0, t1, half in LABELS:
    A(f"show('#ml-{lab}', {t0}, {t1});")
    A(f"tl.fromTo('#ml-{lab} .mname', {{ x: -70, opacity: 0 }}, {{ x: 0, opacity: 1, duration: 0.22, ease: 'power4.out' }}, {t0});")
    A(f"tl.fromTo('#ml-{lab} .mnum', {{ y: -16, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.2, ease: 'power3.out' }}, {round(t0 + 0.04, 4)});")
    A(f"tl.fromTo('#ml-{lab} .msub', {{ y: 18, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }}, {round(t0 + 0.1, 4)});")
for k, (_, _, t0, t1, _) in enumerate(CHAPTERS):
    A(f"show('#ch-{k}', {t0}, {t1});")
    A(f"tl.fromTo('#ch-{k} .pill', {{ y: -40, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }}, {round(t0 + 0.05, 4)});")

TIMES = dict(BAR=BAR, BEAT=BEAT, LEN=LEN)
html = open(sys.argv[1]).read()
html = html.replace('<!--VIDEOS-->', videos).replace('<!--MODE_LABELS-->', labels).replace('<!--CHAPTERS-->', chapters)
html = html.replace('/*LEN*/', str(LEN))
html = html.replace('/*ANIM*/', '\n      '.join(anim)).replace('/*TIMES*/', 'const T = ' + json.dumps(TIMES) + ';')
open(sys.argv[2], 'w').write(html)
print('shots', len(SHOTS), 'labels', len(LABELS), 'len', LEN)
