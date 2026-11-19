export const INPUT = {
  /** Screen distance within which a press picks up the cue ball, pixels. */
  grabRadius: 34,
  touchGrabRadius: 46,
  /** Pointer travel below this still counts as a tap. */
  tapSlop: 7,
  /** Radians of aim per pixel on the fine-aim strip. */
  finePerPixel: 0.00028,
  /** Radians per second while an arrow key is held, and the slow rate with Shift. */
  keyAim: 0.9,
  keyAimFine: 0.06,
  /** Power gained per second while Space is held. */
  keyCharge: 0.7,
  /** Tip offset per second while a spin key is held. */
  keySpin: 1.4,
  /** Pulls shorter than this cancel the shot. */
  minPower: 0.04,
} as const;

export const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  charge: ['Space'],
  camera: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM'],
  spinUp: ['KeyI'],
  spinDown: ['KeyK'],
  spinLeft: ['KeyJ'],
  spinRight: ['KeyL'],
  spinReset: ['KeyO'],
} as const;
