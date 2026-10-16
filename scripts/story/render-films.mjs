// Renders the story films (client/story.js FILMS) into site/media/story/: every frame of the
// engine's own scene (drawFilm, the same code the game plays when there is no video) at
// 1920×1080, 30 fps, under the sound from scripts/story/make-audio.py. The subtitles are not in
// the picture: the game draws them in every language.
//
//   python3 scripts/story/make-audio.py --model en-us-libritts-high.onnx --out /tmp/story-audio
//   node scripts/story/render-films.mjs /tmp/story-audio
//
// Needs Playwright with a Chromium (PLAYWRIGHT=path to the playwright module, CHROMIUM=path to
// the browser if it is not Playwright's own) and ffmpeg with libx264 (FFMPEG=path).
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'site/media/story');
const AUDIO = process.argv[2] ?? path.join(tmpdir(), 'story-audio');
const FPS = 30;
const W = 1920;
const H = 1080;
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
// the films and what their scenes are shown with (the outro's train carries six faces)
const FILMS = { 'op1-intro': {}, 'op1-outro': { n: 6 } };

// the client and the shared code, the way the game server serves them
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  const file = url.startsWith('/shared/') ? path.join(ROOT, url) : url === '/' ? null : path.join(ROOT, 'client', url);
  if (!file) return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><body style="margin:0;background:#000">');
  try {
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://localhost:${port}/`);
await page.evaluate(async ([w, h]) => {
  const m = await import('/story.js');
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  document.body.append(c);
  const P = m.filmParticles();
  globalThis.frame = (id, secs, vars) => {
    m.drawFilm(c.getContext('2d'), w, h, id, secs, { vars, P });
    return c.toDataURL('image/jpeg', 0.92);
  };
  globalThis.secsOf = (id) => m.FILMS[id].secs;
}, [W, H]);

await mkdir(OUT, { recursive: true });
for (const [id, vars] of Object.entries(FILMS)) {
  const secs = await page.evaluate((id) => globalThis.secsOf(id), id);
  const dir = path.join(tmpdir(), `film-${id}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const n = Math.round(secs * FPS);
  for (let i = 0; i < n; i += 15) {
    const batch = await page.evaluate(([id, a, b, fps, vars]) => Array.from({ length: b - a }, (_, k) => globalThis.frame(id, (a + k) / fps, vars)), [id, i, Math.min(n, i + 15), FPS, vars]);
    await Promise.all(batch.map((d, k) => writeFile(path.join(dir, `${String(i + k).padStart(5, '0')}.jpg`), Buffer.from(d.split(',')[1], 'base64'))));
    process.stdout.write(`\r${id}: ${Math.min(n, i + 15)}/${n} frames`);
  }
  process.stdout.write('\n');
  const audio = path.join(AUDIO, `${id}.wav`);
  // H.264 + AAC for most browsers, VP9 + Opus for the ones without H.264 (open Chromium builds)
  const codecs = {
    mp4: (crf) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'],
    webm: (crf) => ['-c:v', 'libvpx-vp9', '-crf', String(crf + 8), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', '112k'],
  };
  for (const [suffix, size, crf] of [['', `${W}:${H}`, 29], ['-720', '1280:720', 27]]) {
    for (const ext of ['mp4', 'webm']) {
      const out = path.join(OUT, `${id}${suffix}.${ext}`);
      const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%05d.jpg'), '-i', audio, '-vf', `scale=${size}:flags=lanczos`, ...codecs[ext](crf), '-shortest', out], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`ffmpeg failed on ${out}`);
      console.log(out);
    }
  }
  await rm(dir, { recursive: true, force: true });
}
await browser.close();
server.close();
