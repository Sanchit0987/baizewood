import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/math/random';
import { evaluateShot, groupOf, legalTargets, newRules, onEight, type RulesState } from '../../src/rules/eightball';
import { emptyStats, parseStats, recordFrame } from '../../src/rules/stats';
import { advance, newTournament, parseTournament } from '../../src/rules/tournament';
import { emptyOutcome, type ShotOutcome } from '../../src/sim/shot';
import { FOOT_SPOT } from '../../src/table/geometry';
import { nearestSpot, rackOrder, rackTable, type BallSnap } from '../../src/table/rack';
import { tableWith } from './helpers';

const CALL = { callEight: true };
const FREE = { callEight: false };
const shot = (o: Partial<ShotOutcome>): ShotOutcome => ({ ...emptyOutcome(), railAfterContact: true, ...o });
const pot = (...ids: number[]): { id: number; pocket: number }[] => ids.map((id) => ({ id, pocket: 0 }));
const open = (turn: 0 | 1 = 0): RulesState => ({ ...newRules(turn), breaking: false, ballInHand: 'none' });
const grouped = (turn: 0 | 1 = 0): RulesState => ({ ...open(turn), groups: ['solids', 'stripes'] });
const full = (): BallSnap[] => rackTable(createRng(1));
/** Table where seat 0 (solids) has cleared the group. */
const endgame = (): BallSnap[] => tableWith({ 0: [0, 0], 8: [0.3, 0], 9: [0.5, 0.2], 12: [-0.5, 0.2] });

