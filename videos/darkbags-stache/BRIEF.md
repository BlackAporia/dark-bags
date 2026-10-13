---
workflow: general-video
flow: automation
storyboard: no
aspect: 16:9
length: 23.4s
language: en
---

# DARK BAGS × STACHE: the partnership announcement

A short cut for X: the two logos, then everything STACHE brings into the game, each on a real
screen of the game. It runs on the hype cut's 128 BPM score (one bar = 1.875 s): its break into
the drop (score bars 3–11), then its end card (bars 20–23).

| Bar | Time | What |
|---|---|---|
| 0–1 | 0–3.75 | The two logos meet: "Official partnership", then the drop: DARK BAGS × STACHE |
| 2 | 3.75–5.6 | 01 · Stake STACHE: the stake box with STACHE picked, every mode, from $0.10 |
| 3 | 5.6–7.5 | 02 · First 100 stakers: the gift letter in the mail, claimed on the off-beat |
| 4 | 7.5–9.4 | 03 · Moustache Holder: the title worn, +5% XP forever |
| 5 | 9.4–11.25 | 04 · Stache Case, $0.99, paid in STACHE at the live price; its 53 items and odds |
| 6 | 11.25–13.1 | Open it: the case reel stops, the drop |
| 7 | 13.1–15 | 05 · The moustached runners, common to exotic |
| 8 | 15–16.9 | 06 · The arsenal: 6 finishes on 6 guns, 8 style items, only in the Stache Case |
| 9 | 16.9–18.75 | 07 · The Stache in a real match: first blood, the golden whisker burst |
| 10–12 | 18.75–23.4 | End card: both logos, open beta, dark-bags.com, @play_dark_bags, Telegram |

## Where every frame comes from

- The logos are the two the partnership was announced with (`assets/logos`).
- The screens are screenshots of a local game server on play money (`scripts/trailer/stache/shots.mjs`):
  the gift letter goes out through the admin mail API, the same letter the first 100 STACHE
  stakers get. The STACHE price on them is the test feed's, so the video only quotes the $0.99.
- The case opening is that page's screencast (`reel.py`).
- The runners and weapons are drawn by the game's renderer (`scripts/trailer/stache-stills.html`).
- The gameplay is a practice battle royale played by the game's bot brain, dressed in the case
  (`STACHE=1` on the hype capture script).
- The sound is the hype score cut and mixed with hits and that match's own audio (`mix.py`).

Rebuild:

```
PORT=8790 DATA=<tmp> ADMIN_KEY=<a throwaway key> node server/index.js
ADMIN_KEY=<the same key> node scripts/trailer/stache/shots.mjs <shots>   # screens + reel frames
python3 scripts/trailer/stache/reel.py <shots>                           # <shots>/reel.mp4
STACHE=1 node scripts/trailer/hype/capture.mjs br <br> 80 8 1000 120
python3 scripts/trailer/hype/assemble.py <br>                            # <br>/capture.mp4
python3 -m http.server 8123 & node scripts/trailer/make-stills.mjs stache
# assets/shots/*.jpg from the screens; assets/clips/reel.mp4 = reel.mp4 from 3.4 s (4.6 s),
# assets/clips/firstblood.mp4 = capture.mp4 from 11.3 s (3.6 s), then:
python3 scripts/trailer/stache/mix.py
npx hyperframes@0.8.147 render -o renders/darkbags-stache.mp4
```
