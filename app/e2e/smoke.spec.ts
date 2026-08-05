import { expect, test, type Page } from '@playwright/test';
import { FIT_SLACK_PX, NAME_COL_PX, SIDEBAR_PERMANENT_PX } from '../src/lib/fit';
import {
  APP_FACES, awaitFacesLoaded, FIT_DROPPED_COLS, FIT_SETS, FIT_TOLERANCE_PX, measureFit,
  setLayoutWidth, settledDeclared, sweepDeclaredColumns, sweepPhoneGroupHeights, sweepRowHeights,
  twoPaints,
} from './fit-support';

/**
 * Wait for the utilities to have landed in the host this width gives them. They move between the
 * masthead and the toolbar through a rune rather than a media rule, so they land a frame after the
 * viewport changes (docs/app.md §Where the utilities live) — and anything measured before that
 * counts a masthead still carrying the bar's controls, or a bar still carrying the masthead's.
 * `expect` polls, so this waits for the swap rather than sleeping through it.
 */
const utilitiesSettled = (page: Page, width: number) => expect(
  page.locator(width <= 800 ? '[data-testid="toolbar"]' : 'header')
    .getByRole('button', { name: 'Copy link' })).toHaveCount(1);


test('loads, filters via preset, expands details, exports csv, restores url state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('receipt')).toContainText('Showing 5 of the 5 shoes');

  // a bare first visit opens on the setup strip, so this is a card rather than a toolbar pill
  await expect(page.getByTestId('setup-strip')).toBeVisible();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByTestId('receipt')).toContainText('Showing 4 of the 4 shoes');
  // the gate it just set is part of what `story=easy` names (docs/app.md §URL encoding)
  await expect(page).toHaveURL('/?story=easy');
  // the strip hands over to the toolbar, which is where the mark and the counts live from here
  await expect(page.getByTestId('setup-strip')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Easy/, checked: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'cushy' })).toBeVisible();

  await page.getByText('cushy').first().click();
  await expect(page.getByText('Bouncy')).toBeVisible();
  await expect(page.getByRole('link', { name: /Full review on RunRepeat/ })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await (await download).createReadStream()).readable).toBeTruthy();

  await page.goto('/?plate=carbon');
  await expect(page.getByTestId('receipt')).toContainText('Showing 1 of the 1 shoes');
  await expect(page.getByRole('row').filter({ hasText: 'racer' })).toBeVisible();
});

test('opens on the setup strip, and the address is the only thing that keeps a view', async ({ page }) => {
  await page.goto('/');
  const strip = page.getByTestId('setup-strip');
  await expect(strip).toBeVisible();
  // six equal cards in one row, with the group divider drawn in the gutter between them
  await expect(strip.locator('.card')).toHaveCount(6);
  const widths = await strip.locator('.card').evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  await expect(strip.locator('.divider')).toBeVisible();

  // one body of explanation, offered in words rather than in a punctuation mark
  await strip.getByRole('button', { name: /Read about this table/ }).click();
  await expect(page.getByRole('dialog', { name: 'About this table' })).toContainText('lab tests');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByTestId('receipt')).toContainText('Showing 4 of the 4 shoes');
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL('/?story=easy');

  // A bookmark of that address is the persistence mechanism, and only a real page load proves it.
  const bookmark = page.url();
  await page.goto(bookmark);
  await expect(page.getByTestId('receipt')).toContainText('Showing 4 of the 4 shoes');
  await expect(page.getByRole('radio', { name: /Easy/, checked: true })).toBeVisible();
  await expect(strip).toHaveCount(0);

  // and the bare address is a fresh start for the same visitor: the default table, and the strip
  // asking its two questions again, with nothing in storage able to say otherwise
  await page.goto('/');
  await expect(page.getByTestId('receipt')).toContainText('Showing 5 of the 5 shoes');
  await expect(strip).toBeVisible();
  // The invariant is **no view in storage**, not an empty storage: preferences legitimately live
  // there and the display preference is one of them (docs/app.md §View and URL ownership). Stated
  // as an allowlist rather than a count, so a third key has to be declared here and a view smuggled
  // in under a name of its own fails on the day it is written.
  expect(await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => !['theme', 'display'].includes(k)))).toEqual([]);
});

