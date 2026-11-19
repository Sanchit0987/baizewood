import RAPIER from '@dimforge/rapier3d-compat';
import { CONTACT, PHYSICS } from '../config/physics';
import { BALL, TABLE } from '../config/table';
import type { Quat } from '../math/quat';
import type { Vec2 } from '../math/vec2';
import { HALF_LENGTH, HALF_WIDTH, POCKETS, pocketAt } from '../table/geometry';
import type { BallSnap } from '../table/rack';
import { applyCloth, isAtRest, type Motion } from './cloth';
import { collideBalls, timeOfImpact } from './collide';
import { addCushions } from './cushions';
import { strikeMotion, type Shot } from './strike';

export type ImpactKind = 'ball' | 'cushion' | 'pocket';
/** `b` is the other ball for ball impacts, the pocket index for pockets and -1 for cushions. */
export interface Impact { kind: ImpactKind; a: number; b: number; speed: number; x: number; z: number }

let ready: Promise<void> | null = null;
export const initPhysics = (): Promise<void> => (ready ??= RAPIER.init());

const R = BALL.radius;
const N = BALL.count;
const ZERO = { x: 0, y: 0, z: 0 };
const GROUP_BITS = 16;
/** Balls only collide with the table in Rapier; ball-to-ball contact is resolved exactly in `contacts()`. */
const BALL_GROUPS = (1 << GROUP_BITS) | 2;
const BALL_GROUPS_TABLE = (2 << GROUP_BITS) | 1;
const still = (): Motion => ({ vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });

/**
 * The table: sixteen Rapier bodies with CCD held on the plane of the cloth, six convex cushions
 * with angled jaw facings and a backstop. Each fixed step is split at the exact moments two
 * balls touch (swept sphere test), so ball impacts use the true line of centres at any speed.
 * Cloth friction comes from `applyCloth`; pockets capture a ball whose centre passes over the hole.
 */
export class PoolWorld {
  time = 0;
  private readonly world: RAPIER.World;
  private readonly bodies: RAPIER.RigidBody[] = [];
  private readonly pocketed: boolean[] = [];
  private readonly motion: Motion[] = [];
  private readonly px = new Float64Array(N);
  private readonly pz = new Float64Array(N);

