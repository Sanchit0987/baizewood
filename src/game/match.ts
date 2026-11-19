import type { Persona } from '../config/ai';
import { FLOW } from '../config/game';
import { CUE_LOOK, type GuideLevel } from '../config/graphics';
import { INPUT } from '../config/input';
import { PHYSICS } from '../config/physics';
import type { Mode, Seat } from '../config/rules';
import { BALL } from '../config/table';
import { TEXT } from '../config/text';
import type { Sfx } from '../audio/sfx';
import { createRng, type Rng } from '../math/random';
import { angleOf, clamp, clamp01, dist, sub, wrapAngle, type Vec2 } from '../math/vec2';
import { clampSpin, powerToSpeed, type Shot } from '../physics/strike';
import { PoolWorld } from '../physics/world';
import { legalTargets, onEight } from '../rules/eightball';
import type { CameraView } from '../render/camera';
import { Director } from './director';
import { Frame } from './frame';
import { Robot } from './robot';

export interface Player { name: string; persona: Persona | null }
export interface MatchConfig { mode: Mode | 'demo'; players: [Player, Player]; guide: GuideLevel; callEight: boolean; breaker: Seat; seed: number }
export type Tone = 'info' | 'foul' | 'good';
export interface MatchHooks {
  toast(text: string, tone: Tone): void;
  /** A ball dropped: start its sink animation. */
  sink(id: number, from: Vec2, pocket: number): void;
  over(): void;
}
export type Stage = 'aim' | 'stroke' | 'rolling' | 'settle' | 'over';
export interface AimState { angle: number; power: number; side: number; vertical: number; called: number | null }

/** One frame of pool as played on screen: turn flow, human and robot input, cue animation and camera. */
export class Match {
  readonly frame: Frame;
  readonly aim: AimState = { angle: 0, power: 0, side: 0, vertical: 0, called: null };
  readonly director = new Director();
  stage: Stage = 'aim';
  view: CameraView = 'cue';
  robot: Robot | null = null;
  carrying = false;
  private readonly rng: Rng;
  private readonly planWorld = new PoolWorld();
  cueVisual: Vec2 | null = null;
  subject: Vec2 = { x: 0, z: 0 };
  timer = 0;
  cueAlpha = 1;
  private accumulator = 0;
  private shotSeconds = 0;
  private awaitingBreakCrack = false;
  private pendingShot: Shot | null = null;

  constructor(readonly config: MatchConfig, private readonly sfx: Sfx | null, private readonly hooks: MatchHooks) {
    this.rng = createRng(config.seed);
    this.frame = new Frame(new PoolWorld(), this.rng, { breaker: config.breaker, practice: config.mode === 'practice', callEight: config.callEight });
    this.beginTurn();
  }

  get seat(): Seat { return this.frame.rules.turn; }
  get player(): Player { return this.config.players[this.seat]; }
  get practice(): boolean { return this.config.mode === 'practice'; }
  get demo(): boolean { return this.config.mode === 'demo'; }
  /** True when a person may aim and shoot right now. */
  get humanTurn(): boolean { return this.stage === 'aim' && this.player.persona === null; }
  /** True when the shooter must name a pocket before shooting. */
  get needsCall(): boolean {
    return !this.practice && this.config.callEight && onEight(this.frame.rules, this.frame.table);
  }

  cuePosition(): Vec2 { return this.frame.world.position(BALL.cue); }

  private beginTurn(): void {
    const { frame, aim } = this;
    Object.assign(aim, { power: 0, side: 0, vertical: 0, called: null });
    const cue = this.cuePosition();
    const targets = this.practice ? frame.table.filter((b) => !b.pocketed && b.id !== BALL.cue).map((b) => b.id) : legalTargets(frame.rules, frame.table);
    const nearest = targets.reduce<number | null>((best, id) => (best === null || dist(frame.table[id], cue) < dist(frame.table[best], cue) ? id : best), null);
    if (nearest !== null) aim.angle = angleOf(sub(frame.table[nearest], cue));
    this.stage = 'aim';
    this.cueAlpha = 1;
    this.subject = cue;
    this.robot = null;
    const persona = this.player.persona;
    if (persona) {
      this.robot = new Robot(
        { table: frame.table, rules: frame.rules, options: frame.options, persona, rng: this.rng, world: this.planWorld },
        { aim, cuePosition: () => this.cuePosition(), carry: (p) => { this.cueVisual = p; }, place: (p) => { frame.placeCue(p); }, fire: () => this.fire() },
      );
    } else if (!this.practice && frame.rules.ballInHand !== 'none' && frame.shots > 0) {
      this.hooks.toast(frame.rules.ballInHand === 'kitchen' ? TEXT.ballInHandKitchen : TEXT.ballInHand, 'info');
    }
    this.sfx?.chalk(cue);
  }

  // --- Human input (ignored unless it is a person's turn) ---

  turnAim(delta: number): void {
    if (this.humanTurn && !this.carrying) this.aim.angle = wrapAngle(this.aim.angle + delta);
  }

  /** Points the cue at a spot on the table. */
  aimAt(point: Vec2): void {
    const cue = this.cuePosition();
    if (this.humanTurn && !this.carrying && dist(point, cue) > BALL.radius) this.aim.angle = angleOf(sub(point, cue));
  }

  setPower(power: number): void {
    if (this.humanTurn) this.aim.power = clamp01(power);
  }

  setSpin(side: number, vertical: number): void {
    if (!this.humanTurn) return;
    const spin = clampSpin(clamp(side, -1, 1), clamp(vertical, -1, 1));
    this.aim.side = spin.side;
    this.aim.vertical = spin.vertical;
  }

