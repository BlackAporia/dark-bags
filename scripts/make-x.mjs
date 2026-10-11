// The X (Twitter) profile art: scripts/x/banner.html (1500×500 header) and scripts/x/avatar.html
// (400×400 picture), shot at 2× into brand/x/. Needs a static server on the repo root:
// python3 -m http.server 8123, then node scripts/make-x.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.OG_BASE ?? 'http://localhost:8123';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
mkdirSync('brand/x', { recursive: true });
for (const [page, w, h, sel, out] of [
  ['banner', 1500, 500, '#x', 'brand/x/banner.jpg'],
  ['avatar', 400, 400, '#a', 'brand/x/avatar.png'],
]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto(`${base}/scripts/x/${page}.html`);
  await p.waitForFunction(() => document.body.dataset.ready === '1' && document.fonts.status === 'loaded', null, { timeout: 30000 });
  await p.waitForTimeout(400);
  await p.locator(sel).screenshot(out.endsWith('.jpg') ? { path: out, type: 'jpeg', quality: 92 } : { path: out });
  console.log(`${out}: ${w * 2}×${h * 2}`);
  await p.close();
}
await b.close();
