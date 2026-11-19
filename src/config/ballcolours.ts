import { LOOK } from './graphics';
import { BALL } from './table';

/** Colour of a numbered ball: 1-7 solids, 9-15 the same colours as stripes. */
export function ballColour(id: number): string {
  if (id === BALL.cue) return LOOK.cueWhite;
  if (id === BALL.eight) return LOOK.eight;
  return LOOK.ballColours[(id - 1) % BALL.eight];
}
