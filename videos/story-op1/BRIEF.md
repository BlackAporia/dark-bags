---
workflow: general-video
flow: companion
storyboard: yes
aspect: 16:9
length: 34s (intro) + 24s (outro)
language: none on screen (the game adds the subtitles)
---

# Operation 1, The Tunnels: the films

**Rendered:** `site/media/story/op1-intro.*` and `op1-outro.*` (mp4 and webm, 1080p and 720p)
are rendered from the engine's own scenes with a synthesized score and a Piper voice:

```bash
python3 scripts/story/make-audio.py --model en-us-libritts-high.onnx --out /tmp/story-audio
node scripts/story/render-films.mjs /tmp/story-audio
```

The rest of this brief is for replacing them with generated or hand-made films: keep the file
names and the timings, and the game picks them up.

Two films for the first story operation (`shared/story.js`, `client/story.js`). The game plays
them before the first stage and after the boss. Until they exist, the game draws the same scenes
itself (`SCENES.stroke` and `SCENES.train` in `client/story.js`), so the films replace that
fallback scene by scene and keep its timing.

## Rules for both

- **No text in the picture.** The subtitles are drawn by the game in 11 languages from
  `client/strings/*.js` (`op.tunnels.v.intro.*`, `op.tunnels.v.outro.*`), timed by `FILMS` in
  `client/story.js`. A film with burned-in words would show them twice and only in one language.
- **The game's look:** people are single-line stick figures (a round head, a straight body,
  lines for arms and legs), drawn in white on near-black. After the flash, everything is outlines,
  no fills, no colour, except the **orange dust** (#fb923c) and the runners' orange bags. The lost
  ones (the Scribbles) have a scribbled knot of lines for a head and walk with a jitter.
- **Original only.** No real cities' landmarks, no brands, no characters from other games or
  films. The satellites are the game's own OUTLINE array: a small box with two long panels.
- **Sound:** one narrator (low, calm, English) and Tower on the radio (filtered, a little static).
  The voice lines are the English strings, word for word, in the slots below. Keep the voice
  inside each slot: the subtitles appear and disappear at those times.
- **Build from the game's own frames.** Generative video drifts off a character between shots.
  Render the key frames with the engine (`scripts/trailer/make-stills.mjs` draws runners in the
  game's style; the fallback scenes above draw the city, the tunnel and the wipe), then use them
  as start and end frames for image-to-video, and cut in HyperFrames like the teasers in
  `videos/`.

## Film 1: `op1-intro` (34 s), the same start for everyone

| Time | Picture | Voice (subtitle key) |
|---|---|---|
| 0–8 | Night city under a violet sky, windows lit. Three OUTLINE satellites drift across. From 5 s, thin blue scan beams fan down from them onto the rooftops. | 0.8–4.6 narrator `intro.1` · 4.8–8.2 narrator `intro.2` |
| 8–9 | White flash fills the screen, a ringing silence. | none |
| 9–17 | The flash fades: the skyline is now only white outlines, wobbling slightly as if just drawn. Colour is gone. From 12 s, scribble-headed figures wander the street. | 9.2–13 narrator `intro.3` · 13.2–17.8 narrator `intro.4` |
| 17–23 | Orange dust rises through the grey air. A single stick figure lies in the street. | 18–22.6 narrator `intro.5` |
| 21–26 | The figure gets up; an orange bag hangs from its shoulder. It turns west. | 23–28.4 Tower on the radio `intro.6` |
| 25–34 | A wall of grey erasure, its edge a moving scribble, slides in from the left, wiping the outlines away. The runner turns and sprints east. Cut to black on the run. | 28.8–33.2 Tower `intro.7` |

## Film 2: `op1-outro` (24 s), after the boss

| Time | Picture | Voice (subtitle key) |
|---|---|---|
| 0–12 | Inside the metro tunnel: rings of the tunnel rushing past, two rails, the red tail lights of the last train pulling away. In its windows, the stick-figure faces of the people the squad saved (the game passes how many as `{n}`; film it with six). | 0.8–5.2 narrator `outro.1` · 5.4–9.6 Tower `outro.2` |
| 12–19 | The train comes up into grey daylight. The horizon is grey: the wipe has spread past the city. | 9.8–13.6 narrator `outro.3` · 13.8–19 Tower `outro.4` |
| 19–24 | Far south, a harbour drawn in outlines; cranes, ships. Something moves between the containers. Fade to black. | 19.4–23.4 narrator `outro.5` |

`outro.1` says how many were saved: record it as "…left with people aboard" without the number
in the voice, or record one take per count (0–6) if the voice should say it.

## Prompts (image-to-video, from the engine's frames)

- Intro, opening: *"Slow push-in over a night city skyline, flat 2D vector style, dark navy and
  violet palette, warm lit windows, three tiny satellites with long thin panels drifting across
  the sky, thin cyan scan beams fanning down onto the roofs. No text, no logos."*
- Intro, after the flash: *"The same skyline redrawn as thin white outlines only on near-black,
  lines slightly trembling as if hand-drawn, stick figures with scribbled heads wandering the
  street, floating orange dust particles. Minimal, monochrome except orange. No text."*
- Intro, the wipe: *"A wall of grey eraser texture with a scribbled moving edge sweeps from left
  to right across a white-outline city; a white stick-figure runner with an orange bag sprints to
  the right. 2D, side view, no text."*
- Outro: *"Inside a dark subway tunnel drawn in thin white lines, two rails converging, red tail
  lights of a train receding, orange dust in the air; the train emerges into a flat grey
  daylight. 2D, minimal, no text."*

## Delivery

- `op1-intro.mp4`, `op1-outro.mp4`: 1920×1080, H.264, AAC, under 10 MB each.
- `op1-intro-720.mp4`, `op1-outro-720.mp4`: 1280×720 for phones, under 5 MB each.
- The same four as `.webm` (VP9, Opus): browsers without H.264 (open Chromium builds) play those.
- Put them in `site/media/story/`. The game looks for them there (on Pages: `/media/story/`, on
  the game server: `/site/media/story/`, or anywhere with `?media=<url>`). If a file is missing,
  slow or the player saves data, the engine's own scene plays instead with the same subtitles.
- A new language needs only its strings; the films never change.
