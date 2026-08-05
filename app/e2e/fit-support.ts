import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import type { ShoesFile } from '../../shared/types.js';
import {
  DESKTOP_FLOOR_PX, desktopMinWidth, fitModel, NAME_COL_PX, rendersPhone, SIDEBAR_PERMANENT_PX,
} from '../src/lib/fit';
import { measureDesktopRowHeights, measurePhoneGroupHeights } from '../src/lib/row-height';

/** Let an observer callback and the render it schedules both reach a painted frame. */
export async function twoPaints(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

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

/** A routed fleet large enough for either rendering to emit spacers. */
export const WINDOW_FLEET_SIZE = 400;

/**
 * Repeats the trusted e2e fixture without changing any suite-wide fixture counts. The response is
 * held across navigations because `route.fetch()` belongs to the request that caused it.
 */
export async function routeWindowFleet(page: Page): Promise<void> {
  let payload: Record<string, unknown> | null = null;
  await page.route('**/shoes.json*', async (route) => {
    if (!payload) {
      const file = await (await route.fetch()).json() as
        { shoes: { slug: string; name: string }[] } & Record<string, unknown>;
      const shoes = Array.from({ length: WINDOW_FLEET_SIZE }, (_, i) => {
        const base = file.shoes[i % file.shoes.length]!;
        const suffix = ['', ' Continental Ultraride Edition', ' Pro'][i % 3];
        return { ...base, slug: `${base.slug}-${i}`, name: `${base.name} ${i}${suffix}` };
      });
      payload = { ...file, shoes };
    }
    await route.fulfill({ json: payload });
  });
}

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
 * and Chromium at 0. The widest a runner's own data reaches is **0.13px**, on `Both sides (semi)`
 * in the cell-bound `tongue-gusset-type` column.
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
    const table = document.querySelector<HTMLTableElement>('.tblwrap table:not(.proto)');
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
 * `width: 100%` resolves fractionally (`ShoeTable.svelte`).
 */
export interface Declared {
  layout: string;
  tableWidth: number;
  trackWidth: number;
  declaredSum: number;
  cols: number;
  // Per column as well as summed, because the sum is the TRACK: `columnWidths` shares every spare
  // pixel out, so two different sharings of the same track sum identically. A claim about what a
  // width is a function of has to read the widths.
  widths: number[];
  /** False when the wait below ran out with the widths still moving; always true for one read. */
  settled: boolean;
  /** How many times the widths moved while waiting — for the failure message, not for a caller. */
  changes: number;
}

/**
 * One reading of the declaration, or a reading taken once the declaration has stopped moving.
 *
 * **Run in the page, per animation FRAME, rather than polled from the test process.** The old wait
 * was `expect.poll`, which samples on a 100/250/500ms ladder — and a sample is not an observation:
 * it says nothing moved between two readings, and everything in between is invisible to it. A frame
 * is the unit the thing being waited for actually happens in — a `ResizeObserver` callback is
 * delivered inside the rendering steps and Svelte's flush follows it in a microtask — so a loop over
 * `requestAnimationFrame` sees every state the table is ever laid out in, and cannot be handed a
 * layout it never saw.
 *
 * **The quiet period is kept, and that is measured rather than inherited.** Two consecutive agreeing
 * frames — the cheap version, ~12ms against this wait's ~110 — settles on the PREVIOUS sharing
 * 10 times out of 10 in both engines against a redistribution deferred by only 60ms, which today's
 * poll survives — measured in both engines by deferring every `ResizeObserver` callback by a fixed
 * delay and asking each candidate wait which sharing it settled on. A quiet period of one frame is
 * a quiet period of nothing: the whole class this guard exists for is a change that has been decided
 * in JS and has not reached the DOM yet. So the wait is per frame and the WINDOW is wall-clock, which also means
 * it degrades the right way — where frames are scarce, `stableSince` still has to be
 * `SETTLE_QUIET_MS` old, so a stalled compositor makes this stronger rather than weaker.
 *
 * `quietMs <= 0` is the single reading, so the read and the wait are one function and cannot drift
 * apart: everything a caller asserts about the declaration is asked of the same code either way.
 */
async function declaredInPage(
  { quietMs, timeoutMs }: { quietMs: number; timeoutMs: number },
): Promise<Declared> {
  const read = (): Declared => {
    const wrap = document.querySelector<HTMLElement>('.tblwrap');
    const table = wrap?.querySelector<HTMLTableElement>('table:not(.proto)');
    if (!wrap || !table) throw new Error('the desktop table is not mounted — widen the window');
    const declared = [...table.querySelectorAll<HTMLTableColElement>('colgroup col')]
      .map((col) => parseFloat(col.style.width));
    return {
      layout: getComputedStyle(table).tableLayout,
      tableWidth: table.getBoundingClientRect().width,
      trackWidth: wrap.clientWidth,
      declaredSum: declared.reduce((a, b) => a + b, 0),
      cols: declared.length,
      widths: declared,
      settled: true,
      changes: 0,
    };
  };

  let previous = read();
  if (quietMs <= 0) return previous;
  const deadline = performance.now() + timeoutMs;
  let stableSince = performance.now();
  let changes = 0;
  for (;;) {
    // The deadline is enforced from OUTSIDE the frame as well as inside it: a page the compositor
    // considers hidden is served no animation frames at all, and a bare `await rAF` there hangs
    // until Playwright's own timeout with nothing to say. This fails with the reading in hand.
    const drew = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        cancelAnimationFrame(frame);
        resolve(false);
      }, Math.max(0, deadline - performance.now()));
      const frame = requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    const now = read();
    if (now.widths.join(',') !== previous.widths.join(',')) {
      previous = now;
      stableSince = performance.now();
      changes++;
    } else if (performance.now() - stableSince >= quietMs) {
      return { ...now, changes };
    }
    if (!drew) return { ...now, settled: false, changes };
  }
}

