// The moustache, as a canvas path: the STACHE runners wear it (client/stickman.js), and it is
// the emblem on the STACHE weapon skins, the Stache style and the Whisker Burst kill effect.
// stachePath: centred at (cx, cy), half-width w; kinds: brush, horseshoe, walrus, handlebar, imperial.
export function stachePath(ctx, cx, cy, w, kind, twitch) {
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const tip = cx + side * w;
    ctx.moveTo(cx, cy - 0.7);
    if (kind === 'brush') {
      ctx.quadraticCurveTo(cx + side * w * 0.5, cy - 1.3, tip, cy - 0.5);
      ctx.lineTo(tip + side * 0.3, cy + 2.4);
      ctx.quadraticCurveTo(cx + side * w * 0.5, cy + 3, cx, cy + 2.6);
    } else if (kind === 'horseshoe') {
      ctx.quadraticCurveTo(cx + side * w * 0.9, cy - 1.4, tip, cy + 4.6);
      ctx.lineTo(tip - side * 1.3, cy + 4.6);
      ctx.quadraticCurveTo(cx + side * w * 0.55, cy + 0.6, cx, cy + 1.4);
    } else if (kind === 'walrus') {
      ctx.bezierCurveTo(cx + side * w * 0.45, cy - 2.2, cx + side * w * 0.95, cy - 1, tip, cy + 2.8);
      ctx.quadraticCurveTo(cx + side * w * 0.75, cy + 3.6, cx + side * w * 0.5, cy + 2.6);
      ctx.quadraticCurveTo(cx + side * w * 0.25, cy + 3.4, cx, cy + 2);
    } else {
      // handlebar and imperial: a sweep out, then the waxed tip curls up
      ctx.bezierCurveTo(cx + side * w * 0.35, cy - 1.8, cx + side * w * 0.8, cy - 1, tip, cy + 0.4);
      ctx.bezierCurveTo(tip + side * 1.9, cy - 0.2, tip + side * 1.7, cy - 2.4 - twitch, tip + side * 0.6, cy - 3 - twitch);
      ctx.quadraticCurveTo(tip + side * 0.9, cy - 1.2, tip - side * 0.5, cy + 0.9);
      ctx.quadraticCurveTo(cx + side * w * 0.45, cy + 2.2, cx, cy + 1.2);
    }
    ctx.closePath();
  }
}

// a little filled moustache (an emblem): dark rim, the hair in `color`, a light sheen on top
export function stacheIcon(ctx, x, y, w, color, sheen = 'rgba(255, 246, 220, 0.6)', kind = 'handlebar') {
  ctx.save();
  ctx.lineJoin = 'round';
  const k = w / 8; // the path is drawn at half-width 8, then scaled
  ctx.translate(x, y);
  ctx.scale(k, k);
  stachePath(ctx, 0, 0, 8, kind, 0);
  ctx.strokeStyle = 'rgba(4, 6, 10, 0.8)';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = sheen;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 1.2, -0.5);
    ctx.quadraticCurveTo(side * 4, -1.3, side * 6.8, -0.2);
  }
  ctx.stroke();
  ctx.restore();
}