test('picks a zone, keeps the strip open through it, and returns to that zone\'s table via All', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('setup-strip')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Heel stack/ })).toBeVisible();
  // both halves of both zone pairs render, forefoot first, whichever zone is chosen
  const stackRows = page.locator('fieldset[aria-label^="Stack — "]');
  await expect(stackRows).toHaveCount(2);
  await expect(stackRows.first()).toHaveAttribute('aria-label', 'Stack — Forefoot');
  await expect(stackRows.last()).toHaveAttribute('aria-label', 'Stack — Heel');
  await expect(page.getByRole('group', { name: 'Midsole width — Forefoot' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Midsole width — Heel' })).toBeVisible();

  // the strip's own card: while it is up the bar draws no second copy of either group
  await expect(page.getByRole('radio', { name: 'Forefoot' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Forefoot', exact: true }).click();
  // one token for the whole plain table, the columns it names left unspelled
  // (docs/app.md §URL encoding)
  await expect(page).toHaveURL('/?zone=forefoot');
  await expect(page.getByTestId('setup-strip')).toBeVisible();         // the zone is the strip's own question
  await expect(page.getByRole('columnheader', { name: /Forefoot stack/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Heel stack/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Midsole width — Forefoot' })).toBeVisible();

  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByTestId('setup-strip')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Easy/, checked: true })).toBeVisible();
  // Easy bounds nothing, so the whole of it — its gate, its sort and the terms it scores on — is
  // two tokens, the zone before the story (docs/app.md §URL encoding).
  await expect(page).toHaveURL('/?zone=forefoot&story=easy');

  await page.getByRole('radio', { name: /All/ }).click();
  // back to the zone's own plain table, and back to the address it arrived at above
  await expect(page).toHaveURL('/?zone=forefoot');
  await expect(page.getByRole('radio', { name: 'Forefoot' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /All/, checked: true })).toBeVisible();
  await expect(page.getByTestId('receipt')).toContainText('Showing 5 of the 5 shoes');
});

/**
 * The skeleton exists to stop the layout jumping when the data lands, so its geometry is a CONTRACT
 * with the table rather than a look: the same left edge and width — it replaces the second cell of a
 * two-column layout, not a full-bleed block — the same column count, and a header band the height of
 * the real one. Only a browser can say: jsdom applies no component CSS and has no layout at all.
 *
 * Both shapes are measured in one run, with the dataset held at the route rather than mocked, so the
 * comparison is between this build's placeholder and this build's table.
 *
 * TWO viewports, because the header band is the part that varies: the table's header takes a third
 * name line once a column is short enough to wrap one, and the placeholder reserves that third line
 * through a container query on its own width (docs/app.md §Decisions). A single viewport can only
 * ever measure one side of that threshold, and 1440 is on the two-line side. The fixture's labels
 * are not the shipped catalogue's, so it flips at a different track width — these two sit well
 * inside each band under both, which is what makes them a check on the reserve rather than on the
 * fixture's wording.
 */
// The strip is the biggest term above the table and only a BARE ARRIVAL draws it, so both loads
// are measured: a query string is what makes the second one not bare, which is exactly the
// predicate `isBareArrival()` answers for the placeholder and for the strip alike.
// 1200px is a 908px track: inside the three-line band for the fixture, whose own flip is between
// 948 and 968, and for the catalogue, whose reserve turns at 1028. Both numbers move whenever the
// sort mark does — this probe briefly had to be 880px while a placement put the two flips either
// side of 908 — so what is asserted is the reserve and never the fixture's wording.
for (const { width, path, strip } of [
  { width: 1440, path: '/', strip: true },
  { width: 1200, path: '/', strip: true },
  { width: 1440, path: '/?plate=carbon', strip: false },
]) {
  const who = strip ? 'a bare arrival' : 'a link that carries filters';
  test(`the loading skeleton reserves the geometry the table lands in at ${width}px, ${who}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/shoes.json*', async (route) => { await held; await route.continue(); });

    await page.goto(path);
    const skeleton = await page.locator('.skeleton').evaluate((el) => {
      const box = el.getBoundingClientRect();
      const head = el.querySelector('.head')!.getBoundingClientRect();
      const row = el.querySelector('.row')!;
      return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width),
               headH: Math.round(head.height),
               rowH: Math.round(row.getBoundingClientRect().height),
               cols: row.querySelectorAll('i').length,
               // The bars fill their grid tracks, so the first one IS the name track.
               nameW: Math.round(row.querySelector('i')!.getBoundingClientRect().width) };
    });

    release();
    await expect(page.locator('tbody tr.shoe').first()).toBeVisible();
    expect(await page.getByTestId('setup-strip').count(),
      `the placeholder reserved a strip this load ${strip ? 'did not draw' : 'then drew'}`)
      .toBe(strip ? 1 : 0);
    const table = await page.locator('.tblwrap').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width),
               headH: Math.round(el.querySelector('thead')!.getBoundingClientRect().height),
               rowH: Math.round(el.querySelector('tbody tr.shoe')!.getBoundingClientRect().height),
               cols: el.querySelectorAll('thead th').length };
    });

    expect(skeleton.cols, 'the skeleton draws a different number of columns').toBe(table.cols);
    expect(skeleton.x, 'the skeleton does not reserve the sidebar track').toBe(table.x);
    expect(skeleton.w, 'the skeleton is not the width of the table').toBe(table.w);
    // The axis nobody had measured, and the one that moved: the table used to land 285px below the
    // placeholder, because the chrome, the strip and the receipt all mount above it at once. The
    // bound is one line box of the receipt's own face — its wording counts shoes, so how many lines
    // it takes is a fact about the data the placeholder is still waiting for
    // (docs/app.md §Decisions).
    expect(Math.abs(skeleton.y - table.y),
      `the table lands ${table.y - skeleton.y}px from where the placeholder drew it`)
      .toBeLessThanOrEqual(16);
    // A line box or two of slack, and no more: these are line-box reservations against the real
    // thing, so rounding is fair and a design difference is not. A whole missing name line is 18px,
    // so this bound is what makes the reserve assertable at all.
    expect(Math.abs(skeleton.headH - table.headH),
      `head band ${skeleton.headH}px against the table's ${table.headH}px`).toBeLessThanOrEqual(2);
    expect(Math.abs(skeleton.rowH - table.rowH),
      `row ${skeleton.rowH}px against the table's ${table.rowH}px`).toBeLessThanOrEqual(1);
    // The name track is the table's own FLOOR, which is all the placeholder can know: what the
    // column actually takes is `columnPx('name')` over the names in the dataset it is still waiting
    // for (docs/app.md §Decisions owns why the inner tracks are not part of the contract).
    // Read off `NAME_COL_PX` rather than off `td.name`'s own `min-width`, which is where this
    // number used to be checked: a declared column width makes a cell floor inert, so the model is
    // the only place that still states it (docs/app.md §Table presentation).
    expect(skeleton.nameW, 'the placeholder reserves a name column the table would not accept')
      .toBe(NAME_COL_PX);
  });
}

// Which rendering is up is invisible to jsdom: it applies no component CSS and lays nothing out, so
// only a real browser can say which of the two tables is on screen.
test('switches to the stacked list on a phone, and back', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const mobile = page.getByTestId('shoe-table-mobile');
  await expect(mobile).toBeVisible();
  // only numeric columns are columns; the date and the plate moved onto the shoe's own row
  await expect(mobile.getByRole('columnheader', { name: /Released/ })).toHaveCount(0);
  await expect(mobile.getByRole('columnheader')).toHaveCount(6);
  // and all six fit — the bound the short labels were measured against
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The pinned header must sit flush against the chrome AFTER the face swaps in — a webfont
  // reflows the chrome after first paint, and a one-shot measurement leaves a strip of page that
  // rows visibly scroll through (docs/app.md §Columns and sorting).
  // The header only pins once the table's top has passed under the chrome, and a five-shoe fixture
  // in an 800px window cannot scroll that far: 141px of travel against the 363px needed, so every
  // reading was taken with the header still in flow and the check below could only ever pass.
  // Shortening the window is what gives it something to measure.
  await page.setViewportSize({ width: 375, height: 400 });
  await awaitFacesLoaded(page);
  // The faces having loaded is the swap, not the app's reaction to it: `--thead-top` is a
  // ResizeObserver-backed `bind:clientHeight`, so the reflowed chrome reaches the sticky offset a
  // frame later. Reading in the same task caught the app mid-measurement — a 34px gap, one wrapped
  // toolbar row — twice in nine full runs of the suite, on `main` as much as on any branch, and
  // never once in thirty repeats of this test on its own: it takes the other workers' load to lose
  // the race. Two frames is the observer's callback and the render that follows it, which is the
  // state a runner actually sees painted.
  await page.evaluate(() => new Promise<void>((r) => {
    requestAnimationFrame(() => requestAnimationFrame(() => r()));
  }));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const gap = await page.evaluate(() => {
    const chrome = document.querySelector('.chrome')!.getBoundingClientRect();
    const th = document.querySelector('[data-testid="shoe-table-mobile"] th')!.getBoundingClientRect();
    return Math.round(th.top - chrome.bottom);
  });
  // Bounded at BOTH ends, or the assertion cannot fail on the bug it was written for: a header
  // pinned against a stale pre-swap measurement leaves a 6px strip of page that rows scroll
  // through, which is a POSITIVE gap and passes a `>= 0` check silently. One pixel of slack for a
  // sub-pixel sticky offset, and no more.
  expect(gap, 'the pinned header is occluded after the font swap').toBeGreaterThanOrEqual(0);
  expect(gap, 'the pinned header is not flush against the chrome after the font swap').toBeLessThanOrEqual(1);

  // The score breakdown is five columns wide and does not fit a 375px panel, so it has to scroll
  // inside its own box rather than take the page sideways with it (docs/app.md §The story scores).
  // Easy first: the panel breaks down the score columns the view holds, and the plain table has none.
  // The BAR's pill, not the strip's card: scrolling to the foot of the page above took the strip
  // off the top of the screen, and that is a hand-over (docs/app.md §The setup strip), so the
  // control answering to Easy by then is a `radio` in the toolbar's own group.
  await page.getByRole('radio', { name: /^Easy/ }).click();
  await page.getByText('cushy').first().click();
  await expect(page.locator('.score-breakdown table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // 1400, not 1200: which rendering mounts is a fit question now, and Easy's eight columns do not
  // fit a 1200px window once the sidebar has taken its 260px track — measured at 925.6px of table
  // against 924px of room, so the list is the right answer there
  // (docs/app.md §Two renderings, and only one of them mounted).
  await page.setViewportSize({ width: 1400, height: 800 });
  await expect(mobile).toBeHidden();
  // Easy's own table by now, so its score column is what says the desktop rendering is back.
  await expect(page.getByRole('columnheader', { name: /Easy heel score/ })).toBeVisible();
});

// The drag maths is percent positions over a measured box plus gap-aware hit areas, none of which
// jsdom can produce: every element there reports the same zero-sized rect.
test('drags a bound onto the histogram and clamps only the drawing', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  const row = page.getByRole('group', { name: 'Price (£)' });
  await expect(row).toBeVisible();
  // Scrolled to before it is measured, because the sidebar's fixed sections grow: the Features
  // section put this plot two pixels below an 800px fold, and a drag driven at coordinates outside
  // the viewport silently does nothing while every locator still resolves.
  await row.locator('.plot').scrollIntoViewIfNeeded();
  const box = await row.locator('.plot').boundingBox();
  expect(box, 'the plot never got a box, so nothing below would be measuring anything').not.toBeNull();
  expect(box!.y + box!.height, 'the plot is below the fold, so the drag below would land nowhere')
    .toBeLessThanOrEqual(800);
  const max = row.getByLabel('Price (£) maximum', { exact: true });
  const min = row.getByLabel('Price (£) minimum', { exact: true });

  // The max grip rests at the axis ceiling; dragged to the floor it lands on a price that exists.
  await page.mouse.move(box!.x + box!.width - 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x, box!.y + box!.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(max).toHaveValue('140');
  await expect(page.getByTestId('receipt')).toContainText('Showing 3 of the 5 shoes');
  await expect(page).toHaveURL(/r\.msrpGbp=%7E140/);

  // A typed value past the axis keeps its number and only its drawing is clamped, so its grip ends
  // up exactly where an unbounded maximum draws.
  await max.fill('');
  await min.fill('400');
  await expect(min).toHaveValue('400');
  const lefts = await row.locator('.handle').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).style.left));
  expect(lefts[0]).toBe(lefts[1]);
});

/**
 * The `--thead-top` guard, and only that: the offset is MEASURED and ResizeObserver-backed, so the
 * pinned header row has to clear a chrome box whose height is a function of the viewport. The
 * chrome's own band claims are `lays the chrome out in bands`'s
 * (docs/app.md §Columns and sorting).
 *
 * None of it is observable in jsdom: it applies no component CSS, so every box reports zero.
 */
test('keeps the table header clear of the chrome at every width', async ({ page }) => {
  // The dataset is fetched, so the toolbar is not in the DOM at `goto` — and every reading below
  // would come back null, which compares equal to itself and passes every assertion silently. The
  // bar carries the groups only once the strip has handed them over, so a first arrival has to
  // answer it before there is a cascade to measure at all.
  const settled = async () => {
    const card = page.getByTestId('setup-strip').getByRole('button', { name: /^All/ });
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    if (await card.count()) await card.click();
    await expect(page.getByRole('radio', { name: /All/ })).toBeVisible();
  };

  // The pinned header row must clear the chrome at every width, which a constant offset cannot do:
  // the chrome roughly doubles between these two (docs/app.md §Columns and sorting has the figures).
  for (const width of [1200, 700, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await settled();
    await page.evaluate(() => window.scrollTo(0, 1500));
    const gap = await page.evaluate(() => {
      const chrome = document.querySelector('.chrome')!.getBoundingClientRect();
      const th = document.querySelector('thead th')!.getBoundingClientRect();
      return Math.round(th.top - chrome.bottom);
    });
    expect(gap, `header row occluded at ${width}px`).toBeGreaterThanOrEqual(0);
    // And at the desktop width nothing scrolls sideways: the content track is capped and the
    // table's headers wrap. `toBeLessThanOrEqual` states that claim; `toBe` would additionally
    // assert "and the scrollport is exactly the viewport", which is a fact about the runner's
    // scrollbars (docs/app.md §Table presentation).
    if (width === 1200) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
});

/**
 * Opening a row scrolls, and the row is what still holds focus and carries `aria-expanded` — so the
 * scroll has to leave it visible. It did the opposite: `scrollIntoView` on the panel put the panel's
 * top at the top of the scrollport and the row, being *above* the panel, entirely behind the pinned
 * chrome. Measured at six places, six of six landed fully above the chrome's lower edge with focus
 * still on them, which is a WCAG 2.4.11 focus-obscured failure (docs/app.md §Table presentation).
 *
 * Driven by the keyboard, because that is the case with a focus to obscure, and at several scroll
 * depths, because the old behaviour was right at exactly one of them.
 */
test('keeps an expanded row below the chrome that opening it scrolls under', async ({ page }) => {
  // Short enough that the fixture's own detail panel is taller than the window, which is the case
  // the finding measured: a panel that FITS is scrolled into view harmlessly.
  await page.setViewportSize({ width: 1200, height: 400 });
  await page.goto('/');
  await awaitFacesLoaded(page);

  for (const nth of [0, 2, 4]) {
    const measured = await page.evaluate(async (n) => {
      for (const open of document.querySelectorAll<HTMLElement>('tr.shoe[aria-expanded=true]')) open.click();
      await new Promise((r) => setTimeout(r, 60));
      const row = document.querySelectorAll<HTMLElement>('tr.shoe')[n]!;
      row.scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 60));
      row.focus();
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      const b = row.getBoundingClientRect();
      // The pinned table header sits UNDER the chrome and over the rows, so the band a row has to
      // clear is both of them: measuring against the chrome alone passed on a row the `thead` was
      // painting over (docs/app.md §Stacking order).
      const head = document.querySelector('thead th')!.getBoundingClientRect();
      const panel = row.nextElementSibling!.getBoundingClientRect();
      return { rowTop: Math.round(b.top), headBottom: Math.round(head.bottom),
               expanded: row.getAttribute('aria-expanded'), focused: document.activeElement === row,
               atRowCorner: document.elementFromPoint(b.left + 4, b.top + 4)?.tagName ?? null,
               panelTop: Math.round(panel.top) };
    }, nth);

    expect(measured.expanded, `row ${nth} did not open`).toBe('true');
    expect(measured.focused, `focus left row ${nth}`).toBe(true);
    expect(measured.rowTop, `the row that still holds focus is behind the pinned chrome, row ${nth}`)
      .toBeGreaterThanOrEqual(measured.headBottom - 1);
    expect(measured.atRowCorner, `something is painted over row ${nth}'s own corner`).toBe('TD');
    expect(measured.panelTop, `the panel row ${nth} opened is off screen`).toBeLessThan(400);
  }
});

/**
 * **The desktop body renders a plan**, and this is the row model that goes with it
 * (docs/app.md §Table presentation).
 *
 * **What this fixture can and cannot say.** Five shoes fit inside one window at every width, so the
 * body here is never actually windowed: no spacer is emitted, and the assertions below are about the
 * arrangement that makes windowing safe rather than about the windowing itself. The window is
 * exercised by `app/e2e/virtual.spec.ts`, which routes a 400-shoe fleet for its own tests alone —
 * a fixture wide enough to window here would be a different fixture and every count in this file
 * would move with it. On the committed 455 it was measured over 46 scroll positions and 1,455
 * viewport samples in all three engines: none over a spacer, at worst 97 rows in the DOM.
 *
 * The four claims that are the fixture's to make: the header row is row 1 and the shoes count on
 * from it, `aria-rowcount` is the rows the table WOULD have rather than the rows it has, an expanded
 * panel takes a row number of its own and pushes the rows below it, and the prototype the height
 * measurement is cloned from is in the document and out of the accessibility tree.
 */
test('numbers the rows the table would have, and keeps the prototype out of the tree', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await awaitFacesLoaded(page, { required: APP_FACES });
  await settledDeclared(page, 'before reading the row model');

  const model = () => page.evaluate(() => {
    const table = document.querySelector('.tblwrap table:not(.proto)')!;
    const rows = [...table.querySelectorAll<HTMLElement>('tbody tr.shoe')];
    return {
      rowcount: Number(table.getAttribute('aria-rowcount')),
      head: table.querySelector('thead tr')!.getAttribute('aria-rowindex'),
      shoes: rows.map((r) => Number(r.getAttribute('aria-rowindex'))),
      panels: [...table.querySelectorAll('tbody tr.expand')]
        .map((r) => Number(r.getAttribute('aria-rowindex'))),
      spacers: table.querySelectorAll('tbody tr.spacer').length,
      // WebKit implements no scroll anchoring and resolves the property to the empty string, so the
      // claim is that it is not `auto` rather than that it is `none` (spec §Failure behaviour).
      anchor: getComputedStyle(table.querySelector('tbody')!).overflowAnchor,
      protoRows: document.querySelectorAll('.tblwrap table.proto tbody tr').length,
      protoHidden: document.querySelector('.tblwrap table.proto')!.getAttribute('aria-hidden'),
      protoChips: document.querySelectorAll('.tblwrap table.proto .disc-tag').length,
    };
  });

  const shut = await model();
  expect(shut.head, 'the header row is not row 1').toBe('1');
  expect(shut.shoes, 'the shoe rows do not count on from the header')
    .toEqual(shut.shoes.map((_, i) => i + 2));
  expect(shut.rowcount, 'aria-rowcount is not the header plus every shoe')
    .toBe(shut.shoes.length + 1);
  expect(shut.spacers, 'this fixture fits in one window, so nothing should be spaced for').toBe(0);
  expect(shut.anchor, 'the engine is free to re-anchor over rows the plan adds and removes')
    .not.toBe('auto');
  // The prototype is what makes the measurement independent of which shoes are on screen: one row,
  // always carrying a chip, never in the accessibility tree (`app/src/lib/row-height.ts`).
  expect(shut.protoRows).toBe(1);
  expect(shut.protoHidden).toBe('true');
  expect(shut.protoChips, 'the prototype carries no discontinued chip to copy').toBe(1);
  // And the a11y tree agrees: the prototype adds no row to it.
  await expect(page.getByRole('row')).toHaveCount(shut.shoes.length + 1);

  await page.locator('tr.shoe').first().click();
  await expect(page.locator('tr.expand')).toHaveCount(1);
  const open = await model();
  expect(open.panels, 'the panel does not take the row number after the row it belongs to')
    .toEqual([open.shoes[0]! + 1]);
  expect(open.shoes.slice(1), 'the rows below an open one did not move down a row')
    .toEqual(shut.shoes.slice(1).map((n) => n + 1));
  expect(open.rowcount, 'aria-rowcount does not count the panel').toBe(shut.rowcount + 1);
});

