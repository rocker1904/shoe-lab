import { expect, test } from '@playwright/test';

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
   * file already drives around (0029) — a UA behaviour the spec steps over, not a claim about the app.
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
 * The one control the app's own focus ring cannot reach. `app.css` paints the ring with a
 * `box-shadow`, and WebKit draws no shadow on a native checkbox's rendered control — so the
 * `outline: none` half of that rule landed and the shadow half did not, leaving every checkbox in
 * the app with no focus indicator at all in Safari, twenty of them consecutively inside the column
 * picker. The exemption keeps the UA outline in EVERY engine (docs/app.md §Theming), which is why
 * this asserts an outline rather than "a shadow, or an outline in WebKit".
 *
 * Driven by Tab: `:focus-visible` does not apply to a programmatic focus after a pointer press, and
 * a ring measured that way reads as missing on a control that has one.
 */
test('paints a focus indicator on a native checkbox', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.locator('details.picker summary').focus();
  await page.keyboard.press('Enter');
  // Up to three, because Firefox gives a scrollport a tab stop of its own and the list is one
  // (finding 0029 — UA behaviour, not the app's). The first checkbox is the stop under test.
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
      outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth,
    };
  });

  expect(at.tag, 'Tab did not land on a checkbox — the picker markup has moved').toBe('input');
  expect(at.type).toBe('checkbox');
  expect(at.focusVisible, 'the keyboard walk did not produce :focus-visible').toBe(true);
  expect(at.outlineStyle,
    'no focus indicator on a checkbox — the UA outline was removed and nothing replaced it').not.toBe('none');
  expect(parseFloat(at.outlineWidth)).toBeGreaterThan(0);
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
  await page.evaluate(() => document.fonts.ready);

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
  // ONE ladder, straight through the sidebar's 1180px boundary. It used to be two: the sidebar
  // taking its permanent 260px column narrowed every container inside the content track at once
  // and the photo stepped 280px → 270px across it, so a single ladder measured the sidebar
  // arriving rather than this panel's own tiers. Capping the content at the summary's width killed
  // that step — the container stops varying with the window well below 1180px — so the regimes
  // no longer need walking apart (docs/app.md §The expanded row).
  const widths = [820, 900, 1000, 1100, 1179, 1180, 1250, 1300, 1440, 1600];
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
 * and the CENTRED BREAKDOWN (the one element constrained to its natural width and centred — inside
 * that box, never inside the panel).
 *
 * It replaces a shared-right-edge assertion between the summary and the prose columns. That edge
 * still exists and is still asserted, but it is now the capped box's own edge rather than a
 * coincidence between two rules: the summary is co-extensive with the container at every tier.
 */
test('caps the expanded row at the summary, anchored left, with the breakdown centred', async ({ page }) => {
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
               bd: r('.a-bd') };
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

    // 4. The breakdown is centred in that box — symmetric at every tier, including the stacked one
    //    where it fills the width and both slacks are zero.
    const bd = g.bd!;
    expect(bd, `no breakdown to place at ${width}px`).not.toBeNull();
    expect(Math.abs((bd.left - g.content.left) - (g.content.right - bd.right)),
      `the breakdown is not centred at ${width}px`).toBeLessThanOrEqual(1);
    // And it is centred at its NATURAL width rather than stretched to the box: a stretched card
    // would also be symmetric, so the strict inequality is what says it shrank to fit its table.
    if (atCap) {
      expect(bd.width, `the breakdown stretched to the cap at ${width}px`).toBeLessThan(contentW - 1);
    }
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

test('keeps an open panel across the 700px rendering swap', async ({ page }) => {
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
 * The drawer's band now reaches 1179px, where the bar is ONE row and `Filters` still carries its
 * word — so that row gained a control it never had to fit. 801px with a dozen columns ticked is
 * the row at its longest against the least width it ever has.
 *
 * It runs HERE rather than in `smoke.spec.ts` because the slack differs by ENGINE and the binding
 * one is not the suite's default: measured, 22px in Chromium, 34px in WebKit and **9px in
 * Firefox**, which is the same nine pixels of group width the bands below already turn on
 * (docs/app.md §The chrome bands). A Chromium-only check would read 22px clear on the width where
 * Firefox has nine, which is exactly how the sub-800 bands shipped an overflow once already.
 */
test('keeps the one-row toolbar to one row at the narrowest width that has one', async ({ page }) => {
  await page.setViewportSize({ width: 801, height: 900 });
  // A two-digit `Columns, N shown` badge, which is the widest that control ever gets, and a story
  // applied, so the bar is carrying the setup groups the strip hands it.
  await page.goto('/?story=easy&cols=score,msrpGbp,heel-stack,forefoot-stack,weight,'
    + 'energy-return-heel,energy-return-forefoot,toebox-width-widest-part,shock-absorption-heel,'
    + 'shock-absorption-forefoot,outsole-durability,midsole-width-in-the-heel');
  await page.evaluate(() => document.fonts.ready);
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
    };
  });
  // The word is what makes this tight at all, so a glyph here would pass the bound while retiring
  // the claim (docs/app.md §Where the utilities live).
  expect(bar.worded, 'Filters lost its word above the chrome boundary').toBe(true);
  expect(bar.sameRow, 'the toolbar wrapped at 801px once Filters joined the row').toBe(true);
  expect(bar.free, 'the one-row toolbar has run out of width at 801px').toBeGreaterThanOrEqual(0);
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
    const painted = [...document.querySelectorAll<HTMLElement>('td.num.tinted.blue')]
      .map((el) => ({ w: Number(el.style.getPropertyValue('--w')),
                      a: Number(el.style.getPropertyValue('--a')),
                      bg: getComputedStyle(el).backgroundColor }))
      .sort((x, y) => y.w - x.w);
    return { dual: document.documentElement.dataset['wash'], best: painted[0]!, worst: painted.at(-1)! };
  });

  expect(cells.dual, 'the document never asked for the two-colour rule').toBe('dual');
  // Flat alpha, as the model says: every ranked cell is tinted at one strength.
  expect(cells.best.a).toBe(cells.worst.a);
  for (const c of [cells.best, cells.worst]) {
    expect(c.bg, 'the nested color-mix resolved to nothing in this engine')
      .not.toMatch(/rgba?\(0, 0, 0, 0\)|transparent/);
  }
  // …and the two ends are different colours, which is the whole ordering with the base on.
  expect(cells.best.bg, 'best and worst paint the same colour, so nothing ranks')
    .not.toBe(cells.worst.bg);
});
