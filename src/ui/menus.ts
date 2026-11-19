import { LADDER, type Persona } from '../config/ai';
import { QUALITY, type Quality } from '../config/graphics';
import { DIFFICULTIES, MODES, type Difficulty, type Mode } from '../config/rules';
import { TAGLINE, TEXT, TITLE } from '../config/text';
import type { Settings } from '../game/settings';
import type { SeatTally } from '../game/frame';
import { winRate, type Stats } from '../rules/stats';
import type { Tournament } from '../rules/tournament';
import { button, choice, el } from './dom';
import { logoMark } from './icons';

export const logo = (): HTMLElement => el('div.logo', el('div.logo-mark', logoMark()), el('div', el('h1', TITLE), el('p', TAGLINE)));

const modeButton = (mode: Mode, onPick: (mode: Mode) => void): HTMLButtonElement => {
  const [title, note] = TEXT.modes[mode];
  const b = button('', () => onPick(mode), `mode${mode === 'ai' ? ' primary' : ''}`);
  b.append(el('strong', title), el('span', note));
  b.dataset.mode = mode;
  return b;
};

export interface MainHost { play(mode: Mode): void; setDifficulty(d: Difficulty): void; open(screen: 'stats' | 'settings' | 'help'): void }

export function mainMenu(settings: Settings, host: MainHost): HTMLElement {
  const note = el('p.note', TEXT.difficultyNote[settings.difficulty]);
  const difficulty = choice('House difficulty', DIFFICULTIES.map((d) => ({ value: d, label: TEXT.difficulty[d] })), settings.difficulty, (d) => {
    note.textContent = TEXT.difficultyNote[d];
    host.setDifficulty(d);
  });
  return el('section.panel.main',
    logo(),
    el('div.stack', ...MODES.map((m) => modeButton(m, host.play))),
    difficulty, note,
    el('div.pair.gap', button('Stats', () => host.open('stats'), 'ghost'), button('Settings', () => host.open('settings'), 'ghost')),
    el('div.stack.gap', button('How to play', () => host.open('help'), 'ghost')),
  );
}

export function helpPanel(back: () => void): HTMLElement {
  const list = el('dl.help');
  for (const [term, text] of TEXT.help) list.append(el('dt', term), el('dd', text));
  return el('section.panel.wide', el('h2', 'How to play'), list, el('div.row-btns', button('Back', back, 'primary')));
}

export interface SettingsHost { quality(q: Quality): void; callEight(on: boolean): void; mute(on: boolean): void; resetStats(): void; back(): void }

export function settingsPanel(settings: Settings, renderer: string, host: SettingsHost): HTMLElement {
  const qualities = Object.keys(QUALITY) as Quality[];
  return el('section.panel',
    el('h2', 'Settings'),
    choice('Graphics quality', qualities.map((q) => ({ value: q, label: QUALITY[q].label })), settings.quality, host.quality),
    choice('8-ball pocket', [{ value: 'call', label: 'Must be called' }, { value: 'any', label: 'Any pocket' }], settings.callEight ? 'call' : 'any', (v) => host.callEight(v === 'call')),
    choice('Sound', [{ value: 'on', label: 'On' }, { value: 'off', label: 'Muted' }], settings.muted ? 'off' : 'on', (v) => host.mute(v === 'off')),
    el('p.note', `Renderer: ${renderer === 'webgpu' ? 'WebGPU' : 'WebGL2'}. Medium targets 60 frames per second.`),
    el('div.row-btns', button('Reset stats', host.resetStats, 'ghost'), button('Back', host.back, 'primary')),
  );
}

const percent = (x: number): string => `${Math.round(x * 100)}%`;
const statRow = (label: string, value: string): HTMLElement => el('div.stat', el('span', label), el('strong', value));

