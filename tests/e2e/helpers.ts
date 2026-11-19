import type { Page } from '@playwright/test';

export const SHOTS = 'tests/e2e/screenshots';

/** Opens the game with URL switches and waits for the requested screen. Returns collected page errors. */
export async function openGame(page: Page, query = '', screen = 'main'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/?mute=1${query}`);
  await page.waitForFunction((want) => (window as any).baizewood?.app.screen === want, screen, { timeout: 120_000 });
  return errors;
}

/** Lets textures and the HDRI finish loading and a few frames render. */
export const settle = (page: Page, ms = 1500): Promise<void> => page.waitForTimeout(ms);
export const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${SHOTS}/${name}.png` });

export const waitFor = (page: Page, test: string, timeout = 60_000): Promise<unknown> => page.waitForFunction(test, null, { timeout });
/** True when a person can aim and shoot. */
export const HUMAN_READY = `(() => { const m = window.baizewood.app.match; return !!m && m.humanTurn; })()`;
