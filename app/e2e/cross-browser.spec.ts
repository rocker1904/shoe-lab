import { expect, test } from '@playwright/test';
import { FIT_SLACK_PX, SIDEBAR_PERMANENT_PX } from '../src/lib/fit';
import {
  awaitFacesLoaded, FIT_DROPPED_COLS, FIT_SETS, FIT_TOLERANCE_PX, measureFit, sweepDeclaredColumns,
  sweepRowHeights,
} from './fit-support';

/**
 * Firefox and WebKit implement none of `input type="month"` — both reflect the type back as `text`,
 * so the control that Chromium renders as a picker is a bare box there, and a Chromium-only suite
 * reported it working. These run in those two engines only; the layout assertions in
 * `smoke.spec.ts` stay on one engine, where a single set of font metrics keeps them meaningful.
 *
 * That is this file's remit: the places where a NATIVE control's behaviour is the thing under test.
 * The column picker's `<details>` is here for the same reason as the month input.
 */
test('bounds the fleet by release month without a native month input', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await expect(page.getByTestId('receipt')).toContainText('Showing 5 of the 5 shoes');

  // The control that was a bare text box in these two engines. Chromium does not run this file, so
  // the same claim is made against jsdom in `FilterSidebar.test.ts`.
  await expect(page.locator('input[type="month"]')).toHaveCount(0);

  const trigger = page.getByRole('button', { name: /Released after/ });
  await expect(trigger).toHaveText(/Any month/);
  await trigger.click();

  // A real grid, in an engine that would have rendered no picker at all.
  const panel = page.getByRole('dialog', { name: 'Choose a release month' });
  await expect(panel.getByRole('gridcell')).toHaveCount(12);
  await panel.getByRole('button', { name: 'Previous year' }).click();
  await panel.getByRole('gridcell', { name: 'March' }).click();

  await expect(page).toHaveURL(/after=\d{4}-03/);
  await expect(trigger).toHaveText(/March \d{4}/);

  // The chips still own clearing: a chip that sets a date cannot also unset it. Scoped to its own
  // group, because the discontinued filter offers an `Any` too and neither is the other's.
  await page.getByRole('radiogroup', { name: 'Released after, quick bounds' })
    .getByRole('radio', { name: 'Any', exact: true }).click();
  await expect(page).not.toHaveURL(/after=/);
  await expect(trigger).toHaveText(/Any month/);
});

/**
 * Every way out of the picker except choosing a month. All three were broken and all three passed
 * in jsdom, because `fireEvent` moves no focus and dispatches keys straight at the node you name:
 * the panel's own `keydown` was being tested against an event that could never reach it. Only a
 * real browser has an `activeElement` to get wrong.
 */
test('closes the month picker every way out, and hands focus back', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /Released after/ });
  const panel = page.getByRole('dialog', { name: 'Choose a release month' });

  // Opening has to put focus inside, or the panel's Escape handler is unreachable.
  await trigger.click();
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((p) => p.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // The trigger toggles: with focus inside the panel, its own click must not close and reopen.
  await trigger.click();
  await panel.getByRole('button', { name: 'Previous year' }).click();
  await trigger.click();
  await expect(panel).toHaveCount(0);

  // A click anywhere else dismisses it, including on something that takes no focus itself.
  await trigger.click();
  await expect(panel).toBeVisible();
  await page.getByRole('heading', { name: 'Search' }).click();
  await expect(panel).toHaveCount(0);

  /*
   * And the keyboard's own way out, which is the way that used to strand it. Tabbing back through
   * the trigger — a landing pad *outside* the panel — left the grid open over the sidebar with
   * Escape inert from then on, because the key goes to whatever holds focus and the handler is on
   * the panel (docs/app.md §Every floating panel dismisses the same way).
   */
  await trigger.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Shift+Tab');          // grid cell -> Previous year
  await page.keyboard.press('Shift+Tab');          // -> the trigger, still inside the anchor
  await expect(trigger).toBeFocused();
  await expect(panel, 'stepping back onto the trigger is not leaving').toBeVisible();
  await page.keyboard.press('Shift+Tab');          // -> out of the anchor altogether
  await expect(panel).toHaveCount(0);
});

/**
 * The grid is browsable by keyboard: arrows move, Enter commits. It was a `radiogroup` driven by
 * `lib/roving.ts`, which activates whatever it moves to — correct for a radiogroup, and here it
 * meant the first arrow press wrote a bound the runner never chose and shut the panel on them.
 */
test('browses the month grid with the arrows and commits on Enter', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/?after=2024-03');
  const trigger = page.getByRole('button', { name: /Released after/ });
  const panel = page.getByRole('dialog', { name: 'Choose a release month' });
  await trigger.click();
  await expect(panel.getByRole('gridcell', { name: 'March' })).toBeFocused();

  // Three moves across and one down: still open, still March, nothing written.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(panel.getByRole('gridcell', { name: 'September' })).toBeFocused();
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/after=2024-03/);

  await page.keyboard.press('Enter');
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/after=2024-09/);
  await expect(trigger).toHaveText(/September 2024/);
});

/** Stepping to either end disables the button under the pointer, and the browser then drops focus
 *  to `<body>`. The panel must neither close on that nor strand the keyboard user on nothing. */
test('keeps the month grid reachable at the ends of the fleet', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: /Released after/ }).click();
  const panel = page.getByRole('dialog', { name: 'Choose a release month' });

  const back = panel.getByRole('button', { name: 'Previous year' });
  for (let i = 0; i < 20; i++) if (await back.isEnabled()) await back.click();
  await expect(back).toBeDisabled();
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((p) => p.contains(document.activeElement))).toBe(true);

  // The earliest year has months the fleet never reached, and a disabled radio cannot be a tab stop.
  const reachable = await panel.evaluate((p) =>
    [...p.querySelectorAll('[role="gridcell"]')].some((r) => r.tabIndex === 0 && !r.disabled));
  expect(reachable, 'the month grid has no reachable tab stop').toBe(true);
});

/**
 * The column picker is a native `<details>`, which is the other control this file exists for: the
 * browser owns the toggle, and no engine dismisses one on an outside press or on Escape, so both
 * are the app's to add (docs/app.md §Filters). Two things here can only be answered by a real
 * engine — whether `bind:open` hears the `toggle` the summary queues, and whether Escape is already
 * taken by something native.
 */
