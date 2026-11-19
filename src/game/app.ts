import { LADDER, LEVELS } from '../config/ai';
import { FLOW, GUIDE_BY_DIFFICULTY, GUIDE_FIXED, NAMES } from '../config/game';
import type { Quality } from '../config/graphics';
import { STORAGE, type Mode, type Seat } from '../config/rules';
import { TEXT } from '../config/text';
import { AudioEngine } from '../audio/engine';
import { Sfx } from '../audio/sfx';
import type { GameView } from '../render/view';
import { other } from '../rules/eightball';
import { parseStats, recordFrame, emptyStats, type Stats } from '../rules/stats';
import { readStore, writeStore } from '../rules/storage';
import { advance, newTournament, parseTournament, type Tournament } from '../rules/tournament';
import { el } from '../ui/dom';
import { Hud } from '../ui/hud';
import { helpPanel, ladderPanel, mainMenu, pausePanel, resultPanel, settingsPanel, statsPanel } from '../ui/menus';
import { Bridge, hudModel } from './bridge';
import { Match, type MatchConfig, type Player } from './match';
import { presentMatch } from './present';
import { saveSettings, type Settings } from './settings';

export type Screen = 'main' | 'help' | 'stats' | 'settings' | 'ladder' | 'play' | 'pause' | 'result';
export interface StartOptions { mode?: Mode; seed?: number; view?: 'cue' | 'top' | 'free' }

const HUMAN = (name: string): Player => ({ name, persona: null });

/** Top-level state machine: menus, matches, results, stats and settings. */
export class App {
  screen: Screen = 'main';
  match: Match | null = null;
  stats: Stats = parseStats(readStore(STORAGE.statsKey));
  tournament: Tournament | null = parseTournament(readStore(STORAGE.tournamentKey), LADDER.length);
  readonly audio = new AudioEngine();
  readonly sfx = new Sfx(this.audio);
  readonly bridge: Bridge;
  private readonly hud: Hud;
  private readonly menus = el('div.menus');
  private demo: Match;
  private mode: Mode = 'ai';
  private breaker: Seat = 0;
  private seed = Date.now() % 100000;
  private forcedSeed: number | null = null;

