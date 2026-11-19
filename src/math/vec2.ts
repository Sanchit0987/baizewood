/** Plan-view vector on the table: x along the length, z across. */
export interface Vec2 {
  x: number;
  z: number;
}

export const v2 = (x = 0, z = 0): Vec2 => ({ x, z });
export const add = (a: Vec2, b: Vec2): Vec2 => v2(a.x + b.x, a.z + b.z);
export const sub = (a: Vec2, b: Vec2): Vec2 => v2(a.x - b.x, a.z - b.z);
export const scale = (a: Vec2, s: number): Vec2 => v2(a.x * s, a.z * s);
export const addScaled = (a: Vec2, b: Vec2, s: number): Vec2 => v2(a.x + b.x * s, a.z + b.z * s);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.z - a.z * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.z);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
export const perp = (a: Vec2): Vec2 => v2(-a.z, a.x);
export const fromAngle = (angle: number): Vec2 => v2(Math.cos(angle), Math.sin(angle));
export const angleOf = (a: Vec2): number => Math.atan2(a.z, a.x);
export const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => v2(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);

export function norm(a: Vec2): Vec2 {
  const l = len(a);
  return l > 0 ? v2(a.x / l, a.z / l) : v2();
}

export const FULL_TURN = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const clamp01 = (x: number): number => clamp(x, 0, 1);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Wraps an angle to (-pi, pi]. */
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
/** Frame-rate independent smoothing factor for an exponential approach with the given rate. */
export const approach = (dt: number, rate: number): number => 1 - Math.exp(-dt * rate);

/** Distance from point p to the segment a-b. */
export function pointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? clamp01(dot(sub(p, a), ab) / l2) : 0;
  return dist(p, addScaled(a, ab, t));
}

/** Distance along a unit-direction ray at which it first meets a circle, or null. */
export function rayCircle(origin: Vec2, dir: Vec2, centre: Vec2, radius: number): number | null {
  const oc = sub(centre, origin);
  const along = dot(oc, dir);
  const d2 = dot(oc, oc) - along * along;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  const t = along - Math.sqrt(r2 - d2);
  return t >= 0 ? t : null;
}

/** Distance along a unit-direction ray at which it crosses the segment a-b, or null. */
export function raySegment(origin: Vec2, dir: Vec2, a: Vec2, b: Vec2): number | null {
  const ab = sub(b, a);
  const denom = cross(dir, ab);
  if (denom === 0) return null;
  const ao = sub(a, origin);
  const t = cross(ao, ab) / denom;
  const u = cross(ao, dir) / denom;
  return t >= 0 && u >= 0 && u <= 1 ? t : null;
}
