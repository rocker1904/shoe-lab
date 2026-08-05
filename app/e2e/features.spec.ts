import { expect, test, type Page } from '@playwright/test';

/**
 * The Features section, in a real engine — the one part of this app with no coverage below this
 * file. Every unit assertion for it reads through a **closed** `<details>`, because jsdom does not
 * implement the UA rule that hides a collapsed disclosure's children, so the disclosure itself —
 * the only interaction between a runner and this feature — is invisible to the suite. `use:roving`
 * has the same shape: the shared control deliberately uses button radios to own Home/End, Enter and
 * nullable entry consistently across engines, so jsdom's simulated focus proves nothing about
 * whether a mounted browser control behaves.
 *
 * Runs in all three engines rather than one, unlike the layout suite: WebKit is where `<details>`
 * open/close and marker suppression have diverged before, and the marker suppression here is copied
 * from `BrandFilter` rather than shared with it (docs/app.md §Filters).
 */

const openFeatures = async (page: Page) => {
  const section = page.locator('details[aria-label="Features"]');
  await section.locator('summary').click();
  await expect(section).toHaveAttribute('open', '');
  return section;
};

test('opens the features section and filters the fleet from it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('receipt')).toContainText('Showing 5 of the 5 shoes');

  const features = await openFeatures(page);
  // The closed summary says what is held; open, the checklist says it per value with its count.
  const row = features.getByRole('checkbox', { name: /Both sides \(semi\)/ });
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.getByTestId('receipt')).toContainText('Showing 2 of the 2 shoes');
  await expect(page).toHaveURL(/c\.tongue-gusset-type=both-sides-semi/);
  await expect(row).toBeChecked();
  // Unticking the last value deletes the key rather than leaving an empty selection behind, which
  // is what lets `All` light again (docs/app.md §Filters).
  await row.click();
  await expect(page).not.toHaveURL(/c\./);
  await expect(page.getByTestId('receipt')).toContainText('Showing 5 of the 5 shoes');
});

/**
 * The naming, as a platform resolves it rather than as an attribute: each facet group takes its
 * accessible name from its own visible heading, and the headings sit one level under the section
 * (docs/app.md §Filters). The unit suite can only assert that the `aria-labelledby` points
 * somewhere — an id reference is a string until a browser resolves it, and it resolves against a
 * document, which is where a duplicated id would be answered by the wrong heading.
 */
test('names each facet group from its own heading, in the accessibility tree', async ({ page }) => {
  await page.goto('/');
  const features = await openFeatures(page);
  await expect(features).toMatchAriaSnapshot(`
    - group "Features":
      - group "Gusset":
        - heading "Gusset" [level=4]
      - heading "Removable insole" [level=4]
      - radiogroup "Removable insole"
  `);
});

test('gives each feature tri-state the complete mounted keyboard contract', async ({ page }) => {
  await page.goto('/');
  const features = await openFeatures(page);
  const group = features.getByRole('radiogroup', { name: 'Removable insole' });

  // `role=radiogroup` promises one tab stop and arrow movement, and these are buttons — so the
  // browser provides neither and `roving.ts` has to (docs/app.md §Filters).
  const stops = await group.getByRole('radio').evaluateAll((els) =>
    els.filter((e) => e.tabIndex === 0).length);
  expect(stops, 'a radiogroup is one tab stop, not three').toBe(1);

  await group.getByRole('radio', { name: 'Any' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'Yes' })).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/c\.removable-insole=true/);
  // Focus moved with the selection, or the next arrow press would start over.
  expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Yes');

  await page.keyboard.press('ArrowLeft');
  await expect(group.getByRole('radio', { name: 'Any' })).toHaveAttribute('aria-checked', 'true');
  await expect(page).not.toHaveURL(/c\./);

  await page.keyboard.press('End');
  await expect(group.getByRole('radio', { name: 'No' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Home');
  await expect(group.getByRole('radio', { name: 'Any' })).toHaveAttribute('aria-checked', 'true');
  await group.getByRole('radio', { name: 'Yes' }).focus();
  await page.keyboard.press('Enter');
  await expect(group.getByRole('radio', { name: 'Yes' })).toHaveAttribute('aria-checked', 'true');
});

/**
 * The delivery's one Critical, in the engines rather than in jsdom: `serializeView` learned to emit
 * `c.` before `arrival.ts` owned it, so a link carrying only a feature selection read as a bare
 * arrival — the fleet filtered, the setup strip opened over it, and the token scrubbed out of the
 * address (docs/policies.md §Identity and sharing).
 */
test('opens a feature-only link filtered, with no setup strip and the token kept', async ({ page }) => {
  await page.goto('/?c.tongue-gusset-type=none');
  await expect(page.getByTestId('receipt')).toContainText('Showing 2 of the 2 shoes');
  await expect(page.getByTestId('setup-strip')).toHaveCount(0);
  await expect(page).toHaveURL(/c\.tongue-gusset-type=none/);

  const features = await openFeatures(page);
  await expect(features.getByRole('checkbox', { name: /None/ })).toBeChecked();
});

/**
 * The drawer traps focus, and the section's controls only exist once the disclosure is open — so
 * the trap has to pick up focusables that arrive after it was armed. Brand has the same shape, so
 * this is a parity check rather than a suspicion
 * (docs/app.md §Every floating panel dismisses the same way).
 */
test('keeps focus inside the drawer once the features section is open', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Filters' }).click();
  const drawer = page.getByTestId('filter-drawer');
  await expect(drawer).toBeVisible();

  await openFeatures(page);
  const row = drawer.getByRole('checkbox', { name: /Both sides \(semi\)/ });
  await row.focus();
  await expect(row).toBeFocused();

  // Twenty stops is more than the drawer holds, so this wraps rather than walking off the end.
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    expect(await drawer.evaluate((d) => d.contains(document.activeElement)),
      'focus left the drawer while its trap was armed').toBe(true);
  }

  // The drawer is the sidebar element itself, hidden rather than unmounted below the permanent
  // width, and Escape hands focus back to the control that opened it.
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: 'Filters' })).toBeFocused();
});
