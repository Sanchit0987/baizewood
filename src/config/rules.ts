export type Group = 'solids' | 'stripes';
export type Mode = 'ai' | 'local' | 'practice' | 'tournament';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Seat = 0 | 1;

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
export const MODES: readonly Mode[] = ['ai', 'local', 'practice', 'tournament'];

export const RULES = {
  /** Object balls that must reach a cushion for a break without a pot to be legal. */
  breakRailBalls: 4,
  groupSize: 7,
} as const;

export const STORAGE = {
  statsKey: 'baizewood.stats.v1',
  settingsKey: 'baizewood.settings.v1',
  tournamentKey: 'baizewood.tournament.v1',
} as const;
