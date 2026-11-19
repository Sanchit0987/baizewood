import { AI, SAFETY, type Persona } from '../config/ai';
import { BALL } from '../config/table';
import type { Rng } from '../math/random';
import { angleOf, clamp, dist, norm, perp, scale, sub, add, v2, type Vec2 } from '../math/vec2';
import type { Shot } from '../physics/strike';
import type { PoolWorld } from '../physics/world';
import { evaluateShot, legalTargets, type RuleOptions, type RulesState, type Verdict } from '../rules/eightball';
import { pathClear } from '../sim/predict';
import { runShot } from '../sim/shot';
import { RAILS } from '../table/geometry';
import type { BallSnap } from '../table/rack';
import { bestChance, listCandidates, minimumPower, potChance, type Candidate } from './candidates';
import { breakSpot, choosePlacement, withCue } from './place';

export type PlanKind = 'break' | 'pot' | 'bank' | 'safety' | 'hit';

export interface Plan {
  kind: PlanKind;
  /** Where to put the cue ball first (ball in hand), or null. */
  placement: Vec2 | null;
  /** The shot the player intends. */
  ideal: Shot;
  /** The shot actually played: the ideal with this player's aim and power error. */
  shot: Shot;
  ball: number | null;
  /** Pocket called (always set for the 8-ball). */
  pocket: number | null;
  /** Estimated chance of pocketing the ball, 0..1. */
  chance: number;
}

export interface PlanContext {
  table: readonly BallSnap[];
  rules: RulesState;
  options: RuleOptions;
  persona: Persona;
  rng: Rng;
  /** A private world to simulate in; its contents are overwritten. */
  world: PoolWorld;
}

interface Trial { verdict: Verdict; table: BallSnap[]; made: boolean }
interface Scored { shot: Shot; value: number; chance: number; candidate: Candidate }

const R = BALL.radius;
const stroke = (angle: number, power: number, vertical = 0): Shot => ({ angle, power: clamp(power, AI.minPower, 1), side: 0, vertical });

/** Adds the player's unsteadiness to an intended shot. */
export function withError(ideal: Shot, persona: Persona, rng: Rng): Shot {
  return { ...ideal, angle: ideal.angle + rng.gaussian(persona.aimSigma), power: clamp(ideal.power * (1 + rng.gaussian(persona.powerSigma)), AI.minPower, 1) };
}

function simulate(ctx: PlanContext, table: readonly BallSnap[], shot: Shot, candidate: Candidate | null): Trial {
  ctx.world.load(table);
  const result = runShot(ctx.world, shot, AI.simSeconds);
  const called = candidate ? candidate.pocket : null;
  const verdict = evaluateShot(ctx.rules, table, result.outcome, called, ctx.options);
  const me = ctx.rules.turn;
  const potted = candidate !== null && result.outcome.pocketed.some((p) => p.id === candidate.ball && p.pocket === candidate.pocket);
  const made = potted && verdict.foul === null && (verdict.state.winner === null ? verdict.keepsTurn : verdict.state.winner === me);
  return { verdict, table: result.table, made };
}

/** Finds the aim window of a candidate by simulation, then the best power and spin for position. */
function* scoreCandidate(ctx: PlanContext, table: readonly BallSnap[], c: Candidate): Generator<void, Scored | null> {
  const { persona } = ctx;
  const base = clamp(minimumPower(c) + persona.powerBias, AI.minPower, AI.maxPower);
  const step = clamp(c.tolerance / 2, AI.minStep, AI.maxStep);
  const made: number[] = [];
  for (const offset of AI.windowOffsets) {
    if (simulate(ctx, table, stroke(c.angle + offset * step, base), c).made) made.push(offset);
    yield;
    // No point widening the search when neither the centre nor its neighbours go in.
    if (made.length === 0 && Math.abs(offset) === 1 && offset > 0) return null;
  }
  if (made.length === 0) return null;
  const centre = (Math.min(...made) + Math.max(...made)) / 2;
  const halfWidth = ((Math.max(...made) - Math.min(...made)) / 2 + 0.5) * step;
  const chance = potChance(halfWidth, persona.aimSigma);
  const angle = c.angle + centre * step;
  let best: Scored | null = null;
  let tried = 0;
  for (const extra of AI.powerSteps) {
    for (const vertical of AI.spins) {
      if (tried++ >= persona.variants) break;
      const shot = stroke(angle, base + extra, vertical);
      const trial = simulate(ctx, table, shot, c);
      yield;
      if (!trial.made) continue;
      let value = chance;
      if (trial.verdict.state.winner === ctx.rules.turn) value *= AI.winValue;
      else value *= 1 + persona.positionWeight * bestChance(trial.table, legalTargets(trial.verdict.state, trial.table), persona.aimSigma, persona.banks);
      if (!best || value > best.value) best = { shot, value, chance, candidate: c };
    }
  }
  return best;
}

/** Soft shots at legal balls that leave the opponent the worst possible look. */
function* findSafety(ctx: PlanContext, table: readonly BallSnap[], targets: readonly number[]): Generator<void, { shot: Shot; ball: number; leave: number } | null> {
  const cue = table[BALL.cue];
  const reachable = targets.filter((id) => pathClear(table, cue, table[id], [BALL.cue, id])).sort((a, b) => dist(cue, table[a]) - dist(cue, table[b])).slice(0, SAFETY.balls);
  let best: { shot: Shot; ball: number; leave: number } | null = null;
  let tries = 0;
  for (const power of AI.safetyPowers) {
    for (const cut of AI.safetyCuts) {
      for (const id of reachable) {
        if (tries++ >= ctx.persona.safetyTries) return best;
        const line = norm(sub(table[id], cue));
        const aim = add(table[id], scale(perp(line), cut * R * 2));
        const shot = stroke(angleOf(sub(aim, cue)), power);
        const trial = simulate(ctx, table, shot, null);
        yield;
        if (trial.verdict.foul !== null || trial.verdict.state.winner !== null) continue;
        // What the opponent could do next (or 0 if the turn was kept by a lucky pot).
        const leave = trial.verdict.keepsTurn ? 0 : bestChance(trial.table, legalTargets(trial.verdict.state, trial.table), ctx.persona.aimSigma, false);
        if (!best || leave < best.leave) best = { shot, ball: id, leave };
      }
    }
  }
  return best;
}

