import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements no `window.matchMedia`, and `Page.svelte` picks which of the two tables to
 * mount from one (docs/app.md §Columns and sorting). Non-matching, so the suite always sees the
 * desktop rendering: the phone one is exercised directly in `ShoeTableMobile.test.ts` and at real
 * widths by Playwright, neither of which jsdom could stand in for.
 */
window.matchMedia ??= ((query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  addListener: () => {}, removeListener: () => {},
})) as unknown as typeof window.matchMedia;
