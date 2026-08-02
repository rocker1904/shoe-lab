import { describe, expect, it, vi } from 'vitest';
import { fireResizeObservers } from '../test-setup';
import { layoutWidth, observeLayoutWidth } from './layout-width';

describe('layoutWidth', () => {
  // jsdom lays nothing out, so `clientWidth` is 0 there and the window is what a test plants —
  // which is what lets `Page.test.ts` assert a rendering at a width at all.
  it('falls back to the window where nothing has been laid out', () => {
    window.innerWidth = 1234;
    expect(document.documentElement.clientWidth).toBe(0);
    expect(layoutWidth()).toBe(1234);
  });

  it('prefers the layout width, which excludes a classic scrollbar', () => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1185);
    window.innerWidth = 1200;
    expect(layoutWidth()).toBe(1185);
    vi.restoreAllMocks();
  });
});

describe('observeLayoutWidth', () => {
  it('answers once before anything has changed', () => {
    window.innerWidth = 900;
    const seen: number[] = [];
    const stop = observeLayoutWidth((px) => seen.push(px));
    expect(seen).toEqual([900]);
    stop();
  });

  /**
   * The whole point of the module: the layout width moves when the WINDOW did not — a filter
   * cleared or a row opened makes the document tall enough for a classic scrollbar, which takes
   * 12–15px out of the layout with no event of any kind. A `resize` listener cannot see it.
   */
  it('answers again when the document resizes with no resize event', () => {
    window.innerWidth = 900;
    const seen: number[] = [];
    const stop = observeLayoutWidth((px) => seen.push(px));
    window.innerWidth = 885;
    fireResizeObservers();
    expect(seen).toEqual([900, 885]);
    stop();
  });

  // The element whose width is being asked about, so both causes — the window moving and the
  // document's own box moving — arrive through one subscription.
  it('observes the documentElement, and stops on teardown', () => {
    const observed: Element[] = [];
    const disconnect = vi.fn();
    const real = window.ResizeObserver;
    window.ResizeObserver = class {
      observe(el: Element): void { observed.push(el); }
      unobserve(): void {}
      disconnect = disconnect;
    } as unknown as typeof ResizeObserver;

    const stop = observeLayoutWidth(() => {});
    expect(observed).toEqual([document.documentElement]);
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
    window.ResizeObserver = real;
  });
});
