import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // On CI emit the html report so the workflow can upload it when e2e fails.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173' },
  /**
   * The smoke suite is Chromium-only. `cross-browser.spec.ts` and `features.spec.ts` run in all
   * three engines: the former owns the compatibility-floor registry and native-control seams;
   * the latter owns disclosure and mounted shared-radio behaviour that jsdom cannot resolve.
   */
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' }, testMatch: /cross-browser|features/ },
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: /cross-browser|features/ },
  ],
  // `npm run e2e` has already built and swapped in the fixture, so preview must serve *this* dist —
  // never a preview server someone left running against the real dataset.
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: false },
});
