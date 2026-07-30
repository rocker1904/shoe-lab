import { expect, test } from '@playwright/test';

test('loads, filters via preset, expands details, exports csv, restores url state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('5 of 5 shoes')).toBeVisible();

  // a bare first visit opens on the setup strip, so this is a card rather than a toolbar pill
  await expect(page.getByTestId('setup-strip')).toBeVisible();
  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByText('4 of 5 shoes')).toBeVisible();
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
  await expect(page.getByText('1 of 5 shoes')).toBeVisible();
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

  // the help is a click-triggered popover on every device, never a hover tooltip
  await strip.getByRole('button', { name: /About Built for/ }).click();
  await expect(page.getByRole('dialog', { name: 'Built for' })).toContainText('you can change anything');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: /^Easy/ }).click();
  await expect(page.getByText('4 of 5 shoes')).toBeVisible();
  await expect(strip).toHaveCount(0);

  // the only proof persistence works, because it spans a real page load
  await page.goto('/');
  await expect(page.getByText('4 of 5 shoes')).toBeVisible();
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
  await expect(page.getByText('5 of 5 shoes')).toBeVisible();
});

// The 700px switch is invisible to jsdom: it applies no component CSS and evaluates no media
// query, so only a real browser can say which of the two tables is on screen.
test('switches to stacked cards on a phone, and back', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const mobile = page.getByTestId('shoe-table-mobile');
  await expect(mobile).toBeVisible();
  // only numeric columns are columns; the date and the plate moved onto the shoe's own row
  await expect(mobile.getByRole('columnheader', { name: /Released/ })).toHaveCount(0);
  await expect(mobile.getByRole('columnheader')).toHaveCount(6);
  // and all six fit — the bound the short labels were measured against
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

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
  await expect(page.getByText('3 of 5 shoes')).toBeVisible();
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

// None of this is observable in jsdom: it applies no component CSS, so every group reports the
// same zero-sized box whatever the viewport is.
test('degrades the toolbar in three tiers and keeps the table header clear of the chrome', async ({ page }) => {
  // The dataset is fetched, so the toolbar is not in the DOM at `goto` — and every reading below
  // would come back null, which compares equal to itself and passes every assertion silently. The
  // bar carries the two groups only once the strip has handed them over, so a first arrival has to
  // answer it before there is a cascade to measure at all.
  const settled = async () => {
    const card = page.getByTestId('setup-strip').getByRole('button', { name: /^All/ });
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    if (await card.count()) await card.click();
    await expect(page.getByRole('radio', { name: /All/ })).toBeVisible();
  };
  const boxes = () => page.evaluate(() => {
    const q = (s: string) => document.querySelector(s);
    // Centres, not tops: the groups are different heights and `align-items: center` is what puts
    // them on one line, so their tops legitimately differ by a few pixels.
    const y = (s: string) => { const b = q(s)?.getBoundingClientRect();
      return b ? Math.round(b.y + b.height / 2) : null; };
    const sep = q('[data-testid="toolbar"] .sep');
    return {
      zoneY: y('[data-testid="toolbar"] .zone-wrap'), paceY: y('[data-testid="toolbar"] .pace-wrap'),
      actionsY: y('[data-testid="toolbar"] .actions'),
      sepShown: sep ? getComputedStyle(sep).display !== 'none' : false,
      paceW: q('[data-testid="toolbar"] .pace-wrap .seg')?.getBoundingClientRect().width ?? 0,
      wrapW: q('[data-testid="toolbar"] .pace-wrap')?.getBoundingClientRect().width ?? 0,
    };
  });

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await settled();
  const wide = await boxes();
  expect(wide.zoneY).not.toBeNull();
  expect(wide.zoneY).toBe(wide.paceY);        // one line, all three groups
  expect(wide.zoneY).toBe(wide.actionsY);
  expect(wide.sepShown).toBe(true);
  // And nothing scrolls sideways: the content track is capped and the table's headers wrap.
  // `toBeLessThanOrEqual` states that claim; `toBe` additionally asserted "and the scrollport is
  // exactly the viewport", which is a fact about the runner's scrollbars
  // (docs/app.md §Table presentation).
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1200);

  await page.setViewportSize({ width: 700, height: 800 });
  const mid = await boxes();
  expect(mid.actionsY).toBe(mid.zoneY);       // actions ride up beside the zone group
  expect(mid.paceY).toBeGreaterThan(mid.zoneY!);
  expect(mid.sepShown).toBe(false);             // nothing left to separate
  expect(mid.paceW).toBeLessThan(mid.wrapW);    // shrink-wrapped, not stretched

  await page.setViewportSize({ width: 375, height: 800 });
  const narrow = await boxes();
  expect(narrow.paceY).toBeGreaterThan(narrow.zoneY!);
  expect(narrow.paceW).toBe(narrow.wrapW);      // stretched to fill the line

  // 360px is the binding width, not 375: it is the usual Android one, and a third line there is
  // the same void the middle tier was written to eliminate at 620.
  await page.setViewportSize({ width: 360, height: 800 });
  const android = await boxes();
  expect(android.actionsY).toBe(android.zoneY);
  expect(android.paceY).toBeGreaterThan(android.zoneY!);

  // The pinned header row must clear the chrome at every width, which a constant offset cannot do:
  // the chrome is 44px at 1200 and 103px at 375.
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
  await page.getByRole('checkbox', { name: /Stability matters to me/ }).check();
  await expect(page).toHaveURL(/stab=1/);
  // the preference is the runner's, not the search's, so the story stays marked through it
  await expect(page.getByRole('radio', { name: /Easy/, checked: true })).toBeVisible();
  await page.getByRole('radio', { name: /All/ }).click();
  await expect(page.getByRole('radio', { name: /All/, checked: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Stability matters to me/ })).toBeChecked();
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

  // Race declares no stable variant, so the preference is inert on it — the Toolbar says so, and
  // this is where that claim meets the rendered table.
  await page.getByRole('checkbox', { name: /Stability matters to me/ }).check();
  await expect(page).toHaveURL(/stab=1/);
  await expect(rows.first()).toContainText('racer');
  await expect(score(0)).toHaveText('76.52');
  await expect(score(1)).toHaveText('70.49');
});
