import { Color4, Matrix, Scene, Vector3 } from '@babylonjs/core';
import { LIGHTS, QUALITY, ROOM, TABLE_LOOK, type Quality } from '../config/graphics';
import type { Vec2 } from '../math/vec2';
import type { BallSnap } from '../table/rack';
import { BallMeshes, type BallPose } from './balls';
import { CameraRig, type CameraShot } from './camera';
import { CueStick, type CuePose } from './cuestick';
import { createEngine, type EngineHandle, type RendererKind } from './engine';
import { AimGuide, type GuideState } from './guide';
import { Lighting } from './lighting';
import { createMaterials, disposeMaterials, type Materials } from './materials';
import { ModelLibrary } from './models';
import { PostFx } from './post';
import { buildRoom, PROP_MODELS, type RoomMeshes } from './room';
import { buildTable, type TableMeshes } from './tablemesh';

export interface RenderState {
  balls: readonly BallPose[];
  /** Table at rest, for cue clearance. */
  table: readonly BallSnap[];
  cue: CuePose;
  guide: GuideState | null;
  camera: CameraShot;
  /** Height the cue ball is lifted while being placed. */
  cueLift: number;
}

const CEILING_Y = ROOM.height - TABLE_LOOK.height;

/** Owns the Babylon scene and draws the frames the game hands it. */
export class GameView {
  readonly rig: CameraRig;
  readonly balls: BallMeshes;
  private readonly lighting: Lighting;
  private readonly post: PostFx;
  private readonly models: ModelLibrary;
  private readonly guide: AimGuide;
  private materials: Materials;
  private table: TableMeshes;
  private room: RoomMeshes;
  private cue: CueStick;
  private ballSet: BallMeshes;

  static async create(canvas: HTMLCanvasElement, quality: Quality, prefer: RendererKind | null): Promise<GameView> {
    const handle = await createEngine(canvas, prefer);
    const scene = new Scene(handle.engine);
    scene.useRightHandedSystem = true;
    scene.skipPointerMovePicking = true;
    scene.clearColor = new Color4(0.01, 0.012, 0.011, 1);
    const models = new ModelLibrary(scene);
    if (QUALITY[quality].props) await models.load(PROP_MODELS);
    const view = new GameView(handle, scene, models, quality);
    await scene.whenReadyAsync();
    return view;
  }

  private constructor(readonly handle: EngineHandle, readonly scene: Scene, models: ModelLibrary, private quality: Quality) {
    this.models = models;
    this.rig = new CameraRig(scene);
    scene.activeCamera = this.rig.camera;
    this.lighting = new Lighting(scene);
    this.post = new PostFx(scene, this.rig.camera);
    this.guide = new AimGuide(scene);
    const q = QUALITY[quality];
    this.materials = createMaterials(scene, q);
    this.table = buildTable(scene, this.materials);
    this.room = buildRoom(scene, this.materials, models, q);
    this.cue = new CueStick(scene, this.materials);
    this.ballSet = new BallMeshes(scene, this.materials, q.ballSegments);
    this.balls = this.ballSet;
    this.lighting.apply(q);
    this.wireShadows();
    this.post.apply(q);
    this.resize();
  }

  get renderer(): RendererKind { return this.handle.kind; }
  get fps(): number { return this.handle.engine.getFps(); }
  get currentQuality(): Quality { return this.quality; }

  private wireShadows(): void {
    // Furniture stands outside the pool of lamp light, so it is left out of the shadow maps.
    this.lighting.setCasters([...this.ballSet.meshes, ...this.cue.meshes, ...this.table.casters]);
    for (const mesh of [...this.table.receivers, ...this.room.receivers, ...this.ballSet.meshes]) mesh.receiveShadows = true;
  }

  /** Rebuilds everything that depends on the preset. The ball set keeps its orientations. */
  async setQuality(quality: Quality): Promise<void> {
    if (quality === this.quality) return;
    this.quality = quality;
    const q = QUALITY[quality];
    if (q.props) await this.models.load(PROP_MODELS);
    this.table.root.dispose(false, false);
    this.room.root.dispose(false, false);
    disposeMaterials(this.materials);
    this.materials = createMaterials(this.scene, q);
    this.table = buildTable(this.scene, this.materials);
    this.room = buildRoom(this.scene, this.materials, this.models, q);
    this.ballSet.meshes.forEach((mesh, id) => { mesh.material = this.materials.balls[id]; });
    for (const mesh of this.cue.meshes) mesh.dispose();
    this.cue = new CueStick(this.scene, this.materials);
    this.lighting.apply(q);
    this.wireShadows();
    this.post.apply(q);
    this.resize();
  }

  resize(): void {
    const engine = this.handle.engine;
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].maxPixelRatio));
    engine.resize();
    this.rig.setAspect(engine.getRenderWidth() / Math.max(1, engine.getRenderHeight()));
  }

  /** Screen position (CSS pixels) of a point on the table at height y. */
  project(p: Vec2, y = 0): { x: number; y: number; visible: boolean } {
    const rect = this.handle.canvas.getBoundingClientRect();
    const out = Vector3.Project(new Vector3(p.x, y, p.z), Matrix.Identity(), this.scene.getTransformMatrix(), this.rig.camera.viewport.toGlobal(rect.width, rect.height));
    return { x: out.x + rect.left, y: out.y + rect.top, visible: out.z > 0 && out.z < 1 };
  }

  /** Where the ray through a screen point meets the horizontal plane at `height`. */
  groundPoint(clientX: number, clientY: number, height = 0): Vec2 | null {
    const rect = this.handle.canvas.getBoundingClientRect();
    // Babylon takes canvas CSS pixels here and applies the hardware scaling itself.
    const ray = this.scene.createPickingRay(clientX - rect.left, clientY - rect.top, Matrix.Identity(), this.rig.camera);
    if (ray.direction.y >= 0) return null;
    const t = (height - ray.origin.y) / ray.direction.y;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }

  /** Draws one frame. `dt` is real seconds (0 while paused). */
  render(state: RenderState, dt: number): void {
    this.ballSet.update(state.balls, dt, state.cueLift);
    this.cue.update(state.cue, state.balls[0], state.table);
    this.guide.update(state.guide);
    this.rig.update(state.camera, dt);
    // From above the lamp or the ceiling, hide them so the top view sees the table.
    const height = this.rig.height;
    this.room.lamp.setEnabled(height < LIGHTS.lampHideHeight);
    this.room.ceiling.setEnabled(height < CEILING_Y);
    const flat = state.camera.kind === 'view' && state.camera.view === 'top';
    this.post.focus(this.rig.focusDistance, !flat);
    this.scene.render();
  }
}
