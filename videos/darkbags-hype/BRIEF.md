---
workflow: general-video
flow: automation
storyboard: no
aspect: 16:9
length: 44s
language: en
---

# DARK BAGS: hype cut for X

Fast and loud, built for FOMO. It shows the game in detail across many modes, the stakes, and
the payouts after the match. 128 BPM; one bar (1.875 s) per beat of the story.

| Bars | Time | What |
|---|---|---|
| 0 | 0–1.9 | Hook: "$1 IN." / "$2.56 OUT." |
| 1–2 | 1.9–5.6 | That raid's real result card, then its four kills (first blood → triple kill) |
| 3 | 5.6–7.5 | The logo: 17 modes. One bag. |
| 4–11 | 7.5–22.5 | One mode a bar: raid, battle royale, guns + lasers, zombies, gold rush, team 4v4, the Descent, snipers + duel |
| 12 | 22.5–24.4 | 17 modes: eight cuts on the 8ths |
| 13–15 | 24.4–30 | Stake from $0.10 in the coin you hold · kill them, take their bag · hold the exit |
| 16–17 | 30–33.8 | Stake → take: $5 → $15.20, $5 → $13.30, $1 → $2.56, $10 → $19 |
| 18–19 | 33.8–37.5 | FOMO over the closing storm: closed beta, limited seats, "You in?" |
| 20–23 | 37.5–44 | End card: play free in your browser, dark-bags.com, @play_dark_bags, Telegram |

## Where the footage comes from

Every gameplay shot is a real practice match. The player's runner is driven by the game's own
bot brain (`shared/bot.js`), and zombies are targeted directly. The video is a timestamped
screencast; the sound is the game's AudioContext, on the same clock. Every number on screen is
that match's result.

Rebuild:

```
PORT=8790 DATA=<tmp> node server/index.js
node scripts/trailer/hype/capture.mjs raid raid 260 10 1000 150     # and br, gl, zombies, gold, team4, dx-easy, snipers, duel
python3 scripts/trailer/hype/assemble.py raid
node scripts/trailer/hype/lobby.mjs lobby                           # the stake box still
```

Clips are cut into `assets/clips/` with ffmpeg; the cut points are listed in `build.py`.

Then:

```
python3 scripts/trailer/hype/build.py scripts/trailer/hype/index.tpl.html videos/darkbags-hype/index.html
node scripts/trailer/make-score.mjs hype
cd videos/darkbags-hype && npx hyperframes@0.8.147 render -o renders/darkbags-hype.mp4
```
