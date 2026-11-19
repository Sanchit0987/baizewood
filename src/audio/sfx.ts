import { AUDIO, JINGLES, SOUNDS } from '../config/audio';
import type { Vec2 } from '../math/vec2';
import type { Impact } from '../physics/world';
import type { AudioEngine, Point3 } from './engine';

const lift = (p: Vec2): Point3 => ({ x: p.x, y: AUDIO.sourceHeight, z: p.z });

/** Game sound effects, all synthesised and placed in the room where they happen. */
export class Sfx {
  /** Counts of each kind started since `frameStart`, for tests and voice limiting. */
  readonly played = { click: 0, cushion: 0, pocket: 0, strike: 0, chalk: 0, breakShot: 0 };
  private budget: number = AUDIO.maxPerFrame;

  constructor(private readonly audio: AudioEngine) {}

  /** Call once per rendered frame to reset the voice budget. */
  frameStart(): void {
    this.budget = AUDIO.maxPerFrame;
  }

  /** Tip on cue ball. A hard break adds a low crack on the first rack contact (see `impacts`). */
  strike(at: Vec2, speed: number): void {
    this.played.strike++;
    this.audio.impact(SOUNDS.strike, lift(at), speed);
  }

  /** Sounds for the impacts of one physics step. `breaking` marks the first contact of a break shot. */
  impacts(impacts: readonly Impact[], breaking: boolean): void {
    let boomed = false;
    for (const i of impacts) {
      if (i.kind === 'pocket') {
        this.pocket(i);
        continue;
      }
      if (i.speed < AUDIO.minImpact || this.budget <= 0) continue;
      this.budget--;
      if (i.kind === 'ball') {
        this.played.click++;
        this.audio.impact(SOUNDS.click, lift(i), i.speed);
        if (breaking && !boomed && i.speed > JINGLES.breakBoom.minSpeed) {
          boomed = true;
          this.breakBoom(i);
        }
      } else {
        this.played.cushion++;
        this.audio.impact(SOUNDS.cushion, lift(i), i.speed);
      }
    }
  }

  private breakBoom(at: Vec2): void {
    const b = JINGLES.breakBoom;
    this.played.breakShot++;
    this.audio.sweep(b.from, b.to, b.decay, b.gain, 0, 'sine', null, lift(at));
    this.audio.noiseBurst('bandpass', b.noise, b.noise / 2, 0.8, b.noiseDecay, b.noiseGain, 0, null, lift(at));
  }

  /** A ball dropping: thud on the liner, then a few knocks as it settles. */
  private pocket(i: Impact): void {
    this.played.pocket++;
    const at = lift(i);
    this.audio.impact(SOUNDS.drop, at, Math.max(i.speed, SOUNDS.drop.fullScale / 2));
    const r = JINGLES.rattle;
    r.delays.forEach((delay, n) => this.audio.sweep(r.frequency, r.frequency / 2, r.decay, r.gains[n], delay, 'sine', null, at));
  }

  /** Chalking the tip before a visit to the table. */
  chalk(at: Vec2): void {
    this.played.chalk++;
    const c = JINGLES.chalk;
    for (let n = 0; n < c.strokes; n++) {
      const [from, to] = n % 2 === 0 ? [c.from, c.to] : [c.to, c.from];
      this.audio.noiseBurst('bandpass', from, to, c.q, c.decay, c.gain, n * c.gap, null, { x: at.x, y: AUDIO.sourceHeight * 4, z: at.z });
    }
  }

  private phrase(semitones: readonly number[]): void {
    semitones.forEach((s, n) => {
      const f = JINGLES.root * JINGLES.semitone ** s;
      this.audio.sweep(f, f, JINGLES.noteDecay, JINGLES.gain, n * JINGLES.noteGap, 'triangle');
    });
  }

  win(): void { this.phrase(JINGLES.win); }
  lose(): void { this.phrase(JINGLES.lose); }
  turn(): void { this.phrase(JINGLES.turn); }

  foul(): void {
    const f = JINGLES.foul;
    this.audio.sweep(f.from, f.to, f.decay, f.gain, 0, 'sawtooth');
  }

  click(): void {
    const c = JINGLES.click;
    this.audio.sweep(c.frequency, c.frequency, c.decay, c.gain, 0, 'sine');
  }
}
