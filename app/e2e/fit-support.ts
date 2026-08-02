import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import type { ShoesFile } from '../../shared/types.js';
import { indexTests } from '../src/lib/dataset';
import { desktopMinWidth, fitModel } from '../src/lib/fit';

/**
 * The one thing that stops the fit model rotting: it is arithmetic over committed font tables, and
 * nothing in the unit suite can notice when the browser stops agreeing with it. So the specs mount
 * the real desktop table, ask the engine for its min-content width, and compare.
 *
 * Shared rather than written twice because the model has to be held to all THREE engines and the
 * projects are split by file: `smoke.spec.ts` is Chromium — the engine the tables were measured in,
 * where a regenerated table shows up first — and `cross-browser.spec.ts` is Firefox and WebKit,
 * where the same numbers have to survive metrics nobody measured them against.
 */

const FIXTURE: ShoesFile = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures/shoes.json'), 'utf8')) as ShoesFile;

/**
 * Widest measured disagreement between the model and a rendered table is 2.0px, over eight column
 * sets on the real 450-shoe fleet in Chromium and Firefox (`.hunt/fixlog-f11.md`). Four is that with
 * room, and small enough that a regenerated font table or a changed padding fails here rather than
 * quietly moving the width at which the rendering switches.
 */
export const FIT_TOLERANCE_PX = 4;

/** The column sets the model is held to: the default view, the narrowest thing there is, a set of
 *  phrase columns whose width is the fleet's rather than the labels', and a wide one. */
export const FIT_SETS: Record<string, string[]> = {
  default: ['releasedAt', 'score', 'msrpGbp', 'heel-stack', 'plate', 'energy-return-heel',
    'toebox-width-widest-part', 'weight'],
  minimal: ['score'],
  phrases: ['releasedAt', 'plate', 'tongue-gusset-type'],
  wide: ['releasedAt', 'score', 'msrpGbp', 'heel-stack', 'plate', 'energy-return-heel',
    'toebox-width-widest-part', 'weight', 'shock-absorption-heel', 'outsole-durability',
    'heel-counter-stiffness'],
};

/**
 * The model's number and the engine's, for one column set. The engine's is read by asking the table
 * for `width: min-content` — the same question the model answers — and restoring it, so nothing the
 * page does afterwards is measured through a table that has been resized.
 *
 * The window is wide enough that the desktop rendering is up for every set here; the point is to
 * compare the two widths, not to test the switch, which the ladder beside it does.
 */
export async function measureFit(page: Page, cols: string[]): Promise<{ model: number; rendered: number }> {
  await page.goto(`/?cols=${cols.join(',')}`);
  await page.evaluate(() => document.fonts.ready);
  const rendered = await page.evaluate(() => {
    const table = document.querySelector<HTMLTableElement>('.tblwrap table');
    if (!table) throw new Error('the desktop table is not mounted — widen the window');
    const before = table.style.width;
    table.style.width = 'min-content';
    const w = table.getBoundingClientRect().width;
    table.style.width = before;
    // The panel's two 1px side borders, which `desktopMinWidth` includes and the table does not.
    return w + 2;
  });
  return { model: desktopMinWidth(cols, fitModel(FIXTURE, indexTests(FIXTURE.tests))), rendered };
}
