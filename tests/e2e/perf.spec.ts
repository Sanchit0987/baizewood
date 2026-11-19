import { test } from '@playwright/test';
import { HUMAN_READY, openGame, settle, waitFor } from './helpers';

/**
 * Prints measured frame times per quality preset, at rest and during a break shot, with the
 * browser's frame cap lifted so the numbers show renderer cost. Informational: GPUs and load vary.
 */
test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] } });
for (const quality of ['low', 'medium', 'high']) {
  test(`frame rate on ${quality}`, async ({ page }) => {
    await openGame(page, `&mode=practice&seed=3&quality=${quality}`, 'play');
    await waitFor(page, HUMAN_READY);
    await settle(page, 3000);
    const sample = (): Promise<{ fps: number; p95: number }> => page.evaluate(() => new Promise<{ fps: number; p95: number }>((resolve) => {
      const times: number[] = [];
      let last = performance.now();
      const tick = (now: number): void => {
        times.push(now - last);
        last = now;
        if (times.length < 240) requestAnimationFrame(tick);
        else {
          times.sort((a, b) => a - b);
          resolve({ fps: 1000 / (times.reduce((a, b) => a + b, 0) / times.length), p95: times[Math.floor(times.length * 0.95)] });
        }
      };
      requestAnimationFrame(tick);
    }));
    const idle = await sample();
    await page.evaluate(() => (window as any).baizewood.app.match.shootNow({ angle: 0, power: 1, side: 0, vertical: 0 }));
    const stats = await sample();
    const info = await page.evaluate(() => {
      const { view } = (window as any).baizewood;
      const c = document.createElement('canvas').getContext('webgl2');
      const ext = c?.getExtension('WEBGL_debug_renderer_info');
      return { renderer: view.renderer, gpu: ext ? String(c!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown', size: `${view.handle.engine.getRenderWidth()}x${view.handle.engine.getRenderHeight()}` };
    });
    console.log(`[perf] ${quality}: idle ${idle.fps.toFixed(1)} fps (p95 ${idle.p95.toFixed(1)} ms), break ${stats.fps.toFixed(1)} fps, p95 frame ${stats.p95.toFixed(1)} ms, ${info.renderer}, ${info.size}, ${info.gpu}`);
  });
}
