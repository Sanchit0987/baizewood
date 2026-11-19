import { expect, test, type Page } from '@playwright/test';
import { HUMAN_READY, openGame, settle, shot, waitFor } from './helpers';

const info = (page: Page): Promise<any> => page.evaluate(() => {
  const { app } = (window as any).baizewood;
  const m = app.match;
  return m ? { screen: app.screen, stage: m.stage, shots: m.frame.shots, turn: m.frame.rules.turn, angle: m.aim.angle, power: m.aim.power, side: m.aim.side, vertical: m.aim.vertical, view: m.view, hand: m.frame.rules.ballInHand, cue: m.frame.world.position(0), winner: m.frame.rules.winner, called: m.aim.called, tray: m.frame.tray.length } : { screen: app.screen };
});
const box = async (page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> => (await page.locator(selector).boundingBox())!;
/** Puts chosen balls on the table (everything else pocketed) through the game's own world. */
const arrange = (page: Page, placed: Record<number, [number, number]>, rules: Record<string, unknown> = {}): Promise<void> => page.evaluate(([p, r]) => {
  const m = (window as any).baizewood.app.match;
  const table = Array.from({ length: 16 }, (_, id) => ((p as any)[id] ? { id, x: (p as any)[id][0], z: (p as any)[id][1], pocketed: false } : { id, x: 0, z: 0, pocketed: true }));
  m.frame.world.load(table);
  m.frame.table = m.frame.world.snapshot();
  Object.assign(m.frame.rules, { breaking: false, ballInHand: 'none' }, r);
}, [placed, rules] as const);

test('mouse: drag aims, fine strip nudges, spin pad sets english, pulling the handle shoots', async ({ page }) => {
  const errors = await openGame(page, '&mode=ai&difficulty=easy&seed=7', 'play');
  await waitFor(page, HUMAN_READY);
  await settle(page);
  const start = await info(page);
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(560, 300, { steps: 5 });
  await page.mouse.up();
  const dragged = await info(page);
  expect(Math.abs(dragged.angle - start.angle)).toBeGreaterThan(0.1);

  const fine = await box(page, '.fine');
  await page.mouse.move(fine.x + fine.width / 2, fine.y + fine.height / 2);
  await page.mouse.down();
  await page.mouse.move(fine.x + fine.width / 2 + 50, fine.y + fine.height / 2, { steps: 5 });
  await page.mouse.up();
  const nudged = await info(page);
  const nudge = Math.abs(nudged.angle - dragged.angle);
  expect(nudge).toBeGreaterThan(0.005);
  expect(nudge).toBeLessThan(0.03);

  const pad = await box(page, '.spin-pad');
  await page.mouse.click(pad.x + pad.width * 0.8, pad.y + pad.height * 0.75);
  const spun = await info(page);
  expect(spun.side).toBeGreaterThan(0.3);
  expect(spun.vertical).toBeLessThan(-0.3);
  await expect(page.locator('.spin-label')).toHaveText('Draw + right');

  // Aim back at the rack with the keyboard-free path: reset angle through the strip is slow, so set it directly.
  await page.evaluate(() => { (window as any).baizewood.app.match.aim.angle = 0; });
  const knob = await box(page, '.lever-knob');
  const lever = await box(page, '.lever');
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
  await page.mouse.down();
  await page.mouse.move(knob.x + knob.width / 2, lever.y + lever.height * 0.75, { steps: 8 });
  const pulled = await info(page);
  expect(pulled.power).toBeGreaterThan(0.5);
  await expect(page.locator('.lever-label')).toHaveText(/^\d+%$/);
  await shot(page, 'aiming');
  await page.mouse.up();
  await waitFor(page, `window.baizewood.app.match.frame.shots === 1`);
  // The break triggers the automatic camera cut.
  expect(await page.evaluate(() => (window as any).baizewood.app.match.director.cuts.break)).toBe(1);
  await page.waitForTimeout(700);
  await shot(page, 'break-cut');
  await waitFor(page, `window.baizewood.app.match.stage !== 'rolling'`);
  expect(errors).toEqual([]);
});

test('a short pull cancels the shot', async ({ page }) => {
  await openGame(page, '&mode=practice&seed=3', 'play');
  await waitFor(page, HUMAN_READY);
  const knob = await box(page, '.lever-knob');
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
  await page.mouse.down();
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2 + 4);
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect((await info(page)).shots).toBe(0);
});

