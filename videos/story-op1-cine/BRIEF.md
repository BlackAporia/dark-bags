---
workflow: general-video
flow: automation
storyboard: no
message: "Day zero: the flash redraws the world, the wipe follows, and the runners get the last train out"
destination: in-game
aspect: 1920x1080
language: none on screen (the game adds subtitles in 11 languages)
length: 34s intro + 3 × 6s stage cards + 24s outro
---

## Intent

Remake every story film of Operation 1, The Tunnels: the opening, the three cards between
stages (The Platform, The Breaker, The Dispatcher) and the ending. The player called the old
ones unreadable and carelessly drawn; they want them cinematic and high quality. Every beat
must read at a glance: real shots (wide, medium, close), camera moves, depth, light, weather,
and a clear subject in each frame.

## Assets

- `site/media/story/op1-intro.mp4` (audio track) — the existing narrator, Tower and score for the
  intro; the voice slots are fixed (client/story.js FILMS), so the new picture keeps its timing.
- `site/media/story/op1-outro.mp4` (audio track) — the same for the ending.
- `videos/story-op1/BRIEF.md` — the shot list, the look and the rules (no text in the picture).

## Notes

- No words in the picture: the game draws the subtitles (bottom, ~9 % up) and, on the stage
  cards, the stage name and objective in the middle of the screen. Keep subjects off the
  centre band on the cards and out of the bottom fifth in the long films.
- The game letterboxes the long films itself (7 % bars); the cards play full frame.
- The world's look: after the flash everything is single white lines, no colour but the orange
  dust and the runners' bags; the Scribbles have a knot of lines for a head. Before the flash,
  a real night city in colour.
- Delivery: 1920×1080 and 1280×720, mp4 (H.264/AAC) and webm (VP9/Opus), names
  `op1-intro`, `op1-s2`, `op1-s3`, `op1-s4`, `op1-outro` in `site/media/story/`.