test('measures every closed phone group at the height this engine renders it', async ({ page }) => {
  await sweepPhoneGroupHeights(page);
  await sweepPhoneGroupHeights(page, FIT_SETS['phrases']!);
  await sweepPhoneGroupHeights(page, FIT_SETS['wide']!);
  await sweepPhoneGroupHeights(page, []);
});

/**
 * **A focused row is never unmounted, wherever it has scrolled to.** Unmounting it drops
 * `activeElement` to `<body>`: no ring anywhere, and the next Tab restarts from the top of the
 * document past every filter (docs/policies.md §Interaction chrome).
 *
 * On this fixture the row cannot leave the window, so what this holds is the half a small fleet can:
 * focus survives a scroll to the far end of the document and Tab continues from the row rather than
 * from the top. The half that needs a window — the row kept in the plan 12,000px away, and Tab
 * landing on the shoe the fleet puts next rather than on `<body>` — is held by
 * `app/e2e/virtual.spec.ts`, and was measured on the committed fleet in all three engines before
 * that guard existed: focused, scrolled 12,000px away, still focused and still in the DOM with 97
 * rows rendered.
 */
test('keeps focus on the row that has it while the page scrolls away from it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.goto('/');
  await awaitFacesLoaded(page);
  const row = page.locator('tr.shoe').nth(1);
  await row.evaluate((el) => el.focus());
  const slug = await row.getAttribute('data-slug');

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await twoPaints(page);
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset['slug']),
    'the scroll took focus off the row').toBe(slug);
  expect(await page.evaluate(() => document.activeElement === document.body),
    'focus fell to the body').toBe(false);

  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement === document.body),
    'Tab restarted from the top of the document').toBe(false);
});

/**
 * The same failure on the phone, where the occluding band is not the same two boxes: `--thead-top`
 * plus the stacked list's own sticky header measured 148px at 390x844, and the panel is 1600px in a
 * 844px window — so `block: 'nearest'` aligned its top with the top of the document scrollport and
 * parked 150px of it, image and all, behind the chrome, with `tr.shoe` — the row carrying the
 * shoe's NAME — above the viewport. Nothing on the resulting screen said which shoe was open.
 *
 * The sideways half is the same call: `tr.expand > td` carries `colspan`, so at ten columns
 * `scrollIntoView` also dragged the page 94px left and cut the first lines off the review prose.
 * Tapped rather than pressed, at three scroll depths, because the old behaviour was right at none.
 */
test('opens a shoe on the phone below the chrome, and without moving the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Past the six-column bound on purpose: that is where the page can scroll sideways at all.
  await page.goto('/?cols=score,msrpGbp,heel-stack,forefoot-stack,weight,energy-return-heel,'
    + 'energy-return-forefoot,toebox-width-widest-part,shock-absorption-heel');
  await awaitFacesLoaded(page);
  await expect(page.getByTestId('shoe-table-mobile')).toBeVisible();

  for (const depth of [0, 400, 2000]) {
    const measured = await page.evaluate(async (y) => {
      for (const open of document.querySelectorAll<HTMLElement>('tr.shoe[aria-expanded=true]')) open.click();
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
      const row = document.querySelectorAll<HTMLElement>('tr.shoe')[1]!;
      row.click();
      await new Promise((r) => setTimeout(r, 600));
      const head = document.querySelector('[data-testid="shoe-table-mobile"] thead th')!;
      const panel = row.nextElementSibling!.nextElementSibling!;
      return { rowTop: Math.round(row.getBoundingClientRect().top),
               headBottom: Math.round(head.getBoundingClientRect().bottom),
               expanded: row.getAttribute('aria-expanded'),
               scrollX: Math.round(window.scrollX),
               panelTop: Math.round(panel.getBoundingClientRect().top) };
    }, depth);

    expect(measured.expanded, `the shoe did not open at scroll ${depth}`).toBe('true');
    // The shoe's own name row is what says which shoe this is, so it is what must stay on screen —
    // below the chrome AND below the list's pinned header, which paints over the rows under it.
    expect(measured.rowTop, `the shoe's name row is behind the chrome at scroll ${depth}`)
      .toBeGreaterThanOrEqual(measured.headBottom - 1);
    expect(measured.panelTop, `the panel is off screen at scroll ${depth}`).toBeLessThan(844);
    expect(measured.scrollX, `opening a shoe dragged the page sideways at scroll ${depth}`).toBe(0);
  }
});

/**
 * The strip is `position: static` and the bar draws no groups while it is up, so scrolling the
 * table used to leave a first-time runner with **no zone or story control on screen at any width** —
 * the only radiogroup in the viewport at 1440, 1280 and 1024 was the sidebar's Discontinued.
 * Scrolling out is now a hand-over like clicking a story is, and it may not move the page under the
 * runner while it happens (docs/app.md §The setup strip).
 */
for (const width of [1440, 390]) {
  test(`hands the groups to the bar when the strip scrolls out at ${width}px`, async ({ page }) => {
    // Short on purpose: the fixture is five shoes, so the page cannot scroll past the strip at all
    // until one shoe is open — which is the state a runner browsing the catalogue is in anyway.
    await page.setViewportSize({ width, height: 400 });
    await page.goto('/');
    await expect(page.getByTestId('setup-strip')).toBeVisible();
    // The precondition the finding turns on: while the strip is up the bar holds neither group.
    await expect(page.getByRole('radiogroup', { name: 'Built for' })).toHaveCount(0);

    await page.locator('table:not(.proto) tbody tr.shoe').first().click();
    await expect(page.locator('.detail').first()).toBeVisible();
    // Opening a shoe scrolls, smoothly: measuring into the tail of that animation would read its
    // remaining pixels as drift from the hand-over.
    await page.waitForTimeout(700);
    await expect(page.getByTestId('setup-strip')).toBeVisible();

    const moved = await page.evaluate(async () => {
      const strip = document.querySelector('[data-testid="setup-strip"]')!;
      window.scrollTo(0, window.scrollY + strip.getBoundingClientRect().bottom + 40);
      const cleared = strip.getBoundingClientRect().bottom < 0;
      const row = document.querySelectorAll<HTMLElement>('table:not(.proto) tbody tr.shoe')[1]!;
      const before = row.getBoundingClientRect().top;
      await new Promise((r) => setTimeout(r, 500));
      return { cleared, moved: Math.round(row.getBoundingClientRect().top - before) };
    });
    expect(moved.cleared, 'the page could not be scrolled past the strip, so this asserts nothing')
      .toBe(true);

    await expect(page.getByTestId('setup-strip')).toHaveCount(0);
    // Both questions are answerable again without leaving the shoes, and both are ON SCREEN — the
    // bar is pinned, so being in the DOM is not the claim being made.
    for (const name of ['Measured at', 'Built for']) {
      const group = page.getByRole('radiogroup', { name });
      await expect(group).toBeInViewport();
    }
    expect(Math.abs(moved.moved),
      `the table moved ${moved.moved}px under the runner during the hand-over`).toBeLessThanOrEqual(1);
  });
}

/**
 * While the strip is up the bar carries no groups, so its left side is empty by design and the
 * actions hold the trailing edge alone. What must stay true is that they hold it: the old bar left
 * 211px of void at 390px and 597px at 800px by letting them lead a row instead.
 *
 * jsdom lays nothing out and evaluates no media query, so only a browser can answer it.
 */
test('opens with the actions flush to the bar trailing edge', async ({ page }) => {
  for (const width of [360, 390, 430, 560, 610, 700, 800, 840, 900, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('setup-strip')).toBeVisible();
    const seen = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="toolbar"]')!;
      const bar = el.getBoundingClientRect();
      const act = el.querySelector('.actions')!.getBoundingClientRect();
      return {
        groups: !!el.querySelector('.zone-wrap'),
        pill: !!el.querySelector('.pill'),
        // against the bar's OWN padding, not a constant: it differs by tier
        gap: Math.round(bar.right - parseFloat(getComputedStyle(el).paddingRight) - act.right),
        rows: new Set([...el.children].filter((c) => c.getBoundingClientRect().height > 0)
          .map((c) => Math.round(c.getBoundingClientRect().y))).size,
      };
    });
    expect(seen.groups, `the bar drew its groups beside the strip at ${width}px`).toBe(false);
    expect(seen.pill, `the bar offered stability with nothing to score at ${width}px`).toBe(false);
    expect(seen.gap, `the actions left the right edge at ${width}px`).toBeLessThanOrEqual(1);
    expect(seen.rows, `the landing bar took two rows at ${width}px`).toBe(1);
  }
});

/**
 * The chrome is pinned to the viewport on BOTH axes, and only one of them was ever asserted. The
 * document is what scrolls sideways past six columns (docs/app.md §Table presentation), so a band
 * that travelled with it ended before the page did: at 1100px on the real fleet the chrome sat at
 * `x: -77` and `elementFromPoint` returned `td.num` at six places inside the masthead and the
 * toolbar — shoe values painted above the pinned table header (docs/app.md §The chrome bands).
 *
 * Two claims, because fixing the first by detaching the header would be no fix: nothing but chrome
 * paints in the band at any scroll position, AND the table's header still pins under it.
 */
/**
 * The widths are the ones where a document can still scroll sideways at all, which the fit switch
 * has narrowed to the phone rendering past its six-column bound: the desktop table is now mounted
 * only where it fits, so no column set takes it past the viewport
 * (docs/app.md §Two renderings, and only one of them mounted). 1000px left the loop with the last
 * wave's reasoning attached to it — there is no view at 1000px that scrolls sideways any more, and
 * the `maxScrollLeft` guard below is what said so.
 */
