import { KEYS } from '../config/input';

export type KeyAction = keyof typeof KEYS;

const ACTION_OF = new Map<string, KeyAction>();
for (const [action, codes] of Object.entries(KEYS)) for (const code of codes) ACTION_OF.set(code, action as KeyAction);

/** Tracks held keys by action and reports presses and releases. */
export class Keyboard {
  private readonly held = new Set<KeyAction>();
  shift = false;

  constructor(private readonly onPress: (action: KeyAction) => void, private readonly onRelease: (action: KeyAction) => void) {
    window.addEventListener('keydown', (e) => {
      this.shift = e.shiftKey;
      const action = ACTION_OF.get(e.code);
      if (!action || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('button, input, select') && action === 'charge') return;
      e.preventDefault();
      if (e.repeat || this.held.has(action)) return;
      this.held.add(action);
      this.onPress(action);
    });
    window.addEventListener('keyup', (e) => {
      this.shift = e.shiftKey;
      const action = ACTION_OF.get(e.code);
      if (action && this.held.delete(action)) this.onRelease(action);
    });
    window.addEventListener('blur', () => this.clear());
  }

  isHeld(action: KeyAction): boolean {
    return this.held.has(action);
  }

  /** -1, 0 or 1 from a pair of opposing actions. */
  axis(negative: KeyAction, positive: KeyAction): number {
    return (this.held.has(positive) ? 1 : 0) - (this.held.has(negative) ? 1 : 0);
  }

  clear(): void {
    for (const action of [...this.held]) {
      this.held.delete(action);
      this.onRelease(action);
    }
  }
}