test('closes the column picker every way out, and hands focus back', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  // The element, not its text: the word is one of two children the summary swaps at 800px, so a
  // text locator resolves to that span rather than to the control that takes focus.
  const summary = page.locator('details.picker summary');
  const panel = page.locator('details.picker .panel');

  await summary.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(summary).toBeFocused();

  // Ticking a column is a press *inside*: the panel is a list you work down, and dismissing on the
  // first checkbox would make choosing a second one a second trip.
  await summary.click();
  await page.getByRole('checkbox', { name: /Weight/ }).first().click();
  await expect(panel).toBeVisible();

  // A press anywhere else dismisses, including on something that takes no focus itself.
  await page.getByRole('heading', { name: 'Search' }).click();
  await expect(panel).toBeHidden();

  // And the summary still toggles: its own press is inside the box the listener guards, so it must
  // not close and immediately reopen.
  await summary.click();
  await expect(panel).toBeVisible();
  await summary.click();
  await expect(panel).toBeHidden();

  /*
   * The keyboard's ways out, both of which used to strand it — this panel is `position: absolute`
   * over the table, and it survived an exit in either direction with Escape inert from then on
   * (docs/app.md §Every floating panel dismisses the same way).
   *
   * The blur hands the keyboard block a clean start, and it is the *test's* contamination rather
   * than anything the app does. WebKit anchors sequential focus navigation to the node the pointer
   * last pressed, not to `activeElement`: the presses above land on an element child of the summary
   * (it holds a word, two SVGs and a count badge), that child cannot take focus, and so every
   * later Tab and Shift+Tab resolves back to the summary and moves focus nowhere — no `focusout`
   * fires at all, which leaves the app nothing to answer. `press()` cannot clear it, because the
   * summary is already `activeElement` and its `focus()` is then a no-op; a `blur()` first does.
   * Measured on a five-line page carrying no app code: Chromium and Firefox navigate away from a
   * clicked summary in every case, WebKit only when the press landed on the summary's own text or
   * its padding rather than on a child element. Same class as the Firefox scrollport tab stop this
   * file already drives around — a UA behaviour the spec steps over, not a claim about the app.
   */
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await summary.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(panel, 'the picker survived a backwards keyboard exit').toBeHidden();

  await summary.press('Enter');
  await expect(panel).toBeVisible();
  await panel.locator('input[type=checkbox]').last().focus();
  await page.keyboard.press('Tab');
  await expect(panel, 'the picker survived a forwards keyboard exit').toBeHidden();
});

/**
 * The control that used to be the app ring's one blind spot. `app.css` paints the ring with a
 * `box-shadow`, and WebKit draws no shadow on a **native** checkbox's rendered control — so the
 * `outline: none` half of that rule landed and the shadow half did not, leaving every checkbox in
 * the app with no focus indicator at all in Safari, twenty of them consecutively inside the column
 * picker. The exemption that answered it is gone, because the control is not native any more: under
 * `appearance: none` it is an ordinary box and WebKit paints the shadow on it like everything else
 * (docs/app.md §Theming).
 *
 * That is a claim about one engine, made once and wrongly before, so this asserts the **app's own
 * ring** rather than "an indicator of some kind" — a UA outline appearing here would mean the
 * shadow had silently stopped landing again, and the previous shape of this test would have passed.
 *
 * Driven by Tab: `:focus-visible` does not apply to a programmatic focus after a pointer press, and
 * a ring measured that way reads as missing on a control that has one.
 */
test('paints the app ring on a checkbox, which is no longer a native control', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.locator('details.picker summary').focus();
  await page.keyboard.press('Enter');
  // Up to three, because Firefox gives a scrollport a tab stop of its own and the list is one
  // (UA behaviour, not the app's). The first checkbox is the stop under test.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.getAttribute('type') === 'checkbox')) break;
  }

  const at = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(), type: el.getAttribute('type'),
      focusVisible: el.matches(':focus-visible'),
      appearance: cs.appearance,
      boxShadow: cs.boxShadow,
      // Resolved rather than compared as a string: `--accent` is an `hsl()` in the stylesheet and
      // every engine serialises it into the shadow differently.
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      ringRoom: getComputedStyle(document.documentElement).getPropertyValue('--ring-room').trim(),
    };
  });

  expect(at.tag, 'Tab did not land on a checkbox — the picker markup has moved').toBe('input');
  expect(at.type).toBe('checkbox');
  expect(at.focusVisible, 'the keyboard walk did not produce :focus-visible').toBe(true);
  expect(at.appearance, 'the checkbox is native again, and the ring cannot reach a native one')
    .toBe('none');
  expect(at.boxShadow,
    'no ring on a checkbox — the app paints it with a box-shadow and this engine dropped it')
    .not.toBe('none');
  // Two layers: the surface-coloured gap and the accent ring outside it, at `--ring-room`.
  expect(at.boxShadow.split(/,(?![^(]*\))/), 'the ring is not the app\'s two-layer one')
    .toHaveLength(2);
  expect(at.boxShadow, `the outer layer is not --ring-room (${at.ringRoom})`).toContain(at.ringRoom);
});

/**
 * Whether a browser scrolls the thing it has just focused is not a shared behaviour, which is why
 * the app does it itself (`lib/focus-scroll.ts`, docs/app.md §Theming). WebKit left **24
 * consecutive** sidebar stops below the foot of the window with the sidebar still at `scrollTop: 0`,
 * and Firefox declines to scroll a control that is already partly visible, so the row at the foot of
 * a list kept focus with its ring below the clip edge. Chromium does both correctly and is exactly
 * why neither was noticed — so this belongs in the file the other two engines run.
 *
 * The window is deliberately short: the sidebar has to overflow for the walk to mean anything.
 */
test('keeps every sidebar tab stop on screen and clear of the clip edge', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 500 });
  await page.goto('/');
  // The face swaps in after first paint and the chrome reflows by ~6px, which moves the sidebar's
  // own top and max-height (docs/app.md §Columns and sorting). Measuring across that reflow reads
  // one stop against the layout of the one before it.
  await awaitFacesLoaded(page);

  const bad: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const port = el?.closest('.sidebar');
      // Firefox gives a scrollport a tab stop of its own; the port is not a control in it.
      if (!el || !port || el === port) return null;
      const b = el.getBoundingClientRect(), p = port.getBoundingClientRect();
      return {
        name: el.getAttribute('aria-label') ?? el.closest('label')?.textContent?.trim() ?? el.tagName,
        offscreen: b.bottom <= 0 || b.top >= window.innerHeight,
        slack: Math.round(Math.min(b.top - p.top, p.bottom - b.bottom)),
        // Carried into the failure message: which of the two — the port's own scroll or the page's
        // — came up short is not recoverable from a slack figure alone.
        where: `el ${Math.round(b.top)}..${Math.round(b.bottom)} in port ${Math.round(p.top)}..${Math.round(p.bottom)} at scrollTop ${Math.round(port.scrollTop)}`,
      };
    });
    if (!stop) continue;
    if (stop.offscreen) bad.push(`${stop.name}: focused below the fold`);
    // 4px is the ring's own outer radius, which is what the port reserves.
    if (stop.slack < 4) bad.push(`${stop.name}: ${stop.slack}px inside the port, ring clipped (${stop.where})`);
  }
  expect(bad, 'the sidebar did not follow focus').toEqual([]);
});

