import { beforeAll, describe, expect, it } from 'vitest';
import { erf, ghostFor, listCandidates, minimumPower, potChance } from '../../src/ai/candidates';
import { choosePlacement, placementLegal } from '../../src/ai/place';
import { planNow, withError, type PlanContext } from '../../src/ai/planner';
import { LADDER, LEVELS, type Persona } from '../../src/config/ai';
import { BALL } from '../../src/config/table';
import { createRng } from '../../src/math/random';
import { dist, norm, sub, v2 } from '../../src/math/vec2';
import { initPhysics, PoolWorld } from '../../src/physics/world';
import { evaluateShot, groupOf, newRules, type RulesState } from '../../src/rules/eightball';
import { contactResult, predictAim } from '../../src/sim/predict';
import { runShot } from '../../src/sim/shot';
import { HEAD_STRING_X, POCKETS } from '../../src/table/geometry';
import { rackTable, type BallSnap } from '../../src/table/rack';
import { Frame } from '../../src/game/frame';
import { tableWith } from './helpers';

let world: PoolWorld;
beforeAll(async () => {
  await initPhysics();
  world = new PoolWorld();
});

const OPTIONS = { callEight: true };
const state = (over: Partial<RulesState> = {}): RulesState => ({ ...newRules(0), breaking: false, ballInHand: 'none', groups: ['solids', 'stripes'], ...over });
const context = (table: BallSnap[], rules: RulesState, persona: Persona, seed = 1): PlanContext => ({ table, rules, options: OPTIONS, persona, rng: createRng(seed), world });
const play = (table: BallSnap[], rules: RulesState, plan: { ideal: Parameters<typeof runShot>[1]; pocket: number | null; placement: { x: number; z: number } | null }) => {
  const start = plan.placement ? table.map((b) => (b.id === 0 ? { ...b, ...plan.placement, pocketed: false } : b)) : table;
  world.load(start);
  const result = runShot(world, plan.ideal);
  return { ...result, verdict: evaluateShot(rules, start, result.outcome, plan.pocket, OPTIONS) };
};

