// Capture one practice match of a mode, played by the game's own bot brain, as timestamped
// screencast frames + the game's audio (its AudioContext master, recorded in the page).
// usage (a game server on GAME, default localhost:8790; CHROMIUM optional):
//   node scripts/trailer/hype/capture.mjs <mode> <outdir> [maxSecs] [runners] [stake] [seconds]
//   python3 scripts/trailer/hype/assemble.py <outdir>     → <outdir>/capture.mp4
// DXFLOOR=n starts the Descent on floor n (5: the first boss) with our runner geared for it.
// STACHE=1 dresses the match in the Stache Case (videos/darkbags-stache): our runner as The Stache
// with Stache Royale on every gun, the bots in the other moustached outfits.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [mode = 'raid', out = 'out', maxSecs = '120', runners = '10', stake = '1000', seconds = '180'] = process.argv.slice(2);
mkdirSync(`${out}/f`, { recursive: true });
const W = 1920, H = 1080;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: W, height: H } });
const stache = !!process.env.STACHE;
await ctx.addInitScript(({ mode, runners, stake, seconds, stache }) => {
  if (sessionStorage.getItem('init')) return;
  sessionStorage.setItem('init', '1');
  const S = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  S('darkbags.epoch', '2026-10-04'); S('darkbags.welcome.done', true); S('darkbags.tour.done', true); S('darkbags.tour.named', true);
  S('darkbags.name', stache ? 'StacheLord' : 'NightFox'); S('darkbags.mode', 'practice'); S('darkbags.lang', 'en'); S('darkbags.news.seen', 999); S('darkbags.gmode', mode);
  S('darkbags.starterDone', true); S('darkbags.gpuTip', true); S('darkbags.stake', Number(stake)); S('darkbags.pdiff', 'normal'); S('darkbags.prunners', Number(runners)); S('darkbags.ptime', Number(seconds));
  S('darkbags.skin', null); S('darkbags.music', false);
}, { mode, runners, stake, seconds, stache });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(process.env.GAME ?? 'http://localhost:8790/');
await p.waitForSelector('#intro-go:not([hidden])', { timeout: 30000 });
await p.click('#intro-go');
await p.waitForTimeout(1200);
await p.addStyleTag({ content: '#coach, .fps-chip, #fps { display: none !important; }' });
await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
// a closer camera than a 1080p screen gets: the runners read on a phone
await p.evaluate((z) => { const r = __darkbags.renderer; r.scale = z; r.layer.setRes(Math.min(2, Math.round(z * 4) / 4), true); setInterval(() => { if (r.scale !== z) r.scale = z; }, 200); }, Number(process.env.ZOOM || 1.75));

