import { beforeAll, describe, expect, it } from 'vitest';
import { CLOTH, CONTACT, CUE, PHYSICS } from '../../src/config/physics';
import { BALL, TABLE } from '../../src/config/table';
import { createRng } from '../../src/math/random';
import { applyCloth, slipOf, type Motion } from '../../src/physics/cloth';
import { collideBalls, timeOfImpact } from '../../src/physics/collide';
import { powerToSpeed, speedToPower, strikeMotion } from '../../src/physics/strike';
import { initPhysics, PoolWorld, type Impact } from '../../src/physics/world';
import { runShot } from '../../src/sim/shot';
import { HALF_LENGTH, HALF_WIDTH, POCKETS } from '../../src/table/geometry';
import { rackTable } from '../../src/table/rack';
import { tableWith } from './helpers';

const R = BALL.radius;
const DT = PHYSICS.timestep;
const still = (): Motion => ({ vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });

beforeAll(() => initPhysics());

/** Steps until the first impact of a kind, returning it with the motion of two balls right after. */
function untilImpact(world: PoolWorld, kind: Impact['kind'], limit = 4): Impact {
  while (world.time < limit) {
    const hit = world.step().find((i) => i.kind === kind);
    if (hit) return hit;
  }
  throw new Error(`no ${kind} impact`);
}

describe('cloth', () => {
  it('a sliding ball reaches natural roll at 5/7 of its speed', () => {
    const m = { ...still(), vx: 2 };
    let t = 0;
    while (Math.hypot(slipOf(m).x, slipOf(m).z) > CLOTH.slipEpsilon) { applyCloth(m, DT); t += DT; }
    expect(m.vx).toBeCloseTo((2 * 5) / 7, 2);
    expect(t).toBeCloseTo((2 * 2) / (7 * CLOTH.slide * PHYSICS.gravity), 2);
    expect(m.wz).toBeCloseTo(-m.vx / R, 1);
  });

  it('a rolling ball stops after v^2 / (2 mu g)', () => {
    const m = { ...still(), vx: 1, wz: -1 / R };
    let x = 0;
    while (m.vx > 0) { applyCloth(m, DT); x += m.vx * DT; }
    expect(x).toBeCloseTo(1 / (2 * CLOTH.roll * PHYSICS.gravity), 1);
    expect(m.wz).toBe(0);
  });

  it('backspin on a stopped ball pulls it backwards, topspin pushes it on', () => {
    const draw = applyCloth({ ...still(), wz: 30 }, DT);
    expect(draw.vx).toBeLessThan(0);
    const follow = applyCloth({ ...still(), wz: -30 }, DT);
    expect(follow.vx).toBeGreaterThan(0);
  });

  it('sidespin decays without moving the ball', () => {
    const m = { ...still(), wy: 20 };
    for (let i = 0; i < 10; i++) applyCloth(m, DT);
    expect(m.wy).toBeCloseTo(20 - CLOTH.spinDecel * DT * 10, 5);
    expect(m.vx).toBe(0);
    for (let i = 0; i < 2 / DT; i++) applyCloth(m, DT);
    expect(m.wy).toBe(0);
  });
});

describe('cue strike', () => {
  it('maps power to speed monotonically and back', () => {
    expect(powerToSpeed(0)).toBe(CUE.minSpeed);
    expect(powerToSpeed(1)).toBe(CUE.maxSpeed);
    expect(speedToPower(powerToSpeed(0.4))).toBeCloseTo(0.4, 6);
  });

  it('gives follow, draw and english the right spin axes', () => {
    const follow = strikeMotion({ angle: 0, power: 0.5, side: 0, vertical: 1 });
    expect(follow.wz).toBeLessThan(0); // same sense as rolling along +x
    expect(slipOf(follow).x).toBeLessThan(0); // over-spinning: contact point moves backwards
    const draw = strikeMotion({ angle: 0, power: 0.5, side: 0, vertical: -1 });
    expect(draw.wz).toBeGreaterThan(0);
    const right = strikeMotion({ angle: 0, power: 0.5, side: 1, vertical: 0 });
    expect(right.wy).toBeGreaterThan(0);
    expect(right.wx).toBeCloseTo(0);
    // A tip offset of 2/5 of the radius would give natural roll; the limit is beyond that.
    expect(Math.abs(follow.wz) * R).toBeCloseTo((follow.vx * CUE.maxOffset) / CONTACT.moment, 6);
  });
});

