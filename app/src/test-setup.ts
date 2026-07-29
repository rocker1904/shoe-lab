import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements no Web Animations API, and Svelte 5 runs every `transition:` directive through
 * `Element.animate` — the setup strip's collapse is one (docs/app.md §Presets). Finishing on the
 * next microtask makes a transition instant rather than absent: the node still leaves the DOM,
 * which is the behaviour a test can meaningfully assert, and jsdom has no compositor for the
 * frames in between to mean anything to.
 */
window.Element.prototype.animate ??= function () {
  const anim: Record<string, unknown> = {
    currentTime: 0, playState: 'finished', effect: null, onfinish: null,
    cancel: () => {},
  };
  queueMicrotask(() => (anim['onfinish'] as (() => void) | null)?.());
  return anim as unknown as Animation;
};

/**
 * jsdom implements no layout and no `ResizeObserver`, and Svelte's `bind:clientHeight` is built on
 * one — `Page.svelte` measures the pinned chrome that way (docs/app.md §Columns and sorting).
 * A no-op observer is the honest stand-in: every box in jsdom is zero-sized, so the binding would
 * report 0 whatever it did, and the offset it feeds is a CSS variable no jsdom test can see.
 */
window.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

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
