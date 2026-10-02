// The link-preview banner: renders scripts/og/banner.html (the game's own runners, weapons and
// bags) at 2× and writes client/og.jpg (the game, served at /og.jpg) and site/media/og.jpg (landing).
// Needs a static server on the repo root: python3 -m http.server 8123, then node scripts/make-og.mjs
import { chromium } from 'playwright';
import { copyFileSync } from 'node:fs';

const base = process.env.OG_BASE ?? 'http://localhost:8123';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await p.goto(`${base}/scripts/og/banner.html`);
await p.waitForFunction(() => document.body.dataset.ready === '1' && document.fonts.status === 'loaded', null, { timeout: 30000 });
await p.waitForTimeout(400);
await p.locator('#og').screenshot({ path: 'client/og.jpg', type: 'jpeg', quality: 92 });
copyFileSync('client/og.jpg', 'site/media/og.jpg');
console.log('client/og.jpg, site/media/og.jpg: 2400×1260');
await b.close();
