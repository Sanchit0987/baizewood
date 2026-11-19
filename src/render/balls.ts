import { MeshBuilder, Quaternion, type Mesh, type Scene } from '@babylonjs/core';
import { BALL_ART, BALL_FX } from '../config/graphics';
import { BALL } from '../config/table';
import { axisAngle, multiply, type Quat } from '../math/quat';
import { createRng } from '../math/random';
import { FULL_TURN, clamp01, type Vec2 } from '../math/vec2';
import { POCKETS } from '../table/geometry';
import type { Materials } from './materials';

export interface BallPose { x: number; z: number; q: Quat; pocketed: boolean }

interface Sink { from: Vec2; to: Vec2; t: number }

/** The sixteen ball meshes: follow the physics, and roll into the pocket when they drop. */
export class BallMeshes {
  readonly meshes: Mesh[] = [];
  private readonly base: Quat[] = [];
  private readonly sinks = new Map<number, Sink>();

  constructor(scene: Scene, materials: Materials, segments: number) {
    for (let id = 0; id < BALL.count; id++) {
      const mesh = MeshBuilder.CreateSphere(`ball${id}`, { diameter: BALL.radius * 2, segments }, scene);
      mesh.rotationQuaternion = Quaternion.Identity();
      mesh.material = materials.balls[id];
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.meshes.push(mesh);
      this.base.push({ x: 0, y: 0, z: 0, w: 1 });
    }
    this.shuffle(BALL_ART.seed);
  }

  /** Gives every ball a fresh resting orientation: number roughly up, turned at random. */
  shuffle(seed: number): void {
    const rng = createRng(seed);
    // The number discs are painted on the local z axis; a quarter turn about x brings one to the top.
    const numberUp = axisAngle(1, 0, 0, -Math.PI / 2);
    for (let id = 0; id < BALL.count; id++) {
      const heading = rng.range(0, FULL_TURN);
      const tilt = axisAngle(Math.cos(heading), 0, Math.sin(heading), rng.range(0, BALL_ART.tilt));
      this.base[id] = multiply(tilt, multiply(axisAngle(0, 1, 0, rng.range(0, FULL_TURN)), numberUp));
    }
    this.sinks.clear();
  }

  /** Starts the drop animation of a ball into a pocket. */
  sink(id: number, from: Vec2, pocket: number): void {
    this.sinks.set(id, { from: { x: from.x, z: from.z }, to: POCKETS[pocket].centre, t: 0 });
  }

  update(poses: readonly BallPose[], dt: number, cueLift: number): void {
    for (let id = 0; id < poses.length; id++) {
      const pose = poses[id];
      const mesh = this.meshes[id];
      const sink = this.sinks.get(id);
      if (pose.pocketed) {
        if (!sink) {
          mesh.setEnabled(false);
          continue;
        }
        sink.t += dt / BALL_FX.sinkSeconds;
        if (sink.t >= 1) {
          this.sinks.delete(id);
          mesh.setEnabled(false);
          continue;
        }
        const k = clamp01(sink.t);
        mesh.setEnabled(true);
        mesh.position.set(sink.from.x + (sink.to.x - sink.from.x) * k, BALL.radius - BALL_FX.sinkDepth * k * k, sink.from.z + (sink.to.z - sink.from.z) * k);
        continue;
      }
      this.sinks.delete(id);
      mesh.setEnabled(true);
      mesh.position.set(pose.x, BALL.radius + (id === BALL.cue ? cueLift : 0), pose.z);
      const q = multiply(pose.q, this.base[id]);
      mesh.rotationQuaternion!.set(q.x, q.y, q.z, q.w);
    }
  }
}