for (const width of [700, 390]) {
  test(`holds the chrome over its own band with the document scrolled right at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    // Fifteen figure columns, which is what it now takes to push the stacked list past a 700px
    // window: its columns are 53px, so the count rather than the width is the lever. Both halves of
    // the softness pair are left out deliberately — a superseded pair is one column and `parseView`
    // would drop the sibling (docs/app.md §URL encoding).
    await page.goto('/?cols=score,msrpGbp,heel-stack,forefoot-stack,weight,energy-return-heel,'
      + 'energy-return-forefoot,toebox-width-widest-part,shock-absorption-heel,'
      + 'shock-absorption-forefoot,outsole-durability,outsole-thickness,heel-counter-stiffness,'
      + 'midsole-width-in-the-heel,midsole-width-in-the-forefoot');
    await awaitFacesLoaded(page);
    const maxScrollLeft = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(maxScrollLeft, `nothing scrolls sideways at ${width}px, so this asserts nothing`)
      .toBeGreaterThan(0);

    await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 900));
    const seen = await page.evaluate(() => {
      const chrome = document.querySelector('.chrome')!;
      const box = chrome.getBoundingClientRect();
      const painted: string[] = [];
      // Across the band and down it, including the last visible pixel column: the failure lived in
      // the right-hand strip the chrome no longer reached.
      for (const x of [Math.round(innerWidth * 0.55), Math.round(innerWidth * 0.8), innerWidth - 2]) {
        for (const y of [2, Math.round(box.height / 2), Math.round(box.height) - 2]) {
          const el = document.elementFromPoint(x, y);
          if (!el || !chrome.contains(el)) painted.push(`${x},${y}=${el?.tagName ?? 'null'}`);
        }
      }
      const th = document.querySelector('thead th')!.getBoundingClientRect();
      return { painted, headGap: Math.round(th.top - box.bottom) };
    });
    expect(seen.painted, 'something that is not the chrome paints in the chrome band').toEqual([]);
    // `>= 0`, not `== 0`: the fixture is five shoes, so the table is not tall enough to have
    // scrolled under the band at every one of these widths — what must hold is that the band never
    // covers the header, whether or not it has reached it.
    expect(seen.headGap, 'the table header is behind the chrome').toBeGreaterThanOrEqual(0);
  });
}

/**
 * The chrome below 800px is three bands — identity, what acts on the table, what the table is —
 * and above it two. Each assertion here is a property rather than a pixel count, so a retune of any
 * boundary keeps them meaningful (docs/app.md §The chrome bands).
 */
test('lays the chrome out in bands', async ({ page }) => {
  const settle = async () => {
    const card = page.getByTestId('setup-strip').getByRole('button', { name: /^All/ });
    // `exact`, because the strip's `Read about this table` is a substring match otherwise.
    await expect(page.getByRole('button', { name: 'About', exact: true })).toBeVisible();
    if (await card.count()) await card.click();
    await expect(page.getByRole('radio', { name: /All/ })).toBeVisible();
    await awaitFacesLoaded(page);
  };
  const bands = () => page.evaluate(() => {
    const tb = document.querySelector('[data-testid="toolbar"]')!;
    const cs = getComputedStyle(tb);
    const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
    const box = tb.getBoundingClientRect();
    const setup = tb.querySelector('.setup')!.getBoundingClientRect();
    const actions = tb.querySelector('.actions')!.getBoundingClientRect();
    const kids = [...tb.querySelector('.setup')!.children].map((k) => k.getBoundingClientRect());
    return {
      sameRow: Math.abs((setup.y + setup.height / 2) - (actions.y + actions.height / 2)) < 4,
      setupBelow: setup.y > actions.y,
      leftInset: Math.round(kids[0]!.left - (box.left + padL)),
      rightInset: Math.round((box.right - padR) - kids[kids.length - 1]!.right),
      overflow: tb.scrollWidth - tb.clientWidth,
      // The story group must take the row it is given rather than filling one of its own — carried
      // over from the tier test Task 8 retires, which is where this claim lived.
      paceW: tb.querySelector('.pace-wrap [data-segmented-control]')!.getBoundingClientRect().width,
      wrapW: tb.querySelector('.pace-wrap')!.getBoundingClientRect().width,
    };
  });

  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');
  await settle();
  expect((await bands()).sameRow, 'the bar split above 800px').toBe(true);

  await page.setViewportSize({ width: 801, height: 900 });
  expect((await bands()).sameRow, 'the bar split one pixel above the chrome boundary').toBe(true);

  // At 800 and below the two bands separate, and the actions lead: what acts on the table sits above
  // what the table is, so the row carrying every word is the one nearest the table. This boundary is
  // the CHROME's own and no longer the sidebar's, which sits far wider. Keeping one boundary also
  // keeps the actions-before-setup order stable throughout the tier (docs/app.md §The chrome bands).
  for (const width of [800, 760, 660]) {
    await page.setViewportSize({ width, height: 900 });
    const split = await bands();
    expect(split.sameRow, `the bands merged at ${width}px`).toBe(false);
    expect(split.setupBelow, `the setup row leads at ${width}px`).toBe(true);
  }

  // 430 and below: flush to both padding edges — the property the whole rebuild exists to restore.
  for (const width of [430, 390, 375, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const b = await bands();
    expect(b.overflow, `the setup row overflows at ${width}px`).toBeLessThanOrEqual(0);
    expect(b.leftInset, `not flush left at ${width}px`).toBeLessThanOrEqual(1);
    expect(b.rightInset, `not flush right at ${width}px`).toBeLessThanOrEqual(1);
  }

  // Above 430 it stops widening and centres, so the two insets stay equal and stop growing apart.
  for (const width of [500, 560, 629, 690, 760, 799]) {
    await page.setViewportSize({ width, height: 900 });
    const b = await bands();
    expect(Math.abs(b.leftInset - b.rightInset), `not centred at ${width}px`).toBeLessThanOrEqual(2);
    expect(b.leftInset, `the capped row grew at ${width}px`).toBeGreaterThanOrEqual(0);
  }

  // And at every width: the story group is shrink-wrapped, never stretched to fill its wrapper.
  for (const width of [1200, 900, 760, 660, 560, 430, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    const b = await bands();
    expect(b.paceW, `the story group stretches at ${width}px`).toBe(b.wrapW);
  }
});

/**
 * The utilities are written once and mounted in the host their band owns, so exactly one instance
 * must exist at any width — two would be two tab stops with the same name, and zero would lose the
 * controls. The widths step either side of 800 because that boundary is asked twice, once by the
 * CSS and once by the rune in `Page.svelte`, and the failure mode is them disagreeing
 * (docs/app.md §Where the utilities live).
 */
test('mounts each utility exactly once at every width', async ({ page }) => {
  for (const width of [360, 390, 430, 560, 700, 799, 800, 801, 900, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const name of ['Copy link', 'Export CSV']) {
      await expect(page.getByRole('button', { name }), `at ${width}px`).toHaveCount(1);
    }
    // The theme control is inside this one now, not beside it (docs/app.md §Where the utilities live).
    await expect(page.getByRole('button', { name: 'Display' }), `at ${width}px`).toHaveCount(1);
    await expect(page.getByRole('status'), `at ${width}px`).toHaveCount(1);
  }
});

/**
 * The sidebar's own boundary, which is NOT the chrome's. A permanent 260px column is only worth
 * having where the table can be seen beside it, and the default columns plus that track do not both
 * fit until `SIDEBAR_PERMANENT_PX` — so one pixel of window at 801px used to add 259px of horizontal
 * overflow, pushing the table the sidebar exists to tune off the right of the screen
 * (docs/app.md §Filters).
 *
 * Driven off the CONSTANT rather than a literal: the fixture's own table is narrow enough that the
 * floor is what binds for it, so this drives the same number `lib/fit.ts` states and fails here
 * rather than in a band a runner finds. No style block restates it any more — `Page.svelte` writes
 * a class and `Toolbar.svelte` takes a prop, both from the one rune (docs/app.md §Filters).
 *
 * Measured as the table's own left edge rather than as overflow, because the e2e fixture is five
 * shoes with one-word names and its document fits at every width here — the overflow half of the
 * claim needs the real fleet and lives in `hunt/fit-boundary.mjs`. The displacement does not: a
 * reserved track moves the table whatever is in it.
 */
test('keeps the sidebar a drawer until the table can be seen beside it', async ({ page }) => {
  const layout = async () => {
    // The layout is the LOADED page's: until the data lands `App.svelte` is drawing the placeholder,
    // which reserves the same track from its own rule and has no `.layout` at all.
    await expect(page.locator('table:not(.proto) tbody tr.shoe').first()).toBeVisible();
    return page.evaluate(() => {
      const tracks = getComputedStyle(document.querySelector('.layout')!).gridTemplateColumns;
      return {
        tracks: tracks.split(/\s+/).length,
        sidebar: getComputedStyle(document.querySelector('.sidebar')!).position,
        contentX: Math.round(document.querySelector('.content')!.getBoundingClientRect().left),
      };
    });
  };

  for (const width of [700, 760, 800, 801, 900, 1000, 1100, SIDEBAR_PERMANENT_PX - 1]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const seen = await layout();
    expect(seen.tracks, `the sidebar holds a track at ${width}px, where it does not fit`).toBe(1);
    expect(seen.sidebar, `the sidebar is not a drawer at ${width}px`).toBe('fixed');
    // The gutter, not a 260px indent: at --s4 the content starts flush with every other band.
    expect(seen.contentX, `the table is pushed right at ${width}px`).toBeLessThanOrEqual(16);
    // `exact`, or the sidebar's own `Clear filters` matches the same substring.
    await expect(page.getByRole('button', { name: 'Filters', exact: true }),
      `no way into the filters at ${width}px`).toBeVisible();
  }

  // And at the boundary it is a column again, because there it is one a runner can use.
  for (const width of [SIDEBAR_PERMANENT_PX, 1250, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const seen = await layout();
    expect(seen.tracks, `the sidebar takes no track at ${width}px`).toBe(2);
    expect(seen.sidebar, `the sidebar is still a drawer at ${width}px`).toBe('sticky');
    expect(seen.contentX, `the sidebar reserves nothing at ${width}px`).toBeGreaterThan(200);
    await expect(page.getByRole('button', { name: 'Filters', exact: true }),
      `a drawer toggle with nothing to toggle at ${width}px`).toBeHidden();
  }
});

/**
 * The placeholder reserves the sidebar track, so it has to switch on the SAME boundary the loaded
 * page lays out on — reserve a column the page then does not draw and the table slides 260px left
 * as the data lands, which is the exact jump the reserve exists to prevent
 * (docs/app.md §Decisions on the skeleton). The loop above measures the reserve in full at 1440 and
 * 1250; these are the widths on the other side of the boundary, and they are only about the track.
 *
 * One pixel below `SIDEBAR_PERMANENT_PX` as well as a plain mid-band width, because the placeholder
 * asks the FLOOR on its own (`App.svelte`) — it has no dataset yet, so it cannot ask the fit model
 * the loaded page asks: a boundary moved in `lib/fit.ts` and not read here leaves the placeholder
 * reserving 260px the loaded page then takes back.
 */
for (const width of [1000, SIDEBAR_PERMANENT_PX - 1]) {
  test(`reserves no sidebar track at ${width}px, where the loaded page has none`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/shoes.json*', async (route) => { await held; await route.continue(); });

    await page.goto('/');
    const placeholder = await page.locator('.skeleton').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x), w: Math.round(box.width) };
    });

    release();
    await expect(page.locator('tbody tr.shoe').first()).toBeVisible();
    const table = await page.locator('.tblwrap').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x), w: Math.round(box.width) };
    });

    expect(placeholder.x, 'the placeholder reserves a sidebar track the page never draws').toBe(table.x);
    expect(placeholder.w, 'the placeholder is not the width of the table').toBe(table.w);
  });
}

// And the swap survives a resize rather than only a fresh load: the rune is what moves them, so a
// listener that never fires would pass every case above and still strand the controls in the wrong
// band for anyone who rotates a phone or drags a window.
test('moves the utilities between bands on a resize', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/');
  await expect(page.locator('header').getByRole('button', { name: 'Copy link' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('[data-testid="toolbar"]').getByRole('button', { name: 'Copy link' }))
    .toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(1);
});

/**
 * And an OPEN Display panel survives that move. The host swap destroys and rebuilds the control, so
 * a panel whose open flag lived inside it shut itself the moment a phone was rotated — the same
 * lesson the open-row set already carries, which is why the flag is `Page.svelte`'s
 * (docs/app.md §Where the utilities live). Both directions, because only one of them was ever
 * walked before.
 *
 * Focus is asserted with it: the state can be lifted and the DOM cannot, so a keyboard runner would
 * otherwise arrive in the new band with the panel up and no ring anywhere on the page.
 */
test('keeps the Display panel open across the chrome boundary, in both directions', async ({ page }) => {
  const panel = page.getByRole('group', { name: 'Display settings' });
  const focused = () => page.evaluate(() =>
    document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? null);

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Display' }).click();
  await expect(panel).toBeVisible();

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('[data-testid="toolbar"]').getByRole('button', { name: 'Display' }))
    .toBeVisible();
  await expect(panel, 'the panel shut itself on the way down').toBeVisible();
  await expect(panel).toHaveCount(1);
  await expect.poll(focused, { message: 'focus fell to the body on the way down' })
    .toBe('display-trigger');

  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator('header').getByRole('button', { name: 'Display' })).toBeVisible();
  await expect(panel, 'the panel shut itself on the way back up').toBeVisible();
  await expect(panel).toHaveCount(1);
  await expect.poll(focused, { message: 'focus fell to the body on the way back up' })
    .toBe('display-trigger');
});

/**
 * Every row of chrome is paid before the first shoe, so narrowing the window may ADD a row — the
 * content genuinely stops fitting — but must never add one that a narrower window then hands back.
 * A band standing taller than the viewports on both sides of it is height nothing on screen asked
 * for, and that is a property rather than a number: it holds across every tier boundary at once and
 * survives a retune of any of them.
 *
 * Counted in ROWS, not pixels. The 800px tier halves the bar's vertical padding by design and the
 * chrome legitimately gets shorter there, so a pixel-monotone claim would fail on the design rather
 * than on a bug. The ladder steps either side of both declared boundaries — 800 and 429.98 — and
 * around 700, because that is where a rule can move a row (docs/app.md §The chrome bands).
 *
 * jsdom evaluates no media query and lays nothing out, so only a browser can answer it.
 */
test('never adds a chrome row that a narrower window hands back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/');
  // The bar carries the two segmented groups only once the strip has handed them over, and the
  // handover is what the tiers below have to lay out.
  await page.getByTestId('setup-strip').getByRole('button', { name: /^All/ }).click();
  await expect(page.getByRole('radio', { name: /All/ })).toBeVisible();
  await awaitFacesLoaded(page);

  // Flex lines, counted by clustering child centres: `align-items: center` puts items of different
  // heights on one line at different tops, so counting distinct top edges over-reports.
  const chromeRows = () => page.evaluate(() => {
    const lines = (sel: string) => {
      const root = document.querySelector(sel)!;
      const ys = [...root.children]
        .filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0)
        .map((e) => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; })
        .sort((a, b) => a - b);
      return ys.reduce((n, y, i) => (i === 0 || y - ys[i - 1] > 4 ? n + 1 : n), 0);
    };
    return lines('header') + lines('[data-testid="toolbar"]');
  });

  let widest = 0;
  let rows = 0;
  for (const width of [1440, 1200, 1000, 940, 900, 860, 820, 801, 800, 790, 760, 720, 701, 700, 699,
                       680, 640, 600, 560, 500, 460, 431, 430, 429, 412, 400, 390, 380, 375, 370,
                       365, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await utilitiesSettled(page, width);
    const next = await chromeRows();
    expect(next, `the chrome takes ${rows} rows at ${widest}px and only ${next} at ${width}px, so `
      + `${widest}px is paying for a row nothing on screen needs`).toBeGreaterThanOrEqual(rows);
    widest = width;
    rows = next;
  }
});

// Which element paints on top is a question only a browser answers: jsdom applies no component CSS,
// so every z-index in the app is inert there and `elementFromPoint` has nothing to report. Both
// widths, because the dialog opens from a sticky sidebar on the desktop and from a fixed drawer on
// the phone — two different layers to clear, and fixing one has already broken the other once.
for (const { width, label } of [{ width: 1200, label: 'the chrome and the pinned table header' },
                                { width: 375, label: 'the filter drawer it opens from' }]) {
  test(`keeps the Add-filter dialog above ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    // Scrolled on purpose: unpinned, the chrome and the table header sit above the dialog's box and
    // no amount of wrong stacking would be visible.
    await page.evaluate(() => window.scrollTo(0, 1500));
    // The sidebar's boundary, not the chrome's: below it the filters are behind the drawer, so
    // Add filter has to be reached through it (docs/app.md §Filters).
    if (width < SIDEBAR_PERMANENT_PX) await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('button', { name: 'Add filter' }).click();
    await expect(page.getByRole('dialog', { name: 'Add filter' })).toBeVisible();

    // Sampled across the whole box rather than at its centre: the failure this guards against
    // covered the top third of the dialog and left the rest of it clear.
    const covered = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Add filter"]')!;
      const box = dialog.getBoundingClientRect();
      const hits: string[] = [];
      for (let dy = 0.02; dy < 1; dy += 0.04) {
        for (let dx = 0.1; dx < 1; dx += 0.2) {
          const el = document.elementFromPoint(box.left + box.width * dx, box.top + box.height * dy);
          if (el && !dialog.contains(el)) hits.push(`${el.tagName}.${el.className}`);
        }
      }
      return [...new Set(hits)];
    });
    expect(covered, 'something paints over the open dialog').toEqual([]);
  });
}

