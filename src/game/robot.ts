import { planShot, type Plan, type PlanContext } from '../ai/planner';
import { AI } from '../config/ai';
import { FLOW } from '../config/game';
import { BALL } from '../config/table';
import { clamp01, lerp2, wrapAngle, type Vec2 } from '../math/vec2';

/** What the robot drives: the same aim state and actions a human uses. */
export interface RobotHands {
  aim: { angle: number; power: number; side: number; vertical: number; called: number | null };
  cuePosition(): Vec2;
  /** Shows the cue ball being carried (render only), or null to stop. */
  carry(p: Vec2 | null): void;
  place(p: Vec2): void;
  fire(): void;
}

type Phase = 'think' | 'place' | 'aim' | 'pull' | 'hold' | 'done';
const ease = (t: number): number => t * t * (3 - 2 * t);

/** Plays one turn for a computer player: thinks over several frames, then visibly aims and strokes. */
export class Robot {
  phase: Phase = 'think';
  plan: Plan | null = null;
  private readonly thinking: Generator<void, Plan>;
  private elapsed = 0;
  private t = 0;
  private from: Vec2 = { x: 0, z: 0 };
  private startAngle = 0;

  constructor(private readonly ctx: PlanContext, private readonly hands: RobotHands) {
    this.thinking = planShot(ctx);
  }

  private next(phase: Phase): void {
    this.phase = phase;
    this.t = 0;
  }

  update(dt: number): void {
    const plan = this.plan;
    if (this.phase === 'think') {
      this.elapsed += dt;
      const start = performance.now();
      while (!this.plan && performance.now() - start < AI.frameBudgetMs) {
        const step = this.thinking.next();
        if (step.done) this.plan = step.value;
      }
      if (!this.plan || this.elapsed < this.ctx.persona.thinkSeconds) return;
      this.from = this.hands.cuePosition();
      this.startAngle = this.hands.aim.angle;
      this.next(this.plan.placement ? 'place' : 'aim');
      return;
    }
    if (!plan) return;
    this.t += dt;
    if (this.phase === 'place') {
      const k = clamp01(this.t / FLOW.robotPlace);
      this.hands.carry(lerp2(this.from, plan.placement!, ease(k)));
      if (k >= 1) {
        this.hands.place(plan.placement!);
        this.hands.carry(null);
        this.next('aim');
      }
    } else if (this.phase === 'aim') {
      const k = clamp01(this.t / FLOW.robotAim);
      const aim = this.hands.aim;
      aim.angle = this.startAngle + wrapAngle(plan.shot.angle - this.startAngle) * ease(k);
      aim.side = plan.shot.side * k;
      aim.vertical = plan.shot.vertical * k;
      if (plan.ball === BALL.eight) aim.called = plan.pocket;
      if (k >= 1) this.next('pull');
    } else if (this.phase === 'pull') {
      const k = clamp01(this.t / FLOW.robotPull);
      this.hands.aim.power = plan.shot.power * ease(k);
      if (k >= 1) this.next('hold');
    } else if (this.phase === 'hold' && this.t >= FLOW.robotHold) {
      const aim = this.hands.aim;
      Object.assign(aim, { angle: plan.shot.angle, power: plan.shot.power, side: plan.shot.side, vertical: plan.shot.vertical });
      this.next('done');
      this.hands.fire();
    }
  }
}
