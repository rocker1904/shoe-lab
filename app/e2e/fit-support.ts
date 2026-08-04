import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import type { ShoesFile } from '../../shared/types.js';
import {
  DESKTOP_FLOOR_PX, desktopMinWidth, fitModel, NAME_COL_PX, rendersPhone, SIDEBAR_PERMANENT_PX,
} from '../src/lib/fit';

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
 * The no-overflow bound: how far any ink in the table may lie outside the content box of the cell
 * it is in, now that a column's width is declared rather than negotiated with the engine
 * (docs/app.md §Table presentation).
 *
 * **A tolerance over every column at every mounting width, not an allowance for one column.** Every
 * declared width is `min + share` and the min is Chromium's, so a column whose header needs a
 * fraction more in another engine puts that much of its longest word past the box. Measured on the
 * real fleet across the four `FIT_SETS`, `FIT_DROPPED_COLS` and eight widths each — the narrowest
 * width every set mounts at, both sides of the sidebar's boundary, and out to 2560px — the worst
 * reading anywhere is **0.72px**, on `RunRepeat Score`'s header in Firefox, with WebKit at 0.70px
 * and Chromium at 0 (`.hunt/no-overflow.mjs`). The widest a runner's own data reaches is **0.13px**,
 * on `Both sides (semi)` in the cell-bound `tongue-gusset-type` column.
 *
 * **Two, because of what absorbs it.** Every cell carries `--s2` — 8px — of padding on each side,
 * so ink 2px past its content box is still 6px inside the cell's own edge and 14px from the nearest
 * ink in the next column. The two facts do different jobs and neither implies the other: 2 is
 * ~2.8× the worst reading, so the bound does not flake on sub-pixel variation between engines and
 * fixtures, and it is a quarter of the padding that absorbs it, so drift reddens here long before
 * anything is visible on screen.
 */
export const FIT_OVERFLOW_PX = 2;

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

/**
 * The column sets the model is held to: the default view, the narrowest thing there is, a set of
 * phrase columns whose width is the fleet's rather than the labels', and a wide one.
 *
 * **`phrases` is every cell-bound column there is, and it is four.** Those are the columns whose
 * minimum comes from a runner's data rather than from a header we wrote, so they are the case a
 * declared width has to be checked hardest against — `heel-tab` most of all, whose
 * `Extended heel collar` is the widest cell in the table on the real fleet. `app/src/lib/fit.test.ts`
 * imports this array and compares it to the cell-bound columns the committed fleet actually has, so
 * neither a fifth column upstream nor an edit here can move without the other.
 */
export const FIT_SETS: Record<string, string[]> = {
  default: ['releasedAt', 'score', 'msrpGbp', 'heel-stack', 'plate', 'energy-return-heel',
    'toebox-width-widest-part', 'weight'],
  minimal: ['score'],
  phrases: ['releasedAt', 'plate', 'tongue-gusset-type', 'heel-tab'],
  wide: ['releasedAt', 'score', 'msrpGbp', 'heel-stack', 'plate', 'energy-return-heel',
    'toebox-width-widest-part', 'weight', 'shock-absorption-heel', 'outsole-durability',
    'heel-counter-stiffness'],
};

