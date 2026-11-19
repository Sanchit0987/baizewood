import { MeshBuilder, TransformNode, type Mesh, type Scene } from '@babylonjs/core';
import { LOOK, TABLE_LOOK as T } from '../config/graphics';
import { TABLE } from '../config/table';
import { add, norm, perp, scale, sub, v2, type Vec2 } from '../math/vec2';
import { CUSHIONS, FOOT_SPOT, HALF_LENGTH, HALF_WIDTH, HEAD_SPOT, POCKETS } from '../table/geometry';
import { headings, polar, railInnerRadius, roundedRectRadius } from '../table/outline';
import { circle, Geo, type P3 } from './geo';
import type { Materials } from './materials';

export interface TableMeshes { root: TransformNode; casters: Mesh[]; receivers: Mesh[] }

const INNER_X = HALF_LENGTH + TABLE.cushionDepth;
const INNER_Z = HALF_WIDTH + TABLE.cushionDepth;
const OUTER_X = INNER_X + T.railWidth;
const OUTER_Z = INNER_Z + T.railWidth;
const at = (p: Vec2, y: number): P3 => [p.x, y, p.z];

/** The cloth bed with a hole at each pocket, and the dark pocket wells under it. */
function buildBed(scene: Scene, m: Materials): { bed: Mesh; wells: Mesh } {
  const bed = new Geo();
  // The cloth stops under the rails, well inside their rounded outer edge.
  const hx = INNER_X + T.railWidth / 2;
  const hz = INNER_Z + T.railWidth / 2;
  const rim = [v2(-hx, -hz), v2(hx, -hz), v2(hx, hz), v2(-hx, hz)];
  const holes = POCKETS.map((p) => circle(p.centre, p.radius, T.pocketSegments));
  bed.cap(rim, 0, true, (p) => [p.x * LOOK.feltTiling, p.z * LOOK.feltTiling], holes);
  const wells = new Geo();
  for (const hole of holes) {
    wells.wall(hole, -T.pocketDepth, 0, { closed: true, outward: false, smooth: true, tiling: 1 });
    wells.cap(hole, -T.pocketDepth, true, (p) => [p.x, p.z]);
  }
  return { bed: bed.toMesh('bed', scene, m.felt), wells: wells.toMesh('wells', scene, m.liner) };
}

/** Cloth-covered cushions: an undercut nose at ball height sloping back up to the rail. */
function buildCushions(scene: Scene, m: Materials): Mesh {
  const g = new Geo();
  const tile = LOOK.feltTiling;
  for (const o of CUSHIONS) {
    const inward = norm(perp(sub(o[1], o[0])));
    const centre = scale(add(add(o[0], o[1]), add(o[2], o[3])), 1 / 4);
    const back = Math.sign((centre.x - o[0].x) * inward.x + (centre.z - o[0].z) * inward.z) || 1;
    // `away` points from the nose toward the wooden rail.
    const away = scale(inward, back);
    const length = Math.hypot(o[1].x - o[0].x, o[1].z - o[0].z) * tile;
    const foot = [add(o[0], scale(away, T.noseUndercut)), add(o[1], scale(away, T.noseUndercut))];
    const top = [add(o[0], scale(away, T.noseTopInset)), add(o[1], scale(away, T.noseTopInset))];
    const toTable: P3 = [-away.x, 0, -away.z];
    g.quad(at(foot[0], 0), at(foot[1], 0), at(o[1], T.noseHeight), at(o[0], T.noseHeight), [toTable[0], -1, toTable[2]], [0, 0, length, 0.2]);
    g.quad(at(o[0], T.noseHeight), at(o[1], T.noseHeight), at(top[1], T.railTop), at(top[0], T.railTop), [toTable[0], 1, toTable[2]], [0, 0.2, length, 0.4]);
    g.quad(at(top[0], T.railTop), at(top[1], T.railTop), at(o[2], T.railTop), at(o[3], T.railTop), [0, 1, 0], [0, 0.4, length, 0.4 + TABLE.cushionDepth * tile]);
    // Jaw facings at both ends.
    for (const [nose, rear, footPoint, topPoint] of [[o[1], o[2], foot[1], top[1]], [o[0], o[3], foot[0], top[0]]] as const) {
      const out = sub(nose, centre);
      const toward: P3 = [out.x, 0, out.z];
      g.quad(at(footPoint, 0), at(nose, T.noseHeight), at(topPoint, T.railTop), at(rear, T.railTop), toward);
      g.quad(at(footPoint, 0), at(rear, T.railTop), at(rear, 0), at(rear, 0), toward);
    }
  }
  return g.toMesh('cushions', scene, m.felt);
}

