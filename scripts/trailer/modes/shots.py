# The modes video's shot list (videos/darkbags-modes), shared by cut.py and build.py.
# 128 BPM: a bar is 1.875 s, 16 steps a bar.
BEAT = 60 / 128
BAR = BEAT * 4
BARS = 39
LEN = round(BARS * BAR + 0.025, 3)


def at(bar, step=0):
    return round(bar * BAR + step * BEAT / 4, 4)


# Where each clip comes from: (source, start s, length s). Sources:
#   hype:<clip>   a clip of the hype video (videos/darkbags-hype/assets/clips), as cut there
#   feat:<clip>   a clip of the features video (videos/darkbags-features/assets/clips)
#   cap:<dir>     a capture (capture.mp4 of scripts/trailer/hype/capture.mjs) in the captures dir
# The starts in the captures were picked with loud.py (the busiest stretches by the game's own
# sound) and checked on contact sheets.
CLIPS = {
    # bar 1: eight modes on the 8ths
    **{f'f{k}': (f'hype:f{k}', 0, 0.5) for k in range(1, 9)},
    # classic
    'raid_a': ('hype:m_raid', 0, 2.4),
    'raid_b': ('hype:loot', 0, 2.4),
    'raid_c': ('hype:exit', 0, 2.4),
    'br_a': ('cap:br', 11.9, 2.3),
    'br_b': ('cap:br', 20.2, 2.3),
    'duel': ('cap:duel2', 14.4, 2.3),
    'dm_a': ('cap:dm', 13.1, 2.3),
    'dm_b': ('cap:dm', 90.4, 2.3),
    'gl_a': ('cap:gl', 24.4, 2.3),
    'gl_b': ('cap:gl', 27.6, 2.3),
    'hc': ('cap:hardcore', 105.2, 2.3),
    # the gun ladder: four kills of a raid
    **{f'k{k}': (f'hype:k{k}', 0, 0.8) for k in range(1, 5)},
    # weapon modes
    'knives': ('cap:knives', 13.8, 1.3),
    'pistols': ('cap:pistols', 18.2, 1.3),
    'shotguns': ('cap:shotguns', 16.6, 1.3),
    'rifles': ('cap:rifles', 0, 1.3),
    'snipers': ('cap:snipers', 11.8, 2.3),
    # teams
    'team2': ('cap:team2', 0, 2.3),
    'team4': ('hype:m_team', 0, 2.4),
    'team8': ('cap:team8', 0, 2.3),
    # events
    'zom_a': ('cap:zombies2', 55.5, 2.3),
    'zom_b': ('cap:zombies2', 62.4, 2.3),
    'gold_a': ('cap:gold', 12.4, 2.3),
    'gold_b': ('cap:gold', 53.4, 2.3),
    'ranked': ('feat:pg_ranked', 0, 2.3),
    # the Descent: the floor's story card, the swarm, the boss
    'dx_a': ('cap:dx', 10.3, 2.3),
    'dx_b': ('cap:dx', 32.8, 2.3),
    'dx_c': ('cap:dxboss', 0, 2.3),
    # under the why lines
    'why0': ('cap:br', 100.0, 2.3),
    'why2': ('cap:raidA', 36.0, 2.3),
    'why3': ('cap:team4', 30.0, 2.3),
    'fomo': ('hype:fomo', 0, 4.4),
}

# (shot id, clip, start, length, zoom from, zoom to, origin, volume)
SHOTS = []


def shot(i, clip, start, dur, z0=1.12, z1=1.0, org='50% 48%', vol=0.5):
    SHOTS.append(dict(id=i, f=clip, start=start, dur=round(dur - 0.003, 4), z0=z0, z1=z1, org=org, vol=vol))


for k in range(8):
    shot(f'f{k + 1}', f'f{k + 1}', at(1, k * 2), BEAT / 2, 1.3, 1.4, vol=0.4)

