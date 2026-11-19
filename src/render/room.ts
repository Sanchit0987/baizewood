import { MeshBuilder, PointLight, TransformNode, Vector3, type AbstractMesh, type Mesh, type Scene } from '@babylonjs/core';
import { LIGHTS, LOOK, ROOM, TABLE_LOOK, type QualityPreset } from '../config/graphics';
import { v2, type Vec2 } from '../math/vec2';
import { linear } from './colour';
import { Geo } from './geo';
import type { Materials } from './materials';
import type { ModelLibrary } from './models';

export interface RoomMeshes {
  root: TransformNode;
  /** The pendant lamp, hidden when the camera looks down from above it. */
  lamp: TransformNode;
  ceiling: Mesh;
  casters: AbstractMesh[];
  receivers: AbstractMesh[];
  /** Meshes lit by the wall sconces. */
  shell: Mesh[];
}

const FLOOR_Y = -TABLE_LOOK.height;
const TRIM = 0.025;

export interface PropSpec { model: string; x: number; z: number; y: number; turn: number; scale: number }
const HX = ROOM.halfLength;
const HZ = ROOM.halfWidth;
/** CC0 furniture round the room. `y` is height above the floor, `turn` a rotation about the vertical. */
export const PROPS: readonly PropSpec[] = [
  { model: 'bar_chair_round_01', x: -1.5, z: -HZ + 0.6, y: 0, turn: 0.4, scale: 1 },
  { model: 'bar_chair_round_01', x: -0.7, z: -HZ + 0.5, y: 0, turn: -0.3, scale: 1 },
  { model: 'side_table_tall_01', x: -1.1, z: -HZ + 0.3, y: 0, turn: 0, scale: 1 },
  { model: 'potted_plant_04', x: -1.1, z: -HZ + 0.3, y: 0.76, turn: 1, scale: 1.3 },
  { model: 'ArmChair_01', x: HX - 0.8, z: HZ - 0.9, y: 0, turn: -2.3, scale: 1 },
  { model: 'ArmChair_01', x: HX - 0.8, z: -HZ + 0.9, y: 0, turn: -0.8, scale: 1 },
  { model: 'vintage_grandfather_clock_01', x: -HX + 0.3, z: 1.6, y: 0.12, turn: Math.PI / 2, scale: 1 },
  { model: 'dartboard', x: -HX + 0.03, z: -1.2, y: 1.73, turn: Math.PI / 2, scale: 1 },
  { model: 'fancy_picture_frame_01', x: 0.9, z: HZ - 0.03, y: 1.75, turn: Math.PI, scale: 1.6 },
  { model: 'fancy_picture_frame_01', x: -1.2, z: HZ - 0.03, y: 1.75, turn: Math.PI, scale: 1.2 },
];
export const PROP_MODELS: readonly string[] = [...new Set(PROPS.map((p) => p.model))];

function buildShell(scene: Scene, m: Materials, root: TransformNode): { floor: Mesh; rug: Mesh; walls: Mesh; wainscot: Mesh; ceiling: Mesh } {
  const corners: Vec2[] = [v2(-HX, -HZ), v2(HX, -HZ), v2(HX, HZ), v2(-HX, HZ)];
  const floorGeo = new Geo();
  floorGeo.cap(corners, FLOOR_Y, true, (p) => [p.x * LOOK.floorTiling, p.z * LOOK.floorTiling]);
  const rugGeo = new Geo();
  const [rx, rz] = ROOM.rug;
  rugGeo.cap([v2(-rx / 2, -rz / 2), v2(rx / 2, -rz / 2), v2(rx / 2, rz / 2), v2(-rx / 2, rz / 2)], FLOOR_Y + TRIM / 5, true, (p) => [p.x / rx + 0.5, p.z / rz + 0.5]);
  const wallGeo = new Geo();
  wallGeo.wall(corners, FLOOR_Y + ROOM.wainscot, FLOOR_Y + ROOM.height, { closed: true, outward: false, smooth: false, tiling: LOOK.wallTiling, centre: v2() });
  const panelGeo = new Geo();
  const inset = corners.map((p) => v2(p.x - Math.sign(p.x) * TRIM, p.z - Math.sign(p.z) * TRIM));
  panelGeo.wall(inset, FLOOR_Y, FLOOR_Y + ROOM.wainscot, { closed: true, outward: false, smooth: false, tiling: LOOK.floorTiling * 2, centre: v2() });
  // Dado rail capping the panelling.
  const cap = corners.map((p) => v2(p.x - Math.sign(p.x) * TRIM * 2, p.z - Math.sign(p.z) * TRIM * 2));
  panelGeo.wall(cap, FLOOR_Y + ROOM.wainscot - TRIM * 2, FLOOR_Y + ROOM.wainscot, { closed: true, outward: false, smooth: false, tiling: 1, centre: v2() });
  panelGeo.cap(corners, FLOOR_Y + ROOM.wainscot, true, (p) => [p.x, p.z], [cap]);
  const ceilGeo = new Geo();
  ceilGeo.cap(corners, FLOOR_Y + ROOM.height, false, (p) => [p.x, p.z]);
  const out = {
    floor: floorGeo.toMesh('floor', scene, m.floor), rug: rugGeo.toMesh('rug', scene, m.rug), walls: wallGeo.toMesh('walls', scene, m.wall),
    wainscot: panelGeo.toMesh('wainscot', scene, m.wainscot), ceiling: ceilGeo.toMesh('ceiling', scene, m.ceiling),
  };
  for (const mesh of Object.values(out)) mesh.parent = root;
  return out;
}

