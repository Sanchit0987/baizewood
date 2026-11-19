import { CAMERA } from '../config/graphics';
import { INPUT } from '../config/input';
import { BALL } from '../config/table';
import { TEXT } from '../config/text';
import { Keyboard, type KeyAction } from '../input/keyboard';
import { PointerInput } from '../input/pointer';
import type { CameraView } from '../render/camera';
import type { GameView } from '../render/view';
import { groupOf, onEight, remaining } from '../rules/eightball';
import { POCKETS } from '../table/geometry';
import type { HudModel, PlateModel } from '../ui/hud';
import type { Match } from './match';

const VIEWS: readonly CameraView[] = ['cue', 'top', 'free'];
const GROUP_IDS = { solids: [1, 2, 3, 4, 5, 6, 7], stripes: [9, 10, 11, 12, 13, 14, 15] } as const;

export interface BridgeHost {
  match(): Match | null;
  /** True while the match accepts input (not paused, no menu open). */
  live(): boolean;
  togglePause(): void;
  toggleMute(): void;
  unlockAudio(): void;
}

/** Connects pointer, touch and keyboard input to the current match and camera. */
export class Bridge {
  private readonly pointer: PointerInput;
  private readonly keys: Keyboard;

  constructor(private readonly view: GameView, private readonly host: BridgeHost) {
    const active = (): Match | null => (host.live() ? host.match() : null);
    this.pointer = new PointerInput(view.handle.canvas, {
      pickCue: (x, y, touch) => {
        host.unlockAudio();
        const m = active();
        if (!m || !m.humanTurn || !m.frame.cueFree) return false;
        const cue = m.frame.world.position(BALL.cue);
        const at = view.project(cue, BALL.radius);
        if (Math.hypot(at.x - x, at.y - y) > (touch ? INPUT.touchGrabRadius : INPUT.grabRadius)) return false;
        return m.pickCue(cue, BALL.radius);
      },
      moveCue: (x, y) => {
        const p = view.groundPoint(x, y, BALL.radius);
        if (p) host.match()?.moveCue(p);
      },
      dropCue: () => host.match()?.dropCue(),
      drag: (dx, dy, x, y) => {
        const m = active();
        if (!m) return;
        if (m.view === 'free') view.rig.orbit(dx, dy);
        else if (m.view === 'cue') {
          m.turnAim(dx * CAMERA.aimSensitivity);
          view.rig.tilt(dy);
        } else this.aimAt(m, x, y);
      },
      tap: (x, y) => {
        const m = active();
        if (m && m.view === 'top') this.aimAt(m, x, y);
      },
      zoom: (factor) => {
        const m = active();
        if (m) view.rig.zoom(factor, m.view);
      },
    }, CAMERA.wheelZoom);
    this.keys = new Keyboard((action) => this.press(action), (action) => this.release(action));
  }

  private aimAt(m: Match, x: number, y: number): void {
    const p = this.view.groundPoint(x, y, BALL.radius);
    if (p) m.aimAt(p);
  }

  cycleView(): void {
    const m = this.host.match();
    if (!m) return;
    m.view = VIEWS[(VIEWS.indexOf(m.view) + 1) % VIEWS.length];
  }

  private press(action: KeyAction): void {
    this.host.unlockAudio();
    if (action === 'pause') this.host.togglePause();
    else if (action === 'mute') this.host.toggleMute();
    else if (action === 'camera' && this.host.live()) this.cycleView();
    else if (action === 'spinReset') this.host.match()?.setSpin(0, 0);
  }

  private release(action: KeyAction): void {
    if (action === 'charge' && this.host.live()) this.host.match()?.release();
  }

  /** Applies held keys. Call once per frame with real seconds. */
  update(dt: number): void {
    const m = this.host.live() ? this.host.match() : null;
    if (!m || !m.humanTurn) return;
    const turn = this.keys.axis('left', 'right');
    if (turn !== 0) m.turnAim(turn * (this.keys.shift ? INPUT.keyAimFine : INPUT.keyAim) * dt);
    if (this.keys.isHeld('charge')) m.setPower(m.aim.power + INPUT.keyCharge * dt);
    const side = this.keys.axis('spinLeft', 'spinRight');
    const vertical = this.keys.axis('spinDown', 'spinUp');
    if (side !== 0 || vertical !== 0) m.setSpin(m.aim.side + side * INPUT.keySpin * dt, m.aim.vertical + vertical * INPUT.keySpin * dt);
  }

  reset(): void {
    this.pointer.reset();
    this.keys.clear();
  }
}

function plates(m: Match): PlateModel[] {
  const { frame } = m;
  if (m.practice) return [{ name: m.config.players[0].name, label: 'Free table', balls: [], active: true }];
  return m.config.players.map((player, seat) => {
    const group = frame.rules.groups[seat];
    const active = frame.rules.winner === null ? frame.rules.turn === seat : frame.rules.winner === seat;
    if (!group) return { name: player.name, label: TEXT.open, balls: [], active };
    const left = remaining(frame.table, group);
    const balls: { id: number; potted: boolean }[] = GROUP_IDS[group].map((id) => ({ id, potted: !left.includes(id) }));
    const cleared = left.length === 0;
    if (cleared) balls.push({ id: BALL.eight, potted: frame.table[BALL.eight].pocketed });
    return { name: player.name, label: cleared ? TEXT.onEight : TEXT.groups[group], balls, active };
  });
}

function status(m: Match): string {
  const { frame } = m;
  const name = m.player.name;
  if (m.stage !== 'aim') return '';
  if (m.robot) return m.robot.plan?.kind === 'safety' && m.robot.phase !== 'think' ? `${name} ${TEXT.safety}` : `${name} ${TEXT.thinking}`;
  if (m.practice) return '';
  if (frame.rules.breaking) return `${name} ${TEXT.breakShot}`;
  if (m.needsCall && m.aim.called === null) return TEXT.callPocket;
  if (frame.rules.ballInHand !== 'none') return TEXT.ballInHand.split(' \u2014 ')[0];
  return onEight(frame.rules, frame.table) ? `${name}: ${TEXT.onEight.toLowerCase()}` : '';
}

/** Everything the HUD shows for the current match. */
export function hudModel(m: Match, view: GameView, muted: boolean, live: boolean): HudModel {
  const human = live && m.humanTurn;
  const pockets = human && m.needsCall ? POCKETS.map((p) => view.project(p.centre)) : null;
  return {
    plates: plates(m), status: status(m), tray: m.frame.tray.map((t) => t.id).filter((id) => groupOf(id) !== null || id === BALL.eight),
    view: m.view, muted, controls: human && !m.carrying, power: m.aim.power, side: m.aim.side, vertical: m.aim.vertical, pockets, called: m.aim.called,
  };
}
