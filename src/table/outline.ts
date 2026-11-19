import { v2, type Vec2 } from '../math/vec2';
import { POCKETS } from './geometry';

/** Distance from the centre to the edge of an axis-aligned rectangle along a heading. */
export function rectRadius(theta: number, hx: number, hz: number): number {
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  return Math.min(c > 0 ? hx / c : Infinity, s > 0 ? hz / s : Infinity);
}

/** Far crossing of a ray from the origin with a circle, or 0 when it misses. */
function circleFar(theta: number, centre: Vec2, radius: number): number {
  const dx = Math.cos(theta);
  const dz = Math.sin(theta);
  const along = centre.x * dx + centre.z * dz;
  const d2 = centre.x * centre.x + centre.z * centre.z - along * along;
  if (along <= 0 || d2 > radius * radius) return 0;
  return along + Math.sqrt(radius * radius - d2);
}

/** Rectangle with rounded corners, as a radius for each heading. */
export function roundedRectRadius(theta: number, hx: number, hz: number, corner: number): number {
  const r = rectRadius(theta, hx, hz);
  const x = Math.abs(Math.cos(theta) * r);
  const z = Math.abs(Math.sin(theta) * r);
  if (x <= hx - corner || z <= hz - corner) return r;
  const first = v2(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)));
  return circleFar(Math.atan2(first.z, first.x), v2(hx - corner, hz - corner), corner) || r;
}

/**
 * Inner edge of the rails: the rectangle behind the cushions, bulging round each pocket.
 * `rim` widens the pocket cut-outs.
 */
export function railInnerRadius(theta: number, hx: number, hz: number, rim: number): number {
  let r = rectRadius(theta, hx, hz);
  for (const p of POCKETS) r = Math.max(r, circleFar(theta, p.centre, p.radius + rim));
  return r;
}

/** Headings from `from` to `to` in equal steps, both ends included. */
export function headings(from: number, to: number, steps: number): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps);
}

export const polar = (theta: number, r: number): Vec2 => v2(Math.cos(theta) * r, Math.sin(theta) * r);

/** Heading of each pocket centre seen from the middle of the table. */
export const POCKET_HEADINGS: readonly number[] = POCKETS.map((p) => Math.atan2(p.centre.z, p.centre.x));
