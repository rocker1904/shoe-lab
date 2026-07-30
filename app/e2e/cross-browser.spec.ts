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

test('renders the filter sidebar and the table together', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Released after' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Shoe/ })).toBeVisible();
});