test('top view: clicking the table points the cue there; free view orbits; wheel zooms', async ({ page }) => {
  await openGame(page, '&mode=practice&seed=3&view=top', 'play');
  await waitFor(page, HUMAN_READY);
  await settle(page);
  const target = await page.evaluate(() => (window as any).baizewood.view.project({ x: 0.4, z: 0.3 }));
  await page.mouse.click(target.x, target.y);
  const a = await info(page);
  expect(a.angle).toBeCloseTo(Math.atan2(0.3 - a.cue.z, 0.4 - a.cue.x), 1);
  await page.locator('.view-btn').click();
  expect((await info(page)).view).toBe('free');
  const yaw = (): Promise<number> => page.evaluate(() => (window as any).baizewood.view.rig.freeYaw);
  const before = await yaw();
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(560, 320, { steps: 5 });
  await page.mouse.up();
  expect(Math.abs((await yaw()) - before)).toBeGreaterThan(0.5);
  const distance = (): Promise<number> => page.evaluate(() => (window as any).baizewood.view.rig.freeDistance);
  const far = await distance();
  await page.mouse.wheel(0, -400);
  expect(await distance()).toBeLessThan(far);
  expect((await info(page)).angle).toBeCloseTo(a.angle, 5);
});

test('keyboard: arrows aim, holding Space charges and releasing shoots, C changes view, P pauses, M mutes', async ({ page }) => {
  await openGame(page, '&mode=practice&seed=3', 'play');
  await waitFor(page, HUMAN_READY);
  await settle(page);
  const a = await info(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  expect((await info(page)).angle).toBeGreaterThan(a.angle + 0.1);
  await page.keyboard.press('KeyC');
  expect((await info(page)).view).toBe('top');
  await page.keyboard.press('KeyP');
  await expect(page.locator('.menus h2')).toHaveText('Paused');
  await shot(page, 'pause');
  await page.keyboard.down('Space');
  await page.waitForTimeout(300);
  await page.keyboard.up('Space');
  expect((await info(page)).shots).toBe(0); // paused: nothing happens
  await page.keyboard.press('KeyP');
  expect((await info(page)).screen).toBe('play');
  await page.keyboard.press('KeyM');
  expect(await page.evaluate(() => (window as any).baizewood.app.settings.muted)).toBe(false);
  await page.keyboard.down('Space');
  await page.waitForTimeout(500);
  await page.keyboard.up('Space');
  await waitFor(page, `window.baizewood.app.match.frame.shots === 1`);
});

test('touch on a phone: drag aims, the handle under the table shoots, pinch zooms', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = await openGame(page, '&mode=ai&difficulty=easy&seed=7&view=top', 'play');
  await waitFor(page, HUMAN_READY);
  await settle(page);
  await shot(page, 'mobile-portrait');
  const before = await info(page);
  const fire = (selector: string, type: string, x: number, y: number, id = 5): Promise<void> => page.evaluate(([s, t, cx, cy, pid]) => {
    document.querySelector(s as string)!.dispatchEvent(new PointerEvent(t as string, { pointerId: pid as number, pointerType: 'touch', isPrimary: true, clientX: cx as number, clientY: cy as number, bubbles: true, button: 0, buttons: t === 'pointerup' ? 0 : 1 }));
  }, [selector, type, x, y, id] as const);
  // Drag on the table in the top view: the cue follows the finger.
  const target = await page.evaluate(() => (window as any).baizewood.view.project({ x: 0.2, z: 0.35 }));
  await fire('canvas', 'pointerdown', target.x + 30, target.y + 30);
  for (let i = 1; i <= 4; i++) await fire('canvas', 'pointermove', target.x + 30 - i * 7.5, target.y + 30 - i * 7.5);
  await fire('canvas', 'pointerup', target.x, target.y);
  const aimed = await info(page);
  expect(aimed.angle).not.toBeCloseTo(before.angle, 2);
  expect(aimed.angle).toBeCloseTo(Math.atan2(0.35 - aimed.cue.z, 0.2 - aimed.cue.x), 1);
  // Pinch out with two fingers zooms the cue view in.
  await page.locator('.view-btn').click();
  await page.locator('.view-btn').click();
  expect((await info(page)).view).toBe('cue');
  const zoom = (): Promise<number> => page.evaluate(() => (window as any).baizewood.view.rig.cueDistance);
  const wide = await zoom();
  await fire('canvas', 'pointerdown', 150, 300, 1);
  await fire('canvas', 'pointerdown', 240, 300, 2);
  await fire('canvas', 'pointermove', 100, 300, 1);
  await fire('canvas', 'pointermove', 290, 300, 2);
  await fire('canvas', 'pointerup', 100, 300, 1);
  await fire('canvas', 'pointerup', 290, 300, 2);
  expect(await zoom()).toBeLessThan(wide);
  // The power handle is horizontal on a portrait screen.
  await page.evaluate(() => { (window as any).baizewood.app.match.aim.angle = 0; });
  const lever = await box(page, '.lever');
  expect(lever.width).toBeGreaterThan(lever.height);
  const y = lever.y + lever.height / 2;
  await fire('.lever', 'pointerdown', lever.x + 20, y);
  for (let i = 1; i <= 6; i++) await fire('.lever', 'pointermove', lever.x + 20 + (i * (lever.width * 0.7)) / 6, y);
  expect((await info(page)).power).toBeGreaterThan(0.5);
  await fire('.lever', 'pointerup', lever.x + lever.width * 0.7, y);
  await waitFor(page, `window.baizewood.app.match.frame.shots === 1`);
  expect(errors).toEqual([]);
  await context.close();
});