test('renders the filter sidebar and the table together', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Released after' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Shoe/ })).toBeVisible();
});

/**
 * The phone panel's clipping. `overflow: hidden` makes the panel a scroll container and the sticky
 * header lands out of place; plain `overflow: clip` fixes that and silently makes every column past
 * the sixth unreachable. Only `overflow-x: visible; overflow-y: clip` does both, and the spec claims
 * that is engine-independent — so it is asserted in the two engines `smoke.spec.ts` never runs.
 */
for (const width of [360, 390]) {
  test(`fits six columns and keeps the rest reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto('/');
    const mobile = page.getByTestId('shoe-table-mobile');
    await expect(mobile).toBeVisible();
    await expect(mobile.getByRole('columnheader')).toHaveCount(6);

    // Six fit with room for the panel's inset, and the page does not go sideways for them.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `the page scrolls sideways at ${width}px`).toBe(true);

    // A seventh column must still be reachable: the panel may clip vertically, never horizontally.
    // Seven FIGURE columns that the e2e fixture actually carries — `cols` is permissive, but the
    // phone table drops every non-figure column, so `releasedAt` or `plate` here would silently
    // leave six. The superseded softness pair is avoided for the same reason.
    await page.goto('/?cols=score,msrpGbp,heel-stack,forefoot-stack,weight,energy-return-heel,toebox-width-widest-part');
    await expect(mobile.getByRole('columnheader')).toHaveCount(7);
    const maxScrollLeft = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return el.scrollWidth - el.clientWidth;
    });
    expect(maxScrollLeft,
      'columns past the sixth are unreachable — the panel is clipping x').toBeGreaterThan(0);

    // Reachable is not the same as CONTAINED, and only the first half was ever measured: the panel
    // was the width of the six-column table, so at seven columns the table painted 52px out through
    // its right edge and at ten 217px — the card's hairline and its bottom-right radius drawn across
    // live rows. The panel takes the same arithmetic the table's own `min-width` does, so it is the
    // table's container at every column count without touching the overflow pair above.
    // Nine figure columns the fixture carries; the slugs are `WIDE`'s, checked against
    // app/e2e/fixtures/shoes.json.
    const FIGURES = ['score', 'msrpGbp', 'heel-stack', 'forefoot-stack', 'weight',
      'energy-return-heel', 'energy-return-forefoot', 'toebox-width-widest-part',
      'shock-absorption-heel'];
    for (const cols of [7, 9]) {
      await page.goto(`/?cols=${FIGURES.slice(0, cols).join(',')}`);
      await expect(mobile.getByRole('columnheader')).toHaveCount(cols);
      const boxes = await page.evaluate(() => {
        const panel = document.querySelector('.bleed > div')!.getBoundingClientRect();
        const table = document.querySelector('[data-testid="shoe-table-mobile"]')!.getBoundingClientRect();
        const heads = [...document.querySelectorAll('[data-testid="shoe-table-mobile"] thead th')];
        return { spill: Math.round(table.right - panel.right),
                 narrowest: Math.min(...heads.map((th) => th.getBoundingClientRect().width)) };
      });
      expect(boxes.spill, `the table paints ${boxes.spill}px outside its own panel at ${cols} columns`)
        .toBeLessThanOrEqual(0);
      // And the panel did not buy that by narrowing the column the labels were validated against.
      expect(boxes.narrowest, `columns fell to ${boxes.narrowest}px at ${cols} columns`)
        .toBeGreaterThanOrEqual(53);
    }
  });
}

/** The expanded row lays out against the TABLE's width, not the viewport's, so the sweep widens the
 *  table as well as the window. And the summary must share a right edge with the columns beneath it
 *  at every tier, which is the whole reason they are one box.
 *  A STORY score rather than RunRepeat's own `score`, which carries no breakdown: the panel breaks
 *  down each story column on screen, so this is what puts a breakdown in the row to place. */
const NARROW = 'easy-score-heel,heel-stack,weight';
// Nine figure columns the e2e fixture actually carries, which is more than the six-column bound —
// so the TABLE is wider than the panel's screen and the container query is doing work a viewport
// media query could not. Check the slugs against app/e2e/fixtures/shoes.json before editing.
const WIDE = 'score,msrpGbp,heel-stack,forefoot-stack,weight,energy-return-heel,'
  + 'energy-return-forefoot,toebox-width-widest-part,shock-absorption-heel';

/**
 * Widening the window may not make the photo smaller. The widest tier used to give `.a-img` THREE
 * of twelve tracks where the tier below gives it four, so crossing 1120px of container took the
 * image from its full 280px down to 257px — a track removed as the container grew. The twelve
 * tracks are gone now: the photo has a **column of its own, 280px wide**, so the size is stated
 * once instead of being an arithmetic result of the container
 * (docs/app.md §The expanded row). A breakdown on screen is what the score column here buys, and
 * it is kept because a breakdown is what used to make the widest tier fire at all.
 */
test('never shrinks the shoe photo as the window widens', async ({ page }) => {
  // ONE ladder, straight through the sidebar's boundary. It used to be two: the sidebar
  // taking its permanent 260px column narrowed every container inside the content track at once
  // and the photo stepped 280px → 270px across it, so a single ladder measured the sidebar
  // arriving rather than this panel's own tiers. Capping the content at the summary's width killed
  // that step — the container stops varying with the window well below it — so the regimes
  // no longer need walking apart (docs/app.md §The expanded row).
  const widths = [820, 900, 1000, 1100, SIDEBAR_PERMANENT_PX - 1, SIDEBAR_PERMANENT_PX,
    1250, 1300, 1440, 1600];
  const seen: { width: number; img: number }[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?cols=easy-score-heel,heel-stack,weight');
    await page.getByText('cushy').first().click();
    await expect(page.locator('.detail .a-bd')).toBeVisible();
    // The fixture carries no `imageUrl`, so the BOX is what can be measured here — and the photo
    // is exactly `min(box, 280)`, which is the `max-width` on the `img`. The rendered image was
    // measured against the real fleet in both engines and agrees with this at every tier.
    seen.push({ width, img: await page.locator('.detail .a-img').first()
      .evaluate((el) => Math.min(280, Math.round(el.getBoundingClientRect().width))) });
  }
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i]!.img, `the photo shrank from ${seen[i - 1]!.img}px at ${seen[i - 1]!.width}px `
      + `to ${seen[i]!.img}px at ${seen[i]!.width}px`).toBeGreaterThanOrEqual(seen[i - 1]!.img);
  }
  // Not just non-decreasing: a column of its own means the photo is its stated size at EVERY width
  // above the stacked tier, which is a stronger claim than the ladder alone and the one the doc
  // makes. `toEqual` over the whole array, so a failure names the widths that fell short.
  expect(seen.map((s) => s.img), 'the photo is not its stated 280px at every width')
    .toEqual(widths.map(() => 280));
});

/**
 * Nothing in the expanded row is wider than the summary, and the whole of it hangs off the left
 * edge under the shoe name (docs/app.md §The expanded row). Three claims in one walk, because they
 * are one decision: the CAP (every zone inside one box no wider than the summary's measure), the
 * LEFT ANCHOR (the box starts where the panel starts, and all the slack falls right into the well)
 * and the BREAKDOWN'S PLACEMENT (the one element constrained to its natural width, left-aligned
 * where the row is one column and centred where it is two — inside that box, never inside the
 * panel).
 *
 * It replaces a shared-right-edge assertion between the summary and the prose columns. That edge
 * still exists and is still asserted, but it is now the capped box's own edge rather than a
 * coincidence between two rules: the summary is co-extensive with the container at every tier.
 */
test('caps the expanded row at the summary, anchored left, with the breakdown placed by tier', async ({ page }) => {
  const CAP = 800;
  for (const { width, cols, pageMayScroll, atCap } of [
    { width: 1440, cols: NARROW, pageMayScroll: false, atCap: true },
    // `WIDE` plus a story score, because `WIDE` carries RunRepeat's own `score` and no story
    // column, so it renders no breakdown at all — and this is the case the cap most has to hold:
    // the table is wider than the window, which is exactly what a viewport query cannot see.
    { width: 1440, cols: `${WIDE},easy-score-heel`, pageMayScroll: true, atCap: true },
    { width: 980, cols: NARROW, pageMayScroll: false, atCap: true },
    // Below the cap the container is the panel's own width, so these two say the cap changed
    // nothing about the tiers underneath it — 390px in particular is the phone rendering.
    { width: 760, cols: NARROW, pageMayScroll: false, atCap: false },
    { width: 390, cols: NARROW, pageMayScroll: false, atCap: false },
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?cols=${cols}`);
    // Re-expanded per iteration: these widths straddle the fit threshold, so which table is
    // mounted changes with them, and the open row
    // belongs to the component that just went away.
    await page.getByText('cushy').first().click();
    await expect(page.locator('.detail .a-body')).toBeVisible();

    // Past the six-column bound the page is SUPPOSED to scroll sideways
    // (docs/app.md §Columns and sorting), so that case asserts the panel's own edges only.
    if (!pageMayScroll) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `the page overflows at ${width}px`).toBe(true);
    }

    const g = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)?.getBoundingClientRect() ?? null;
      const grid = document.querySelector('.grid')!;
      const cs = getComputedStyle(grid);
      const gb = grid.getBoundingClientRect();
      // The capped box is the grid's CONTENT box: the padding is the panel's inset around it, not
      // part of the measure the cap is about.
      const content = { left: gb.left + parseFloat(cs.paddingLeft),
                        right: gb.right - parseFloat(cs.paddingRight) };
      return { content, grid: { left: gb.left, right: gb.right }, detail: r('.detail')!,
               body: r('.a-body')!, intro: r('.a-body .intro')!, prose: r('.a-prose')!,
               bd: r('.a-bd'), links: r('.a-links'), review: r('.a-links > a'),
               // The cell the panel sits in, and what each of them paints: a gap between the two
               // is only harmless if the cell is drawing the panel's own surface into it.
               cell: r('tr.expand td'),
               cellBg: getComputedStyle(document.querySelector('tr.expand td')!).backgroundColor,
               panelBg: getComputedStyle(document.querySelector('.detail')!).backgroundColor,
               // Which tier is in force, read off the layout rather than inferred from the width:
               // the boundary is a CONTAINER query and the container is the table's, not the
               // window's (docs/app.md §The expanded row).
               tracks: cs.gridTemplateColumns.split(/\s+/).length };
    });
    const contentW = g.content.right - g.content.left;

    // 1. The cap. Every zone lives in this one box, so no part of the row is wider than the summary.
    expect(contentW, `the expanded row is wider than the summary at ${width}px`)
      .toBeLessThanOrEqual(CAP + 1);

    // 2. The left anchor. The box starts where the panel's content starts — under the shoe name a
    //    runner just clicked — and every pixel of slack falls to the RIGHT, inside the well.
    expect(Math.abs(g.grid.left - g.detail.left), `the row is not anchored left at ${width}px`)
      .toBeLessThanOrEqual(1);
    expect(g.detail.right - g.grid.right, `slack fell to the left at ${width}px`)
      .toBeGreaterThanOrEqual(-1);

    // 3. The summary is co-extensive with the capped box, and the prose columns share its edges.
    for (const [name, box] of [['summary', g.body], ['prose', g.prose]] as const) {
      expect(Math.abs(box.right - g.content.right), `${name} does not reach the cap at ${width}px`)
        .toBeLessThanOrEqual(1);
    }
    expect(Math.abs(g.body.left - g.content.left), `the summary box is not the container at ${width}px`)
      .toBeLessThanOrEqual(1);
    expect(Math.abs(g.intro.right - g.body.right), `summary overshoots at ${width}px`).toBeLessThanOrEqual(1);

    // 4. The breakdown is placed BY TIER, and the tier is read off the grid rather than assumed
    //    from the width: two tracks means the row is two columns and the card has no single left
    //    axis to join, so it centres; one track means every zone above it is one left-anchored
    //    column and the card joins them (docs/app.md §The expanded row).
    const bd = g.bd!;
    expect(bd, `no breakdown to place at ${width}px`).not.toBeNull();
    const leftGap = bd.left - g.content.left;
    const rightGap = g.content.right - bd.right;
    if (g.tracks === 1) {
      expect(leftGap, `the breakdown is not left-aligned in the single-column tier at ${width}px`)
        .toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(leftGap - rightGap),
        `the breakdown is not centred in the two-column tier at ${width}px`).toBeLessThanOrEqual(1);
    }
    // And it takes its NATURAL width rather than stretching to the box: a stretched card is both
    // left-aligned and symmetric, so the strict inequality is what says it shrank to fit its table.
    if (atCap) {
      expect(bd.width, `the breakdown stretched to the cap at ${width}px`).toBeLessThan(contentW - 1);
    }

    // 5. The trailing links — the lineage line and the review — are the row's own last line rather
    //    than the foot of one prose column: they begin on the summary's left axis and span the box
    //    at BOTH tiers, so which column happens to be taller stops deciding where they sit
    //    (docs/app.md §The expanded row). In the single-column tier that is where they always were,
    //    which is the point: this half of the rule must read as no change at all.
    const links = g.links!;
    expect(links, `no trailing links at ${width}px`).not.toBeNull();
    expect(Math.abs(links.left - g.body.left),
      `the trailing links are not on the summary's axis at ${width}px`).toBeLessThanOrEqual(1);
    expect(Math.abs(links.right - g.body.right),
      `the trailing links do not span the box at ${width}px`).toBeLessThanOrEqual(1);
    // Attribution, not layout: the review link is repositioned and never demoted
    // (docs/decisions.md §Be a good citizen toward RunRepeat). It is on screen, inside the row,
    // and below nothing but the prose it belongs to.
    const review = g.review!;
    expect(review, `the review link is not in the trailing line at ${width}px`).not.toBeNull();
    expect(review.width, `the review link has no box at ${width}px`).toBeGreaterThan(0);
    expect(review.top, `the review link fell below the breakdown at ${width}px`).toBeLessThan(bd.top);

    // 6. Nothing is drawn AROUND the panel. It is the recessed surface, so a cell that inset it and
    //    painted nothing framed it in the table's own raised `--surface` — 8px on every side, both
    //    engines, both themes, and a raised border around the one thing that is supposed to sit
    //    below the row (docs/app.md §The expanded row). The two renderings answer this differently
    //    and both answers are legal, so the assertion is the RESULT: either the panel fills its
    //    cell, or the cell is painting the panel's own colour into the gap.
    const cell = g.cell!;
    const gap = Math.max(g.detail.left - cell.left, cell.right - g.detail.right, g.detail.top - cell.top);
    expect(gap >= -0.5 && (gap <= 0.5 || g.cellBg === g.panelBg),
      `the expanded panel is framed by ${gap}px of ${g.cellBg} at ${width}px`).toBe(true);
  }
});

