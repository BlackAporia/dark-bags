import { CFG } from './config.js';
import { moveCircle } from './geom.js';

const num = (v) => (Number.isFinite(v) ? v : 0);

// Normalise an untrusted input packet into a safe shape.
export function sanitizeInput(raw) {
  let mx = num(raw?.mx);
  let my = num(raw?.my);
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  return {
    s: Number.isInteger(raw?.s) ? raw.s : 0,
    mx,
    my,
    a: num(raw?.a),
    f: !!raw?.f,
    d: !!raw?.d,
  };
}

// Advance one runner's movement by dt. Shared by the authoritative sim and the
// client's prediction, so both land on identical positions for identical inputs.
// s: { x, y, dashT, dashCd, dashDx, dashDy }   input: sanitized input
export function stepMovement(s, input, dt, map) {
  const mx = input.mx;
  const my = input.my;
  const len = Math.hypot(mx, my);
  if (s.dashCd > 0) s.dashCd = Math.max(0, s.dashCd - dt);
  if (input.d && s.dashCd <= 0 && len > 0.1) {
    s.dashT = CFG.DASH_TIME;
    s.dashCd = CFG.DASH_CD;
    s.dashDx = mx / len;
    s.dashDy = my / len;
  }
  let vx;
  let vy;
  if (s.dashT > 0) {
    vx = s.dashDx * CFG.DASH_SPEED;
    vy = s.dashDy * CFG.DASH_SPEED;
    s.dashT = Math.max(0, s.dashT - dt);
  } else {
    vx = mx * CFG.SPEED;
    vy = my * CFG.SPEED;
  }
  moveCircle(s, vx * dt, vy * dt, CFG.PLAYER_R, map.walls, map.w, map.h);
}