test('foul: a scratch shows the message, passes the turn and the house plays with ball in hand', async ({ page }) => {
  const errors = await openGame(page, '&mode=ai&difficulty=normal&seed=7', 'play');
  await waitFor(page, HUMAN_READY);
  // Cue ball straight into the corner pocket, object balls elsewhere.
  await arrange(page, { 0: [0.8, 0.3], 3: [-0.5, 0.2], 12: [-0.5, -0.2], 8: [0, 0] }, { groups: ['solids', 'stripes'] });
  await page.evaluate(() => (window as any).baizewood.app.match.shootNow({ angle: Math.atan2(0.586 - 0.3, 1.146 - 0.8), power: 0.4, side: 0, vertical: 0 }));
  await expect(page.locator('.toast')).toHaveText(/Scratch/, { timeout: 20_000 });
  await expect(page.locator('.toast')).toHaveClass(/foul/);
  await shot(page, 'foul');
  await waitFor(page, `window.baizewood.app.match.frame.rules.turn === 1 && window.baizewood.app.match.stage === 'aim'`);
  await expect(page.locator('.plate.right')).toHaveClass(/active/);
  await expect(page.locator('.status')).toHaveText(/thinking/);
  await expect(page.locator('.controls')).toBeHidden();
  // The house places the cue ball, shoots, and play continues.
  await waitFor(page, `window.baizewood.app.match.frame.shots === 2`, 30_000);
  await waitFor(page, `window.baizewood.app.match.stage === 'aim'`, 60_000);
  expect(errors).toEqual([]);
});

