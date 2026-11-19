import { BALL } from '../config/table';
import type { Seat } from '../config/rules';
import type { Rng } from '../math/random';
import type { Vec2 } from '../math/vec2';
import type { Shot } from '../physics/strike';
import type { Impact, PoolWorld } from '../physics/world';
import { evaluateShot, groupOf, newRules, type RuleOptions, type RulesState, type Verdict } from '../rules/eightball';
import { emptyOutcome, trackImpacts, type ShotOutcome } from '../sim/shot';
import { FOOT_SPOT, HEAD_SPOT, HEAD_STRING_X } from '../table/geometry';
import { nearestSpot, rackTable, spotFree, type BallSnap } from '../table/rack';

export type FramePhase = 'aiming' | 'rolling' | 'over';

export interface SeatTally { potted: number; fouls: number; run: number; bestRun: number; shots: number }
export interface FrameOptions extends RuleOptions {
  breaker: Seat;
  /** Practice: no turns, fouls or winner; the cue ball is always free to move and the rack resets when cleared. */
  practice: boolean;
}

const tally = (): SeatTally => ({ potted: 0, fouls: 0, run: 0, bestRun: 0, shots: 0 });

/**
 * One frame of 8-ball without any rendering: owns the physics world, the rules state and the
 * life cycle of a shot. Used by the game and by headless tests alike.
 */
export class Frame {
  phase: FramePhase = 'aiming';
  rules: RulesState;
  /** The table at rest (valid outside `rolling`). */
  table: BallSnap[];
  /** Object balls in the order they dropped, with who was at the table. */
  readonly tray: { id: number; by: Seat }[] = [];
  readonly tallies: [SeatTally, SeatTally] = [tally(), tally()];
  lastVerdict: Verdict | null = null;
  shots = 0;
  private outcome: ShotOutcome = emptyOutcome();
  private called: number | null = null;

  constructor(readonly world: PoolWorld, private readonly rng: Rng, readonly options: FrameOptions) {
    this.rules = newRules(options.breaker);
    this.table = rackTable(rng);
    world.load(this.table);
  }

  /** True when the cue ball may be picked up and moved. */
  get cueFree(): boolean {
    return this.phase === 'aiming' && (this.options.practice || this.rules.ballInHand !== 'none');
  }

  canPlace(p: Vec2): boolean {
    if (!this.cueFree) return false;
    if (!this.options.practice && this.rules.ballInHand === 'kitchen' && p.x > HEAD_STRING_X) return false;
    return spotFree(this.table, p, BALL.cue);
  }

  /** Moves the cue ball (ball in hand). Returns false when the spot is not allowed. */
  placeCue(p: Vec2): boolean {
    if (!this.canPlace(p)) return false;
    this.world.place(BALL.cue, p);
    this.table = this.world.snapshot();
    return true;
  }

  shoot(shot: Shot, called: number | null): void {
    if (this.phase !== 'aiming') return;
    this.outcome = emptyOutcome();
    this.called = called;
    this.shots++;
    this.tallies[this.rules.turn].shots++;
    this.world.strike(shot);
    this.phase = 'rolling';
  }

  /** Advances the physics one fixed step. Returns the impacts, and settles the shot when everything stops. */
  step(): Impact[] {
    if (this.phase !== 'rolling') return [];
    const impacts = this.world.step();
    trackImpacts(this.outcome, impacts);
    if (!this.world.moving) this.settle();
    return impacts;
  }

  /** Stops every ball where it is and settles the shot (used when a shot runs past the time limit). */
  forceSettle(): void {
    if (this.phase !== 'rolling') return;
    for (const b of this.world.snapshot()) if (!b.pocketed) this.world.place(b.id, b);
    this.settle();
  }

  private settle(): void {
    const shooter = this.rules.turn;
    const before = this.table;
    const verdict = this.options.practice ? this.practiceVerdict() : evaluateShot(this.rules, before, this.outcome, this.called, this.options);
    const t = this.tallies[shooter];
    const pots = this.outcome.pocketed.filter((p) => p.id !== BALL.eight || verdict.state.winner !== null);
    for (const p of pots) this.tray.push({ id: p.id, by: shooter });
    if (verdict.foul) {
      t.fouls++;
      t.run = 0;
    } else {
      const group = verdict.state.groups[shooter];
      const own = pots.filter((p) => group === null || groupOf(p.id) === group || p.id === BALL.eight).length;
      t.potted += own;
      t.run = verdict.keepsTurn || verdict.state.winner === shooter ? t.run + own : 0;
      t.bestRun = Math.max(t.bestRun, t.run);
    }
    if (verdict.respotEight) this.world.place(BALL.eight, nearestSpot(this.world.snapshot(), FOOT_SPOT, BALL.eight));
    if (this.world.isPocketed(BALL.cue)) this.world.place(BALL.cue, nearestSpot(this.world.snapshot(), HEAD_SPOT, BALL.cue));
    if (this.options.practice && this.world.snapshot().every((b) => b.pocketed || b.id === BALL.cue)) {
      this.world.load(rackTable(this.rng));
      this.tray.length = 0;
    }
    this.table = this.world.snapshot();
    this.rules = verdict.state;
    this.lastVerdict = verdict;
    this.phase = verdict.state.winner !== null ? 'over' : 'aiming';
  }

  private practiceVerdict(): Verdict {
    return { state: { ...this.rules, breaking: false, ballInHand: 'anywhere' }, foul: null, keepsTurn: true, assigned: null, respotEight: false };
  }
}
