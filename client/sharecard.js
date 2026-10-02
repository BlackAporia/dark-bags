// Share cards: a 1200×675 image for X (the size it shows uncropped) for nearly every
// moment: extractions, deaths, luck-bag hits and misses, rank-ups. X intents cannot
// attach images, so "Post on X" copies the card to the clipboard first (paste it into
// the post), and "Share…" hands the image file to the phone's share sheet.
import { drawPreview } from './stickman.js';
import { rankBadgeSvg } from './rankbadge.js';
import { OUTFIT, RARITIES, usd } from '../shared/cosmetics.js';
import { usdText } from '../shared/assets.js';
import { RANKS } from '../shared/ranks.js';

const W = 1200;
const H = 675;
const DISPLAY = "'Big Shoulders Stencil Display', Impact, 'Arial Narrow Bold', sans-serif";
const UI = "'Chakra Petch', 'Segoe UI', system-ui, sans-serif";
const NUM = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function svgImage(svg) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function fitText(ctx, text, font, size, maxW) {
  let s = size;
  ctx.font = `${font.replace('{s}', s)}`;
  while (ctx.measureText(text).width > maxW && s > 20) {
    s -= 4;
    ctx.font = `${font.replace('{s}', s)}`;
  }
  return s;
}

function chip(ctx, x, y, label, value, accent) {
  ctx.font = `600 16px ${UI}`;
  const lw = ctx.measureText(label.toUpperCase()).width;
  ctx.font = `500 26px ${NUM}`;
  const vw = ctx.measureText(value).width;
  const w = Math.max(lw, vw) + 36;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 76, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(x, y + 14, 3, 48);
  ctx.fillStyle = '#8d93a6';
  ctx.font = `600 16px ${UI}`;
  ctx.textAlign = 'left';
  ctx.fillText(label.toUpperCase(), x + 18, y + 28);
  ctx.fillStyle = '#ebe5d6';
  ctx.font = `500 26px ${NUM}`;
  ctx.fillText(value, x + 18, y + 60);
  return w;
}

/**
 * spec: { accent, kicker, title, sub, chips: [[label, value]], look, rank, pose: 'stand'|'down',
 *         stamp?, glow?, tags? }
 */