/** One reading, taken now: what the table is laid out by at this instant. */
export async function measureDeclared(page: Page): Promise<Declared> {
  return page.evaluate(declaredInPage, { quietMs: 0, timeoutMs: 0 });
}

/**
 * How long the widths must hold still. Kept at the poll's own 100ms rather than shortened to a
 * frame, because that is where the measured edge is: this survives a redistribution deferred by
 * 60ms and does not survive one deferred by 250ms, and neither does anything else that has ever
 * guarded these sweeps, by the same deferred-`ResizeObserver` measurement. Today's app has no such
 * path — the redistribution lands 21-37ms after a resize, loaded — so what this buys over the poll
 * is that it
 * observes every frame in the window instead of its two ends, and it costs the same: 122ms mean per
 * width over the four column sets in two engines against the poll's 126, the difference being the
 * poll's own 250ms rung wherever the widths did move.
 */
const SETTLE_QUIET_MS = 100;

/**
 * Wait until the declared widths have stopped moving, and answer with the reading that settled.
 *
 * **A sum survives a redistribution, so nothing here settles on one.** The widths always sum to the
 * track — `columnWidths` shares every spare pixel out — so `|Σwidths − tableWidth| ≤ 1` is satisfied
 * by the PREVIOUS sharing exactly as readily as by the new one. At `SIDEBAR_PERMANENT_PX` the
 * sidebar becomes permanent and the columns are re-shared: the name column moves 163px on `[score]`
 * while the sum moves by a pixel, so that poll passed on the frame before the one the test asked
 * for and Svelte's `ResizeObserver` flush landed in the middle of a measurement — handing the two
 * halves of a bound two different layouts, and reddening the suite in two runs out of three.
 *
 * That is one more assertion over an AGGREGATE surviving a REDISTRIBUTION, which this table has
 * produced repeatedly and which now has a home of its own
 * (docs/decisions.md §Testing bar: adversarial, no live network). Its instances here: a vacuous
 * `declaredSum` comparison landed with the declared widths, the note `measureDeclared` carries about
 * why it returns `widths` at all, this wait, and the same sum standing as a wait in
 * `smoke.spec.ts`'s filter test — which is not a live flake only because the resize it guards moves
 * the track first, and becomes one the moment a windowed body makes the pending change a JS decision
 * with nothing in the DOM behind it yet.
 *
 * **Anything that has to be true of the columns is asked of the columns**, and this is now the only
 * place in the suite that waits on a declared width — swept for, rather than claimed. The waits that
 * remain are over other geometry and each carries its own reason where it stands; they are not
 * enumerated here, because a count written into prose is falsified by the next test that adds one
 * (docs/README.md rule 4).
 *
 * **The reading returned is the one that settled**, not a fresh read afterwards — a third read is a
 * third chance to catch a different layout, which is the same defect in miniature.
 */
