import { expect, test } from '@playwright/test';

/**
 * Firefox and WebKit implement none of `input type="month"` — both reflect the type back as `text`,
 * so the control that Chromium renders as a picker is a bare box there, and a Chromium-only suite
 * reported it working. These run in those two engines only; the layout assertions in
 * `smoke.spec.ts` stay on one engine, where a single set of font metrics keeps them meaningful.
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

  // The chips still own clearing: a chip that sets a date cannot also unset it.
  await page.getByRole('button', { name: 'Any', exact: true }).click();
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
  });
}

/** The expanded row lays out against the TABLE's width, not the viewport's, so the sweep widens the
 *  table as well as the window. And the summary must share a right edge with the columns beneath it
 *  at every tier, which is the whole reason they are one box. */
const NARROW = 'score,heel-stack,weight';
// Nine figure columns the e2e fixture actually carries, which is more than the six-column bound —
// so the TABLE is wider than the panel's screen and the container query is doing work a viewport
// media query could not. Check the slugs against app/e2e/fixtures/shoes.json before editing.
const WIDE = 'score,msrpGbp,heel-stack,forefoot-stack,weight,energy-return-heel,'
  + 'energy-return-forefoot,toebox-width-widest-part,shock-absorption-heel';

test('lays the expanded row out at every container tier without overflowing', async ({ page }) => {
  for (const { width, cols, pageMayScroll } of [
    { width: 1440, cols: NARROW, pageMayScroll: false },
    { width: 1440, cols: WIDE, pageMayScroll: true },
    { width: 980, cols: NARROW, pageMayScroll: false },
    { width: 760, cols: NARROW, pageMayScroll: false },
    { width: 390, cols: NARROW, pageMayScroll: false },
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?cols=${cols}`);
    // Re-expanded per iteration: crossing 699px swaps which table is mounted, and the open row
    // belongs to the component that just went away.
    await page.getByText('cushy').first().click();
    await expect(page.locator('.detail .a-body')).toBeVisible();

    // Past the six-column bound the page is SUPPOSED to scroll sideways
    // (docs/app.md §Columns and sorting), so that case asserts the panel's own edges only.
    if (!pageMayScroll) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `the page overflows at ${width}px`).toBe(true);
    }

    const edges = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect().right;
      return { body: r('.a-body'), prose: r('.a-prose'), intro: r('.a-body .intro') };
    });
    // One box, so the summary cannot overshoot the columns beneath it by more than a pixel.
    expect(Math.abs(edges.intro - edges.body), `summary overshoots at ${width}px`).toBeLessThanOrEqual(1);
    expect(Math.abs(edges.prose - edges.body), `prose overshoots at ${width}px`).toBeLessThanOrEqual(1);
  }
});
