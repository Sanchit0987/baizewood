import { CONTACT, CUE } from '../config/physics';
import { BALL } from '../config/table';
import { clamp, clamp01 } from '../math/vec2';
import type { Motion } from './cloth';

/** One stroke of the cue. */
export interface Shot {
  /** Heading of the cue ball in radians (0 = +x, quarter turn = +z). */
  angle: number;
  /** 0..1 of the available cue speed. */
  power: number;
  /** Tip offset right (+) or left (-) of centre, -1..1: english. */
  side: number;
  /** Tip offset above (+, follow) or below (-, draw) centre, -1..1. */
  vertical: number;
}

export const powerToSpeed = (power: number): number => CUE.minSpeed + (CUE.maxSpeed - CUE.minSpeed) * clamp01(power) ** CUE.powerCurve;
export const speedToPower = (speed: number): number => clamp01((speed - CUE.minSpeed) / (CUE.maxSpeed - CUE.minSpeed)) ** (1 / CUE.powerCurve);

/** Keeps the tip offset inside the unit circle. */
export function clampSpin(side: number, vertical: number): { side: number; vertical: number } {
  const l = Math.hypot(side, vertical);
  return l > 1 ? { side: side / l, vertical: vertical / l } : { side, vertical };
}

/**
 * Motion of the cue ball just after the tip leaves it. An impulse m*V applied at an offset r
 * from the centre gives the spin w = (r x V) / (k R^2), with k = 2/5.
 */
export function strikeMotion(shot: Shot): Motion {
  const speed = powerToSpeed(shot.power);
  const spin = clampSpin(clamp(shot.side, -1, 1), clamp(shot.vertical, -1, 1));
  const dx = Math.cos(shot.angle);
  const dz = Math.sin(shot.angle);
  const gain = (speed * CUE.maxOffset) / (CONTACT.moment * BALL.radius);
  return {
    vx: dx * speed,
    vz: dz * speed,
    wx: gain * spin.vertical * dz,
    wy: gain * spin.side,
    wz: -gain * spin.vertical * dx,
  };
}