/**
 * Every row of chrome is paid before the first shoe, and the ceiling is what stops the saving the
 * rebuild bought being given back one padding step at a time — docs/app.md §The chrome bands owns
 * what it spends. A bound rather than a pin, so a font tweak does not fail the build but a
 * regression does. Chromium, Firefox and Docker WebKit agree on the measured touch heights;
 * docs/app.md §The chrome bands owns those numbers.
 *
 * Both states, because the bar is taller once the strip has handed it the three setup controls —
 * and that handed-over state is the binding one.
 */
test('keeps the chrome under its ceiling on a phone', async ({ page }) => {
  const chrome = () => page.evaluate(() =>
    Math.round(document.querySelector('.chrome')!.getBoundingClientRect().height));
  for (const [width, ceiling] of [[360, 95], [390, 95]] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('setup-strip')).toBeVisible();
    await utilitiesSettled(page, width);
    await awaitFacesLoaded(page);
    const h = await chrome();
    expect(h, `the chrome is ${h}px at ${width}px on a first arrival`).toBeLessThanOrEqual(ceiling);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('setup-strip').getByRole('button', { name: /^All/ }).click();
  await expect(page.getByRole('radio', { name: /All/ })).toBeVisible();
  await awaitFacesLoaded(page);
  for (const [width, ceiling] of [[360, 125], [390, 125], [430, 125], [700, 128], [900, 105]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await utilitiesSettled(page, width);
    const h = await chrome();
    expect(h, `the chrome is ${h}px at ${width}px`).toBeLessThanOrEqual(ceiling);
  }
});

/**
 * Four controls lose their words at 800px — Copy link, Export CSV, Filters and Columns (the theme
 * control lives inside the Display panel and has no band of its own). Each keeps the name its worded
 * form had, at every width: an icon that ships without one is unusable and untestable at once.
 */
test('never ships an icon without its name', async ({ page }) => {
  for (const width of [360, 430, 690, 760, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const name of ['Copy link', 'Export CSV', 'About']) {
      // `exact`, or `About` also matches the strip's `Read about this table`.
      await expect(page.getByRole('button', { name, exact: true }), `${name} at ${width}px`)
        .toHaveCount(1);
    }
    // The theme control is inside this one now, not beside it (docs/app.md §Where the utilities live).
    await expect(page.getByRole('button', { name: 'Display' }), `at ${width}px`).toHaveCount(1);
    // Filters answers the SIDEBAR boundary, not this one: it exists all the way to
    // `SIDEBAR_PERMANENT_PX`, worded from 801px up and a glyph below
    // (docs/app.md §The chrome bands).
    if (width < SIDEBAR_PERMANENT_PX) {
      await expect(page.getByRole('button', { name: 'Filters', exact: true })).toHaveCount(1);
    }
    // NOT `getByRole`: `<summary>` has no implicit ARIA role, so a role query never matches it
    // however it is labelled (docs/app.md §Where the utilities live). The label is still what a
    // screen reader announces.
    await expect(page.locator('details.picker summary'), `Columns at ${width}px`)
      .toHaveAttribute('aria-label', /^Columns, \d+ shown$/);
  }
});

/**
 * A form control does not inherit `font-family`: with no reset a `<button>` renders in the UA's own
 * default form face, which is not the document's and is not the same face twice. That is a
 * typography defect on every screen — Arial pills beside an Inter Tight table — and it is also what
 * makes a measured band unreproducible, because the face is the HOST's rather than the app's:
 * Chromium asks for `Arial`, Firefox and WebKit for the generic `sans-serif`, and the three
 * machines this repo renders on resolve those to three different widths. The toolbar's one-row band
 * had 7px of slack here, 32px in the Playwright image and −15px on a runner whose `sans-serif` is
 * DejaVu.
 *
 * So the claim is exact rather than approximate: every control renders in a face this app names.
 * `--font-mono` is as legitimate an answer as `--font-ui` — the count badges and figure inputs are
 * deliberately mono — but a UA fallback is neither, and it is exactly what a missing reset reads as.
 *
 * Chromium-only is enough: the reset is a CSS rule, so an engine that has it has it, and the
 * fallback name Chromium reports (`Arial`) fails this as loudly as Firefox's would.
 */
test('draws every control in a face this app names', async ({ page }) => {
  const strayFaces = () => page.evaluate(() => {
    const ui = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim();
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
    // Compared on the FIRST family only: engines re-quote and re-space a font stack differently
    // (`"Inter Tight", system-ui` against `Inter Tight, system-ui`), and the first name is the whole
    // of the claim — a control that reached the app's face did not fall back.
    const head = (s: string) => s.split(',')[0]!.trim().replace(/^["']|["']$/g, '');
    const named = new Set([head(ui), head(mono)]);
    return [...document.querySelectorAll<HTMLElement>('button, input, select, textarea')]
      .map((el) => ({ ff: getComputedStyle(el).fontFamily,
                      what: (el.getAttribute('aria-label') ?? el.textContent ?? el.id).trim().slice(0, 30) }))
      .filter((c) => !named.has(head(c.ff)))
      .map((c) => `${c.what || '(unnamed)'} → ${c.ff}`);
  });

  // 1440px, where the sidebar is a permanent column: every filter control is mounted with no scrim
  // over it. The two floating panels are opened ONE AT A TIME and closed again, because an outside
  // press dismisses the other (§Every floating panel dismisses the same way) — so a second click
  // never reaches its target and the panel it was meant to open never mounts.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  expect(await strayFaces(), 'a desktop control fell back to the UA form face').toEqual([]);
  for (const open of [() => page.locator('details.picker summary').click(),
                      () => page.getByRole('button', { name: 'Display' }).click()]) {
    await open();
    expect(await strayFaces(), 'a control in a floating panel fell back').toEqual([]);
    await page.keyboard.press('Escape');
  }

  // 390px, where the chrome is three bands and the table is the phone rendering — a different set
  // of components, and the one the glyph forms and the stacked list only ever mount in.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await strayFaces(), 'a phone control fell back to the UA form face').toEqual([]);
});

test('opens the About panel from the bar and from the strip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /Read about this table/ }).click();
  await expect(page.getByRole('dialog', { name: 'About this table' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'About this table' })).toHaveCount(0);

  await page.getByRole('button', { name: 'About', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'About this table' });
  await expect(dlg).toBeVisible();
  // The body is read whole rather than scrolled through: on the phone most people carry, it fits.
  const over = await dlg.locator('.body').evaluate((b) => b.scrollHeight - b.clientHeight);
  expect(over, 'the About copy no longer fits a 390x844 phone').toBeLessThanOrEqual(0);
});

/**
 * The banner is ONE row at every phone width, and the provenance block holds the trailing edge:
 * `main` left 59px of air at 390px and 248px at 700px by deleting the spacer at this band, which is
 * the raggedness the rebuild exists to remove. The count line is checked at the WIDEST month the
 * formatter can emit — `en-GB` renders September as `Sept`, 8px wider than the July it was first
 * measured against, and once cost 26px of chrome at 360px by wrapping.
 *
 * jsdom lays nothing out, so only a browser can answer either half.
 */
for (const width of [360, 390]) {
  test(`keeps the banner one flush row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await awaitFacesLoaded(page);

    const seen = await page.evaluate(() => {
      const header = document.querySelector('header')!;
      header.querySelector('.count')!.textContent = '450 shoes · updated 27 Sept 2026';
      const box = header.getBoundingClientRect();
      const kids = [...header.children]
        .filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0);
      const ys = kids.map((e) => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; })
        .sort((a, b) => a - b);
      const right = Math.max(...kids.map((e) => e.getBoundingClientRect().right));
      return {
        rows: ys.reduce((n, y, i) => (i === 0 || y - ys[i - 1] > 4 ? n + 1 : n), 0),
        air: Math.round(box.right - parseFloat(getComputedStyle(header).paddingRight) - right),
        titleLeft: Math.round(header.querySelector('h1')!.getBoundingClientRect().left),
        padLeft: Math.round(box.left + parseFloat(getComputedStyle(header).paddingLeft)),
      };
    });
    expect(seen.rows, 'the widest month wraps the banner onto a second row').toBe(1);
    expect(seen.air, 'the provenance block left the right edge').toBeLessThanOrEqual(1);
    expect(seen.titleLeft, 'the wordmark left the left edge').toBe(seen.padLeft);
  });
}

/**
 * A figure header states two things — what the column is and what it is measured in — and they
 * share a right edge (docs/app.md §Table presentation). That edge is now the figures' own, which
 * the sweep below owns; this test is the other half of it, that the two header lines agree with
 * each other and that the mark stays out of both.
 *
 * The mark LEADS the name here, so what it has to clear is the name's box rather than sit over it,
 * and it is centred on that box's full height — at one line or three. This 1440px view is the
 * wrapped case, where both of those say something: two of the default figure columns take two lines.
 */
/**
 * The mark stands off its label by the same air whichever end of the name it is at. The mark's box
 * is `--caret-w` and its glyph is narrower, so the slack inside that box has to fall on the side the
 * NAME is on — and it did not: a trailing mark left 3px between glyph and label while a leading one
 * left 0 and touched the first letter, because the glyph was packed to the box's end in both
 * (docs/app.md §Table presentation).
 *
 * Measured glyph to ink, not box to ink, because the box abuts the label in both kinds by
 * construction and would report 0 either way — the defect is entirely inside it.
 */
test('gives the sort mark the same air whichever end of the name it takes', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/');
  await awaitFacesLoaded(page);

  const cols = await page.evaluate(() => [...document.querySelectorAll('table thead th')].flatMap((th) => {
    const line = th.querySelector('.h-line');
    const text = line ? [...line.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim()) : [];
    if (!text.length) return [];
    const range = document.createRange();
    range.setStart(text[0]!, 0);
    range.setEnd(text.at(-1)!, text.at(-1)!.textContent!.length);
    const ink = range.getBoundingClientRect();
    const glyph = th.querySelector('.caret svg')!.getBoundingClientRect();
    // A figure column's mark leads, so its air is to the glyph's right; a phrase column's trails.
    const leads = th.classList.contains('fig');
    return [{ col: (th as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
              leads,
              air: Math.round(leads ? ink.left - glyph.right : glyph.left - ink.right) }];
  }));

  // Both kinds are on screen in the default view, or this proves nothing.
  expect(cols.some((c) => c.leads), 'no figure column in the default view').toBe(true);
  expect(cols.some((c) => !c.leads), 'no phrase column in the default view').toBe(true);
  const airs = [...new Set(cols.map((c) => c.air))];
  expect(airs, `air differs by column kind: ${JSON.stringify(cols)}`).toHaveLength(1);
  // And it is air, not a join: the mark reads as beside the name rather than part of it.
  expect(airs[0]).toBeGreaterThan(0);
});

test('lines a figure header up with its own unit line at 1440px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await awaitFacesLoaded(page);

  const cols = await page.evaluate(() => [...document.querySelectorAll('table thead th.fig')].map((th) => {
    // `.h-line`, not `.h-name`: the name's text nodes live in the inner box that carries the mark
    // in flow beside them, and `.h-name` is only the two-line reserve around it.
    const name = th.querySelector('.h-line')!;
    const text = [...name.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
    const range = document.createRange();
    range.setStart(text[0]!, 0);
    range.setEnd(text.at(-1)!, text.at(-1)!.textContent!.length);
    const ink = range.getBoundingClientRect();
    const units = th.querySelector('.h-units')!.getBoundingClientRect();
    const caret = th.querySelector('.caret')!.getBoundingClientRect();
    return { col: (th as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
             drift: Math.round(units.right - ink.right),
             caretClear: Math.round(ink.left - caret.right),
             caretOffCentre: Math.round(Math.abs((caret.top + caret.bottom) / 2
               - (ink.top + ink.bottom) / 2)) };
  }));
  expect(cols.length).toBeGreaterThan(2);
  for (const c of cols) {
    expect(c.drift, `${c.col}: unit line off the name's right edge`).toBe(0);
    // Beside the name and not over it, at the end the figures do not keep.
    expect(c.caretClear, `${c.col}: caret does not clear the name`).toBeGreaterThanOrEqual(0);
    // And on the middle of the whole name, which is what a wrapped header makes visible.
    expect(c.caretOffCentre, `${c.col}: caret is off the name's centre`).toBeLessThanOrEqual(2);
  }
});

/**
 * And the header lines up with its OWN COLUMN, which is the edge a runner actually reads down. The
 * test above asks only whether a header agrees with itself, and it passed for the whole time this
 * did not hold: at 1440px the default columns sit at their minimum, the header button fills the cell
 * exactly, and there is no slack for a misalignment to appear in. Every width with room to spare
 * showed the figures right-aligned under a header pinned to the LEFT of the cell — 128px apart at
 * 2560px (docs/app.md §Table presentation).
 *
 * Swept rather than fixed at one width, because a single width is what hid it: 1440 is the no-slack
 * case and the two above it are where the slack is.
 */
for (const width of [1440, 1920, 2560]) {
  test(`lines every figure header up with its own column at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await awaitFacesLoaded(page);

    const cols = await page.evaluate(() => {
      // Ranges throughout: a cell's box is the column, and what has to share an edge is the INK.
      const inkRight = (el: Element) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return r.getBoundingClientRect().right;
      };
      const heads = [...document.querySelectorAll('table thead th')];
      const cells = [...document.querySelector('table tbody tr.shoe')!.children];
      return heads.flatMap((th) => {
        if (!th.classList.contains('fig')) return [];
        // `.h-line`, not `.h-name`: the name's text nodes live in the inner box that carries the
        // mark in flow beside them, and `.h-name` is only the two-line reserve around it.
        const name = th.querySelector('.h-line')!;
        const text = [...name.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
        const range = document.createRange();
        range.setStart(text[0]!, 0);
        range.setEnd(text.at(-1)!, text.at(-1)!.textContent!.length);
        return [{
          col: (th as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
          nameDrift: Math.round(range.getBoundingClientRect().right - inkRight(cells[heads.indexOf(th)]!)),
          unitsDrift: Math.round(inkRight(th.querySelector('.h-units')!) - inkRight(cells[heads.indexOf(th)]!)),
        }];
      });
    });

    expect(cols.length).toBeGreaterThan(2);
    for (const c of cols) {
      expect(c.nameDrift, `${c.col}: header name off its column's right edge`).toBe(0);
      expect(c.unitsDrift, `${c.col}: unit line off its column's right edge`).toBe(0);
    }
  });
}