describe('shot geometry', () => {
  it('lists a straight-in shot with zero cut and the right pocket', () => {
    const table = tableWith({ 0: [0, 0], 3: [0.5, 0.25] });
    const best = listCandidates(table, [3], false)[0];
    expect(best).toMatchObject({ kind: 'direct', ball: 3, pocket: 5 });
    expect(best.cut).toBeLessThan(0.15);
  });

  it('drops shots that are blocked or cut too thin', () => {
    const blocked = tableWith({ 0: [0, 0], 3: [0.6, 0.3], 9: [0.3, 0.15] });
    expect(listCandidates(blocked, [3], false).every((c) => c.pocket !== 5)).toBe(true);
    // Ball between the cue ball and the pocket's far side: cannot be cut backwards.
    const behind = tableWith({ 0: [0.8, 0.2], 3: [0.4, 0.2] });
    expect(listCandidates(behind, [3], false).every((c) => POCKETS[c.pocket].centre.x < 0.5)).toBe(true);
  });

  it('ranks an easy shot above a long thin one', () => {
    const table = tableWith({ 0: [0, 0], 3: [0.8, 0.35], 5: [-0.9, -0.1] });
    const list = listCandidates(table, [3, 5], false);
    expect(list[0].ball).toBe(3);
    expect(potChance(list[0].tolerance, LEVELS.normal.aimSigma)).toBeGreaterThan(potChance(list[list.length - 1].tolerance, LEVELS.normal.aimSigma));
  });

  it('finds bank shots only when allowed', () => {
    const table = tableWith({ 0: [-0.4, 0.2], 3: [0.2, 0.2], 9: [0.5, 0.43], 10: [0.1, 0.45], 11: [0.4, -0.1], 12: [0.7, 0.2] });
    expect(listCandidates(table, [3], false).filter((c) => c.kind === 'bank')).toHaveLength(0);
    expect(listCandidates(table, [3], true).some((c) => c.kind === 'bank')).toBe(true);
  });

  it('compensates the contact point for throw', () => {
    const cue = v2(0, 0);
    const ball = v2(0.5, 0.2);
    const want = norm(sub(POCKETS[5].mouth, ball));
    const ghost = ghostFor(cue, ball, want);
    const got = norm(contactResult(norm(sub(ghost, cue)), norm(sub(ball, ghost))).object);
    expect(got.x * want.z - got.z * want.x).toBeCloseTo(0, 4);
    expect(dist(ghost, ball)).toBeCloseTo(BALL.radius * 2, 6);
  });

  it('pot chance grows with tolerance and shrinks with unsteadiness', () => {
    expect(erf(0)).toBe(0);
    expect(erf(3)).toBeCloseTo(1, 3);
    expect(potChance(0.01, 0.002)).toBeGreaterThan(potChance(0.01, 0.01));
    expect(potChance(0.02, 0.01)).toBeGreaterThan(potChance(0.005, 0.01));
    expect(potChance(0, 0.01)).toBe(0);
  });

  it('asks for more power on longer shots', () => {
    const near = listCandidates(tableWith({ 0: [0.6, 0.2], 3: [0.9, 0.4] }), [3], false)[0];
    const far = listCandidates(tableWith({ 0: [-0.9, -0.4], 3: [0.5, 0.3] }), [3], false).find((c) => c.pocket === 5)!;
    expect(minimumPower(far)).toBeGreaterThan(minimumPower(near));
  });

  it('the aim guide prediction agrees with the physics', () => {
    const table = tableWith({ 0: [-0.3, 0.02], 3: [0.2, 0] });
    const dir = norm(v2(1, 0));
    const p = predictAim(table, table[0], dir);
    expect(p).toMatchObject({ kind: 'ball', ball: 3 });
    world.load(table);
    world.setMotion(0, { vx: 2, vz: 0, wx: 0, wy: 0, wz: -2 / BALL.radius });
    while (!world.step().some((i) => i.kind === 'ball'));
    const v = norm(world.velocity(3));
    expect(v.x).toBeCloseTo(p.objectDir!.x, 2);
    expect(v.z).toBeCloseTo(p.objectDir!.z, 2);
    expect(predictAim(tableWith({ 0: [0, 0] }), v2(0, 0), norm(v2(0.3, 1))).kind).toBe('cushion');
  });
});

