/** All lengths in metres. x runs along the table, z across it, y is up; the cloth is y = 0. */
export const BALL = {
  radius: 0.028575,
  mass: 0.17,
  /** Cue ball plus fifteen object balls. */
  count: 16,
  cue: 0,
  eight: 8,
  lastSolid: 7,
} as const;

export const TABLE = {
  /** Playing surface between cushion noses (an 8 ft table). */
  length: 2.24,
  width: 1.12,
  /** Nose to the back of the cushion rubber. */
  cushionDepth: 0.05,
  cushionHeight: 0.037,
  corner: {
    /** Opening between the two cushion noses. */
    mouth: 0.128,
    /** Angle between the rail line and the jaw facing. */
    facingDegrees: 38,
    /** How far the centre of the hole sits outside the corner of the playing surface, per axis. */
    centreOffset: 0.026,
    radius: 0.06,
  },
  side: {
    mouth: 0.138,
    facingDegrees: 76,
    centreOffset: 0.052,
    radius: 0.056,
  },
  /** Solid wall behind the cushions and pockets that nothing may pass. */
  backstopOffset: 0.14,
  backstopThickness: 0.1,
  /** Head string and foot spot as fractions of the half length from the centre. */
  headString: -0.5,
  footSpot: 0.5,
} as const;

export const RACK = {
  /** Gap left between racked balls so the solver starts without overlap. */
  gap: 0.0002,
  rows: 5,
  /** Random jitter applied to each racked ball, as in a hand-set rack. */
  jitter: 0.0001,
  /** Distance between candidate spots when a ball must be re-spotted. */
  spotStep: 0.004,
} as const;
