// Screencasts of the online menus for the features video, on a server seeded with the demo data
// (scripts/trailer/features/seed.mjs): picking a mode and a stake, and a ranked finish (the
// result card, then the bonus spin landing on the season's Champion title).
// Also the pages themselves (ranked, guilds, invite), and the start of a practice match: the ready
// room filling up, the countdown, the drop.
// usage: node scripts/trailer/features/menu.mjs <outdir> [menu,spin,pages,match]  (GAME, CHROMIUM optional)
//        python3 scripts/trailer/features/frames.py <outdir>/<name>          → <outdir>/<name>.mp4
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [out = 'menu', which = 'menu,spin,pages,match'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
// a 1920×1080 screen with the page zoomed 4/3 (a 1440×810 layout): the menus read bigger, and
// the screencast (which sends CSS pixels) stays full 1080p
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(() => {
  if (sessionStorage.getItem('init')) return;
  sessionStorage.setItem('init', '1');
  const S = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  S('darkbags.epoch', '2026-10-04'); S('darkbags.welcome.done', true); S('darkbags.tour.done', true); S('darkbags.tour.named', true);
  S('darkbags.name', 'StacheLord'); S('darkbags.mode', 'online'); S('darkbags.lang', 'en'); S('darkbags.news.seen', 999); S('darkbags.gmode', 'raid');
  S('darkbags.starterDone', true); S('darkbags.gpuTip', true); S('darkbags.stake', 1000); S('darkbags.music', false); S('darkbags.token', 'demoplayer01');
  S('darkbags.boardTab', 'season'); S('darkbags.mcat', 'all');
});
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(process.env.GAME ?? 'http://localhost:8780/');
await p.waitForSelector('#intro-go:not([hidden])', { timeout: 30000 });
await p.evaluate(() => document.getElementById('intro-go').click());
await p.waitForTimeout(2500);
await p.addStyleTag({ content: '.toast, #dl-pop, .gpu-tip { display: none !important; } html { zoom: 1.3333; }' });
// slow motion: headless Chromium sends ~10 screencast frames a second at 1080p, so the page runs
// SLOW times slower while it is recorded (its clock, timers, frames and CSS/WAAPI animations) and
// frames.py plays the frames back SLOW times faster: smooth 30 fps
const SLOW = Number(process.env.SLOW || 3);
await p.evaluate(() => {
  const pn = performance.now.bind(performance);
  const raf = requestAnimationFrame.bind(window);
  const st = setTimeout.bind(window);
  const si = setInterval.bind(window);
  let k = 1, vb = pn(), rb = vb;
  window.__slow = (x) => { vb = performance.now(); rb = pn(); k = x; };
  performance.now = () => vb + (pn() - rb) / k;
  window.requestAnimationFrame = (f) => raf(() => f(performance.now()));
  window.setTimeout = (f, ms = 0, ...a) => st(f, ms * k, ...a);
  window.setInterval = (f, ms = 0, ...a) => si(f, ms * k, ...a);
});
const clean = () => p.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); for (const id of ['dl-pop', 'welcome']) document.getElementById(id)?.remove(); });
await clean();

