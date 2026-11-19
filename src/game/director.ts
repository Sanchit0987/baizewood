import { FLOW } from '../config/game';
import { CAMERA } from '../config/graphics';
import { BALL } from '../config/table';
import { dot, norm, sub } from '../math/vec2';
import type { PoolWorld } from '../physics/world';
import type { CameraShot } from '../render/camera';
import { POCKETS, type Pocket } from '../table/geometry';

const BREAK_CUT = 1;
const POT_CUT = 2;

/** Automatic camera cuts: a low angle beside the rack on the break, and a pocket camera for the winning pot. */
export class Director {
  private breakLeft = 0;
  private pocket: Pocket | null = null;
  private potHold = 0;
  private armed = false;
  private last = { x: 0, z: 0 };
  /** Counts cuts started, for tests. */
  cuts = { break: 0, pot: 0 };

  /** Call when a shot is struck. `forTheWin` is true when the shooter is on the 8-ball. */
  shotStruck(breaking: boolean, forTheWin: boolean): void {
    this.pocket = null;
    this.potHold = 0;
    this.armed = forTheWin;
    this.breakLeft = breaking ? CAMERA.breakCut.seconds : 0;
    if (breaking) this.cuts.break++;
  }

  /** Call every frame while balls roll. */
  watch(world: PoolWorld, dt: number): void {
    this.breakLeft = Math.max(0, this.breakLeft - dt);
    if (this.pocket) {
      if (world.isPocketed(BALL.eight) || world.speed(BALL.eight) === 0) this.potHold += dt;
      else this.last = world.position(BALL.eight);
      return;
    }
    if (!this.armed || world.isPocketed(BALL.eight) || world.speed(BALL.eight) < FLOW.potCutSpeed) return;
    const p = world.position(BALL.eight);
    const heading = norm(world.velocity(BALL.eight));
    const target = POCKETS.find((k) => dot(norm(sub(k.centre, p)), heading) > FLOW.potCutAlign);
    if (!target) return;
    this.pocket = target;
    this.last = p;
    this.cuts.pot++;
  }

  /** Call when the shot is over; the pot camera lingers for a moment if `won`. */
  settled(won: boolean): void {
    this.breakLeft = 0;
    this.armed = false;
    if (!won) this.pocket = null;
  }

  /** Ages the pot camera after the balls stop. */
  idle(dt: number): void {
    if (!this.pocket) return;
    this.potHold += dt;
    if (this.potHold > CAMERA.potCut.hold) this.pocket = null;
  }

  clear(): void {
    this.breakLeft = 0;
    this.pocket = null;
    this.armed = false;
  }

  /** The fixed shot to use now, or null to leave the camera to the player. */
  shot(): CameraShot | null {
    if (this.pocket) {
      const k = this.pocket;
      const c = CAMERA.potCut;
      return { kind: 'fixed', cut: POT_CUT, position: [k.centre.x + k.axis.x * c.back, c.height, k.centre.z + k.axis.z * c.back], target: [this.last.x, 0, this.last.z] };
    }
    if (this.breakLeft > 0) return { kind: 'fixed', cut: BREAK_CUT, position: CAMERA.breakCut.position, target: CAMERA.breakCut.target };
    return null;
  }
}
