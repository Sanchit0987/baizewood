export const PHYSICS = {
  /** Fixed simulation step in seconds. */
  timestep: 1 / 240,
  gravity: 9.81,
  /** Most fixed steps run in one rendered frame before the simulation is allowed to lag. */
  maxStepsPerFrame: 10,
  /** A shot is force-settled after this long. */
  maxShotSeconds: 40,
  solverIterations: 8,
  /** Rapier contact tolerances as fractions of its length unit. */
  allowedError: 0.0002,
  predictionDistance: 0.001,
  /** Look-ahead for speculative cushion contacts, so a fast ball never sinks into the rubber. */
  softCcd: 0.01,
  /** Most exact ball-to-ball contacts resolved inside one fixed step (a break needs a few dozen). */
  maxContactsPerStep: 96,
  /** Sub-intervals shorter than this are not worth a solver step, seconds. */
  minSubstep: 1e-6,
} as const;

/** Cloth model: Coulomb sliding until the contact point stops slipping, then rolling resistance. */
export const CLOTH = {
  slide: 0.2,
  roll: 0.013,
  /** Deceleration of spin about the vertical axis, rad/s^2. */
  spinDecel: 14,
  /** Contact-point slip below this counts as pure rolling, m/s. */
  slipEpsilon: 0.003,
  restSpeed: 0.004,
  restSpin: 0.25,
} as const;

export const CONTACT = {
  ballRestitution: 0.95,
  ballFriction: 0.06,
  /** Closing speeds below this are treated as a dead (inelastic) touch, m/s. */
  deadSpeed: 0.02,
  cushionRestitution: 0.78,
  cushionFriction: 0.16,
  /** Unexplained velocity change in one step that counts as an impact, m/s. */
  jolt: 0.015,
  /** Extra separation still treated as touching when pairing impacts. */
  slack: 0.004,
  /** Speed removed from a ball that rattles in the jaws of a pocket (fraction kept per impact). */
  moment: 2 / 5,
} as const;

export const CUE = {
  minSpeed: 0.3,
  maxSpeed: 8.6,
  /** Exponent of the power-to-speed curve; above 1 gives finer control of soft shots. */
  powerCurve: 1.5,
  /** Largest tip offset from centre as a fraction of the ball radius (beyond this a real cue miscues). */
  maxOffset: 0.5,
} as const;