  constructor(readonly timestep: number = PHYSICS.timestep) {
    this.world = new RAPIER.World(ZERO);
    this.world.numSolverIterations = PHYSICS.solverIterations;
    this.world.integrationParameters.normalizedAllowedLinearError = PHYSICS.allowedError;
    this.world.integrationParameters.normalizedPredictionDistance = PHYSICS.predictionDistance;
    addCushions(this.world, BALL_GROUPS_TABLE);
    for (let id = 0; id < N; id++) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(0, R, 0).setCcdEnabled(true).setSoftCcdPrediction(PHYSICS.softCcd).setCanSleep(false).enabledTranslations(true, false, true),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.ball(R).setMass(BALL.mass).setCollisionGroups(BALL_GROUPS)
          .setRestitution(CONTACT.cushionRestitution).setFriction(CONTACT.cushionFriction),
        body,
      );
      body.setEnabled(false);
      this.bodies.push(body);
      this.pocketed.push(true);
      this.motion.push(still());
    }
  }

  /** Puts every ball where a snapshot says, at rest. */
  load(balls: readonly BallSnap[]): void {
    this.time = 0;
    for (const b of balls) {
      if (b.pocketed) this.remove(b.id);
      else this.place(b.id, b);
    }
  }

  snapshot(): BallSnap[] {
    return this.bodies.map((_, id) => ({ id, x: this.px[id], z: this.pz[id], pocketed: this.pocketed[id] }));
  }

  position(id: number): Vec2 { return { x: this.px[id], z: this.pz[id] }; }

  rotation(id: number): Quat {
    const q = this.bodies[id].rotation();
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  }

  speed(id: number): number { return Math.hypot(this.motion[id].vx, this.motion[id].vz); }
  velocity(id: number): Vec2 { return { x: this.motion[id].vx, z: this.motion[id].vz }; }
  motionOf(id: number): Readonly<Motion> { return this.motion[id]; }
  isPocketed(id: number): boolean { return this.pocketed[id]; }

  /** True while any ball on the table is still moving or spinning. */
  get moving(): boolean {
    for (let id = 0; id < N; id++) if (!this.pocketed[id] && !isAtRest(this.motion[id])) return true;
    return false;
  }

  /** Sets a ball down at rest (ball in hand, re-spotting). */
  place(id: number, p: Vec2): void {
    this.pocketed[id] = false;
    this.px[id] = p.x;
    this.pz[id] = p.z;
    const body = this.bodies[id];
    body.setEnabled(true);
    body.setTranslation({ x: p.x, y: R, z: p.z }, true);
    this.setMotion(id, still());
  }

  remove(id: number): void {
    this.pocketed[id] = true;
    this.setMotion(id, still());
    this.bodies[id].setEnabled(false);
  }

  setMotion(id: number, m: Motion): void {
    Object.assign(this.motion[id], m);
    this.push(id);
  }

  strike(shot: Shot): void {
    this.setMotion(BALL.cue, strikeMotion(shot));
  }

  private push(id: number): void {
    const m = this.motion[id];
    this.bodies[id].setLinvel({ x: m.vx, y: 0, z: m.vz }, true);
    this.bodies[id].setAngvel({ x: m.wx, y: m.wy, z: m.wz }, true);
  }

  /** Advances one fixed timestep and reports what collided or dropped. */
  step(): Impact[] {
    const impacts: Impact[] = [];
    this.time += this.timestep;
    for (let id = 0; id < N; id++) {
      if (this.pocketed[id] || isAtRest(this.motion[id])) continue;
      applyCloth(this.motion[id], this.timestep);
      this.push(id);
    }
    let remaining = this.timestep;
    for (let n = 0; n < PHYSICS.maxContactsPerStep; n++) {
      const hit = this.nextContact(remaining);
      if (!hit) break;
      if (hit.t > PHYSICS.minSubstep) {
        this.advance(hit.t, impacts);
        remaining -= hit.t;
      }
      this.contact(hit.a, hit.b, impacts);
    }
    if (remaining > PHYSICS.minSubstep) this.advance(remaining, impacts);
    this.capture(impacts);
    return impacts;
  }

  /** Earliest moment within `horizon` at which two balls touch, assuming straight-line motion. */
  private nextContact(horizon: number): { a: number; b: number; t: number } | null {
    let best: { a: number; b: number; t: number } | null = null;
    for (let a = 0; a < N; a++) {
      if (this.pocketed[a]) continue;
      const ma = this.motion[a];
      const aMoves = ma.vx !== 0 || ma.vz !== 0;
      for (let b = a + 1; b < N; b++) {
        if (this.pocketed[b]) continue;
        const mb = this.motion[b];
        if (!aMoves && mb.vx === 0 && mb.vz === 0) continue;
        const t = timeOfImpact(this.px[b] - this.px[a], this.pz[b] - this.pz[a], mb.vx - ma.vx, mb.vz - ma.vz, best ? best.t : horizon);
        if (t >= 0 && (!best || t < best.t)) best = { a, b, t };
      }
    }
    return best;
  }

  /** Lets Rapier move every ball for `dt`, bouncing them off cushions and jaws. */
  private advance(dt: number, impacts: Impact[]): void {
    this.world.timestep = dt;
    this.world.step();
    for (let id = 0; id < N; id++) {
      if (this.pocketed[id]) continue;
      const m = this.motion[id];
      if (isAtRest(m)) continue;
      const body = this.bodies[id];
      const p = body.translation();
      this.px[id] = p.x;
      this.pz[id] = p.z;
      const v = body.linvel();
      const jolt = Math.hypot(v.x - m.vx, v.z - m.vz);
      if (jolt === 0) continue;
      // Any change the solver made is a cushion or jaw contact (balls ignore each other in Rapier).
      const w = body.angvel();
      m.vx = v.x; m.vz = v.z; m.wx = w.x; m.wy = w.y; m.wz = w.z;
      if (jolt > CONTACT.jolt) impacts.push({ kind: 'cushion', a: id, b: -1, speed: jolt, x: p.x, z: p.z });
    }
  }

  private contact(a: number, b: number, impacts: Impact[]): void {
    const dx = this.px[b] - this.px[a];
    const dz = this.pz[b] - this.pz[a];
    const d = Math.hypot(dx, dz);
    if (d === 0 || d > R * 2 + CONTACT.slack) return;
    const closing = collideBalls(this.motion[a], this.motion[b], dx / d, dz / d);
    if (closing <= 0) return;
    this.push(a);
    this.push(b);
    impacts.push({ kind: 'ball', a, b, speed: closing, x: this.px[a] + dx / 2, z: this.pz[a] + dz / 2 });
  }

  /** Drops balls whose centre is over a pocket (or that somehow got behind the cushions). */
  private capture(impacts: Impact[]): void {
    for (let id = 0; id < N; id++) {
      if (this.pocketed[id] || isAtRest(this.motion[id])) continue;
      const p = { x: this.px[id], z: this.pz[id] };
      let pocket = pocketAt(p);
      if (pocket < 0 && (Math.abs(p.x) > HALF_LENGTH + TABLE.cushionDepth || Math.abs(p.z) > HALF_WIDTH + TABLE.cushionDepth)) {
        pocket = POCKETS.reduce((best, k) => (Math.hypot(k.centre.x - p.x, k.centre.z - p.z) < Math.hypot(best.centre.x - p.x, best.centre.z - p.z) ? k : best)).index;
      }
      if (pocket < 0) continue;
      impacts.push({ kind: 'pocket', a: id, b: pocket, speed: this.speed(id), x: p.x, z: p.z });
      this.remove(id);
    }
  }
}
