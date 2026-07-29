import { expect, test } from '@playwright/test';

test('loads, filters via preset, expands details, exports csv, restores url state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('5 of 5 shoes')).toBeVisible();

  // a bare first visit opens on the band, so this is a story card rather than a toolbar pill
  await expect(page.getByTestId('entry-band')).toBeVisible();
  await page.getByRole('button', { name: 'Easy' }).click();
  await expect(page.getByText('2 of 5 shoes')).toBeVisible();
  await expect(page).toHaveURL(/plate=none%2Cplated-other/);
  // the band stays open and marks what was chosen — the counts are what make the stories comparable
  await expect(page.getByTestId('entry-band')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Easy', pressed: true })).toBeVisible();
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

test('opens on the entry band and resumes the previous session across a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('entry-band')).toBeVisible();
  // counts are computed from the live dataset, not hard-coded in the band
  await expect(page.getByRole('button', { name: 'Race' })).toContainText('2 shoes');
  await expect(page.getByRole('button', { name: 'Browse all 5 shoes' })).toBeVisible();

  await page.getByRole('button', { name: 'Easy' }).click();
  await expect(page.getByText('2 of 5 shoes')).toBeVisible();
  await expect(page.getByTestId('entry-band')).toBeVisible();
  await expect(page.getByRole('radio', { name: /Easy/, checked: true })).toBeVisible();

  // the only proof persistence works, because it spans a real page load
  await page.goto('/');
  await expect(page.getByText('2 of 5 shoes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Easy', pressed: true })).toBeVisible();
  // and the restored view reaches the URL, so copying the link shares what is on screen
  await expect(page).toHaveURL(/plate=none%2Cplated-other/);
});

test('states a strike, keeps the band open through it, and returns to that runner via All', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('entry-band')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Heel stack/ })).toBeVisible();
  // both halves of both side pairs render, forefoot first, whichever strike is chosen
  const stackRows = page.locator('fieldset[aria-label^="Stack — "]');
  await expect(stackRows).toHaveCount(2);
  await expect(stackRows.first()).toHaveAttribute('aria-label', 'Stack — Forefoot');
  await expect(stackRows.last()).toHaveAttribute('aria-label', 'Stack — Heel');
  await expect(page.getByRole('group', { name: 'Midsole width — Forefoot' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Midsole width — Heel' })).toBeVisible();

  await page.getByRole('radio', { name: 'Forefoot' }).click();
  await expect(page).toHaveURL(/strike=forefoot/);
  await expect(page.getByTestId('entry-band')).toBeVisible();          // still this runner's default
  await expect(page.getByRole('columnheader', { name: /Forefoot stack/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Heel stack/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Midsole width — Forefoot' })).toBeVisible();

  await page.getByRole('button', { name: 'Easy' }).click();
  await expect(page.getByTestId('entry-band')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Easy', pressed: true })).toBeVisible();
  await expect(page).toHaveURL(/r\.forefoot-stack=/);

  await page.getByRole('radio', { name: /All/ }).click();
  await expect(page).toHaveURL(/\?strike=forefoot$/);                  // who you are survives All
  await expect(page.getByRole('radio', { name: 'Forefoot' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('entry-band')).toBeVisible();
  await expect(page.getByRole('button', { pressed: true })).toHaveCount(0);
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

  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(mobile).toBeHidden();
  await expect(page.getByRole('columnheader', { name: /Heel stack/ })).toBeVisible();
});

// None of this is observable in jsdom: it applies no component CSS, so every group reports the
// same zero-sized box whatever the viewport is.
test('degrades the toolbar in three tiers and keeps the table header clear of the chrome', async ({ page }) => {
  // The dataset is fetched, so the toolbar is not in the DOM at `goto` — and every reading below
  // would come back null, which compares equal to itself and passes every assertion silently.
  const settled = async () => { await expect(page.getByRole('radio', { name: /All/ })).toBeVisible(); };
  const boxes = () => page.evaluate(() => {
    const q = (s: string) => document.querySelector(s);
    // Centres, not tops: the groups are different heights and `align-items: center` is what puts
    // them on one line, so their tops legitimately differ by a few pixels.
    const y = (s: string) => { const b = q(s)?.getBoundingClientRect();
      return b ? Math.round(b.y + b.height / 2) : null; };
    const sep = q('[data-testid="toolbar"] .sep');
    return {
      strikeY: y('[data-testid="toolbar"] .strike-wrap'), paceY: y('[data-testid="toolbar"] .pace-wrap'),
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
  expect(wide.strikeY).not.toBeNull();
  expect(wide.strikeY).toBe(wide.paceY);        // one line, all three groups
  expect(wide.strikeY).toBe(wide.actionsY);
  expect(wide.sepShown).toBe(true);
  // and nothing scrolls sideways: the content track is capped and the table's headers wrap
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1200);

  await page.setViewportSize({ width: 700, height: 800 });
  const mid = await boxes();
  expect(mid.actionsY).toBe(mid.strikeY);       // actions ride up beside strike
  expect(mid.paceY).toBeGreaterThan(mid.strikeY!);
  expect(mid.sepShown).toBe(false);             // nothing left to separate
  expect(mid.paceW).toBeLessThan(mid.wrapW);    // shrink-wrapped, not stretched

  await page.setViewportSize({ width: 375, height: 800 });
  const narrow = await boxes();
  expect(narrow.paceY).toBeGreaterThan(narrow.strikeY!);
  expect(narrow.paceW).toBe(narrow.wrapW);      // stretched to fill the line

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

test('renders a superseded pair once and keeps colocated halves independently sortable', async ({ page }) => {
  await page.goto('/');

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
