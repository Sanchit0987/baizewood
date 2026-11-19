import { INPUT } from '../config/input';

export interface PointerHost {
  /** Pointer pressed at a screen point: return true to start carrying the cue ball. */
  pickCue(x: number, y: number, touch: boolean): boolean;
  moveCue(x: number, y: number): void;
  dropCue(): void;
  /** One-finger drag that is not carrying the cue ball. */
  drag(dx: number, dy: number, x: number, y: number): void;
  /** Press and release without moving. */
  tap(x: number, y: number): void;
  zoom(factor: number): void;
}

/** Mouse and touch gestures on the canvas: drag, tap, carry the cue ball, wheel or pinch to zoom. */
export class PointerInput {
  private readonly pointers = new Map<number, { x: number; y: number; travel: number }>();
  private carrying: number | null = null;
  private pinch = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly host: PointerHost, private readonly wheelZoom: number) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private readonly down = (e: PointerEvent): void => {
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety (drags that leave the canvas); some pointers cannot be captured.
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, travel: 0 });
    if (this.pointers.size > 1) {
      this.release();
      this.pinch = this.spread();
    } else if (this.host.pickCue(e.clientX, e.clientY, e.pointerType === 'touch')) {
      this.carrying = e.pointerId;
    }
  };

  private readonly move = (e: PointerEvent): void => {
    const last = this.pointers.get(e.pointerId);
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last.x = e.clientX;
    last.y = e.clientY;
    last.travel += Math.hypot(dx, dy);
    if (this.carrying === e.pointerId) {
      this.host.moveCue(e.clientX, e.clientY);
    } else if (this.pointers.size > 1) {
      const spread = this.spread();
      if (this.pinch > 0 && spread > 0) this.host.zoom(this.pinch / spread);
      this.pinch = spread;
    } else if (last.travel > INPUT.tapSlop) {
      this.host.drag(dx, dy, e.clientX, e.clientY);
    }
  };

  private readonly up = (e: PointerEvent): void => {
    const last = this.pointers.get(e.pointerId);
    const wasCarrying = this.carrying === e.pointerId;
    if (wasCarrying) this.release();
    else if (last && last.travel <= INPUT.tapSlop && this.pointers.size === 1) this.host.tap(e.clientX, e.clientY);
    this.pointers.delete(e.pointerId);
    this.pinch = 0;
  };

  private readonly cancel = (e: PointerEvent): void => {
    if (this.carrying === e.pointerId) this.release();
    this.pointers.delete(e.pointerId);
    this.pinch = 0;
  };

  private readonly wheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.host.zoom(Math.exp(e.deltaY * this.wheelZoom));
  };

  private release(): void {
    if (this.carrying === null) return;
    this.carrying = null;
    this.host.dropCue();
  }

  /** Distance between the first two active pointers. */
  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Drops any gesture in progress (used when a menu opens). */
  reset(): void {
    this.release();
    this.pointers.clear();
    this.pinch = 0;
  }
}
