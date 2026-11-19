import { CONTACT } from '../config/physics';
import { BALL } from '../config/table';
import type { Motion } from './cloth';

const R = BALL.radius;
const D = R * 2;
/** Tangential effective mass of two equal solid spheres at their contact, as a fraction of one ball's mass. */
const TANGENT_MASS = 1 / (2 * (1 + 1 / CONTACT.moment));

/**
 * Time within `horizon` at which two balls moving in straight lines first touch, or -1.
 * (dx, dz) is b - a, (dvx, dvz) is vb - va. Balls already overlapping and closing return 0.
 */
export function timeOfImpact(dx: number, dz: number, dvx: number, dvz: number, horizon: number): number {
  const closing = dx * dvx + dz * dvz;
  if (closing >= 0) return -1;
  const gap2 = dx * dx + dz * dz - D * D;
  if (gap2 <= 0) return 0;
  const speed2 = dvx * dvx + dvz * dvz;
  const disc = closing * closing - speed2 * gap2;
  if (disc < 0) return -1;
  const t = (-closing - Math.sqrt(disc)) / speed2;
  return t <= horizon ? t : -1;
}

/**
 * Resolves the impact of two equal balls: restitution along the line of centres plus Coulomb
 * friction at the contact point, which produces throw and transfers spin between the balls.
 * (nx, nz) is the unit vector from a to b. Returns the closing speed, or 0 if they were separating.
 */
export function collideBalls(a: Motion, b: Motion, nx: number, nz: number): number {
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing <= 0) return 0;
  const e = closing < CONTACT.deadSpeed ? 0 : CONTACT.ballRestitution;
  const jn = ((1 + e) * closing) / 2;
  // Relative velocity of the two surfaces at the contact point: w x (R n) for a, w x (-R n) for b.
  const sx = a.wx + b.wx;
  const sy = a.wy + b.wy;
  const sz = a.wz + b.wz;
  let tx = a.vx - b.vx + R * sy * nz;
  let ty = R * (sz * nx - sx * nz);
  let tz = a.vz - b.vz - R * sy * nx;
  const along = tx * nx + tz * nz;
  tx -= along * nx;
  tz -= along * nz;
  const slip = Math.hypot(tx, ty, tz);
  a.vx -= jn * nx; a.vz -= jn * nz;
  b.vx += jn * nx; b.vz += jn * nz;
  if (slip > 0) {
    // Friction impulse per unit mass on b (a gets the opposite), limited to what stops the slip.
    const jt = Math.min(CONTACT.ballFriction * jn, slip * TANGENT_MASS);
    const fx = (tx / slip) * jt;
    const fy = (ty / slip) * jt;
    const fz = (tz / slip) * jt;
    a.vx -= fx; a.vz -= fz;
    b.vx += fx; b.vz += fz;
    // Both balls get the same spin change: (R n) x (-f) / (k R^2) for a, (-R n) x f / (k R^2) for b.
    const g = 1 / (CONTACT.moment * R);
    const wx = g * fy * nz;
    const wy = g * (fz * nx - fx * nz);
    const wz = -g * fy * nx;
    a.wx += wx; a.wy += wy; a.wz += wz;
    b.wx += wx; b.wy += wy; b.wz += wz;
  }
  return closing;
}
