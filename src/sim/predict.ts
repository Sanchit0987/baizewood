import { CONTACT } from '../config/physics';
import { BALL } from '../config/table';
import { add, addScaled, dist, dot, norm, perp, pointSegment, rayCircle, raySegment, scale, sub, v2, type Vec2 } from '../math/vec2';
import type { Motion } from '../physics/cloth';
import { collideBalls } from '../physics/collide';
import { CUSHION_SEGMENTS, POCKETS } from '../table/geometry';
import type { BallSnap } from '../table/rack';

export type ContactKind = 'ball' | 'cushion' | 'pocket' | 'none';

/** Where the cue ball first touches something on a given line, and how both balls leave. */
export interface AimPrediction {
  kind: ContactKind;
  /** Centre of the cue ball at the moment of contact. */
  contact: Vec2;
  distance: number;
  ball: number | null;
  /** Centre of the object ball, when one is hit. */
  objectStart: Vec2 | null;
  /** Unit direction of the object ball after contact (with throw). */
  objectDir: Vec2 | null;
  /** Unit direction of the cue ball just after contact, or its reflection off a cushion. */
  cueDir: Vec2 | null;
  /** Share of the cue ball's speed taken by the object ball, 0..1. */
  objectShare: number;
}

const R = BALL.radius;
const D = R * 2;
/** Speed used to evaluate throw; the result does not depend on it because friction is Coulomb. */
const REFERENCE_SPEED = 1;

/** Motions of a naturally rolling cue ball and a resting object ball after they collide. `n` points from cue to object. */
export function contactResult(dir: Vec2, n: Vec2, sideSpin = 0): { cue: Vec2; object: Vec2 } {
  const a: Motion = { vx: dir.x * REFERENCE_SPEED, vz: dir.z * REFERENCE_SPEED, wx: (dir.z * REFERENCE_SPEED) / R, wy: sideSpin, wz: (-dir.x * REFERENCE_SPEED) / R };
  const b: Motion = { vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 };
  collideBalls(a, b, n.x, n.z);
  return { cue: v2(a.vx, a.vz), object: v2(b.vx, b.vz) };
}

/** First cushion edge a ball centre meets along a ray, as distance and the surface normal there. */
export function cushionHit(origin: Vec2, dir: Vec2): { distance: number; normal: Vec2 } | null {
  let best: { distance: number; normal: Vec2 } | null = null;
  const consider = (distance: number | null, normal: () => Vec2): void => {
    if (distance !== null && (!best || distance < best.distance)) best = { distance, normal: normal() };
  };
  for (const seg of CUSHION_SEGMENTS) {
    let n = norm(perp(sub(seg.b, seg.a)));
    if (dot(n, dir) > 0) n = scale(n, -1);
    if (dot(sub(origin, seg.a), n) < 0) continue;
    const offset = scale(n, R);
    consider(raySegment(origin, dir, add(seg.a, offset), add(seg.b, offset)), () => n);
    for (const end of [seg.a, seg.b]) {
      const t = rayCircle(origin, dir, end, R);
      consider(t, () => norm(sub(addScaled(origin, dir, t!), end)));
    }
  }
  return best;
}

/** Predicts the first contact of the cue ball when struck from `origin` along `dir` (unit). */
export function predictAim(table: readonly BallSnap[], origin: Vec2, dir: Vec2, sideSpin = 0): AimPrediction {
  let distance = Infinity;
  let ball: number | null = null;
  for (const b of table) {
    if (b.pocketed || b.id === BALL.cue) continue;
    const t = rayCircle(origin, dir, b, D);
    if (t !== null && t < distance) {
      distance = t;
      ball = b.id;
    }
  }
  const cushion = cushionHit(origin, dir);
  let pocketDistance = Infinity;
  for (const p of POCKETS) {
    const t = rayCircle(origin, dir, p.centre, p.radius);
    if (t !== null && t < pocketDistance) pocketDistance = t;
  }
  if (ball !== null && distance <= Math.min(cushion?.distance ?? Infinity, pocketDistance)) {
    const contact = addScaled(origin, dir, distance);
    const n = norm(sub(table[ball], contact));
    const out = contactResult(dir, n, sideSpin);
    const cueSpeed = Math.hypot(out.cue.x, out.cue.z);
    return {
      kind: 'ball', contact, distance, ball, objectStart: { x: table[ball].x, z: table[ball].z }, objectDir: norm(out.object), cueDir: cueSpeed > CONTACT.deadSpeed ? norm(out.cue) : null,
      objectShare: Math.hypot(out.object.x, out.object.z) / REFERENCE_SPEED,
    };
  }
  if (pocketDistance < (cushion?.distance ?? Infinity)) {
    return { kind: 'pocket', contact: addScaled(origin, dir, pocketDistance), distance: pocketDistance, ball: null, objectStart: null, objectDir: null, cueDir: null, objectShare: 0 };
  }
  if (cushion) {
    const reflected = addScaled(dir, cushion.normal, -2 * dot(dir, cushion.normal));
    return { kind: 'cushion', contact: addScaled(origin, dir, cushion.distance), distance: cushion.distance, ball: null, objectStart: null, objectDir: null, cueDir: norm(reflected), objectShare: 0 };
  }
  return { kind: 'none', contact: origin, distance: 0, ball: null, objectStart: null, objectDir: null, cueDir: null, objectShare: 0 };
}

/** True when a ball can travel from a to b without touching any ball not listed in `ignore`. */
export function pathClear(table: readonly BallSnap[], a: Vec2, b: Vec2, ignore: readonly number[], clearance: number = D): boolean {
  for (const ball of table) {
    if (ball.pocketed || ignore.includes(ball.id)) continue;
    if (pointSegment(ball, a, b) < clearance) return false;
  }
  return true;
}

export const ballDistance = (table: readonly BallSnap[], a: number, b: number): number => dist(table[a], table[b]);
