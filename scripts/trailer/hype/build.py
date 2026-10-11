#!/usr/bin/env python3
# Writes videos/darkbags-hype/index.html from index.tpl.html: a 44 s, 128 BPM cut of real
# practice matches. usage: python3 build.py index.tpl.html ../../../videos/darkbags-hype/index.html
import json, sys

BEAT = 60 / 128
BAR = BEAT * 4
def at(bar, step=0):
    return round(bar * BAR + step * BEAT / 4, 4)

# (id, file, start, duration, zoom-from, zoom-to, origin, label-top, label-bottom)
SHOTS = []
def shot(i, f, start, dur, z0=1.0, z1=1.08, org='50% 50%', vol=0.55):
    SHOTS.append(dict(id=i, f=f, start=start, dur=round(dur - 0.003, 4), z0=z0, z1=z1, org=org, vol=vol))

# hook: the result card of a real $1 raid, pushed in onto the card
shot('hook', 'hook', at(1), BAR, 1.0, 1.55, '49% 78%', 0.6)
for k in range(4):
    shot(f'k{k+1}', f'k{k+1}', at(2, k * 4), BEAT, 1.25, 1.38, '50% 48%', 0.6)
MODES = [
    ('m_raid', 'RAID', 'Grab the bag. Get out alive.'),
    ('m_br', 'BATTLE ROYALE', 'Last one standing takes the pot'),
    ('m_gl', 'GUNS + LASERS', 'Every kill upgrades your gun'),
    ('m_zombies', 'ZOMBIES', 'Hold the graveyard. 20 waves.'),
    ('m_gold', 'GOLD RUSH', 'Most gold wins'),
    ('m_team', 'TEAM 4 v 4', 'One team. One pot.'),
    ('m_dx', 'THE DESCENT', '50 floors down'),
]
for n, (f, name, sub) in enumerate(MODES):
    shot(f, f, at(4 + n), BAR, 1.12, 1.0 if n % 2 else 1.22, '50% 48%')
shot('m_snipers', 'm_snipers', at(11), BAR / 2, 1.1, 1.25)
shot('m_duel', 'm_duel', at(11, 8), BAR / 2, 1.25, 1.1)
for k in range(8):
    shot(f'f{k+1}', f'f{k+1}', at(12, k * 2), BEAT / 2, 1.3, 1.4, '50% 48%', 0.45)
shot('loot', 'loot', at(14), BAR, 1.15, 1.35, '50% 45%')
shot('exit', 'exit', at(15), BAR, 1.1, 1.3, '50% 45%')
RESULTS = [('r_br', '$5', '$15.20', 'BATTLE ROYALE · VICTORY'), ('r_gl', '$5', '$13.30', 'GUNS + LASERS · VICTORY'), ('hook', '$1', '$2.56', 'RAID · EXTRACTED'), ('r_duel', '$10', '$19', 'DUEL · VICTORY')]
for k, (f, a, b, lbl) in enumerate(RESULTS):
    org = {'hook': '49% 78%', 'r_duel': '80% 80%'}.get(f, '30% 82%')
    shot(f'res{k}', f, at(16 + k // 2, (k % 2) * 8), BAR / 2, 1.35, 1.6, org, 0.5)
shot('fomo', 'fomo', at(18), BAR * 2, 1.0, 1.2, '50% 50%', 0.35)

MODE_TXT = [(f, name, sub, at(4 + n)) for n, (f, name, sub) in enumerate(MODES)] + [('m_snipers', 'SNIPERS', 'Lasers everywhere', at(11)), ('m_duel', 'DUEL', '1 v 1 · winner takes both', at(11, 8))]

videos = '\n'.join(
    f'''      <div class="vw" id="w-{s['id']}"><video id="v-{s['id']}" class="clip" src="assets/clips/{s['f']}.mp4" playsinline data-has-audio="true" data-volume="{s['vol']}" data-start="{s['start']}" data-duration="{s['dur']}" data-track-index="2"></video></div>'''
    for s in SHOTS)
mode_labels = '\n'.join(
    f'''      <div class="mlabel" id="ml-{i}"><span class="mnum mono">MODE {str(i + 1).zfill(2)} / 17</span><span class="mname stencil">{name}</span><span class="msub">{sub}</span></div>'''
    for i, (_, name, sub, _) in enumerate(MODE_TXT))
results = '\n'.join(
    f'''      <div class="rbox" id="rb-{k}"><span class="rlbl mono">{lbl}</span><span class="rnum"><s>{a}</s><b>→</b><em>{b}</em></span></div>'''
    for k, (_, a, b, lbl) in enumerate(RESULTS))

anim = []
A = anim.append
for s in SHOTS:
    A(f"tl.fromTo('#w-{s['id']}', {{ scale: {s['z0']}, transformOrigin: '{s['org']}' }}, {{ scale: {s['z1']}, duration: {s['dur']}, ease: 'none' }}, {s['start']});")
# flashes on the hard cuts
cuts = sorted(set([at(1), at(2), at(3), at(4)] + [at(b) for b in range(4, 22)] + [at(11, 8)] + [at(16, 8), at(17, 8)]))
for c in cuts:
    A(f"tl.fromTo('#flash', {{ opacity: 0.55 }}, {{ opacity: 0, duration: 0.16, immediateRender: false }}, {c});")
for i, (_, _, _, t0) in enumerate(MODE_TXT):
    d = BAR / 2 if i >= 7 else BAR
    A(f"show('#ml-{i}', {t0}, {round(t0 + d, 4)});")
    A(f"tl.fromTo('#ml-{i} .mname', {{ x: -70, opacity: 0 }}, {{ x: 0, opacity: 1, duration: 0.22, ease: 'power4.out' }}, {t0});")
    A(f"tl.fromTo('#ml-{i} .mnum', {{ y: -16, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.2, ease: 'power3.out' }}, {round(t0 + 0.04, 4)});")
    A(f"tl.fromTo('#ml-{i} .msub', {{ y: 18, opacity: 0 }}, {{ y: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }}, {round(t0 + 0.1, 4)});")
for k in range(4):
    t0 = at(16 + k // 2, (k % 2) * 8)
    A(f"show('#rb-{k}', {t0}, {round(t0 + BAR / 2, 4)});")
    A(f"tl.fromTo('#rb-{k} em', {{ scale: 1.8, opacity: 0 }}, {{ scale: 1, opacity: 1, duration: 0.18, ease: 'back.out(2)' }}, {round(t0 + 0.08, 4)});")
    A(f"tl.fromTo('#rb-{k} s', {{ opacity: 0, x: 30 }}, {{ opacity: 1, x: 0, duration: 0.15 }}, {t0});")

TIMES = dict(BAR=BAR, BEAT=BEAT, a1=at(1), a2=at(2), a3=at(3), a4=at(4), a12=at(12), a13=at(13), a14=at(14), a15=at(15), a16=at(16), a18=at(18), a19=at(19), a20=at(20), a21=at(21))

html = open(sys.argv[1]).read()
html = html.replace('<!--VIDEOS-->', videos).replace('<!--MODE_LABELS-->', mode_labels).replace('<!--RESULTS-->', results)
html = html.replace('/*ANIM*/', '\n      '.join(anim)).replace('/*TIMES*/', 'const T = ' + json.dumps(TIMES) + ';')
open(sys.argv[2], 'w').write(html)
print('shots', len(SHOTS), 'end', at(20), 'bar', BAR)
