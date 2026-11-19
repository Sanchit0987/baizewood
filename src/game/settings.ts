import { DEFAULT_QUALITY, QUALITY, type Quality } from '../config/graphics';
import { DIFFICULTIES, STORAGE, type Difficulty } from '../config/rules';
import { readStore, writeStore } from '../rules/storage';

export interface Settings {
  quality: Quality;
  muted: boolean;
  difficulty: Difficulty;
  /** The 8-ball must be called. */
  callEight: boolean;
}

export const defaultSettings = (): Settings => ({ quality: DEFAULT_QUALITY, muted: false, difficulty: 'normal', callEight: true });

/** Merges stored values over the defaults, discarding anything invalid. */
export function parseSettings(raw: string | null): Settings {
  const base = defaultSettings();
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as Partial<Settings> | null;
    if (!data || typeof data !== 'object') return base;
    if (data.quality && data.quality in QUALITY) base.quality = data.quality;
    if (typeof data.muted === 'boolean') base.muted = data.muted;
    if (data.difficulty && DIFFICULTIES.includes(data.difficulty)) base.difficulty = data.difficulty;
    if (typeof data.callEight === 'boolean') base.callEight = data.callEight;
  } catch {
    return defaultSettings();
  }
  return base;
}

export const loadSettings = (): Settings => parseSettings(readStore(STORAGE.settingsKey));
export const saveSettings = (settings: Settings): void => writeStore(STORAGE.settingsKey, JSON.stringify(settings));
