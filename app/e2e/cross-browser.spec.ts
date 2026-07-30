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
  await expect(page.getByText('5 of 5 shoes')).toBeVisible();

  // The control that was a bare text box in these two engines. Nothing on the page may be the
  // native input any more, in any of the three.
  await expect(page.locator('input[type="month"]')).toHaveCount(0);

  const trigger = page.getByRole('button', { name: /Released after/ });
  await expect(trigger).toHaveText(/Any month/);
  await trigger.click();

  // A real grid, in an engine that would have rendered no picker at all.
  const panel = page.getByRole('dialog', { name: 'Choose a release month' });
  await expect(panel.getByRole('radio')).toHaveCount(12);
  await panel.getByRole('button', { name: 'Previous year' }).click();
  await panel.getByRole('radio', { name: 'March' }).click();

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
    [...p.querySelectorAll('[role="radio"]')].some((r) => r.tabIndex === 0 && !r.disabled));
  expect(reachable, 'the month grid has no reachable tab stop').toBe(true);
});

test('renders the filter sidebar and the table together', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Released after' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Shoe/ })).toBeVisible();
});
