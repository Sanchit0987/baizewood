import { AI } from '../config/ai';
import { BALL } from '../config/table';
import type { Rng } from '../math/random';
import { addScaled, norm, sub, v2, type Vec2 } from '../math/vec2';
import type { BallInHand } from '../rules/eightball';
import { HEAD_SPOT, HEAD_STRING_X, POCKETS, pocketTarget } from '../table/geometry';
import { nearestSpot, spotFree, type BallSnap } from '../table/rack';
import { listCandidates } from './candidates';

/** True when the cue ball may be set down at p under the given ball-in-hand rule. */
export function placementLegal(table: readonly BallSnap[], p: Vec2, rule: BallInHand): boolean {
  if (rule === 'none') return false;
  if (rule === 'kitchen' && p.x > HEAD_STRING_X) return false;
  return spotFree(table, p, BALL.cue);
}

const withCue = (table: readonly BallSnap[], p: Vec2): BallSnap[] => table.map((b) => (b.id === BALL.cue ? { id: b.id, x: p.x, z: p.z, pocketed: false } : b));

/** Cue ball position for the break: on the head string, a little to one side. */
export function breakSpot(rng: Rng): Vec2 {
  return v2(HEAD_STRING_X, (rng.chance(0.5) ? 1 : -1) * rng.range(0, AI.breakOffset));
}

/**
 * Best place for the cue ball with ball in hand: straight behind a target ball on its line to a
 * pocket, at the distance that gives the most forgiving shot.
 */
export function choosePlacement(table: readonly BallSnap[], targets: readonly number[], rule: BallInHand, allowBanks: boolean): Vec2 {
  let best: { p: Vec2; tolerance: number } | null = null;
  for (const id of targets) {
    const ball = table[id];
    for (const pocket of POCKETS) {
      const back = norm(sub(ball, pocketTarget(pocket, AI.pocketDepth)));
      for (const distance of AI.handDistances) {
        const p = addScaled(ball, back, distance);
        if (!placementLegal(table, p, rule)) continue;
        const shot = listCandidates(withCue(table, p), [id], false).find((c) => c.pocket === pocket.index);
        if (shot && (!best || shot.tolerance > best.tolerance)) best = { p, tolerance: shot.tolerance };
      }
    }
  }
  if (best) return best.p;
  // Nothing lines up (kitchen only, or every line blocked): take the spot with the best shot of a coarse grid.
  const fallback = nearestSpot(table, HEAD_SPOT, BALL.cue);
  let pick = fallback;
  let tolerance = listCandidates(withCue(table, fallback), targets, allowBanks)[0]?.tolerance ?? 0;
  for (const dz of [-AI.breakOffset * 2, -AI.breakOffset, AI.breakOffset, AI.breakOffset * 2]) {
    const p = v2(HEAD_STRING_X, dz);
    if (!placementLegal(table, p, rule)) continue;
    const t = listCandidates(withCue(table, p), targets, allowBanks)[0]?.tolerance ?? 0;
    if (t > tolerance) {
      tolerance = t;
      pick = p;
    }
  }
  return pick;
}

export { withCue };
