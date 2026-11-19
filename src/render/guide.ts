import { MeshBuilder, StandardMaterial, type Mesh, type Scene } from '@babylonjs/core';
import { GUIDE, type GuideLevel } from '../config/graphics';
import { BALL } from '../config/table';
import { addScaled, type Vec2 } from '../math/vec2';
import type { AimPrediction } from '../sim/predict';
import { linear } from './colour';

export interface GuideState {
  origin: Vec2;
  dir: Vec2;
  prediction: AimPrediction;
  level: GuideLevel;
  /** False when the first ball on the line may not be hit first: the guide turns red. */
  legal: boolean;
  /** Free run of the object ball and of the deflected cue ball before a cushion, metres. */
  objectReach: number;
  cueReach: number;
}

const R = BALL.radius;

/** Aim guide drawn on the cloth: cue-ball path, ghost ball at first contact and both deflection lines. */
export class AimGuide {
  private readonly path: Mesh;
  private readonly object: Mesh;
  private readonly deflect: Mesh;
  private readonly ghost: Mesh;
  private readonly white: StandardMaterial;
  private readonly gold: StandardMaterial;
  private readonly red: StandardMaterial;

  constructor(scene: Scene) {
    const material = (name: string, colour: string): StandardMaterial => {
      const m = new StandardMaterial(name, scene);
      m.disableLighting = true;
      m.emissiveColor = linear(colour);
      m.alpha = GUIDE.opacity;
      m.backFaceCulling = false;
      return m;
    };
    this.white = material('guideWhite', GUIDE.colour);
    this.gold = material('guideGold', GUIDE.objectColour);
    this.red = material('guideRed', GUIDE.illegalColour);
    const strip = (name: string): Mesh => {
      // A unit strip along +x lying on the cloth, centred on its own origin.
      const mesh = MeshBuilder.CreateGround(name, { width: 1, height: GUIDE.width }, scene);
      mesh.isPickable = false;
      mesh.setEnabled(false);
      return mesh;
    };
    this.path = strip('guidePath');
    this.object = strip('guideObject');
    this.deflect = strip('guideDeflect');
    this.ghost = MeshBuilder.CreateTorus('guideGhost', { diameter: R * 2 - GUIDE.ghostThickness, thickness: GUIDE.ghostThickness, tessellation: GUIDE.ringSegments }, scene);
    this.ghost.scaling.y = 0.1;
    this.ghost.isPickable = false;
    this.ghost.setEnabled(false);
  }

  private lay(mesh: Mesh, from: Vec2, dir: Vec2, length: number, material: StandardMaterial): void {
    const on = length > GUIDE.width;
    mesh.setEnabled(on);
    if (!on) return;
    mesh.material = material;
    mesh.scaling.x = length;
    mesh.position.set(from.x + (dir.x * length) / 2, GUIDE.lift, from.z + (dir.z * length) / 2);
    mesh.rotation.y = -Math.atan2(dir.z, dir.x);
  }

  update(state: GuideState | null): void {
    if (!state) {
      for (const mesh of [this.path, this.object, this.deflect, this.ghost]) mesh.setEnabled(false);
      return;
    }
    const { origin, dir, prediction: p, level } = state;
    const main = state.legal ? this.white : this.red;
    const start = addScaled(origin, dir, R);
    if (level === 'off') {
      this.lay(this.path, start, dir, Math.min(GUIDE.offStub, Math.max(0, p.distance - R)), this.white);
      for (const mesh of [this.object, this.deflect, this.ghost]) mesh.setEnabled(false);
      return;
    }
    this.lay(this.path, start, dir, Math.max(0, p.distance - R * 2), main);
    this.ghost.setEnabled(p.kind !== 'none');
    this.ghost.material = main;
    this.ghost.position.set(p.contact.x, GUIDE.lift, p.contact.z);
    const lengths = level === 'full' ? GUIDE.full : GUIDE.short;
    if (p.kind === 'ball' && p.ball !== null && p.objectDir) {
      this.lay(this.object, addScaled(p.objectStart ?? p.contact, p.objectDir, R), p.objectDir, Math.min(state.objectReach, lengths.object * Math.max(0.25, p.objectShare)), state.legal ? this.gold : this.red);
      if (p.cueDir) this.lay(this.deflect, p.contact, p.cueDir, Math.min(state.cueReach, lengths.cue * Math.max(0.2, 1 - p.objectShare)), main);
      else this.deflect.setEnabled(false);
    } else {
      this.object.setEnabled(false);
      if (p.kind === 'cushion' && p.cueDir) this.lay(this.deflect, p.contact, p.cueDir, Math.min(state.cueReach, lengths.cue), main);
      else this.deflect.setEnabled(false);
    }
  }
}
