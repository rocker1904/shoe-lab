/**
 * What `OVERSCAN_PX` has to be, measured rather than picked — the one constant in the windowed
 * table with no assertion behind it, which is why this rig is tracked rather than scratch
 * (docs/hunting.md §The rig).
 *
 *   node hunt/overscan.mjs [engine[,engine...]]
 *   IN_DOCKER=1 sh hunt/in-docker.sh node hunt/overscan.mjs
 *
 * **The bound is a distance, not a row count.** The plan is recomputed from a `scroll` event, so the
 * DOM at any instant holds the window for wherever the page was when the last event was delivered.
 * Travel `d` past that point is covered exactly while `d <= OVERSCAN_PX`; past it the viewport is
 * over a spacer. So the thing to measure is how far the page moves between one scroll event and the
 * next, per animation frame, under the hardest gestures there are.
 *
 * Reported per gesture, because they are different regimes and the design treats them differently: a
 * wheel or a scrollbar drag is what a runner READS through, and a keyed jump (`End`) is a teleport
 * no overscan can cover in general. `app/src/lib/virtual.ts` owns the number, states every reading
 * this produced and argues what they buy; `hunt/overscan-3engine.log` is the run those readings were
 * taken from. Re-run this when the fleet's row heights move, when the default column set changes, or
 * when an engine's scroll delivery does.
 */
import { start } from './serve-real.mjs';
import { chromium, firefox, webkit } from 'playwright';

const ENGINES = { chromium, firefox, webkit };
const picked = (process.argv[2]?.split(',')
  ?? (process.env['IN_DOCKER'] ? ['chromium', 'firefox', 'webkit'] : ['chromium', 'firefox']));

/**
 * **What is measured is the scroll RATE, in px per animation frame** — not the lag between a scroll
 * and its plan, which came out 0px in every engine and every gesture here and would have been a
 * flattering answer to the wrong question. A synthetic wheel event is delivered on the main thread
 * and Svelte's flush is a microtask, so in a driven browser the plan is always applied in the frame
 * the scroll happened in. What the overscan actually defends against is the case a rig cannot
 * synthesise: a compositor scrolling the page while the main thread is busy, where the DOM keeps
 * showing the plan for wherever the page was when the main thread last got a turn. That is
 * rate x stall, so the rate is the half worth measuring and the stall is the half to choose.
 */
const INSTRUMENT = () => {
  window.__travel = { max: 0, samples: 0, last: window.scrollY };
  const tick = () => {
    const d = Math.abs(window.scrollY - window.__travel.last);
    if (window.__travel.samples) window.__travel.max = Math.max(window.__travel.max, d);
    window.__travel.last = window.scrollY;
    window.__travel.samples++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const RESET = () => { window.__travel.max = 0; window.__travel.samples = 0; };
const READ = () => ({ max: Math.round(window.__travel.max), samples: window.__travel.samples });

const server = await start({ build: false });

for (const engine of picked) {
  const browser = await ENGINES[engine].launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(server.url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.evaluate(INSTRUMENT);
  console.log(`\n=== ${engine}`);

  const gestures = [
    ['wheel fling (30 x 600px, no pause)', async () => {
      await page.mouse.move(700, 500);
      for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 600);
      await page.waitForTimeout(600);
    }],
    ['wheel notches (120px x 60)', async () => {
      await page.mouse.move(700, 500);
      for (let i = 0; i < 60; i++) await page.mouse.wheel(0, 120);
      await page.waitForTimeout(600);
    }],
    ['Page Down x20', async () => {
      await page.keyboard.press('Escape');
      for (let i = 0; i < 20; i++) await page.keyboard.press('PageDown');
      await page.waitForTimeout(600);
    }],
    ['scrollbar drag, top to bottom', async () => {
      const box = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      await page.mouse.move(box.w - 7, 20);
      await page.mouse.down();
      for (let y = 20; y < box.h - 20; y += 6) await page.mouse.move(box.w - 7, y);
      await page.mouse.up();
      await page.waitForTimeout(600);
    }],
    ['End (a jump, not a scroll)', async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.keyboard.press('End');
      await page.waitForTimeout(800);
    }],
  ];

  for (const [name, run] of gestures) {
    await page.evaluate(() => window.scrollTo(0, 3000));
    await page.waitForTimeout(300);
    await page.evaluate(RESET);
    await run();
    const r = await page.evaluate(READ);
    console.log(`  ${name.padEnd(34)} worst px per frame ${String(r.max).padStart(6)}px `
      + `over ${r.samples} frames`);
  }

  await browser.close();
}

await server.stop();
