import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // On CI emit the html report so the workflow can upload it when e2e fails.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173' },
  /**
   * The smoke suite is Chromium-only. Most of `cross-browser.spec.ts` is the Firefox/WebKit half
   * of that suite; its segmented registry is the exception and has a small Chromium project so
   * those quantified contracts and the retired-method surface bounds run in all three engines.
   * `features.spec.ts` runs in all three for
   * disclosure and mounted shared-radio behaviour that jsdom cannot resolve.
   */
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: /cross-browser/ },
    { name: 'chromium-segmented', use: { browserName: 'chromium' }, testMatch: /cross-browser/,
      grep: /holds every shared segment|holds every segment and generation choice|holds the complete touch registry|holds retired method labels/ },
    { name: 'firefox', use: { browserName: 'firefox' }, testMatch: /cross-browser|features/ },
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: /cross-browser|features/ },
  ],
  // `npm run e2e` has already built and swapped in the fixture, so preview must serve *this* dist —
  // never a preview server someone left running against the real dataset.
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: false },
});