export async function renderCard(spec) {
  await document.fonts?.ready?.catch?.(() => {});
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const A = spec.accent;

  // ground: night, a grid, the accent light on the runner's side, a diagonal band
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b0f19');
  bg.addColorStop(1, '#05070b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(300, 380, 10, 300, 380, 420);
  glow.addColorStop(0, `${A}66`);
  glow.addColorStop(1, `${A}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = A;
  ctx.beginPath();
  ctx.moveTo(560, 0);
  ctx.lineTo(574, 0);
  ctx.lineTo(494, H);
  ctx.lineTo(480, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // the runner on a lit floor
  const floorY = 585;
  const ring = ctx.createRadialGradient(290, floorY, 4, 290, floorY, 190);
  ring.addColorStop(0, `${A}88`);
  ring.addColorStop(1, `${A}00`);
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.ellipse(290, floorY, 190, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  if (spec.pose === 'down') {
    ctx.filter = 'grayscale(0.7) brightness(0.8)';
    ctx.translate(290, floorY - 30);
    ctx.rotate(-Math.PI / 2 + 0.08);
    drawPreview(ctx, spec.look, { x: 0, y: 0, scale: 6.2, t: 1400, w: spec.weapon ?? 0, aim: 0.1 });
  } else {
    drawPreview(ctx, spec.look, { x: 290, y: floorY, scale: 7.2, t: 1400, w: spec.weapon ?? 3, aim: -0.3, moveK: 0.2, phase: 0.6 });
  }
  ctx.restore();
  if (spec.stamp) {
    // a rubber stamp across the legs, clear of the face
    ctx.save();
    ctx.translate(300, spec.pose === 'down' ? 420 : 505);
    ctx.rotate(-0.12);
    ctx.font = `900 58px ${DISPLAY}`;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(spec.stamp).width + 44;
    ctx.fillStyle = 'rgba(7, 9, 15, 0.72)';
    ctx.fillRect(-tw / 2, -50, tw, 70);
    ctx.strokeStyle = spec.stampColor ?? A;
    ctx.fillStyle = spec.stampColor ?? A;
    ctx.lineWidth = 5;
    ctx.strokeRect(-tw / 2, -50, tw, 70);
    ctx.fillText(spec.stamp, 0, 6);
    ctx.restore();
  }

  // text column
  const x0 = 620;
  const maxW = W - x0 - 60;
  ctx.textAlign = 'left';
  ctx.fillStyle = A;
  ctx.font = `700 20px ${UI}`;
  ctx.fillText(spec.kicker.toUpperCase().split('').join(String.fromCharCode(8202)), x0, 118);
  ctx.fillStyle = '#ebe5d6';
  const ts = fitText(ctx, spec.title, `900 {s}px ${DISPLAY}`, 118, maxW);
  ctx.font = `900 ${ts}px ${DISPLAY}`;
  if (spec.titleGlow) {
    ctx.shadowColor = A;
    ctx.shadowBlur = 30;
  }
  ctx.fillText(spec.title, x0, 118 + ts * 0.95);
  ctx.shadowBlur = 0;
  let y = 118 + ts * 0.95 + 44;
  if (spec.sub) {
    ctx.fillStyle = '#b9bdc9';
    ctx.font = `500 26px ${UI}`;
    for (const line of wrap(ctx, spec.sub, maxW).slice(0, 3)) {
      ctx.fillText(line, x0, y);
      y += 34;
    }
  }
  y += 14;
  let cx = x0;
  let row = 0;
  for (const [label, value] of spec.chips ?? []) {
    ctx.font = `500 26px ${NUM}`;
    const est = Math.max(ctx.measureText(value).width, 80) + 40;
    if (cx + est > W - 50 && cx > x0) {
      cx = x0;
      row++;
      if (row > 1) break;
      y += 88;
    }
    cx += chip(ctx, cx, y, label, value, A) + 12;
  }

  // rank badge + footer
  // whose card it is: the player's name, big, next to their rank insignia
  const nameX = spec.rank ? 128 : 40;
  if (spec.rank) {
    const img = await svgImage(rankBadgeSvg(spec.rank, 96));
    if (img) ctx.drawImage(img, 40, 36, 76, 76);
  }
  if (spec.player) {
    ctx.fillStyle = '#ffd166';
    const ns = fitText(ctx, spec.player, `900 {s}px ${DISPLAY}`, 36, 460);
    ctx.font = `900 ${ns}px ${DISPLAY}`;
    ctx.fillText(spec.player, nameX, 72);
  }
  if (spec.rank) {
    ctx.fillStyle = '#8d93a6';
    ctx.font = `600 18px ${UI}`;
    ctx.fillText(`RANK ${spec.rank} · ${RANKS[spec.rank - 1]?.name ?? ''}`, nameX, spec.player ? 100 : 70);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, H - 64, W, 64);
  ctx.fillStyle = '#ebe5d6';
  ctx.font = `900 34px ${DISPLAY}`;
  ctx.fillText('DARK BAGS', 40, H - 20);
  ctx.fillStyle = '#8d93a6';
  ctx.font = `500 18px ${UI}`;
  ctx.textAlign = 'right';
  ctx.fillText(spec.footer ?? 'Get out alive · nobody sees your bag', W - 40, H - 25);
  return c;
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ------------------------------------------------------------ the moments

// Turn a game moment into { spec, text } for the card and the post.
export function moment(kind, d) {
  const look = d.look;
  const tag = '#DARKBAGS';
  switch (kind) {
    case 'win': {
      const pnl = d.payout - d.stake;
      const pct = Math.round((pnl / d.stake) * 100);
      return {
        spec: { accent: '#3ddc97', kicker: d.won ? 'Victory' : 'Extracted', title: usdText(d.payout), titleGlow: true, sub: d.won ? `Last one standing on a ${usdText(d.stake)} stake. The pot is mine.` : `Walked out of the dark on a ${usdText(d.stake)} stake. Nobody saw what I was carrying.`, chips: [['Profit', `${pnl >= 0 ? '+' : '−'}${Math.abs(pct)}%`], ['Kills', String(d.kills)], ['Inside', mmss(d.secs)]], look, rank: d.rank, weapon: d.weapon },
        text: d.won ? `Won ${usdText(d.payout)} on a ${usdText(d.stake)} stake, ${d.kills} ${d.kills === 1 ? 'kill' : 'kills'}. Last one standing. ${tag}` : `Got out with ${usdText(d.payout)} on a ${usdText(d.stake)} stake (${pnl >= 0 ? '+' : ''}${pct}%), ${d.kills} ${d.kills === 1 ? 'kill' : 'kills'}. Nobody saw what I was carrying. ${tag}`,
      };
    }
    case 'loss': {
      const storm = d.cause === 'storm';
      const who = d.killer ? `${d.killer} has my bag now` : storm ? 'The storm ate me' : 'Sealed inside at 0:00';
      return {
        spec: { accent: '#ff4d5e', kicker: storm ? 'Eaten by the storm' : d.status === 'mia' ? 'Sealed inside' : 'Dropped', title: `−${usdText(d.stake)}`, sub: `${who}. Only the two of us will ever know what was inside. Next raid.`, chips: [['Kills', String(d.kills)], ['Inside', mmss(d.secs)], ['Lost', usdText(d.lost)]], look, rank: d.rank, pose: 'down', stamp: storm ? 'STORM' : 'DROPPED', stampColor: '#ff4d5e' },
        text: `${who}: dropped ${usdText(d.lost)} after ${mmss(d.secs)} inside with ${d.kills} ${d.kills === 1 ? 'kill' : 'kills'}. Running it back. ${tag}`,
      };
    }
    case 'boxHit':
    case 'boxMiss': {
      const o = d.outfit;
      const r = RARITIES[o.rarity];
      const hit = kind === 'boxHit';
      const jackpot = RARITIES[d.box.jackpot].name;
      return {
        spec: {
          accent: r.color,
          kicker: `${d.box.name} · ${r.name}`,
          title: o.name.toUpperCase(),
          titleGlow: hit,
          sub: hit ? `Pulled a ${r.name} from the ${d.box.name}.${d.result.pity ? ' Pity kicked in, as promised.' : ''}` : `Went for the ${jackpot}. Got ${/^[aeiou]/i.test(r.name) ? 'an' : 'a'} ${r.name} instead.${d.result.dup ? ` Duplicate: +${usd(d.result.refund)} back.` : ''}`,
          chips: [['Rarity', r.name], ['Bag', d.box.name], d.result.dup ? ['Back', `+${usd(d.result.refund)}`] : ['Status', 'New']],
          look,
          rank: d.rank,
          stamp: hit ? null : 'SO CLOSE',
        },
        text: hit ? `Pulled ${o.name} (${r.name}) from a ${d.box.name} in DARK BAGS. ${tag}` : `Chased the ${jackpot} in a ${d.box.name}, got ${o.name} (${r.name}). Next one. ${tag}`,
      };
    }
    case 'rankUp': {
      const r = RANKS[d.rank - 1];
      const trial = d.rewards?.find((x) => x.trial)?.trial;
      return {
        spec: { accent: '#ffd166', kicker: `Rank up · ${d.rank}`, title: r.name.toUpperCase(), titleGlow: true, sub: `Climbed to rank ${d.rank} of 90 in DARK BAGS.`, chips: [['Rank', `${d.rank} / 90`], trial ? ['New look', OUTFIT[trial.id]?.name ?? '72h'] : ['Next', `rank ${d.rank + 1}`]], look, rank: d.rank },
        text: `Ranked up to ${r.name} (${d.rank}/90) in DARK BAGS. ${tag}`,
      };
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------- the dialog

let current = null;
export async function openShare(kind, data) {
  const m = moment(kind, data);
  if (!m) return;
  if (data.player) {
    m.spec.player = data.player;
    m.text = `${data.player}: ${m.text}`;
  }
  const dlg = $('dlg-share');
  $('share-status').textContent = 'Drawing your card…';
  $('share-img').removeAttribute('src');
  dlg.showModal();
  const canvas = await renderCard(m.spec);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const url = URL.createObjectURL(blob);
  if (current?.url) URL.revokeObjectURL(current.url);
  current = { blob, url, text: m.text, name: `darkbags-${kind}.png` };
  $('share-img').src = url;
  const save = $('share-save');
  save.href = url;
  save.download = current.name;
  $('share-native').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([blob], current.name, { type: 'image/png' })] }));
  $('share-status').textContent = 'X cannot attach images through a link: “Post on X” copies the card, then paste it into your post.';
}

function pageUrl() {
  return /^https?:$/.test(location.protocol) && !globalThis.DARK_BAGS_ARTIFACT ? location.origin + location.pathname : '';
}

async function copyImage() {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': current.blob })]);
    return true;
  } catch {
    return false;
  }
}

export function wireShare() {
  $('share-x').addEventListener('click', async () => {
    if (!current) return;
    const copied = await copyImage();
    const u = pageUrl();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(current.text)}${u ? `&url=${encodeURIComponent(u)}` : ''}`, '_blank', 'noopener');
    $('share-status').textContent = copied ? 'Card copied. Paste it into the post (Ctrl/⌘ V).' : 'Save the card and attach it to the post.';
  });
  $('share-copy').addEventListener('click', async () => {
    if (current) $('share-status').textContent = (await copyImage()) ? 'Card copied to the clipboard.' : 'This browser cannot copy images; use Save.';
  });
  $('share-native').addEventListener('click', async () => {
    if (!current) return;
    try {
      await navigator.share({ files: [new File([current.blob], current.name, { type: 'image/png' })], text: current.text, url: pageUrl() || undefined });
    } catch {
      /* cancelled */
    }
  });
  $('share-close').addEventListener('click', () => $('dlg-share').close());
}