test('ball in hand: the cue ball can be dragged to a legal spot only', async ({ page }) => {
  await openGame(page, '&mode=ai&difficulty=easy&seed=7&view=top', 'play');
  await waitFor(page, HUMAN_READY);
  await arrange(page, { 0: [-0.5, 0], 3: [0.5, 0.2], 12: [0.5, -0.2], 8: [0, 0.3] }, { groups: ['solids', 'stripes'], ballInHand: 'anywhere' });
  await settle(page, 600);
  const at = (x: number, z: number): Promise<{ x: number; y: number }> => page.evaluate(([px, pz]) => (window as any).baizewood.view.project({ x: px, z: pz }, 0.0286), [x, z] as const);
  const from = await at(-0.5, 0);
  const to = await at(0.1, -0.2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await shot(page, 'ball-in-hand');
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const moved = await info(page);
  expect(moved.cue.x).toBeCloseTo(0.1, 1);
  expect(moved.cue.z).toBeCloseTo(-0.2, 1);
  // Dropping it on another ball is refused: it stays where it was.
  const onBall = await at(0.5, 0.2);
  await page.mouse.move(to.x, to.y);
  await page.mouse.down();
  await page.mouse.move(onBall.x, onBall.y, { steps: 6 });
  await page.mouse.up();
  expect((await info(page)).cue.x).toBeCloseTo(moved.cue.x, 3);
  expect((await info(page)).shots).toBe(0);
});

test('8-ball: a pocket must be called, the winning pot cuts the camera and the result offers a rematch', async ({ page }) => {
  const errors = await openGame(page, '&mode=ai&difficulty=easy&seed=7&view=top', 'play');
  await waitFor(page, HUMAN_READY);
  await arrange(page, { 0: [0.3, 0.1], 8: [0.8, 0.38], 12: [-0.5, -0.2] }, { groups: ['solids', 'stripes'] });
  await settle(page, 600);
  await expect(page.locator('.status')).toHaveText(/call/i);
  await expect(page.locator('.plate.left .plate-group')).toHaveText('On the 8');
  // Releasing without a call does not shoot.
  await page.evaluate(() => { const m = (window as any).baizewood.app.match; m.setPower(0.5); m.release(); });
  expect((await info(page)).shots).toBe(0);
  await shot(page, 'call-pocket');
  await page.locator('.marker').nth(5).click();
  expect((await info(page)).called).toBe(5);
  await page.evaluate(() => {
    const m = (window as any).baizewood.app.match;
    m.aim.angle = Math.atan2(1.146 - 0.38 - 0.1 - 0.215, 1.146 - 0.3 - 0.33);
  });
  // Aim through the real predictor: sweep to the angle whose predicted object line points at the pocket.
  await page.evaluate(() => {
    const m = (window as any).baizewood.app.match;
    const cue = m.frame.world.position(0);
    const eight = m.frame.table[8];
    const pocket = { x: 1.146, z: 0.586 };
    const d = Math.hypot(pocket.x - eight.x, pocket.z - eight.z);
    const ghost = { x: eight.x - ((pocket.x - eight.x) / d) * 0.05715, z: eight.z - ((pocket.z - eight.z) / d) * 0.05715 };
    m.aim.angle = Math.atan2(ghost.z - cue.z, ghost.x - cue.x);
    m.setPower(0.45);
    m.release();
  });
  await waitFor(page, `window.baizewood.app.match.frame.shots === 1`);
  await waitFor(page, `window.baizewood.app.match.director.cuts.pot === 1`, 15_000);
  await shot(page, 'winning-pot');
  await waitFor(page, `window.baizewood.app.screen === 'result'`, 30_000);
  await expect(page.locator('.result h2')).toHaveText('You win!');
  await shot(page, 'result');
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('baizewood.stats.v1')!));
  expect(stats.ai.easy).toEqual({ played: 1, won: 1 });
  await page.getByRole('button', { name: 'Rematch' }).click();
  await waitFor(page, `window.baizewood.app.screen === 'play' && window.baizewood.app.match.frame.shots === 0`);
  // After a rematch the other player breaks.
  expect((await info(page)).turn).toBe(1);
  expect(errors).toEqual([]);
});

