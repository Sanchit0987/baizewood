import { HDRCubeTexture, HemisphericLight, ShadowGenerator, SpotLight, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';
import { LIGHTS, type QualityPreset } from '../config/graphics';
import { linear } from './colour';
import { assetUrl } from './textures';

const HDRI = 'hdri/billiard_hall.hdr';

/** HDRI reflections, a dim fill and the three lamp lights over the table with soft shadows. */
export class Lighting {
  private readonly lamps: SpotLight[] = [];
  private shadows: ShadowGenerator[] = [];
  private casters: AbstractMesh[] = [];
  private environment: HDRCubeTexture | null = null;

  constructor(private readonly scene: Scene) {
    const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
    fill.intensity = LIGHTS.fillIntensity;
    fill.diffuse = linear(LIGHTS.fillColour);
    fill.groundColor = linear(LIGHTS.fillGround);
    fill.specular.set(0, 0, 0);
    // Centre lamp first: it is the one that keeps its shadows on the lowest preset.
    for (const i of [0, -1, 1]) {
      const lamp = new SpotLight(`lamp${i}`, new Vector3(i * LIGHTS.lampSpacing, LIGHTS.lampHeight, 0), new Vector3(0, -1, 0), LIGHTS.lampAngle, LIGHTS.lampExponent, scene);
      lamp.diffuse = linear(LIGHTS.lampColour);
      lamp.specular = lamp.diffuse;
      lamp.intensity = i === 0 ? LIGHTS.lampIntensity : LIGHTS.sideLampIntensity;
      lamp.range = LIGHTS.lampRange;
      lamp.shadowMinZ = LIGHTS.shadowNear;
      lamp.shadowMaxZ = LIGHTS.shadowFar;
      this.lamps.push(lamp);
    }
  }

  setCasters(meshes: readonly AbstractMesh[]): void {
    this.casters = [...meshes];
    for (const gen of this.shadows) gen.getShadowMap()!.renderList = [...this.casters];
  }

  /** (Re)builds environment and shadow maps for a quality preset: blurred PCF, or PCSS on high. */
  apply(q: QualityPreset): void {
    this.environment?.dispose();
    this.environment = new HDRCubeTexture(assetUrl(HDRI), this.scene, q.environmentSize, false, true, false, true);
    this.scene.environmentTexture = this.environment;
    this.scene.environmentIntensity = LIGHTS.environmentIntensity;
    for (const gen of this.shadows) gen.dispose();
    this.shadows = this.lamps.slice(0, q.shadowLights).map((lamp) => {
      const gen = new ShadowGenerator(q.shadowMapSize, lamp);
      gen.bias = LIGHTS.shadowBias;
      gen.normalBias = LIGHTS.shadowNormalBias;
      gen.darkness = LIGHTS.shadowDarkness;
      if (q.contactHardening) {
        gen.useContactHardeningShadow = true;
        gen.contactHardeningLightSizeUVRatio = LIGHTS.shadowSoftness;
        gen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      } else {
        gen.usePercentageCloserFiltering = true;
        gen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
      }
      gen.getShadowMap()!.renderList = [...this.casters];
      return gen;
    });
  }
}
