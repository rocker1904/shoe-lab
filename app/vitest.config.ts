import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    // Scoped to src so the Playwright specs under e2e/ (which vitest cannot run) stay out of the unit run.
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: { provider: 'v8', include: ['src/lib/**'], thresholds: { lines: 90, branches: 85 } },
  },
});