  callPocket(index: number): void {
    if (this.humanTurn && this.needsCall) this.aim.called = index;
  }

  /** Lets go of the cue: shoots if it was pulled back far enough. Returns true when a shot starts. */
  release(): boolean {
    if (!this.humanTurn || this.carrying) return false;
    if (this.aim.power < INPUT.minPower) {
      this.aim.power = 0;
      return false;
    }
    if (this.needsCall && this.aim.called === null) {
      this.aim.power = 0;
      this.hooks.toast(TEXT.callPocket, 'info');
      return false;
    }
    this.fire();
    return true;
  }

  /** Tries to pick up the cue ball near a table point (ball in hand). */
  pickCue(point: Vec2, reach: number): boolean {
    if (!this.humanTurn || !this.frame.cueFree || dist(point, this.cuePosition()) > reach) return false;
    this.carrying = true;
    this.cueVisual = this.cuePosition();
    return true;
  }

  moveCue(point: Vec2): void {
    if (this.carrying) this.cueVisual = point;
  }

  dropCue(): void {
    if (!this.carrying) return;
    if (this.cueVisual && this.frame.placeCue(this.cueVisual)) this.subject = this.cuePosition();
    this.carrying = false;
    this.cueVisual = null;
  }

  /** True when the carried cue ball could be dropped where it is. */
  get carryLegal(): boolean { return this.cueVisual !== null && this.frame.canPlace(this.cueVisual); }

  // --- Shot life cycle ---

  private fire(): void {
    if (this.stage !== 'aim') return;
    const a = this.aim;
    this.pendingShot = { angle: a.angle, power: a.power, side: a.side, vertical: a.vertical };
    this.stage = 'stroke';
    this.timer = 0;
  }

  /** Plays a shot at once, skipping the stroke animation (tests). */
  shootNow(shot: Shot, called: number | null = null): void {
    if (this.stage !== 'aim') return;
    Object.assign(this.aim, shot, { called });
    this.pendingShot = shot;
    this.strike();
  }

  private strike(): void {
    const shot = this.pendingShot!;
    const { frame } = this;
    const breaking = frame.rules.breaking;
    this.director.shotStruck(breaking && !this.demo, !this.practice && !this.demo && onEight(frame.rules, frame.table));
    this.sfx?.strike(this.cuePosition(), powerToSpeed(shot.power));
    this.awaitingBreakCrack = breaking;
    frame.shoot(shot, this.aim.called);
    this.stage = 'rolling';
    this.accumulator = 0;
    this.shotSeconds = 0;
    this.aim.power = 0;
  }

  private roll(dt: number): void {
    const { frame } = this;
    this.accumulator += dt * FLOW.timeScale;
    this.shotSeconds += dt;
    let steps = Math.min(PHYSICS.maxStepsPerFrame, Math.floor(this.accumulator / PHYSICS.timestep));
    this.accumulator -= steps * PHYSICS.timestep;
    for (; steps > 0 && frame.phase === 'rolling'; steps--) {
      const impacts = frame.step();
      if (impacts.length === 0) continue;
      this.sfx?.impacts(impacts, this.awaitingBreakCrack);
      for (const i of impacts) {
        if (i.kind === 'ball') this.awaitingBreakCrack = false;
        else if (i.kind === 'pocket') this.hooks.sink(i.a, i, i.b);
      }
    }
    if (frame.phase === 'rolling' && this.shotSeconds > PHYSICS.maxShotSeconds) frame.forceSettle();
    if (!frame.world.isPocketed(BALL.cue)) this.subject = this.cuePosition();
    this.director.watch(frame.world, dt);
    if (frame.phase !== 'rolling') this.settled();
  }

  private settled(): void {
    const { frame } = this;
    const verdict = frame.lastVerdict!;
    const name = this.player.name;
    const winner = verdict.state.winner;
    this.director.settled(winner !== null && verdict.state.endReason === 'eightPotted');
    if (!this.practice) {
      if (verdict.foul) {
        this.hooks.toast(TEXT.fouls[verdict.foul], 'foul');
        this.sfx?.foul();
      } else if (verdict.respotEight) {
        this.hooks.toast(TEXT.eightRespotted, 'info');
      } else if (verdict.assigned) {
        this.hooks.toast(`${name}: ${TEXT.groups[verdict.assigned]}`, 'good');
      }
    }
    if (winner !== null) {
      this.stage = 'over';
      this.timer = FLOW.resultSeconds;
      const humanWon = this.config.players[winner].persona === null;
      if (humanWon) this.sfx?.win();
      else this.sfx?.lose();
      return;
    }
    this.stage = 'settle';
    this.timer = verdict.foul && !this.practice ? FLOW.foulSeconds : FLOW.settleSeconds;
  }

  /** Advances the match by `dt` real seconds. */
  update(dt: number): void {
    if (this.stage === 'aim') {
      this.robot?.update(dt);
      this.director.idle(dt);
    } else if (this.stage === 'stroke') {
      this.timer += dt;
      if (this.timer >= CUE_LOOK.strokeSeconds) this.strike();
    } else if (this.stage === 'rolling') {
      this.cueAlpha = Math.max(0, this.cueAlpha - dt / CUE_LOOK.fadeSeconds);
      this.roll(dt);
    } else if (this.stage === 'settle') {
      this.timer -= dt;
      this.director.idle(dt);
      if (this.timer <= 0) this.beginTurn();
    } else {
      this.director.idle(dt);
      if (this.timer <= 0) return;
      this.timer -= dt;
      if (this.timer <= 0) this.hooks.over();
    }
  }
}
