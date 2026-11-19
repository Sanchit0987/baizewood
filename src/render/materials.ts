import { PBRMaterial, StandardMaterial, type BaseTexture, type Scene } from '@babylonjs/core';
import { CUE_LOOK, LOOK, type QualityPreset } from '../config/graphics';
import { BALL } from '../config/table';
import { linear } from './colour';
import { ballTexture, feltTextures, loadSet, rugTexture, type TextureSet } from './textures';

const SHELL_LIGHTS = 6;

export interface Materials {
  felt: PBRMaterial;
  rail: PBRMaterial;
  body: PBRMaterial;
  floor: PBRMaterial;
  rug: PBRMaterial;
  wall: PBRMaterial;
  wainscot: PBRMaterial;
  ceiling: PBRMaterial;
  liner: PBRMaterial;
  brass: PBRMaterial;
  pearl: PBRMaterial;
  shade: PBRMaterial;
  bulb: StandardMaterial;
  balls: PBRMaterial[];
  cueShaft: PBRMaterial;
  cueButt: PBRMaterial;
  cueWrap: PBRMaterial;
  ferrule: PBRMaterial;
  chalk: PBRMaterial;
  all: (PBRMaterial | StandardMaterial)[];
}

function pbr(scene: Scene, name: string, colour: string, roughness: number, metallic = 0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = linear(colour);
  m.roughness = roughness;
  m.metallic = metallic;
  return m;
}

/** Poly Haven normal maps use the OpenGL convention; the scene is right-handed. */
function setNormal(m: PBRMaterial, texture: BaseTexture, strength = 1): void {
  m.bumpTexture = texture;
  texture.level = strength;
  m.invertNormalMapX = false;
  m.invertNormalMapY = true;
}

function textured(scene: Scene, name: string, set: TextureSet, tint: string): PBRMaterial {
  const m = pbr(scene, name, tint, 1);
  m.albedoTexture = set.albedo;
  setNormal(m, set.normal);
  m.metallicTexture = set.arm;
  m.useAmbientOcclusionFromMetallicTextureRed = true;
  m.useRoughnessFromMetallicTextureGreen = true;
  m.useMetallnessFromMetallicTextureBlue = true;
  m.metallic = 1;
  return m;
}

/** Builds every material of the scene. Procedural meshes are drawn two-sided so their winding never matters. */
export function createMaterials(scene: Scene, q: QualityPreset): Materials {
  const a = q.anisotropy;

  // Felt: fibre normal map plus a cloth sheen at grazing angles.
  const cloth = feltTextures(scene, a);
  const felt = pbr(scene, 'felt', LOOK.felt, LOOK.feltRoughness);
  felt.albedoTexture = cloth.albedo;
  setNormal(felt, cloth.normal);
  felt.sheen.isEnabled = true;
  felt.sheen.intensity = LOOK.feltSheen;
  felt.sheen.color = linear(LOOK.felt).scale(2);
  felt.specularIntensity = LOOK.feltSpecular;

  // Polished rails: veneer under a clear lacquer coat.
  const rail = textured(scene, 'rail', loadSet(scene, 'rosewood_veneer1', 1, a), LOOK.railTint);
  rail.clearCoat.isEnabled = true;
  [rail.clearCoat.intensity, rail.clearCoat.roughness] = LOOK.railCoat;
  const body = textured(scene, 'body', loadSet(scene, 'dark_wood', 1, a), LOOK.bodyTint);
  body.clearCoat.isEnabled = true;
  [body.clearCoat.intensity, body.clearCoat.roughness] = LOOK.bodyCoat;
  const wainscot = textured(scene, 'wainscot', loadSet(scene, 'dark_wood', 1, a), LOOK.wainscotTint);
  const floor = textured(scene, 'floor', loadSet(scene, 'herringbone_parquet', 1, a), '#ffffff');
  floor.clearCoat.isEnabled = true;
  [floor.clearCoat.intensity, floor.clearCoat.roughness] = LOOK.floorCoat;
  const wall = textured(scene, 'wall', loadSet(scene, 'painted_plaster_wall', 1, a), LOOK.wallTint);

  const rug = pbr(scene, 'rug', '#ffffff', 1);
  rug.albedoTexture = rugTexture(scene);
  rug.sheen.isEnabled = true;
  rug.sheen.intensity = LOOK.rugSheen;
  const ceiling = pbr(scene, 'ceiling', LOOK.ceiling, 1);
  const liner = pbr(scene, 'liner', LOOK.liner, LOOK.linerRoughness);
  const brass = pbr(scene, 'brass', LOOK.brass, LOOK.brassRoughness, 1);
  const pearl = pbr(scene, 'pearl', LOOK.pearl, LOOK.pearlRoughness);
  pearl.clearCoat.isEnabled = true;
  const shade = pbr(scene, 'shade', LOOK.shade, LOOK.shadeRoughness);
  shade.clearCoat.isEnabled = true;
  const bulb = new StandardMaterial('bulb', scene);
  bulb.disableLighting = true;
  bulb.emissiveColor = linear(LOOK.bulb).scale(LOOK.bulbGlow);

  // Phenolic resin: almost mirror-smooth with a clear coat for the sharp lamp highlights.
  const balls = Array.from({ length: BALL.count }, (_, id) => {
    const m = pbr(scene, `ball${id}`, '#ffffff', LOOK.ballRoughness);
    m.albedoTexture = ballTexture(scene, id);
    m.albedoTexture.anisotropicFilteringLevel = a;
    m.clearCoat.isEnabled = true;
    m.clearCoat.roughness = LOOK.ballCoatRoughness;
    return m;
  });

  const cueShaft = pbr(scene, 'cueShaft', CUE_LOOK.shaft, 0.4);
  cueShaft.clearCoat.isEnabled = true;
  cueShaft.clearCoat.roughness = 0.2;
  const cueButt = pbr(scene, 'cueButt', CUE_LOOK.buttColour, 0.3);
  cueButt.clearCoat.isEnabled = true;
  const cueWrap = pbr(scene, 'cueWrap', CUE_LOOK.wrap, 0.9);
  const ferrule = pbr(scene, 'ferrule', CUE_LOOK.ferrule, 0.3);
  // Chalked leather tip: fully rough, powdery blue.
  const chalk = pbr(scene, 'chalk', LOOK.chalk, 1);

  for (const m of [felt, rail, body, floor, rug, wall, wainscot, ceiling, liner, brass, pearl, shade]) m.backFaceCulling = false;
  // The room shell is also lit by the wall sconces, on top of the fill and the three lamps.
  for (const m of [floor, wall, wainscot, ceiling]) m.maxSimultaneousLights = SHELL_LIGHTS;
  const all = [felt, rail, body, floor, rug, wall, wainscot, ceiling, liner, brass, pearl, shade, bulb, ...balls, cueShaft, cueButt, cueWrap, ferrule, chalk];
  return { felt, rail, body, floor, rug, wall, wainscot, ceiling, liner, brass, pearl, shade, bulb, balls, cueShaft, cueButt, cueWrap, ferrule, chalk, all };
}

export function disposeMaterials(m: Materials): void {
  for (const mat of m.all) mat.dispose(true, true);
}