// jsdom moves focus for nothing: neither Tab order nor a drawer that is hidden by `visibility` can
// be observed there, and both are the whole point of these two.
test('puts the skip link first and makes each radiogroup one tab stop', async ({ page }) => {
  // Short on purpose: the jump has to be made from a page that genuinely scrolls, or the anchor is
  // already where it would land and nothing is being tested.
  await page.setViewportSize({ width: 1200, height: 400 });
  await page.goto('/');
  await expect(page.getByTestId('setup-strip')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to results' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#shoe-table')).toBeFocused();
  // the view owns the query string, so the jump leaves no fragment behind to ride along in a link
  expect(new URL(page.url()).hash).toBe('');
  // and it lands somewhere worth landing: the pinned chrome and the sticky header own the top of
  // the scrollport, so a jump that puts the anchor at y=0 leaves the runner looking at row 3
  const clear = await page.evaluate(() => {
    const th = document.querySelector('thead th')!.getBoundingClientRect();
    const row = document.querySelector('tbody tr.shoe')!.getBoundingClientRect();
    return Math.round(row.top - th.bottom);
  });
  expect(clear, 'the first row is behind the pinned header').toBeGreaterThanOrEqual(0);

  // the bar carries the groups once the strip has handed over
  await page.getByTestId('setup-strip').getByRole('button', { name: /^All/ }).click();
  const heel = page.getByRole('radio', { name: 'Heel' });
  await heel.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Forefoot' })).toBeFocused();
  await expect(page).toHaveURL('/?zone=forefoot');
  await expect(heel).toHaveAttribute('tabindex', '-1');
});

/**
 * A focus ring drawn as an outside `box-shadow` needs 4px of room outside the element, and **every**
 * scrollport holding a focusable has to reserve it — `overflow-y: auto` computes `overflow-x` to
 * `auto` as well, so a control flush against the port's edge has its ring clipped on the sides and
 * at whichever end it is scrolled to (docs/app.md §Theming). There are four, and the reservation is
 * made once by `.scrollport` in `app.css`; this walks all four, because the way that rule was got
 * wrong before was a list nobody had counted.
 *
 * Measured rather than asserted from the CSS, because the slack is the sum of the port's own
 * padding and whatever inset its content carries. The second measurement focuses the last control
 * in any port that actually overflows: that is the case `scroll-padding` buys, and it does not
 * exist at rest.
 */
test('leaves every scrollport room for the focus ring it draws', async ({ page }) => {
  // Short enough that the sidebar is forced to scroll, so the `scroll-padding` half is exercised
  // rather than assumed: the 5-shoe fixture cannot fill a list on its own.
  await page.setViewportSize({ width: 1440, height: 560 });
  await page.goto('/');

  // Both `<details>` opened without a press: an outside `pointerdown` is a dismissal, so clicking
  // one to open it would shut the other and the four could never be measured in one pass.
  await page.getByRole('button', { name: /^Add filter/ }).click();
  await page.evaluate(() => {
    for (const d of document.querySelectorAll<HTMLDetailsElement>('details')) d.open = true;
    // `el.click()` and not a real press: a synthetic click fires no `pointerdown`, so the Display
    // panel opens without dismissing the two `<details>` — and it reaches a trigger the open
    // dialog's scrim would otherwise intercept. Five ports have to be measurable in ONE pass.
    document.querySelector<HTMLElement>('[data-testid="display-trigger"]')!.click();
  });

  const ports = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      const cs = getComputedStyle(el);
      if (!/auto|scroll/.test(cs.overflowX + ' ' + cs.overflowY)) continue;
      const rows = [...el.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]')];
      if (!rows.length) continue;
      const box = () => el.getBoundingClientRect();
      // Opening the dialog pressed a button at the foot of the sidebar, which scrolled it: at rest
      // means unscrolled, and the first row is only the top row from there.
      el.scrollTop = 0;
      const first = rows[0]!.getBoundingClientRect();
      const b = box();
      const port = {
        name: el.getAttribute('id') ?? el.getAttribute('aria-label')
          ?? el.closest('[aria-label]')?.getAttribute('aria-label') ?? el.tagName.toLowerCase(),
        scrollPadding: cs.scrollPaddingTop,
        rest: { left: Math.round(first.left - b.left), right: Math.round(b.right - first.right),
                top: Math.round(first.top - b.top) },
        scrolled: null as null | { top: number; bottom: number },
      };
      if (el.scrollHeight > el.clientHeight) {
        const last = rows[rows.length - 1]!;
        last.focus();
        const a = box();
        const r = last.getBoundingClientRect();
        port.scrolled = { top: Math.round(r.top - a.top), bottom: Math.round(a.bottom - r.bottom) };
      }
      out.push(port);
    }
    return out;
  });

  // Enumerated rather than listed: the way this rule was got wrong was a scrollport nobody had
  // counted, so a fifth one that forgets `.scrollport` has to fail here on the day it is added.
  expect(ports.length, 'no scrollport found — the enumeration has gone stale').toBeGreaterThanOrEqual(5);

  // 4px is the ring's outer radius; anything less and it is drawn cropped.
  for (const p of ports) {
    expect(p.scrollPadding, `${p.name}: reserves nothing for a control Tab scrolls to`).toBe('4px');
    expect(p.rest.left, `${p.name}: ring clipped on the left`).toBeGreaterThanOrEqual(4);
    expect(p.rest.right, `${p.name}: ring clipped on the right`).toBeGreaterThanOrEqual(4);
    expect(p.rest.top, `${p.name}: ring clipped at the top`).toBeGreaterThanOrEqual(4);
    if (!p.scrolled) continue;
    expect(p.scrolled.top, `${p.name}: ring clipped at the top once scrolled`).toBeGreaterThanOrEqual(4);
    expect(p.scrolled.bottom, `${p.name}: ring clipped at the foot once scrolled`).toBeGreaterThanOrEqual(4);
  }
});

/**
 * The scrollbar's room, which is a different fact from the ring's and was reserved by neither. A
 * scrolling port draws its bar at the inline end, and the two ports whose rows END in a number —
 * the column picker's coverage figures and the Display panel's outputs — put that number flush
 * against it: 4px of air, so the bar reads as touching the figure where it takes layout and is
 * painted straight over it where it is an overlay, which is Firefox's own default on Linux.
 *
 * Measured as the distance from the right-most painted thing to where the bar is drawn, which is
 * the same number in both regimes — headless Playwright only ever gives the overlay one
 * (docs/app.md §Theming). Enumerated like the ring's room above, so a port
 * added later has to answer for it too.
 */