test('menus: every mode starts, the cup shows its ladder, stats and settings persist', async ({ page }) => {
  const errors = await openGame(page);
  await page.getByRole('radio', { name: 'Hard' }).click();
  await page.getByRole('button', { name: /Lamplight Cup/ }).click();
  await expect(page.locator('.rung')).toHaveCount(4);
  await expect(page.locator('.rung.next strong')).toHaveText('Pip Marlow');
  await settle(page, 800);
  await shot(page, 'ladder');
  await page.getByRole('button', { name: /Play Pip/ }).click();
  await waitFor(page, HUMAN_READY);
  await expect(page.locator('.plate.right .plate-name')).toHaveText('Pip Marlow');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart frame' }).click();
  await waitFor(page, HUMAN_READY);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to menu' }).click();
  await page.getByRole('button', { name: /Two players/ }).click();
  await waitFor(page, HUMAN_READY);
  await expect(page.locator('.plate.right .plate-name')).toHaveText('Player 2');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to menu' }).click();
  await page.getByRole('button', { name: 'Stats' }).click();
  await expect(page.locator('.stat').filter({ hasText: 'Lamplight Cup titles' })).toContainText('0 of 1 entered');
  await shot(page, 'stats');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'How to play' }).click();
  await shot(page, 'help');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.reload();
  await waitFor(page, `window.baizewood?.app.screen === 'main'`, 120_000);
  await expect(page.getByRole('radio', { name: 'Hard' })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => (window as any).baizewood.app.tournament)).toMatchObject({ round: 0, status: 'playing' });
  expect(errors).toEqual([]);
});

test('the house plays a whole turn on its own: thinks, strokes, and hands the table back', async ({ page }) => {
  const errors = await openGame(page, '&mode=ai&difficulty=hard&seed=7', 'play');
  await waitFor(page, HUMAN_READY);
  await arrange(page, { 0: [0, 0], 12: [0.5, 0.25], 3: [-0.6, -0.2], 8: [0.1, -0.4] }, { groups: ['solids', 'stripes'], turn: 1 });
  await page.evaluate(() => { const m = (window as any).baizewood.app.match; m.beginTurn(); });
  await waitFor(page, `window.baizewood.app.match.robot?.phase === 'pull'`, 30_000);
  await shot(page, 'house-shooting');
  await waitFor(page, `window.baizewood.app.match.frame.tray.length === 1`, 30_000);
  expect(await page.evaluate(() => (window as any).baizewood.app.match.frame.tray[0])).toEqual({ id: 12, by: 1 });
  await expect(page.locator('.tray .ball')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('sound: strike, clicks, cushions, pockets and chalk are all triggered by a break', async ({ page }) => {
  await openGame(page, '&mode=practice&seed=3', 'play');
  await waitFor(page, HUMAN_READY);
  await page.keyboard.press('KeyM'); // unmute (the helper opens muted)
  await page.mouse.click(500, 300); // user gesture unlocks audio
  await page.evaluate(() => (window as any).baizewood.app.match.shootNow({ angle: 0, power: 1, side: 0, vertical: 0 }));
  await waitFor(page, `window.baizewood.app.match.stage !== 'rolling'`, 40_000);
  const played = await page.evaluate(() => ({ ...(window as any).baizewood.app.sfx.played, running: (window as any).baizewood.app.audio.running }));
  expect(played.running).toBe(true);
  expect(played.strike).toBe(1);
  expect(played.breakShot).toBe(1);
  expect(played.click).toBeGreaterThan(5);
  expect(played.cushion).toBeGreaterThan(3);
  expect(played.chalk).toBeGreaterThan(0);
});