/**
 * iOS Safari zooms the whole viewport when a focused input's text is under 16px and there is no way
 * back out but a pinch, so every text input the drawer holds pays 16px on the touch tier — the rule
 * `RangeFilter.svelte` already stated for its number fields alone (docs/app.md §Filters).
 *
 * It runs HERE rather than in `smoke.spec.ts` because the sizes differ by ENGINE: the shoe search
 * declares no size of its own, and WebKit's UA sheet gives `input[type=search]` 16px where Blink and
 * Gecko give 13.33px — so a one-engine check reads clean on the one engine the rule exists for.
 * A touch CONTEXT, not a narrow viewport: the query is about the pointer, and the suite's default
 * context reports `hover: hover` at every width.
 */
test('sets every drawer text input at or above the iOS zoom threshold', async ({ browser, browserName, baseURL }) => {
  const context = await browser.newContext({
    baseURL, viewport: { width: 390, height: 844 }, hasTouch: true,
    // Firefox refuses `isMobile` outright; `hasTouch` alone reaches `hover: none` there.
    ...(browserName === 'firefox' ? {} : { isMobile: true }),
  });
  const page = await context.newPage();
  await page.goto('/');
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches),
    'the context is not on the touch tier, so this asserts nothing').toBe(true);

  // Every one of the three, reached the way a runner reaches them: the drawer, the brand list
  // inside it, and the add-filter dialog it opens.
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.locator('details[aria-label="Brand"] summary').click();
  await page.getByRole('button', { name: 'Add filter' }).click();
  await expect(page.getByRole('dialog', { name: 'Add filter' })).toBeVisible();

  const small = await page.evaluate(() => [...document.querySelectorAll('input')]
    .filter((n) => n.type !== 'checkbox' && n.offsetParent !== null)
    .map((n) => ({ label: n.getAttribute('aria-label') ?? n.type, px: parseFloat(getComputedStyle(n).fontSize) }))
    .filter((n) => n.px < 16));
  expect(small, 'a focused input this small zooms iOS Safari with no way back out').toEqual([]);

  await context.close();
});

