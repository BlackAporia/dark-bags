---
workflow: general-video
flow: automation
storyboard: no
aspect: 16:9
length: 73s
language: en
---

# DARK BAGS: every mode, for X

A 73-second tour of the whole game, built to pull new players in.
- It shows real gameplay of every mode, one after another, each named with its own rule from the game.
- Then it says why the game is different.
- It runs at 128 BPM, with one bar (1.875 s) per beat of the story, and uses its own score (`assets/score.wav`).

| Bars | Time | What |
|---|---|---|
| 0 | 0–1.9 | Hook: "17 modes." / "One tab." |
| 1 | 1.9–3.8 | Eight cuts on the 8ths, one per mode: "Real gameplay. Every mode." |
| 2 | 3.8–5.6 | The logo: extraction shooter in your browser |
| 3–5 | 5.6–11.3 | 01 Raid: loot, fight, hold the exit 10 s, keep what you carry |
| 6–7 | 11.3–15 | 02 Battle Royale |
| 8 | 15–16.9 | 03 Duel |
| 9–10 | 16.9–20.6 | 04 Deathmatch |
| 11–12 | 20.6–24.4 | 05 Guns + Lasers |
| 13 | 24.4–26.3 | 06 Hardcore |
| 14 | 26.3–28.1 | Why it's different: start with a knife, every kill upgrades your gun |
| 15–17 | 28.1–33.8 | 07–11 Weapon modes, half a bar each: knives, pistols, shotguns, rifles, snipers |
| 18–20 | 33.8–39.4 | 12–14 Teams: 2 v 2, 4 v 4, 8 v 8 (one pot, the last team standing splits it) |
| 21–22 | 39.4–43.1 | 15 Zombies |
| 23–24 | 43.1–46.9 | 16 Gold Rush |
| 25 | 46.9–48.8 | 17 Ranked: the season ladder |
| 26–28 | 48.8–54.4 | Plus The Descent: co-op, 50 floors, a camp between them, a boss every 5th |
| 29–32 | 54.4–61.9 | Why it's different: no download (browser, phone, PC) · free vs bots, or stakes from $0.10 · nobody sees what's in your bag · one account on every device |
| 33–34 | 61.9–65.6 | Open beta live · get in early · you in? |
| 35–38 | 65.6–73.1 | End card: dark-bags.com, @play_dark_bags, Telegram |

## Where the footage comes from

- **Gameplay.** Every gameplay shot is a real practice match.
  - Our runner is played by the game's own bot brain (`shared/bot.js`) through the normal input path.
  - The capture is `scripts/trailer/hype/capture.mjs`.
  - `DXFLOOR=5` starts the Descent on the first boss floor, with our runner geared for it.
- **Ranked.** The Ranked page is the features video's capture (seeded demo table).
- **Copy rules.**
  - Mode rules on screen are the game's own descriptions.
  - No promises of profit: stakes are optional, and free play against bots is always there.
  - Say "open beta" (never "closed beta").

## Rebuild

```
PORT=8795 DATA_DIR=<tmp> node server/index.js
GAME=http://localhost:8795/ node scripts/trailer/hype/capture.mjs <mode> <dir> <secs> <runners> <stake> <round>
python3 scripts/trailer/hype/assemble.py <dir>
python3 scripts/trailer/modes/cut.py <captures dir> videos/darkbags-modes/assets/clips
python3 scripts/trailer/modes/build.py scripts/trailer/modes/index.tpl.html videos/darkbags-modes/index.html
python3 -m http.server 8123 & node scripts/trailer/make-score.mjs modes
cd videos/darkbags-modes && npx hyperframes@0.8.158 render -o renders/darkbags-modes.mp4
```

The post text is in `THREAD.md`.
