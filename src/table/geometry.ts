import { TABLE } from '../config/table';
import { DEG, add, norm, scale, sub, v2, type Vec2 } from '../math/vec2';

export type PocketKind = 'corner' | 'side';

export interface Pocket {
  index: number;
  kind: PocketKind;
  /** Centre of the hole: a ball whose centre comes within `radius` of it drops. */
  centre: Vec2;
  radius: number;
  /** Middle of the opening between the two cushion noses. */
  mouth: Vec2;
  /** Unit vector pointing from the table into the pocket. */
  axis: Vec2;
}

export interface Segment { a: Vec2; b: Vec2 }

export const HALF_LENGTH = TABLE.length / 2;
export const HALF_WIDTH = TABLE.width / 2;
export const HEAD_STRING_X = HALF_LENGTH * TABLE.headString;
export const FOOT_SPOT: Vec2 = v2(HALF_LENGTH * TABLE.footSpot, 0);
export const HEAD_SPOT: Vec2 = v2(HEAD_STRING_X, 0);

/** Distance from a corner to where each cushion nose ends. */
const CORNER_CUT = TABLE.corner.mouth / Math.SQRT2;
const SIDE_CUT = TABLE.side.mouth / 2;
const CORNER_ADVANCE = TABLE.cushionDepth / Math.tan(TABLE.corner.facingDegrees * DEG);
const SIDE_ADVANCE = TABLE.cushionDepth / Math.tan(TABLE.side.facingDegrees * DEG);

const flip = (points: Vec2[], sx: number, sz: number): Vec2[] => {
  const out = points.map((p) => v2(p.x * sx, p.z * sz));
  // A single mirror reverses the winding; keep every outline counter-clockwise seen from above (+y).
  return sx * sz < 0 ? out.reverse() : out;
};

/**
 * The six cushions as convex plan-view outlines. Each starts with its nose edge (points 0 -> 1),
 * followed by the jaw facing, the back edge and the other facing.
 */
export function cushionOutlines(): Vec2[][] {
  const d = TABLE.cushionDepth;
  // Long-rail cushion on the -z side, between the -x corner pocket and the side pocket.
  const long: Vec2[] = [
    v2(-SIDE_CUT, -HALF_WIDTH),
    v2(-HALF_LENGTH + CORNER_CUT, -HALF_WIDTH),
    v2(-HALF_LENGTH + CORNER_CUT - CORNER_ADVANCE, -HALF_WIDTH - d),
    v2(-SIDE_CUT + SIDE_ADVANCE, -HALF_WIDTH - d),
  ];
  // End-rail cushion on the -x side.
  const end: Vec2[] = [
    v2(-HALF_LENGTH, -HALF_WIDTH + CORNER_CUT),
    v2(-HALF_LENGTH, HALF_WIDTH - CORNER_CUT),
    v2(-HALF_LENGTH - d, HALF_WIDTH - CORNER_CUT + CORNER_ADVANCE),
    v2(-HALF_LENGTH - d, -HALF_WIDTH + CORNER_CUT - CORNER_ADVANCE),
  ];
  return [long, flip(long, -1, 1), flip(long, 1, -1), flip(long, -1, -1), end, flip(end, -1, 1)];
}

function cornerPocket(index: number, sx: number, sz: number): Pocket {
  const o = TABLE.corner.centreOffset;
  return {
    index,
    kind: 'corner',
    centre: v2(sx * (HALF_LENGTH + o), sz * (HALF_WIDTH + o)),
    radius: TABLE.corner.radius,
    mouth: v2(sx * (HALF_LENGTH - CORNER_CUT / 2), sz * (HALF_WIDTH - CORNER_CUT / 2)),
    axis: norm(v2(sx, sz)),
  };
}

function sidePocket(index: number, sz: number): Pocket {
  return {
    index,
    kind: 'side',
    centre: v2(0, sz * (HALF_WIDTH + TABLE.side.centreOffset)),
    radius: TABLE.side.radius,
    mouth: v2(0, sz * HALF_WIDTH),
    axis: v2(0, sz),
  };
}

/** Pockets in reading order seen from above: three along -z, then three along +z. */
export const POCKETS: readonly Pocket[] = [
  cornerPocket(0, -1, -1), sidePocket(1, -1), cornerPocket(2, 1, -1),
  cornerPocket(3, -1, 1), sidePocket(4, 1), cornerPocket(5, 1, 1),
];

export const CUSHIONS: readonly (readonly Vec2[])[] = cushionOutlines();

/** Every cushion edge a ball can touch: noses and jaw facings. */
export const CUSHION_SEGMENTS: readonly Segment[] = CUSHIONS.flatMap((c) => [
  { a: c[0], b: c[1] }, { a: c[1], b: c[2] }, { a: c[3], b: c[0] },
]);

/** The four straight nose lines as (axis, sign) for mirror constructions (banks and kicks). */
export const RAILS: readonly { axis: 'x' | 'z'; at: number }[] = [
  { axis: 'z', at: -HALF_WIDTH }, { axis: 'z', at: HALF_WIDTH }, { axis: 'x', at: -HALF_LENGTH }, { axis: 'x', at: HALF_LENGTH },
];

/** Index of the pocket that swallows a ball centred at p, or -1. */
export function pocketAt(p: Vec2): number {
  for (const pocket of POCKETS) {
    const dx = p.x - pocket.centre.x;
    const dz = p.z - pocket.centre.z;
    if (dx * dx + dz * dz < pocket.radius * pocket.radius) return pocket.index;
  }
  return -1;
}

/** True when a ball centre lies on the bed with room for the ball (used for placing the cue ball). */
export function insideBed(p: Vec2, margin: number): boolean {
  return Math.abs(p.x) <= HALF_LENGTH - margin && Math.abs(p.z) <= HALF_WIDTH - margin;
}

/** Point in the pocket to aim an object ball at: the mouth pushed a little toward the hole. */
export function pocketTarget(pocket: Pocket, depth: number): Vec2 {
  return add(pocket.mouth, scale(norm(sub(pocket.centre, pocket.mouth)), depth));
}