describe('rack', () => {
  it('puts the 8 in the middle and one of each group in the back corners', () => {
    for (let seed = 0; seed < 20; seed++) {
      const order = rackOrder(createRng(seed));
      expect(order).toHaveLength(15);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
      expect(order[4]).toBe(8);
      expect(groupOf(order[10])).not.toBe(groupOf(order[14]));
    }
    const table = full();
    expect(table.map((b) => b.id)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    const apex = table.filter((b) => b.id !== 0).reduce((a, b) => (b.x < a.x ? b : a));
    expect(apex.x).toBeCloseTo(FOOT_SPOT.x, 3);
  });

  it('re-spots on the nearest free point of the long string', () => {
    const table = tableWith({ 3: [FOOT_SPOT.x, 0] });
    const p = nearestSpot(table, FOOT_SPOT, 8);
    expect(p.z).toBe(0);
    expect(Math.abs(p.x - FOOT_SPOT.x)).toBeGreaterThan(0.057);
    expect(Math.abs(p.x - FOOT_SPOT.x)).toBeLessThan(0.07);
  });
});

describe('break', () => {
  it('is legal with a pot, the table stays open and the breaker continues', () => {
    const v = evaluateShot(newRules(0), full(), shot({ firstHit: 1, pocketed: pot(3) }), null, FREE);
    expect(v).toMatchObject({ foul: null, keepsTurn: true, assigned: null });
    expect(v.state).toMatchObject({ turn: 0, breaking: false, groups: [null, null], ballInHand: 'none' });
  });

  it('without a pot needs four balls on a cushion', () => {
    const dry = evaluateShot(newRules(0), full(), shot({ firstHit: 1, railBalls: [1, 2, 3, 4] }), null, FREE);
    expect(dry).toMatchObject({ foul: null, keepsTurn: false });
    expect(dry.state.turn).toBe(1);
    const soft = evaluateShot(newRules(0), full(), shot({ firstHit: 1, railBalls: [1, 2] }), null, FREE);
    expect(soft.foul).toBe('illegalBreak');
    expect(soft.state).toMatchObject({ turn: 1, ballInHand: 'anywhere' });
  });

  it('a scratch gives ball in hand behind the head string', () => {
    const v = evaluateShot(newRules(1), full(), shot({ firstHit: 1, cuePocketed: true, pocketed: pot(2) }), null, FREE);
    expect(v.foul).toBe('scratch');
    expect(v.state).toMatchObject({ turn: 0, ballInHand: 'kitchen', groups: [null, null] });
  });

  it('the 8 on the break is re-spotted, not a win or a loss', () => {
    const v = evaluateShot(newRules(0), full(), shot({ firstHit: 1, pocketed: pot(8) }), null, CALL);
    expect(v.respotEight).toBe(true);
    expect(v.state.winner).toBeNull();
    expect(v.keepsTurn).toBe(false);
    const withBall = evaluateShot(newRules(0), full(), shot({ firstHit: 1, pocketed: pot(8, 5) }), null, CALL);
    expect(withBall).toMatchObject({ respotEight: true, keepsTurn: true });
  });
});

describe('group assignment', () => {
  it('the first legal pot on an open table decides the groups', () => {
    const v = evaluateShot(open(1), full(), shot({ firstHit: 12, pocketed: pot(12) }), null, FREE);
    expect(v.assigned).toBe('stripes');
    expect(v.state.groups).toEqual(['solids', 'stripes']);
    expect(v.state.turn).toBe(1);
  });

  it('uses the first ball down when both groups drop', () => {
    const v = evaluateShot(open(0), full(), shot({ firstHit: 3, pocketed: pot(3, 11) }), null, FREE);
    expect(v.state.groups).toEqual(['solids', 'stripes']);
  });

  it('a pot with a foul assigns nothing', () => {
    const v = evaluateShot(open(0), full(), shot({ firstHit: 3, pocketed: pot(3), cuePocketed: true }), null, FREE);
    expect(v.assigned).toBeNull();
    expect(v.state.groups).toEqual([null, null]);
    expect(v.state).toMatchObject({ turn: 1, ballInHand: 'anywhere' });
  });

  it('on an open table any ball but the 8 may be hit first', () => {
    expect(legalTargets(open(0), full())).not.toContain(8);
    expect(legalTargets(open(0), full())).toHaveLength(14);
    expect(evaluateShot(open(0), full(), shot({ firstHit: 8 }), null, FREE).foul).toBe('wrongBall');
  });
});

describe('fouls', () => {
  it('missing every ball', () => {
    const v = evaluateShot(grouped(), full(), shot({ firstHit: null }), null, FREE);
    expect(v.foul).toBe('noHit');
    expect(v.state).toMatchObject({ turn: 1, ballInHand: 'anywhere' });
  });

  it('hitting the other group or the 8 first', () => {
    expect(evaluateShot(grouped(0), full(), shot({ firstHit: 10 }), null, FREE).foul).toBe('wrongBall');
    expect(evaluateShot(grouped(1), full(), shot({ firstHit: 2 }), null, FREE).foul).toBe('wrongBall');
    expect(evaluateShot(grouped(0), full(), shot({ firstHit: 8 }), null, FREE).foul).toBe('wrongBall');
    expect(evaluateShot(grouped(1), full(), shot({ firstHit: 10 }), null, FREE).foul).toBeNull();
  });

  it('no cushion after contact and no pot', () => {
    expect(evaluateShot(grouped(), full(), shot({ firstHit: 2, railAfterContact: false }), null, FREE).foul).toBe('noRail');
    expect(evaluateShot(grouped(), full(), shot({ firstHit: 2, railAfterContact: false, pocketed: pot(2) }), null, FREE).foul).toBeNull();
  });

  it('pocketing the cue ball', () => {
    const v = evaluateShot(grouped(), full(), shot({ firstHit: 2, pocketed: pot(2), cuePocketed: true }), null, FREE);
    expect(v).toMatchObject({ foul: 'scratch', keepsTurn: false });
  });
});

describe('turns', () => {
  it('continue after potting an own ball, pass after a miss or only an opponent ball', () => {
    expect(evaluateShot(grouped(), full(), shot({ firstHit: 2, pocketed: pot(2) }), null, FREE).state.turn).toBe(0);
    expect(evaluateShot(grouped(), full(), shot({ firstHit: 2 }), null, FREE).state.turn).toBe(1);
    const v = evaluateShot(grouped(), full(), shot({ firstHit: 2, pocketed: pot(13) }), null, FREE);
    expect(v).toMatchObject({ foul: null, keepsTurn: false });
  });
});

describe('the 8-ball', () => {
  it('becomes the only legal target once the group is cleared', () => {
    expect(onEight(grouped(0), endgame())).toBe(true);
    expect(onEight(grouped(1), endgame())).toBe(false);
    expect(legalTargets(grouped(0), endgame())).toEqual([8]);
  });

  it('wins when potted legally in the called pocket', () => {
    const v = evaluateShot(grouped(0), endgame(), shot({ firstHit: 8, pocketed: [{ id: 8, pocket: 2 }] }), 2, CALL);
    expect(v.state).toMatchObject({ winner: 0, endReason: 'eightPotted' });
  });

  it('loses in the wrong pocket when calling is on, wins anywhere when it is off', () => {
    const o = shot({ firstHit: 8, pocketed: [{ id: 8, pocket: 2 }] });
    expect(evaluateShot(grouped(0), endgame(), o, 5, CALL).state).toMatchObject({ winner: 1, endReason: 'eightWrongPocket' });
    expect(evaluateShot(grouped(0), endgame(), o, null, CALL).state.winner).toBe(1);
    expect(evaluateShot(grouped(0), endgame(), o, null, FREE).state.winner).toBe(0);
  });

  it('loses when potted before the group is cleared', () => {
    const v = evaluateShot(grouped(1), endgame(), shot({ firstHit: 9, pocketed: pot(8) }), null, FREE);
    expect(v.state).toMatchObject({ winner: 0, endReason: 'eightEarly' });
    // Clearing the last ball and the 8 in one shot is also early.
    const last = tableWith({ 0: [0, 0], 8: [0.3, 0], 4: [0.2, 0.2], 9: [0.5, 0.2] });
    expect(evaluateShot(grouped(0), last, shot({ firstHit: 4, pocketed: pot(4, 8) }), 0, CALL).state.winner).toBe(1);
    expect(evaluateShot(open(0), full(), shot({ firstHit: 4, pocketed: pot(8) }), null, FREE).state.winner).toBe(1);
  });

  it('loses when potted with a scratch or another foul', () => {
    const scratch = evaluateShot(grouped(0), endgame(), shot({ firstHit: 8, pocketed: pot(8), cuePocketed: true }), 0, CALL);
    expect(scratch.state).toMatchObject({ winner: 1, endReason: 'eightFoul' });
    const wrong = evaluateShot(grouped(0), endgame(), shot({ firstHit: 9, pocketed: pot(8) }), 0, CALL);
    expect(wrong.state.winner).toBe(1);
  });

  it('a scratch without potting the 8 is only a foul', () => {
    const v = evaluateShot(grouped(0), endgame(), shot({ firstHit: 8, cuePocketed: true }), 0, CALL);
    expect(v.state.winner).toBeNull();
    expect(v.state).toMatchObject({ turn: 1, ballInHand: 'anywhere' });
  });
});

describe('stats and tournament', () => {
  it('records frames and survives bad stored data', () => {
    let s = recordFrame(emptyStats(), { mode: 'ai', difficulty: 'hard', won: true, potted: 8, fouls: 1, bestRun: 5, opponentPotted: 0 });
    s = recordFrame(s, { mode: 'ai', difficulty: 'hard', won: false, potted: 3, fouls: 0, bestRun: 2, opponentPotted: 8 });
    expect(s.ai.hard).toEqual({ played: 2, won: 1 });
    expect(s).toMatchObject({ ballsPotted: 11, fouls: 1, bestRun: 5, shutouts: 1 });
    expect(parseStats(JSON.stringify(s))).toEqual(s);
    expect(parseStats('{nonsense')).toEqual(emptyStats());
    expect(parseStats('{"ai":{"easy":{"played":-4,"won":9}},"bestRun":"x"}')).toEqual(emptyStats());
  });

  it('the ladder advances on wins and ends on a loss', () => {
    let t = newTournament(4);
    t = advance(advance(t, true), true);
    expect(t).toMatchObject({ round: 2, status: 'playing' });
    expect(advance(t, false).status).toBe('lost');
    expect(advance(advance(t, true), true).status).toBe('won');
    expect(parseTournament(JSON.stringify(t), 4)).toEqual(t);
    expect(parseTournament('{"round":9,"status":"playing"}', 4)).toBeNull();
  });
});