const cdp = await ctx.newCDPSession(p);
async function record(name, fn) {
  const dir = `${out}/${name}`;
  mkdirSync(`${dir}/f`, { recursive: true });
  const frames = [];
  let n = 0;
  const on = (f) => {
    const file = `${dir}/f/${String(n++).padStart(6, '0')}.jpg`;
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', on);
  // a still page sends no frames: a slow spinner in a corner keeps the stream going
  await p.evaluate(() => { const k = document.createElement('i'); k.id = 'tick'; k.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:.01;animation:tick 1s linear infinite'; document.body.append(k); const s = document.createElement('style'); s.textContent = '@keyframes tick{to{transform:rotate(360deg)}}'; document.head.append(s); });
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOW });
  await p.evaluate((k) => __slow(k), SLOW);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const marks = [];
  const t0 = Date.now() / 1000;
  await fn((label) => marks.push({ label, t: Date.now() / 1000 }));
  await p.waitForTimeout(300);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', on);
  await p.evaluate(() => __slow(1));
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
  writeFileSync(`${dir}/frames.json`, JSON.stringify({ frames, marks, t0, slow: SLOW }));
  console.log(name, frames.length, 'frames', marks.map((m) => `${m.label}@${(m.t - t0).toFixed(1)}`).join(' '));
}
// waits are in the page's (slowed) time; a scroll glides there on the page's own clock
const wait = (ms) => p.waitForTimeout(ms * SLOW);
const into = async (sel, ms = 800) => {
  await p.evaluate(([s, ms]) => new Promise((done) => {
    const el = document.querySelector(s);
    if (!el) return done();
    const from = scrollY;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const to = scrollY;
    scrollTo({ top: from, behavior: 'instant' });
    const t0 = performance.now();
    const step = () => {
      const x = Math.min(1, (performance.now() - t0) / ms);
      scrollTo({ top: from + (to - from) * (1 - (1 - x) ** 3), behavior: 'instant' });
      if (x < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  }), [sel, ms]);
};
const click = (sel) => p.evaluate((s) => document.querySelector(s)?.click(), sel);

for (const name of which.split(',')) {
  if (name === 'menu') {
    await p.evaluate(() => __darkbags.go('play'));
    await wait(1500);
    await clean();
    await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await record('menu', async (mark) => {
      await wait(900);
      mark('modes');
      await into('#modes');
      await wait(300);
      for (const m of ['br', 'zombies', 'gl', 'team4', 'gold', 'ranked']) {
        mark(m);
        await click(`.mode-card[data-mode="${m}"]`);
        await wait(700);
      }
      mark('stake');
      await into('#stake-box');
      await wait(300);
      const tables = await p.$$eval('#tables button', (bs) => bs.length);
      for (let i = 0; i < Math.min(tables, 4); i++) {
        await p.evaluate((i) => document.querySelectorAll('#tables button')[i]?.click(), i);
        await wait(450);
      }
      mark('play');
      await into('#play');
      await wait(900);
    });
  }
  if (name === 'spin') {
    // the result of a ranked finish, as the server sends it: 1st of 10, Diamond → Master
    await p.evaluate(() => __darkbags.go('play'));
    await wait(800);
    await record('spin', async (mark) => {
      await p.evaluate(async () => {
        const { STYLE_ITEMS } = await import('/shared/style.js');
        const myth = STYLE_ITEMS.find((x) => x.rarity === 'mythic' && !x.excl)?.id;
        const T = __darkbags.app.transport;
        T.onMessage({
          t: 'result', mode: 'ranked', status: 'extracted', won: true, place: 1, size: 10, stake: 1000, payout: 9500, kills: 6, deaths: 0, secs: 214,
          ranked: { place: 1, delta: 52, before: 1974, after: 2026, div: 'master', divBefore: 'diamond', prizes: [{ div: 'master', k: 'style', id: myth }, { div: 'master', k: 'box', id: 's-icon' }], spin: { k: 'title', id: '2026-10.champion', fresh: true } },
        });
      });
      mark('result');
      await wait(9000);
      mark('end');
    });
  }
  if (name === 'pages') {
    // each page: a beat at the top, then a glide down to what it is about
    for (const [pg, to, ms] of [['ranked', '.rd-board', 2600], ['guilds', '.gd-chat', 1600], ['invite', '#ref-link', 1200]]) {
      await p.evaluate((x) => __darkbags.go(x), pg);
      await wait(600);
      await clean();
      await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      // the link as players see it, not the local test server's
      await p.evaluate(() => { const i = document.getElementById('ref-link'); if (i) i.value = i.value.replace(location.origin, 'https://dark-bags.com'); });
      await record(`page-${pg}`, async (mark) => {
        await wait(1400);
        mark('scroll');
        await into(to, ms);
        await wait(1400);
      });
    }
  }
  if (name === 'match') {
    // practice: the bots fill the seats, so the ready room runs on its own
    await p.evaluate(() => __darkbags.go('play'));
    await wait(500);
    await click('#mode-practice');
    await wait(800);
    await click('.mode-card[data-mode="br"]');
    await wait(400);
    await record('match', async (mark) => {
      await click('#play');
      mark('room');
      await wait(1200);
      mark('ready');
      await click('#ready');
      await p.waitForFunction(() => __darkbags.app.screen === 'game', null, { timeout: 120000 });
      mark('drop');
      await wait(2600);
    });
  }
}
await b.close();
