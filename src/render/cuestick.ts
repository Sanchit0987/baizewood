import { MeshBuilder, TransformNode, type Mesh, type Scene } from '@babylonjs/core';
import { CUE_LOOK as C, TABLE_LOOK } from '../config/graphics';
import { CUE } from '../config/physics';
import { BALL } from '../config/table';
import { clamp, type Vec2 } from '../math/vec2';
import { HALF_LENGTH, HALF_WIDTH } from '../table/geometry';
import type { BallSnap } from '../table/rack';
import type { Materials } from './materials';

export interface CuePose {
  visible: boolean;
  /** Heading of the shot in radians. */
  angle: number;
  /** Distance of the tip behind its address position, metres. */
  back: number;
  side: number;
  vertical: number;
  /** Above zero while the cue is still on the table after the stroke. */
  alpha: number;
}

const R = BALL.radius;

/** Elevation the cue needs so it clears the rail and any ball lying under it. */
export function cueElevation(ball: Vec2, angle: number, tipHeight: number, table: readonly BallSnap[]): number {
  // Unit vector from the cue ball back along the cue.
  const bx = -Math.cos(angle);
  const bz = -Math.sin(angle);
  let need: number = C.elevation;
  const clear = (distance: number, height: number): void => {
    if (distance > 0 && distance < C.length) need = Math.max(need, Math.atan2(height - tipHeight, distance));
  };
  const railHeight = TABLE_LOOK.railTop + C.clearance + C.buttRadius;
  if (bx !== 0) clear(((bx > 0 ? HALF_LENGTH : -HALF_LENGTH) - ball.x) / bx - R, railHeight);
  if (bz !== 0) clear(((bz > 0 ? HALF_WIDTH : -HALF_WIDTH) - ball.z) / bz - R, railHeight);
  for (const other of table) {
    if (other.pocketed || other.id === BALL.cue) continue;
    const dx = other.x - ball.x;
    const dz = other.z - ball.z;
    const along = dx * bx + dz * bz;
    const across = Math.abs(dx * bz - dz * bx);
    if (along > 0 && across < R + C.buttRadius) clear(along - R, R * 2 + C.clearance);
  }
  return clamp(need, C.elevation, C.maxElevation);
}

/** The cue: a tapered shaft with ferrule and chalked tip, a dark butt and a wrap. Its origin is the tip. */
export class CueStick {
  private readonly root: TransformNode;
  private readonly pivot: TransformNode;
  readonly meshes: Mesh[] = [];

  constructor(scene: Scene, m: Materials) {
    this.root = new TransformNode('cue', scene);
    this.pivot = new TransformNode('cuePivot', scene);
    this.pivot.parent = this.root;
    const radiusAt = (d: number): number => C.tipRadius + (C.buttRadius - C.tipRadius) * (d / C.length);
    const buttStart = C.length * (1 - C.butt);
    const wrapStart = buttStart + (C.length - buttStart) * 0.35;
    const wrapEnd = buttStart + (C.length - buttStart) * 0.72;
    const parts: [number, number, Materials[keyof Materials]][] = [
      [0, C.tipLength, m.chalk], [C.tipLength, C.tipLength + C.ferruleLength, m.ferrule], [C.tipLength + C.ferruleLength, buttStart, m.cueShaft],
      [buttStart, wrapStart, m.cueButt], [wrapStart, wrapEnd, m.cueWrap], [wrapEnd, C.length, m.cueButt],
    ];
    for (const [from, to, material] of parts) {
      // Cylinders run along local y; the pivot lays the cue along -x (behind the ball for angle 0).
      const part = MeshBuilder.CreateCylinder('cuePart', { diameterTop: radiusAt(to) * 2, diameterBottom: radiusAt(from) * 2, height: to - from, tessellation: C.segments }, scene);
      part.position.y = (from + to) / 2;
      part.material = material as Mesh['material'];
      part.parent = this.pivot;
      part.isPickable = false;
      this.meshes.push(part);
    }
    this.pivot.rotation.z = Math.PI / 2;
    this.root.setEnabled(false);
  }

  update(pose: CuePose, ball: Vec2, table: readonly BallSnap[]): void {
    const visible = pose.visible && pose.alpha > 0;
    this.root.setEnabled(visible);
    if (!visible) return;
    const offset = CUE.maxOffset * R;
    const tipHeight = R + pose.vertical * offset;
    const elevation = cueElevation(ball, pose.angle, tipHeight, table);
    const dx = Math.cos(pose.angle);
    const dz = Math.sin(pose.angle);
    // The tip sits behind the ball surface, shifted sideways for english; right of the shot line is (dz, -dx)... seen from behind.
    const gap = Math.sqrt(Math.max(0, R * R - (pose.side * offset) ** 2 - (pose.vertical * offset) ** 2)) + C.address + pose.back;
    const sx = -dz * pose.side * offset;
    const sz = dx * pose.side * offset;
    this.root.position.set(ball.x - dx * gap * Math.cos(elevation) + sx, tipHeight + gap * Math.sin(elevation), ball.z - dz * gap * Math.cos(elevation) + sz);
    // Yaw so the butt points away from the shot, then raise the butt.
    this.root.rotation.set(0, -pose.angle, -elevation);
  }
}
