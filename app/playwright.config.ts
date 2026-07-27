import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // On CI emit the html report so the workflow can upload it when e2e fails.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173' },
  // `npm run e2e` has already built and swapped in the fixture, so preview must serve *this* dist —
  // never a preview server someone left running against the real dataset.
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: false },
});