/**
 * The phone half of the ordering line. jsdom evaluates no media query, so which of the two tables
 * mounts is invisible to the suite — and the whole point of this line is that the phone renders a
 * header only for the figure columns, so four sort keys the app itself produces have nothing to
 * be marked on (docs/app.md §The ordering is stated when no header can carry it).
 */
test('states the order on a phone whenever no header can carry the caret', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const note = page.getByTestId('ordering-note');
  const marked = page.locator('[data-testid="shoe-table-mobile"] thead th[aria-sort]');

  for (const [sort, said] of [
    ['-releasedAt', 'Sorted by release date, newest first'],
    ['name', 'Sorted by shoe name, A to Z'],
    ['-plate', 'Sorted by plate, most plate first'],
  ] as const) {
    await page.goto(`/?sort=${encodeURIComponent(sort)}`);
    await expect(marked, `${sort} has no header to mark, which is why the line exists`).toHaveCount(0);
    await expect(note).toHaveText(said);
  }

  // The control: a figure column carries the caret itself, so the line would be saying it twice.
  await page.goto('/?sort=-score');
  await expect(marked).toHaveCount(1);
  await expect(note).toHaveCount(0);

  await page.goto('/');
  await expect(note).toHaveCount(0);
});

test('keeps an open panel across the rendering swap', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.getByText('cushy').first().click();
  await expect(page.getByRole('link', { name: /Full review on RunRepeat/ })).toBeVisible();

  // The two tables are separate components and only one is ever mounted, so this crossing used to
  // drop every open panel (docs/app.md §Two renderings, and only one of them mounted).
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.getByTestId('shoe-table-mobile')).toBeVisible();
  await expect(page.getByRole('link', { name: /Full review on RunRepeat/ })).toBeVisible();
});

