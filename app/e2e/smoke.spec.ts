import { expect, test } from '@playwright/test';

test('loads, filters via preset, expands details, exports csv, restores url state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('5 of 5 shoes')).toBeVisible();

  await page.getByRole('button', { name: 'Easy-day cruiser' }).click();
  await expect(page.getByText('1 of 5 shoes')).toBeVisible();
  await expect(page).toHaveURL(/plate=none/);
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