# (bar, length in bars, clip, label index or None)
# Mode labels: (number, name, the game's own rule, style)
MODES = [
    ('01', 'Raid', 'Loot, fight, hold the exit 10 s. Keep what you carry.'),
    ('02', 'Battle Royale', 'Up to 20 runners. Last one standing takes the pot.'),
    ('03', 'Duel', 'One on one. Winner takes both stakes.'),
    ('04', 'Deathmatch', 'Respawn after every death. Most kills takes the pot.'),
    ('05', 'Guns + Lasers', 'Kills pay credits: medkits, sentry turrets, laser mines.'),
    ('06', 'Hardcore', "Minimal health: one bullet and you're down."),
    ('07', 'Knives only', 'Blades only.'),
    ('08', 'Pistols only', 'Sidearms only.'),
    ('09', 'Shotguns only', 'Close and loud.'),
    ('10', 'Rifles only', 'Mid-range firefights.'),
    ('11', 'Snipers only', 'Laser sights everywhere.'),
    ('12', 'Team 2 v 2', 'Every stake grows one pot. The last team standing splits it.'),
    ('13', 'Team 4 v 4', 'Teammates green, enemies red. One pot.'),
    ('14', 'Team 8 v 8', 'Sixteen runners. One pot.'),
    ('15', 'Zombies', 'Co-op: 20 waves, bosses on 10 and 20.'),
    ('16', 'Gold Rush', 'Bags of gold everywhere. Most bags takes the pot.'),
    ('17', 'Ranked', 'Climb from Bronze to Neon Legend. Season titles.'),
    ('+', 'The Descent', 'Co-op PvE: 50 floors down, 1 to 4 runners.'),
]

# (label index, from, to, half-size)
LABELS = []
SEQ = [
    # bar, steps long (16 = a bar), clip, label
    (3, 0, 16, 'raid_a', 0), (4, 0, 16, 'raid_b', None), (5, 0, 16, 'raid_c', None),
    (6, 0, 16, 'br_a', 1), (7, 0, 16, 'br_b', None),
    (8, 0, 16, 'duel', 2),
    (9, 0, 16, 'dm_a', 3), (10, 0, 16, 'dm_b', None),
    (11, 0, 16, 'gl_a', 4), (12, 0, 16, 'gl_b', None),
    (13, 0, 16, 'hc', 5),
    (15, 0, 8, 'knives', 6), (15, 8, 8, 'pistols', 7), (16, 0, 8, 'shotguns', 8), (16, 8, 8, 'rifles', 9), (17, 0, 16, 'snipers', 10),
    (18, 0, 16, 'team2', 11), (19, 0, 16, 'team4', 12), (20, 0, 16, 'team8', 13),
    (21, 0, 16, 'zom_a', 14), (22, 0, 16, 'zom_b', None),
    (23, 0, 16, 'gold_a', 15), (24, 0, 16, 'gold_b', None),
    (25, 0, 16, 'ranked', 16),
    (26, 0, 16, 'dx_a', 17), (27, 0, 16, 'dx_b', None), (28, 0, 16, 'dx_c', None),
]
label_from = {}
for n, (bar, step, steps, clip, lab) in enumerate(SEQ):
    t0 = at(bar, step)
    d = steps * BEAT / 4
    zin = n % 2 == 0
    shot(clip, clip, t0, d, 1.12 if zin else 1.0, 1.0 if zin else 1.12, vol=0.5)
    if lab is not None:
        label_from[lab] = (t0, steps < 16)
# a label stays up until the next label (or the end of the Descent)
starts = sorted(label_from.items(), key=lambda kv: kv[1][0])
for k, (lab, (t0, half)) in enumerate(starts):
    t1 = starts[k + 1][1][0] if k + 1 < len(starts) else at(29)
    if lab == 5:
        t1 = at(14)  # hardcore, then the gun ladder
    LABELS.append((lab, t0, t1, half))

# bar 14: four kills on the beats
for k in range(4):
    shot(f'k{k + 1}', f'k{k + 1}', at(14, k * 4), BEAT, 1.25, 1.38, vol=0.55)
# why it's different, over footage (bar 30 is the stake still), then FOMO
shot('why0', 'why0', at(29), BAR, 1.0, 1.1, vol=0.25)
shot('why2', 'why2', at(31), BAR, 1.1, 1.0, vol=0.25)
shot('why3', 'why3', at(32), BAR, 1.0, 1.1, vol=0.25)
shot('fomo', 'fomo', at(33), BAR * 2, 1.0, 1.2, '50% 50%', 0.3)

# the chapter tags, top centre
CHAPTERS = [
    ('Classic', '6 modes', at(3), at(14), ''),
    ('Weapon modes', 'one gun each', at(15), at(18), ''),
    ('Teams', 'one pot per team', at(18), at(21), ''),
    ('Events', 'co-op · gold · ranked', at(21), at(26), ''),
    ('Co-op PvE', '50 floors · 10 bosses', at(26), at(29), 'pve'),
]