/**
 * The columns the catalogue does NOT hold — a shared link outliving a remethod, whose header is the
 * raw slug (docs/app.md §Columns are permissive, ranges and sorts are strict). `-26` is upstream's
 * own convention for the next generation of a test, so this is the shape a stale link actually
 * carries; `10-12` is the adversarial one.
 *
 * **Deliberately not in `FIT_SETS`, because the claim is one-sided rather than an agreement.** The
 * model treats no hyphen as a break opportunity, so a slug header is over-reserved against every
 * engine that breaks at one — far outside `FIT_TOLERANCE_PX`, and on purpose.
 *
 * **The bound is what `urlstate.ts` accepts, not what the catalogue has published.** §Columns are
 * permissive renders any accepted slug raw, and `MAX_SLUG_LEN` takes 64 characters. Maximised over
 * every chunking `TEST_SLUG_RE` admits at that length, the worst is eleven chunks — ten of five
 * letters and one of four, `mmmmm-…-mmmmm-mmmm` — which is 64 exactly, where eleven FIVE-letter
 * chunks would be 65 and rejected. The model reserves a 762px header for it against the 71px an
 * engine breaking at every hyphen needs: **691px**. Today's widest catalogue stem is 208px of that,
 * and quoting it would read as a ceiling when it is a sample.
 *
 * **This is the one home for that figure, and `app/src/lib/fit.test.ts` holds it** — *prices the
 * worst slug a link can name*. It is arithmetic over `HEADER_PX` and `MAX_SLUG_LEN`, each of which
 * moves on its own schedule, so either moving would otherwise leave the number stale with nothing to
 * say so; that test pins the witness at both sides of the length door and both widths, so either
 * input moving reddens rather than quietly restating a new truth.
 *
 * What has to hold here is only that the model never goes under by more than `FIT_TOLERANCE_PX` —
 * `10-12` is the case with no over-reservation at all, because Firefox leaves `-<digits>` whole and
 * the model does too, so what is left between them is the `HEADER_PX` table being one engine's
 * (docs/app.md §Table presentation).
 */
export const FIT_DROPPED_COLS = ['breathability-26', 'energy-return-heel-24', '10-12'];

/**
 * The model's number and the engine's, for one column set. The engine's is read by asking the table
 * for `width: min-content` — the same question the model answers — and restoring it, so nothing the
 * page does afterwards is measured through a table that has been resized.
 *
 * **The override comes OFF first, and that is the whole of what keeps this claim a claim.** The
 * table now declares its widths and lays itself out `fixed`, so a mounted table asked for
 * `min-content` answers with the model's own arithmetic played back — the assertion would compare
 * the model to itself and pass whatever either did. Clearing every `<col>` width and restoring
 * `table-layout: auto` puts the question back to the engine: *given these strings, how wide does
 * this table have to be*. Inline rather than structural, so Svelte's next update finds the DOM it
 * left; the values are put back immediately either way.
 *
 * **`NAME_COL_PX` goes back on the name cells for the measurement, and that is not a fudge.** The
 * model's name column is `max(floor, longest token)` and the floor is a DECLARED design minimum —
 * a thing no engine can infer from the strings, and one the table used to state as
 * `td.name { min-width: 14rem }` until a declared width made cell floors inert
 * (`fit.ts`, `NAME_COL_PX`). Handing the engine that one constant is what makes the two sides
 * answer the same question; everything else in the comparison — the strings, the faces, the
 * paddings, the wrapping — stays the engine's.
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
  const rendered = await page.evaluate((floorPx: number) => {
    const table = document.querySelector<HTMLTableElement>('.tblwrap table');
    if (!table) throw new Error('the desktop table is not mounted — widen the window');
    const declared = [...table.querySelectorAll<HTMLTableColElement>('colgroup col')]
      .map((col) => [col, col.style.width] as const);
    for (const [col] of declared) col.style.width = '';
    const names = [...table.querySelectorAll<HTMLElement>('.name')];
    for (const cell of names) cell.style.minWidth = `${floorPx}px`;
    const before = { width: table.style.width, layout: table.style.tableLayout };
    table.style.tableLayout = 'auto';
    table.style.width = 'min-content';
    const w = table.getBoundingClientRect().width;
    table.style.width = before.width;
    table.style.tableLayout = before.layout;
    for (const cell of names) cell.style.minWidth = '';
    for (const [col, width] of declared) col.style.width = width;
    // The panel's two 1px side borders, which `desktopMinWidth` includes and the table does not.
    return w + 2;
  }, NAME_COL_PX);
  return { model: desktopMinWidth(cols, fitModel(FIXTURE)), rendered };
}

/**
 * The widths a column set is checked at: the narrowest the desktop rendering is ever mounted at,
 * one just above it, both sides of the sidebar's boundary — where the track drops by the sidebar's
 * whole 260px track and the columns go back to their minimums — and two wide ones, where the
 * distribution rule rather than the minimum is what is on screen.
 *
 * The narrowest is found by walking `rendersPhone` itself rather than by restating its arithmetic:
 * the predicate is monotone in the width (`fit.ts`), so the first width it accepts is the boundary,
 * and a rule that moved would move this ladder with it.
 */