describe('shot selection', () => {
  it('pots a simple ball: the intended shot goes in and keeps the turn', () => {
    const table = tableWith({ 0: [0, 0], 3: [0.5, 0.25], 12: [-0.6, -0.2], 8: [0.1, -0.4] });
    const rules = state();
    const plan = planNow(context(table, rules, LEVELS.hard));
    expect(plan).toMatchObject({ kind: 'pot', ball: 3 });
    expect(plan.chance).toBeGreaterThan(0.8);
    const result = play(table, rules, plan);
    expect(result.outcome.pocketed.map((p) => p.id)).toContain(3);
    expect(result.verdict).toMatchObject({ foul: null, keepsTurn: true });
  });

  it('only shoots at its own group, and at any ball but the 8 on an open table', () => {
    const table = tableWith({ 0: [0, 0], 3: [0.5, 0.25], 12: [-0.5, -0.25], 8: [0.5, -0.25] });
    for (const level of [LEVELS.easy, LEVELS.normal, LEVELS.hard]) {
      expect(groupOf(planNow(context(table, state({ turn: 1 }), level)).ball!)).toBe('stripes');
      expect(groupOf(planNow(context(table, state({ turn: 0 }), level)).ball!)).toBe('solids');
      expect(planNow(context(table, state({ groups: [null, null] }), level)).ball).not.toBe(8);
    }
  });

  it('prefers the shot it is most likely to make', () => {
    const table = tableWith({ 0: [0.2, 0], 3: [0.75, 0.3], 5: [-0.95, 0.05], 12: [0, -0.4] });
    expect(planNow(context(table, state(), LEVELS.normal)).ball).toBe(3);
  });

  it('calls a pocket for the 8 and wins the frame with it', () => {
    const table = tableWith({ 0: [0, 0.1], 8: [0.6, 0.3], 12: [-0.6, -0.2] });
    const rules = state();
    const plan = planNow(context(table, rules, LEVELS.hard));
    expect(plan.ball).toBe(8);
    expect(plan.pocket).not.toBeNull();
    const result = play(table, rules, plan);
    expect(result.verdict.state).toMatchObject({ winner: 0, endReason: 'eightPotted' });
  });

  it('never plans a shot that loses the frame by sinking the 8 early', () => {
    // The 8 hangs in the jaws right behind the only solid.
    const table = tableWith({ 0: [0, 0], 3: [0.9, 0.42], 8: [1.02, 0.47], 12: [-0.6, -0.2] });
    const rules = state();
    for (const level of [LEVELS.normal, LEVELS.hard]) {
      const plan = planNow(context(table, rules, level));
      expect(play(table, rules, plan).verdict.state.winner).not.toBe(1);
    }
  });

  it('plays position: with a choice of speeds and spins the next shot is at least as good', () => {
    const table = tableWith({ 0: [-0.3, 0.1], 3: [0.3, 0.3], 5: [-0.7, -0.35], 12: [0.9, -0.3], 8: [0, -0.2] });
    const rules = state();
    const next = (persona: Persona): number => {
      const plan = planNow(context(table, rules, persona));
      const result = play(table, rules, plan);
      expect(result.verdict.keepsTurn).toBe(true);
      return listCandidates(result.table, [3, 5].filter((id) => !result.table[id].pocketed), false)[0]?.tolerance ?? 0;
    };
    const plain = next({ ...LEVELS.hard, positionWeight: 0, variants: 1 });
    const positional = next(LEVELS.hard);
    expect(positional).toBeGreaterThanOrEqual(plain);
  });

  it('plays a legal safety when there is nothing to pot', () => {
    // The only solid is tight on the middle of the end rail with a wall of stripes in front of both corners.
    const table = tableWith({ 0: [-0.2, 0], 3: [1.05, 0], 9: [0.95, 0.2], 10: [0.95, -0.2], 11: [1.0, 0.33], 12: [1.0, -0.33], 8: [-0.8, 0.3] });
    const rules = state();
    const tactician = LADDER[2];
    const plan = planNow(context(table, rules, tactician));
    expect(plan.kind).toBe('safety');
    const result = play(table, rules, plan);
    expect(result.verdict.foul).toBeNull();
    expect(result.verdict.state.winner).toBeNull();
    // The all-out attacker never plays safe.
    expect(planNow(context(table, rules, LADDER[1])).kind).not.toBe('safety');
  });

  it('still makes a legal hit when every target is hidden', () => {
    const table = tableWith({ 0: [-0.5, 0], 9: [-0.4, 0], 10: [-0.3, 0], 3: [0.6, 0], 8: [0, 0.4] });
    const rules = state();
    const plan = planNow(context(table, rules, LEVELS.easy));
    const result = play(table, rules, plan);
    expect(plan.kind).toBe('hit');
    expect(result.outcome.firstHit).toBe(3);
  });

  it('scales aim error with difficulty', () => {
    const ideal = { angle: 1, power: 0.5, side: 0, vertical: 0 };
    const spread = (persona: Persona): number => {
      const rng = createRng(5);
      let sum = 0;
      for (let i = 0; i < 400; i++) sum += (withError(ideal, persona, rng).angle - ideal.angle) ** 2;
      return Math.sqrt(sum / 400);
    };
    expect(spread(LEVELS.easy)).toBeGreaterThan(spread(LEVELS.normal) * 2);
    expect(spread(LEVELS.normal)).toBeGreaterThan(spread(LEVELS.hard) * 2);
    expect(spread(LEVELS.easy)).toBeCloseTo(LEVELS.easy.aimSigma, 2);
  });

  it('makes far more of the same shot on Hard than on Easy', () => {
    const table = tableWith({ 0: [-0.6, -0.2], 3: [0.4, 0.2], 12: [-0.6, 0.3], 8: [0, -0.4] });
    const rules = state();
    const made = (persona: Persona): number => {
      let n = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const plan = planNow(context(table, rules, persona, seed));
        world.load(table);
        if (runShot(world, plan.shot).outcome.pocketed.some((p) => p.id === 3)) n++;
      }
      return n;
    };
    const easy = made(LEVELS.easy);
    const hard = made(LEVELS.hard);
    expect(hard).toBeGreaterThanOrEqual(17);
    expect(easy).toBeLessThan(hard - 4);
  });
});

