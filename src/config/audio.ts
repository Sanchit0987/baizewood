export interface ImpactSpec {
  /** Impact speed (m/s) that plays at full volume. */
  fullScale: number;
  minGain: number;
  /** Pitch rise at full strength, as a fraction. */
  pitchRise: number;
  tone: { wave: OscillatorType; from: number; to: number; decay: number; gain: number };
  noise: { filter: BiquadFilterType; frequency: number; q: number; decay: number; gain: number };
}

export const AUDIO = {
  masterGain: 0.85,
  attack: 0.002,
  silence: 0.0001,
  noiseSeconds: 1.5,
  seed: 1618,
  spatial: { refDistance: 1.2, rolloff: 0.8, maxDistance: 20 },
  /** Impacts slower than this are silent, m/s. */
  minImpact: 0.04,
  /** Most impact sounds started in one rendered frame (a break produces dozens). */
  maxPerFrame: 5,
  /** Random pitch spread between otherwise identical clicks. */
  pitchJitter: 0.06,
  /** Height of sound sources above the cloth, metres. */
  sourceHeight: 0.03,
} as const;

export const SOUNDS: Record<'click' | 'cushion' | 'strike' | 'drop', ImpactSpec> = {
  /** Two resin balls: a very short bright clack. */
  click: { fullScale: 5, minGain: 0.06, pitchRise: 0.12, tone: { wave: 'sine', from: 3100, to: 2500, decay: 0.022, gain: 0.5 }, noise: { filter: 'bandpass', frequency: 5200, q: 1.1, decay: 0.012, gain: 0.55 } },
  /** Rubber cushion: a soft low thump. */
  cushion: { fullScale: 5, minGain: 0.08, pitchRise: 0.25, tone: { wave: 'sine', from: 170, to: 85, decay: 0.09, gain: 0.7 }, noise: { filter: 'lowpass', frequency: 600, q: 0.7, decay: 0.05, gain: 0.3 } },
  /** Leather tip on the cue ball: a dry knock. */
  strike: { fullScale: 8, minGain: 0.25, pitchRise: 0.3, tone: { wave: 'triangle', from: 900, to: 380, decay: 0.035, gain: 0.55 }, noise: { filter: 'bandpass', frequency: 2000, q: 0.9, decay: 0.02, gain: 0.5 } },
  /** A ball falling onto the pocket liner. */
  drop: { fullScale: 3, minGain: 0.5, pitchRise: 0.1, tone: { wave: 'sine', from: 240, to: 70, decay: 0.16, gain: 0.8 }, noise: { filter: 'lowpass', frequency: 420, q: 1, decay: 0.12, gain: 0.5 } },
};

export const JINGLES = {
  /** Extra low crack layered under the first impact of a hard break. */
  breakBoom: { from: 190, to: 50, decay: 0.28, gain: 0.7, noise: 2600, noiseDecay: 0.09, noiseGain: 0.6, minSpeed: 4 },
  /** Knocks of a ball settling in the pocket after it drops: delays in seconds and relative gains. */
  rattle: { delays: [0.09, 0.17, 0.23], gains: [0.5, 0.3, 0.16], frequency: 150, decay: 0.07 },
  /** Chalk on the tip: a few short squeaks of band-passed noise. */
  chalk: { strokes: 3, gap: 0.11, from: 2600, to: 4200, q: 5, decay: 0.07, gain: 0.16 },
  click: { frequency: 620, decay: 0.045, gain: 0.1 },
  foul: { from: 196, to: 131, decay: 0.3, gain: 0.16 },
  /** Semitones above the root for the frame-won and frame-lost phrases. */
  root: 262,
  win: [0, 4, 7, 12, 16],
  lose: [7, 3, 0, -5],
  turn: [12],
  noteGap: 0.1,
  noteDecay: 0.5,
  gain: 0.16,
  semitone: 2 ** (1 / 12),
} as const;