/** A brass bar hung from the ceiling carrying three enamel shades over the table. */
function buildLamp(scene: Scene, m: Materials, root: TransformNode): { lamp: TransformNode; meshes: Mesh[] } {
  const lamp = new TransformNode('lamp', scene);
  lamp.parent = root;
  const barY = LIGHTS.lampHeight + ROOM.shadeHeight + ROOM.barRadius * 3;
  const meshes: Mesh[] = [];
  const add = (mesh: Mesh, x: number, y: number, z = 0): Mesh => {
    mesh.position.set(x, y, z);
    mesh.parent = lamp;
    mesh.isPickable = false;
    meshes.push(mesh);
    return mesh;
  };
  const bar = MeshBuilder.CreateCylinder('lampBar', { diameter: ROOM.barRadius * 2, height: LIGHTS.lampSpacing * 2 + ROOM.shadeRadius * 2, tessellation: 12 }, scene);
  bar.rotation.z = Math.PI / 2;
  bar.material = m.brass;
  add(bar, 0, barY);
  const rodLength = ROOM.height - TABLE_LOOK.height - barY;
  for (const sx of [-1, 1]) {
    const rod = MeshBuilder.CreateCylinder('lampRod', { diameter: ROOM.barRadius, height: rodLength, tessellation: 8 }, scene);
    rod.material = m.brass;
    add(rod, sx * LIGHTS.lampSpacing * 0.6, barY + rodLength / 2);
  }
  for (const i of [-1, 0, 1]) {
    const x = i * LIGHTS.lampSpacing;
    const shade = MeshBuilder.CreateCylinder('shade', { diameterTop: ROOM.shadeTop * 2, diameterBottom: ROOM.shadeRadius * 2, height: ROOM.shadeHeight, tessellation: 32, cap: 1 }, scene);
    shade.material = m.shade;
    add(shade, x, LIGHTS.lampHeight + ROOM.shadeHeight / 2);
    const stem = MeshBuilder.CreateCylinder('shadeStem', { diameter: ROOM.barRadius * 2.4, height: ROOM.barRadius * 3, tessellation: 10 }, scene);
    stem.material = m.brass;
    add(stem, x, LIGHTS.lampHeight + ROOM.shadeHeight + ROOM.barRadius * 1.5);
    const bulb = MeshBuilder.CreateSphere('bulb', { diameter: ROOM.shadeTop * 1.5, segments: 12 }, scene);
    bulb.material = m.bulb;
    add(bulb, x, LIGHTS.lampHeight + ROOM.shadeHeight * 0.45);
  }
  return { lamp, meshes };
}

/** Glowing wall lights on the two long walls; each also lights the room shell a little. */
function buildSconces(scene: Scene, m: Materials, root: TransformNode, shell: Mesh[]): void {
  for (const [i, [x, sz]] of ([[-2.2, -1], [2.2, -1], [-2.2, 1], [2.2, 1]] as const).entries()) {
    const y = FLOOR_Y + ROOM.wainscot + ROOM.sconceHeight;
    const z = sz * (HZ - ROOM.sconceRadius * 1.6);
    const globe = MeshBuilder.CreateSphere(`sconce${i}`, { diameter: ROOM.sconceRadius * 2, segments: 12 }, scene);
    globe.material = m.bulb;
    globe.position.set(x, y, z);
    const plate = MeshBuilder.CreateCylinder(`sconcePlate${i}`, { diameter: ROOM.sconceRadius * 1.6, height: ROOM.sconceRadius * 1.4, tessellation: 12 }, scene);
    plate.material = m.brass;
    plate.rotation.x = Math.PI / 2;
    plate.position.set(x, y - ROOM.sconceRadius * 0.6, sz * (HZ - ROOM.sconceRadius * 0.7));
    for (const mesh of [globe, plate]) {
      mesh.parent = root;
      mesh.isPickable = false;
    }
    // One light per long wall keeps every material within its light budget.
    if (x > 0) continue;
    const light = new PointLight(`sconceLight${i}`, new Vector3(0, y + 0.2, sz * (HZ - 0.5)), scene);
    light.diffuse = linear(LIGHTS.lampColour);
    light.specular = light.diffuse.scale(0.2);
    light.intensity = LOOK.sconceGlow;
    light.includedOnlyMeshes = shell;
    light.parent = root;
  }
}

function placeProps(models: ModelLibrary, root: TransformNode): AbstractMesh[] {
  const meshes: AbstractMesh[] = [];
  PROPS.forEach((spec, i) => {
    const node = models.create(spec.model, `prop${i}`);
    if (!node) return;
    node.parent = root;
    node.position.set(spec.x, FLOOR_Y + spec.y, spec.z);
    node.rotation.y = spec.turn;
    node.scaling.setAll(spec.scale);
    for (const mesh of node.getChildMeshes()) {
      mesh.isPickable = false;
      meshes.push(mesh);
    }
  });
  return meshes;
}

/** The back room: floor, rug, panelled walls, ceiling, the pendant lamp, sconces and furniture. */
export function buildRoom(scene: Scene, m: Materials, models: ModelLibrary, q: QualityPreset): RoomMeshes {
  const root = new TransformNode('room', scene);
  const shell = buildShell(scene, m, root);
  const shellMeshes = [shell.floor, shell.walls, shell.wainscot, shell.ceiling];
  const { lamp } = buildLamp(scene, m, root);
  buildSconces(scene, m, root, shellMeshes);
  const props = q.props ? placeProps(models, root) : [];
  return { root, lamp, ceiling: shell.ceiling, casters: props, receivers: [shell.floor, shell.rug], shell: shellMeshes };
}