describe('ball in hand and the break', () => {
  it('places the cue ball on a free spot with a makeable shot', () => {
    const table = tableWith({ 0: [-1, 0.5], 3: [0.5, 0.2], 5: [0.2, -0.3], 12: [0.7, 0.3], 8: [0, 0] });
    const rules = state({ ballInHand: 'anywhere' });
    const plan = planNow(context(table, rules, LEVELS.hard));
    expect(plan.placement).not.toBeNull();
    expect(placementLegal(table, plan.placement!, 'anywhere')).toBe(true);
    expect(play(table, rules, plan).verdict).toMatchObject({ foul: null, keepsTurn: true });
  });

  it('stays behind the head string after a break scratch', () => {
    const table = tableWith({ 0: [0, 0], 3: [0.5, 0.2], 5: [0.2, -0.3], 12: [0.7, 0.3], 8: [0, 0] });
    const p = choosePlacement(table, [3, 5], 'kitchen', false);
    expect(p.x).toBeLessThanOrEqual(HEAD_STRING_X + 1e-9);
    expect(placementLegal(table, v2(0.3, 0), 'kitchen')).toBe(false);
    expect(placementLegal(table, v2(0.5, 0.2), 'anywhere')).toBe(false);
  });

  it('breaks from the kitchen into the head ball with a legal break', () => {
    const table = rackTable(createRng(2));
    const rules = newRules(0);
    const plan = planNow(context(table, rules, LEVELS.hard));
    expect(plan.kind).toBe('break');
    expect(plan.placement!.x).toBeLessThanOrEqual(HEAD_STRING_X + 1e-9);
    expect(play(table, rules, plan).verdict.foul).not.toBe('noHit');
  });
});

describe('whole frames', () => {
  const selfPlay = (a: Persona, b: Persona, seed: number): { winner: number; shots: number } => {
    const rng = createRng(seed);
    const frame = new Frame(new PoolWorld(), rng, { breaker: (seed % 2) as 0 | 1, practice: false, callEight: true });
    while (frame.phase !== 'over' && frame.shots < 400) {
      const plan = planNow({ table: frame.table, rules: frame.rules, options: OPTIONS, persona: frame.rules.turn === 0 ? a : b, rng, world });
      if (plan.placement) expect(frame.placeCue(plan.placement)).toBe(true);
      frame.shoot(plan.shot, plan.pocket);
      while (frame.phase === 'rolling') frame.step();
    }
    return { winner: frame.rules.winner ?? -1, shots: frame.shots };
  };

  it('two computer players finish a frame under the rules', () => {
    const result = selfPlay(LEVELS.normal, LEVELS.normal, 4);
    expect(result.winner).toBeGreaterThanOrEqual(0);
    expect(result.shots).toBeLessThan(200);
  });

  it('Hard beats Easy most of the time', () => {
    let wins = 0;
    const frames = 8;
    for (let seed = 1; seed <= frames; seed++) if (selfPlay(LEVELS.hard, LEVELS.easy, seed).winner === 0) wins++;
    expect(wins).toBeGreaterThanOrEqual(6);
  });
});
