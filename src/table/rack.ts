import { BALL, RACK } from '../config/table';
import type { Rng } from '../math/random';
import { dist, v2, type Vec2 } from '../math/vec2';
import { FOOT_SPOT, HEAD_SPOT, HALF_LENGTH, insideBed } from './geometry';

/** Position of one ball at rest. Pocketed balls keep their last position for reference only. */
export interface BallSnap {
  id: number;
  x: number;
  z: number;
  pocketed: boolean;
}

const ROW_SPACING = Math.sqrt(3) / 2;
const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * A legal 8-ball rack: apex on the foot spot, the 8 in the middle of the third row and one ball of
 * each group in the two back corners. Everything else is shuffled.
 */
export function rackOrder(rng: Rng): number[] {
  const solids = shuffle([...SOLIDS], rng);
  const stripes = shuffle([...STRIPES], rng);
  const cornerA = solids.pop()!;
  const cornerB = stripes.pop()!;
  const rest = shuffle([...solids, ...stripes], rng);
  const order: number[] = [];
  const total = (RACK.rows * (RACK.rows + 1)) / 2;
  const eightSlot = 4;
  const leftCorner = total - RACK.rows;
  const rightCorner = total - 1;
  const swap = rng.chance(0.5);
  for (let slot = 0; slot < total; slot++) {
    if (slot === eightSlot) order.push(BALL.eight);
    else if (slot === leftCorner) order.push(swap ? cornerB : cornerA);
    else if (slot === rightCorner) order.push(swap ? cornerA : cornerB);
    else order.push(rest.pop()!);
  }
  return order;
}

/** Racked object balls plus the cue ball on the head spot. */
export function rackTable(rng: Rng): BallSnap[] {
  const pitch = BALL.radius * 2 + RACK.gap;
  const order = rackOrder(rng);
  const balls: BallSnap[] = [{ id: BALL.cue, x: HEAD_SPOT.x, z: HEAD_SPOT.z, pocketed: false }];
  let slot = 0;
  for (let row = 0; row < RACK.rows; row++) {
    for (let i = 0; i <= row; i++) {
      balls.push({
        id: order[slot++],
        x: FOOT_SPOT.x + row * pitch * ROW_SPACING + rng.range(-RACK.jitter, RACK.jitter),
        z: (i - row / 2) * pitch + rng.range(-RACK.jitter, RACK.jitter),
        pocketed: false,
      });
    }
  }
  return balls.sort((a, b) => a.id - b.id);
}

/** True when a ball could be set down at p without touching another ball or a cushion. */
export function spotFree(balls: readonly BallSnap[], p: Vec2, ignore: number): boolean {
  if (!insideBed(p, BALL.radius)) return false;
  return balls.every((b) => b.pocketed || b.id === ignore || dist(b, p) >= BALL.radius * 2 + RACK.gap);
}

/** Nearest free spot to `want`, searching along the long axis toward the foot rail and then back. */
export function nearestSpot(balls: readonly BallSnap[], want: Vec2, ignore: number): Vec2 {
  for (let offset = 0; offset < HALF_LENGTH * 2; offset += RACK.spotStep) {
    for (const sign of [1, -1]) {
      const p = v2(want.x + sign * offset, want.z);
      if (spotFree(balls, p, ignore)) return p;
    }
  }
  return want;
}

export const cloneTable = (balls: readonly BallSnap[]): BallSnap[] => balls.map((b) => ({ ...b }));
export const ballOf = (balls: readonly BallSnap[], id: number): BallSnap => balls[id];