  constructor(readonly view: GameView, readonly settings: Settings, ui: HTMLElement) {
    this.audio.setMuted(settings.muted);
    this.bridge = new Bridge(view, {
      match: () => this.match, live: () => this.screen === 'play', togglePause: () => this.togglePause(),
      toggleMute: () => this.setMuted(!this.settings.muted), unlockAudio: () => this.audio.unlock(),
    });
    this.hud = new Hud({
      power: (v) => { this.audio.unlock(); this.match?.setPower(v); },
      release: () => this.match?.release(),
      fine: (d) => this.match?.turnAim(d),
      spin: (s, v) => this.match?.setSpin(s, v),
      cycleView: () => this.bridge.cycleView(),
      toggleMute: () => this.setMuted(!this.settings.muted),
      pause: () => this.togglePause(),
      callPocket: (i) => { this.match?.callPocket(i); this.sfx.click(); },
    });
    ui.append(this.hud.root, this.menus);
    this.menus.addEventListener('pointerdown', () => this.audio.unlock());
    this.menus.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) this.sfx.click(); });
    window.addEventListener('resize', () => view.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.screen === 'play') this.togglePause(); });
    this.demo = this.newDemo();
  }

  private newDemo(): Match {
    this.seed++;
    this.view.balls.shuffle(this.seed);
    const players: [Player, Player] = [{ name: LADDER[3].name, persona: LADDER[3] }, { name: LADDER[1].name, persona: LADDER[1] }];
    return new Match({ mode: 'demo', players, guide: GUIDE_FIXED.demo, callEight: true, breaker: 0, seed: this.seed }, null, {
      toast: () => undefined, sink: (id, from, pocket) => this.view.balls.sink(id, from, pocket), over: () => { if (!this.match) this.demo = this.newDemo(); },
    });
  }

  start(options: StartOptions = {}): void {
    this.forcedSeed = options.seed ?? null;
    if (options.mode) {
      this.play(options.mode, options.mode === 'tournament');
      if (options.view && this.match) this.match.view = options.view;
    } else this.show('main');
  }

  // --- Screens ---

  private show(screen: Screen): void {
    this.screen = screen;
    this.bridge.reset();
    this.menus.className = `menus ${screen}`;
    this.menus.classList.toggle('hidden', screen === 'play');
    this.hud.root.classList.toggle('hidden', this.match === null || screen === 'ladder');
    const back = (): void => this.show('main');
    if (screen === 'main') {
      this.menus.replaceChildren(mainMenu(this.settings, {
        play: (mode) => this.play(mode, false),
        setDifficulty: (d) => { this.settings.difficulty = d; saveSettings(this.settings); },
        open: (s) => this.show(s),
      }));
    } else if (screen === 'help') this.menus.replaceChildren(helpPanel(back));
    else if (screen === 'stats') this.menus.replaceChildren(statsPanel(this.stats, back));
    else if (screen === 'settings') {
      this.menus.replaceChildren(settingsPanel(this.settings, this.view.renderer, {
        quality: (q) => this.setQuality(q), mute: (on) => this.setMuted(on), back,
        callEight: (on) => { this.settings.callEight = on; saveSettings(this.settings); },
        resetStats: () => { this.stats = emptyStats(); this.saveStats(); this.show('stats'); },
      }));
    } else if (screen === 'pause') {
      this.menus.replaceChildren(pausePanel(this.settings, {
        resume: () => this.show('play'), restart: () => this.beginMatch(), quit: () => this.quit(),
        quality: (q) => this.setQuality(q), mute: (on) => this.setMuted(on),
      }));
    } else if (screen === 'ladder' && this.tournament) {
      this.menus.replaceChildren(ladderPanel(this.tournament, { play: () => this.beginMatch(), quit: () => this.quit(), restart: () => this.play('tournament', true) }));
    } else if (screen === 'play') this.menus.replaceChildren();
  }

  togglePause(): void {
    if (this.screen === 'play') this.show('pause');
    else if (this.screen === 'pause') this.show('play');
  }

  private quit(): void {
    if (this.match?.practice) {
      this.stats.practiceShots += this.match.frame.shots;
      this.saveStats();
    }
    this.match = null;
    this.hud.clearToast();
    this.demo = this.newDemo();
    this.view.rig.jump();
    this.show('main');
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.audio.setMuted(muted);
    saveSettings(this.settings);
  }

  private setQuality(quality: Quality): void {
    this.settings.quality = quality;
    saveSettings(this.settings);
    void this.view.setQuality(quality);
  }

  private saveStats(): void {
    writeStore(STORAGE.statsKey, JSON.stringify(this.stats));
  }

  // --- Matches ---

  /** Chooses a mode. The cup resumes a saved run unless `fresh`; other modes start at once. */
  play(mode: Mode, fresh: boolean): void {
    this.mode = mode;
    this.breaker = 0;
    if (mode !== 'tournament') return this.beginMatch();
    if (fresh || !this.tournament || this.tournament.status !== 'playing') {
      this.tournament = newTournament(LADDER.length);
      this.stats.tournament.entered++;
      this.saveStats();
    }
    writeStore(STORAGE.tournamentKey, JSON.stringify(this.tournament));
    this.match = null;
    this.show('ladder');
  }

  private config(): MatchConfig {
    const s = this.settings;
    const seed = this.forcedSeed ?? ++this.seed;
    const base = { callEight: s.callEight, breaker: this.breaker, seed };
    if (this.mode === 'local') return { ...base, mode: 'local', players: [HUMAN(NAMES.playerOne), HUMAN(NAMES.playerTwo)], guide: GUIDE_BY_DIFFICULTY[s.difficulty] };
    if (this.mode === 'practice') return { ...base, mode: 'practice', players: [HUMAN(NAMES.practice), HUMAN(NAMES.practice)], guide: GUIDE_FIXED.practice, breaker: 0 };
    if (this.mode === 'tournament') {
      const rival = LADDER[this.tournament?.round ?? 0];
      return { ...base, mode: 'tournament', players: [HUMAN(NAMES.you), { name: rival.name, persona: rival }], guide: GUIDE_FIXED.tournament };
    }
    const house = LEVELS[s.difficulty];
    return { ...base, mode: 'ai', players: [HUMAN(NAMES.you), { name: house.name, persona: house }], guide: GUIDE_BY_DIFFICULTY[s.difficulty] };
  }

  private beginMatch(): void {
    const config = this.config();
    this.view.balls.shuffle(config.seed);
    this.hud.clearToast();
    this.match = new Match(config, this.sfx, {
      toast: (text, tone) => this.hud.toast(text, tone, FLOW.toastSeconds),
      sink: (id, from, pocket) => this.view.balls.sink(id, from, pocket),
      over: () => this.finish(),
    });
    this.view.rig.jump();
    this.show('play');
  }

  private finish(): void {
    const m = this.match;
    if (!m) return;
    const { rules, tallies } = m.frame;
    const winner = rules.winner ?? 0;
    const reason = rules.endReason ?? 'eightPotted';
    const names: [string, string] = [m.config.players[0].name, m.config.players[1].name];
    const won = winner === 0;
    const mode = this.mode;
    this.stats = recordFrame(this.stats, { mode, difficulty: this.settings.difficulty, won, potted: tallies[0].potted, fouls: tallies[0].fouls, bestRun: tallies[0].bestRun, opponentPotted: tallies[1].potted });
    // The sentence names whoever sank the 8: the winner for a clean pot, otherwise the player who erred.
    const actor = names[reason === 'eightPotted' ? winner : other(winner)];
    const verb = TEXT.ends[reason];
    const detail = actor === NAMES.you ? `You ${verb}.` : `${actor} ${verb}.`;
    const title = mode === 'local' ? `${names[winner]} wins` : won ? 'You win!' : `${names[1]} wins`;
    let primary = { label: 'Rematch', run: (): void => { this.breaker = other(this.breaker); this.beginMatch(); } };
    if (mode === 'tournament' && this.tournament) {
      this.tournament = advance(this.tournament, won);
      if (this.tournament.status === 'won') this.stats.tournament.titles++;
      writeStore(STORAGE.tournamentKey, this.tournament.status === 'playing' ? JSON.stringify(this.tournament) : null);
      primary = { label: this.tournament.status === 'playing' ? 'Next round' : 'Cup results', run: () => { this.breaker = other(this.breaker); this.match = null; this.demo = this.newDemo(); this.show('ladder'); } };
    }
    this.saveStats();
    this.screen = 'result';
    this.menus.className = 'menus result';
    this.menus.replaceChildren(resultPanel({ title, detail, good: mode === 'local' || won, names, tallies, primary, secondary: { label: 'Menu', run: () => this.quit() } }));
  }

  /** One rendered frame. `dt` is real seconds. */
  frame(dt: number): void {
    this.sfx.frameStart();
    const paused = this.screen === 'pause';
    const m = this.match ?? this.demo;
    if (!paused) {
      this.bridge.update(dt);
      m.update(dt);
    }
    if (this.match) this.hud.update(hudModel(this.match, this.view, this.settings.muted, this.screen === 'play'), dt);
    this.view.render(presentMatch(m), paused ? 0 : dt);
    const camera = this.view.rig.camera;
    const forward = camera.getTarget().subtract(camera.position).normalize();
    this.audio.setListener(camera.position, forward);
  }
}
