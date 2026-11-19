import type { CameraView } from '../render/camera';
import { Controls, type ControlHost } from './controls';
import { button, el } from './dom';
import { ballIcon } from './icons';

export interface PlateModel { name: string; label: string; balls: { id: number; potted: boolean }[]; active: boolean }
export interface HudModel {
  plates: PlateModel[];
  status: string;
  tray: number[];
  view: CameraView;
  muted: boolean;
  controls: boolean;
  power: number;
  side: number;
  vertical: number;
  /** Screen positions of pocket-call markers, or null when no call is needed. */
  pockets: { x: number; y: number }[] | null;
  called: number | null;
}
export interface HudHost extends ControlHost {
  cycleView(): void;
  toggleMute(): void;
  pause(): void;
  callPocket(index: number): void;
}

const VIEW_LABEL: Record<CameraView, string> = { cue: 'Cue view', free: 'Free view', top: 'Top view' };

/** In-game overlay: player plates with the turn indicator, tray, toasts, pocket markers and shot controls. */
export class Hud {
  readonly root: HTMLElement;
  private readonly plates: HTMLElement[] = [];
  private readonly status = el('div.status');
  private readonly tray = el('div.tray');
  private readonly toastNode = el('div.toast.hidden');
  private readonly viewButton: HTMLButtonElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly markers: HTMLButtonElement[] = [];
  private readonly markerLayer = el('div.markers');
  private readonly controls: Controls;
  private cache = '';
  private trayCache = '';
  private toastTimer = 0;

  constructor(host: HudHost) {
    this.plates = [el('div.plate.left'), el('div.plate.right')];
    this.viewButton = button('', () => host.cycleView(), 'small ghost view-btn');
    this.muteButton = button('', () => host.toggleMute(), 'small ghost icon');
    const pause = button('II', () => host.pause(), 'small ghost icon');
    pause.setAttribute('aria-label', 'Pause');
    this.controls = new Controls(host);
    for (let i = 0; i < 6; i++) {
      const marker = button('', () => host.callPocket(i), 'marker');
      marker.setAttribute('aria-label', `Call pocket ${i + 1}`);
      this.markers.push(marker);
      this.markerLayer.append(marker);
    }
    this.status.setAttribute('role', 'status');
    this.toastNode.setAttribute('role', 'alert');
    this.root = el('div.hud',
      this.markerLayer,
      el('div.topbar', this.plates[0], el('div.middle', this.status), this.plates[1]),
      el('div.tools', this.viewButton, this.muteButton, pause),
      this.toastNode,
      el('div.tray-wrap', el('span.tray-label', 'Pocketed'), this.tray),
      this.controls.root,
    );
  }

  toast(text: string, tone: string, seconds: number): void {
    this.toastNode.textContent = text;
    this.toastNode.className = `toast ${tone}`;
    this.toastTimer = seconds;
  }

  clearToast(): void {
    this.toastTimer = 0;
    this.toastNode.classList.add('hidden');
  }

  update(m: HudModel, dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastNode.classList.add('hidden');
    }
    const key = JSON.stringify([m.plates, m.status, m.view, m.muted]);
    if (key !== this.cache) {
      this.cache = key;
      m.plates.forEach((p, i) => {
        const plate = this.plates[i];
        plate.classList.toggle('active', p.active);
        plate.classList.toggle('hidden', false);
        plate.replaceChildren(el('div.plate-name', p.name), el('div.plate-group', p.label), el('div.plate-balls', ...p.balls.map((b) => ballIcon(b.id, b.potted))));
      });
      this.plates[1].classList.toggle('hidden', m.plates.length < 2);
      this.status.textContent = m.status;
      this.viewButton.textContent = VIEW_LABEL[m.view];
      this.viewButton.setAttribute('aria-label', `Camera: ${VIEW_LABEL[m.view]}. Press to change.`);
      this.muteButton.textContent = m.muted ? '\u{1F507}' : '\u{1F50A}';
      this.muteButton.setAttribute('aria-label', m.muted ? 'Unmute' : 'Mute');
    }
    const trayKey = m.tray.join(',');
    if (trayKey !== this.trayCache) {
      this.trayCache = trayKey;
      this.tray.replaceChildren(...m.tray.map((id) => ballIcon(id)));
    }
    this.markerLayer.classList.toggle('hidden', m.pockets === null);
    if (m.pockets) {
      m.pockets.forEach((p, i) => {
        const marker = this.markers[i];
        marker.style.transform = `translate(${p.x}px, ${p.y}px)`;
        marker.classList.toggle('on', m.called === i);
      });
    }
    this.controls.update(m.controls, m.power, m.side, m.vertical);
  }
}
