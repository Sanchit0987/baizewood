import { AI } from '../config/ai';
import { CLOTH, CONTACT, CUE, PHYSICS } from '../config/physics';
import { BALL, TABLE } from '../config/table';
import { add, angleOf, clamp, dist, dot, fromAngle, norm, scale, sub, v2, type Vec2 } from '../math/vec2';
import { speedToPower } from '../physics/strike';
import { contactResult, pathClear } from '../sim/predict';
import { POCKETS, RAILS, pocketTarget, type Pocket } from '../table/geometry';
import type { BallSnap } from '../table/rack';

export type CandidateKind = 'direct' | 'bank';

/** One way to pocket a ball, from geometry alone. */
export interface Candidate {
  kind: CandidateKind;
  ball: number;
  pocket: number;
  /** Centre of the cue ball at contact. */
  ghost: Vec2;
  angle: number;
  cut: number;
  cueDistance: number;
  objectDistance: number;
  /** Aim error (radians) that still pockets the ball, estimated from the pocket opening. */
  tolerance: number;
}

const R = BALL.radius;
const D = R * 2;
const ROLL_DECEL = CLOTH.roll * PHYSICS.gravity;
const mouthOf = (p: Pocket): number => (p.kind === 'corner' ? TABLE.corner.mouth : TABLE.side.mouth);

/** Contact point that sends the object ball along `want`, corrected for throw. */
export function ghostFor(cue: Vec2, ball: Vec2, want: Vec2): Vec2 {
  let n = want;
  for (let i = 0; i < AI.throwIterations; i++) {
    const ghost = sub(ball, scale(n, D));
    const got = norm(contactResult(norm(sub(ghost, cue)), n).object);
    const error = Math.atan2(got.x * want.z - got.z * want.x, dot(got, want));
    n = fromAngle(angleOf(n) + error);
  }
  return sub(ball, scale(n, D));
}

function build(kind: CandidateKind, table: readonly BallSnap[], id: number, pocket: Pocket, aimPoint: Vec2, travel: number, slop: number): Candidate | null {
  const cue = table[BALL.cue];
  const ball = table[id];
  const want = norm(sub(aimPoint, ball));
  const ghost = ghostFor(cue, ball, want);
  const toGhost = sub(ghost, cue);
  const cueDistance = Math.hypot(toGhost.x, toGhost.z);
  if (cueDistance < CONTACT.slack) return null;
  const cut = Math.acos(clamp(dot(norm(toGhost), norm(sub(ball, ghost))), -1, 1));
  if (cut > AI.maxCut) return null;
  if (!pathClear(table, cue, ghost, [BALL.cue, id])) return null;
  const tolerance = (slop * D * Math.cos(cut)) / (travel * Math.max(cueDistance, D));
  return { kind, ball: id, pocket: pocket.index, ghost, angle: angleOf(toGhost), cut, cueDistance, objectDistance: travel, tolerance };
}

function direct(table: readonly BallSnap[], id: number, pocket: Pocket): Candidate | null {
  const ball = table[id];
  const target = pocketTarget(pocket, AI.pocketDepth);
  const line = sub(target, ball);
  const travel = Math.hypot(line.x, line.z);
  const entry = dot(norm(line), pocket.axis);
  const slop = (mouthOf(pocket) * entry - D) / 2 + AI.jawSlop;
  if (slop <= 0 || travel < R) return null;
  if (!pathClear(table, ball, target, [BALL.cue, id])) return null;
  return build('direct', table, id, pocket, target, travel, slop);
}

/** One-cushion bank: aim the object ball at the pocket mirrored in the line a ball centre bounces on. */
function banks(table: readonly BallSnap[], id: number, pocket: Pocket): Candidate[] {
  const ball = table[id];
  const target = pocketTarget(pocket, AI.pocketDepth);
  const out: Candidate[] = [];
  for (const rail of RAILS) {
    const line = rail.at - Math.sign(rail.at) * R;
    if (Math.abs(target[rail.axis] - rail.at) < D) continue; // the pocket sits on this rail
    const mirrored = rail.axis === 'x' ? v2(2 * line - target.x, target.z) : v2(target.x, 2 * line - target.z);
    const t = (line - ball[rail.axis]) / (mirrored[rail.axis] - ball[rail.axis]);
    if (!(t > 0 && t < 1)) continue;
    const bounce = add(ball, scale(sub(mirrored, ball), t));
    if (POCKETS.some((p) => dist(p.mouth, bounce) < AI.bankMouthClearance)) continue;
    const entry = dot(norm(sub(target, bounce)), pocket.axis);
    const slop = ((mouthOf(pocket) * entry - D) / 2 + AI.jawSlop) * AI.bankFactor;
    if (slop <= 0) continue;
    if (!pathClear(table, ball, bounce, [BALL.cue, id]) || !pathClear(table, bounce, target, [BALL.cue, id])) continue;
    const c = build('bank', table, id, pocket, mirrored, dist(ball, bounce) + dist(bounce, target), slop);
    if (c) out.push(c);
  }
  return out;
}

/** Every geometric way to pocket one of `targets`, most forgiving first. */
export function listCandidates(table: readonly BallSnap[], targets: readonly number[], allowBanks: boolean): Candidate[] {
  const out: Candidate[] = [];
  for (const id of targets) {
    for (const pocket of POCKETS) {
      const d = direct(table, id, pocket);
      if (d) out.push(d);
      if (allowBanks) out.push(...banks(table, id, pocket));
    }
  }
  return out.sort((a, b) => b.tolerance - a.tolerance);
}

/** Chance of making a shot whose makeable aim window has the given half-width, for a player with aim error sigma. */
export function potChance(halfWidth: number, sigma: number): number {
  if (halfWidth <= 0) return 0;
  return erf(halfWidth / (Math.max(sigma, Number.EPSILON) * Math.SQRT2));
}

/** Abramowitz-Stegun 7.1.26 approximation of the error function. */
export function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return Math.sign(x) * (1 - poly * Math.exp(-x * x));
}

/** Softest power that carries the object ball to the pocket with a little pace left. */
export function minimumPower(c: Candidate): number {
  // Rolling distance d needs v^2 = v_end^2 + 2 a d; the object ball gets cos(cut) of the cue speed,
  // and both lose roughly 2/7 of their speed sliding into natural roll.
  const rollLoss = 1 / (1 - CONTACT.moment / (1 + CONTACT.moment));
  const objectSpeed = Math.sqrt(AI.arrivalSpeed ** 2 + 2 * ROLL_DECEL * c.objectDistance) * rollLoss;
  const atContact = objectSpeed / Math.max(Math.cos(c.cut), 1 - Math.sin(AI.maxCut));
  const cueSpeed = Math.sqrt(atContact ** 2 + 2 * ROLL_DECEL * c.cueDistance);
  return clamp(speedToPower(Math.min(cueSpeed, CUE.maxSpeed)), AI.minPower, AI.maxPower);
}

/** Best pot chance available on a table for a set of target balls: a measure of how good a position is. */
export function bestChance(table: readonly BallSnap[], targets: readonly number[], sigma: number, allowBanks: boolean): number {
  const best = listCandidates(table, targets, allowBanks)[0];
  return best ? potChance(best.tolerance, sigma) : 0;
}
