import { RULES, type Group, type Seat } from '../config/rules';
import { BALL } from '../config/table';
import type { ShotOutcome } from '../sim/shot';
import type { BallSnap } from '../table/rack';

export type Foul = 'scratch' | 'noHit' | 'wrongBall' | 'noRail' | 'illegalBreak';
export type EndReason = 'eightPotted' | 'eightEarly' | 'eightFoul' | 'eightWrongPocket';
/** Where the incoming player may put the cue ball. */
export type BallInHand = 'none' | 'anywhere' | 'kitchen';

export interface RulesState {
  turn: Seat;
  breaking: boolean;
  groups: [Group | null, Group | null];
  ballInHand: BallInHand;
  winner: Seat | null;
  endReason: EndReason | null;
}

export interface RuleOptions {
  /** The shooter must name the pocket for the 8-ball. */
  callEight: boolean;
}

export interface Verdict {
  state: RulesState;
  foul: Foul | null;
  keepsTurn: boolean;
  /** Group given to the shooter by this shot, if any. */
  assigned: Group | null;
  /** The 8 went down on the break and returns to the foot spot. */
  respotEight: boolean;
}

export const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
export const otherGroup = (g: Group): Group => (g === 'solids' ? 'stripes' : 'solids');

export function groupOf(id: number): Group | null {
  if (id === BALL.cue || id === BALL.eight) return null;
  return id <= BALL.lastSolid ? 'solids' : 'stripes';
}

export const newRules = (breaker: Seat): RulesState => ({
  turn: breaker, breaking: true, groups: [null, null], ballInHand: 'kitchen', winner: null, endReason: null,
});

/** Balls of a group still on the table. */
export function remaining(table: readonly BallSnap[], group: Group): number[] {
  return table.filter((b) => !b.pocketed && groupOf(b.id) === group).map((b) => b.id);
}

/** True when the player to shoot has cleared their group and is on the 8. */
export function onEight(state: RulesState, table: readonly BallSnap[]): boolean {
  const group = state.groups[state.turn];
  return group !== null && remaining(table, group).length === 0;
}

/** Balls the cue ball may legally touch first. */
export function legalTargets(state: RulesState, table: readonly BallSnap[]): number[] {
  const up = table.filter((b) => !b.pocketed && b.id !== BALL.cue).map((b) => b.id);
  if (state.breaking) return up;
  const group = state.groups[state.turn];
  if (group === null) {
    const open = up.filter((id) => id !== BALL.eight);
    return open.length > 0 ? open : up;
  }
  const own = remaining(table, group);
  return own.length > 0 ? own : up.filter((id) => id === BALL.eight);
}

function findFoul(state: RulesState, before: readonly BallSnap[], outcome: ShotOutcome): Foul | null {
  if (outcome.cuePocketed) return 'scratch';
  if (outcome.firstHit === null) return 'noHit';
  if (!legalTargets(state, before).includes(outcome.firstHit)) return 'wrongBall';
  if (outcome.pocketed.length > 0) return null;
  if (state.breaking) return outcome.railBalls.length < RULES.breakRailBalls ? 'illegalBreak' : null;
  return outcome.railAfterContact ? null : 'noRail';
}

/**
 * Applies one shot to the rules. `before` is the table when the shot was played and `called`
 * the pocket named for the 8-ball (or null).
 */
export function evaluateShot(state: RulesState, before: readonly BallSnap[], outcome: ShotOutcome, called: number | null, options: RuleOptions): Verdict {
  const shooter = state.turn;
  const foul = findFoul(state, before, outcome);
  const eight = outcome.pocketed.find((p) => p.id === BALL.eight);
  const others = outcome.pocketed.filter((p) => p.id !== BALL.eight);
  const next: RulesState = { ...state, groups: [...state.groups], breaking: false, ballInHand: 'none' };
  const verdict: Verdict = { state: next, foul, keepsTurn: false, assigned: null, respotEight: false };

  if (eight && !state.breaking) {
    let reason: EndReason = 'eightPotted';
    if (!onEight(state, before)) reason = 'eightEarly';
    else if (foul) reason = 'eightFoul';
    else if (options.callEight && called !== eight.pocket) reason = 'eightWrongPocket';
    next.winner = reason === 'eightPotted' ? shooter : other(shooter);
    next.endReason = reason;
    return verdict;
  }
  verdict.respotEight = eight !== undefined;

  const ownGroup = state.groups[shooter];
  if (!foul && !state.breaking && ownGroup === null && others.length > 0) {
    const group = groupOf(others[0].id)!;
    next.groups[shooter] = group;
    next.groups[other(shooter)] = otherGroup(group);
    verdict.assigned = group;
  }
  if (!foul) {
    verdict.keepsTurn = ownGroup === null ? others.length > 0 : others.some((p) => groupOf(p.id) === ownGroup);
  } else {
    next.ballInHand = state.breaking && foul === 'scratch' ? 'kitchen' : 'anywhere';
  }
  next.turn = verdict.keepsTurn ? shooter : other(shooter);
  return verdict;
}