export async function settledDeclared(page: Page, at: string): Promise<Declared> {
  const now = await page.evaluate(declaredInPage,
    { quietMs: SETTLE_QUIET_MS, timeoutMs: 5_000 });
  expect(now.settled, `the declared column widths are still moving ${at} — `
    + `${now.changes} changes seen, last [${now.widths.join(', ')}]`).toBe(true);
  return now;
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
 *
 * **What it quantifies over is the rows in the DOM, and the body is a window now.** This walks
 * `thead th, tbody tr.shoe > *`, so "no cell's ink leaves its column" is a claim about the shoes
 * rendered at the moment it runs — and once a body renders a window of its fleet instead of all of
 * it, the widest cell in a column can simply stop being measured, with no assertion failing and
 * nothing in the reading to say its population changed
 * (docs/specs/2026-08-03-virtualising-the-table.md §Registry sweep).
 *
 * Two things hold it honest rather than one. **The sweep asserts the population**, below: on the
 * five-shoe fixture every shoe is in the window at every width, so the bound is over the whole
 * fixture fleet exactly as it was, and the day that stops being true this reddens rather than
 * quietly narrowing. And the real fleet's excursions are swept with the window **scrolled across
 * it**, which is where a 455-shoe population can be reached at all: 455 of 455 distinct shoes seen
 * per column set, five sets, three engines, worst excursion **0.61px** against this file's
 * `FIT_OVERFLOW_PX` of 2. That half is a **reading rather than an assertion** — no committed suite
 * can mount the real fleet — so what is held here is the fixture with its population asserted, and
 * the fleet-wide figure is recorded so a later reading can be compared with it.
 *
 * `:not(.proto)` on the table: the wrapper also holds the hidden one-row prototype the height
 * measurement is taken off (`app/src/lib/row-height.ts`), which is out of flow, invisible, and not
 * a claim about any column.
 */
export async function measureExcursions(page: Page): Promise<Excursion[]> {
  return page.evaluate(() => {
    const table = document.querySelector('.tblwrap table:not(.proto)');
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

    const declared = await settledDeclared(page, `at ${width}px`);
    // Once the sharing has settled, that the table is laid out BY those declarations is an
    // assertion rather than a thing to wait for.
    expect(Math.abs(declared.declaredSum - declared.tableWidth),
      `the table is not laid out by its declared widths at ${width}px`).toBeLessThanOrEqual(1);
    expect(declared.layout, `at ${width}px`).toBe('fixed');
    expect(declared.cols, `at ${width}px`).toBe(1 + cols.length);
    // And it fills its track, which is one-sided: a track under the columns' own minimums must
    // overrun the panel rather than clip a cell (spec §Failure behaviour).
    expect(declared.tableWidth, `the table is narrower than its track at ${width}px`)
      .toBeGreaterThanOrEqual(declared.trackWidth - 1);

    // **What the bound was measured over, asserted rather than assumed.** `measureExcursions` walks
    // the rows in the DOM, and the body renders a WINDOW of its fleet now — so the population this
    // quantifies over is a thing that can shrink without any assertion failing. On this fixture
    // every shoe is in the window at every width, which is what makes the bound a claim about the
    // whole fixture fleet; a fixture or an overscan that stopped making it true has to redden here
    // and send the next reader to scroll the sweep across the fleet, not pass while guarding less.
    const shown = await page.locator('.tblwrap table:not(.proto) tbody tr.shoe').count();
    const planned = await page.evaluate(() =>
      Number(document.querySelector('.tblwrap table:not(.proto)')!.getAttribute('aria-rowcount'))
      - 1 - document.querySelectorAll('.tblwrap tbody tr.expand').length);
    expect(shown, `the body is windowed at ${width}px, so this bound no longer quantifies over `
      + 'the fleet — scroll the window across it or say so here').toBe(planned);

    const over = await measureExcursions(page);
    expect(over[0]?.px ?? 0, `at ${width}px: ${JSON.stringify(over.slice(0, 3))}`)
      .toBeLessThanOrEqual(FIT_OVERFLOW_PX);
  }
}

/**
 * Ground truth for a name the fixture does not contain: put it in a LIVE row, read the row, put the
 * row back. The table itself is the only authority on what it renders, and a second model of it
 * here would be the thing under test wearing a different hat.
 *
 * Both rows are used on purpose — one carrying a discontinued chip and one not — so the chipped
 * half of the claim is asked of a row that really has one rather than of a chip stitched on for the
 * measurement.
 *
 * **Three families, because a step is a blind spot and a space is an assumption.** Four-letter words
 * step about 57px at a time, so an error in the width a name is laid out against only shows if it
 * happens to be bigger than the slack left on some name's last line — a 13px one lands between the
 * steps three times in four, and the sweep passes. The second finds the break point itself, by
 * growing a run of single-letter words until the live row gains a line, and hands back the names
 * either side of it: there any error over one word's width moves one of them. The third is the case
 * the other two share an assumption about — that a name breaks where the column ends, which stops
 * being true once a single token is wider than the column.
 *
 * None of the three contains a name. All are built against the LIVE row at the current width and
 * column set, so changing the face, the columns or the width changes what they ask.
 */
function renderedForNames(words: number): { names: string[]; disc: boolean[]; rendered: number[] } {
  const rows = [...document.querySelectorAll<HTMLTableRowElement>('.tblwrap table:not(.proto) tbody tr.shoe')];
  const chipOf = (r: HTMLElement) => r.querySelector('td.name .name-row > div > span');
  const plainRow = rows.find((r) => !chipOf(r));
  const chipRow = rows.find((r) => chipOf(r));
  const names: string[] = [];
  const disc: boolean[] = [];
  const rendered: number[] = [];
  for (const [row, isDisc] of [[plainRow, false], [chipRow, true]] as const) {
    // Loudly, because the alternative was silent: skipping a missing prototype dropped the CHIPPED
    // half of the sweep the moment the fixture had no discontinued shoe, and every assertion over
    // the combined array still passed. The claim this sweep exists for is that a chip is part of
    // what gets laid out, so losing the row that carries one has to redden.
    if (!row) throw new Error(`no ${isDisc ? 'discontinued' : 'plain'} row to read ground truth from`);
    const strong = row.querySelector('td.name strong')!;
    const was = strong.textContent;
    // Four-letter words in one-word steps, not long ones: the claim is about WHERE a line breaks,
    // so the sweep has to cross break points in small enough steps to land just under and just over
    // one. In whole-line steps the chip could be dropped from the measurement entirely and every
    // reading still agreed, because no name ever sat close enough to a boundary for it to matter.
    for (let n = 1; n <= words; n++) {
      const name = Array.from({ length: n }, () => 'Mmmm').join(' ');
      strong.textContent = name;
      names.push(name);
      disc.push(isDisc);
      rendered.push(row.getBoundingClientRect().height);
    }

    // Where the second line starts, found by doubling and then halving rather than by counting:
    // the name column is nearly the whole table under a one-column view, so walking up to it a
    // letter at a time is thousands of forced layouts and this is a dozen.
    const spaced = (n: number) => Array.from({ length: n }, () => 'i').join(' ');
    strong.textContent = spaced(1);
    const oneLine = row.getBoundingClientRect().height;
    const twoLines = (n: number) => {
      strong.textContent = spaced(n);
      return row.getBoundingClientRect().height > oneLine;
    };
    let lo = 1;
    let hi = 2;
    while (!twoLines(hi) && hi < 8192) { lo = hi; hi *= 2; }
    // Rather than exiting at the guard and then asserting over eight-thousand-word names, which is
    // a slow and puzzling failure instead of a stated one. No column set is this wide today.
    if (hi >= 8192) throw new Error('no break point below 8192 words — the name column is absurd');
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (twoLines(mid)) hi = mid; else lo = mid;
    }
    const push = (name: string) => {
      strong.textContent = name;
      names.push(name);
      disc.push(isDisc);
      rendered.push(row.getBoundingClientRect().height);
    };
    for (let n = Math.max(1, hi - 3); n <= hi + 1; n++) push(spaced(n));

    // A third family, for the width a name is laid out against rather than the point it breaks at.
    // The block a name lands in is a FLEX ITEM with `min-width: auto`, so a name carrying one
    // unbroken token wider than the column lays out wider than the cell and the rest of it wraps
    // against that wider box — an over-reservation of a whole line, and invisible to both families
    // above because every name in them breaks at a space. The token is built from the break point
    // just found, so it is over the column at whatever width and column set this is.
    for (const tail of [1, 1.2, 1.5]) {
      push(`${'i'.repeat(3 * hi)} ${spaced(Math.max(1, Math.round(tail * hi)))}`);
    }
    strong.textContent = was;
  }
  return { names, disc, rendered };
}

/**
 * The height sweep: what `measureDesktopRowHeights` says a row will be, against what the table
 * renders, at every width a column set is mounted at.
 *
 * **The module's own function is handed to `page.evaluate`, never a copy of it.** That is the whole
 * of the bound — a paraphrase living in this file could agree with itself for ever while the app
 * drifted — and it is why `app/src/lib/row-height.ts` is written with no imports
 * (spec §Decisions, heights are measured in bulk).
 *
 * **Two claims, because the fixture can only carry one of them.** The five fixture shoes have
 * one-word names that never wrap, so measuring them holds the one-line row and nothing else — and
 * one line is the case a name-only model gets WRONG, so it is worth holding, but it is not the
 * claim. The synthetic half asks the same question of names built to wrap. Their rendered heights
 * are asserted to take more than one value, or the sweep would pass vacuously on a fixture whose
 * names all fit.
 *
 * **And both are asked again with a row expanded**, which is not a variation on the same question.
 * A row's state is drawn with a `transform` — the open chevron is `rotate(90deg)` — and a transform
 * moves no layout, so an expanded row renders exactly as it did while the measurement it feeds
 * reads a box 13px wider than the advance it stands for. Nothing on screen says so, which is why
 * the sweep has to ask rather than the eye (`app/src/lib/row-height.ts`).
 */
export async function sweepRowHeights(page: Page, cols: readonly string[]): Promise<void> {
  await page.goto(`/?cols=${cols.join(',')}`);
  await awaitFacesLoaded(page, { required: APP_FACES });
  const fleet = FIXTURE.shoes.map((s) => ({ name: s.name, discontinued: !!s.discontinued }));

  const compare = async (at: string): Promise<void> => {
    const before = (await measureDeclared(page)).widths;
    const measured = await page.evaluate(measureDesktopRowHeights, fleet);
    expect(measured, `nothing could be measured ${at}`).not.toBeNull();
    const rendered = await page.evaluate(() => {
      const out: Record<string, number> = {};
      for (const tr of document.querySelectorAll<HTMLElement>('.tblwrap table:not(.proto) tbody tr.shoe')) {
        out[tr.dataset['slug']!] = tr.getBoundingClientRect().height;
      }
      return out;
    });
    const truth = await page.evaluate(renderedForNames, 40);
    // Both prototypes were found, stated here as well as thrown in the page: an assertion over the
    // COMBINED array survives losing the chipped half of it entirely.
    expect(new Set(truth.disc).size,
      `only one kind of row carried ground truth ${at}`).toBe(2);
    const names = truth.names.map((name, i) => ({ name, discontinued: truth.disc[i]! }));
    const heights = await page.evaluate(measureDesktopRowHeights, names);

    // Asserted before EITHER set of heights, and this is why: every measurement above reads ground
    // truth off a live row and then measures, so a re-sharing landing between the two compares two
    // layouts and every symptom of it is a wrong height. This says which it was. The fixture half is
    // below this line for the same reason the synthetic half is — it reads the rendered rows after
    // measuring them, so a straddle there produced a mystery height too.
    expect((await measureDeclared(page)).widths,
      `the declared column widths moved under this measurement ${at}`).toEqual(before);
    FIXTURE.shoes.forEach((s, i) => {
      expect(measured![i], `${s.name} ${at}`).toBe(rendered[s.slug]);
    });
    expect(heights, `nothing could be measured for synthetic names ${at}`).not.toBeNull();
    expect(new Set(truth.rendered).size,
      `every synthetic name rendered one height ${at}, so this proves nothing`)
      .toBeGreaterThan(1);
    names.forEach((n, i) => {
      expect(heights![i], `${n.discontinued ? '[disc] ' : ''}${n.name.length} chars ${at}`)
        .toBe(truth.rendered[i]);
    });
  };

  for (const width of mountWidths(cols)) {
    expect(await setLayoutWidth(page, width), 'the viewport did not resolve to this layout width')
      .toBe(width);
    await expect(page.locator('.tblwrap'), `the desktop table is not mounted at ${width}px`)
      .toHaveCount(1);
    await settledDeclared(page, `at ${width}px`);

    await compare(`at ${width}px on [${cols.join(',')}]`);

    const first = page.locator('.tblwrap table:not(.proto) tbody tr.shoe').first();
    await first.click();
    await expect(page.locator('.tblwrap table:not(.proto) tbody tr.expand'),
      `the first row did not expand at ${width}px`).toHaveCount(1);
    await compare(`at ${width}px on [${cols.join(',')}] with the first row expanded`);
    await first.click();
    await expect(page.locator('.tblwrap table:not(.proto) tbody tr.expand')).toHaveCount(0);
  }
}

/**
 * Compares the phone measurement with the complete groups the live table draws. The module's own
 * function crosses `page.evaluate`, so this guards the implementation used by the component rather
 * than a test-side reconstruction of it.
 */
export async function sweepPhoneGroupHeights(
  page: Page, columns?: readonly string[],
): Promise<void> {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(columns === undefined ? '/' : `/?cols=${columns.join(',')}`);
  await awaitFacesLoaded(page, { required: APP_FACES });
  const live = page.getByTestId('shoe-table-mobile');
  await expect(live).toBeVisible();

  const compare = async (at: string) => {
    const truth = await live.evaluate((table) => {
      const shoes = [...table.querySelectorAll<HTMLElement>('tbody tr.shoe')];
      return {
        entries: shoes.map((shoe) => ({
          name: shoe.querySelector('strong')?.textContent ?? '',
          metadata: [...shoe.querySelectorAll<HTMLElement>('.meta')].map((m) => m.textContent ?? ''),
          discontinued: !!shoe.querySelector('.disc-tag'),
        })),
        rendered: shoes.map((shoe) => {
          const rule = shoe.previousElementSibling?.classList.contains('rule')
            ? shoe.previousElementSibling as HTMLElement : null;
          const values = shoe.nextElementSibling as HTMLElement | null;
          return (rule?.getBoundingClientRect().height ?? 0)
            + shoe.getBoundingClientRect().height
            + (values?.classList.contains('values') ? values.getBoundingClientRect().height : 0);
        }),
      };
    });
    const measured = await page.evaluate(measurePhoneGroupHeights, truth.entries);
    expect(measured, `nothing could be measured ${at}`).not.toBeNull();
    expect(measured).toEqual(truth.rendered);
  };

  const atColumns = columns === undefined ? 'the default columns' : `[${columns.join(',')}]`;
  await compare(`while every group is closed on ${atColumns}`);
  await live.locator('tbody tr.shoe').first().click();
  await expect(live.locator('tbody tr.expand')).toHaveCount(1);
  await compare(`with a live group expanded on ${atColumns}`);

  const prototype = page.locator('.mobile-proto table.proto');
  await expect(prototype).toHaveAttribute('aria-hidden', 'true');
  await expect(prototype.locator('tbody').first().locator('tr')).toHaveCount(3);
}
