import { DIFFICULTIES, type Difficulty, type Mode } from '../config/rules';

export interface Record2 { played: number; won: number }

export interface Stats {
  ai: Record<Difficulty, Record2>;
  local: { played: number };
  tournament: { entered: number; titles: number; matchesWon: number };
  /** Balls pocketed by the human player (seat 0) in rule games. */
  ballsPotted: number;
  fouls: number;
  /** Most balls pocketed in one visit to the table. */
  bestRun: number;
  /** Frames won without the opponent pocketing a ball. */
  shutouts: number;
  practiceShots: number;
}

export interface FrameSummary {
  mode: Mode;
  difficulty: Difficulty;
  won: boolean;
  potted: number;
  fouls: number;
  bestRun: number;
  opponentPotted: number;
}

export function emptyStats(): Stats {
  return {
    ai: { easy: { played: 0, won: 0 }, normal: { played: 0, won: 0 }, hard: { played: 0, won: 0 } },
    local: { played: 0 },
    tournament: { entered: 0, titles: 0, matchesWon: 0 },
    ballsPotted: 0, fouls: 0, bestRun: 0, shutouts: 0, practiceShots: 0,
  };
}

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

/** Reads stored stats, ignoring anything missing or malformed. */
export function parseStats(raw: string | null): Stats {
  const stats = emptyStats();
  if (!raw) return stats;
  try {
    const data = JSON.parse(raw) as Partial<Stats> | null;
    if (!data || typeof data !== 'object') return stats;
    for (const d of DIFFICULTIES) {
      stats.ai[d].played = count(data.ai?.[d]?.played);
      stats.ai[d].won = Math.min(stats.ai[d].played, count(data.ai?.[d]?.won));
    }
    stats.local.played = count(data.local?.played);
    stats.tournament.entered = count(data.tournament?.entered);
    stats.tournament.titles = count(data.tournament?.titles);
    stats.tournament.matchesWon = count(data.tournament?.matchesWon);
    stats.ballsPotted = count(data.ballsPotted);
    stats.fouls = count(data.fouls);
    stats.bestRun = count(data.bestRun);
    stats.shutouts = count(data.shutouts);
    stats.practiceShots = count(data.practiceShots);
  } catch {
    return emptyStats();
  }
  return stats;
}

/** Returns new stats with one finished frame added. */
export function recordFrame(stats: Stats, frame: FrameSummary): Stats {
  const next: Stats = JSON.parse(JSON.stringify(stats)) as Stats;
  if (frame.mode === 'ai') {
    next.ai[frame.difficulty].played++;
    if (frame.won) next.ai[frame.difficulty].won++;
  } else if (frame.mode === 'local') {
    next.local.played++;
  } else if (frame.mode === 'tournament' && frame.won) {
    next.tournament.matchesWon++;
  }
  if (frame.mode !== 'local') {
    next.ballsPotted += frame.potted;
    next.fouls += frame.fouls;
    next.bestRun = Math.max(next.bestRun, frame.bestRun);
    if (frame.won && frame.opponentPotted === 0) next.shutouts++;
  }
  return next;
}

export const winRate = (r: Record2): number => (r.played > 0 ? r.won / r.played : 0);