test('leaves every scrollport room for the scrollbar it draws over no text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 560 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Add filter/ }).click();
  await page.evaluate(() => {
    for (const d of document.querySelectorAll<HTMLDetailsElement>('details')) d.open = true;
    document.querySelector<HTMLElement>('[data-testid="display-trigger"]')!.click();
  });

  const ports = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll<HTMLElement>('.scrollport')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0) continue;
      const cs = getComputedStyle(el);
      const bar = el.offsetWidth - el.clientWidth
        - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      // TEXT-bearing leaves only, and that is the claim rather than a convenience. A bar drawn over
      // a figure makes it unreadable, which is the whole defect; a decoration that reaches the same
      // edge — `RangeFilter`'s `aria-hidden` bound markers overhang their track by 5px and clear
      // the sidebar's bar by 7 — is bounded by the port's own padding and is a different question
      // (docs/app.md §Theming records it).
      let worst = -Infinity;
      let who = '';
      for (const node of el.querySelectorAll<HTMLElement>('*')) {
        if (node.children.length) continue;
        const text = (node.textContent ?? '').trim();
        if (!text) continue;
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > worst) { worst = r.right; who = text.slice(0, 16); }
      }
      out.push({
        name: el.getAttribute('id') ?? el.className.split(/\s+/)[0] ?? el.tagName.toLowerCase(),
        // Null where the port paints no text at all — counted as a port, exempt from the bound.
        air: worst === -Infinity ? null : Math.round(b.right - parseFloat(cs.borderRightWidth) - bar - worst),
        who,
      });
    }
    return out;
  });

  expect(ports.length, 'no scrollport found — the enumeration has gone stale').toBeGreaterThanOrEqual(5);
  // One classic bar on the engines this project measures on: 12px on a GTK Firefox.
  for (const p of ports) {
    if (p.air === null) continue;
    expect(p.air, `${p.name}: the scrollbar is drawn over "${p.who}"`).toBeGreaterThanOrEqual(12);
  }
});

/**
 * The panel is anchored, and an anchored box is only ever as reachable as the trigger it hangs off.
 * Every DOM assertion this suite already makes passed while all 52 checkboxes sat at a negative x —
 * `toBeVisible` is a CSS question, not a geometry one — so this measures the painted box against
 * the viewport instead. Both bands, because the anchor differs across 800px
 * (docs/app.md §Stacking order).
 */
test('opens the column picker fully on screen at every width', async ({ page }) => {
  for (const width of [320, 360, 390, 700, 800, 801, 1200]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.locator('details.picker summary').click();
    const seen = await page.evaluate(() => {
      const panel = document.querySelector('details.picker .panel')!;
      const box = panel.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const first = panel.querySelector('input[type=checkbox]')!.getBoundingClientRect();
      const legend = panel.querySelector('.legend')!;
      const line = legend.querySelector('span')!.getBoundingClientRect().height;
      return {
        left: Math.round(box.left), right: Math.round(vw - box.right),
        hit: panel.contains(document.elementFromPoint(first.x + first.width / 2, first.y + first.height / 2)),
        legendLines: Math.round(legend.getBoundingClientRect().height / line),
      };
    });
    expect(seen.left, `the picker panel hangs off the left edge at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(seen.right, `the picker panel hangs off the right edge at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(seen.hit, `the first checkbox is not reachable at ${width}px`).toBe(true);
    // 320px is the one width where the 20rem cannot fit and the panel clamps to the screen instead
    // (docs/app.md §Stacking order); everywhere above it the direction legend holds one line.
    if (width >= 360) expect(seen.legendLines, `the direction legend wrapped at ${width}px`).toBe(1);
  }
});

/**
 * The same measurement the column picker earned the hard way, for the panel that replaced the theme
 * button: an anchored box is only as reachable as the trigger it hangs off, and every DOM assertion
 * this suite makes passes while the whole thing sits at a negative x (docs/app.md §Stacking order).
 * Both bands, because the utilities change host across 800px and the panel's anchor goes with them.
 *
 * The height is measured too, which the picker's is not: this panel is the only floating box in the
 * app that opens BELOW the chrome on a short phone, so a body that outgrew its `max-height` would
 * put `Reset` past the bottom of the screen with no way to scroll to it.
 */
test('opens the Display panel fully on screen at every width', async ({ page }) => {
  for (const width of [320, 360, 390, 700, 800, 801, 1000, 1440]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Display' }).click();
    const seen = await page.evaluate(() => {
      const panel = document.querySelector('.display .panel')!;
      const b = panel.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const first = panel.querySelector('input')!.getBoundingClientRect();
      return {
        left: Math.round(b.left), right: Math.round(vw - b.right),
        top: Math.round(b.top), bottom: Math.round(vh - b.bottom),
        hit: panel.contains(document.elementFromPoint(first.x + first.width / 2, first.y + first.height / 2)),
      };
    });
    expect(seen.left, `the Display panel hangs off the left edge at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(seen.right, `the Display panel hangs off the right edge at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(seen.top, `the Display panel opens above the viewport at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(seen.bottom, `the Display panel runs off the foot at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(seen.hit, `the first control is not reachable at ${width}px`).toBe(true);
  }
});

/**
 * The live preview is the whole reason this panel is anchored and scrimless rather than modal
 * (docs/app.md §The display preferences), so what is measured is the TABLE repainting while the
 * panel is up — not the panel's own state.
 */
test('repaints the table under an open Display panel', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/');
  const cell = () => page.locator('td.num.tinted.blue').first();
  // The cell names a bucket and the generated sheet declares what that bucket paints, so what a
  // grip moves is the rule rather than the cell (docs/app.md §Theming). Both halves are read: the
  // alpha the rule composites at, and the colour the engine actually resolved it to.
  const read = async () => cell().evaluate((el) => {
    const cls = [...el.classList].find((c) => /^w-b-\d+$/.test(c))!;
    const sheet = document.getElementById('wash-buckets')!.textContent!;
    const pct = new RegExp(`\\.${cls}\\{[^}]*var\\(--wash-blue\\) ([\\d.]+)%`).exec(sheet)![1]!;
    return { a: Number(pct), bg: getComputedStyle(el).backgroundColor };
  });

  await page.getByRole('button', { name: 'Display' }).click();
  const rest = await read();
  // The table is still on screen: no scrim, nothing covering the cell being previewed.
  await expect(cell()).toBeVisible();

  await page.getByLabel('Strength').fill('0.3');
  const weaker = await read();
  expect(Number(weaker.a), 'the strength grip did not reach the table').toBeLessThan(Number(rest.a));
  expect(weaker.bg).not.toBe(rest.bg);

  await page.getByRole('button', { name: 'Reset' }).click();
  expect(await read(), 'Reset did not put the ramp back').toEqual(rest);
});

test('traps focus in the filter drawer and hands it back on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Filters' });
  const drawer = page.getByTestId('filter-drawer');
  // Closed, it is out of the tab order rather than merely translated away.
  await expect(drawer).toBeHidden();

  await toggle.click();
  await expect(drawer).toBeVisible();
  // The PANEL, not its search box. A programmatically focused text input raises the phone keyboard
  // over the filters the runner just asked to see (docs/app.md §Filters).
  await expect(drawer).toBeFocused();
  await expect(page.getByLabel('Search', { exact: true })).not.toBeFocused();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('renders a superseded pair once and keeps colocated halves independently sortable', async ({ page }) => {
  // Arrived at by link rather than on the default view: midsole softness is the fixture's only
  // superseded pair and is deliberately not curated (docs/app.md §Filters), so a listed row is how
  // a runner reaches it now. The pair behaviour under test is the same either way.
  await page.goto('/?rows=midsole-softness-22');

  // one entry for the pair, not one per generation, with the current method selected
  await expect(page.getByRole('heading', { name: 'Midsole softness', exact: true })).toHaveCount(1);
  const gens = page.getByRole('radio', { name: /Midsole softness/ });
  await expect(gens).toHaveCount(2);
  await expect(gens.first()).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('group', { name: 'Midsole softness — 2022 method' })).toBeVisible();

  // switching generation releases the other one rather than ANDing the two
  await gens.nth(1).click();
  await expect(page).toHaveURL(/gen\.midsole-softness-22=midsole-softness/);
  await expect(page.getByRole('group', { name: 'Midsole softness — original' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Midsole softness — 2022 method' })).toHaveCount(0);

  // both halves of the colocated metric sort on their own key
  await page.goto('/?cols=score,energy-return-heel,energy-return-forefoot');
  await page.getByRole('columnheader', { name: /Energy return \(heel\)/ }).getByRole('button').click();
  await expect(page).toHaveURL(/sort=-energy-return-heel/);
  await page.getByRole('columnheader', { name: /Energy return forefoot/ }).getByRole('button').click();
  await expect(page).toHaveURL(/sort=-energy-return-forefoot/);
});

// The one end-to-end check of the score, and the reason the e2e fixture carries the scoring tests
// at all: without readings the column renders all em dashes and would pass while proving nothing.
test('Easy ranks by its own score', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByRole('columnheader', { name: /Easy heel score/ })).toBeVisible();
  const rows = page.locator('tbody tr.shoe');
  await expect(rows.first()).toContainText('cushy');
  // The score's own cell, not the whole row: an unplated shoe renders an em dash in the plate
  // column, so "this row holds no dash" would be a claim about plates.
  const score = (row: number) => rows.nth(row).locator('td').nth(2);
  await expect(score(0)).toHaveText('85.04');
  // mystery carries no readings at all, so it sorts last as unscored rather than as a zero
  await expect(rows.last()).toContainText('mystery');
  await expect(score(3)).toHaveText('—');
});

test('the runner can opt stability into the score without losing the story', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Easy/ }).click();
  await page.getByRole('button', { name: 'Stability' }).click();
  await expect(page).toHaveURL(/stab=1/);
  // the preference is the runner's, not the search's, so the story stays marked through it
  await expect(page.getByRole('radio', { name: /Easy/, checked: true })).toBeVisible();
  await page.getByRole('radio', { name: /All/ }).click();
  await expect(page.getByRole('radio', { name: /All/, checked: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stability' })).toHaveAttribute('aria-pressed', 'true');
});

// Tempo and Race in the browser, for the same reason Easy is here: the score column is resolved in
// `Page` and rendered through two table components, so a broken wiring shows as em dashes rather
// than as a failing unit test.
test('Tempo ranks by its own score and keeps carbon out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Tempo/ }).click();
  await expect(page.getByRole('columnheader', { name: /Tempo heel score/ })).toBeVisible();
  const rows = page.locator('tbody tr.shoe');
  // The carbon racer is the shoe the plate gate removes, and the one a speed ranking would promote.
  await expect(rows).toHaveCount(4);
  // `table:not(.proto)`: the wrapper holds a second, hidden one-row table the height measurement is
  // cloned from, and it is not a shoe (docs/app.md §Table presentation).
  await expect(page.locator('table:not(.proto) tbody')).not.toContainText('racer');
  const score = (row: number) => rows.nth(row).locator('td').nth(2);
  await expect(rows.first()).toContainText('cushy');
  await expect(score(0)).toHaveText('92.7');
  await expect(rows.last()).toContainText('mystery');
  await expect(score(3)).toHaveText('—');
});

test('Race applies no filter at all, and the stability preference does not move it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Race/ }).click();
  await expect(page.getByRole('columnheader', { name: /Race heel score/ })).toBeVisible();
  const rows = page.locator('tbody tr.shoe');
  // No plate gate and no bound: the whole fixture fleet is on screen, carbon included and first.
  await expect(rows).toHaveCount(5);
  const score = (row: number) => rows.nth(row).locator('td').nth(2);
  await expect(rows.first()).toContainText('racer');
  await expect(score(0)).toHaveText('76.52');
  await expect(score(1)).toHaveText('70.49');

  // Race declares no stable variant, so the preference is inert on it — the About panel says so, and
  // this is where that claim meets the rendered table.
  await page.getByRole('button', { name: 'Stability' }).click();
  await expect(page).toHaveURL(/stab=1/);
  await expect(rows.first()).toContainText('racer');
  await expect(score(0)).toHaveText('76.52');
  await expect(score(1)).toHaveText('70.49');
});

/**
 * Both headline claims of row-based history, at a real width: jsdom's history traversal is
 * asynchronous under the unit suite's fake clock, so this is where a real Back press is asserted.
 * docs/app.md §View and URL ownership
 */
