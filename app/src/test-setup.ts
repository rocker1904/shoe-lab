import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';

expect.extend(matchers);

/** jsdom has no top layer. Component tests still need the open/close calls to succeed; visibility,
 * clipping and placement remain browser assertions because jsdom has no layout to model them. */
HTMLElement.prototype.showPopover ??= function () { this.dataset['popoverOpen'] = ''; };
HTMLElement.prototype.hidePopover ??= function () { delete this.dataset['popoverOpen']; };

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

/** Every stand-in observer with something under observation, so a test can stand in for the box
 *  changing size. */
const liveObservers = new Set<() => void>();

/**
 * Delivers to every stand-in observer — what a test calls to say *the document resized without the
 * window doing so*, which is the case `lib/layout-width.ts` exists for and the only one a `resize`
 * event cannot express (docs/app.md §Two renderings, and only one of them mounted).
 */
export const fireResizeObservers = (): void => { for (const fn of [...liveObservers]) fn(); };

/**
 * jsdom implements no layout and no `ResizeObserver`, and two things in this app are built on one:
 * Svelte's `bind:clientHeight`, which `Page.svelte` measures the pinned chrome with
 * (docs/app.md §Columns and sorting), and `lib/layout-width.ts`.
 *
 * It reports no sizes, because every box in jsdom is zero-sized and a fabricated number would be a
 * fiction the suite could then assert against — the width consumers re-read `documentElement`
 * anyway, and jsdom's own `innerWidth` is the number a test plants. What it does implement is
 * delivery: a window `resize` reaches it, because resizing the viewport really does resize the
 * documentElement every consumer here observes, and `fireResizeObservers` reaches it without one.
 */
window.ResizeObserver ??= class {
  #targets = new Set<Element>();
  #deliver: () => void;
  constructor(callback: ResizeObserverCallback) {
    this.#deliver = () => callback(
      [...this.#targets].map((target) => ({ target }) as ResizeObserverEntry),
      this as unknown as ResizeObserver);
  }
  observe(target: Element): void {
    this.#targets.add(target);
    liveObservers.add(this.#deliver);
  }
  unobserve(target: Element): void {
    this.#targets.delete(target);
    if (!this.#targets.size) liveObservers.delete(this.#deliver);
  }
  disconnect(): void {
    this.#targets.clear();
    liveObservers.delete(this.#deliver);
  }
} as unknown as typeof ResizeObserver;

window.addEventListener('resize', fireResizeObservers);

/**
 * The same stand-in for the same reason: jsdom implements no `IntersectionObserver`, and
 * `Page.svelte` hands the setup strip's groups to the toolbar when the strip scrolls out of view
 * through one (docs/app.md §The setup strip). A no-op observer never reports a crossing, which is
 * the only honest answer where nothing has a position and nothing scrolls; the hand-over itself is
 * measured at real widths in `smoke.spec.ts`.
 */
window.IntersectionObserver ??= class {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
} as unknown as typeof IntersectionObserver;

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

/** jsdom exposes `scrollTo` but reports every call as an unimplemented error. A no-op is the honest
 * stand-in where no box has a position; real landing behavior is measured by Playwright. */
window.scrollTo = () => {};
