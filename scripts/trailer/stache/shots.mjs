// In-game screens for the STACHE partnership video (videos/darkbags-stache): the shop's Stache Case
// with its contents and odds, the first-100 gift letter (sent through the admin mail API), the
// Moustache Holder title, a case opening (screencast frames for the reel) and the STACHE stake.
// usage: a local game server with an admin key of your own (never a real one), then
//   ADMIN_KEY=<that key> node scripts/trailer/stache/shots.mjs <outdir>
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'shots';
mkdirSync(`${out}/reel`, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
// SCALE=2 shoots at twice the pixels (sharper crops for posts)
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: Number(process.env.SCALE ?? 1) });
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('init')) return;
  sessionStorage.setItem('init', '1');
  const S = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  S('darkbags.epoch', '2026-10-04'); S('darkbags.welcome.done', true); S('darkbags.tour.done', true); S('darkbags.tour.named', true);
  S('darkbags.name', 'StacheLord'); S('darkbags.mode', 'online'); S('darkbags.lang', 'en'); S('darkbags.news.seen', 999); S('darkbags.gmode', 'raid');
  S('darkbags.starterDone', true); S('darkbags.gpuTip', true); S('darkbags.stake', 1000); S('darkbags.music', false);
});
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
const GAME = process.env.GAME ?? 'http://localhost:8790';
await p.goto(`${GAME}/`);
await p.waitForSelector('#intro-go:not([hidden])', { timeout: 30000 });
await p.click('#intro-go');
await p.waitForTimeout(2500);
const clean = () => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => { if (!d.matches('.keep')) d.close(); }); for (const id of ['dl-pop', 'welcome']) document.getElementById(id)?.remove(); });
await clean();
const token = await p.evaluate(() => JSON.parse(localStorage.getItem('darkbags.token')));
console.log('token', token);
const shot = async (name, clip) => { await p.screenshot({ path: `${out}/${name}.png`, ...(clip ? { clip } : {}) }); console.log('shot', name); };

// the gift letter, as the first 100 STACHE stakers get it
const r = await fetch(`${GAME}/api/admin/mail`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY },
  body: JSON.stringify({ to: token, title: 'STACHE gift', body: 'You are STACHE player #7 of 100.', gift: { k: 'bundle', items: [{ k: 'ntitle', id: 'promo.moustache' }, { k: 'box', id: 'c-stache', n: 2 }] } }),
});
console.log('mail', r.status, await r.text());
await p.waitForTimeout(800);

// 1. the shop: the partner section, the Stache Case with its contents and odds open
await p.addStyleTag({ content: '#toast, .toast, .toasts { display: none !important; }' });
await p.evaluate(() => __darkbags.go('shop'));
await p.waitForTimeout(1500);
await clean();
await p.evaluate(() => { const g = document.querySelector('.box-group.partner'); g.querySelectorAll('details').forEach((d) => (d.open = true)); g.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
await p.waitForTimeout(600);
await shot('1-shop-inside');
await clean();

// 2. the mail: the letter, then claimed
await p.evaluate(() => __darkbags.go('mail'));
await p.waitForTimeout(1200);
await clean();
await p.evaluate(() => document.querySelector('[data-mail], .mail-row, .mail-item')?.click());
await p.waitForTimeout(800);
await shot('3-mail');
await p.evaluate(() => document.getElementById('mail-claim')?.click());
await p.waitForTimeout(1500);
await shot('4-mail-claimed');
await clean();

// 3. the title: wear Moustache Holder from the main menu
await p.evaluate(() => __darkbags.go('play'));
await p.waitForTimeout(800);
await clean();
await p.evaluate(() => document.getElementById('pf-title-pick')?.click());
await p.waitForTimeout(800);
await shot('5-titles');
await p.evaluate(() => document.querySelector('#tt-body [data-neon]:not([data-neon=""])')?.click());
await p.waitForTimeout(1000);
await p.evaluate(() => document.getElementById('dlg-titles')?.close());
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(500);
await shot('6-wearing');

// 4. the case opening: inventory → open, recorded as frames
await p.evaluate(() => __darkbags.go('inventory'));
await p.waitForTimeout(1200);
await clean();
await shot('7-inventory');
const cdp = await ctx.newCDPSession(p);
const frames = [];
let n = 0;
cdp.on('Page.screencastFrame', (f) => {
  const file = `${out}/reel/${String(n++).padStart(5, '0')}.jpg`;
  writeFileSync(file, Buffer.from(f.data, 'base64'));
  frames.push({ file, t: f.metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080 });
await p.evaluate(() => document.querySelector('[data-open="c-stache"]')?.click());
await p.waitForTimeout(9000);
await shot('8-opened');
await cdp.send('Page.stopScreencast');
writeFileSync(`${out}/reel/frames.json`, JSON.stringify(frames));
await p.keyboard.press('Escape');
await p.waitForTimeout(500);
await clean();

// 5. the stake: STACHE picked as the coin
await p.evaluate(() => __darkbags.go('play'));
await p.waitForTimeout(800);
await clean();
await p.evaluate(() => {
  const b = [...document.querySelectorAll('#assets [data-asset], #assets button')].find((x) => /STACHE/.test(x.textContent));
  b?.click();
  document.getElementById('stake-box')?.scrollIntoView({ block: 'center' });
});
await p.waitForTimeout(800);
await shot('9-stake');
await b.close();