/**
 * The drawer's band now reaches one pixel below `SIDEBAR_PERMANENT_PX`, where the bar is ONE row
 * and `Filters` still carries its
 * word — so that row gained a control it never had to fit. 801px with a dozen columns ticked is
 * the row at its longest against the least width it ever has.
 *
 * It runs HERE rather than in `smoke.spec.ts` because the slack differs by ENGINE and the binding
 * one is not the suite's default (docs/app.md §The chrome bands). A Chromium-only check would read
 * the widest of the three on the width where the other two are tightest, which is exactly how the
 * sub-800 bands shipped an overflow once already.
 *
 * The slack is 33px in Firefox and WebKit and 36px in Chromium, and those numbers are the same on
 * every machine only because the controls carry the app's own face. Until they did, this row was
 * drawn in whatever form face the HOST resolved for the engine — 9px of slack in the Playwright
 * image, −15px on a runner whose `sans-serif` is DejaVu Sans, which is what failed CI twice while
 * passing everywhere else. Hence the face assertion below: it is not
 * decoration on this test, it is the precondition that makes the other two numbers mean anything,
 * and `draws every control in a face this app names` guards the rule itself.
 */
test('keeps the one-row toolbar to one row at the narrowest width that has one', async ({ page }) => {
  await page.setViewportSize({ width: 801, height: 900 });
  // A two-digit `Columns, N shown` badge, which is the widest that control ever gets, and a story
  // applied, so the bar is carrying the setup groups the strip hands it.
  //
  // `story=easy` is deliberate, and it now means more than it did when this fixture was written: it
  // was an inert token then and is Easy's whole baseline today — its plate gate and its sort as well
  // as its columns, which the `cols=` below replaces outright
  // (docs/app.md §URL encoding). Neither the gate nor the sort key reaches what this measures, which
  // is the width of the toolbar's two groups; the token is kept because a story applied is the state
  // the bound is about.
  await page.goto('/?story=easy&cols=score,msrpGbp,heel-stack,forefoot-stack,weight,'
    + 'energy-return-heel,energy-return-forefoot,toebox-width-widest-part,shock-absorption-heel,'
    + 'shock-absorption-forefoot,outsole-durability,midsole-width-in-the-heel');
  await awaitFacesLoaded(page);
  await expect(page.getByRole('radio', { name: /All/ })).toBeVisible();
  await expect(page.locator('details.picker summary')).toHaveAttribute('aria-label', /\d\d shown/);

  const bar = await page.evaluate(() => {
    const tb = document.querySelector('[data-testid="toolbar"]')!;
    const cs = getComputedStyle(tb);
    const setup = tb.querySelector('.setup')!.getBoundingClientRect();
    const actions = tb.querySelector('.actions')!.getBoundingClientRect();
    return {
      // Centres, not tops: the two groups are different heights and `align-items: center` offsets
      // their top edges by a pixel or two on a row that has not wrapped at all.
      sameRow: Math.abs((setup.y + setup.height / 2) - (actions.y + actions.height / 2)) < 4,
      free: Math.round(tb.getBoundingClientRect().width - parseFloat(cs.paddingLeft)
        - parseFloat(cs.paddingRight) - setup.width - actions.width - parseFloat(cs.columnGap)),
      worded: getComputedStyle(tb.querySelector('.filters-toggle .word')!).display !== 'none',
      // The widest control on the row, and the one whose face decides whether the row fits.
      face: getComputedStyle(tb.querySelector('.about')!).fontFamily,
    };
  });
  // Read first, because it is what the two widths below are a measurement OF: a row drawn in the
  // host's form face has no reproducible width and the numbers in this file would be this
  // machine's rather than the app's.
  expect(bar.face, 'the toolbar fell back to the host UA form face').toContain('Inter Tight');
  // The word is what makes this tight at all, so a glyph here would pass the bound while retiring
  // the claim (docs/app.md §Where the utilities live).
  expect(bar.worded, 'Filters lost its word above the chrome boundary').toBe(true);
  expect(bar.sameRow, 'the toolbar wrapped at 801px once Filters joined the row').toBe(true);
  expect(bar.free, 'the one-row toolbar has run out of width at 801px').toBeGreaterThanOrEqual(0);
});

/**
 * **Forward-reopening a row lands it on screen, exactly as clicking it does.** Back and Forward are
 * the only way a row opens that is not a press, and the older rule left them the only way that did
 * not move the page — the same row, opened the same way, behaving differently by how it was reached
 * (docs/app.md §View and URL ownership).
 *
 * A browser, because the whole claim is about where a box ends up relative to two PINNED bands, and
 * because `scrollIntoView` is a heuristic each engine owns — which is why this file rather than the
 * Chromium-only suite. The window is short so the panel is genuinely taller than the viewport,
 * which is the case that used to put the row itself behind the chrome.
 */
test('lands a Forward-reopened row below the pinned bands, as a click would', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 560 });
  await page.goto('/');
  await awaitFacesLoaded(page);

  const row = page.locator('tr.shoe[data-slug="cushy"]');
  const bands = () => page.evaluate(() => {
    const chrome = document.querySelector('.chrome')!.getBoundingClientRect();
    const head = document.querySelector('thead th')!.getBoundingClientRect();
    return Math.max(chrome.bottom, head.bottom);
  });
  const clear = async () => {
    // `boundingBox` is document-relative; the bands are viewport-relative, so the row is read the
    // same way they are.
    const top = await row.evaluate((el) => el.getBoundingClientRect().top);
    return { top: top - await bands(), bottom: page.viewportSize()!.height - top };
  };

  await row.click();
  await expect(page).toHaveURL(/open=cushy/);
  // Reduced motion is not set, so the click's own scroll is smooth and has to be waited out.
  await page.waitForTimeout(600);
  const clicked = await clear();
  expect(clicked.top, 'the click-expand itself left the row behind the bands').toBeGreaterThanOrEqual(-1);

  await page.goBack();
  await expect(page).not.toHaveURL(/open=/);
  await page.goForward();
  await expect(page).toHaveURL(/open=cushy/);
  await page.waitForTimeout(600);

  const reopened = await clear();
  expect(reopened.top, 'the reopened row sits behind the pinned bands').toBeGreaterThanOrEqual(-1);
  expect(reopened.bottom, 'the reopened row is off the bottom of the window').toBeGreaterThan(0);
  // The same landing, not merely a legal one: it is the click's rule being reused rather than a
  // second rule that happens to agree.
  expect(reopened.top, 'Forward landed the row somewhere a click would not have')
    .toBeCloseTo(clicked.top, 0);
});

