import { AUDIO, type ImpactSpec } from '../config/audio';
import { createRng } from '../math/random';
import { clamp01 } from '../math/vec2';

export interface Point3 { x: number; y: number; z: number }

/** Thin Web Audio wrapper: lazy context, master mute, shared noise buffer and spatial one-shots. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private readonly rng = createRng(AUDIO.seed);

  /** Must be called from a user gesture; safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : AUDIO.masterGain;
      this.master.connect(this.ctx.destination);
      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * AUDIO.noiseSeconds), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = this.rng.range(-1, 1);
      this.noise = buffer;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get running(): boolean { return this.ctx?.state === 'running'; }
  get isMuted(): boolean { return this.muted; }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : AUDIO.masterGain, this.ctx.currentTime, AUDIO.attack);
  }

  /** Places the listener at the camera. */
  setListener(position: Point3, forward: Point3): void {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      l.positionX.value = position.x; l.positionY.value = position.y; l.positionZ.value = position.z;
      l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(position.x, position.y, position.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  /** A panner at a world position feeding the master bus (or the bus itself when no position is given). */
  private at(position: Point3 | null): AudioNode | null {
    if (!this.ctx || !this.master) return null;
    if (!position) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = AUDIO.spatial.refDistance;
    p.rolloffFactor = AUDIO.spatial.rolloff;
    p.maxDistance = AUDIO.spatial.maxDistance;
    p.positionX.value = position.x; p.positionY.value = position.y; p.positionZ.value = position.z;
    p.connect(this.master);
    return p;
  }

  private envelope(param: AudioParam, peak: number, decay: number, at: number): void {
    param.setValueAtTime(AUDIO.silence, at);
    param.exponentialRampToValueAtTime(Math.max(peak, AUDIO.silence), at + AUDIO.attack);
    param.exponentialRampToValueAtTime(AUDIO.silence, at + AUDIO.attack + decay);
  }

  /** Plays a tone-plus-noise impact at a world position, scaled by `amount` (impact speed). */
  impact(spec: ImpactSpec, position: Point3 | null, amount: number, delay = 0, scale = 1): void {
    const out = this.at(position);
    if (!out) return;
    const level = clamp01(amount / spec.fullScale);
    const gain = (spec.minGain + (1 - spec.minGain) * level) * scale;
    const pitch = (1 + spec.pitchRise * level) * (1 + this.rng.range(-AUDIO.pitchJitter, AUDIO.pitchJitter));
    this.sweep(spec.tone.from * pitch, spec.tone.to * pitch, spec.tone.decay, spec.tone.gain * gain, delay, spec.tone.wave, out);
    this.noiseBurst(spec.noise.filter, spec.noise.frequency * pitch, spec.noise.frequency * pitch, spec.noise.q, spec.noise.decay, spec.noise.gain * gain, delay, out);
  }

  /** An oscillator gliding between two frequencies. With a position it is spatial, otherwise on the master bus. */
  sweep(from: number, to: number, decay: number, gain: number, delay = 0, wave: OscillatorType = 'triangle', out: AudioNode | null = null, position: Point3 | null = null): void {
    const ctx = this.ctx;
    const target = out ?? this.at(position);
    if (!ctx || !target) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + decay);
    this.envelope(g.gain, gain, decay, now);
    osc.connect(g).connect(target);
    osc.start(now);
    osc.stop(now + decay + AUDIO.attack * 2);
  }

  /** Filtered noise whose filter frequency glides between two values. */
  noiseBurst(filter: BiquadFilterType, from: number, to: number, q: number, decay: number, gain: number, delay = 0, out: AudioNode | null = null, position: Point3 | null = null): void {
    const ctx = this.ctx;
    const target = out ?? this.at(position);
    if (!ctx || !target || !this.noise) return;
    const now = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = this.noise;
    src.loop = true;
    f.type = filter;
    f.frequency.setValueAtTime(from, now);
    f.frequency.exponentialRampToValueAtTime(to, now + decay);
    f.Q.value = q;
    this.envelope(g.gain, gain, decay, now);
    src.connect(f).connect(g).connect(target);
    src.start(now, this.rng.range(0, AUDIO.noiseSeconds / 2));
    src.stop(now + decay + AUDIO.attack * 2);
  }
}