/** Geometric lines to a legal ball: straight at it, then off one cushion with a few corrections. */
function hitLines(table: readonly BallSnap[], targets: readonly number[]): { shot: Shot; ball: number }[] {
  const cue = table[BALL.cue];
  const byDistance = [...targets].sort((a, b) => dist(cue, table[a]) - dist(cue, table[b]));
  const lines: { shot: Shot; ball: number }[] = [];
  for (const id of byDistance) {
    if (pathClear(table, cue, table[id], [BALL.cue, id])) lines.push({ shot: stroke(angleOf(sub(table[id], cue)), SAFETY.hitPower), ball: id });
  }
  for (const id of byDistance) {
    for (const rail of RAILS) {
      const line = rail.at - Math.sign(rail.at) * R;
      const ball = table[id];
      const mirrored = rail.axis === 'x' ? v2(2 * line - ball.x, ball.z) : v2(ball.x, 2 * line - ball.z);
      const t = (line - cue[rail.axis]) / (mirrored[rail.axis] - cue[rail.axis]);
      if (!(t > 0 && t < 1)) continue;
      const bounce = add(cue, scale(sub(mirrored, cue), t));
      if (!pathClear(table, cue, bounce, [BALL.cue]) || !pathClear(table, bounce, ball, [BALL.cue, id])) continue;
      // Cushions do not reflect like mirrors, so try a few angles around the geometric one.
      for (const offset of SAFETY.kickOffsets) lines.push({ shot: stroke(angleOf(sub(mirrored, cue)) + offset, SAFETY.kickPower), ball: id });
    }
  }
  return lines;
}

/** A shot that only tries to touch a legal ball, checked by simulation; the first clean one wins. */
function* legalHit(ctx: PlanContext, table: readonly BallSnap[], targets: readonly number[]): Generator<void, { shot: Shot; ball: number | null }> {
  const lines = hitLines(table, targets).slice(0, SAFETY.hitTries);
  let fallback: { shot: Shot; ball: number | null } | null = null;
  for (const line of lines) {
    const trial = simulate(ctx, table, line.shot, null);
    yield;
    if (trial.verdict.state.winner !== null) continue;
    if (trial.verdict.foul === null) return line;
    if (trial.verdict.foul === 'noRail') fallback ??= line;
  }
  if (fallback) return fallback;
  const id = targets.length > 0 ? [...targets].sort((a, b) => dist(table[BALL.cue], table[a]) - dist(table[BALL.cue], table[b]))[0] : null;
  return lines[0] ?? { shot: stroke(id === null ? 0 : angleOf(sub(table[id], table[BALL.cue])), SAFETY.hitPower), ball: id };
}

/**
 * Chooses a shot. A generator so the game can spread the simulations over several frames:
 * it yields after each simulated shot and returns the plan.
 */
export function* planShot(ctx: PlanContext): Generator<void, Plan> {
  const { persona, rng, rules } = ctx;
  const finish = (kind: PlanKind, placement: Vec2 | null, ideal: Shot, ball: number | null, pocket: number | null, chance: number): Plan =>
    ({ kind, placement, ideal, shot: withError(ideal, persona, rng), ball, pocket, chance });

  if (rules.breaking) {
    const spot = breakSpot(rng);
    const apex = ctx.table.filter((b) => !b.pocketed && b.id !== BALL.cue).reduce((a, b) => (b.x < a.x ? b : a));
    return finish('break', spot, { angle: angleOf(sub(apex, spot)), power: persona.breakPower, side: 0, vertical: 0 }, apex.id, null, 0);
  }

  const targets = legalTargets(rules, ctx.table);
  let table = ctx.table;
  let placement: Vec2 | null = null;
  if (rules.ballInHand !== 'none') {
    placement = choosePlacement(table, targets, rules.ballInHand, persona.banks);
    table = withCue(table, placement);
  }

  let best: Scored | null = null;
  const candidates = listCandidates(table, targets, persona.banks).slice(0, persona.candidates);
  for (const c of candidates) {
    const scored = yield* scoreCandidate(ctx, table, c);
    if (scored && (!best || scored.value > best.value)) best = scored;
  }

  if ((!best || best.chance < persona.safetyBelow) && persona.safetyTries > 0) {
    const safety = yield* findSafety(ctx, table, targets);
    if (safety && (!best || safety.leave < SAFETY.accept)) return finish('safety', placement, safety.shot, safety.ball, null, 0);
  }
  if (best) return finish(best.candidate.kind === 'bank' ? 'bank' : 'pot', placement, best.shot, best.candidate.ball, best.candidate.pocket, best.chance);
  const hit = yield* legalHit(ctx, table, targets);
  return finish('hit', placement, hit.shot, hit.ball, null, 0);
}

/** Runs the planner to completion (tests and headless play). */
export function planNow(ctx: PlanContext): Plan {
  const run = planShot(ctx);
  for (;;) {
    const step = run.next();
    if (step.done) return step.value;
  }
}