test('Back closes the open shoe instead of leaving the site', async ({ page }) => {
  await page.goto('/?plate=carbon');
  await page.getByText('racer').first().click();
  await expect(page.getByRole('link', { name: /Full review on RunRepeat/ })).toBeVisible();
  await expect(page).toHaveURL(/open=racer/);

  await page.goBack();
  await expect(page.getByRole('link', { name: /Full review on RunRepeat/ })).toHaveCount(0);
  // The filter that was in the address before the row was opened is still there, and so is the app.
  await expect(page).toHaveURL(/plate=carbon/);
  await expect(page).not.toHaveURL(/open=/);
  await expect(page.getByTestId('receipt')).toBeVisible();
});

test('Back takes only the open set, keeping a filter changed while the row was open', async ({ page }) => {
  await page.goto('/?plate=carbon');
  await page.getByText('racer').first().click();
  await expect(page).toHaveURL(/open=racer/);
  // Changed on the entry the row opened, so a Back that adopted the popped address wholesale
  // would discard it (docs/app.md §View and URL ownership).
  await page.getByRole('columnheader', { name: /Weight/ }).getByRole('button').click();
  await expect(page).toHaveURL(/sort=-weight/);

  await page.goBack();
  await expect(page.getByRole('link', { name: /Full review on RunRepeat/ })).toHaveCount(0);
  await expect(page).toHaveURL(/plate=carbon/);
  await expect(page).toHaveURL(/sort=-weight/);
  await expect(page).not.toHaveURL(/open=/);
});

/**
 * The Chromium half of the fit model's guard: these are the metrics its per-character tables were
 * measured in, so a regenerated table, a changed padding or a moved token shows up here first.
 * `cross-browser.spec.ts` holds the same comparison to Firefox and WebKit, which is where the model
 * can be wrong without anyone having measured it.
 * docs/app.md §Two renderings, and only one of them mounted
 */
for (const [name, cols] of Object.entries(FIT_SETS)) {
  test(`models the desktop table's own min-content width, ${name} columns`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const { model, rendered } = await measureFit(page, cols);
    expect(Math.abs(model - rendered),
      `the fit model says ${model.toFixed(1)}px and Chromium renders ${rendered.toFixed(1)}px`)
      .toBeLessThanOrEqual(FIT_TOLERANCE_PX);
  });
}

/** A dropped slug authors the same breaks the model reads, so it carries the ordinary two-sided
 * agreement rather than the old deliberate over-reservation (docs/app.md §Table presentation). */
test('models a dropped column\'s min-content width in Chromium', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { model, rendered } = await measureFit(page, FIT_DROPPED_COLS);
  expect(Math.abs(model - rendered),
    `the fit model says ${model.toFixed(1)}px and Chromium renders ${rendered.toFixed(1)}px`)
    .toBeLessThanOrEqual(FIT_TOLERANCE_PX);
});

/**
 * The other half of what a declared width buys and costs. The min-content guard above says the
 * model agrees with the engine about the table; this says nothing hangs out of a COLUMN — the
 * failure a declared width creates and `table-layout: auto` did not have, because a cell that
 * outgrew its column used to widen it (spec §Failure behaviour).
 *
 * `cross-browser.spec.ts` runs the same sweep in the two engines whose min-content the model is not
 * built from, which is where the excursion is non-zero at all.
 */
for (const [name, cols] of Object.entries(FIT_SETS)) {
  test(`keeps every cell inside its declared column, ${name} columns`, async ({ page }) => {
    await sweepDeclaredColumns(page, cols);
  });
}

/**
 * The same declared-column bound for a raw slug whose break opportunities are authored rather than
 * inferred (`FIT_DROPPED_COLS`).
 */
test('keeps a dropped column\'s header inside its declared column', async ({ page }) => {
  await sweepDeclaredColumns(page, FIT_DROPPED_COLS);
});

/**
 * **Bulk-measured row heights against what the table renders**, in the engine the width model was
 * measured in. The measurement is the app's own function, handed to the page — the sweep and the
 * reason it looks like this live in `fit-support.ts`.
 *
 * **Two column sets, here and in `cross-browser.spec.ts`, and the second is not a repetition.** A
 * row's height is a function of its NAME and the width that name wraps at, so the width is the only
 * variable — but the default set never takes the name column much past 500px at any width in the
 * ladder, and `minimal` is one numeric column, which leaves the name almost the whole table. That
 * is the regime where a measurement built to out-run the column stops running: whatever a name is
 * laid out against has to hold at every width the app can produce, not only the ones an
 * eight-column view reaches (`app/src/lib/row-height.ts`).
 */
test('renders every row at the height it measured', async ({ page }) => {
  await sweepRowHeights(page, FIT_SETS['default']!);
  await sweepRowHeights(page, FIT_SETS['minimal']!);
});

/**
 * **The claim that makes the measurement affordable**, and the one thing about it a suite can hold
 * without timing anything: a filter moves no declared width, so the cache key does not move and a
 * drag pays nothing (spec §Decisions, `app/src/lib/row-height.ts`). It is true because a declared
 * width is `min + share` over the COLUMNS and the track, never over the rows in the DOM — which is
 * what declaring the widths bought and what this would catch the loss of.
 */
test('does not move a declared column width when a filter does', async ({ page }) => {
  const rows = page.locator('.tblwrap table tbody tr.shoe');
  // The layout width is re-established after each load and the reading is waited for, for the two
  // reasons the height sweep waits: the declaration reaches the DOM through a `ResizeObserver`, so
  // a reading taken straight after a resize is the previous track's — and a filter that empties the
  // page takes the classic scrollbar with it, which moves the LAYOUT width by its own 15px and
  // would be read here as the filter having moved a column.
  //
  // `settledDeclared` rather than a wait of its own, and the wait it replaced was this test's own
  // assertion in reverse: it waited on `|Σwidths − tableWidth| ≤ 1` and then compared PER COLUMN,
  // with the note below saying the sum is exactly the wrong thing to compare. That wait was blind
  // wherever a pending change is decided in JS and has not reached the DOM yet — which is what the
  // sidebar boundary is and what a windowed body will be (`app/e2e/fit-support.ts`).
  const settled = async () => {
    expect(await setLayoutWidth(page, 1440)).toBe(1440);
    return settledDeclared(page, 'after the filter changed');
  };

  await page.goto('/');
  await awaitFacesLoaded(page, { required: APP_FACES });
  const before = await settled();
  const shown = await rows.count();

  await page.goto('/?disc=only');
  await awaitFacesLoaded(page, { required: APP_FACES });
  expect(await rows.count(),
    'the filter removed no rows, so it cannot show that removing rows moves nothing')
    .toBeLessThan(shown);
  const after = await settled();

  expect(after.cols).toBe(before.cols);
  // Per column, not the sum: `columnWidths` shares the whole track out either way, so the sums
  // agree even when every column has moved.
  expect(after.widths).toEqual(before.widths);
});

/**
 * **The stacked list under the DESKTOP chrome** — the regime the fit switch created and the one no
 * other assertion reaches. The two boundaries are independent by design (§The chrome bands): the bar
 * keeps its words from 801px up, while the table is only mounted where it fits, which on the real
 * fleet is 931px. Between the two the runner gets a phone rendering under a bar that is not a
 * phone's, and the pair has to be coherent — the list's own sticky header sits under a band whose
 * height is measured in `Page.svelte` and handed to it as `--thead-top`, so the two waves' numbers
 * meet here or the header row paints over the shoes.
 *
 * The width is COMPUTED from the model rather than stated, and asserted to be above the chrome's
 * boundary: a fixture whose table shrinks below it would otherwise leave this test passing while
 * testing the regime beside the one it names.
 */
test('mounts the stacked list under the desktop chrome, and holds it to the measured band', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const cols = FIT_SETS['default']!;
  const { model } = await measureFit(page, cols);
  // One pixel under the width the desktop rendering needs, in the drawer regime (`lib/fit.ts`).
  const width = Math.ceil(model + FIT_SLACK_PX + 16) - 1;
  expect(width, 'the fixture no longer reaches the band where the chrome is a desktop and the '
    + 'table is not').toBeGreaterThan(800);

  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?cols=${cols.join(',')}`);
  await awaitFacesLoaded(page);

  await expect(page.getByTestId('shoe-table-mobile')).toBeVisible();
  await expect(page.locator('.tblwrap')).toHaveCount(0);
  // The chrome is still the desktop's here: the utilities are in the masthead, worded.
  await expect(page.locator('header').getByRole('button', { name: 'Copy link' })).toBeVisible();

  // Scrolled deep, so the list's header is doing its sticking rather than merely sitting there.
  await page.evaluate(() => window.scrollTo(0, 3000));
  const band = await page.evaluate(() => {
    const chrome = document.querySelector('.chrome')!.getBoundingClientRect();
    const th = document.querySelector('thead th')!.getBoundingClientRect();
    const spacer = document.querySelector('.chrome-space')!.getBoundingClientRect();
    return {
      behind: Math.round(chrome.bottom - th.top),
      spacerGap: Math.round(spacer.height - chrome.height),
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(band.behind, 'the list header sits behind the pinned chrome').toBeLessThanOrEqual(0);
  expect(band.spacerGap, 'the spacer is not the height of the band it replaces').toBe(0);
  expect(band.over, 'the page scrolls sideways under six columns').toBe(0);
});

/**
 * The rendering can now change under a runner who never touched the window — ticking a column is
 * enough. Everything they were reading has to survive it: the open row, the view in the address bar
 * and the wash they tuned. The open set is `Page.svelte`'s exactly so that it can
 * (docs/app.md §Two renderings, and only one of them mounted), and the paint is a prop for the same
 * reason (docs/app.md §The display preferences) — this is what proves both across the swap rather
 * than asserting them of one rendering at a time.
 */
test('keeps the open row, the view and the paint when a ticked column flips the rendering', async ({ page }) => {
  // 750px: three columns need 443px of it and seven need 793px against the 734px it offers, so the
  // ticks below are what cross the threshold — the window never moves. Seven and not six: a figure
  // column's minimum lost `--caret-w` when the sort mark went out of flow (`headerMinPx`), and the
  // six that used to overflow this window now come to 719px and fit inside it.
  await page.setViewportSize({ width: 750, height: 900 });
  await page.goto('/?cols=score,msrpGbp,weight');
  await awaitFacesLoaded(page);
  // A tuned wash first, so the flip has something of the runner's to lose.
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByLabel('Tint every ranked cell').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tblwrap')).toBeVisible();

  await page.getByText('cushy').first().click();
  await expect(page.locator('tr.shoe[aria-expanded=true]')).toHaveCount(1);
  // A `w-m-` class is only ever emitted from a paint with the base on, so its presence IS the
  // resolved paint having reached the cell (docs/app.md §Theming).
  const mixClass = (sel: string) => page.locator(sel).first()
    .evaluate((el) => [...el.classList].find((c) => /^w-m-\d+$/.test(c)) ?? '');
  const paintBefore = await mixClass('td.num.tinted.blue');
  expect(paintBefore, 'the two-colour wash never reached the desktop cells').not.toBe('');

  // Enough columns to take the table past this window, ticked the way a runner would.
  await page.locator('details.picker summary').click();
  for (const label of [/Tongue gusset/, /Outsole durability/, /Heel counter stiffness/,
    /Midsole softness/]) {
    await page.getByRole('checkbox', { name: label }).check();
  }
  await page.keyboard.press('Escape');

  await expect(page.getByTestId('shoe-table-mobile')).toBeVisible();
  await expect(page.locator('.tblwrap')).toHaveCount(0);
  // The same row, still open, in the other rendering — and its panel with it.
  await expect(page.locator('tr.shoe[aria-expanded=true]')).toHaveCount(1);
  await expect(page.locator('tr.shoe[aria-expanded=true]')).toHaveAttribute('aria-controls', 'detail-cushy');
  await expect(page.locator('#detail-cushy')).toBeVisible();
  await expect(page).toHaveURL(/open=cushy/);
  await expect(page).toHaveURL(/cols=[^&]*tongue-gusset-type/);
  // And the wash the runner tuned, which the flip hands to the other table as a prop.
  const paintAfter = await mixClass('span.chip.tinted.blue');
  expect(paintAfter, 'the resolved paint did not survive the swap').not.toBe('');
});
