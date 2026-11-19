/** Progress through the ladder: index of the next opponent, and whether the run is over. */
export interface Tournament {
  round: number;
  rounds: number;
  status: 'playing' | 'won' | 'lost';
}

export const newTournament = (rounds: number): Tournament => ({ round: 0, rounds, status: 'playing' });

/** Advances the ladder after a frame: a win moves up a round, a loss ends the run. */
export function advance(t: Tournament, won: boolean): Tournament {
  if (t.status !== 'playing') return t;
  if (!won) return { ...t, status: 'lost' };
  const round = t.round + 1;
  return round >= t.rounds ? { ...t, round, status: 'won' } : { ...t, round };
}

export function parseTournament(raw: string | null, rounds: number): Tournament | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Tournament> | null;
    if (!data || data.status !== 'playing' || !Number.isInteger(data.round)) return null;
    const round = data.round as number;
    return round >= 0 && round < rounds ? { round, rounds, status: 'playing' } : null;
  } catch {
    return null;
  }
}
