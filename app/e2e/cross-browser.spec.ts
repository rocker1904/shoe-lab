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

  // The bound has to be reachable and has to reach the URL, whatever the engine renders it as.
  await page.getByRole('button', { name: '1y' }).click();
  await expect(page).toHaveURL(/after=\d{4}-\d{2}/);

  await page.getByRole('button', { name: 'Any' }).click();
  await expect(page).not.toHaveURL(/after=/);
});

test('renders the filter sidebar and the table together', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Released after' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Shoe/ })).toBeVisible();
});