describe('ball to ball collisions', () => {
  it('finds the exact moment of contact and resolves along the line of centres', () => {
    expect(timeOfImpact(1, 0, -2, 0, 1)).toBeCloseTo((1 - R * 2) / 2, 9);
    expect(timeOfImpact(1, 0, -2, 0, 0.1)).toBe(-1);
    expect(timeOfImpact(1, R * 3, -2, 0, 1)).toBe(-1);
    expect(timeOfImpact(1, 0, 2, 0, 1)).toBe(-1);
    const a = { ...still(), vx: 1 };
    const b = still();
    expect(collideBalls(a, b, 1, 0)).toBe(1);
    expect(a.vx + b.vx).toBeCloseTo(1, 12);
    expect(b.vx - a.vx).toBeCloseTo(CONTACT.ballRestitution, 12);
    expect(collideBalls(a, b, 1, 0)).toBe(0); // already separating
  });

  it('the cut angle is right at every speed, including a full-power hit', () => {
    for (const speed of [0.5, 2, CUE.maxSpeed]) {
      const world = new PoolWorld();
      world.load(tableWith({ 0: [-0.3, R], 1: [0, 0] }));
      world.setMotion(0, { ...still(), vx: speed, wz: -speed / R });
      untilImpact(world, 'ball');
      const b = world.velocity(1);
      const degrees = (Math.atan2(-b.z, b.x) * 180) / Math.PI;
      // Geometric line of centres is 30 degrees; friction throws the object ball a degree or two.
      expect(degrees).toBeGreaterThan(27);
      expect(degrees).toBeLessThan(30.01);
    }
  });

  it('a full hit passes the speed on and stops the striker (stun)', () => {
    const world = new PoolWorld();
    world.load(tableWith({ 0: [-0.3, 0], 1: [0, 0] }));
    world.setMotion(0, { ...still(), vx: 2 });
    const before = untilImpact(world, 'ball').speed;
    const e = CONTACT.ballRestitution;
    expect(world.velocity(1).x).toBeCloseTo((before * (1 + e)) / 2, 3);
    expect(world.velocity(1).x / before).toBeGreaterThan(0.9);
    expect(Math.abs(world.velocity(0).x) / before).toBeLessThan(0.1);
    expect(Math.abs(world.velocity(1).z)).toBeLessThan(0.02);
  });

  it('conserves momentum and separates near 90 degrees on a cut', () => {
    const world = new PoolWorld();
    world.load(tableWith({ 0: [-0.3, R], 1: [0, 0] })); // half-ball hit
    world.setMotion(0, { ...still(), vx: 2 });
    let before = 0;
    for (let hit = false; !hit;) {
      before = world.speed(0);
      hit = world.step().some((i) => i.kind === 'ball');
    }
    const a = world.velocity(0);
    const b = world.velocity(1);
    expect(a.x + b.x).toBeCloseTo(before, 1);
    expect(a.z + b.z).toBeCloseTo(0, 6);
    const angle = Math.acos((a.x * b.x + a.z * b.z) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z)));
    expect((angle * 180) / Math.PI).toBeGreaterThan(80);
    expect((angle * 180) / Math.PI).toBeLessThan(95);
    // Half-ball hit: the object ball leaves along the line of centres, 30 degrees off the shot line.
    expect((Math.atan2(-b.z, b.x) * 180) / Math.PI).toBeGreaterThan(26);
    expect((Math.atan2(-b.z, b.x) * 180) / Math.PI).toBeLessThan(32);
  });

  it('transfers spin: sidespin on the striker throws the object ball and turns it', () => {
    const run = (wy: number): { z: number; spin: number } => {
      const world = new PoolWorld();
      world.load(tableWith({ 0: [-0.2, 0], 1: [0, 0] }));
      world.setMotion(0, { ...still(), vx: 1.5, wy });
      untilImpact(world, 'ball');
      return { z: world.velocity(1).z, spin: world.motionOf(1).wy };
    };
    const plain = run(0);
    const left = run(60);
    const right = run(-60);
    expect(Math.abs(plain.z)).toBeLessThan(0.005);
    expect(left.z * right.z).toBeLessThan(0);
    expect(Math.abs(left.z)).toBeGreaterThan(0.01);
    // Gearing: the object ball picks up spin of the opposite sense.
    expect(left.spin).toBeLessThan(0);
    expect(right.spin).toBeGreaterThan(0);
  });

  it('draw brings the cue ball back and follow sends it forward after a full hit', () => {
    const after = (vertical: number): number => {
      const world = new PoolWorld();
      world.load(tableWith({ 0: [-0.4, 0], 1: [0, 0] }));
      world.strike({ angle: 0, power: 0.45, side: 0, vertical });
      untilImpact(world, 'ball');
      const at = world.position(0).x;
      for (let i = 0; i < 0.4 / DT; i++) world.step();
      return world.position(0).x - at;
    };
    expect(after(-1)).toBeLessThan(-0.1);
    expect(after(1)).toBeGreaterThan(0.1);
    expect(Math.abs(after(0))).toBeLessThan(Math.abs(after(1)));
  });
});