export function mountWidths(cols: readonly string[]): number[] {
  const model = fitModel(FIXTURE);
  let narrowest = DESKTOP_FLOOR_PX;
  while (narrowest <= 4000 && rendersPhone(cols, narrowest, model)) narrowest++;
  if (narrowest > 4000) throw new Error(`no width mounts the desktop table for [${cols.join(',')}]`);
  return [...new Set([narrowest, narrowest + 40, SIDEBAR_PERMANENT_PX - 1, SIDEBAR_PERMANENT_PX,
    1600, 2560])].filter((w) => w >= narrowest);
}

/**
 * Sizes the viewport so the LAYOUT width — what the fit model and every width in `mountWidths` are
 * expressed in — is the number asked for. They differ by the classic scrollbar this fleet is always
 * long enough to draw, and the difference is the whole of the sideways-overflow class this model
 * exists to remove (`fit.ts`, `SIDEBAR_PERMANENT_PX`): a viewport set to the narrowest mounting
 * width would lay out 15px under it and mount the stacked list instead.
 */
export async function setLayoutWidth(page: Page, layoutPx: number, height = 900): Promise<number> {
  await page.setViewportSize({ width: layoutPx, height });
  const bar = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
  if (bar > 0) await page.setViewportSize({ width: layoutPx + bar, height });
  return page.evaluate(() => document.documentElement.clientWidth);
}

/**
 * What the table is actually laying itself out by: the declared widths, what they sum to, and the
 * two boxes they have to answer to — the table's own width and the panel's track.
 *
 * Callers compare with a pixel of slop rather than exactly, and both directions of it are real. The
 * track is read through `clientWidth`, which every engine rounds to an integer, while the table's
 * `width: 100%` resolves fractionally (`ShoeTable.svelte`); and a resize reaches the declaration
 * through a `ResizeObserver`, so for one frame after it the widths are the previous track's — poll
 * rather than read once, or the reading is a frame behind the viewport.
 */
export async function measureDeclared(page: Page): Promise<{
  layout: string; tableWidth: number; trackWidth: number; declaredSum: number; cols: number;
}> {
  return page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>('.tblwrap');
    const table = wrap?.querySelector<HTMLTableElement>('table');
    if (!wrap || !table) throw new Error('the desktop table is not mounted — widen the window');
    const declared = [...table.querySelectorAll<HTMLTableColElement>('colgroup col')]
      .map((col) => parseFloat(col.style.width));
    return {
      layout: getComputedStyle(table).tableLayout,
      tableWidth: table.getBoundingClientRect().width,
      trackWidth: wrap.clientWidth,
      declaredSum: declared.reduce((a, b) => a + b, 0),
      cols: declared.length,
    };
  });
}

/** One reading: a cell, and how far its content lies outside that cell's content box. */
export interface Excursion { column: string; text: string; px: number }

/**
 * Every place the table's ink leaves the box its column declares, worst first.
 *
 * **Ink against box, not `scrollWidth` against `clientWidth`.** The overflow being bounded is
 * sub-pixel — a fraction of a header's longest word — and those two are integers. So each cell's
 * content box is computed from its own padding and every rect inside it is compared with both
 * edges: the client rects of every descendant element, which is what catches a box like the
 * discontinued chip, and a `Range` over every text node, which is what catches a word that has
 * overflowed a box that fits. **Both edges**, because a figure column's header is `row-reverse` and
 * a phrase column's is not, so the two overflow in opposite directions.
 *
 * `tr.expand` is excluded: its cell spans the whole table and constrains no column
 * (docs/app.md §The expanded row).
 */
