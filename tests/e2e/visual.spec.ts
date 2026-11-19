import { expect, test } from '@playwright/test';
import { HUMAN_READY, openGame, settle, shot, waitFor } from './helpers';

test('main menu over the demo table', async ({ page }) => {
  const errors = await openGame(page);
  await settle(page, 3000);
  await expect(page.locator('.logo h1')).toHaveText('Baizewood');
  await shot(page, 'menu');
  expect(errors).toEqual([]);
});

for (const view of ['cue', 'top', 'free']) {
  test(`table in the ${view} view`, async ({ page }) => {
    const errors = await openGame(page, `&mode=ai&difficulty=easy&seed=7&view=${view}`, 'play');
    await waitFor(page, HUMAN_READY);
    await settle(page, 2500);
    await shot(page, `view-${view}`);
    expect(errors).toEqual([]);
  });
}

test('WebGL2 fallback renders the table', async ({ page }) => {
  const errors = await openGame(page, '&mode=practice&seed=7&renderer=webgl2', 'play');
  await waitFor(page, HUMAN_READY);
  await settle(page, 2500);
  expect(await page.evaluate(() => (window as any).baizewood.view.renderer)).toBe('webgl2');
  await shot(page, 'webgl2');
  expect(errors).toEqual([]);
});
