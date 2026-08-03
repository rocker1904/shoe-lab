import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // On CI emit the html report so the workflow can upload it when e2e fails.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173' },
  /**
   * The smoke suite is Chromium-only — it measures layout, and one engine's numbers are enough to
   * catch a layout regression. Two files are the exception, and for one reason: they cover controls
   * the engines implement differently, which is where a Chromium-only suite has been blind
   * (docs/app.md §Released after is month-granular). `cross-browser.spec.ts` is the filters;
   * `features.spec.ts` is the Features section, whose `<details>` and button-radio groups are
   * browser work that jsdom cannot see at all — so it runs in all three rather than two.
   */
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: /cross-browser/ },
    { name: 'firefox', use: { browserName: 'firefox' }, testMatch: /cross-browser|features/ },
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: /cross-browser|features/ },
  ],
  // `npm run e2e` has already built and swapped in the fixture, so preview must serve *this* dist —
  // never a preview server someone left running against the real dataset.
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: false },
});
