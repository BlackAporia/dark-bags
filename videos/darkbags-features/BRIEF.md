---
workflow: general-video
flow: automation
storyboard: no
aspect: 16:9
length: 44s
language: en
---

# DARK BAGS: the features cut for X

A 44-second cut that walks a new player through the game: how a match starts, the match itself,
then Ranked, Guilds and Invite friends. It is fast and pushes FOMO: Season 1 ends Nov 1, and its
titles never come back. It uses its own score (`assets/score.wav`) at 128 BPM, with one bar
(1.875 s) per beat of the story.

| Bars | Time | What |
|---|---|---|
| 0 | 0–1.9 | Hook: "Season 1 ends Nov 1." |
| 1 | 1.9–3.8 | 01 · Pick a mode: the mode cards, clicked one after another (17 modes, free vs bots or for stakes) |
| 2 | 3.8–5.6 | 02 · Set your stake: the coin, then the amount, from $0.10 |
| 3 | 5.6–7.5 | 03 · Ready up: the ready room fills, the pot grows, the count lands one number a beat |
| 4 | 7.5–9.4 | 04 · Drop in: last one standing takes the pot |
| 5–7 | 9.4–15 | Loot. Fight. Get out alive. (four kills on the beats) |
| 8 | 15–16.9 | A ranked win: +52 RP, promoted to Master, the division prize |
| 9–10 | 16.9–20.6 | RANKED: 7 divisions, division prizes, the season leaderboard |
| 11–12 | 20.6–24.4 | The bonus spin lands on the Champion title: up to +15% XP, this season only |
| 13–15 | 24.4–30 | GUILDS: crew, tag, chat; up to 50 runners |
| 16–18 | 30–35.6 | INVITE: 20% of the house cut from every stake they play, 90 days, as shop $; welcome and bonus bags |
| 19–20 | 35.6–39.4 | FOMO: Nov 1, season over · Season 1 titles never come back · open beta live, get in early · You in? |
| 21–23 | 39.4–44 | End card: play free in your browser, dark-bags.com, @play_dark_bags, Telegram |

## Where the footage comes from

- **Game pages.** They are real screencasts of the game, captured on a local server seeded with
  demo data (`scripts/trailer/features/seed.mjs`). That data includes:
  - a Season 1 ranked table of 21 runners;
  - the guild Night Raiders [NRD] with its chat;
  - the invite stats of the player StacheLord.

  **Every name and number on those pages is made up for the video.** The rules quoted are the
  game's own: divisions, prizes, titles, the guild size and the invite terms.
- **The ranked win and bonus spin.** These are the game's own result card and reel, fed one
  ranked result through the client.
- **Capture method.** The pages are recorded in slow motion and played back at speed, so the
  scrolls run at 30 fps (`menu.mjs`, `frames.py`). They are then cut to the beat grid
  (`clips.py`).
- **Ready room and drop.** These come from a practice match, where bots fill the empty seats.
- **Gameplay.** The loot, the kills, the exit and the storm are the hype video's real practice
  matches (`videos/darkbags-hype`).

## Rebuild

```
node scripts/trailer/features/seed.mjs <dir>
RANKS_FILE=<dir>/ranks.json SOCIAL_FILE=<dir>/social.json REFERRAL_FILE=<dir>/referrals.json PORT=8780 node server/index.js
node scripts/trailer/features/menu.mjs <cap>                        # menu, spin, pages, match
for x in menu spin page-ranked page-guilds page-invite match; do python3 scripts/trailer/features/frames.py <cap>/$x; done
python3 scripts/trailer/features/clips.py <cap> videos/darkbags-features/assets/clips
python3 -m http.server 8123 & node scripts/trailer/make-score.mjs features
cd videos/darkbags-features && npx hyperframes@0.8.147 render -o renders/darkbags-features.mp4
```

The post text is in `THREAD.md`.
