import { FreeCamera, Vector3, type Scene } from '@babylonjs/core';
import { CAMERA, ROOM, TABLE_LOOK } from '../config/graphics';
import { TABLE } from '../config/table';
import { approach, clamp, type Vec2 } from '../math/vec2';
import { HALF_LENGTH, HALF_WIDTH } from '../table/geometry';

export type CameraView = 'cue' | 'free' | 'top';
type P3 = readonly [number, number, number];

export type CameraShot =
  | { kind: 'menu' }
  /** A player-controlled view. `watching` widens the cue view while balls roll. */
  | { kind: 'view'; view: CameraView; aim: number; subject: Vec2; watching: boolean }
  /** A fixed camera; a change of `cut` jumps instead of easing. */
  | { kind: 'fixed'; position: P3; target: P3; cut: number };

const RAIL = TABLE.cushionDepth + TABLE_LOOK.railWidth;
const WATCH = CAMERA.watch;

/** Cue view behind the cue ball, free orbit round the table, top-down view and fixed cuts. */
export class CameraRig {
  readonly camera: FreeCamera;
  freeYaw: number = CAMERA.free.yaw;
  freePitch: number = CAMERA.free.pitch;
  freeDistance: number = CAMERA.free.distance;
  cuePitch: number = CAMERA.cue.pitch;
  cueDistance: number = CAMERA.cue.distance;
  private readonly position = new Vector3(0, 2, 3);
  private readonly target = new Vector3();
  private readonly wantPosition = new Vector3();
  private readonly wantTarget = new Vector3();
  private aspect = 1;
  private cut = -1;
  private snap = true;
  private top = false;
  private menuYaw: number = CAMERA.free.yaw;

  constructor(scene: Scene) {
    this.camera = new FreeCamera('camera', this.position.clone(), scene);
    this.camera.minZ = CAMERA.near;
    this.camera.maxZ = CAMERA.far;
    this.camera.fov = CAMERA.fov;
    this.camera.inputs.clear();
  }

  /** Widens the field of view on narrow (portrait) screens. */
  setAspect(aspect: number): void {
    this.aspect = aspect;
    const half = Math.tan(CAMERA.fov / 2) * Math.max(1, CAMERA.wideAspect / aspect);
    this.camera.fov = Math.min(CAMERA.maxFov, 2 * Math.atan(half));
  }

  get portrait(): boolean { return this.aspect < 1; }

  /** Drag in the free view. */
  orbit(dx: number, dy: number): void {
    this.freeYaw += dx * CAMERA.orbitSensitivity;
    this.freePitch = clamp(this.freePitch + dy * CAMERA.orbitSensitivity, CAMERA.free.minPitch, CAMERA.free.maxPitch);
  }

  /** Vertical drag in the cue view raises or lowers the camera. */
  tilt(dy: number): void {
    this.cuePitch = clamp(this.cuePitch + dy * CAMERA.orbitSensitivity, CAMERA.cue.minPitch, CAMERA.cue.maxPitch);
  }

  zoom(factor: number, view: CameraView): void {
    if (view === 'cue') this.cueDistance = clamp(this.cueDistance * factor, CAMERA.cue.minDistance, CAMERA.cue.maxDistance);
    else if (view === 'free') this.freeDistance = clamp(this.freeDistance * factor, CAMERA.free.minDistance, CAMERA.free.maxDistance);
  }

  jump(): void { this.snap = true; }

  /** Height from which the whole table fits the screen, with the long axis along the longer screen side. */
  private topHeight(): number {
    const t = Math.tan(this.camera.fov / 2);
    const long = HALF_LENGTH + RAIL + CAMERA.topMargin;
    const short = HALF_WIDTH + RAIL + CAMERA.topMargin;
    const [vertical, horizontal] = this.portrait ? [long, short] : [short, long];
    return Math.max((vertical * CAMERA.topPadding) / t, horizontal / (t * this.aspect));
  }

  private orbitPose(centre: Vec2, lookY: number, yaw: number, pitch: number, distance: number): void {
    const flat = Math.cos(pitch) * distance;
    this.wantTarget.set(centre.x, lookY, centre.z);
    this.wantPosition.set(centre.x - Math.cos(yaw) * flat, lookY + Math.sin(pitch) * distance, centre.z - Math.sin(yaw) * flat);
  }

  update(shot: CameraShot, dt: number): void {
    let hard = this.snap;
    let rate: number = CAMERA.followRate;
    let top = false;
    if (shot.kind === 'fixed') {
      hard ||= shot.cut !== this.cut;
      this.cut = shot.cut;
      this.wantPosition.set(shot.position[0], shot.position[1], shot.position[2]);
      this.wantTarget.set(shot.target[0], shot.target[1], shot.target[2]);
    } else {
      hard ||= this.cut !== -1;
      this.cut = -1;
      if (shot.kind === 'menu') {
        this.menuYaw += CAMERA.menuOrbitSpeed * dt;
        this.orbitPose({ x: 0, z: 0 }, 0, this.menuYaw, CAMERA.menuPitch, CAMERA.menuDistance);
      } else if (shot.view === 'top') {
        // Portrait: foot of the table at the top of the screen. Landscape: head on the left.
        const shift = this.portrait ? -CAMERA.topPortraitShift : 0;
        this.wantTarget.set(shift, 0, 0);
        this.wantPosition.set(shift, this.topHeight(), 0);
        top = true;
      } else if (shot.view === 'free') {
        this.orbitPose({ x: 0, z: 0 }, 0, this.freeYaw, this.freePitch, this.freeDistance);
      } else {
        const c = CAMERA.cue;
        let distance = this.cueDistance;
        let pitch = this.cuePitch;
        let centre = { x: shot.subject.x + Math.cos(shot.aim) * distance * c.lead, z: shot.subject.z + Math.sin(shot.aim) * distance * c.lead };
        if (shot.watching) {
          distance *= WATCH.distance;
          pitch = Math.min(c.maxPitch, pitch + WATCH.pitch);
          centre = { x: centre.x * (1 - WATCH.centre), z: centre.z * (1 - WATCH.centre) };
        } else {
          // Aiming must feel direct: follow the aim tightly.
          rate *= CAMERA.aimRateBoost;
        }
        this.orbitPose(centre, c.lookHeight, shot.aim, pitch, distance);
      }
    }
    // Stay inside the room.
    const wallX = ROOM.halfLength - CAMERA.wallClearance;
    const wallZ = ROOM.halfWidth - CAMERA.wallClearance;
    this.wantPosition.x = clamp(this.wantPosition.x, -wallX, wallX);
    this.wantPosition.z = clamp(this.wantPosition.z, -wallZ, wallZ);
    this.wantPosition.y = Math.max(this.wantPosition.y, CAMERA.floorClearance - TABLE_LOOK.height);
    // Looking straight down needs an explicit screen-up: +x on portrait screens, -z otherwise.
    if (top !== this.top) hard = true;
    this.top = top;
    if (!top) this.camera.upVector.set(0, 1, 0);
    else if (this.portrait) this.camera.upVector.set(1, 0, 0);
    else this.camera.upVector.set(0, 0, -1);
    const k = hard ? 1 : approach(dt, rate);
    Vector3.LerpToRef(this.position, this.wantPosition, k, this.position);
    Vector3.LerpToRef(this.target, this.wantTarget, k, this.target);
    this.snap = false;
    this.camera.position.copyFrom(this.position);
    this.camera.setTarget(this.target);
  }

  /** Distance from the camera to the point it looks at. */
  get focusDistance(): number { return Vector3.Distance(this.position, this.target); }
  get height(): number { return this.position.y; }
}
