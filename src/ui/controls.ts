import { INPUT } from '../config/input';
import { clamp, clamp01 } from '../math/vec2';
import { el } from './dom';

export interface ControlHost {
  power(value: number): void;
  /** The power handle was let go. */
  release(): void;
  fine(delta: number): void;
  spin(side: number, vertical: number): void;
}

/** Captures a pointer on an element and reports drags until it is released. */
function track(node: HTMLElement, on: { start?: (e: PointerEvent) => void; move: (e: PointerEvent, dx: number, dy: number) => void; end?: (cancelled: boolean) => void }): void {
  let active: number | null = null;
  let last = { x: 0, y: 0 };
  node.addEventListener('pointerdown', (e) => {
    if (active !== null) return;
    active = e.pointerId;
    last = { x: e.clientX, y: e.clientY };
    try { node.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    e.preventDefault();
    on.start?.(e);
  });
  node.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    on.move(e, e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
  });
  const finish = (cancelled: boolean) => (e: PointerEvent): void => {
    if (e.pointerId !== active) return;
    active = null;
    on.end?.(cancelled);
  };
  node.addEventListener('pointerup', finish(false));
  node.addEventListener('pointercancel', finish(true));
}

/** Shot controls: pull-back power handle, fine-aim strip and the cue-ball spin pad. */
export class Controls {
  readonly root: HTMLElement;
  private readonly lever: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly label: HTMLElement;
  private readonly pad: HTMLElement;
  private readonly dot: HTMLElement;
  private readonly spinLabel: HTMLElement;
  private readonly strip: HTMLElement;
  private stripOffset = 0;
  private grab = 0;

  constructor(host: ControlHost) {
    this.knob = el('div.lever-knob');
    this.fill = el('div.lever-fill');
    this.label = el('span.lever-label', 'Pull');
    this.lever = el('div.lever', this.fill, this.knob);
    this.lever.setAttribute('role', 'slider');
    this.lever.setAttribute('aria-label', 'Shot power: pull down and release to shoot');
    // The lever is vertical beside the table, or horizontal under it on portrait screens.
    const fromEvent = (e: PointerEvent): number => {
      const r = this.lever.getBoundingClientRect();
      const k = this.knob.getBoundingClientRect();
      return this.sideways()
        ? clamp01((e.clientX - r.left - this.grab) / Math.max(1, r.width - k.width))
        : clamp01((e.clientY - r.top - this.grab) / Math.max(1, r.height - k.height));
    };
    track(this.lever, {
      start: (e) => {
        // Grabbing the knob keeps the finger's offset on it; pressing the track jumps the knob there.
        const k = this.knob.getBoundingClientRect();
        const [at, from, size] = this.sideways() ? [e.clientX, k.left, k.width] : [e.clientY, k.top, k.height];
        this.grab = at >= from && at <= from + size ? at - from : size / 2;
        host.power(fromEvent(e));
      },
      move: (e) => host.power(fromEvent(e)),
      end: (cancelled) => { if (cancelled) host.power(0); else host.release(); },
    });

    this.dot = el('div.spin-dot');
    this.pad = el('div.spin-pad', el('div.spin-cross'), this.dot);
    this.pad.setAttribute('aria-label', 'Cue-ball spin: drag the dot. Double-tap to centre.');
    this.spinLabel = el('span.spin-label', 'Centre');
    const spinAt = (e: PointerEvent): void => {
      const r = this.pad.getBoundingClientRect();
      const half = r.width / 2;
      host.spin(clamp((e.clientX - r.left - half) / half, -1, 1), clamp(-(e.clientY - r.top - half) / half, -1, 1));
    };
    track(this.pad, { start: spinAt, move: spinAt });
    this.pad.addEventListener('dblclick', () => host.spin(0, 0));

    this.strip = el('div.fine', el('div.fine-ticks'), el('span.fine-label', 'Fine aim'));
    this.strip.setAttribute('aria-label', 'Fine aim: slide left or right');
    track(this.strip, {
      move: (_e, dx) => {
        this.stripOffset += dx;
        (this.strip.firstElementChild as HTMLElement).style.backgroundPositionX = `${this.stripOffset}px`;
        host.fine(dx * INPUT.finePerPixel);
      },
    });

    this.root = el('div.controls',
      el('div.spin', this.pad, this.spinLabel),
      this.strip,
      el('div.power', this.lever, this.label),
    );
  }

  private sideways(): boolean {
    return this.lever.clientWidth > this.lever.clientHeight;
  }

  /** Reflects the current aim state. */
  update(visible: boolean, power: number, side: number, vertical: number): void {
    this.root.classList.toggle('hidden', !visible);
    if (!visible) return;
    const sideways = this.sideways();
    const travel = sideways ? this.lever.clientWidth - this.knob.offsetWidth : this.lever.clientHeight - this.knob.offsetHeight;
    this.knob.style.transform = sideways ? `translateX(${power * travel}px)` : `translateY(${power * travel}px)`;
    this.fill.style.setProperty('--p', `${power * 100}%`);
    this.label.textContent = power > 0 ? `${Math.round(power * 100)}%` : 'Pull';
    this.lever.setAttribute('aria-valuenow', String(Math.round(power * 100)));
    this.dot.style.left = `${50 + side * 38}%`;
    this.dot.style.top = `${50 - vertical * 38}%`;
    this.spinLabel.textContent = spinName(side, vertical);
  }
}

const DEAD = 0.18;

/** Plain-language name of a tip position. */
export function spinName(side: number, vertical: number): string {
  const v = vertical > DEAD ? 'Follow' : vertical < -DEAD ? 'Draw' : '';
  const s = side > DEAD ? 'right' : side < -DEAD ? 'left' : '';
  if (!v && !s) return 'Centre';
  if (!v) return s === 'right' ? 'Right english' : 'Left english';
  return s ? `${v} + ${s}` : v;
}
