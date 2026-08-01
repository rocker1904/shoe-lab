import { expect, test } from '@playwright/test';

test('loads, filters via preset, expands details, exports csv, restores url state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('receipt')).toContainText('Showing 5 of the 5 shoes');

  // a bare first visit opens on the setup strip, so this is a card rather than a toolbar pill
  await expect(page.getByTestId('setup-strip')).toBeVisible();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByTestId('receipt')).toContainText('Showing 4 of the 4 shoes');
  await expect(page).toHaveURL(/plate=none%2Cplated-other/);
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

test('opens on the setup strip and resumes the previous session across a reload', async ({ page }) => {
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

  // the only proof persistence works, because it spans a real page load
  await page.goto('/');
  await expect(page.getByTestId('receipt')).toContainText('Showing 4 of the 4 shoes');
  await expect(page.getByRole('radio', { name: /Easy/, checked: true })).toBeVisible();
  await expect(strip).toHaveCount(0);                                  // and it never returns
  // and the restored view reaches the URL, so copying the link shares what is on screen
  await expect(page).toHaveURL(/plate=none%2Cplated-other/);
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
  // no zone token: the columns are the only record of which half the view is about
  await expect(page).toHaveURL(/cols=[^&]*forefoot-stack/);
  await expect(page.getByTestId('setup-strip')).toBeVisible();         // the zone is the strip's own question
  await expect(page.getByRole('columnheader', { name: /Forefoot stack/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Heel stack/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Midsole width — Forefoot' })).toBeVisible();

  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByTestId('setup-strip')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Easy/, checked: true })).toBeVisible();
  // Easy bounds nothing, so its zone rides in the columns alone — the terms it scores on, stack
  // not among them.
  await expect(page).toHaveURL(/cols=[^&]*energy-return-forefoot/);

  await page.getByRole('radio', { name: /All/ }).click();
  // written out in full: the zone rides in `cols`, so a plain forefoot table is a verbose link
  await expect(page).toHaveURL('/?cols=releasedAt%2Cscore%2CmsrpGbp%2Cforefoot-stack%2Cplate%2Cenergy-return-forefoot%2Ctoebox-width-widest-part%2Cweight');
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
for (const width of [1440, 1200]) {
  test(`the loading skeleton reserves the geometry the table lands in at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/shoes.json*', async (route) => { await held; await route.continue(); });

    await page.goto('/');
    const skeleton = await page.locator('.skeleton').evaluate((el) => {
      const box = el.getBoundingClientRect();
      const head = el.querySelector('.head')!.getBoundingClientRect();
      const row = el.querySelector('.row')!;
      return { x: Math.round(box.x), w: Math.round(box.width), headH: Math.round(head.height),
               rowH: Math.round(row.getBoundingClientRect().height),
               cols: row.querySelectorAll('i').length };
    });

    release();
    await expect(page.locator('tbody tr.shoe').first()).toBeVisible();
    const table = await page.locator('.tblwrap').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x), w: Math.round(box.width),
               headH: Math.round(el.querySelector('thead')!.getBoundingClientRect().height),
               rowH: Math.round(el.querySelector('tbody tr.shoe')!.getBoundingClientRect().height),
               cols: el.querySelectorAll('thead th').length };
    });

    expect(skeleton.cols, 'the skeleton draws a different number of columns').toBe(table.cols);
    expect(skeleton.x, 'the skeleton does not reserve the sidebar track').toBe(table.x);
    expect(skeleton.w, 'the skeleton is not the width of the table').toBe(table.w);
    // A line box or two of slack, and no more: these are line-box reservations against the real
    // thing, so rounding is fair and a design difference is not. A whole missing name line is 18px,
    // so this bound is what makes the reserve assertable at all.
    expect(Math.abs(skeleton.headH - table.headH),
      `head band ${skeleton.headH}px against the table's ${table.headH}px`).toBeLessThanOrEqual(2);
    expect(Math.abs(skeleton.rowH - table.rowH),
      `row ${skeleton.rowH}px against the table's ${table.rowH}px`).toBeLessThanOrEqual(1);
  });
}

// The 700px switch is invisible to jsdom: it applies no component CSS and evaluates no media
// query, so only a real browser can say which of the two tables is on screen.
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
  // `.then(() => null)`: `document.fonts.ready` resolves to a FontFaceSet, which has to cross the
  // wire back to the test.
  // The header only pins once the table's top has passed under the chrome, and a five-shoe fixture
  // in an 800px window cannot scroll that far: 141px of travel against the 363px needed, so every
  // reading was taken with the header still in flow and the check below could only ever pass.
  // Shortening the window is what gives it something to measure.
  await page.setViewportSize({ width: 375, height: 400 });
  await page.evaluate(() => document.fonts.ready.then(() => null));
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
  await page.getByRole('button', { name: /^Easy/ }).click();
  await page.getByText('cushy').first().click();
  await expect(page.locator('.score-breakdown table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1200, height: 800 });
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
  const box = await row.locator('.plot').boundingBox();
  expect(box, 'the plot never got a box, so nothing below would be measuring anything').not.toBeNull();
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
 * The tier claims this test used to make are `lays the chrome out in bands`'s now, including the
 * one about the story group taking the row it is given. What is left is the `--thead-top` guard,
 * which is a different property entirely: the offset is MEASURED and ResizeObserver-backed, so the
 * pinned header row has to clear a chrome box whose height is a function of the viewport
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
    await page.evaluate(() => document.fonts.ready.then(() => null));
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
      paceW: tb.querySelector('.pace-wrap .seg')!.getBoundingClientRect().width,
      wrapW: tb.querySelector('.pace-wrap')!.getBoundingClientRect().width,
    };
  });

  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');
  await settle();
  expect((await bands()).sameRow, 'the bar split above 800px').toBe(true);

  await page.setViewportSize({ width: 801, height: 900 });
  expect((await bands()).sameRow, 'the bar split just above the sidebar boundary').toBe(true);

  // At 800 and below the two bands separate, and the actions lead: what acts on the table sits above
  // what the table is, so the row carrying every word is the one nearest the table. One boundary,
  // shared with the sidebar — the merged line the design wanted from 700 up does not fit the shipped
  // controls until 777px, which is not a band (docs/app.md §The chrome bands).
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
    await expect(page.getByRole('button', { name: /^Toggle theme/ })).toHaveCount(1);
    await expect(page.getByRole('status'), `at ${width}px`).toHaveCount(1);
  }
});

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
  await page.evaluate(() => document.fonts.ready.then(() => null));

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

  // The utilities move host through a rune, a frame behind the viewport — the reasoning is
  // docs/app.md §Where the utilities live. Unsettled, the masthead is briefly counted with the
  // bar's own controls still in it.
  const settled = (width: number) => expect(
    page.locator(width <= 800 ? '[data-testid="toolbar"]' : 'header')
      .getByRole('button', { name: 'Copy link' })).toHaveCount(1);

  let widest = 0;
  let rows = 0;
  for (const width of [1440, 1200, 1000, 940, 900, 860, 820, 801, 800, 790, 760, 720, 701, 700, 699,
                       680, 640, 600, 560, 500, 460, 431, 430, 429, 412, 400, 390, 380, 375, 370,
                       365, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await settled(width);
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
    if (width < 800) await page.getByRole('button', { name: 'Filters' }).click();
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
 * regression does — each is set roughly 10px above what the components actually measure, and above
 * the HIGHER of the two engines: Firefox runs about 5px taller than Chromium here, and this SUITE
 * is Chromium-only (docs/operations.md §The e2e run needs three browsers). The numbers themselves
 * are docs/app.md §The chrome bands'.
 *
 * Both states, because the bar is taller once the strip has handed it the three setup controls —
 * and the strip-up pass is the binding one, because that is a first arrival.
 */
test('keeps the chrome under its ceiling on a phone', async ({ page }) => {
  const chrome = () => page.evaluate(() =>
    Math.round(document.querySelector('.chrome')!.getBoundingClientRect().height));
  /**
   * A resize moves the utilities between hosts through a rune rather than a media rule
   * (docs/app.md §Where the utilities live), and the rune lands a frame after the viewport changes.
   * Measured before it does, the masthead still carries three worded buttons at a phone width and
   * wraps: 162px of chrome at 360px, against the 109px the band actually spends. `expect` polls, so
   * this waits for the swap rather than sleeping through it.
   */
  const settled = (width: number) => expect(
    page.locator(width <= 800 ? '[data-testid="toolbar"]' : 'header')
      .getByRole('button', { name: 'Copy link' })).toHaveCount(1);

  for (const [width, ceiling] of [[360, 95], [390, 95]] as const) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('setup-strip')).toBeVisible();
    await settled(width);
    await page.evaluate(() => document.fonts.ready.then(() => null));
    const h = await chrome();
    expect(h, `the chrome is ${h}px at ${width}px on a first arrival`).toBeLessThanOrEqual(ceiling);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('setup-strip').getByRole('button', { name: /^All/ }).click();
  await expect(page.getByRole('radio', { name: /All/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => null));
  for (const [width, ceiling] of [[360, 125], [390, 125], [430, 125], [700, 128], [900, 105]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await settled(width);
    const h = await chrome();
    expect(h, `the chrome is ${h}px at ${width}px`).toBeLessThanOrEqual(ceiling);
  }
});

/**
 * Four controls lose their words at 800px — Copy link, Export CSV, Filters and Columns (the theme
 * cycle is a glyph at every width and never had a word to lose). Each keeps the name its worded
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
    await expect(page.getByRole('button', { name: /^Toggle theme/ })).toHaveCount(1);
    if (width <= 800) await expect(page.getByRole('button', { name: 'Filters' })).toHaveCount(1);
    // NOT `getByRole`: `<summary>` has no implicit ARIA role, so a role query never matches it
    // however it is labelled (docs/app.md §Where the utilities live). The label is still what a
    // screen reader announces.
    await expect(page.locator('details.picker summary'), `Columns at ${width}px`)
      .toHaveAttribute('aria-label', /^Columns, \d+ shown$/);
  }
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
    await page.evaluate(() => document.fonts.ready.then(() => null));

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
 * share a right edge, with the sort caret alone in the gutter to their right
 * (docs/app.md §Table presentation). The caret is drawn in every column, so without the reserve the
 * unit line sits under the mark instead and no two-line header lines up with itself. Measured off a
 * Range over the name's own text, because the name box contains the caret as well.
 */
test('lines a figure header up with its own unit line at 1440px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready.then(() => null));

  const cols = await page.evaluate(() => [...document.querySelectorAll('table thead th.fig')].map((th) => {
    const name = th.querySelector('.h-name')!;
    const text = [...name.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
    const range = document.createRange();
    range.setStart(text[0]!, 0);
    range.setEnd(text.at(-1)!, text.at(-1)!.textContent!.length);
    const units = th.querySelector('.h-units')!.getBoundingClientRect().right;
    const caret = th.querySelector('.caret')!.getBoundingClientRect();
    return { col: (th as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
             drift: Math.round(units - range.getBoundingClientRect().right),
             caretClear: Math.round(caret.left - range.getBoundingClientRect().right) };
  }));
  expect(cols.length).toBeGreaterThan(2);
  for (const c of cols) {
    expect(c.drift, `${c.col}: unit line off the name's right edge`).toBe(0);
    // And the mark is beside the name rather than over it, in its own reserved width.
    expect(c.caretClear, `${c.col}: caret does not clear the name`).toBeGreaterThanOrEqual(0);
  }
});

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
  await expect(page).toHaveURL(/cols=[^&]*forefoot-stack/);
  await expect(heel).toHaveAttribute('tabindex', '-1');
});

/**
 * A focus ring drawn as an outside `box-shadow` needs 4px of room outside the element, and both
 * metric lists are scrollports — `overflow-y: auto` computes `overflow-x` to `auto` as well, so a
 * row flush against the port's edge has its ring clipped on the sides and at whichever end it is
 * scrolled to (docs/app.md §Theming). Measured rather than asserted from the CSS, because the slack
 * is the sum of the port's padding and the row's own inset.
 */
test('leaves both metric lists room for the focus ring they draw', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const slack = async (port: string, row: string) => page.evaluate(([p, r]) => {
    const list = document.querySelector(p)!.getBoundingClientRect();
    const el = document.querySelector(r)!.getBoundingClientRect();
    return { left: Math.round(el.left - list.left), right: Math.round(list.right - el.right),
             top: Math.round(el.top - list.top) };
  }, [port, row]);

  await page.getByRole('button', { name: /^Add filter/ }).click();
  const dialog = await slack('.dialog .list', '.dialog .list button');
  await page.keyboard.press('Escape');

  await page.locator('details.picker summary').click();
  const picker = await slack('.picker .list', '.picker .list input');

  // 4px is the ring's outer radius; anything less and it is drawn cropped.
  for (const [name, s] of [['add-filter dialog', dialog], ['column picker', picker]] as const) {
    expect(s.left, `${name}: ring clipped on the left`).toBeGreaterThanOrEqual(4);
    expect(s.right, `${name}: ring clipped on the right`).toBeGreaterThanOrEqual(4);
    expect(s.top, `${name}: ring clipped at the top`).toBeGreaterThanOrEqual(4);
  }
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
  await expect(page.getByLabel('Search', { exact: true })).toBeFocused();

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
  await expect(page.locator('tbody')).not.toContainText('racer');
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
