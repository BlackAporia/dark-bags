// Engine stills for the teaser trailer: runs scripts/trailer/stills.html and writes the PNGs into
// videos/darkbags-teaser/assets/stills. Needs a static server on the repo root:
// python3 -m http.server 8123, then node scripts/trailer/make-stills.mjs
// (`node scripts/trailer/make-stills.mjs stache` does the STACHE partnership video's stills)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.OG_BASE ?? 'http://localhost:8123';
const stache = process.argv[2] === 'stache';
const dir = stache ? 'videos/darkbags-stache/assets/stills' : 'videos/darkbags-teaser/assets/stills';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
await p.goto(`${base}/scripts/trailer/${stache ? 'stache-stills' : 'stills'}.html`);
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
const stills = await p.evaluate(() => window.__stills);
mkdirSync(dir, { recursive: true });
for (const [name, url] of Object.entries(stills)) {
  writeFileSync(`${dir}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${dir}/${name}.png`);
}
await b.close();
