import { BALL_FX, CUE_LOOK } from '../config/graphics';
import { INPUT } from '../config/input';
import { BALL } from '../config/table';
import { clamp01, fromAngle, type Vec2 } from '../math/vec2';
import { strikeMotion } from '../physics/strike';
import type { BallPose } from '../render/balls';
import type { CameraShot } from '../render/camera';
import type { GuideState } from '../render/guide';
import type { RenderState } from '../render/view';
import { legalTargets } from '../rules/eightball';
import { cushionHit, predictAim } from '../sim/predict';
import type { Match } from './match';

function poses(m: Match): BallPose[] {
  const world = m.frame.world;
  const out: BallPose[] = [];
  for (let id = 0; id < BALL.count; id++) {
    const p = id === BALL.cue && m.cueVisual ? m.cueVisual : world.position(id);
    out.push({ x: p.x, z: p.z, q: world.rotation(id), pocketed: world.isPocketed(id) });
  }
  return out;
}

/** The aim guide for a person at the table: first contact from the same collision model the physics uses. */
function guide(m: Match): GuideState | null {
  if (!m.humanTurn || m.carrying) return null;
  const origin = m.cuePosition();
  const dir = fromAngle(m.aim.angle);
  const spin = strikeMotion({ angle: m.aim.angle, power: Math.max(m.aim.power, INPUT.minPower), side: m.aim.side, vertical: 0 }).wy;
  const prediction = predictAim(m.frame.table, origin, dir, spin);
  const legal = m.practice || prediction.ball === null || legalTargets(m.frame.rules, m.frame.table).includes(prediction.ball);
  const reach = (from: Vec2 | null, along: Vec2 | null): number => (from && along ? cushionHit(from, along)?.distance ?? 0 : 0);
  return { origin, dir, prediction, level: m.config.guide, legal, objectReach: reach(prediction.objectStart, prediction.objectDir), cueReach: reach(prediction.contact, prediction.cueDir) };
}

function camera(m: Match): CameraShot {
  if (m.demo) return { kind: 'menu' };
  const cut = m.director.shot();
  if (cut) return cut;
  const subject = m.carrying ? m.subject : m.cueVisual ?? m.subject;
  const watching = (m.stage !== 'aim' && m.stage !== 'stroke') || m.robot !== null;
  return { kind: 'view', view: m.view, aim: m.aim.angle, subject, watching };
}

/** Everything the renderer needs to draw the match as it stands. */
export function presentMatch(m: Match): RenderState {
  const stroking = m.stage === 'stroke';
  const k = stroking ? clamp01(m.timer / CUE_LOOK.strokeSeconds) : 0;
  const pulled = m.aim.power * CUE_LOOK.pull;
  // Pulled back while aiming, driven through the ball during the stroke, then left on its follow-through.
  const back = m.stage === 'aim' ? pulled : stroking ? pulled * (1 - k) - CUE_LOOK.address * k : -CUE_LOOK.address;
  const thinking = m.robot !== null && (m.robot.phase === 'think' || m.robot.phase === 'place');
  const visible = !m.carrying && !thinking && m.stage !== 'settle' && m.stage !== 'over' && !m.frame.world.isPocketed(BALL.cue);
  return {
    balls: poses(m),
    table: m.frame.table,
    cue: { visible, angle: m.aim.angle, back, side: m.aim.side, vertical: m.aim.vertical, alpha: m.stage === 'rolling' ? m.cueAlpha : 1 },
    guide: guide(m),
    camera: camera(m),
    cueLift: m.cueVisual ? BALL_FX.handLift : 0,
  };
}
