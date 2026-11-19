import { CLOTH, CONTACT, PHYSICS } from '../config/physics';
import { BALL } from '../config/table';

/** Linear and angular velocity of one ball. y is up; the ball is held on the cloth. */
export interface Motion {
  vx: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
}

const R = BALL.radius;
/** Slip of the contact point decays (1 + 1/k) times faster than the centre slows, k = 2/5 for a solid sphere. */
const SLIP_FACTOR = 1 + 1 / CONTACT.moment;

export const isAtRest = (m: Motion): boolean => m.vx === 0 && m.vz === 0 && m.wx === 0 && m.wy === 0 && m.wz === 0;

/** Velocity of the point of the ball touching the cloth. Zero when the ball rolls without slipping. */
export const slipOf = (m: Motion): { x: number; z: number } => ({ x: m.vx + R * m.wz, z: m.vz - R * m.wx });

function roll(m: Motion, dt: number): void {
  const speed = Math.hypot(m.vx, m.vz);
  const drop = CLOTH.roll * PHYSICS.gravity * dt;
  if (speed <= drop || speed < CLOTH.restSpeed) {
    m.vx = 0;
    m.vz = 0;
  } else {
    const keep = (speed - drop) / speed;
    m.vx *= keep;
    m.vz *= keep;
  }
  m.wx = m.vz / R;
  m.wz = -m.vx / R;
}

/**
 * Advances the cloth forces on a ball by dt: kinetic friction while the contact point slips
 * (which turns draw and follow into motion and brings the ball to natural roll), then rolling
 * resistance, plus the slow decay of sidespin. Mutates and returns `m`.
 */
export function applyCloth(m: Motion, dt: number): Motion {
  if (isAtRest(m)) return m;
  const slip = slipOf(m);
  const slipSpeed = Math.hypot(slip.x, slip.z);
  const accel = CLOTH.slide * PHYSICS.gravity;
  if (slipSpeed > CLOTH.slipEpsilon) {
    // Time left until the slip reaches zero under constant kinetic friction.
    const slideTime = Math.min(dt, slipSpeed / (SLIP_FACTOR * accel));
    const ux = slip.x / slipSpeed;
    const uz = slip.z / slipSpeed;
    m.vx -= accel * ux * slideTime;
    m.vz -= accel * uz * slideTime;
    const spinUp = (accel / (CONTACT.moment * R)) * slideTime;
    m.wx += spinUp * uz;
    m.wz -= spinUp * ux;
    if (slideTime < dt) roll(m, dt - slideTime);
  } else {
    roll(m, dt);
  }
  const spinDrop = CLOTH.spinDecel * dt;
  m.wy = Math.abs(m.wy) <= spinDrop ? 0 : m.wy - Math.sign(m.wy) * spinDrop;
  if (m.vx === 0 && m.vz === 0 && Math.abs(m.wy) < CLOTH.restSpin) {
    m.wx = 0;
    m.wy = 0;
    m.wz = 0;
  }
  return m;
}