export function statsPanel(stats: Stats, back: () => void): HTMLElement {
  const rows = DIFFICULTIES.map((d) => statRow(`vs house, ${TEXT.difficulty[d]}`, `${stats.ai[d].won} / ${stats.ai[d].played}${stats.ai[d].played ? ` (${percent(winRate(stats.ai[d]))})` : ''}`));
  return el('section.panel',
    el('h2', 'Stats'),
    el('div.stats', ...rows,
      statRow('Lamplight Cup titles', `${stats.tournament.titles} of ${stats.tournament.entered} entered`),
      statRow('Cup frames won', String(stats.tournament.matchesWon)),
      statRow('Two-player frames', String(stats.local.played)),
      statRow('Balls pocketed', String(stats.ballsPotted)),
      statRow('Best run', String(stats.bestRun)),
      statRow('Shutouts', String(stats.shutouts)),
      statRow('Fouls', String(stats.fouls)),
      statRow('Practice shots', String(stats.practiceShots)),
    ),
    el('div.row-btns', button('Back', back, 'primary')),
  );
}

export interface PauseHost { resume(): void; restart(): void; quit(): void; quality(q: Quality): void; mute(on: boolean): void }

export function pausePanel(settings: Settings, host: PauseHost): HTMLElement {
  const qualities = Object.keys(QUALITY) as Quality[];
  return el('section.panel.centre',
    el('h2', 'Paused'),
    el('div.stack', button('Resume', host.resume, 'primary'), button('Restart frame', host.restart), button('Quit to menu', host.quit, 'ghost')),
    choice('Graphics quality', qualities.map((q) => ({ value: q, label: QUALITY[q].label })), settings.quality, host.quality),
    choice('Sound', [{ value: 'on', label: 'On' }, { value: 'off', label: 'Muted' }], settings.muted ? 'off' : 'on', (v) => host.mute(v === 'off')),
  );
}

export interface ResultModel {
  title: string;
  detail: string;
  good: boolean;
  names: [string, string];
  tallies: [SeatTally, SeatTally];
  primary: { label: string; run(): void };
  secondary: { label: string; run(): void };
}

export function resultPanel(m: ResultModel): HTMLElement {
  const column = (name: string, t: SeatTally): HTMLElement => el('div.col', el('h3', name), statRow('Pocketed', String(t.potted)), statRow('Best run', String(t.bestRun)), statRow('Fouls', String(t.fouls)), statRow('Shots', String(t.shots)));
  return el(`section.panel.centre.result.${m.good ? 'good' : 'bad'}`,
    el('h2.big', m.title), el('p.note.lead', m.detail),
    el('div.cols', column(m.names[0], m.tallies[0]), column(m.names[1], m.tallies[1])),
    el('div.row-btns.centre', button(m.secondary.label, m.secondary.run, 'ghost'), button(m.primary.label, m.primary.run, 'primary')),
  );
}

export interface LadderHost { play(): void; quit(): void; restart(): void }

/** The cup ladder: four opponents, the one to play next highlighted. */
export function ladderPanel(t: Tournament, host: LadderHost): HTMLElement {
  const rung = (p: Persona, i: number): HTMLElement => {
    const state = i < t.round ? 'beaten' : i === t.round && t.status === 'playing' ? 'next' : t.status === 'lost' && i === t.round ? 'lostTo' : 'ahead';
    const tag = state === 'beaten' ? 'Beaten' : state === 'next' ? 'Next' : state === 'lostTo' ? 'Knocked you out' : `Round ${i + 1}`;
    return el(`div.rung.${state}`, el('span.rung-tag', tag), el('strong', p.name), el('span', p.blurb));
  };
  const heading = t.status === 'won' ? 'Lamplight Cup champion!' : t.status === 'lost' ? 'Out of the cup' : `Lamplight Cup — round ${t.round + 1} of ${t.rounds}`;
  const buttons = t.status === 'playing'
    ? [button('Leave', host.quit, 'ghost'), button(`Play ${LADDER[t.round].name}`, host.play, 'primary')]
    : [button('Menu', host.quit, 'ghost'), button('New cup', host.restart, 'primary')];
  return el(`section.panel.wide.ladder.${t.status}`,
    el('h2', heading),
    el('p.note.lead', t.status === 'playing' ? 'One frame each, short aim guide. Lose once and the run is over.' : t.status === 'won' ? 'Four regulars, four frames, one lamp.' : 'Rack them up and try again.'),
    el('div.rungs', ...LADDER.map(rung)),
    el('div.row-btns', ...buttons),
  );
}