// screencast
const cdp = await ctx.newCDPSession(p);
const frames = [];
let n = 0;
cdp.on('Page.screencastFrame', async (f) => {
  const file = `${out}/f/${String(n++).padStart(6, '0')}.jpg`;
  writeFileSync(file, Buffer.from(f.data, 'base64'));
  frames.push({ file, t: f.metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});

// join and ready: the lobby, then the ready room
await p.evaluate(() => document.getElementById('play').click());
await p.waitForTimeout(700);
// screencast starts in the ready room
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
const audioStart = await p.evaluate(() => {
  const sfx = __darkbags.sfx;
  sfx.unlock();
  const c = sfx.ctx;
  const dest = c.createMediaStreamDestination();
  sfx.master.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  window.__rec = { rec, chunks };
  rec.start(500);
  return performance.timeOrigin + performance.now();
});
await p.waitForTimeout(600);
await p.evaluate(() => document.getElementById('ready').click());

// the bot brain plays our runner: its decisions go in through the normal input path
await p.evaluate(async ({ stache, dxFloor }) => {
  const { BotBrain } = await import('/shared/bot.js');
  const L = __darkbags.app.transport.lobby;
  const inp = __darkbags.input;
  let me = null;
  const find = () => {
    for (const r of L.rooms.values()) {
      const w = r.world;
      if (!w || w.phase === 'over') continue;
      const h = [...w.players.values()].find((q) => !q.isBot);
      if (!h) continue;
      if (!w.brains.has(h.id) || w.brains.get(h.id).__mine !== true) {
        const br = new BotBrain(w, h, w.rnd);
        br.easy = false;
        br.skill = 0.97;
        br.__mine = true;
        w.brains.set(h.id, br);
      }
      // DXFLOOR=n: the Descent from floor n (a boss on every fifth), our runner geared for it
      if (dxFloor && w.horde && !w.__fl && w.horde.state === 'intro') {
        w.__fl = true;
        w.horde.floor = dxFloor;
        w.horde.cleared = dxFloor - 1;
        Object.assign(h, { dGun: 5, dArmor: 5, cr: 5000 });
      }
      if (stache && !w.__stache) {
        w.__stache = true;
        const G = ['pistol', 'rifle', 'shotgun', 'sniper', 'smg', 'knife'];
        const all = (f) => Object.fromEntries(G.map((g) => [g, f]));
        Object.assign(h, { outfit: 'st-legend', body: 'm', ws: all('st-royale'), kf: 'k-stache-gold', nf: 'n-stache-gold' });
        const O = ['st-emperor', 'st-tycoon', 'st-silverfox', 'st-baron', 'st-viking', 'st-gent', 'st-bandit', 'st-barber'];
        const F = ['st-handlebar', 'st-navy', 'st-wax', 'st-barberpole', 'st-bristle'];
        let i = 0;
        for (const q of w.players.values()) if (q.isBot) { Object.assign(q, { outfit: O[i % O.length], body: 'm', ws: all(F[i % F.length]), kf: i % 2 ? 'k-stache' : 'k-stache-gold' }); i++; }
      }
      me = h;
      window.__W = w;
      return;
    }
    me = null;
  };
  setInterval(find, 250);
  // our own runner is drawn from the client's look, not the snapshot
  if (stache)
    setInterval(() => {
      const g = __darkbags.game;
      const G = ['pistol', 'deagle', 'shotgun', 'autoshotgun', 'smg', 'pdw', 'rifle', 'carbine', 'scout', 'lmg', 'magnum', 'sniper', 'knife'];
      if (g && g.outfit?.outfit !== 'st-legend') g.outfit = { outfit: 'st-legend', body: 'm', ws: Object.fromEntries(G.map((x) => [x, 'st-royale'])) };
    }, 100);
  // what happened when (wall clock, like the screencast): the banners, the announcer's streaks
  window.__ev = [];
  const g = __darkbags.game;
  const ob = g.banner.bind(g);
  g.banner = (text, ...rest) => { window.__ev.push({ t: (performance.timeOrigin + performance.now()) / 1000, k: 'banner', text: String(text).replace(/<[^>]+>/g, ''), kind: rest[0] ?? null }); return ob(text, ...rest); };
  const sx = __darkbags.sfx;
  const os = sx.sting.bind(sx);
  sx.sting = (tier) => { window.__ev.push({ t: (performance.timeOrigin + performance.now()) / 1000, k: 'streak', tier }); return os(tier); };
  const bi = () => (me && me.status === 'alive' ? me.botInput : null);
  // the dead (zombies, the Descent's floors): the bot brain only fights runners, so here the
  // nearest zombie in range is the target, and one too close is kited away from
  const zed = () => {
    const w = window.__W;
    if (!me || !w?.zombies?.size) return null;
    let best = null;
    let bd = 520;
    for (const z of w.zombies.values()) {
      if (z.hp <= 0) continue;
      const d = Math.hypot(z.x - me.x, z.y - me.y);
      if (d < bd) { bd = d; best = z; }
    }
    return best ? { z: best, d: bd } : null;
  };
  inp.moveVector = () => {
    const x = bi();
    const t = zed();
    if (t && t.d < 170) { const a = Math.atan2(me.y - t.z.y, me.x - t.z.x) + Math.sin(performance.now() / 700) * 0.6; return { x: Math.cos(a), y: Math.sin(a) }; }
    return x ? { x: x.mx, y: x.my } : { x: 0, y: 0 };
  };
  inp.aimAngle = () => { const t = zed(); return t ? Math.atan2(t.z.y - me.y, t.z.x - me.x) : bi()?.a ?? 0; };
  inp.firing = () => !!zed() || !!bi()?.f;
  inp.takeDash = () => !!bi()?.d;
  inp.takeReload = () => !!bi()?.r;
}, { stache, dxFloor: Number(process.env.DXFLOOR || 0) });

// record until the result screen has been up a few seconds, or the time cap
const t0 = Date.now();
let resultAt = 0;
let info = null;
while (Date.now() - t0 < Number(maxSecs) * 1000) {
  await p.waitForTimeout(500);
  const s = await p.evaluate(() => __darkbags.app.screen);
  if (s === 'result' && !resultAt) {
    resultAt = Date.now();
    info = await p.evaluate(() => document.getElementById('result')?.innerText?.slice(0, 1500) ?? null);
  }
  if (resultAt && Date.now() - resultAt > 7000) break;
}
await cdp.send('Page.stopScreencast');
const audio = await p.evaluate(
  () =>
    new Promise((res) => {
      const { rec, chunks } = window.__rec;
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        res(btoa(s));
      };
      rec.stop();
    }),
);
writeFileSync(`${out}/audio.webm`, Buffer.from(audio, 'base64'));
const events = await p.evaluate(() => window.__ev ?? []);
writeFileSync(`${out}/frames.json`, JSON.stringify({ frames, audioStart: audioStart / 1000, resultAt: resultAt / 1000, info, events }));
console.log(`${mode}: ${frames.length} frames over ${(frames.at(-1).t - frames[0].t).toFixed(1)} s, result=${!!resultAt}`);
console.log(info?.replace(/\n+/g, ' | ').slice(0, 500));
await b.close();
