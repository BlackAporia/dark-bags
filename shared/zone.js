// The storm: a battle-royale circle that collapses onto one exit (the "last exit").
// Deterministic from the raid's RNG, so server, client and tests agree on it.

// Each stage: [shrink starts, shrink ends] as a fraction of the raid length.
export const ZONE_STAGES = [
  [0.17, 0.33],
  [0.42, 0.58],
  [0.64, 0.78],
  [0.83, 0.97],
];
export const ZONE_RADII = [1750, 1150, 720, 400, 140];
export const ZONE_DPS = [3, 6, 10, 16, 26]; // hp per second outside the circle, per stage

const lerp = (a, b, t) => a + (b - a) * t;

export function planZone(map, rnd, duration) {
  const fin = map.extracts[Math.floor(rnd() * map.extracts.length)];
  const cx = map.w / 2;
  const cy = map.h / 2;
  const n = ZONE_RADII.length;
  let circles = null;
  // Build from the last circle outwards, each step drifting toward the map centre.
  // Wobble shrinks on retries; the last try is a straight line, which always fits.
  for (let attempt = 0; attempt < 12; attempt++) {
    const wobble = attempt === 11 ? 0 : 1.2 * (1 - attempt / 11);
    const c = new Array(n);
    c[n - 1] = { x: fin.x, y: fin.y, r: ZONE_RADII[n - 1] };
    c[0] = { x: cx, y: cy, r: ZONE_RADII[0] };
    for (let i = n - 2; i >= 1; i--) {
      const inner = c[i + 1];
      const slack = ZONE_RADII[i] - inner.r;
      const toC = Math.atan2(cy - inner.y, cx - inner.x);
      const dC = Math.hypot(cx - inner.x, cy - inner.y);
      const a = toC + (rnd() - 0.5) * wobble;
      const k = attempt === 11 ? 0.98 : 0.55 + rnd() * 0.4; // < 1 keeps a margin after rounding
      const d = Math.min(dC, slack * k);
      c[i] = { x: inner.x + Math.cos(a) * d, y: inner.y + Math.sin(a) * d, r: ZONE_RADII[i] };
    }
    const ok = c.every((ci, i) => i === 0 || Math.hypot(ci.x - c[i - 1].x, ci.y - c[i - 1].y) <= c[i - 1].r - ci.r + 1e-6);
    if (ok) {
      circles = c;
      break;
    }
  }
  const round = (v) => Math.round(v * 10) / 10;
  return {
    circles: circles.map((c) => ({ x: round(c.x), y: round(c.y), r: c.r })),
    times: ZONE_STAGES.map(([s, e]) => [round(s * duration), round(e * duration)]),
    dps: ZONE_DPS.slice(),
    finalExit: fin.id,
    duration,
  };
}

/**
 * Zone at time t (seconds): current circle, the circle it is heading to,
 * stage index (shrinks started so far), whether it is moving, seconds until
 * the next change, and storm damage per second.
 */
export function zoneAt(plan, t) {
  const { circles, times, dps } = plan;
  for (let i = 0; i < times.length; i++) {
    const [s, e] = times[i];
    if (t < s) {
      const c = circles[i];
      return { x: c.x, y: c.y, r: c.r, next: circles[i + 1], stage: i, shrinking: false, until: s - t, dps: dps[i], final: false };
    }
    if (t < e) {
      const a = circles[i];
      const b = circles[i + 1];
      const u = (t - s) / (e - s);
      return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), r: lerp(a.r, b.r, u), next: b, stage: i + 1, shrinking: true, until: e - t, dps: dps[i + 1], final: false };
    }
  }
  const c = circles[circles.length - 1];
  return { x: c.x, y: c.y, r: c.r, next: c, stage: times.length, shrinking: false, until: Math.max(0, plan.duration - t), dps: dps[dps.length - 1], final: true };
}

export function outsideZone(zone, x, y) {
  return Math.hypot(x - zone.x, y - zone.y) > zone.r;
}

// 'last' (the exit the storm collapses onto), 'open', 'closing' (the storm is about to
// swallow it: outside the next circle while it moves or within 20 s of moving), 'closed'
export function exitState(plan, zone, e) {
  if (e.id === plan.finalExit) return 'last';
  if (Math.hypot(e.x - zone.x, e.y - zone.y) > zone.r - e.r * 0.25) return 'closed';
  const n = zone.next;
  if (Math.hypot(e.x - n.x, e.y - n.y) > n.r - e.r * 0.25 && (zone.shrinking || zone.until < 20)) return 'closing';
  return 'open';
}

// Deathmatch: no storm. One circle that covers the whole map and never moves or hurts.
export function staticZone(map, duration) {
  const c = { x: map.w / 2, y: map.h / 2, r: Math.ceil(Math.hypot(map.w, map.h)) };
  return {
    circles: ZONE_RADII.map(() => ({ ...c })),
    times: ZONE_STAGES.map(() => [duration + 1, duration + 2]),
    dps: ZONE_DPS.map(() => 0),
    finalExit: map.extracts[0]?.id ?? -1,
    duration,
    none: true,
  };
}
