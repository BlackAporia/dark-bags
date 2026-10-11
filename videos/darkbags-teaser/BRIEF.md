---
workflow: general-video
flow: companion
storyboard: yes
aspect: 16:9
length: 30s
language: en
---

# DARK BAGS teaser

A player at his PC at night clicks PLAY and is pulled into the game. Cinematic, fast, with a
real score and sound.

## Story (30 s, 120 BPM from 11 s)

| Time | Scene | Sound |
|---|---|---|
| 0–6 | Night room, rain on the window, the player from behind, the game on his monitor; "one more raid." | rain, thunder, keys, the game leaking from the headset, a low D minor drone |
| 6–9 | The monitor up close; the cursor goes to PLAY · $1 STAKE and clicks; the screen tears, his pixels fly in | heartbeat pulse, the click, then a ringing silence and a riser |
| 9–11 | Flash, the letterbox opens, a fall through a tunnel of light and loot | whoosh, data scream, the fall, a breath of silence |
| 11–24 | "You're in." then the raid: Double kill → STAKE. → rifle → LOOT. → pistol → four exotic skins → the storm → GET OUT. → Extracted $5.76 | braam, a 120 BPM combat beat, the game's own guns and announcer |
| 24–30 | End card: DARK BAGS, Stake. Loot. Get out., 17 modes · Free in your browser · Real stakes on Starknet, dark-bags.com | the final braam, bells, the rain again |

## Assets

- `assets/clips/*.mp4`: cut from `site/media/demo.mp4` and `hero.mp4` (real gameplay), cropped and graded.
- `assets/stills/*.png`: runners and cases drawn by the game's renderer (`scripts/trailer/make-stills.mjs`).
- `assets/score.wav`: the whole soundtrack, rendered offline (`scripts/trailer/make-score.mjs`): a synthesized score, the game's own `client/sfx.js` and announcer, and Pixabay SFX (`assets/sfx/CREDITS.md`).
- Fonts: the brand's (Big Shoulders Stencil Display, Chakra Petch, IBM Plex Mono).

## Rebuild

```
python3 -m http.server 8123          # from the repo root
node scripts/trailer/make-stills.mjs # runners and cases
node scripts/trailer/make-score.mjs  # the soundtrack
cd videos/darkbags-teaser && npx hyperframes@0.8.147 render -o renders/darkbags-teaser.mp4
```
