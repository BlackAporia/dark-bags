// The X (Twitter) art: scripts/x/banner.html (1500×500 header) and scripts/x/avatar.html
// (400×400 picture), shot at 2×, scripts/x/cover.html (the teaser's 1920×1080 cover) and
// scripts/x/scam.html (the no-token warning, 1920×1080), all
// into brand/x/; scripts/x/youtube.html is the teaser's YouTube thumbnail (brand/youtube/). Needs a static server on the repo root:
// python3 -m http.server 8123, then node scripts/make-x.mjs (ONLY=cover,youtube: just those)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.OG_BASE ?? 'http://localhost:8123';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
mkdirSync('brand/x', { recursive: true });
mkdirSync('brand/youtube', { recursive: true });
for (const [page, w, h, sel, out, scale = 2] of [
  ['banner', 1500, 500, '#x', 'brand/x/banner.jpg'],
  ['avatar', 400, 400, '#a', 'brand/x/avatar.png'],
  ['cover', 1600, 900, '#c', 'brand/x/cover.jpg', 1.2],
  ['youtube', 1280, 720, '#y', 'brand/youtube/thumbnail.jpg', 1.5],
  ['scam', 1600, 900, '#s', 'brand/x/scam-alert.jpg', 1.2],
].filter(([page]) => !process.env.ONLY || process.env.ONLY.split(',').includes(page))) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await p.goto(`${base}/scripts/x/${page}.html`);
  await p.waitForFunction(() => document.body.dataset.ready === '1' && document.fonts.status === 'loaded', null, { timeout: 30000 });
  await p.waitForTimeout(400);
  await p.locator(sel).screenshot(out.endsWith('.jpg') ? { path: out, type: 'jpeg', quality: 92 } : { path: out });
  console.log(`${out}: ${w * scale}×${h * scale}`);
  await p.close();
}
await b.close();