/** Wooden rails: a ring between the pocket-scalloped inner edge and a rounded outer edge. */
function buildRails(scene: Scene, m: Materials): Mesh {
  const thetas = headings(0, Math.PI * 2, T.outlineSamples).slice(0, -1);
  const inner = thetas.map((t) => polar(t, railInnerRadius(t, INNER_X, INNER_Z, T.pocketRim)));
  const outer = thetas.map((t) => polar(t, roundedRectRadius(t, OUTER_X, OUTER_Z, T.railCorner)));
  const g = new Geo();
  const uv = (p: Vec2): readonly [number, number] => (Math.abs(p.z) * OUTER_X > Math.abs(p.x) * OUTER_Z ? [p.x * LOOK.woodTiling, p.z * LOOK.woodTiling] : [p.z * LOOK.woodTiling, p.x * LOOK.woodTiling]);
  g.cap(outer, T.railTop, true, uv, [inner]);
  g.wall(inner, 0, T.railTop, { closed: true, outward: false, smooth: true, tiling: LOOK.woodTiling, centre: v2() });
  g.wall(outer, -T.railSkirt, T.railTop, { closed: true, outward: true, smooth: true, tiling: LOOK.woodTiling, centre: v2() });
  return g.toMesh('rails', scene, m.rail);
}

/** Pearl sights on the rails (three between each pair of pockets) and the spots on the cloth. */
function buildMarkers(scene: Scene, m: Materials, root: TransformNode): void {
  const sight = MeshBuilder.CreateCylinder('sight', { diameter: T.diamondRadius * 2, height: T.plateThickness, tessellation: 12 }, scene);
  sight.material = m.pearl;
  sight.isPickable = false;
  sight.setEnabled(false);
  const put = (x: number, z: number, i: number): void => {
    const s = sight.createInstance(`sight${i}`);
    s.position.set(x, T.railTop + T.plateThickness / 2, z);
    s.parent = root;
    s.isPickable = false;
  };
  let n = 0;
  const quarters = 4;
  for (const side of [-1, 1]) {
    for (let i = 1; i < quarters * 2; i++) {
      if (i === quarters) continue; // the side pocket sits here
      put(-HALF_LENGTH + (i * HALF_LENGTH) / quarters, side * (INNER_Z + T.diamondOffset), n++);
    }
    for (let i = 1; i < quarters; i++) put(side * (INNER_X + T.diamondOffset), -HALF_WIDTH + (i * HALF_WIDTH * 2) / quarters, n++);
  }
  for (const [name, spot] of [['foot', FOOT_SPOT], ['head', HEAD_SPOT]] as const) {
    const dot = MeshBuilder.CreateDisc(`${name}Spot`, { radius: T.spotRadius, tessellation: 16 }, scene);
    dot.rotation.x = Math.PI / 2;
    dot.position.set(spot.x, T.plateThickness / 4, spot.z);
    dot.material = m.pearl;
    dot.isPickable = false;
    dot.parent = root;
  }
}

/** Brass plates round the back of each pocket, the cabinet under the rails and the legs. */
function buildBody(scene: Scene, m: Materials, root: TransformNode): Mesh[] {
  const plates = new Geo();
  for (const p of POCKETS) {
    const half = p.kind === 'corner' ? T.cornerPlate : T.sidePlate;
    const mid = Math.atan2(p.centre.z, p.centre.x);
    const thetas = headings(mid - half, mid + half, T.pocketSegments);
    const innerEdge = thetas.map((t) => polar(t, railInnerRadius(t, INNER_X, INNER_Z, T.pocketRim)));
    const outerEdge = thetas.map((t) => polar(t, roundedRectRadius(t, OUTER_X, OUTER_Z, T.railCorner)));
    const y = T.railTop + T.plateThickness;
    for (let i = 0; i < thetas.length - 1; i++) plates.quad(at(innerEdge[i], y), at(innerEdge[i + 1], y), at(outerEdge[i + 1], y), at(outerEdge[i], y), [0, 1, 0]);
  }
  const plateMesh = plates.toMesh('plates', scene, m.brass);

  const bx = OUTER_X - T.bodyInset;
  const bz = OUTER_Z - T.bodyInset;
  const cabinet = MeshBuilder.CreateBox('cabinet', { width: bx * 2, height: T.bodyHeight, depth: bz * 2 }, scene);
  cabinet.position.y = -T.railSkirt - T.bodyHeight / 2 + T.plateThickness;
  cabinet.material = m.body;
  const legHeight = T.height - T.railSkirt - T.bodyHeight;
  const legs: Mesh[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = MeshBuilder.CreateCylinder('leg', { diameterTop: T.legRadius * 2.4, diameterBottom: T.legRadius * 1.5, height: legHeight, tessellation: 20 }, scene);
      leg.position.set(sx * (bx - T.legInset), -T.height + legHeight / 2, sz * (bz - T.legInset));
      leg.material = m.body;
      legs.push(leg);
    }
  }
  for (const mesh of [plateMesh, cabinet, ...legs]) {
    mesh.parent = root;
    mesh.isPickable = false;
  }
  return [cabinet, ...legs];
}

/** Builds the whole visible table around the physics geometry. */
export function buildTable(scene: Scene, m: Materials): TableMeshes {
  const root = new TransformNode('table', scene);
  const { bed, wells } = buildBed(scene, m);
  const cushions = buildCushions(scene, m);
  const rails = buildRails(scene, m);
  for (const mesh of [bed, wells, cushions, rails]) mesh.parent = root;
  buildMarkers(scene, m, root);
  const body = buildBody(scene, m, root);
  return { root, casters: [cushions, rails, ...body], receivers: [bed, cushions, rails, wells] };
}
