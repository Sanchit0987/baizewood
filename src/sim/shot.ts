import { PHYSICS } from '../config/physics';
import { BALL } from '../config/table';
import type { Shot } from '../physics/strike';
import type { Impact, PoolWorld } from '../physics/world';
import type { BallSnap } from '../table/rack';

/** Everything the rules need to know about one shot. */
export interface ShotOutcome {
  /** First ball the cue ball touched, or null. */
  firstHit: number | null;
  /** Balls that dropped, in order, with the pocket index. */
  pocketed: { id: number; pocket: number }[];
  cuePocketed: boolean;
  /** A ball touched a cushion after the cue ball's first contact. */
  railAfterContact: boolean;
  /** Object balls that touched a cushion at any time (for the break). */
  railBalls: number[];
  /** Cushions the cue ball touched before its first ball contact. */
  cueRailsBeforeHit: number;
}

export const emptyOutcome = (): ShotOutcome => ({ firstHit: null, pocketed: [], cuePocketed: false, railAfterContact: false, railBalls: [], cueRailsBeforeHit: 0 });

/** Folds the impacts of one physics step into the outcome. */
export function trackImpacts(outcome: ShotOutcome, impacts: readonly Impact[]): void {
  for (const i of impacts) {
    if (i.kind === 'ball') {
      if (outcome.firstHit === null && (i.a === BALL.cue || i.b === BALL.cue)) outcome.firstHit = i.a === BALL.cue ? i.b : i.a;
    } else if (i.kind === 'cushion') {
      if (outcome.firstHit !== null) outcome.railAfterContact = true;
      else if (i.a === BALL.cue) outcome.cueRailsBeforeHit++;
      if (i.a !== BALL.cue && !outcome.railBalls.includes(i.a)) outcome.railBalls.push(i.a);
    } else if (i.a === BALL.cue) {
      outcome.cuePocketed = true;
    } else {
      outcome.pocketed.push({ id: i.a, pocket: i.b });
    }
  }
}

export interface ShotResult { outcome: ShotOutcome; table: BallSnap[]; seconds: number }

/** Plays a shot to rest on a world that already holds the table. */
export function runShot(world: PoolWorld, shot: Shot, maxSeconds: number = PHYSICS.maxShotSeconds): ShotResult {
  const outcome = emptyOutcome();
  world.strike(shot);
  const start = world.time;
  while (world.moving && world.time - start < maxSeconds) trackImpacts(outcome, world.step());
  return { outcome, table: world.snapshot(), seconds: world.time - start };
}
