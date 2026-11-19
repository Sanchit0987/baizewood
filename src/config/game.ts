import type { GuideLevel } from './graphics';
import type { Difficulty } from './rules';

/** Aim guide shown at each difficulty. */
export const GUIDE_BY_DIFFICULTY: Record<Difficulty, GuideLevel> = { easy: 'full', normal: 'short', hard: 'off' };

export const FLOW = {
  /** Pause after the balls stop before the next turn starts, seconds. */
  settleSeconds: 0.7,
  /** Longer pause after a foul so the message can be read. */
  foulSeconds: 1.5,
  /** Pause before the result screen. */
  resultSeconds: 1.4,
  toastSeconds: 2.6,
  /** Robot: seconds to swing the cue onto its line, to pull back, and to hold before stroking. */
  robotAim: 0.7,
  robotPull: 0.45,
  robotHold: 0.15,
  /** Robot: seconds to carry the cue ball to its chosen spot. */
  robotPlace: 0.6,
  /** Fixed physics steps simulated per second of game time. */
  timeScale: 1,
  /** Speed the 8-ball must have for the winning-pot camera to cut in, m/s. */
  potCutSpeed: 0.25,
  /** How well the 8-ball must be heading at a pocket (cosine) for the cut. */
  potCutAlign: 0.985,
} as const;

export const NAMES = {
  you: 'You',
  playerOne: 'Player 1',
  playerTwo: 'Player 2',
  practice: 'Practice',
} as const;

/** Aim guide in modes without a difficulty setting. */
export const GUIDE_FIXED: { tournament: GuideLevel; practice: GuideLevel; demo: GuideLevel } = { tournament: 'short', practice: 'full', demo: 'off' };