/**
 * **A range grip sits ON the bound it marks, and inside the row.** The grip is 10px of content
 * inside a 2px ring at `box-sizing: content-box`, so the painted control is 14px while the offset
 * pulling it back onto its own position was half of *ten* — every grip was drawn 2px to the right
 * of its value and 2px below the plot's centre line, measured at 19.22px against the 17.22px the
 * bound actually sits at.
 *
 * Asserted against the `edge` marker rather than against a number: the edge is the same bound drawn
 * by a rule that was already right, so "the two agree" is the invariant, and it cannot go stale when
 * the axis, the fleet or the column width moves. A browser, because none of this exists in jsdom.
 */
test('draws each range grip on the bound it marks, with room inside the row', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await awaitFacesLoaded(page);
  const row = page.locator('fieldset.range').first();
  await row.getByLabel(/minimum$/).fill('40');
  await row.getByLabel(/maximum$/).fill('160');

  const marks = await row.evaluate((fs) => {
    const mid = (el: Element) => { const b = el.getBoundingClientRect(); return b.left + b.width / 2; };
    const box = fs.getBoundingClientRect();
    const edges = [...fs.querySelectorAll('.edge')].map(mid).sort((a, b) => a - b);
    const grips = [...fs.querySelectorAll('.handle')].map(mid).sort((a, b) => a - b);
    const out = [...fs.querySelectorAll<HTMLElement>('.handle, .edge')]
      .map((m) => m.getBoundingClientRect())
      .map((b) => Math.max(box.left - b.left, b.right - box.right));
    return { edges, grips, worstOut: Math.max(...out) };
  });

  expect(marks.edges, 'both bounds are set, so both edges are drawn').toHaveLength(2);
  for (const [i, grip] of marks.grips.entries()) {
    expect(grip, 'the grip is drawn off the bound it marks').toBeCloseTo(marks.edges[i]!, 1);
  }
  expect(marks.worstOut, 'a marker reaches outside the row that has to hold it').toBeLessThanOrEqual(0);
});

/**
 * **No pill changes width when it is picked.** The selected state carries `font-weight: 600` and
 * the unselected one 400, so every control in the segmented family was sized by whichever weight it
 * happened to be wearing: `Stability` grew 70→73px as it came on, `Forefoot` 70→76px, and the four
 * story pills redistributed on every press, shifting the groups beside them. Measured in Chromium
 * and Firefox before the reservation went in.
 *
 * It has to be a browser: the fix is a pseudo-element drawing the same string at the selected
 * weight in a zero-height line, so what it is worth is entirely a question of text metrics, and
 * that is exactly the sort of thing one engine rounds differently. Hence this file rather than the
 * Chromium-only suite — and the sidebar's released-after chips are the same family, same rule.
 */
test('holds every segmented pill to one width across its own toggle', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await awaitFacesLoaded(page);
  // Through the strip, not by URL: the bar draws no setup group until the strip has handed over,
  // and `story` is not a token the address owns (docs/app.md §The toolbar).
  await page.locator('.card.story').filter({ hasText: 'Easy' }).click();
  await expect(page.locator('.setup button')).toHaveCount(7);

  const widths = () => page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll<HTMLElement>('.setup button, .chips button')]
      .map((el) => [el.textContent!.trim(), el.getBoundingClientRect().width])));

  const seen = new Map<string, Set<number>>();
  const record = async () => {
    for (const [name, w] of Object.entries(await widths())) {
      let ws = seen.get(name);
      if (!ws) seen.set(name, ws = new Set());
      ws.add(Math.round(w * 100) / 100);
    }
  };
  // Every state each group can be in, so each pill is measured both wearing its mark and not.
  await record();
  for (const name of ['Forefoot', 'Heel', 'All', 'Easy', 'Tempo', 'Race', 'Stability', '1y', '3y', 'Any']) {
    await page.getByRole('button', { name, exact: true })
      .or(page.getByRole('radio', { name, exact: true })).first().click();
    await record();
  }

  expect(seen.size, 'nothing was measured — the selectors have moved').toBeGreaterThan(8);
  for (const [name, ws] of seen) {
    expect([...ws], `${name} changes width when it is picked`).toHaveLength(1);
  }
});

/**
 * The two-colour cell rule is the app's only NESTED `color-mix`, and nesting is exactly the kind of
 * thing one engine implements and another drops on the floor — a dropped inner mix resolves the
 * whole declaration to nothing, so the base-on ramp would paint bare cells with no error anywhere
 * (docs/app.md §The display preferences).
 *
 * Measured as painted colour, not as CSS text: `getComputedStyle` on `background-color` is the
 * engine's own answer, and a declaration it could not parse reads `rgba(0, 0, 0, 0)`. Two cells at
 * different percentiles, because with the base on the ALPHA is flat and colour is the only thing
 * left carrying the ordering — one cell would pass while the ramp said nothing.
 */
test('paints the two-colour ramp this engine has to nest a color-mix for', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Display' }).click();
  await page.getByLabel('Tint every ranked cell').check();

  const cells = await page.evaluate(() => {
    // The bucket a cell names is the whole of what it says about its colour now; on the two-colour
    // ramp that bucket is the base → better MIX, so ordering by it orders by rank.
    const painted = [...document.querySelectorAll<HTMLElement>('td.num.tinted.blue')]
      .map((el) => ({ ramp: [...el.classList].find((c) => /^w-[bm]-\d+$/.test(c))?.slice(0, 4),
                      w: Number([...el.classList].find((c) => /^w-m-\d+$/.test(c))?.slice(4)),
                      bg: getComputedStyle(el).backgroundColor }))
      .sort((x, y) => y.w - x.w);
    const sheet = document.getElementById('wash-buckets')?.textContent ?? '';
    return {
      ramps: [...new Set(painted.map((c) => c.ramp))],
      // The outer percentage of every two-colour rule — the flat alpha each bucket composites at.
      alphas: [...new Set([...sheet.matchAll(/\.w-m-\d+\{[^}]*\) ([\d.]+)%,transparent\)/g)]
        .map((m) => m[1]))],
      best: painted[0]!, worst: painted.at(-1)!,
    };
  });

  expect(cells.ramps, 'the ranked cells never moved to the two-colour ramp').toEqual(['w-m-']);
  // Flat alpha, as the model says: every ranked cell is tinted at one strength, and with the base
  // on only the inner mix moves.
  expect(cells.alphas, 'the two-colour rules do not composite at one strength').toHaveLength(1);
  for (const c of [cells.best, cells.worst]) {
    expect(c.bg, 'the nested color-mix resolved to nothing in this engine')
      .not.toMatch(/rgba?\(0, 0, 0, 0\)|transparent/);
  }
  // …and the two ends are different colours, which is the whole ordering with the base on.
  expect(cells.best.bg, 'best and worst paint the same colour, so nothing ranks')
    .not.toBe(cells.worst.bg);
});

