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
 * sets on the real fleet in Chromium and Firefox. Four is that with
 * room, and small enough that a regenerated font table or a changed padding fails here rather than
 * quietly moving the width at which the rendering switches.
 */
export const FIT_TOLERANCE_PX = 4;

/**
 * Wait until the self-hosted faces have actually loaded, and fail loudly if they never do.
 *
 * `await page.evaluate(() => document.fonts.ready)` is NOT this, which is what these measurements
 * used to do. `fonts.ready` settles against the loads pending when it is asked, and this app asks
 * before the SPA has mounted the table that requests the faces — so under load it resolved with
 * `document.fonts.status` still `loading` and both faces reporting `error`, WebKit having failed a
 * request and not yet retried it. The reading that followed measured the fallback face.
 *
 * That is a guard measuring the wrong thing rather than a guard failing, and the direction it lies
 * in is the HOST's, not the app's: in the Playwright image the fallback is narrower than Inter Tight
 * (a condensed face), so the fit tests read ~29px under and mostly passed, while on the CI runner it
 * is wider and the same race read 137px over.
 *
 * `document.fonts.check()` cannot stand in for this: it returned true for `600 14.72px "Inter Tight"`
 * while that face's own `status` was `error`. Only the FontFace's status answers the question.
 *
 * `required` names the families a caller's measurement actually depends on — a face nothing on the
 * page has used stays `unloaded` for ever, so waiting on it unconditionally would hang rather than
 * guard.
 *
 * **An errored face is judged per FAMILY, not on its own.** The app retries a face whose load
 * errors by adding a replacement to the set (docs/app.md §Theming), and the failed original stays
 * in `document.fonts` for ever — so `no face is in error` would fail a run the app had recovered
 * from, which is the transient this helper was written for in the first place. A family with
 * nothing loaded is still a failure, and that is the whole of the backstop. Names are compared
 * unquoted: a CSS-connected face reports `Inter Tight` where a constructed one reports
 * `"Inter Tight"` in Chromium, and the two are one family.
 */
export async function awaitFacesLoaded(
  page: Page,
  { required = [], timeout = 10_000 }: { required?: string[]; timeout?: number } = {},
): Promise<void> {
  try {
    await page.waitForFunction((families: string[]) => {
      const bare = (n: string) => n.replace(/^["']|["']$/g, '');
      const faces = [...document.fonts];
      if (document.fonts.status !== 'loaded') return false;
      if (faces.some((f) => f.status === 'loading')) return false;
      const loaded = new Set(faces.filter((f) => f.status === 'loaded').map((f) => bare(f.family)));
      if (faces.some((f) => f.status === 'error' && !loaded.has(bare(f.family)))) return false;
      return families.every((n) => loaded.has(bare(n)));
    }, required, { timeout });
  } catch {
    const seen = await page.evaluate(() =>
      [...document.fonts].map((f) => `${f.family}: ${f.status}`).join(', '));
    throw new Error(
      `the faces never finished loading, so anything measured here is a fallback's and not this `
      + `app's — set is [${seen}], status ${await page.evaluate(() => document.fonts.status)}`);
  }
}

/** The two faces every rendered measurement in these suites depends on (`app/src/app.css`). */
export const APP_FACES = ['Inter Tight', 'JetBrains Mono'];

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
 *
 * `fontsTimeoutMs` is for the one caller that expects the faces NEVER to arrive and is only waiting
 * to be told so; every real measurement wants the default.
 */
export async function measureFit(
  page: Page, cols: string[], fontsTimeoutMs?: number,
): Promise<{ model: number; rendered: number }> {
  await page.goto(`/?cols=${cols.join(',')}`);
  // Both faces, not just the header's: the phrase columns' width is the fleet's strings in Inter
  // Tight and the figure columns' is JetBrains Mono, so a fallback in either moves this number.
  await awaitFacesLoaded(page, { required: APP_FACES, timeout: fontsTimeoutMs });
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