export async function measureExcursions(page: Page): Promise<Excursion[]> {
  return page.evaluate(() => {
    const table = document.querySelector('.tblwrap table');
    if (!table) throw new Error('the desktop table is not mounted — widen the window');
    const heads = [...table.querySelectorAll('thead th')]
      .map((th) => (th.textContent ?? '').replace(/\s+/g, ' ').trim());
    const range = document.createRange();
    const out: { column: string; text: string; px: number }[] = [];
    for (const cell of table.querySelectorAll<HTMLTableCellElement>('thead th, tbody tr.shoe > *')) {
      const cs = getComputedStyle(cell);
      const box = cell.getBoundingClientRect();
      const left = box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
      const right = box.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      const rects: DOMRect[] = [];
      for (const el of cell.querySelectorAll('*')) rects.push(...el.getClientRects());
      const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!(n as Text).data.trim()) continue;
        range.selectNode(n);
        rects.push(...range.getClientRects());
      }
      let worst = 0;
      for (const r of rects) if (r.width) worst = Math.max(worst, left - r.left, r.right - right);
      if (worst > 0.01) {
        out.push({
          column: heads[cell.cellIndex] ?? '?',
          text: (cell.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
          px: Math.round(worst * 100) / 100,
        });
      }
    }
    return out.sort((a, b) => b.px - a.px);
  });
}

/**
 * The sweep every declared-width test runs: every width a column set is ever mounted at, and at
 * each one the excursion bound plus the three guards that stop it passing vacuously — the table is
 * laid out `fixed`, by these declared widths, filling its track. Under `auto` layout nothing can
 * overflow a column, so the bound on its own is not a test of anything.
 *
 * **Here rather than in either spec file**, for the same reason as everything else above it: the
 * guards are exactly the part that went missing, and they went missing because the body was written
 * out per test. Written out per FILE it drifts the same way, only more slowly — both projects have
 * to keep asserting the same thing for a Chromium reading and a Firefox one to mean anything
 * together.
 */
export async function sweepDeclaredColumns(page: Page, cols: readonly string[]): Promise<void> {
  await page.goto(`/?cols=${cols.join(',')}`);
  await awaitFacesLoaded(page, { required: APP_FACES });
  for (const width of mountWidths(cols)) {
    expect(await setLayoutWidth(page, width), 'the viewport did not resolve to this layout width')
      .toBe(width);
    // Retried rather than read once: a resize reaches the decision through an event and the DOM
    // through Svelte's next flush, and WebKit has reported the previous rendering to a single
    // evaluate — the artefact `cross-browser.spec.ts`'s threshold ladder documents.
    await expect(page.locator('.tblwrap'), `the desktop table is not mounted at ${width}px`)
      .toHaveCount(1);

    // Polled, not read once: the declaration reaches the DOM through a `ResizeObserver`, so for one
    // frame after a resize the widths are the previous track's and fixed layout is spreading the
    // difference. Read once, this measures the frame before the one the test asked for.
    await expect.poll(async () => {
      const now = await measureDeclared(page);
      return Math.abs(now.declaredSum - now.tableWidth);
    }, { message: `the table is not laid out by its declared widths at ${width}px` })
      .toBeLessThanOrEqual(1);

    const declared = await measureDeclared(page);
    expect(declared.layout, `at ${width}px`).toBe('fixed');
    expect(declared.cols, `at ${width}px`).toBe(1 + cols.length);
    // And it fills its track, which is one-sided: a track under the columns' own minimums must
    // overrun the panel rather than clip a cell (spec §Failure behaviour).
    expect(declared.tableWidth, `the table is narrower than its track at ${width}px`)
      .toBeGreaterThanOrEqual(declared.trackWidth - 1);

    const over = await measureExcursions(page);
    expect(over[0]?.px ?? 0, `at ${width}px: ${JSON.stringify(over.slice(0, 3))}`)
      .toBeLessThanOrEqual(FIT_OVERFLOW_PX);
  }
}
