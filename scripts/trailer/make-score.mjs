// The teaser trailer's soundtrack: renders scripts/trailer/score.html offline in Chromium and
// writes videos/darkbags-teaser/assets/score.wav (loudness-normalised with ffmpeg when present).
// Needs a static server on the repo root: python3 -m http.server 8123, then
// node scripts/trailer/make-score.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = process.env.OG_BASE ?? 'http://localhost:8123';
const raw = 'videos/darkbags-teaser/assets/score.raw.wav';
const out = 'videos/darkbags-teaser/assets/score.wav';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
p.on('pageerror', (e) => console.error(e));
await p.goto(`${base}/scripts/trailer/score.html`);
await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 300000, polling: 500 });
const { wav, peak } = await p.evaluate(() => ({ wav: window.__wav, peak: window.__peak }));
await b.close();
writeFileSync(raw, Buffer.from(wav, 'base64'));
console.log(`peak before scaling: ${peak.toFixed(3)}`);
try {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11', '-ar', '48000', out]);
  console.log(out);
} catch {
  writeFileSync(out, Buffer.from(wav, 'base64'));
  console.log(`${out} (not normalised: no ffmpeg)`);
}
