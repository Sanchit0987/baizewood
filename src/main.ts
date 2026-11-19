import './ui/styles.css';
import { MAX_FRAME_SECONDS, QUALITY, type Quality } from './config/graphics';
import { DIFFICULTIES, MODES, type Difficulty } from './config/rules';
import { TEXT } from './config/text';
import { App } from './game/app';
import { loadSettings } from './game/settings';
import { initPhysics } from './physics/world';
import type { RendererKind } from './render/engine';
import { GameView } from './render/view';
import { el } from './ui/dom';
import { logo } from './ui/menus';

const MILLIS = 1000;
const VIEWS = ['cue', 'top', 'free'] as const;

async function boot(): Promise<void> {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const loading = el('div.menus.loading', el('section.panel.centre', logo(), el('p', TEXT.loading)));
  ui.append(loading);

  // URL switches for testing: ?mode=ai&difficulty=hard&quality=low&renderer=webgl2&mute=1&seed=7&view=top
  const params = new URLSearchParams(location.search);
  const settings = loadSettings();
  const quality = params.get('quality');
  if (quality && quality in QUALITY) settings.quality = quality as Quality;
  if (params.has('mute')) settings.muted = true;
  const difficulty = DIFFICULTIES.find((d) => d === (params.get('difficulty') as Difficulty | null));
  if (difficulty) settings.difficulty = difficulty;
  const renderer = params.get('renderer');
  const prefer: RendererKind | null = renderer === 'webgl2' || renderer === 'webgpu' ? renderer : null;

  const [view] = await Promise.all([GameView.create(canvas, settings.quality, prefer), initPhysics()]);
  const app = new App(view, settings, ui);
  let last = performance.now();
  view.handle.engine.runRenderLoop(() => {
    const now = performance.now();
    app.frame(Math.min(MAX_FRAME_SECONDS, (now - last) / MILLIS));
    last = now;
  });
  app.start({
    mode: MODES.find((m) => m === params.get('mode')),
    seed: Number(params.get('seed')) || undefined,
    view: VIEWS.find((v) => v === params.get('view')),
  });
  loading.remove();
  (window as unknown as { baizewood: unknown }).baizewood = { app, view };
}

boot().catch((error: unknown) => {
  console.error(error);
  const ui = document.getElementById('ui');
  if (ui) ui.replaceChildren(el('div.menus.loading', el('section.panel.centre', el('h2', 'Could not start'), el('p.note', String(error)))));
});
