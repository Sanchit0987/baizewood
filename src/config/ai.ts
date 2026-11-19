import type { Difficulty } from './rules';

/** How one computer player thinks and how steady its arm is. Angles in radians. */
export interface Persona {
  id: string;
  name: string;
  blurb: string;
  /** Standard deviation of the aim error. */
  aimSigma: number;
  /** Standard deviation of the power error, as a fraction. */
  powerSigma: number;
  /** Shots considered in detail, and power/spin variants tried for each. */
  candidates: number;
  variants: number;
  /** Weight of the next shot when choosing how to play this one (position play). */
  positionWeight: number;
  /** Plays a safety when the best pot is less likely than this. */
  safetyBelow: number;
  /** Safety attempts simulated. */
  safetyTries: number;
  banks: boolean;
  /** Added to every chosen power: positive for hard hitters. */
  powerBias: number;
  breakPower: number;
  /** Seconds spent looking at the table before stepping in. */
  thinkSeconds: number;
}

const DEG = Math.PI / 180;

export const LEVELS: Record<Difficulty, Persona> = {
  easy: { id: 'easy', name: 'House Player', blurb: 'Misses the long ones.', aimSigma: 1.1 * DEG, powerSigma: 0.16, candidates: 2, variants: 1, positionWeight: 0, safetyBelow: 0, safetyTries: 0, banks: false, powerBias: 0.05, breakPower: 0.8, thinkSeconds: 1.1 },
  normal: { id: 'normal', name: 'League Regular', blurb: 'Solid potting, some position.', aimSigma: 0.42 * DEG, powerSigma: 0.08, candidates: 3, variants: 3, positionWeight: 0.45, safetyBelow: 0.22, safetyTries: 10, banks: false, powerBias: 0, breakPower: 0.92, thinkSeconds: 1.2 },
  hard: { id: 'hard', name: 'Table Captain', blurb: 'Plays three shots ahead.', aimSigma: 0.13 * DEG, powerSigma: 0.03, candidates: 5, variants: 6, positionWeight: 0.9, safetyBelow: 0.4, safetyTries: 18, banks: true, powerBias: 0, breakPower: 1, thinkSeconds: 1.3 },
};

/** The tournament ladder, weakest first. Each opponent has a recognisable way of playing. */
export const LADDER: readonly Persona[] = [
  { id: 'pip', name: 'Pip Marlow', blurb: 'Cheerful beginner. Rolls everything softly and hopes.', aimSigma: 1.0 * DEG, powerSigma: 0.12, candidates: 2, variants: 1, positionWeight: 0, safetyBelow: 0, safetyTries: 0, banks: false, powerBias: -0.08, breakPower: 0.7, thinkSeconds: 1.5 },
  { id: 'dorian', name: 'Dorian Vale', blurb: 'All attack. Hits hard, banks anything, never ducks a shot.', aimSigma: 0.5 * DEG, powerSigma: 0.1, candidates: 4, variants: 2, positionWeight: 0.15, safetyBelow: 0, safetyTries: 0, banks: true, powerBias: 0.18, breakPower: 1, thinkSeconds: 0.7 },
  { id: 'mirela', name: 'Mirela Stone', blurb: 'The tactician. Hides the cue ball and waits for your mistake.', aimSigma: 0.3 * DEG, powerSigma: 0.05, candidates: 3, variants: 4, positionWeight: 0.7, safetyBelow: 0.62, safetyTries: 24, banks: false, powerBias: -0.04, breakPower: 0.85, thinkSeconds: 1.8 },
  { id: 'lamplighter', name: 'The Lamplighter', blurb: 'House champion. Precise, patient and always in position.', aimSigma: 0.1 * DEG, powerSigma: 0.025, candidates: 5, variants: 6, positionWeight: 1, safetyBelow: 0.38, safetyTries: 18, banks: true, powerBias: 0, breakPower: 1, thinkSeconds: 1.3 },
];

export const AI = {
  /** Cuts steeper than this are not attempted. */
  maxCut: 78 * DEG,
  /** How far into the pocket (past the mouth line) object balls are aimed, metres. */
  pocketDepth: 0.02,
  /** Extra slop the jaws forgive, metres. */
  jawSlop: 0.006,
  /** Tolerance multiplier for bank shots, which are less predictable. */
  bankFactor: 0.4,
  /** A bank must bounce at least this far from the nearest pocket mouth, metres. */
  bankMouthClearance: 0.16,
  /** Aim offsets (in units of half the geometric tolerance) tried to find the centre of the makeable window. */
  windowOffsets: [0, -1, 1, -2, 2] as readonly number[],
  /** Smallest and largest window step, radians. */
  minStep: 0.03 * DEG,
  maxStep: 0.5 * DEG,
  /** Iterations used to cancel throw when computing the contact point. */
  throwIterations: 3,
  /** Speed the object ball should still have when it reaches the pocket, m/s. */
  arrivalSpeed: 0.7,
  /** Power steps above the softest that pockets the ball. */
  powerSteps: [0, 0.14, 0.3] as readonly number[],
  /** Vertical tip offsets tried for position: stun, follow, draw. */
  spins: [0, 0.6, -0.6] as readonly number[],
  minPower: 0.08,
  maxPower: 0.95,
  /** Bonus value for a shot that wins the frame. */
  winValue: 2,
  /** Value of leaving the opponent nothing, relative to a pot. */
  safetyPowers: [0.12, 0.22, 0.36] as readonly number[],
  /** Lateral contact offsets for safeties, as fractions of a ball diameter. */
  safetyCuts: [0, 0.45, -0.45, 0.8, -0.8] as readonly number[],
  /** Cue-ball distances behind the contact point tried with ball in hand, metres. */
  handDistances: [0.3, 0.45, 0.65] as readonly number[],
  /** Sideways positions tried for the break, metres from the head spot. */
  breakOffset: 0.18,
  /** Longest simulated shot when planning, seconds. */
  simSeconds: 14,
  /** Milliseconds of planning per rendered frame. */
  frameBudgetMs: 7,
} as const;

export const SAFETY = {
  /** A safety is preferred to a poor pot when it leaves the opponent a chance below this. */
  accept: 0.5,
  /** Most target balls considered for a safety. */
  balls: 3,
  /** Power of the fallback shot that only tries to make a legal hit. */
  hitPower: 0.3,
  kickPower: 0.42,
  /** Corrections (radians) tried around the mirror line of a one-cushion kick. */
  kickOffsets: [0, 0.012, -0.012, 0.025, -0.025, 0.04, -0.04] as readonly number[],
  /** Most escape lines simulated. */
  hitTries: 40,
} as const;
