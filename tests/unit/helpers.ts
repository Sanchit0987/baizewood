import { BALL } from '../../src/config/table';
import type { BallSnap } from '../../src/table/rack';

/** A table with only the listed balls on it; everything else is pocketed. */
export function tableWith(placed: Record<number, [number, number]>): BallSnap[] {
  return Array.from({ length: BALL.count }, (_, id) => {
    const p = placed[id];
    return p ? { id, x: p[0], z: p[1], pocketed: false } : { id, x: 0, z: 0, pocketed: true };
  });
}
