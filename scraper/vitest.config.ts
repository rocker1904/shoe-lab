import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/scrape-metrics.ts', 'src/scrape-details.ts', 'src/build-dataset-cli.ts', 'src/check-live.ts'],
      thresholds: { lines: 90, branches: 85 },
    },
  },
});