/**
 * The fit model is arithmetic over committed per-character tables measured in Chromium, and these
 * are the two engines it was never measured in. If Firefox or WebKit ever lays this table out wider
 * than the model says, the app mounts a desktop table at a width where that engine scrolls sideways
 * — silently, and only for the runners on that engine.
 * docs/app.md §Two renderings, and only one of them mounted
 */
for (const [name, cols] of Object.entries(FIT_SETS)) {
  test(`models the desktop table's own min-content width, ${name} columns`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const { model, rendered } = await measureFit(page, cols);
    expect(Math.abs(model - rendered),
      `the fit model says ${model.toFixed(1)}px and this engine renders ${rendered.toFixed(1)}px`)
      .toBeLessThanOrEqual(FIT_TOLERANCE_PX);
  });
}

/**
 * The one-sided half of the same guard, and the one only Firefox can fail. A column the catalogue
 * no longer holds renders its raw slug as a header, and Firefox implements UAX #14's numeric
 * context where Chromium and WebKit do not — so a model that broke `breathability-26` at its
 * hyphen declared a width 17px under what Firefox needs, and the header hangs out of the column.
 * The model now breaks no hyphen at all, so what is claimed here is a floor rather than an
 * agreement: the over-reservation is the point and it is far outside `FIT_TOLERANCE_PX` on the two
 * slugs that carry a letter after the hyphen.
 *
 * **The floor is `FIT_TOLERANCE_PX` and not zero, and `10-12` is why.** There the model and Firefox
 * take the same view of the hyphen, so nothing is over-reserved and all that stands between the two
 * is the `HEADER_PX` table being Chromium's — the same spread `FIT_SETS` is held to on either side
 * (docs/app.md §Table presentation).
 */
test('never models a dropped column\'s header narrower than this engine renders it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { model, rendered } = await measureFit(page, FIT_DROPPED_COLS);
  expect(rendered - model,
    `the fit model says ${model.toFixed(1)}px and this engine renders ${rendered.toFixed(1)}px`)
    .toBeLessThanOrEqual(FIT_TOLERANCE_PX);
});

/**
 * **The engines that can actually fail this one.** A declared width is `min + share` and the min is
 * Chromium's, so where Firefox or WebKit needs a fraction more for a header's longest word, that
 * fraction lands outside the column's box — measured on the real fleet, 0.72px in Firefox and
 * 0.70px in WebKit against Chromium's 0, and `FIT_OVERFLOW_PX` states what absorbs it
 * (spec §Failure behaviour). Chromium runs the same sweep in `smoke.spec.ts`, where it is a
 * regression detector rather than the risk.
 */
for (const [name, cols] of Object.entries(FIT_SETS)) {
  test(`keeps every cell inside its declared column, ${name} columns`, async ({ page }) => {
    await sweepDeclaredColumns(page, cols);
  });
}

/** The same bound on a header the model deliberately over-reserves for, including in the engine
 *  whose hyphen rule that over-reservation exists for (`FIT_DROPPED_COLS`). */
test('keeps a dropped column\'s header inside its declared column', async ({ page }) => {
  await sweepDeclaredColumns(page, FIT_DROPPED_COLS);
});

/**
 * The same height bound in the two engines whose line breaking the model is NOT built from — which
 * is the whole reason heights are measured rather than derived: `Under Armour Charged Pursuit 3` is
 * two lines in Chromium and one here (spec §Decisions).
 */
test('renders every row at the height it measured', async ({ page }) => {
  await sweepRowHeights(page, FIT_SETS['default']!);
  await sweepRowHeights(page, FIT_SETS['minimal']!);
});

/**
 * The guard above is only worth its precision if it cannot measure a fallback face by mistake, and
 * `document.fonts.ready` does not stop it: that promise resolves against the loads
 * pending when it is asked and so resolved before the mounted table had requested the faces at all.
 * The reading that followed was the fallback's, and whether that read under or over the model is the
 * host's choice of fallback rather than anything about this app — which is why it stayed green in
 * the Playwright image and failed only on CI.
 *
 * So: with the faces made unreachable, `measureFit` must REFUSE to answer rather than answer with a
 * fallback's number. The short timeout keeps a test that is deliberately never satisfied cheap.
 */
test('refuses to measure the fit model against a fallback face', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.route('**/*.woff2', (r) => r.abort());
  await expect(measureFit(page, FIT_SETS['wide']!, 1500))
    .rejects.toThrow(/faces never finished loading/);
});

/**
 * The switch itself, at the width the model computes for this fixture rather than at a constant: one
 * pixel either side of it, which rendering is mounted, and — the half that matters — that the one
 * mounted fits. A ladder written against a hard-coded width would stop testing the rule the moment
 * the fixture or the face moved.
 */
test('mounts the rendering that fits on each side of the computed threshold', async ({ page }) => {
  const cols = FIT_SETS['default']!;
  await page.setViewportSize({ width: 1600, height: 900 });
  const { model } = await measureFit(page, cols);
  // The drawer regime, so the sidebar takes no track: the table needs the model plus the slack, and
  // the page's leading gutter on top (`lib/fit.ts`).
  const threshold = Math.ceil(model + FIT_SLACK_PX + 16);
  expect(threshold, 'the threshold is inside the drawer regime, or this ladder tests two rules')
    .toBeLessThan(SIDEBAR_PERMANENT_PX);

  for (const [width, want] of [[threshold - 1, 'phone'], [threshold, 'desktop'],
    [threshold + 40, 'desktop']] as const) {
    await page.setViewportSize({ width, height: 900 });
    await awaitFacesLoaded(page);
    // Retried rather than read once: a resize reaches the decision through an event and the DOM
    // through Svelte's next flush, and WebKit reported the previous rendering to a single
    // evaluate — a timing artefact that reads exactly like a model that is one pixel out.
    await expect(page.locator('.tblwrap'), `at ${width}px`)
      .toHaveCount(want === 'desktop' ? 1 : 0);
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `the ${want} rendering scrolls sideways at ${width}px`).toBe(0);
  }
});
