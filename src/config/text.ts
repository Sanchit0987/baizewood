import type { Difficulty, Group, Mode } from './rules';

export const TITLE = 'Baizewood';
export const TAGLINE = 'Lamplight 8-Ball';

export const TEXT = {
  loading: 'Chalking up…',
  modes: {
    ai: ['Play the house', 'One frame against the computer'],
    local: ['Two players', 'Pass the cue on one screen'],
    practice: ['Practice table', 'No rules, move the cue ball freely'],
    tournament: ['Lamplight Cup', 'Beat four regulars in a row'],
  } as Record<Mode, readonly [string, string]>,
  difficulty: { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as Record<Difficulty, string>,
  difficultyNote: {
    easy: 'Full aim guide. The house misses the long ones.',
    normal: 'Short aim guide. The house pots well and plays some position.',
    hard: 'No aim guide. The house plays position and safeties.',
  } as Record<Difficulty, string>,
  groups: { solids: 'Solids', stripes: 'Stripes' } as Record<Group, string>,
  open: 'Open table',
  onEight: 'On the 8',
  fouls: {
    scratch: 'Scratch — the cue ball went in',
    noHit: 'Foul — no ball was hit',
    wrongBall: 'Foul — wrong ball hit first',
    noRail: 'Foul — nothing reached a rail',
    illegalBreak: 'Illegal break — four balls must reach a rail',
  },
  ends: {
    eightPotted: 'pocketed the 8-ball',
    eightEarly: 'sank the 8-ball too early',
    eightFoul: 'fouled while sinking the 8-ball',
    eightWrongPocket: 'put the 8-ball in the wrong pocket',
  },
  ballInHand: 'Ball in hand — drag the cue ball',
  ballInHandKitchen: 'Ball in hand behind the head string — drag the cue ball',
  callPocket: 'Tap a pocket to call it for the 8-ball',
  eightRespotted: '8-ball on the break — it goes back on the spot',
  breakShot: 'to break',
  thinking: 'is thinking…',
  safety: 'plays safe',
  help: [
    ['Aim', 'Drag on the table. In the top view the cue points at your finger.'],
    ['Fine aim', 'Slide the strip under the table for small corrections (or Shift + arrows).'],
    ['Power', 'Pull the cue handle on the right down and let go. Or hold Space.'],
    ['Spin', 'Drag the dot on the cue-ball pad: up for follow, down for draw, sides for english.'],
    ['Ball in hand', 'After a foul, drag the cue ball where you want it.'],
    ['Camera', 'Cue, Free (drag to orbit) and Top views. Wheel or pinch to zoom. Key C.'],
    ['The 8-ball', 'Clear your group, then call a pocket and sink the 8 to win.'],
  ] as readonly (readonly [string, string])[],
} as const;