describe('cushions', () => {
  it('bounce back with speed loss', () => {
    const world = new PoolWorld();
    world.load(tableWith({ 0: [0.3, 0.2] }));
    world.setMotion(0, { ...still(), vz: 2, wx: 2 / R });
    let before = 0;
    for (let hit = false; !hit;) {
      before = world.velocity(0).z;
      hit = world.step().some((i) => i.kind === 'cushion');
    }
    const v = world.velocity(0);
    expect(v.z).toBeLessThan(0);
    expect(-v.z / before).toBeCloseTo(CONTACT.cushionRestitution, 1);
    expect(-v.z).toBeLessThan(2 * 0.85);
    expect(-v.z).toBeGreaterThan(2 * 0.6);
  });

  it('reflect an angled shot and running english widens the angle', () => {
    const out = (wy: number): number => {
      const world = new PoolWorld();
      world.load(tableWith({ 0: [0, 0.3] }));
      world.setMotion(0, { ...still(), vx: 1, vz: 1.5, wy });
      untilImpact(world, 'cushion');
      return world.velocity(0).x;
    };
    const plain = out(0);
    expect(plain).toBeGreaterThan(0.5);
    expect(out(-80)).toBeGreaterThan(plain + 0.05);
    expect(out(80)).toBeLessThan(plain - 0.05);
  });

  it('never let a ball tunnel, even at full power from every direction', () => {
    const rng = createRng(7);
    const world = new PoolWorld();
    const limitX = HALF_LENGTH + TABLE.backstopOffset;
    const limitZ = HALF_WIDTH + TABLE.backstopOffset;
    for (let n = 0; n < 60; n++) {
      world.load(tableWith({ 0: [rng.range(-0.9, 0.9), rng.range(-0.4, 0.4)] }));
      world.strike({ angle: rng.range(0, Math.PI * 2), power: 1, side: rng.range(-1, 1), vertical: rng.range(-1, 1) });
      for (let i = 0; i < 2 / DT && !world.isPocketed(0); i++) {
        world.step();
        const p = world.position(0);
        expect(Math.abs(p.x)).toBeLessThan(limitX);
        expect(Math.abs(p.z)).toBeLessThan(limitZ);
        if (!world.isPocketed(0)) {
          const inMouth = POCKETS.some((k) => Math.hypot(k.centre.x - p.x, k.centre.z - p.z) < k.radius + TABLE.corner.mouth);
          if (!inMouth) {
            expect(Math.abs(p.x)).toBeLessThanOrEqual(HALF_LENGTH - R + CONTACT.slack);
            expect(Math.abs(p.z)).toBeLessThanOrEqual(HALF_WIDTH - R + CONTACT.slack);
          }
        }
      }
    }
  });
});

describe('pockets', () => {
  it('a ball rolled into the middle of each pocket drops', () => {
    for (const pocket of POCKETS) {
      const world = new PoolWorld();
      const start = { x: pocket.mouth.x - pocket.axis.x * 0.3, z: pocket.mouth.z - pocket.axis.z * 0.3 };
      world.load(tableWith({ 0: [0.5, 0], 3: [start.x, start.z] }));
      world.setMotion(3, { ...still(), vx: pocket.axis.x * 1.2, vz: pocket.axis.z * 1.2 });
      const hit = untilImpact(world, 'pocket');
      expect(hit).toMatchObject({ a: 3, b: pocket.index });
      expect(world.isPocketed(3)).toBe(true);
      expect(world.snapshot()[3].pocketed).toBe(true);
    }
  });

  it('the jaws reject a ball that hits the facing too far out', () => {
    const world = new PoolWorld();
    // Along the long rail toward the corner but aimed well into the end cushion.
    world.load(tableWith({ 3: [HALF_LENGTH - 0.5, HALF_WIDTH - 0.3] }));
    world.setMotion(3, { ...still(), vx: 2 });
    for (let i = 0; i < 3 / DT; i++) world.step();
    expect(world.isPocketed(3)).toBe(false);
  });
});

describe('break', () => {
  it('spreads the rack, keeps every ball on the table or in a pocket, and comes to rest', () => {
    const world = new PoolWorld();
    world.load(rackTable(createRng(3)));
    const { outcome, table, seconds } = runShot(world, { angle: 0, power: 1, side: 0, vertical: 0 });
    expect(outcome.firstHit).not.toBeNull();
    expect(seconds).toBeLessThan(PHYSICS.maxShotSeconds);
    expect(outcome.railBalls.length + outcome.pocketed.length).toBeGreaterThanOrEqual(4);
    for (const b of table) {
      if (b.pocketed) continue;
      expect(Math.abs(b.x)).toBeLessThanOrEqual(HALF_LENGTH - R + CONTACT.slack);
      expect(Math.abs(b.z)).toBeLessThanOrEqual(HALF_WIDTH - R + CONTACT.slack);
      for (const o of table) if (o.id > b.id && !o.pocketed) expect(Math.hypot(o.x - b.x, o.z - b.z)).toBeGreaterThan(R * 2 - 0.001);
    }
  });

  it('is repeatable: the same rack and shot give the same table', () => {
    const play = (): string => {
      const world = new PoolWorld();
      world.load(rackTable(createRng(11)));
      return JSON.stringify(runShot(world, { angle: 0.01, power: 0.9, side: 0.2, vertical: 0.3 }).table);
    };
    expect(play()).toBe(play());
  });
});
