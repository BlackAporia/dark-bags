// Stills of the online lobby for the hype video: the play page, the stake box, the modes, the shop.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'lobby';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('init')) return;
  sessionStorage.setItem('init', '1');
  const S = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  S('darkbags.epoch', '2026-10-04'); S('darkbags.welcome.done', true); S('darkbags.tour.done', true); S('darkbags.tour.named', true);
  S('darkbags.name', 'NightFox' + Math.floor(Math.random() * 900 + 100)); S('darkbags.mode', 'online'); S('darkbags.lang', 'en'); S('darkbags.news.seen', 999); S('darkbags.gmode', 'raid');
  S('darkbags.starterDone', true); S('darkbags.gpuTip', true); S('darkbags.stake', 5000);
});
const p = await ctx.newPage();
await p.goto(process.env.GAME ?? 'http://localhost:8790/');
await p.waitForSelector('#intro-go:not([hidden])', { timeout: 30000 });
await p.click('#intro-go');
await p.waitForTimeout(2500);
const clean = () => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); for (const id of ['dl-pop', 'welcome']) document.getElementById(id)?.remove(); });
await clean();
await p.screenshot({ path: `${out}/play-top.png` });
for (const [id, name] of [['stake-box', 'stake'], ['modes', 'modes'], ['play', 'playbtn']]) {
  const el = await p.$(`#${id}`);
  if (!el) continue;
  await el.scrollIntoViewIfNeeded();
  await p.evaluate((i) => document.getElementById(i).scrollIntoView({ block: 'center' }), id);
  await p.waitForTimeout(500);
  await clean();
  await p.screenshot({ path: `${out}/${name}.png` });
}
await p.evaluate(() => __darkbags.go('shop'));
await p.waitForTimeout(1500);
await clean();
await p.screenshot({ path: `${out}/shop.png` });
await b.close();
console.log('lobby stills ok');
