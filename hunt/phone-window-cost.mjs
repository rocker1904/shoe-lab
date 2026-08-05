/**
 * Comparative real-fleet cost of the stacked phone list before and after windowing.
 *
 *   node hunt/phone-window-cost.mjs <control-root> <windowed-root> [engine[,engine...]]
 *
 * Each root is built and served with its own real `data/shoes.json`. A drag sample ends after
 * Svelte's queued flush and a forced table layout; a scroll sample wraps the app's window scroll
 * listeners and ends after their queued flush. These are comparative timings, not CI assertions.
 */
import { resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { start } from './serve-real.mjs';
import { measurePhoneGroupHeights } from '../app/src/lib/row-height.ts';

const ENGINES = { chromium, firefox, webkit };
const roots = [process.argv[2], process.argv[3]].map((p) => p && resolve(p));
if (!roots[0] || !roots[1]) throw new Error('pass the control and windowed worktree roots');
const picked = process.argv[4]?.split(',') ?? ['chromium', 'firefox'];
const round = (n) => Math.round(n * 100) / 100;

for (const engine of picked) {
  const browser = await ENGINES[engine].launch();
  console.log(`\n=== ${engine}`);
  let fleetEntries = null;
  for (const [i, root] of roots.entries()) {
    const server = await start({ port: 4180 + i, root });
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await context.addInitScript(() => {
      window.__shoeLabScrollCosts = [];
      const add = window.addEventListener.bind(window);
      window.addEventListener = ((type, listener, options) => {
        if (type !== 'scroll' || typeof listener !== 'function') return add(type, listener, options);
        return add(type, function wrapped(event) {
          const before = performance.now();
          const answer = listener.call(this, event);
          queueMicrotask(() => window.__shoeLabScrollCosts.push(performance.now() - before));
          return answer;
        }, options);
      });
    });
    const page = await context.newPage();
    await page.goto(server.url);
    await page.waitForSelector('[data-testid="shoe-table-mobile"] tbody tr.shoe');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    await page.evaluate(() => new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.waitForSelector('.sidebar .range .plot');

    const result = await page.evaluate(async () => {
      const table = document.querySelector('[data-testid="shoe-table-mobile"]');
      const body = table.querySelector('tbody');
      const restRows = body.querySelectorAll('tr').length;
      const restNodes = body.querySelectorAll('*').length;
      const entries = [...body.querySelectorAll('tr.shoe')].map((shoe) => ({
        name: shoe.querySelector('strong')?.textContent ?? '',
        metadata: [...shoe.querySelectorAll('.meta')].map((m) => m.textContent ?? ''),
        discontinued: !!shoe.querySelector('.disc-tag'),
      }));
      const plot = document.querySelector('.sidebar .range .plot');
      if (!plot) throw new Error('no range plot mounted');
      const box = plot.getBoundingClientRect();
      const drag = [];
      plot.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: box.left + 1, clientY: box.top + box.height / 2,
      }));
      for (let n = 0; n < 24; n++) {
        const before = performance.now();
        window.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          clientX: box.left + box.width * (0.08 + (n % 8) * 0.012),
          clientY: box.top + box.height / 2,
        }));
        await Promise.resolve();
        await Promise.resolve();
        table.getBoundingClientRect();
        drag.push(performance.now() - before);
      }
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

      document.querySelector('.scrim')?.click();
      await Promise.resolve();
      window.__shoeLabScrollCosts.length = 0;
      const bottom = document.documentElement.scrollHeight - innerHeight;
      for (let n = 0; n < 36; n++) {
        window.scrollTo(0, bottom * n / 35);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      }
      const scroll = window.__shoeLabScrollCosts;
      return {
        entries,
        restRows,
        restNodes,
        rows: body.querySelectorAll('tr').length,
        nodes: body.querySelectorAll('*').length,
        spacers: body.querySelectorAll('tr.spacer').length,
        dragMedian: drag.slice(4).sort((a, b) => a - b)[Math.floor((drag.length - 4) / 2)],
        dragWorst: Math.max(...drag.slice(4)),
        scrollMedian: scroll.length ? scroll.sort((a, b) => a - b)[Math.floor(scroll.length / 2)] : 0,
        scrollWorst: scroll.length ? Math.max(...scroll) : 0,
      };
    });
    if (!i) fleetEntries = result.entries;
    const measurement = i ? await page.evaluate(({ source, entries }) => {
      const measure = new Function(`return (${source})`)();
      const samples = [];
      for (let n = 0; n < 9; n++) {
        const before = performance.now();
        if (!measure(entries)) throw new Error('phone group measurement declined');
        samples.push(performance.now() - before);
      }
      return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    }, { source: measurePhoneGroupHeights.toString(), entries: fleetEntries }) : null;
    console.log(`  ${i ? 'windowed' : 'control '} rest ${String(result.restRows).padStart(4)} rows / ${String(result.restNodes).padStart(5)} nodes; `
      + `filtered ${String(result.rows).padStart(4)} rows / ${String(result.nodes).padStart(5)} nodes, `
      + `spacers ${result.spacers}; drag ${round(result.dragMedian)}ms median / ${round(result.dragWorst)}ms worst; `
      + `scroll ${round(result.scrollMedian)}ms median / ${round(result.scrollWorst)}ms worst`
      + (measurement === null ? '' : `; measure 455 groups ${round(measurement)}ms median`));
    await context.close();
    await server.stop();
  }
  await browser.close();
}
